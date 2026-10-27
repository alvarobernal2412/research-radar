// End-to-end smoke test of the built page against an in-memory mock of the
// artifact runtime (db, user, sample, mcp, downloads).
//
//   npm i --no-save playwright-core@1.47.2 d3@7.8.5
//   node tests/smoke/smoke.js [path/to/papers.json] [--shots dir]
//
// Uses tests/fixtures/papers.sample.json when no data file is given.
// Set CHROMIUM=/path/to/chrome if Playwright can't find a browser.
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");

const repo = path.resolve(__dirname, "../..");
const args = process.argv.slice(2);
const shotsIdx = args.indexOf("--shots");
const shots = shotsIdx >= 0 ? args.splice(shotsIdx, 2)[1] : null;
const dataFile = args[0] || path.join(repo, "tests/fixtures/papers.sample.json");
const page = path.join(repo, "dist/radar.html");
const d3Path = path.join(path.dirname(path.dirname(require.resolve("d3"))), "dist/d3.min.js");

function mockRuntime(seed) {
  // Runs inside the page before any script.
  const store = new Map(); // path -> data
  const listeners = []; // {kind:'doc'|'col', path, cb}
  const put = (p, d) => { if (d === undefined) store.delete(p); else store.set(p, JSON.parse(JSON.stringify(d))); };
  for (const [p, d] of Object.entries(seed)) put(p, d);
  const colDocs = (c) => [...store.entries()].filter(([p]) => p.startsWith(c + "/") && p.split("/").length === c.split("/").length + 1)
    .map(([p, d]) => ({ id: p.split("/").pop(), exists: true, data: () => d }));
  const notify = () => setTimeout(() => {
    for (const l of listeners) {
      if (l.kind === "doc") { const d = store.get(l.path); l.cb({ id: l.path.split("/").pop(), exists: !!d, data: () => d }); }
      else { const docs = colDocs(l.path); l.cb({ docs, size: docs.length, empty: !docs.length }); }
    }
  }, 10);
  const doc = (p) => ({
    id: p.split("/").pop(), path: p,
    get: async () => ({ exists: store.has(p), data: () => store.get(p) }),
    set: async (d) => { window.__writes.push(["set", p]); put(p, d); notify(); },
    update: async (d) => { put(p, Object.assign({}, store.get(p), d)); notify(); },
    delete: async () => { window.__writes.push(["delete", p]); put(p, undefined); notify(); },
    onSnapshot: (cb) => { listeners.push({ kind: "doc", path: p, cb }); notify(); return () => {}; },
  });
  const col = (c) => {
    const q = { limit: () => q, where: () => q, orderBy: () => q,
      onSnapshot: (cb) => { listeners.push({ kind: "col", path: c, cb }); notify(); return () => {}; },
      get: async () => { const docs = colDocs(c); return { docs, size: docs.length, empty: !docs.length }; },
      doc: (id) => doc(c + "/" + id) };
    return q;
  };
  window.__writes = []; window.__fired = []; window.__saved = []; window.__savedData = [];
  const sample = async () => ({ text: "", truncated: false });
  sample.json = async (prompt) => { window.__prompt = prompt; return {
    description: "Test topic derived from seed papers.",
    themes: [{ name: "Provenance models", weight: 1, keywords: ["provenance model", "PROV"] }, { name: "Exploratory process mining", weight: 0.9, keywords: ["process exploration"] }],
    exclude: ["supply-chain provenance"], seeds: [{ title: "Seed paper", doi: null }] }; };
  const caps = {
    db: { doc, collection: col },
    user: { canEdit: async () => true, id: async () => "u_test", isOwner: () => true },
    sample,
    mcp: { callTool: async (s, t, i) => { window.__fired.push([s, t, i]); return { content: [], payload: {} }; } },
    downloads: { save: async (r) => { window.__saved.push(r.filename); window.__savedData.push(r.data); return { status: "saved" }; } },
  };
  window.claude = { use: async (n) => caps[n] || null };
}

