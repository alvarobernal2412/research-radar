# Architecture

## Pieces

| Piece | Where it runs | What it does |
|---|---|---|
| Site (`dist/radar.html`) | The viewer's browser, inside Claude's artifact viewer | Renders the database and edits the topic, control, config and the viewer's private settings and marks. It has no network access beyond the CDN scripts. |
| Artifact database | Claude | JSON documents (see the schema). Shared documents are readable by everyone the artifact is shared with and writable by Editors. `data/users/<id>/…` is private to each viewer. |
| Scan (scheduled task) | A fresh Claude session, on a schedule or on Run now | Follows `pipeline/scan-prompt.md`: reads the database, searches, analyses, writes, and reports. |
| Pipeline helpers (`pipeline/radar`) | Your machine, tests, or the scan as a reference | Encode the OpenAlex mapping, de-duplication and scoring rules so they can be tested. |

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
