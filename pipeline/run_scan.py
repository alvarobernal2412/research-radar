#!/usr/bin/env python3
"""Run one radar's scan with an agent CLI (Codex by default) against the self-hosted server.

    python pipeline/run_scan.py --radar main            # what cron, Task Scheduler or "Run now" runs
    python pipeline/run_scan.py --radar nlp --dry-run   # show the command, change nothing

It renders the scan prompt for the target (see render_prompt.py), checks that the radar
server is up, then starts the agent with the prompt on stdin and the repository as its
working directory. The agent's output goes to this process's stdout and stderr, and its
exit code is returned.

config/site.json (all optional):
  target            "codex" (default) or "agent"
  radarUrl          the self-hosted server, default http://127.0.0.1:8787
  agentCommand      the agent command as a list, replacing the default for the target
  scanTimeoutMinutes  stop the agent after this long (default 90)

RADAR_REQUEST_TEXT, when set (the site's "Run now" does), is appended to the prompt.
"""
from __future__ import annotations

import argparse
import json
import os
import shlex
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from radar.store import Store, StoreError  # noqa: E402
from render_prompt import DEFAULT_RADAR_URL, REPO, ROOT_RADAR, TARGETS, render  # noqa: E402

DEFAULT_TARGET = "codex"
DEFAULT_TIMEOUT_MIN = 90
# Network access is on because the scan fetches OpenAlex and venue pages and calls the local
# server. These flags follow Codex's public documentation and are meant to be overridden with
# `agentCommand` if your Codex version spells them differently.
DEFAULT_COMMANDS = {
    "codex": ["codex", "exec", "--sandbox", "workspace-write", "-c", "sandbox_workspace_write.network_access=true", "-"],
    "agent": [],
}
REQUEST_HEADING = "## Request from the site\nThe owner started this scan from the site. This is informational; the request itself is in `meta/control`.\n\n"


def load_config(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


def build_prompt(cfg: dict, radar: str, target: str, request: str = "") -> tuple[str, str]:
    """The rendered scan prompt and the server URL it names."""
    url = os.environ.get("RADAR_URL") or cfg.get("radarUrl") or DEFAULT_RADAR_URL
    entry = next((r for r in cfg.get("radars", []) if r.get("id") == radar), {})
    if radar != ROOT_RADAR and not entry:
        raise SystemExit(f"Radar '{radar}' is not listed under radars in config/site.json")
    prompt = render(url, radar, entry.get("name") or cfg.get("siteName", ""), radar == ROOT_RADAR, target)
    if request.strip():
        prompt = prompt.rstrip("\n") + "\n\n" + REQUEST_HEADING + request.strip() + "\n"
    return prompt, url


def agent_command(cfg: dict, target: str) -> list[str]:
    cmd = cfg.get("agentCommand") or DEFAULT_COMMANDS[target]
    if isinstance(cmd, str):
        cmd = shlex.split(cmd)
    if not cmd:
        raise SystemExit('Set "agentCommand" in config/site.json: there is no default command for target "agent".')
    return list(cmd)


def main(argv: list[str] | None = None) -> int:
    for stream in (sys.stdout, sys.stderr):  # the agent's output holds non-ASCII text
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--radar", default=ROOT_RADAR, help="radar id (default: the first radar)")
    ap.add_argument("--config", type=Path, default=REPO / "config" / "site.json")
    ap.add_argument("--target", choices=sorted(t for t in TARGETS if t != "claude"), help="default: config target, else codex")
    ap.add_argument("--dry-run", action="store_true", help="print the command and prompt size, run nothing")
    args = ap.parse_args(argv)

    cfg = load_config(args.config)
    target = args.target or cfg.get("target") or DEFAULT_TARGET
    if target == "claude":
        raise SystemExit('target "claude" runs as a Claude scheduled task, not through run_scan.py')
    if target not in TARGETS:
        raise SystemExit(f"unknown target '{target}' in config/site.json")
    prompt, url = build_prompt(cfg, args.radar, target, os.environ.get("RADAR_REQUEST_TEXT", ""))
    cmd = agent_command(cfg, target)
    exe = shutil.which(cmd[0])
    timeout = float(cfg.get("scanTimeoutMinutes") or DEFAULT_TIMEOUT_MIN) * 60

    if args.dry_run:
        print(f"radar: {args.radar}\ntarget: {target}\nserver: {url}\ncommand: {' '.join(cmd)}\nprompt: {len(prompt)} characters")
        return 0
    if not exe:
        print(f"error: '{cmd[0]}' is not on PATH. Install it, or set agentCommand in config/site.json.", file=sys.stderr)
        return 2
    try:
        Store(url, timeout=10).capabilities()
    except StoreError as e:
        print(f"error: {e}. Start it with: node infra/app/server.js", file=sys.stderr)
        return 2

    env = {**os.environ, "RADAR_URL": url, "PYTHONIOENCODING": "utf-8"}
    try:
        return subprocess.run([exe, *cmd[1:]], input=prompt, text=True, encoding="utf-8", cwd=REPO, env=env, timeout=timeout).returncode
    except subprocess.TimeoutExpired:
        print(f"error: the scan was stopped after {timeout / 60:.0f} minutes", file=sys.stderr)
        return 124


if __name__ == "__main__":
    sys.exit(main())
