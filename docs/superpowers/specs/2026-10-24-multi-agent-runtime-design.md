# Multi-agent runtime: run a radar without Claude

## Goal

Let a Research Radar run with an agent other than Claude (Codex is the first target) and without the Claude artifact host, while the Claude deployment keeps working byte-for-byte as it does today.

Out of scope: hosting on a vendor site builder (Codex Sites), creating any Codex task or running Codex from this repository's own tooling. The change is shipped untested against Codex; a person with a licence validates it.

## What is Claude-specific today

| Piece | Dependency |
|---|---|
| Page | `window.claude.use("db" \| "user" \| "sample" \| "mcp" \| "downloads")`, 7 call sites |
| Storage | the artifact database, reachable only through `ArtifactData` |
| Scan prompt | `ArtifactData`, `ToolSearch`, `SendUserMessage`, Claude in Chrome |
| Scheduler | a Claude Code scheduled task; "Run now" calls the Claude Code Remote `fire_trigger` tool |

## Design

Three seams, one per dependency.

1. **Page runtime adapter** (`site/src/js/01-runtime.js`). The page asks `rtUse(name)`, which returns `window.claude` capabilities when present and `window.radarRuntime` otherwise. The self-hosted server injects `radarRuntime` (`infra/app/runtime.js`), so the same built page runs in both places.
2. **Self-hosted backend** (`infra/app`). The existing mirror server becomes a first-class backend: a storage driver seam (JSON files by default, Postgres as before), conditional writes (`If-None-Match: *`, `If-Match: <version>`) so the scan lock works, a batch endpoint, `GET /api/capabilities`, and two optional endpoints that shell out to a configured command: `/api/ask` (topic proposal) and `/api/scan` ("Run now"). Single-user, bound to localhost.
3. **Target-aware scan prompt.** `pipeline/scan-prompt.md` gets `{{#claude}}` / `{{#agent}}` blocks. `render_prompt.py --target claude` renders exactly what it renders today (checked by a golden test). `--target agent|codex` binds the same method to a store CLI (`pipeline/radar_cli.py`) and plain HTTP instead of Claude tools. The CLI wraps the HTTP API and the OpenAlex key handling.

Scheduling is a thin adapter layer: `pipeline/run_scan.py` renders the prompt and runs the agent command; cron, GitHub Actions or the server's "Run now" all call it. `pipeline/schedulers.py` emits the cron line, the Actions workflow and the pasteable text for a Codex app automation.

## Decisions

- Browser-only sources (ScienceDirect, IEEE, ...) stay Claude-in-Chrome only. Other targets search OpenAlex, DBLP and arXiv over HTTP and skip sources that need a signed-in browser, recording that under issues.
- `accessMode` keeps its existing values (`openalex+web`, `web-only`); no new values reach the site.
- Self-hosted user id is `local`, so the OpenAlex key lives at `data/users/local/settings`.
- No auth in the server. It binds to 127.0.0.1; sharing it means a reverse proxy with auth in front. Documented as a limitation.
- Codex flags and sandbox/network settings are best-effort from public docs and are overridable in `config/site.json` (`agentCommand`). The Codex guide lists what to verify first.

## Verification

Automated: pytest (golden Claude prompt, target rendering, store client against the real server, schedulers), the existing Playwright smoke test plus a variant against the HTTP runtime. Not verified here: any run of Codex itself.
