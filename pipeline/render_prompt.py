#!/usr/bin/env python3
"""Render the scan prompt for one deployment.

    python pipeline/render_prompt.py                       # reads config/site.json
    python pipeline/render_prompt.py --artifact-url URL    # or pass it directly
    python pipeline/render_prompt.py --radar nlp           # one radar of several

Paste the output into the scheduled task's prompt (or ask Claude to update the
task with it). The prompt holds no secrets: API keys stay in the site's
private settings.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent


ROOT_RADAR = "main"


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


def render(artifact_url: str, radar_id: str = ROOT_RADAR, name: str = "", root: bool | None = None) -> str:
    text = (REPO / "pipeline" / "scan-prompt.md").read_text(encoding="utf-8")
    prefix = db_prefix(radar_id, radar_id == ROOT_RADAR if root is None else root)
    text = text.replace("{{ARTIFACT_URL}}", artifact_url).replace("{{RADAR_ID}}", radar_id)
    text = text.replace("{{RADAR_NAME}}", name or radar_id)
    if prefix:
        first, rest = text.split("\n", 1)
        text = first + "\n\n" + radar_header(radar_id, name or radar_id, prefix) + "\n" + rest
    return text


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--artifact-url")
    ap.add_argument("--config", type=Path, default=REPO / "config" / "site.json")
    ap.add_argument("--radar", default=ROOT_RADAR, help="radar id (default: the first radar, stored at the database root)")
    args = ap.parse_args()
    url = args.artifact_url
    cfg = json.loads(args.config.read_text(encoding="utf-8")) if args.config.exists() else {}
    url = url or cfg.get("artifactUrl")
    entry = next((r for r in cfg.get("radars", []) if r.get("id") == args.radar), {})
    if args.radar != ROOT_RADAR and not entry:
        raise SystemExit(f"Radar '{args.radar}' is not listed under radars in {args.config}")
    if not url:
        raise SystemExit("Pass --artifact-url or set artifactUrl in config/site.json")
    # The prompt contains non-ASCII characters; a Windows console or redirect
    # would otherwise encode it as cp1252 and fail.
    sys.stdout.reconfigure(encoding="utf-8")
    print(render(url, args.radar, entry.get("name") or cfg.get("siteName", ""), bool(entry.get("root", args.radar == ROOT_RADAR))))


if __name__ == "__main__":
    main()