(async () => {
  const papers = JSON.parse(fs.readFileSync(dataFile, "utf8"));
  const seed = {
    "meta/topic": { description: "Old topic", themes: [{ name: "Provenance models", weight: 1, keywords: ["provenance"] }], revision: 1, selfName: "Alex Example" },
    "meta/config": { siteName: "Test Radar", tagline: "smoke test", triggerId: "trig_test", scheduleText: "Sundays at 09:49" },
    "meta/run": { lastRunAt: "2026-10-13T14:00:00Z", status: "partial", counts: { newPapers: 3 },
      history: [{ date: "2026-10-13", status: "ok", accessMode: "api", newPapers: 9, note: "First scan" }, { date: "2026-10-14", status: "partial", accessMode: "api", newPapers: 1, note: "One source timed out" }] },
  };
  seed["conferences/exconf"] = { name: "Example Conference", acronym: "EXCONF", coreRank: "A", topicScore: 80,
    aiPolicy: { stance: "disclosure", summary: "Authors must disclose AI tools.", rules: ["No AI-written reviews"], url: "https://example.org/ai", checkedAt: "2026-10-01" },
    formatGuidelines: { template: "ACM sigconf", templateUrl: "https://example.org/tpl", pageLimit: "10 pages", anonymization: "double-blind", referenceStyle: "numeric", rules: ["PDF only"], url: "https://example.org/fmt", checkedAt: "2026-10-01" } };
  seed["journals/exjournal"] = { name: "Example Journal", publisher: "Example Press", impactFactor: 3.2 };
  seed["radars/main"] = { name: "Test Radar", root: true, weekday: 6, time: "09:00" };
  seed["radars/nlp"] = { name: "NLP radar", root: false, weekday: 2, time: "09:00", scheduleText: "Wednesdays at 09:00", triggerId: "trig_nlp" };
  seed["radars/nlp/meta/config"] = { siteName: "NLP radar", tagline: "language models", triggerId: "trig_nlp", scheduleText: "Wednesdays at 09:00" };
  seed["radars/nlp/meta/topic"] = { description: "NLP", themes: [{ name: "Language models", weight: 1, keywords: ["llm"] }], revision: 1 };
  seed["radars/nlp/conferences/nlpconf"] = { name: "NLP Conference", acronym: "NLPC", coreRank: "A", topicScore: 70 };
  seed["radars/nlp/papers/n1"] = { title: "NLP only paper", authors: [{ name: "Nora Lang" }], year: 2026, venueId: "nlpconf", venueName: "NLP Conference", venueKind: "conference", affinity: 80, foundIn: ["OpenAlex"], discoveredAt: "2026-10-10", scoredTopicRevision: 1 };
  papers.forEach((p, i) => { seed["papers/" + (p.id || "p" + i)] = p; });
  const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const pg = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  pg.on("pageerror", (e) => errors.push(e.message));
  await pg.route("**/d3.min.js", (r) => r.fulfill({ body: fs.readFileSync(d3Path, "utf8"), contentType: "application/javascript" }));
  await pg.route(/fonts\.(googleapis|gstatic)/, (r) => r.fulfill({ body: "", contentType: "text/css" }));
  await pg.addInitScript(mockRuntime, seed);
  const results = [];
  const check = (name, ok, detail = "") => { results.push([ok ? "PASS" : "FAIL", name, detail]); };
  const shot = async (n) => { if (shots) { fs.mkdirSync(shots, { recursive: true }); await pg.screenshot({ path: path.join(shots, n + ".png"), fullPage: true }); } };

  await pg.goto("file://" + page + "#contributions");
  await pg.waitForTimeout(800);
  check("brand comes from meta/config", (await pg.textContent(".brand b")) === "Test Radar");
  const rc = await pg.textContent("#rescount");
  check("contributions list renders", /of \d+ papers/.test(rc), rc);

  // BibTeX selection: per-row checkbox, select/deselect all act on the filtered list.
  const rows = await pg.$$("article.prow input[data-sel]");
  check("every paper row has a selection checkbox", rows.length === papers.length, `${rows.length}/${papers.length}`);
  check("export is disabled with nothing selected", await pg.isDisabled('[data-selact="export"]'));
  await pg.click('[data-selact="all"]');
  check("select all selects every shown paper", (await pg.textContent('[data-selact="export"]')).includes(`(${papers.length})`));
  await pg.click('[data-selact="none"]');
  check("deselect all clears them", (await pg.textContent('[data-selact="export"]')).includes("(0)"));
  await pg.evaluate(() => { const r = document.getElementById("flt-aff"); r.value = "90"; r.dispatchEvent(new Event("input", { bubbles: true })); });
  await pg.waitForTimeout(150);
  const high = papers.filter((p) => (p.affinity || 0) >= 90).length;
  await pg.click('[data-selact="all"]');
  check("select all respects the active filters", (await pg.textContent('[data-selact="export"]')).includes(`(${high})`) && high < papers.length, `${high} of ${papers.length}`);
  await pg.evaluate(() => { const r = document.getElementById("flt-aff"); r.value = "0"; r.dispatchEvent(new Event("input", { bubbles: true })); });
  await pg.waitForTimeout(150);
  await pg.click('[data-selact="export"]');
  await pg.waitForTimeout(200);
  const bib = await pg.evaluate(() => ({ f: window.__saved.filter((x) => x.endsWith(".bib")), d: window.__savedData.filter((x) => /^% Exported/.test(x)) }));
  check("BibTeX file is downloaded", bib.f.length === 1 && bib.d.length === 1, JSON.stringify(bib.f));
  const entries = (bib.d[0] || "").match(/^@\w+\{/gm) || [];
  check("BibTeX has one entry per selected paper", entries.length === high, `${entries.length}/${high}`);
  check("BibTeX keys are unique", new Set((bib.d[0] || "").match(/^@\w+\{([^,]+),/gm)).size === entries.length);
  check("BibTeX entries have title and author", /title = \{\{/.test(bib.d[0] || "") && /author = \{/.test(bib.d[0] || ""));
  await pg.click('[data-selact="none"]');
  await pg.click('[data-selact="all"]');
  await pg.click('[data-selact="none"]');
  await pg.selectOption("#flt-comp", "incomplete");
  await pg.waitForTimeout(200);
  const inc = await pg.$$eval(".prow", (r) => r.length);
  check("completeness filter narrows the list", inc > 0 && inc <= papers.length, `${inc} incomplete`);
  await pg.selectOption("#flt-comp", "all");

  // multi-select filters
  await pg.click("#flt-kind summary");
  await pg.check('#flt-kind input[value="conference"]');
  await pg.check('#flt-kind input[value="journal"]');
  await pg.waitForTimeout(200);
  const nKinds = papers.filter((p) => ["conference", "journal"].includes(p.venueKind)).length;
  check("ticking two venue kinds shows papers of either", (await pg.$$eval(".prow", (r) => r.length)) === nKinds && nKinds < papers.length, String(nKinds));
  check("the dropdown summarises the selection", (await pg.textContent("#flt-kind summary")) === "2 selected");
  await pg.click("#flt-theme summary");
  await pg.check('#flt-theme input[value="User studies"]');
  await pg.waitForTimeout(200);
  const nBoth = papers.filter((p) => ["conference", "journal"].includes(p.venueKind) && (p.themes || []).includes("User studies")).length;
  check("different filters combine with AND", (await pg.$$eval(".prow", (r) => r.length)) === nBoth, String(nBoth));
  await shot("filters-open");
  await pg.click("#flt-reset");
  await pg.waitForTimeout(200);
  check("Clear filters resets the multi-selects", (await pg.$$eval(".prow", (r) => r.length)) === papers.length && (await pg.textContent("#flt-kind summary")) === "All kinds");

  // hide mark
  await pg.click('.prow [data-mark="hide"]');
  await pg.waitForTimeout(200);
  check("hiding a paper removes it from the list", (await pg.$$eval(".prow", (r) => r.length)) === papers.length - 1);
  check("hidden papers are counted", (await pg.textContent("#flt-hid-n")) === "1" && (await pg.textContent("#rescount")).includes("1 hidden"));
  check("the hide mark is stored with the viewer's marks", (await pg.evaluate(() => window.__writes)).some(([, p]) => p === "data/users/u_test/marks"));
  await pg.check("#flt-hid");
  await pg.waitForTimeout(200);
  check("Show hidden brings it back, marked Hidden", (await pg.$$eval(".prow", (r) => r.length)) === papers.length && (await pg.$$eval(".prow.hidden-p", (r) => r.length)) === 1);
  await pg.click('.prow.hidden-p [data-mark="hide"]');
  await pg.waitForTimeout(200);
  check("Unhide clears the mark", (await pg.$$eval(".prow.hidden-p", (r) => r.length)) === 0 && (await pg.textContent("#flt-hid-n")) === "0");
  await pg.click("#flt-reset");

  const target = papers.find((p) => p.fullTextRead !== true) || papers[0];
  await pg.goto("file://" + page + "#paper." + (target.id || "p0"));
  await pg.waitForTimeout(400);
  check("paper detail shows the completeness notice", !!(await pg.$("#comp-note")));
  check("unread paper says 'Unknown' for author-stated fields", (await pg.$$("p.unknown")).length >= 1);
  await shot("paper");
  await pg.click("[data-retry]");
  await pg.waitForTimeout(200);
  check("retry request is written to meta/control", (await pg.evaluate(() => window.__writes)).some(([, p]) => p === "meta/control"));

  await pg.goto("file://" + page + "#conf.exconf");
  await pg.waitForTimeout(500);
  await shot("conference-detail");
  const ct = await pg.textContent("#app");
  check("conference shows its AI policy", ct.includes("Allowed with disclosure") && ct.includes("No AI-written reviews"));
  check("conference shows its format guidelines", ct.includes("ACM sigconf") && ct.includes("double-blind") && ct.includes("10 pages"));
  const nConf = papers.filter((p) => p.venueId === "exconf").length;
  check("conference lists its papers grouped by edition", ct.includes("2026 edition") && ct.includes("2024 edition") && (await pg.$$('#app a[href^="#paper."]')).length === nConf, String(nConf));
  await pg.goto("file://" + page + "#journal.exjournal");
  await pg.waitForTimeout(500);
  const jt = await pg.textContent("#app");
  check("journal without guidelines says they are not collected yet", jt.includes("Not collected yet"));
  check("journal lists its papers by year", (await pg.$$('#app a[href^="#paper."]')).length === papers.filter((p) => p.venueId === "exjournal").length);

  await pg.goto("file://" + page + "#topic");
  await pg.waitForTimeout(500);
  await shot("topic");
  check("timeline has one entry per scan, newest first", (await pg.$$eval(".tl-item .tl-head b", (e) => e.map((x) => x.textContent))).length === 2 && (await pg.textContent(".tl-item")).includes("14 Oct"));
  await pg.$$eval("details.tl-list", (d) => d.forEach((x) => { x.open = true; }));
  const tl = await pg.$$eval('.tl-list a[href^="#paper."]', (a) => a.map((x) => x.getAttribute("href")));
  check("timeline links every stored paper to its detail view", tl.length === papers.length && tl.includes("#paper.p1"), String(tl.length));
  const firstItem = await pg.$$eval(".tl-item", (e) => e[0].querySelectorAll("li").length);
  check("each scan lists only the papers it found", firstItem === papers.filter((p) => p.discoveredAt === "2026-10-14").length, String(firstItem));
  await pg.click('.tl-list a[href="#paper.p1"]');
  await pg.waitForTimeout(300);
  check("a timeline link opens the paper", (await pg.evaluate(() => location.hash)) === "#paper.p1" && !!(await pg.$("#comp-note")));
  await pg.goto("file://" + page + "#topic");
  await pg.waitForTimeout(500);
  await pg.click('[data-tp="derive"]');
  await pg.fill("#tp-paste", "Exploratory process mining with provenance. We study how analysts branch and compare analyses.\n\n10.1234/example.1");
  await pg.click('[data-tp="propose"]');
  await pg.waitForTimeout(400);
  check("Claude proposal opens the editor", !!(await pg.$("#tp-themes")) && (await pg.inputValue("#tp-themes")).includes("Exploratory process mining"));
  await pg.click('[data-tp="save"]');
  await pg.waitForTimeout(400);
  check("saving a changed topic shows the change banner", !!(await pg.$("#tp-changed")));
  const rev = await pg.evaluate(() => window.__writes.filter(([, p]) => p === "meta/topic").length);
  check("topic saved", rev >= 1);

  await pg.check('input[name="tp-mode"][value="rescore"]');
  await pg.click('[data-tp="run-now"]');
  await pg.waitForTimeout(400);
  const fired = await pg.evaluate(() => window.__fired);
  check("Run now calls fire_trigger", fired.length === 1 && fired[0][1] === "fire_trigger" && fired[0][2].trigger_id === "trig_test", JSON.stringify(fired[0] || null));

  await pg.selectOption("#tp-rmscope", "below");
  const affs = papers.map((p) => p.affinity || 0).sort((a, b) => a - b);
  const thr = Math.min(100, affs[Math.min(2, affs.length - 1)] + 1); // removes the lowest few
  await pg.fill("#tp-rmthr", String(thr));
  await pg.click('[data-tp="rm-ask"]');
  await pg.waitForTimeout(100);
  const expect = papers.filter((p) => (p.affinity || 0) < thr).length;
  const cf = await pg.textContent(".confirm");
  check("removal asks for confirmation with the right count", cf.includes(`${expect} paper`), cf.slice(0, 60));
  await pg.click('[data-tp="rm-go"]');
  await pg.waitForTimeout(600);
  const dels = await pg.evaluate(() => window.__writes.filter(([k]) => k === "delete").length);
  check("removal deletes exactly the selected papers", dels === expect, `${dels}/${expect}`);

  await pg.fill("#tp-key", "TESTKEY123456");
  await pg.click('[data-tp="key-save"]');
  await pg.waitForTimeout(300);
  check("API key stored in the private settings doc", (await pg.evaluate(() => window.__writes)).some(([, p]) => p === "data/users/u_test/settings"));
  check("API key is masked after saving", (await pg.textContent("#tp-sources")).includes("••••••3456"));
  await pg.click('[data-tp="export"]');
  await pg.waitForTimeout(200);
  check("export offers a JSON download", (await pg.evaluate(() => window.__saved)).some((f) => f.endsWith(".json")));
  await shot("topic-after");

  // --- several radars ---
  await pg.goto("file://" + page + "#contributions");
  await pg.waitForTimeout(500);
  await pg.click("input[data-sel]");
  await pg.click("#radar-btn");
  await shot("radar-menu");
  const menu = await pg.textContent("#radar-menu");
  check("radar menu lists every radar and New radar", menu.includes("Test Radar") && menu.includes("NLP radar") && menu.includes("Wednesdays at 09:00") && menu.includes("New radar"));
  await pg.click('[data-radar="nlp"]');
  await pg.waitForTimeout(600);
  check("choosing a radar puts its id in the link", (await pg.evaluate(() => location.hash)) === "#nlp~contributions");
  const nlpList = await pg.textContent("#results");
  check("the other radar shows only its own papers", nlpList.includes("NLP only paper") && !nlpList.includes("Example Paper 1"), nlpList.slice(0, 80));
  check("brand shows the radar's own name", (await pg.textContent(".brand-btn")).includes("NLP radar"));
  check("tabs keep the radar in their links", (await pg.getAttribute('nav.tabs a[data-tab="conferences"]', "href")) === "#nlp~conferences");
  await pg.goto("file://" + page + "#nlp~conf.nlpconf");
  await pg.waitForTimeout(500);
  check("a venue link with a radar id opens that radar's venue", (await pg.textContent("#app")).includes("NLP Conference"));
  check("its paper links keep the radar", (await pg.getAttribute('#app a[href*="paper."]', "href")) === "#nlp~paper.n1");
  await pg.click("#radar-btn");
  await pg.click('[data-radar="main"]');
  await pg.waitForTimeout(600);
  check("switching from a venue page lands on that radar's venue list", (await pg.evaluate(() => location.hash)) === "#conferences" && (await pg.textContent("#app")).includes("EXCONF"));
  await pg.goto("file://" + page + "#contributions");
  await pg.waitForTimeout(500);
  check("the first radar shows its own papers again",(await pg.textContent("#results")).includes("Example Paper"));
  check("selection does not carry over between radars", (await pg.$$("input[data-sel]:checked")).length === 0);
  await pg.goto("file://" + page + "#nlp~topic");
  await pg.waitForTimeout(500);
  await pg.click('[data-tp="run-now"]');
  await pg.waitForTimeout(500);
  const firedNlp = await pg.evaluate(() => window.__fired);
  check("Run now starts the active radar's task", firedNlp.length > 0 && firedNlp[firedNlp.length - 1][2].trigger_id === "trig_nlp", JSON.stringify(firedNlp[firedNlp.length - 1]));
  check("scan requests are written under the radar", (await pg.evaluate(() => window.__writes)).some(([, p]) => p === "radars/nlp/meta/control"));
  await pg.click('[data-tp="radar-stop"]');
  const stopP = await pg.inputValue("#rm-prompt");
  check("Stop scans writes a message naming the radar and its task", stopP.includes('"NLP radar"') && stopP.includes("id: nlp") && stopP.includes("trig_nlp") && stopP.includes("pause") && stopP.includes("paused: true"), stopP.slice(0, 100));
  await pg.click('[data-rm="close"]');
  await pg.click('[data-tp="radar-delete"]');
  check("Delete is locked until the name is typed", await pg.isDisabled('[data-rm="acopy"]'));
  await pg.fill("#rm-confirm", "NLP radar");
  check("typing the name unlocks the message", !(await pg.isDisabled('[data-rm="acopy"]')));
  const delP = await pg.inputValue("#rm-prompt");
  check("Delete message names the radar's data and task", delP.includes("radars/nlp/") && delP.includes("delete the scheduled task") && delP.includes("id: nlp"));
  await pg.click('[data-rm="close"]');
  await pg.click('[data-tp="rename"]');
  await pg.fill("#tp-rname", "NLP and LLMs");
  await pg.fill("#tp-rtag", "language models");
  await pg.click('[data-tp="rename-save"]');
  await pg.waitForTimeout(500);
  const wr = await pg.evaluate(() => window.__writes);
  check("rename updates the registry and the radar's config", wr.some(([, p]) => p === "radars/nlp") && wr.some(([, p]) => p === "radars/nlp/meta/config"));
  check("the brand shows the new name", (await pg.textContent(".brand-btn")).includes("NLP and LLMs"));
  await pg.click('[data-tp="archive"]');
  await pg.waitForTimeout(500);
  await pg.click("#radar-btn");
  check("archived radars move to their own group", (await pg.textContent("#radar-menu")).includes("Archived"));
  await pg.click('[data-rm="new"]');
  await pg.fill("#rm-name", "NLP");
  await pg.click('[data-rm="make"]');
  check("a clashing radar name is refused", (await pg.textContent("#rm-err")).includes("already exists"));
  await pg.fill("#rm-name", "Biology Graphs");
  await pg.fill("#rm-tagline", "graphs in biology");
  await pg.fill("#rm-topic", "Graph methods for biology.");
  await pg.click('[data-rm="make"]');
  await shot("new-radar-prompt");
  const pr = await pg.inputValue("#rm-prompt");
  check("New radar produces a filled-in prompt", pr.includes("Id: biology-graphs") && pr.includes("graphs in biology") && pr.includes("Graph methods for biology.") && pr.includes("radars/biology-graphs") && !pr.includes("{{"), pr.slice(0, 120));
  check("the prompt lists the existing radars", pr.includes("nlp"));
  await pg.click('[data-rm="close"]');
  check("closing the dialog removes it", (await pg.$("#radar-modal")) === null);

  await pg.goto("file://" + page + "#topic");
  await pg.waitForTimeout(500);
  check("the main radar can be stopped but not deleted", !!(await pg.$('[data-tp="radar-stop"]')) && !(await pg.$('[data-tp="radar-delete"]')));

  await pg.goto("file://" + page + "#network");
  await pg.waitForTimeout(1200);
  check("network renders", (await pg.$$("g.nd")).length > 0);
  check("no page errors", errors.length === 0, errors.join(" | "));
  await browser.close();
  for (const r of results) console.log(r.join("  "));
  process.exit(results.some((r) => r[0] === "FAIL") ? 1 : 0);
})();
