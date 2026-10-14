# Research Radar

A literature radar for one research topic. A weekly Claude scan finds new papers, scores how close each one is to your topic, and keeps a website up to date. The site has five pages:

- **Conferences:** a CORE tier list, deadlines for every track, the next edition and the one after, and committees with topic-related people flagged.
- **Journals:** journals ordered by impact factor or topic fit, with special issues and editorial boards.
- **Contributions:** every paper found, with filters, sorting and search by title or author. Each paper has a detail page with:
  - its affinity to your topic;
  - a summary and its main contribution;
  - future work;
  - limitations stated by the authors and limitations identified by the AI;
  - author profiles.
- **Network:** a co-authorship graph of the community, with a people checklist.
- **Topic & scans:** your topic profile, plus:
  - deriving the topic from seed papers;
  - rescoring, removing or re-searching papers when the topic changes;
  - choosing sources and entering API keys;
  - the scan log;
  - data export.

Conferences and journals both have an *Emerging* section. Records the scan could only partly collect are flagged: a paper analysed from its abstract alone is marked **Partial**, and its author-stated fields show as *unknown* rather than *none stated*.

Nothing in the code is tied to one topic. To use it for another topic, see [docs/new-topic.md](docs/new-topic.md).

## How it works

```mermaid
flowchart LR
  subgraph Claude
    T[Scheduled task<br/>pipeline/scan-prompt.md] -->|ArtifactData writes| DB[(Artifact database)]
    P[Site<br/>dist/radar.html] <-->|db capability| DB
    P -->|Run now: mcp fire_trigger| T
    P -->|Propose topic: sample| C[Claude]
  end
  T -->|API| OA[OpenAlex]
  T -->|your Chrome| W[DBLP · ScienceDirect · IEEE · Springer · arXiv ...]
```

- The **site** is one HTML page published as a Claude artifact. It reads and writes the artifact's database through the runtime's `db` capability. It can't reach the web itself.
- The **scan** is a Claude scheduled task. Its instructions are [pipeline/scan-prompt.md](pipeline/scan-prompt.md). It searches OpenAlex first, then the sources you enabled through your Chrome. It de-duplicates the results, reads the papers and writes them to the database.
- The site talks to the scan through `meta/control`, for example "rescore everything" or "retry these papers". "Run now" starts the task immediately.
- **Secrets** such as the OpenAlex key are entered on the site and stored in `data/users/<you>/settings`, which only you can read. They never enter this repository or the export.

More detail: [docs/architecture.md](docs/architecture.md). Data model: [pipeline/schema/radar.schema.json](pipeline/schema/radar.schema.json).

## Repository layout

```
site/
  src/index.html        page template ({{TITLE}}, {{STYLES}}, {{SCRIPTS}})
  src/styles/*.css      main.css first, then alphabetical
  src/js/NN-*.js        concatenated in numeric order into one strict-mode scope
  build.py              assembles dist/radar.html (standard library only)
  vendor.json           pinned CDN libraries (d3 eager, pdf.js lazy)
  capabilities.json     runtime capabilities to declare when publishing
pipeline/
  scan-prompt.md        the scheduled scan's instructions ({{ARTIFACT_URL}})
  render_prompt.py      fills in the prompt from config/site.json
  radar/openalex.py     OpenAlex client + mapping to paper records (+ CLI)
  radar/dedup.py        duplicate detection and stable document ids
  radar/scoring.py      affinity formula and completeness rules
  schema/               JSON Schema of every stored document and the export file
config/
  site.json             this deployment (artifact URL, task id, names); no secrets
tests/
  test_pipeline.py      pytest for the pipeline helpers
  smoke/smoke.js        end-to-end test of the built page against a mocked runtime
  fixtures/             sample OpenAlex work and paper records
docs/
data/                   put exported JSON snapshots here (git-ignored unless you add them)
```

## Working on it

```bash
python site/build.py --check            # build dist/radar.html and syntax-check it
python -m pytest                        # pipeline tests
npm install && npm run smoke            # end-to-end test (set CHROMIUM=/path/to/chrome if needed)

# OpenAlex from your own machine (set OPENALEX_API_KEY first)
cd pipeline && python -m radar.openalex search "analytic provenance" --since 2025-01-01 --max 20
```

**Publishing a change.** Build, then ask Claude to publish the page:

> Publish `dist/radar.html` to `<artifactUrl from config/site.json>`. Read the live version first and keep its data.

The page's data lives in the database, not in the HTML, so republishing never loses papers. Only pass `capabilities` (from `site/capabilities.json`) when you change what the page declares.

**Changing the scan.** Edit `pipeline/scan-prompt.md`, run `python pipeline/render_prompt.py`, and ask Claude to update the scheduled task's prompt with the output. A task that runs on your computer must be approved from a conversation linked to that computer.

## Local mirror (optional)

`infra/` holds a docker compose stack (Postgres plus a small web service) that keeps a durable, offline copy of your radar and serves the page against it. It is meant to sit next to the Claude scheduled task, not replace it: the task still scans, analyses and writes into the artifact's database, and the stack is where a copy of the result lands. Details are in [infra/README.md](infra/README.md).

```
scheduled Claude task ──writes──▶ artifact database (source of truth)
        │
        └─ final step ──copies──▶ local Postgres + files volume ──▶ http://127.0.0.1:8787
```

To make the scheduled task feed the mirror, append the step in [infra/scan-mirror-step.md](infra/scan-mirror-step.md) to the task prompt. Placeholder example, to pass to Claude when you create or update the task:

> Update my scheduled task "<site> weekly scan". Keep its current prompt and append the contents of `<REPO_PATH>/infra/scan-mirror-step.md` as step 7, with these values filled in:
> - `{{ARTIFACT_URL}}` = `<ARTIFACT_URL>` (artifactUrl in config/site.json)
> - `<REPO_PATH>` = `<ABSOLUTE PATH TO THIS REPO ON THE MACHINE THE TASK RUNS ON>`
> - `<MIRROR_DIR>` = `<A SCRATCH FOLDER OUTSIDE THE REPO, e.g. ~/radar-mirror-scratch>`
>
> The task must run on my computer (Docker and the stack need to be running there). If the import fails, it should report that and finish normally.

The stack does not need to be running for scans to work; a failed mirror step never affects the artifact.

## Limits worth knowing

- Browser sources (DBLP, ScienceDirect, IEEE Xplore, SpringerLink, ACM, arXiv, Scholar, Scopus) are read through Chrome on your computer, so your computer must be on with Chrome open during a scan. OpenAlex doesn't need either.
- Paywalled papers are analysed from the abstract unless your Chrome session has institutional access. They show as Partial.
- `impactFactor` is only filled in from JCR or publisher pages. OpenAlex's 2-year mean citedness is stored separately and labelled as such.

## License

GNU Affero General Public License v3.0 or later. See [LICENSE](LICENSE).
