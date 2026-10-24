# Architecture

## Pieces

| Piece | Where it runs | What it does |
|---|---|---|
| Site (`dist/radar.html`) | The viewer's browser, inside Claude's artifact viewer | Renders the database and edits the topic, control, config and the viewer's private settings and marks. It has no network access beyond the CDN scripts. |
| Artifact database | Claude | JSON documents (see the schema). Shared documents are readable by everyone the artifact is shared with and writable by Editors. `data/users/<id>/…` is private to each viewer. |
| Scan (scheduled task) | A fresh Claude session, on a schedule or on Run now | Follows `pipeline/scan-prompt.md`: reads the database, searches, analyses, writes, and reports. |
| Pipeline helpers (`pipeline/radar`) | Your machine, tests, or the scan as a reference | Encode the OpenAlex mapping, de-duplication and scoring rules so they can be tested. |

The first three rows are the Claude deployment. The same roles can be filled without Claude (see [Hosts and targets](#hosts-and-targets)).

## Radars

One artifact can hold several radars, each a separate research topic. `radars/<id>` is the registry (name, tagline, weekday, time, task id, archived). The first radar, `main`, keeps its documents at the database root, so an install made before multiple radars needs no migration; every other radar keeps the same documents under `radars/<id>/` (for example `radars/nlp/papers/<id>`, `radars/nlp/meta/topic`). The page works out the prefix in one helper (`rp()` in `site/src/js/00-core.js`) and `attachRadar()` in `90-boot.js` drops the previous radar's listeners and state when you switch. Links to a radar other than the first carry its id (`#nlp~paper.<id>`).

Shared by all radars: `data/users/<id>/settings` (API keys), the artifact's sharing, and the weekly-scan lock `scanlock/current`. Per radar and per viewer: the marks (`data/users/<id>/marks` for the first radar, `marks-<radar id>` for the others).

Each radar has its own scheduled task. `pipeline/radar/schedule.py` assigns weekdays so that no two radars scan on the same day while there are seven or fewer, and `pipeline/render_prompt.py --radar <id>` renders that radar's scan prompt (the same prompt with a header telling the scan which prefix to use). Before it does anything, a scan creates `scanlock/current`; if another radar's scan holds it (less than 3 hours old) the scan defers itself and leaves its request queued.

## Documents

- `papers/<id>`, `conferences/<id>`, `journals/<id>`: written by the scan, and deleted only by the owner from the site.
- `meta/topic`: the topic profile. `revision` goes up whenever the themes, description or exclusions change.
- `meta/config`: site name, tagline, schedule text, enabled sources, lookback, minimum affinity, and the scheduled task id.
- `meta/control`: requests from the site to the scan: `status` (queued, running, done), `mode` (incremental, rescore, full), `deriveTopicFromSeeds` and `retryPaperIds`.
- `meta/run`: the last run's status, counts, issues and history.
- `data/users/<id>/settings`: the viewer's API keys. `data/users/<id>/marks`: the viewer's starred and read papers.

## Site to scan

1. The site writes `meta/control` with `status: "queued"`.
2. **Run now** calls the Claude Code Remote connector's `fire_trigger` with the task id from `meta/config.triggerId`, through the page's `mcp` capability. The viewer is asked to allow this the first time.
3. The scan sets `status: "running"`, does the work, then sets `status: "done"` with `lastResult`. If Run now isn't available, the next scheduled run picks up the queued request.

## Completeness

The scan records what it actually read: `fullTextRead`, `fullTextSource`, `fetchNotes` and `pendingDetail`. The site turns these into levels, in `site/src/js/22-completeness.js`, mirrored in `pipeline/radar/scoring.py`:

- **Complete:** full text read, with an abstract and a summary.
- **Partial:** analysed from the title and abstract, or some fields are missing.
- **Metadata only:** still pending, or there's no abstract and no summary.

Author-stated limitations and future work are `null` (unknown) unless the full text was read. `[]` means the authors state none. The site shows the difference.

**Rescore due** marks a paper whose `scoredTopicRevision` is older than `meta/topic.revision`.

## Why one HTML file

The artifact host serves a single page and allows scripts only from a few CDNs. The sources stay split for version control; `site/build.py` concatenates them in a fixed order into one strict-mode scope, so the parts share helpers without globals. d3 loads eagerly. pdf.js loads only when you drop a PDF, and runs on the main thread because the page can't start cross-origin workers.

## Hosts and targets

Three seams keep the Claude specifics in one place each.

**Page host.** The page asks for capabilities (`db`, `user`, `sample`, `mcp`, `downloads`) through `rtUse()` in `site/src/js/01-runtime.js`. It uses `window.claude` when the Claude artifact host provides it, otherwise `window.radarRuntime`, which the self-hosted server injects (`infra/app/runtime.js`). `sample` and `mcp` exist on the self-hosted runtime only when the server has `ASK_COMMAND` / `SCAN_COMMAND`, as `/api/capabilities` reports. Errors carry the same `code`s on both, so the page has one message table. "Run now" identifies the scan by the scheduled task's id on Claude and by the radar id on the self-hosted server.

**Database.** Both backends address documents by the same paths. On the server a store driver (`infra/app/store`) keeps them in JSON files or Postgres, with the two conditional writes the scan needs: `If-None-Match: *` creates the scan lock only if it is absent, `If-Match: <version>` writes only the version that was read.

**Scan.** `pipeline/scan-prompt.md` holds one method with `{{#claude}}` and `{{#agent}}` blocks where the tool differs: ArtifactData, ToolSearch, Claude in Chrome and SendUserMessage on one side, `pipeline/radar_cli.py` and plain web access on the other. `render_prompt.py --target` picks the blocks, the viewer id (`me` on Claude, `local` self-hosted) and an optional note from `pipeline/targets/`. `accessMode` keeps the values the site already knows. `run_scan.py` starts the agent CLI with the rendered prompt; cron, Task Scheduler, a Codex automation (`schedulers.py` prints each) or the server's "Run now" call it.

| | Claude | Self-hosted |
|---|---|---|
| Host | artifact (`window.claude`) | `infra/app/server.js` (`window.radarRuntime`) |
| Storage | artifact database | JSON files or Postgres |
| Scan | scheduled task, target `claude` | `run_scan.py`, target `codex` / `agent` |
| Users | sharing and roles | one local editor |
