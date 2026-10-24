"""The scan prompt renders for each target: Claude keeps its tools, other agents get the store CLI."""
import pytest

from render_prompt import TARGETS, render

URL = "http://127.0.0.1:8787"
CLAUDE_ONLY = ["ArtifactData", "ToolSearch", "SendUserMessage", "Claude in Chrome", "chrome-browser", "WebFetch"]


def test_claude_target_is_the_default_and_keeps_its_tools():
    text = render("https://claude.ai/artifact/x")
    assert text == render("https://claude.ai/artifact/x", target="claude")
    for needle in ["ArtifactData", "ToolSearch", "SendUserMessage", "Claude in Chrome", "data/users/me/settings"]:
        assert needle in text
    assert "radar_cli.py" not in text and "{{" not in text


@pytest.mark.parametrize("target", ["agent", "codex"])
def test_other_targets_have_no_claude_tools(target):
    text = render(URL, target=target)
    for needle in CLAUDE_ONLY + ["data/users/me", "out_dir", "query.cursor", "file_path", "{{", "{#", "{/"]:
        assert needle not in text, needle
    assert URL in text and "radar_cli.py store get" in text
    assert "data/users/local/settings" in text
    assert "--if-none-match" in text and "--if-version" in text
    assert '"openalex+chrome"' not in text  # the site only ever sees accessMode values it already knows


def test_codex_adds_its_notes_and_agent_does_not():
    assert "Running under Codex" in render(URL, target="codex")
    assert "Running under Codex" not in render(URL, target="agent")


def test_other_radar_header_survives_on_every_target():
    for target in TARGETS:
        text = render(URL, "nlp", "NLP radar", False, target)
        assert "`radars/nlp/`" in text and "NLP radar" in text and 'radarId: "nlp"' in text


def test_unknown_target_is_refused():
    with pytest.raises(ValueError, match="unknown target"):
        render(URL, target="gemini")


def test_every_block_is_balanced():
    raw = open("pipeline/scan-prompt.md", encoding="utf-8").read()
    for tag in ("claude", "agent"):
        assert raw.count("{{#" + tag + "}}") == raw.count("{{/" + tag + "}}") > 0
