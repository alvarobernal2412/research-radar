# Setup prompt

One prompt that takes a fresh machine from nothing to a configured radar: clone, build, publish, schedule. Paste it into Claude Code (the desktop app, with Claude in Chrome if you want the browser sources) and fill in the `<...>` placeholders.

```text
I want to set up Research Radar for my own research topic. Clone the repo and
configure everything, then tell me what is left for me to do by hand.

Repo: <REPO_URL>
Clone into: <FOLDER, e.g. ~/code/research-radar>

My details (ask me for anything still marked <ASK> before you start):
- Site name and tagline: <ASK: e.g. "Process Radar" / "your topic in a few words">
- Scan schedule: <ASK: e.g. Sundays 09:00 in my time zone>
- My name as it appears on papers: <ASK>
- Look-back years 3 and minimum affinity 35 (change only if I say so)

Steps:
1. git clone the repo, then read README.md and docs/new-topic.md.
2. Check python 3.11+ is installed (node and docker are optional). Install
   nothing system-wide without asking me. Run: python -m pytest
3. Copy config/site.example.json to config/site.json and fill in title,
   siteName, tagline, scheduleText and timezone. config/site.json is
   git-ignored: never commit it.
4. Build: python site/build.py --check
5. Publish dist/radar.html as a NEW artifact with the capabilities in
   site/capabilities.json. Put the returned URL into config/site.json as
   artifactUrl. If config/site.json already has a real artifactUrl (this is a
   re-run), read that artifact first and update it in place instead of
   creating a second one.
6. Run python pipeline/render_prompt.py and create a scheduled task named
   "<siteName> weekly scan" at my schedule, using that output as its prompt.
   It must run on my computer (the Chrome sources need it). Put the task id
   into config/site.json as triggerId.
7. Write meta/config to the artifact's database with {siteName, tagline,
   triggerId, scheduleText, lookbackYears, minAffinity} from config/site.json.
8. Ask me whether I want the local mirror (docker compose in infra/). If yes,
   set it up and append infra/scan-mirror-step.md to the task prompt as the
   README describes.
9. Finish with a short checklist of what I still have to do myself. It must
   include: set the topic on the site (Topic & scans), enter my OpenAlex key
   there, then press "Run now" for the first scan (the radar is empty until a
   scan has run), and note that the artifact is private until I share it from
   its Share menu.

Rules:
- Never commit .env, infra/.env, config/site.json or any API key.
- Do not ask me to paste my OpenAlex key into the chat. Tell me to enter it on
  the site (Topic & scans, then Sources).
- Do not run git commit yourself: show me the proposed message and wait.
```

## What stays manual

- **Your OpenAlex key.** Enter it on the site (Topic & scans, then Sources). It is stored in your private settings and never touches the repo or the chat.
- **Your topic.** Open Topic & scans and either derive it from 3-10 seed papers or write it yourself. That step uses your own Claude session, so it can't be done from the terminal.
- **The first scan.** The radar is empty until a scan has run. After setting the topic and entering your key, press "Run now" on Topic & scans, or wait for the first scheduled run.
- **Sharing.** The artifact is private to you until you share it from its Share menu.
- **Approving the scheduled task.** A task that runs on your computer must be approved from a conversation linked to that computer.

## Re-running it

The prompt is safe to run again in an existing clone: if `config/site.json` already holds a real `artifactUrl`, the agent updates that artifact instead of creating a second one.

## Requirements

- A Claude account with artifacts and scheduled tasks.
- The Claude desktop app with Claude in Chrome, if you want DBLP, IEEE, SpringerLink, ACM, arXiv, Scholar or Scopus. OpenAlex needs neither.
- Python 3.11+. Node and Docker are optional (smoke test and the local mirror).

Step-by-step version of the same flow: [new-topic.md](new-topic.md).
