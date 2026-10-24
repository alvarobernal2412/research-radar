# Self-hosted: run a radar without Claude

The same page, the same scan method and the same data model, with a small local server in place of the Claude artifact and any agent CLI that has a shell (Codex is the documented one) in place of the Claude scheduled task.

**Status: experimental.** The server, the store CLI and the prompt rendering are covered by automated tests. Running an actual Codex scan end to end has not been verified; [codex-guide.md](codex-guide.md) is the checklist for whoever tries it.

## What changes

| | Claude | Self-hosted |
|---|---|---|
| Page | published as an artifact | served by `infra/app/server.js` at `http://127.0.0.1:8787` |
| Database | the artifact's database | JSON files in `data/selfhost/` (or Postgres) |
| Who can use it | whoever you share the artifact with | you, on this machine (single user, always an editor) |
| Scan | Claude scheduled task, prompt target `claude` | `python pipeline/run_scan.py`, prompt target `codex` or `agent` |
| Starting a scan | "Run now" calls Claude Code Remote | "Run now" runs `SCAN_COMMAND` |
| Topic proposal | the viewer's Claude session | `ASK_COMMAND` (any command that answers a prompt on stdin) |
| Browser sources | Claude in Chrome with your sign-ins | not available; OpenAlex, DBLP and arXiv over plain HTTP |

The two systems do not share data. Pick one backend per radar; to move a radar over, export it from the site (Topic & scans, then Export) and `POST` the file to `/api/import`.

## Run it

You need Node 20+, Python 3.9+, and the agent CLI you want to scan with.

```bash
python site/build.py                              # dist/radar.html
cp config/site.example.json config/site.json      # then edit it, see below
node infra/app/server.js                          # http://127.0.0.1:8787
python pipeline/radar_cli.py init                 # first-run documents from config/site.json
```

In `config/site.json` set `"target": "codex"` (or `"agent"`), `siteName`, `tagline`, the `radars` list with each radar's weekday and time, and optionally `radarUrl`, `agentCommand` and `scanTimeoutMinutes`. The file is git-ignored.

Open the page, go to **Topic & scans**, write the topic (or choose "Let the next scan derive it" and add seed DOIs), and enter your OpenAlex key under **Sources**. The key is stored at `data/users/local/settings`; the scan reads it through `radar_cli.py openalex get`, so the agent never sees it.

Then start the first scan with **Run now**, or by hand:

```bash
python pipeline/run_scan.py --radar main --dry-run   # show the command, change nothing
python pipeline/run_scan.py --radar main
```

### Server settings (environment variables)

| Variable | Default | Meaning |
|---|---|---|
| `PORT`, `HOST` | `8787`, `127.0.0.1` | where it listens |
| `DATA_DIR` | `data/selfhost` | JSON-file store, snapshots and scan logs |
| `DATABASE_URL`, `RADAR_STORE` | unset, `files` | set `DATABASE_URL` to use Postgres instead (this is what `infra/docker-compose.yml` does) |
| `PAGE_FILE` | `dist/radar.html` | the built page |
| `ASK_COMMAND` | unset | enables **Propose topic**. The prompt arrives on stdin; the answer must contain a JSON object. Example: `codex exec --sandbox read-only --ephemeral -` |
| `SCAN_COMMAND` | unset | enables **Run now**. Run with `--radar <id>`; the site's request text is in `RADAR_REQUEST_TEXT`. Example: `python pipeline/run_scan.py` |
| `ALLOWED_HOSTS` | `127.0.0.1,localhost,[::1]` | hostnames the server answers to |

```bash
ASK_COMMAND='codex exec --sandbox read-only --ephemeral -' \
SCAN_COMMAND='python pipeline/run_scan.py' \
node infra/app/server.js
```

```powershell
$env:ASK_COMMAND = 'codex exec --sandbox read-only --ephemeral -'
$env:SCAN_COMMAND = 'python pipeline/run_scan.py'
node infra/app/server.js
```

Without `ASK_COMMAND` or `SCAN_COMMAND` the page shows those two controls as unavailable and everything else works.

## Schedule it

Nothing is installed for you. These print entries to paste or run:

```bash
python pipeline/schedulers.py --kind cron               # crontab lines, one per radar
python pipeline/schedulers.py --kind schtasks           # Windows Task Scheduler commands
python pipeline/schedulers.py --kind codex-automation   # text for a Codex app automation
```

Each radar keeps the weekday and time assigned in `config/site.json`, so two radars never scan on the same day. A scheduled scan needs the server running, and the machine awake.

## Security

The server has no login. It is meant for one person on one machine:

- it binds to `127.0.0.1`;
- it refuses requests whose `Host` isn't in `ALLOWED_HOSTS` and requests from another origin, so a web page you visit can't write to it or start commands;
- `ASK_COMMAND` and `SCAN_COMMAND` come from the environment. A request only supplies stdin text, a validated radar id and the request text (passed in an environment variable, never on a command line).

To reach it from other machines, put an authenticating reverse proxy in front and add its hostname to `ALLOWED_HOSTS`. Do not expose the port directly. Your OpenAlex key sits in plain files under `DATA_DIR`; protect that folder like any credential store.

## Docker and Postgres

`infra/docker-compose.yml` still works and now uses the same server with Postgres (`infra/README.md`). The container doesn't contain an agent CLI, so for **Run now** and **Propose topic** run the server on the host instead, with `DATABASE_URL` pointing at the Postgres port if you want that store.

## Tests

```bash
python -m pytest                                  # prompt targets, store client, runner, schedulers, server
node --test tests/server/server.test.js           # the server with the file store
TEST_STORE=postgres DATABASE_URL=postgres://... node --test tests/server/server.test.js
npm run smoke:selfhosted                          # the built page in a browser against a real server
```
