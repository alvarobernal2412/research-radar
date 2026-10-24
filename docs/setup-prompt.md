# Setup prompt

One prompt that takes a fresh machine from nothing to a configured radar: clone, build, publish, schedule. Paste it into Claude Code (the desktop app, with Claude in Chrome if you want the browser sources). The agent first asks you for the folder, site name, schedule, your name and a few options as multiple-choice questions (with free text under "Other"), so there is nothing to fill in.

```text
I want to set up Research Radar for my own research topic. Clone the repo and
configure everything, then tell me what is left for me to do by hand.

Repo: https://github.com/alvarobernal2412/research-radar

Before you do anything else, ask me for the values below. Use the
AskUserQuestion tool (multiple-choice with an "Other" free-text option) in two
calls, because it takes at most 4 questions each. If that tool is not
available, ask the same questions in plain text in one message. Mark the
suggested option "(Recommended)" and wait for my answers.

Call 1:
1. Clone folder: ~/code/research-radar (Recommended) / the current directory /
   Other.
2. Scan schedule: Sundays 09:00 (Recommended) / Mondays 09:00 / daily 07:00 /
   Other. Also ask my time zone if you cannot read it from this machine.
3. Look-back window in years: 3 (Recommended) / 2 / 5 / Other.
4. Minimum affinity, 0-100: 35 (Recommended) / 50 / 20 / Other.

Call 2:
5. Local mirror (docker compose in infra/): No (Recommended) / Yes.
6. Site name and a short description (stored as "tagline") for my topic: offer one or two suggestions
   (for example "Process Radar" / "your topic in a few words") and let me type
   my own under Other.
7. My name exactly as it appears on papers, so the network marks me: use my
   git user.name (Recommended, if set) / skip, I will add it on the site /
   Other, to type it.

Steps:
1. git clone the repo into the folder I gave you, then read README.md and
   docs/new-topic.md.
2. Check python 3.11+ is installed (node and docker are optional). Install
   nothing system-wide without asking me. Run: python -m pytest
3. Copy config/site.example.json to config/site.json and fill in title,
   siteName, tagline, scheduleText, timezone, lookbackYears and minAffinity
   from my answers, and a "radars" list with one entry for this radar:
   {id: "main", name: siteName, tagline, root: true, weekday, time} (Monday is
   0, Sunday is 6). config/site.json is git-ignored: never commit it.
4. Build: python site/build.py --check
5. Publish dist/radar.html as a NEW artifact with the capabilities in
   site/capabilities.json. Put the returned URL into config/site.json as
   artifactUrl, and git rev-parse HEAD as lastPublishedCommit. If
   config/site.json already has a real artifactUrl (this is a re-run), read
   that artifact first and update it in place instead of creating a second one.
6. Run python pipeline/render_prompt.py and create a scheduled task named
   "<site name> weekly scan" at my schedule, using that output as its prompt.
   It must run on my computer (the Chrome sources need it). Put the task id
   into config/site.json as triggerId.
7. Write meta/config to the artifact's database with {siteName, tagline,
   triggerId, scheduleText, lookbackYears, minAffinity} from config/site.json,
   and the registry entry radars/main with {name: siteName, tagline, root: true,
   weekday, time, timezone, scheduleText, triggerId, createdAt: today}.
8. If I asked for the local mirror, set it up (docker compose in infra/) and
   append infra/scan-mirror-step.md to the task prompt as step 9, as the
   README describes.
9. Finish with a short checklist of what I still have to do myself. It must
   include: set the topic on the site (Topic & scans) and add my name there,
   enter my OpenAlex key there, then press "Run now" for the first scan (the
   radar is empty until a scan has run), and note that the artifact is private
   until I share it from its Share menu.

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

To track another topic in the same artifact later, use the [add-radar prompt](add-radar-prompt.md). Step-by-step version of the same flow: [new-topic.md](new-topic.md). To bring an existing install up to date later, use the [update prompt](update-prompt.md).
