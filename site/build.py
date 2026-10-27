#!/usr/bin/env python3
"""Assemble the site sources into one self-contained HTML page.

The Claude artifact host serves a single HTML page, so the sources under
site/src are concatenated in a fixed order:

  * styles/main.css first, then every other stylesheet alphabetically;
  * js/*.js alphabetically (the numeric prefixes set the order), wrapped in
    one strict-mode IIFE so the parts share a scope without leaking globals;
  * external libraries listed in site/vendor.json become <script src> tags.

Usage:
  python site/build.py                       # uses config/site.json if present
  python site/build.py --title "PhD Radar"   # override the page title
  python site/build.py --check               # also syntax-check the JS with node
  python site/build.py --static a.json b.json  # read-only page for GitHub Pages (one export per radar)

Standard library only.
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent
SRC = ROOT / "src"


def load_config(path: Path | None) -> dict:
    for candidate in [path, REPO / "config" / "site.json", REPO / "config" / "site.example.json"]:
        if candidate and candidate.exists():
            return json.loads(candidate.read_text(encoding="utf-8"))
    return {}


def add_radar_prompt() -> str:
    """The prompt behind the site's "New radar" dialog: the text block of docs/add-radar-prompt.md, as a JS string."""
    nl, fence = chr(10), chr(96) * 3
    text = (REPO / "docs" / "add-radar-prompt.md").read_text(encoding="utf-8").replace(chr(13) + nl, nl)
    start = text.index(fence + "text" + nl) + len(fence + "text" + nl)
    prompt = text[start : text.index(nl + fence, start)]
    # "</" would end the inline script early.
    return json.dumps(prompt, ensure_ascii=False).replace("</", "<" + chr(92) + "/")


ROOT_RADAR = "main"
RADAR_ID = re.compile(r"^[a-z0-9][a-z0-9-]{1,29}$")


def static_docs(exports: list[dict]) -> dict:
    """{path: data} for research-radar/v1 exports, laid out like the artifact database (same rules as infra/app/import.js)."""
    docs: dict = {}
    for i, x in enumerate(exports):
        if x.get("format") != "research-radar/v1":
            raise SystemExit("not a research-radar/v1 export")
        rid = (x.get("site") or {}).get("radar") or (ROOT_RADAR if i == 0 else "")
        if rid != ROOT_RADAR and not RADAR_ID.match(rid):
            raise SystemExit(f"bad radar id in export: {rid!r}")
        pre = "" if rid == ROOT_RADAR else f"radars/{rid}/"
        for k in ("topic", "config", "run", "control"):
            if x.get(k):
                docs[f"{pre}meta/{k}"] = x[k]
        for k in ("papers", "conferences", "journals"):
            for d in x.get(k) or []:
                if d.get("id"):
                    docs[f"{pre}{k}/{d['id']}"] = {a: b for a, b in d.items() if a != "id"}
        cfg = x.get("config") or {}
        docs[f"radars/{rid}"] = {
            "name": cfg.get("siteName") or (x.get("site") or {}).get("name") or rid,
            "tagline": cfg.get("tagline") or "",
            "root": rid == ROOT_RADAR,
        }
    return docs


def build(title: str, out: Path, static: list[dict] | None = None) -> Path:
    template = (SRC / "index.html").read_text(encoding="utf-8")
    styles_dir = SRC / "styles"
    css_files = sorted(styles_dir.glob("*.css"), key=lambda p: (p.name != "main.css", p.name))
    styles = "\n".join(p.read_text(encoding="utf-8").rstrip() for p in css_files)
    js_files = sorted((SRC / "js").glob("*.js"))
    scripts = "\n\n".join(f"/* ===== {p.name} ===== */\n" + p.read_text(encoding="utf-8").rstrip() for p in js_files)
    vendor = json.loads((ROOT / "vendor.json").read_text(encoding="utf-8"))
    vendor_tags = "\n".join(f'<script src="{v["url"]}"></script>' for v in vendor.get("eager", []))
    lazy = json.dumps({v["name"]: v["url"] for v in vendor.get("lazy", [])})
    if "/*@VENDOR_LAZY@*/{}" not in scripts:
        raise SystemExit("VENDOR_LAZY placeholder missing from the scripts")
    scripts = scripts.replace("/*@VENDOR_LAZY@*/{}", lazy)
    if '/*@ADD_RADAR_PROMPT@*/""' not in scripts:
        raise SystemExit("ADD_RADAR_PROMPT placeholder missing from the scripts")
    scripts = scripts.replace('/*@ADD_RADAR_PROMPT@*/""', add_radar_prompt())
    if static is not None:
        # </ would end the inline script early.
        data = json.dumps(static_docs(static), ensure_ascii=False).replace("</", "<" + chr(92) + "/")
        shim = (ROOT / "static-shim.js").read_text(encoding="utf-8")
        nl = chr(10)
        vendor_tags = f"<script>window.__RADAR_DOCS__={data};</script>{nl}<script>{nl}{shim}{nl}</script>{nl}" + vendor_tags
    html = (
        template.replace("{{TITLE}}", title)
        .replace("{{STYLES}}", styles)
        .replace("{{VENDOR_SCRIPTS}}", vendor_tags)
        .replace("{{SCRIPTS}}", scripts)
    )
    if "{{" in html.split("<script>")[0]:
        raise SystemExit("Unreplaced placeholder in the page head")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding="utf-8")
    return out


def check(out: Path) -> None:
    node = shutil.which("node")
    if not node:
        print("node not found; skipping syntax check", file=sys.stderr)
        return
    html = out.read_text(encoding="utf-8")
    inline = html.rsplit("<script>", 1)[1].split("</script>", 1)[0]
    with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False, encoding="utf-8") as fh:
        fh.write(inline)
    res = subprocess.run([node, "--check", fh.name], capture_output=True, text=True)
    Path(fh.name).unlink(missing_ok=True)
    if res.returncode:
        sys.stderr.write(res.stderr)
        raise SystemExit("JavaScript syntax check failed")
    print("JavaScript syntax OK")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--config", type=Path, help="site config JSON (default: config/site.json)")
    ap.add_argument("--title", help="page title (overrides the config)")
    ap.add_argument("--out", type=Path, help="output file (default: dist/<slug>.html)")
    ap.add_argument("--static", nargs="+", type=Path, metavar="EXPORT", help="build the read-only GitHub Pages page from these research-radar/v1 exports (default output: dist/pages/index.html)")
    ap.add_argument("--check", action="store_true", help="syntax-check the assembled JavaScript with node")
    args = ap.parse_args()
    cfg = load_config(args.config)
    title = args.title or cfg.get("title") or "Research Radar"
    static = [json.loads(p.read_text(encoding="utf-8")) for p in args.static] if args.static else None
    out = args.out or (REPO / "dist" / "pages" / "index.html" if static else REPO / "dist" / (cfg.get("outFile") or "radar.html"))
    path = build(title, out, static)
    print(f"Built {path.relative_to(REPO) if path.is_relative_to(REPO) else path} ({path.stat().st_size // 1024} KB)")
    if args.check:
        check(path)


if __name__ == "__main__":
    main()
