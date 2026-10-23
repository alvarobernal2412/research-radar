import json
from pathlib import Path

from radar.dedup import dedupe, fold, paper_id
from radar.openalex import normalize_doi, reconstruct, reconstruct_abstract, redact, to_paper
from radar.schedule import assign_slot, cron_expression, schedule_text
from radar.scoring import affinity, completeness, normalize_stated_fields
from render_prompt import render

FIX = Path(__file__).parent / "fixtures"


def test_reconstruct_abstract_orders_words_by_position():
    assert reconstruct_abstract({"mining": [1], "Process": [0], "is": [2], "exploratory": [3]}) == "Process mining is exploratory"
    assert reconstruct_abstract(None) == ""


def test_normalize_doi_strips_prefixes_and_case():
    assert normalize_doi("https://doi.org/10.1007/ABC_1") == "10.1007/abc_1"
    assert normalize_doi("doi:10.1/x") == "10.1/x"
    assert normalize_doi(None) is None


def test_redact_hides_api_key():
    url = redact("https://api.openalex.org/works?search=x&api_key=SECRET123")
    assert "SECRET123" not in url and "REDACTED" in url


def test_to_paper_maps_openalex_work():
    work = json.loads((FIX / "openalex_work.json").read_text(encoding="utf-8"))
    rec = to_paper(work, discovered_at="2026-10-14")
    assert rec["doi"] == "10.1234/example.1"
    assert rec["venueKind"] == "conference"
    assert rec["authors"][0]["name"] == "Alex Example"
    assert rec["abstract"].startswith("Process mining analyses are exploratory")
    # Not read yet: author-stated fields are unknown, never "none stated".
    assert rec["fullTextRead"] is False and rec["limitationsStated"] is None and rec["futureWork"] is None
    assert rec["pendingDetail"] is True and rec["foundIn"] == ["OpenAlex"]


def test_paper_id_matches_site_convention():
    assert paper_id({"doi": "10.1007/978-3-031-34560-9_27"}) == "10-1007-978-3-031-34560-9-27"
    assert paper_id({"title": "How Do Process Mining Users Act, Think and Feel?", "year": 2025}) == "how-do-process-mining-users-act-think-and-feel-2025"
    assert len(paper_id({"title": "x" * 200, "year": 2025})) <= 80


def test_fold_strips_accents_and_punctuation():
    assert fold("Völzer, Hagen") == "volzer hagen"


def test_dedupe_merges_by_doi_and_by_title_author_year():
    a = {"title": "A Model", "doi": "10.1/X", "authors": [{"name": "Ann Lee"}], "year": 2025, "foundIn": ["OpenAlex"], "abstract": ""}
    b = {"title": "A model.", "doi": "https://doi.org/10.1/x", "authors": [{"name": "A. Lee"}], "year": 2025, "foundIn": ["DBLP"], "abstract": "text"}
    c = {"title": "A Model", "authors": [{"name": "Ann Lee"}], "year": 2025, "foundIn": ["arXiv"]}
    d = {"title": "Another paper", "authors": [{"name": "Bo Chen"}], "year": 2024, "foundIn": ["arXiv"]}
    out = dedupe([a, b, c, d])
    assert len(out) == 2
    assert out[0]["foundIn"] == ["OpenAlex", "DBLP", "arXiv"]
    assert out[0]["abstract"] == "text"


def test_dedupe_prefers_full_text_analysis():
    a = {"title": "T", "doi": "10.1/t", "fullTextRead": False, "summary": "from abstract", "foundIn": ["OpenAlex"]}
    b = {"title": "T", "doi": "10.1/t", "fullTextRead": True, "summary": "from full text", "foundIn": ["SpringerLink"]}
    assert dedupe([a, b])[0]["summary"] == "from full text"


TOPIC = {"revision": 3, "themes": [{"name": "Models", "weight": 1}, {"name": "Viz", "weight": 0.9}, {"name": "Studies", "weight": 0.8}]}


def test_affinity_formula():
    r = affinity({"Models": 100, "Viz": 100, "Studies": 50}, TOPIC)
    # v = [100, 90, 40] -> 0.6*100 + 0.4*mean(100,90,40) = 60 + 30.67
    assert r["affinity"] == 91
    assert r["themes"] == ["Models", "Viz", "Studies"]
    assert r["scoredTopicRevision"] == 3


def test_affinity_exclusion_penalty_and_clamp():
    assert affinity({"Models": 20}, TOPIC, exclude_hit=True)["affinity"] == 0
    assert affinity({}, TOPIC)["affinity"] == 0


def test_completeness_levels():
    assert completeness({"pendingDetail": True, "abstract": "a"})["level"] == "minimal"
    assert completeness({"abstract": "a", "summary": "s", "fullTextRead": False})["level"] == "partial"
    assert completeness({"abstract": "a", "summary": "s", "fullTextRead": True})["level"] == "complete"


def test_unread_papers_get_unknown_stated_fields():
    p = normalize_stated_fields({"fullTextRead": False, "limitationsStated": [], "futureWork": ["x"]})
    assert p["limitationsStated"] is None and p["futureWork"] == ["x"]
    q = normalize_stated_fields({"fullTextRead": True, "limitationsStated": []})
    assert q["limitationsStated"] == []


