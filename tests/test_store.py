"""The Python store client and radar_cli against the real server (JSON-file store)."""
import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

import radar_cli
from radar.store import Conflict, Store, StoreError

REPO = Path(__file__).resolve().parent.parent
CLI = REPO / "pipeline" / "radar_cli.py"

pytestmark = pytest.mark.skipif(shutil.which("node") is None, reason="node is needed to run the server")


@pytest.fixture()
def store(server):
    return Store(server)


def cli(server, *args, stdin=None):
    r = subprocess.run([sys.executable, str(CLI), "--url", server, *args], input=stdin, capture_output=True, text=True, encoding="utf-8")
    return r.returncode, r.stdout, r.stderr


def test_set_get_roundtrip_keeps_unicode(store):
    v = store.set("papers/uni", {"title": "Prozessmodelle für Übergänge"})
    assert store.get("papers/uni") == ({"title": "Prozessmodelle für Übergänge"}, v)
    assert store.get("papers/does-not-exist") is None


def test_if_none_match_is_the_scan_lock(store):
    store.set("scanlock/current", {"radarId": "main"}, if_none_match=True)
    with pytest.raises(Conflict) as e:
        store.set("scanlock/current", {"radarId": "nlp"}, if_none_match=True)
    assert e.value.version == 1
    _, version = store.get("scanlock/current")
    assert store.set("scanlock/current", {"radarId": "nlp"}, if_version=version) == version + 1
    with pytest.raises(Conflict):
        store.set("scanlock/current", {"radarId": "x"}, if_version=version)
    store.delete("scanlock/current")
    assert store.get("scanlock/current") is None


def test_update_merges_and_creates(store):
    store.update("meta/control", {"status": "queued", "mode": "full"})
    store.update("meta/control", {"status": "running"})
    assert store.get("meta/control")[0] == {"status": "running", "mode": "full"}


def test_set_many_spans_batches_and_list_returns_them(store):
    docs = {f"papers/many-{i:03d}": {"n": i} for i in range(120)}
    assert store.set_many(docs) == 120
    rows = [r for r in store.list("papers") if r["id"].startswith("many-")]
    assert [r["data"]["n"] for r in rows] == list(range(120))


def test_a_bad_path_is_an_error_not_a_write(store):
    with pytest.raises(StoreError):
        store.set("../escape/x", {})


def test_unreachable_server_is_a_clear_error():
    with pytest.raises(StoreError, match="can't reach"):
        Store("http://127.0.0.1:1").get("a/b")


def test_cli_get_set_and_exit_codes(server):
    assert cli(server, "store", "set", "meta/topic", stdin='{"revision": 2}')[0] == 0
    code, out, _ = cli(server, "store", "get", "meta/topic")
    assert code == 0 and json.loads(out) == {"data": {"revision": 2}, "version": 1}
    assert cli(server, "store", "get", "meta/none")[0] == 4
    assert cli(server, "store", "set", "meta/topic", "--if-none-match", stdin="{}")[0] == 3
    code, out, _ = cli(server, "store", "set", "meta/topic", "--if-version", "9", stdin="{}")
    assert code == 3 and json.loads(out) == {"conflict": True, "version": 1}


def test_cli_list_out_dir_writes_documents_and_versions(server, tmp_path):
    cli(server, "store", "set", "journals/j1", stdin='{"name": "J1"}')
    cli(server, "store", "set", "journals/j2", stdin='{"name": "J2"}')
    code, out, _ = cli(server, "store", "list", "journals", "--out-dir", str(tmp_path / "out"))
    assert code == 0 and json.loads(out)["count"] == 2
    assert json.loads((tmp_path / "out" / "j1.json").read_text(encoding="utf-8")) == {"name": "J1"}
    assert json.loads((tmp_path / "out" / ".versions.json").read_text()) == {"j1": 1, "j2": 1}


def test_cli_set_many_reads_a_file(server, tmp_path):
    f = tmp_path / "docs.json"
    f.write_text(json.dumps({"conferences/c1": {"name": "C1"}, "conferences/c2": {"name": "C2"}}))
    assert json.loads(cli(server, "store", "set-many", str(f))[1]) == {"written": 2}
    assert [r["id"] for r in Store(server).list("conferences")] == ["c1", "c2"]


def test_cli_paper_id_and_affinity_match_the_library(server):
    code, out, _ = cli(server, "paper-id", stdin=json.dumps({"doi": "https://doi.org/10.1007/978-3-031-34560-9_27"}))
    assert code == 0 and out.strip() == "10-1007-978-3-031-34560-9-27"
    body = {"themeScores": {"A": 100, "B": 50}, "topic": {"themes": [{"name": "A", "weight": 1}, {"name": "B", "weight": 1}], "revision": 3}}
    code, out, _ = cli(server, "affinity", stdin=json.dumps(body))
    res = json.loads(out)
    assert code == 0 and res["affinity"] == 90 and res["scoredTopicRevision"] == 3


def test_openalex_uses_the_owners_key_without_printing_it(server, monkeypatch, capsys):
    Store(server).set("data/users/local/settings", {"openalexKey": "SECRET", "openalexEmail": "me@example.org"})
    seen = {}

    class FakeOpenAlex:
        def __init__(self, api_key=None, mailto=None):
            seen.update(api_key=api_key, mailto=mailto)

        def get(self, path, params=None):
            seen.update(path=path, params=params)
            return {"results": []}

    monkeypatch.setattr(radar_cli, "OpenAlex", FakeOpenAlex)
    assert radar_cli.main(["--url", server, "openalex", "get", "works?filter=title_and_abstract.search:a|b,from_publication_date:2024-01-01&per-page=50"]) == 0
    assert seen["api_key"] == "SECRET" and seen["mailto"] == "me@example.org"
    assert seen["path"] == "works"
    assert seen["params"] == {"filter": "title_and_abstract.search:a|b,from_publication_date:2024-01-01", "per-page": "50"}
    assert "SECRET" not in capsys.readouterr().out


def test_init_writes_first_run_documents_once(server, tmp_path):
    cfg = tmp_path / "site.json"
    cfg.write_text(json.dumps({
        "siteName": "Process Radar", "tagline": "process mining", "timezone": "Europe/Zurich", "lookbackYears": 2, "minAffinity": 50,
        "radars": [{"id": "main", "name": "Process Radar", "root": True, "weekday": 6, "time": "09:00"},
                   {"id": "nlp", "name": "NLP radar", "tagline": "language models", "root": False, "weekday": 2, "time": "07:30"}]}))
    code, out, _ = cli(server, "init", "--config", str(cfg))
    res = json.loads(out)
    assert code == 0 and sorted(res["created"]) == ["meta/config", "radars/main", "radars/nlp", "radars/nlp/meta/config"] and res["skipped"] == []
    st = Store(server)
    assert st.get("meta/config")[0] == {"siteName": "Process Radar", "tagline": "process mining", "triggerId": "main", "scheduleText": "Sundays at 09:00", "lookbackYears": 2, "minAffinity": 50}
    assert st.get("radars/nlp")[0]["scheduleText"] == "Wednesdays at 07:30" and st.get("radars/nlp")[0]["root"] is False
    assert st.get("radars/nlp/meta/config")[0]["tagline"] == "language models"
    st.update("meta/config", {"minAffinity": 70})
    again = json.loads(cli(server, "init", "--config", str(cfg))[1])
    assert again["created"] == [] and len(again["skipped"]) == 4
    assert st.get("meta/config")[0]["minAffinity"] == 70
