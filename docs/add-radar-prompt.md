# Add-radar prompt

One prompt that adds another radar (another research topic) to a Research Radar you already installed, and schedules its weekly scan. Every radar has its own topic, papers, venues and scan log, and the radars share one artifact: the menu bar has a dropdown to switch between them.

The site's **New radar…** entry in that dropdown fills in the name, tagline and topic for you and gives you this prompt. You can also paste it by hand after editing the three values at the top.

Each radar scans on its own weekday, chosen to be as far as possible from the weekdays of the others, so no source (OpenAlex, DBLP, IEEE, and so on) is queried twice in one day from your IP address. A scan also refuses to start while another radar's scan is running.

```text
Add a new radar to my Research Radar and schedule its weekly scan. Do not
change the data of my other radars.

New radar
- Name: {{RADAR_NAME}}
- Id: {{RADAR_ID}}
- Tagline: {{TAGLINE}}
- Topic: {{TOPIC}}
Radars that already exist: {{EXISTING}}

Before you do anything else, use the AskUserQuestion tool (multiple-choice with
an "Other" free-text option; plain text if it is not available) to ask:
1. Look-back window in years: 3 (Recommended) / 2 / 5 / Other.
2. Minimum affinity, 0-100: 35 (Recommended) / 50 / 20 / Other.
3. Time of day for the scan: 09:00 (Recommended) / 07:00 / 21:00 / Other. Also
   ask my time zone if config/site.json has none and you cannot read it from
   this machine.
Then work out the weekday yourself (step 4) and tell me which one you picked.

Steps:
1. Go to my Research Radar clone (the folder that holds config/site.json; ask
   me if you cannot find it). Run git status; if there are uncommitted changes,
   stop and show them. Check that config/site.json has an artifactUrl, and that
   pipeline/radar/schedule.py exists. If it does not, this clone predates
   multiple radars: point me to docs/update-prompt.md and stop.
2. Check the id: it must match [a-z0-9][a-z0-9-]{1,29}, must not be "main" and
   must not already exist in the "radars" collection of the artifact's
   database. If it clashes, ask me for another name.
3. Make sure the first radar is registered. Read the document radars/main with
   ArtifactData. If it is missing, create it from the root document meta/config:
   {name: siteName, tagline, root: true, weekday, time, timezone, scheduleText,
   triggerId, createdAt: today}. Take weekday and time from the "radars" entry
   "main" in config/site.json if there is one, otherwise from scheduleText
   (Sundays at 09:00 means weekday 6, time "09:00"; Monday is 0, Sunday is 6).
   Add the same entry to "radars" in config/site.json.
4. Pick the weekday. List the documents of the "radars" collection, collect
   their weekday and time, and run, from the clone:
   python -c "import sys; sys.path.insert(0,'pipeline'); from radar.schedule import assign_slot; print(assign_slot([(WEEKDAY, 'HH:MM'), ...]))"
   with the existing slots. Use the weekday it returns with the time I chose.
   If the answer's time differs from mine (more than seven radars share days),
   use the time it returns. Format the text with schedule_text and the cron
   expression with cron_expression from the same module.
5. Write to the artifact's database with ArtifactData (never write under
   data/users):
   - radars/{{RADAR_ID}}: {name, tagline, root: false, weekday, time, timezone,
     scheduleText, createdAt: today, order: the number of radars + 1}
   - radars/{{RADAR_ID}}/meta/config: {siteName: name, tagline, scheduleText,
     lookbackYears, minAffinity}
   Do not write a topic: I set it on the site.
6. Add the radar to "radars" in config/site.json (id, name, tagline, weekday,
   time, root: false). config/site.json is git-ignored: never commit it.
7. Run: python pipeline/render_prompt.py --radar {{RADAR_ID}}
   and create a scheduled task named "{{RADAR_NAME}} weekly scan" with the cron
   expression from step 4 and that output as its prompt. It must run on my
   computer (the Chrome sources need it). Never put the new radar's task on the
   same day and time as another radar's task. If my first radar's task has the
   local-mirror step 9 appended, do not copy it to this one.
8. Write the task id as triggerId into radars/{{RADAR_ID}} and
   radars/{{RADAR_ID}}/meta/config, and into config/site.json.
9. Finish with a short checklist: the weekday and time you picked and why;
   open the site, choose "{{RADAR_NAME}}" in the menu, and set its topic on
   Topic & scans (derive it from 3-10 seed papers or write it); then press
   "Run now" for the first scan, because the radar is empty until a scan has
   run; the task has to be approved from a conversation linked to my computer.
   My OpenAlex key and my name are shared with the other radars, so there is
   nothing to enter again.

Rules:
- Never commit .env, infra/.env, config/site.json or any API key.
- Never write to another radar's documents, except radars/main in step 3.
- Do not run git commit yourself: show me the proposed message and wait.
```

## What it creates

- `radars/<id>` in the artifact's database: the radar's registry entry (name, weekday, time, task id).
- `radars/<id>/meta/config`: its own settings. Papers, conferences, journals, topic, scan log and control requests live under `radars/<id>/` as well.
- A scheduled task "`<name>` weekly scan" whose prompt comes from `python pipeline/render_prompt.py --radar <id>`.
- An entry in `config/site.json` (`radars`), which is git-ignored.

Your first radar stays where it always was, at the root of the database, so it keeps its data, its links and its scheduled task. It shows up in the dropdown as the radar `main`.

## Changing or removing a radar

- **Change its schedule:** edit the scheduled task in Claude Code, then update `weekday`, `time` and `scheduleText` in `radars/<id>`. Pick a weekday no other radar uses.
- **Hide it:** on its Topic & scans page, press "Archive radar". The data is kept, and the radar moves to the Archived group in the dropdown. The scheduled task keeps running until you delete it in Claude Code.
- **Delete it for good:** delete its scheduled task in Claude Code, then delete the documents under `radars/<id>/` from the artifact's database.