def test_sample_fixture_is_valid_shape():
    papers = json.loads((FIX / "papers.sample.json").read_text(encoding="utf-8"))
    assert papers and all("title" in p and "foundIn" in p for p in papers)


def _work():
    return json.loads((FIX / "openalex_work.json").read_text(encoding="utf-8"))


def _minimal_paper():
    return {
        "title": "Example Paper: A Conceptual Model for Exploratory Process Mining",
        "doi": "10.1234/example.1", "year": 2026,
        "authors": [{"name": "Alex Example"}],
        "abstract": "", "keywords": [], "fullTextRead": False,
        "fullTextSource": "metadata only", "fetchNotes": "Publisher paywall; no open-access copy found",
        "limitationsStated": None, "futureWork": None, "pendingDetail": True,
    }


def test_reconstruct_fills_missing_abstract_and_keywords_from_openalex():
    before = _minimal_paper()
    rec, changed = reconstruct(before, _work())
    assert rec["abstract"].startswith("Process mining analyses are exploratory")
    assert rec["keywords"] == ["Analytic provenance", "Exploratory process mining"]
    assert rec["fullTextSource"] == "abstract only (OpenAlex)"
    assert {"abstract", "keywords", "fullTextSource"} <= set(changed)
    assert before["abstract"] == ""  # the input is not mutated
    assert completeness({**rec, "pendingDetail": False})["level"] == "partial"


def test_reconstruct_never_claims_full_text_or_author_stated_fields():
    rec, _ = reconstruct(_minimal_paper(), _work())
    assert rec["fullTextRead"] is False
    assert rec["limitationsStated"] is None and rec["futureWork"] is None
    assert rec["pendingDetail"] is True  # the scan still has to analyse it
    assert "summary" not in rec and "contribution" not in rec


def test_reconstruct_keeps_what_the_scan_already_read():
    p = {**_minimal_paper(), "abstract": "Real abstract.", "fullTextRead": True,
         "fullTextSource": "full text (open access PDF)", "keywords": ["kept"], "citations": 1}
    rec, changed = reconstruct(p, {**_work(), "cited_by_count": 7})
    assert rec["abstract"] == "Real abstract." and rec["keywords"] == ["kept"]
    assert rec["fullTextRead"] is True and rec["fullTextSource"] == "full text (open access PDF)"
    assert rec["citations"] == 7 and "citations" in changed
    assert not {"abstract", "keywords", "fullTextSource", "fetchNotes"} & set(changed)


def test_reconstruct_takes_open_access_link_when_missing():
    work = {**_work(), "open_access": {"is_oa": True},
            "best_oa_location": {"pdf_url": "https://example.org/paper.pdf"}}
    rec, changed = reconstruct(_minimal_paper(), work)
    assert rec["pdfUrl"] == "https://example.org/paper.pdf" and rec["openAccess"] is True
    assert "pdfUrl" in changed


def test_reconstruct_ignores_a_work_that_is_not_the_same_paper():
    other = {**_work(), "doi": "https://doi.org/10.9999/other", "display_name": "Something else entirely"}
    before = _minimal_paper()
    rec, changed = reconstruct(before, other)
    assert rec == before and changed == []


def test_reconstruct_matches_by_title_and_year_when_the_doi_is_missing():
    p = {**_minimal_paper(), "doi": None}
    rec, changed = reconstruct(p, _work())
    assert changed and rec["abstract"]


# --- multi-radar: scheduling and prompt rendering ---

def test_first_radar_scans_on_sunday_morning():
    assert assign_slot([]) == (6, "09:00")


def test_new_radars_take_the_weekday_farthest_from_the_others():
    slots = []
    for _ in range(4):
        slots.append(assign_slot(slots))
    days = [d for d, _ in slots]
    assert days[:3] == [6, 2, 4]
    assert len(set(days)) == 4


def test_each_of_seven_radars_gets_its_own_weekday():
    slots = []
    for _ in range(7):
        slots.append(assign_slot(slots))
    assert sorted(d for d, _ in slots) == list(range(7))
    assert {t for _, t in slots} == {"09:00"}


def test_an_eighth_radar_shares_a_weekday_twelve_hours_away():
    day, time = assign_slot([(d, "09:00") for d in range(7)])
    assert (day, time) == (6, "21:00")


def test_assign_slot_accepts_registry_documents():
    assert assign_slot([{"weekday": 6, "time": "09:00"}])[0] == 2


def test_schedule_text_and_cron():
    assert schedule_text(6, "09:00") == "Sundays at 09:00"
    assert cron_expression(6, "09:00") == "0 9 * * 0"
    assert cron_expression(0, "07:30") == "30 7 * * 1"


def test_first_radar_prompt_has_no_prefix_header():
    text = render("https://claude.ai/artifact/x")
    assert "Never read or write another" not in text
    assert "{{" not in text


def test_other_radar_prompt_prefixes_every_path():
    text = render("https://claude.ai/artifact/x", "nlp", "NLP radar")
    assert "`radars/nlp/`" in text and "NLP radar" in text
    assert 'radarId: "nlp"' in text
    assert "{{" not in text
