#!/usr/bin/env python3
"""Print the scheduler entries that run each radar's weekly scan outside Claude.

    python pipeline/schedulers.py --kind cron                 # crontab lines
    python pipeline/schedulers.py --kind schtasks             # Windows Task Scheduler commands
    python pipeline/schedulers.py --kind codex-automation     # text for a Codex app automation
    python pipeline/schedulers.py --kind cron --radar nlp     # one radar only

Each radar's weekday and time come from "radars" in config/site.json (the same slots
pipeline/radar/schedule.py assigns, so two radars never scan on the same day). Nothing
is installed: this only prints, and you paste or run it yourself.

cron and schtasks run `pipeline/run_scan.py`, which starts the agent CLI. A Codex app
automation is the agent itself, so it gets the rendered scan prompt instead.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from radar.schedule import DAY_NAMES, cron_expression, schedule_text  # noqa: E402
from render_prompt import REPO, ROOT_RADAR  # noqa: E402
from run_scan import DEFAULT_TARGET, build_prompt, load_config  # noqa: E402

DEFAULT_SLOT = (6, "09:00")  # Sundays, the install default
WINDOWS_DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]


def slots(cfg: dict, only: str | None = None) -> list[dict]:
    radars = cfg.get("radars") or [{"id": ROOT_RADAR, "name": cfg.get("siteName") or "Research Radar", "weekday": DEFAULT_SLOT[0], "time": DEFAULT_SLOT[1]}]
    out = []
    for r in radars:
        if r.get("archived") or (only and r["id"] != only):
            continue
        out.append({"id": r["id"], "name": r.get("name") or r["id"], "weekday": int(r.get("weekday", DEFAULT_SLOT[0])), "time": r.get("time") or DEFAULT_SLOT[1]})
    if only and not out:
        raise SystemExit(f"Radar '{only}' is not listed under radars in config/site.json")
    return out


def cron_lines(cfg: dict, only: str | None = None, python: str = "python3", repo: Path = REPO) -> str:
    lines = ["# Research Radar weekly scans (times are the machine's local time)"]
    for s in slots(cfg, only):
        lines.append(f"{cron_expression(s['weekday'], s['time'])} cd {repo.as_posix()} && {python} pipeline/run_scan.py --radar {s['id']} >> data/selfhost/scan-{s['id']}.log 2>&1")
    return "\n".join(lines) + "\n"


def schtasks_commands(cfg: dict, only: str | None = None, python: str = "python", repo: Path = REPO) -> str:
    out = []
    for s in slots(cfg, only):
        log = f"data\\selfhost\\scan-{s['id']}.log"
        run = f'cmd /c cd /d "{repo}" && {python} pipeline\\run_scan.py --radar {s["id"]} >> {log} 2>&1'
        out.append(f'schtasks /Create /F /SC WEEKLY /D {WINDOWS_DAYS[s["weekday"]]} /ST {s["time"]} /TN "Research Radar - {s["id"]}" /TR "{run}"')
    return "\n".join(out) + "\n"


def codex_automation(cfg: dict, only: str | None = None) -> str:
    """What to enter in Codex's Automations: a name, a schedule, the project folder and the prompt."""
    blocks = []
    for s in slots(cfg, only):
        prompt, _ = build_prompt(cfg, s["id"], "codex")
        blocks.append(
            f"=== Automation: {s['name']} weekly scan ===\n"
            f"Schedule: weekly, {schedule_text(s['weekday'], s['time'])} (cron {cron_expression(s['weekday'], s['time'])})\n"
            f"Project: {REPO}\n"
            f"Run in: the local project (not a worktree)\n"
            f"Prompt (everything below the line):\n"
            f"----------------------------------------\n{prompt}"
        )
    return "\n\n".join(blocks)


def main(argv: list[str] | None = None) -> int:
    for stream in (sys.stdout,):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--kind", required=True, choices=["cron", "schtasks", "codex-automation"])
    ap.add_argument("--radar", help="one radar id (default: every radar that isn't archived)")
    ap.add_argument("--config", type=Path, default=REPO / "config" / "site.json")
    args = ap.parse_args(argv)
    cfg = load_config(args.config)
    cfg.setdefault("target", DEFAULT_TARGET)
    text = {"cron": cron_lines, "schtasks": schtasks_commands, "codex-automation": codex_automation}[args.kind](cfg, args.radar)
    sys.stdout.write(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
