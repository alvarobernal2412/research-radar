# Setting up a radar for another topic

You need a Claude account with artifacts and scheduled tasks. For browser sources and Run now, you also need the Claude desktop app with Claude in Chrome. Each step below is something you ask Claude to do. The prompts are examples.

## 1. Build the page

```bash
cp config/site.example.json config/site.json   # set title, siteName, tagline, scheduleText
python site/build.py --check
```

## 2. Publish it as a new artifact

> Publish `dist/radar.html` as a new artifact. Declare the capabilities in `site/capabilities.json`.

Put the artifact URL Claude returns into `config/site.json` as `artifactUrl`.

## 3. Create the scheduled scan

```bash
python pipeline/render_prompt.py > /tmp/scan-prompt.txt
```

> Create a scheduled task named "<site> weekly scan" that runs every Sunday at 09:49 in my time zone. Use the prompt in /tmp/scan-prompt.txt, and require my computer so it can use Chrome.

Put the task id (`trig_…`) into `config/site.json` as `triggerId`.

## 4. Write the site config into the database

> In the artifact's database, set `meta/config` to `{siteName, tagline, triggerId, scheduleText, lookbackYears, minAffinity}` from config/site.json.

The **Run now** button needs `triggerId`. Without it, requests wait for the schedule.

## 5. Define the topic, on the site

Open **Topic & scans** and do one of these:
- **Derive from papers:** drop 3-10 PDFs that define the topic, or paste their abstracts. Claude proposes themes and keywords; edit them, then save. If you only have DOIs, use "Let the next scan derive it".
- **Edit topic:** write the description and themes yourself (`name | weight | keywords`).

Add your name as it appears on papers so the network marks you.

## 6. Add an OpenAlex key and pick sources

Still on **Topic & scans**, paste your OpenAlex key. It's stored privately for your account. Turn sources on or off; Scopus and Google Scholar start off because they block automated access.

## 7. Run the first scan

Choose "Start over: search the whole lookback period again" and press **Run now**, or wait for the schedule.

## Changing topic later

Saving a changed topic raises its revision, and every paper scored against the old one is marked **Rescore due**. Then choose one of these:
- **Rescore**: keep the papers and score them again against the new topic.
- **Remove papers**: delete the unstarred ones, those below an affinity threshold, the partial ones, or all of them. You can also clear the venues for a completely new field.
- **Start over**: search the whole lookback period again.

Download the data first if you may want it back.
