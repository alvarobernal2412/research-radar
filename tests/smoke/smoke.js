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
    "meta/run": { lastRunAt: "2026-10-13T14:00:00Z", status: "partial", counts: { newPapers: 3 } },
  };
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

  const target = papers.find((p) => p.fullTextRead !== true) || papers[0];
  await pg.goto("file://" + page + "#paper." + (target.id || "p0"));
  await pg.waitForTimeout(400);
  check("paper detail shows the completeness notice", !!(await pg.$("#comp-note")));
  check("unread paper says 'Unknown' for author-stated fields", (await pg.$$("p.unknown")).length >= 1);
  await shot("paper");
  await pg.click("[data-retry]");
  await pg.waitForTimeout(200);
  check("retry request is written to meta/control", (await pg.evaluate(() => window.__writes)).some(([, p]) => p === "meta/control"));

  await pg.goto("file://" + page + "#topic");
  await pg.waitForTimeout(500);
  await shot("topic");
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

  await pg.goto("file://" + page + "#network");
  await pg.waitForTimeout(1200);
  check("network renders", (await pg.$$("g.nd")).length > 0);
  check("no page errors", errors.length === 0, errors.join(" | "));
  await browser.close();
  for (const r of results) console.log(r.join("  "));
  process.exit(results.some((r) => r[0] === "FAIL") ? 1 : 0);
})();
