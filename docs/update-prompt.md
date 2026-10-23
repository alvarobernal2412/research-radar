# Update prompt

One prompt that brings an existing deployment up to date with the repo: pull the latest code, rebuild, republish the artifact in place and, if the scan instructions changed, update the scheduled task. Paste it into Claude Code from your clone.

```text
Update my Research Radar deployment to the latest code in the repo. Do not
change my data.

Before you do anything else, ask me with the AskUserQuestion tool (or in plain
text if it is not available):
1. Which folder holds my clone: the current directory (Recommended) / Other.
2. If the scan instructions changed, should you update my scheduled task
   automatically (Recommended), show me the diff first, or leave the task alone?

Steps:
1. Go to the clone. Run git status. If there are uncommitted changes, stop and
   show them to me. Check that config/site.json exists and has an artifactUrl;
   if not, this clone was never installed: point me to the install prompt in
   README.md and stop.
2. git fetch, then git pull --ff-only. Never merge, rebase or force anything
   without asking me. Let OLD be config/site.json's lastPublishedCommit (or, if
   it is missing, the commit I was on before pulling) and NEW be HEAD. If
   OLD and NEW are the same, tell me everything is up to date and stop.
3. Summarise git log --oneline OLD..NEW and git diff --stat OLD..NEW in plain
   language, grouped as: page (site/), scan instructions
   (pipeline/scan-prompt.md, pipeline/render_prompt.py), data model
   (pipeline/schema/), capabilities (site/capabilities.json), local mirror
   (infra/), docs and tests.
4. Run python -m pytest and python site/build.py --check. Stop and show me the
   output if either fails.
5. Publish the page in place: read the live artifact at artifactUrl first, then
   publish dist/radar.html to that same URL. Pass capabilities only if
   site/capabilities.json changed between OLD and NEW. The data lives in the
   artifact's database, so it is kept.
6. If pipeline/scan-prompt.md or pipeline/render_prompt.py changed: run
   python pipeline/render_prompt.py, compare it with my scheduled task's
   current prompt, and update the task according to my answer to question 2.
   Keep its schedule and triggerId, and keep any local-mirror step 9 that was
   appended to it earlier. If config/site.json lists several radars, do this
   for each one with python pipeline/render_prompt.py --radar <id> and that
   radar's own task. Never move two radars' tasks onto the same day.
7. If infra/ changed and the local mirror stack exists: run
   docker compose up -d --build inside infra/. Never use down -v.
8. If pipeline/schema/ changed, tell me what changed and whether stored
   documents need a migration. Do not write to the database yourself unless a
   commit message or docs say a migration is required, and then ask me first.
9. Verify: run the smoke test if node and a browser are available, otherwise
   open the artifact and check that it loads without errors. Report anything
   that failed.
10. Write NEW into config/site.json as lastPublishedCommit and report what was
    updated and what I still have to do myself.

Rules:
- Never commit, force-push or delete data. Never touch .env, infra/.env or any
  API key.
- If a step fails, stop and tell me; do not work around it silently.
```

## How it knows what changed

The install and update prompts record the commit you last published in `config/site.json` as `lastPublishedCommit` (the file is git-ignored). The update prompt compares it with `HEAD`, so "what changed" is exact even if you pulled earlier without republishing. If the field is missing (an older install), it falls back to the commit you were on before the pull.

## What it does not do

- It never rewrites your data. Papers, venues, topic and settings stay in the artifact's database.
- It does not commit or push anything.
- It updates the scheduled task's prompt only when the scan instructions changed, and keeps its schedule and `triggerId`.
- Schema changes are reported, not applied. A migration, if one is ever needed, is described in the commit that introduces it.
