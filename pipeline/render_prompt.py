#!/usr/bin/env python3
"""Render the scan prompt for one deployment.

    python pipeline/render_prompt.py                       # reads config/site.json
    python pipeline/render_prompt.py --artifact-url URL    # or pass it directly
    python pipeline/render_prompt.py --radar nlp           # one radar of several
    python pipeline/render_prompt.py --target codex        # for an agent with a shell, against the self-hosted server

Paste the output into the scheduled task's prompt (or ask Claude to update the
task with it). The prompt holds no secrets: API keys stay in the site's
private settings.

Targets: "claude" is the Claude artifact and its scheduled task (the default, and
the text it has always produced). "agent" and "codex" bind the same method to the
store CLI (pipeline/radar_cli.py) instead of Claude's tools; "codex" adds the notes
in pipeline/targets/codex.md.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent


ROOT_RADAR = "main"
DEFAULT_RADAR_URL = "http://127.0.0.1:8787"

# target -> (which {{#...}} blocks of scan-prompt.md it keeps, the viewer id the owner's settings use)
TARGETS = {"claude": ("claude", "me"), "agent": ("agent", "local"), "codex": ("agent", "local")}
_BLOCK = re.compile(r"\{\{#(claude|agent)\}\}(.*?)\{\{/\1\}\}", re.S)


def db_prefix(radar_id: str, root: bool) -> str:
    """Where a radar's documents live: the first radar stays at the database root."""
    return "" if root else f"radars/{radar_id}/"


def radar_header(radar_id: str, name: str, prefix: str) -> str:
    if not prefix:
        return ""
    return (
        f"This scan is for the radar \"{name}\" (id `{radar_id}`). The site holds several radars. "
        f"Every collection and document path in these instructions (`papers`, `conferences`, `journals`, "
        f"`meta/...`) lives under the prefix `{prefix}`: for example `papers` means `{prefix}papers` and "
        f"`meta/topic` means `{prefix}meta/topic`. `data/users/...` has no prefix. Never read or write another "
        f"radar's documents."
    )


def render(artifact_url: str, radar_id: str = ROOT_RADAR, name: str = "", root: bool | None = None,
           target: str = "claude") -> str:
    if target not in TARGETS:
        raise ValueError(f"unknown target '{target}' (expected one of {', '.join(TARGETS)})")
    keep, user_id = TARGETS[target]
    text = (REPO / "pipeline" / "scan-prompt.md").read_text(encoding="utf-8")
    text = _BLOCK.sub(lambda m: m.group(2) if m.group(1) == keep else "", text)
    prefix = db_prefix(radar_id, radar_id == ROOT_RADAR if root is None else root)
    text = text.replace("{{ARTIFACT_URL}}", artifact_url).replace("{{RADAR_ID}}", radar_id).replace("{{USER_ID}}", user_id)
    text = text.replace("{{RADAR_NAME}}", name or radar_id)
    extra = []
    note = REPO / "pipeline" / "targets" / f"{target}.md"
    if note.exists():
        extra.append(note.read_text(encoding="utf-8").strip())
    if prefix:
        extra.append(radar_header(radar_id, name or radar_id, prefix))
    if extra:
        first, rest = text.split("\n", 1)
        text = first + "\n\n" + "\n\n".join(extra) + "\n" + rest
    return text


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--artifact-url")
    ap.add_argument("--config", type=Path, default=REPO / "config" / "site.json")
    ap.add_argument("--radar", default=ROOT_RADAR, help="radar id (default: the first radar, stored at the database root)")
    ap.add_argument("--target", default=None, choices=sorted(TARGETS),
                    help="who runs the scan (default: target in config/site.json, else claude)")
    args = ap.parse_args()
    url = args.artifact_url
    cfg = json.loads(args.config.read_text(encoding="utf-8")) if args.config.exists() else {}
    target = args.target or cfg.get("target") or "claude"
    # Claude reads the artifact's database; the other targets use the self-hosted server.
    url = url or (cfg.get("artifactUrl") if target == "claude" else cfg.get("radarUrl") or DEFAULT_RADAR_URL)
    entry = next((r for r in cfg.get("radars", []) if r.get("id") == args.radar), {})
    if args.radar != ROOT_RADAR and not entry:
        raise SystemExit(f"Radar '{args.radar}' is not listed under radars in {args.config}")
    if not url:
        raise SystemExit("Pass --artifact-url or set artifactUrl (target claude) or radarUrl in config/site.json")
    # The prompt contains non-ASCII characters; a Windows console or redirect
    # would otherwise encode it as cp1252 and fail.
    sys.stdout.reconfigure(encoding="utf-8")
    print(render(url, args.radar, entry.get("name") or cfg.get("siteName", ""), args.radar == ROOT_RADAR, target))


if __name__ == "__main__":
    main()
