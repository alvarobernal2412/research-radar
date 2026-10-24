#!/usr/bin/env python3
"""Command-line tools for a scan run by an agent that has a shell (Codex and similar).

The Claude scan reaches the database through ArtifactData and the web through Claude's
tools. An agent with only a shell uses this instead. Everything prints JSON on stdout;
the server comes from --url or RADAR_URL (default http://127.0.0.1:8787).

  store get PATH                      {"data": ..., "version": N}; exit 4 when missing
  store set PATH [--file F]           document from F or stdin; add --if-none-match to create
                                      only (exit 3 when it exists) or --if-version N to write
                                      only that version (exit 3 on a mismatch)
  store update PATH [--file F]        merge top-level fields into the document
  store delete PATH
  store list COLLECTION [--out-dir D] every document; with --out-dir, one <id>.json each plus
                                      .versions.json ({id: version}) for If-Match writes
  store set-many [FILE]               a {path: data} map from FILE or stdin, written in batches
  openalex get "works?filter=..."     GET api.openalex.org with the owner's key and email from
                                      data/users/<user>/settings added; the key is never printed
  init [--config F]                   create each radar's registry entry and meta/config from
                                      config/site.json (never overwrites what exists)
  paper-id                            {doi, title, year} on stdin -> the document id
  affinity                            {themeScores, topic, excludeHit} on stdin -> affinity fields

Exit codes: 0 ok, 1 error, 3 version conflict, 4 not found.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.parse
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from radar.dedup import paper_id  # noqa: E402
from radar.openalex import OpenAlex, OpenAlexError  # noqa: E402
from radar.schedule import schedule_text  # noqa: E402
from radar.scoring import affinity  # noqa: E402
from radar.store import Conflict, Store, StoreError  # noqa: E402
from render_prompt import REPO, ROOT_RADAR, db_prefix  # noqa: E402

EXIT_CONFLICT = 3
EXIT_NOT_FOUND = 4


def _out(obj) -> None:
    print(json.dumps(obj, ensure_ascii=False))


def _read_json(file: str | None):
    if file and file != "-":
        return json.loads(Path(file).read_text(encoding="utf-8"))
    return json.load(sys.stdin)


def _store(args) -> int:
    st = Store(args.url)
    cmd = args.store_cmd
    if cmd == "get":
        row = st.get(args.path)
        if row is None:
            print(f"not found: {args.path}", file=sys.stderr)
            return EXIT_NOT_FOUND
        _out({"data": row[0], "version": row[1]})
    elif cmd == "set":
        _out({"version": st.set(args.path, _read_json(args.file), args.if_none_match, args.if_version)})
    elif cmd == "update":
        _out({"version": st.update(args.path, _read_json(args.file))})
    elif cmd == "delete":
        st.delete(args.path)
        _out({"ok": True})
    elif cmd == "list":
        rows = st.list(args.collection)
        if args.out_dir:
            out = Path(args.out_dir)
            out.mkdir(parents=True, exist_ok=True)
            for r in rows:
                (out / f"{r['id']}.json").write_text(json.dumps(r["data"], ensure_ascii=False), encoding="utf-8")
            # Versions live beside the documents, not in them, so a document can be written back unchanged.
            (out / ".versions.json").write_text(json.dumps({r["id"]: r["version"] for r in rows}), encoding="utf-8")
            _out({"count": len(rows), "dir": str(out), "versions": str(out / ".versions.json")})
        else:
            _out(rows)
    elif cmd == "set-many":
        _out({"written": st.set_many(_read_json(args.file))})
    return 0


def _openalex(args) -> int:
    key = mailto = None
    try:
        row = Store(args.url).get(f"data/users/{args.user}/settings")
        if row:
            key = row[0].get("openalexKey") or None
            mailto = row[0].get("openalexEmail") or None
    except StoreError as e:
        print(f"warning: couldn't read the OpenAlex settings ({e}); continuing without a key", file=sys.stderr)
    path, _, query = args.request.partition("?")
    params = dict(urllib.parse.parse_qsl(query, keep_blank_values=True))
    _out(OpenAlex(api_key=key, mailto=mailto).get(path, params))
    return 0


def _init(args) -> int:
    """First-run documents, as the Claude setup prompt writes them. Existing documents are left alone."""
    cfg_path = Path(args.config)
    cfg = json.loads(cfg_path.read_text(encoding="utf-8")) if cfg_path.exists() else {}
    radars = cfg.get("radars") or [{"id": ROOT_RADAR, "name": cfg.get("siteName") or "Research Radar", "root": True}]
    st = Store(args.url)
    created, skipped = [], []
    for r in radars:
        rid = r["id"]
        root = r.get("root", rid == ROOT_RADAR)
        prefix = db_prefix(rid, root)
        weekday, time = int(r.get("weekday", 6)), r.get("time") or "09:00"
        name = r.get("name") or cfg.get("siteName") or rid
        tagline = r.get("tagline") if r.get("tagline") is not None else (cfg.get("tagline") if root else "")
        when = r.get("scheduleText") or (cfg.get("scheduleText") if root and cfg.get("scheduleText") else schedule_text(weekday, time))
        docs = {
            f"radars/{rid}": {"name": name, "tagline": tagline, "root": root, "weekday": weekday, "time": time,
                              "timezone": cfg.get("timezone"), "scheduleText": when, "triggerId": rid,
                              "createdAt": date.today().isoformat()},
            f"{prefix}meta/config": {"siteName": name, "tagline": tagline, "triggerId": rid, "scheduleText": when,
                                     "lookbackYears": cfg.get("lookbackYears", 3), "minAffinity": cfg.get("minAffinity", 35)},
        }
        for path, data in docs.items():
            try:
                st.set(path, data, if_none_match=True)
                created.append(path)
            except Conflict:
                skipped.append(path)
    _out({"created": created, "skipped": skipped})
    return 0


def main(argv: list[str] | None = None) -> int:
    for stream in (sys.stdout, sys.stdin):  # records hold non-ASCII text; Windows would use cp1252
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--url", help="radar server (default: RADAR_URL or http://127.0.0.1:8787)")
    sub = ap.add_subparsers(dest="cmd", required=True)

    st = sub.add_parser("store")
    ssub = st.add_subparsers(dest="store_cmd", required=True)
    g = ssub.add_parser("get"); g.add_argument("path")
    s = ssub.add_parser("set"); s.add_argument("path"); s.add_argument("--file")
    s.add_argument("--if-none-match", action="store_true"); s.add_argument("--if-version", type=int)
    u = ssub.add_parser("update"); u.add_argument("path"); u.add_argument("--file")
    d = ssub.add_parser("delete"); d.add_argument("path")
    ls = ssub.add_parser("list"); ls.add_argument("collection"); ls.add_argument("--out-dir")
    sm = ssub.add_parser("set-many"); sm.add_argument("file", nargs="?")

    oa = sub.add_parser("openalex")
    osub = oa.add_subparsers(dest="oa_cmd", required=True)
    og = osub.add_parser("get"); og.add_argument("request", help='path and query, e.g. "works?filter=...&per-page=50"')
    og.add_argument("--user", default=os.environ.get("RADAR_USER", "local"))

    ini = sub.add_parser("init")
    ini.add_argument("--config", default=str(REPO / "config" / "site.json"))

    sub.add_parser("paper-id")
    sub.add_parser("affinity")

    args = ap.parse_args(argv)
    try:
        if args.cmd == "store":
            return _store(args)
        if args.cmd == "openalex":
            return _openalex(args)
        if args.cmd == "init":
            return _init(args)
        if args.cmd == "paper-id":
            print(paper_id(json.load(sys.stdin)))
            return 0
        body = json.load(sys.stdin)
        _out(affinity(body["themeScores"], body["topic"], bool(body.get("excludeHit"))))
        return 0
    except Conflict as e:
        _out({"conflict": True, "version": e.version})
        return EXIT_CONFLICT
    except (StoreError, OpenAlexError, ValueError, OSError) as e:
        print(f"error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
