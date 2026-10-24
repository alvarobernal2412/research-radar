# Multi-agent runtime: implementation plan

Spec: `docs/superpowers/specs/2026-10-24-multi-agent-runtime-design.md`. Each task ends in one atomic commit.

1. **Page runtime adapter.** Add `01-runtime.js` (`rtUse`, `rtKind`), route the 7 `window.claude.use` call sites through it, let "Run now" work without a `triggerId` on the self-hosted runtime. Smoke test still passes unchanged.
2. **Storage drivers.** Split `server.js` into `store/files.js`, `store/postgres.js` and `store/index.js`; conditional writes; reject `.`/`..` path segments. Node tests for both semantics (Postgres only when `DATABASE_URL` is set).
3. **Server API.** Batch endpoint, `/api/capabilities`, `/api/ask`, `/api/scan`, `/runtime.js` (the old shim plus `sample` and `mcp`). Standalone start without Docker.
4. **Store client and CLI.** `pipeline/radar/store.py`, `pipeline/radar_cli.py` (`store get|set|set-many|update|delete|list`, `openalex`). pytest against the real server in files mode.
5. **Target-aware prompt.** Add `{{#claude}}`/`{{#agent}}` blocks to `scan-prompt.md`, `--target` in `render_prompt.py`, `pipeline/targets/*.md` preambles. Golden test: Claude output unchanged.
6. **Runner and schedulers.** `pipeline/run_scan.py`, `pipeline/schedulers.py`, config fields (`target`, `radarUrl`, `agentCommand`).
7. **Docs.** `AGENTS.md`, `docs/self-hosted.md`, `docs/codex-guide.md` (setup prompt and a first-run checklist for the person validating on Codex), README and architecture updates.
8. **Tests.** Smoke variant against the HTTP runtime; end-to-end check of the runner with a fake agent.
