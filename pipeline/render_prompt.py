#!/usr/bin/env python3
"""Render the scan prompt for one deployment.

    python pipeline/render_prompt.py                       # reads config/site.json
    python pipeline/render_prompt.py --artifact-url URL    # or pass it directly

Paste the output into the scheduled task's prompt (or ask Claude to update the
task with it). The prompt holds no secrets: API keys stay in the site's
private settings.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent


def render(artifact_url: str) -> str:
    text = (REPO / "pipeline" / "scan-prompt.md").read_text(encoding="utf-8")
    return text.replace("{{ARTIFACT_URL}}", artifact_url)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--artifact-url")
    ap.add_argument("--config", type=Path, default=REPO / "config" / "site.json")
    args = ap.parse_args()
    url = args.artifact_url
    if not url and args.config.exists():
        url = json.loads(args.config.read_text(encoding="utf-8")).get("artifactUrl")
    if not url:
        raise SystemExit("Pass --artifact-url or set artifactUrl in config/site.json")
    print(render(url))


if __name__ == "__main__":
    main()
