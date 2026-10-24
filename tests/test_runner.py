"""run_scan.py and schedulers.py: the runner with a stand-in agent, and the printed scheduler entries."""
import json
import sys
from pathlib import Path

import pytest

import run_scan
import schedulers

AGENT = '''
import json, os, sys
prompt = sys.stdin.read()
print(json.dumps({"url": os.environ["RADAR_URL"], "n": len(prompt), "has_radar": 'radarId: "%s"' % os.environ.get("EXPECT_RADAR", "main") in prompt,
                  "request": "Request from the site" in prompt, "argv": sys.argv[1:]}))
sys.exit(int(os.environ.get("AGENT_EXIT", "0")))
'''


@pytest.fixture()
def config(tmp_path, server):
    agent = tmp_path / "agent.py"
    agent.write_text(AGENT, encoding="utf-8")
    cfg = {"target": "codex", "radarUrl": server, "siteName": "Test", "agentCommand": [sys.executable, str(agent), "--flag"],
           "radars": [{"id": "main", "name": "Test", "root": True, "weekday": 6, "time": "09:00"},
                      {"id": "nlp", "name": "NLP radar", "root": False, "weekday": 2, "time": "07:30"}]}
    path = tmp_path / "site.json"
    path.write_text(json.dumps(cfg), encoding="utf-8")
    return path


def test_runner_pipes_the_prompt_to_the_agent_and_sets_the_server(config, server, capfd, monkeypatch):
    monkeypatch.delenv("RADAR_URL", raising=False)
    monkeypatch.setenv("RADAR_REQUEST_TEXT", "mode=full")
    assert run_scan.main(["--config", str(config), "--radar", "main"]) == 0
    seen = json.loads(capfd.readouterr().out)
    assert seen["url"] == server and seen["has_radar"] and seen["request"] and seen["n"] > 5000
    assert seen["argv"] == ["--flag"]


def test_runner_returns_the_agents_exit_code(config, monkeypatch):
    monkeypatch.setenv("AGENT_EXIT", "7")
    assert run_scan.main(["--config", str(config), "--radar", "main"]) == 7


def test_runner_renders_the_other_radars_prompt(config, monkeypatch, capfd):
    monkeypatch.setenv("EXPECT_RADAR", "nlp")
    assert run_scan.main(["--config", str(config), "--radar", "nlp"]) == 0
    assert json.loads(capfd.readouterr().out)["has_radar"]


def test_runner_refuses_when_the_server_is_down(tmp_path, capsys):
    cfg = tmp_path / "site.json"
    cfg.write_text(json.dumps({"radarUrl": "http://127.0.0.1:1", "agentCommand": [sys.executable, "-c", "print(1)"]}))
    assert run_scan.main(["--config", str(cfg)]) == 2
    assert "can't reach the radar server" in capsys.readouterr().err


def test_runner_explains_a_missing_agent(tmp_path, capsys):
    cfg = tmp_path / "site.json"
    cfg.write_text(json.dumps({"radarUrl": "http://127.0.0.1:1", "agentCommand": ["no-such-agent-binary"]}))
    assert run_scan.main(["--config", str(cfg)]) == 2
    assert "not on PATH" in capsys.readouterr().err


def test_dry_run_changes_nothing_and_shows_the_default_codex_command(tmp_path, capsys):
    cfg = tmp_path / "site.json"
    cfg.write_text(json.dumps({"radarUrl": "http://127.0.0.1:1"}))
    assert run_scan.main(["--config", str(cfg), "--dry-run"]) == 0
    out = capsys.readouterr().out
    assert "codex exec --sandbox workspace-write" in out and "network_access=true" in out


def test_claude_target_does_not_go_through_the_runner(tmp_path):
    cfg = tmp_path / "site.json"
    cfg.write_text(json.dumps({"target": "claude"}))
    with pytest.raises(SystemExit, match="Claude scheduled task"):
        run_scan.main(["--config", str(cfg)])


CFG = {"radars": [{"id": "main", "name": "Main", "weekday": 6, "time": "09:00"},
                  {"id": "nlp", "name": "NLP", "weekday": 2, "time": "07:30"},
                  {"id": "old", "name": "Old", "weekday": 0, "time": "09:00", "archived": True}]}


def test_cron_lines_use_each_radars_slot_and_skip_archived():
    text = schedulers.cron_lines(CFG, repo=Path("/home/me/research-radar"))
    assert "0 9 * * 0 cd /home/me/research-radar && python3 pipeline/run_scan.py --radar main" in text
    assert "30 7 * * 3 cd /home/me/research-radar && python3 pipeline/run_scan.py --radar nlp" in text
    assert "old" not in text


def test_schtasks_commands_name_the_weekday():
    text = schedulers.schtasks_commands(CFG, "nlp", repo=Path("C:/repo"))
    assert "/SC WEEKLY /D WED /ST 07:30" in text and '/TN "Research Radar - nlp"' in text and "--radar nlp" in text


def test_codex_automation_text_carries_the_rendered_prompt():
    text = schedulers.codex_automation(CFG, "nlp")
    assert "Schedule: weekly, Wednesdays at 07:30" in text and "Running under Codex" in text and "`radars/nlp/`" in text
    assert "ArtifactData" not in text


def test_a_config_without_radars_schedules_one_sunday_scan():
    assert "0 9 * * 0" in schedulers.cron_lines({})


def test_unknown_radar_is_an_error():
    with pytest.raises(SystemExit, match="not listed"):
        schedulers.slots(CFG, "nope")
