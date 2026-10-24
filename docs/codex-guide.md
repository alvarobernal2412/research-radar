# Trying Research Radar with Codex

This is for someone with a Codex licence who wants to check that a radar runs without Claude. Everything here was written from OpenAI's public documentation and tested only against a stand-in agent, so **part of the job is finding out which assumptions are wrong**. Please report what you find (see the end).

Read [self-hosted.md](self-hosted.md) first; this page is the checklist and the prompt.

## Setup prompt

Paste this into Codex, in an empty folder. It does not create any automation; that step is left to you.

```text
Set up Research Radar on this machine so that I can run its weekly scan with Codex.
Repo: https://github.com/alvarobernal2412/research-radar  (branch: feat/multi-agent-runtime)

Ask me first, in one message: the folder to clone into, my radar's name, a one-line
description of my research topic, and the weekday and time for the weekly scan. Then:

1. git clone the repo (that branch) into the folder, and read AGENTS.md and
   docs/self-hosted.md.
2. Check that python (3.9+), node (20+) and codex are on PATH. Install nothing
   system-wide without asking me. Run: python -m pytest
3. Copy config/site.example.json to config/site.json and set target to "codex",
   siteName, tagline, scheduleText, timezone, and a "radars" list with one entry
   {id: "main", name, tagline, root: true, weekday, time} (Monday is 0, Sunday is 6).
   Never commit config/site.json.
4. python site/build.py --check
5. Start the server in the background with
   ASK_COMMAND="codex exec --sandbox read-only --ephemeral -" and
   SCAN_COMMAND="python pipeline/run_scan.py"
   (node infra/app/server.js), then run: python pipeline/radar_cli.py init
6. Run: python pipeline/run_scan.py --radar main --dry-run
   and show me the command it prints. Do not run the real scan.
7. Print python pipeline/schedulers.py --kind codex-automation (or cron / schtasks if
   I prefer) and tell me what to paste where. Do not create the automation yourself.
8. Tell me what is left: open http://127.0.0.1:8787, write the topic, enter my OpenAlex
   key under Sources, press Run now.

Rules: never commit .env, config/site.json or any key; do not ask me to paste my
OpenAlex key into the chat; do not run git commit yourself.
```

## What to verify, in order

Each item says what should happen and, in brackets, the assumption behind it. If one fails, the fix is usually a one-line change to `agentCommand` in `config/site.json`.

1. **Dry run.** `python pipeline/run_scan.py --radar main --dry-run` prints `codex exec --sandbox workspace-write -c sandbox_workspace_write.network_access=true -`. [These flags follow the public `codex exec` reference. Run `codex exec --help` and compare.]
2. **The prompt reaches Codex.** `python pipeline/run_scan.py --radar main` starts Codex, which reads its instructions from stdin. [`codex exec -` reads the prompt from stdin.]
3. **Codex can use the tools.** In the first minutes the log should show `python pipeline/radar_cli.py store get ...` calls succeeding. [The sandbox lets Codex reach `127.0.0.1:8787`. If every call fails, the sandbox is blocking local network access: allow it, or set `agentCommand` to use `--sandbox danger-full-access` on a machine you trust.]
4. **OpenAlex works.** `radar_cli.py openalex get "works?search=test&per-page=1"` prints JSON when run by Codex. [`network_access=true` is the right config key.]
5. **The scan lock.** While a scan runs, `curl http://127.0.0.1:8787/api/doc?path=scanlock/current` returns the lock; it is gone when the scan ends, including when it stops on an error.
6. **A real scan.** Papers appear on the **Contributions** page with affinity, summary and limitations. `meta/run` (Topic & scans, last scan) shows `status`, `accessMode` of `openalex+web` or `web-only`, and sensible counts. Skim a few papers: an abstract-only paper must say so ("Unknown" for author-stated limitations), never invent them.
7. **Run now.** Press it on **Topic & scans**: a scan starts (`data/selfhost/files/scan-logs/` gets a log). Pressing it again while one runs is refused.
8. **Propose topic.** Paste an abstract on **Topic & scans**, choose "Derive", and press propose: the editor opens with themes. [`ASK_COMMAND` output contains a JSON object; if Codex wraps it in prose that is fine, the server finds the object.]
9. **The schedule.** Create the automation or cron entry printed by `schedulers.py`, let it fire once, and check `meta/run.lastRunAt` moved. [Codex automations can run a prompt in a local project and reach the local server; the machine must be awake.]
10. **Quality against Claude (optional).** Compare a Codex scan with the same topic against a Claude scan: same papers found? comparable affinity scores? Honest completeness flags? The prompt was tuned on Claude, so wording changes in `pipeline/scan-prompt.md` (inside the `{{#agent}}` blocks) are expected.

## Known gaps

- No browser sources that need your sign-in (ScienceDirect, IEEE, Springer, ACM, Scholar, Scopus). Codex is told to skip anything behind a login and list it under issues.
- Codex automations: the public docs describe prompt, schedule and project; they don't describe MCP or browser access for them, so nothing here relies on either.
- Codex Sites (OpenAI's hosted pages) is not supported; its runtime isn't documented well enough to target.
- Single user. See Security in [self-hosted.md](self-hosted.md).

## What to report back

For each numbered item: worked, worked after a change (which), or failed (with the log). The most useful single artefact is the scan's log from `data/selfhost/files/scan-logs/` (or the output of `run_scan.py`), with any key redacted.
