# Research Radar: notes for coding agents

Literature radars: a single-page site plus a weekly scan that finds and scores papers for a research topic. It runs as a Claude artifact with a Claude scheduled task, or self-hosted with any agent CLI that has a shell. Start with [README.md](README.md); for the self-hosted path read [docs/self-hosted.md](docs/self-hosted.md).

## Commands

```bash
python site/build.py --check        # build dist/radar.html and syntax-check it
python -m pytest                    # Python and server tests (needs node on PATH for the server ones)
node --test tests/server/server.test.js
npm i --no-save playwright-core@1.47.2 d3@7.8.5   # once, for the browser smoke tests
npm run smoke                       # page against a mock Claude runtime
npm run smoke:selfhosted            # page against the real self-hosted server
```

## Layout

- `site/src/` page sources, concatenated by `site/build.py` in filename order into one script. `01-runtime.js` is the only place that knows whether the host is Claude or the self-hosted server.
- `pipeline/scan-prompt.md` the scan instructions. `{{#claude}}...{{/claude}}` and `{{#agent}}...{{/agent}}` blocks select what each target sees; the Claude rendering must stay byte-identical unless you mean to change it. Render with `python pipeline/render_prompt.py --target claude|codex|agent`.
- `pipeline/radar/` tested helpers (OpenAlex mapping, de-duplication, scoring, the store client). `pipeline/radar_cli.py` is the shell interface to them; `pipeline/run_scan.py` and `pipeline/schedulers.py` run and schedule a scan.
- `infra/app/` the self-hosted server (`server.js`, `store/` with JSON-file and Postgres drivers, `runtime.js` served to the page).
- `tests/` pytest, `node --test` and Playwright smoke tests.

## Rules

- Never commit `.env`, `infra/.env`, `config/site.json`, `data/*.json`, `data/selfhost/` or any API key. The OpenAlex key lives only in the site's private settings; the scan reaches it through `radar_cli.py openalex get`.
- Keep the two scan renderings in step: a change to the method goes in the shared text, a change to how a tool is called goes inside the matching block.
- Documents are addressed by the same paths on both backends (`papers/<id>`, `meta/topic`, `radars/<id>/...`); a new document type needs both.
- Standard library only in `pipeline/`; no build-time JS dependencies in `site/`.
