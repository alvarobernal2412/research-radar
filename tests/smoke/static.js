// Smoke test of the read-only static build.
//   python site/build.py --static tests/fixtures/export.main.json tests/fixtures/export.nlp.json
//   node tests/smoke/static.js
// Set CHROMIUM=/path/to/chrome if Playwright can't find a browser.
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");

const repo = path.resolve(__dirname, "../..");
const page = path.join(repo, "dist/pages/index.html");
const d3Path = path.join(path.dirname(path.dirname(require.resolve("d3"))), "dist/d3.min.js");

(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const pg = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [], requests = [];
  pg.on("pageerror", (e) => errors.push(e.message));
  pg.on("request", (r) => { if (!/^(file|data|blob):/.test(r.url()) && !/fonts\./.test(r.url()) && !/d3/.test(r.url())) requests.push(r.method() + " " + r.url()); });
  await pg.route("**/d3.min.js", (r) => r.fulfill({ body: fs.readFileSync(d3Path, "utf8"), contentType: "application/javascript" }));
  await pg.route(/fonts\.(googleapis|gstatic)/, (r) => r.fulfill({ body: "", contentType: "text/css" }));
  const results = [];
  const check = (n, ok, d = "") => results.push([ok ? "PASS" : "FAIL", n, d]);

  await pg.goto("file://" + page + "#contributions");
  await pg.waitForTimeout(800);
  check("brand comes from the export", (await pg.textContent(".brand-name b")) === "Test Radar");
  check("papers render", /of \d+ papers/.test(await pg.textContent("#rescount")));
  await pg.click("#radar-btn");
  const items = await pg.$$eval("#radar-menu .rmi[data-radar]", (e) => e.map((x) => x.dataset.radar));
  check("menu lists both radars", items.join() === "main,nlp", items.join());
  check("no 'New radar' entry", !(await pg.$('[data-rm="new"]')));
  await pg.keyboard.press("Escape");
  await pg.goto("file://" + page + "#nlp~contributions");
  await pg.waitForTimeout(600);
  check("second radar shows its paper", (await pg.textContent("body")).includes("NLP only paper"));
  await pg.goto("file://" + page + "#topic");
  await pg.waitForTimeout(500);
  check("no edit controls on the topic page", !(await pg.$('[data-tp="edit"]')) && !(await pg.$("#tp-maint")));
  await pg.goto("file://" + page + "#contributions");
  await pg.waitForTimeout(500);
  check("selection checkboxes still work", (await pg.$$("article.prow input[data-sel]")).length > 0);
  const w = await pg.evaluate(async () => {
    const db = await window.claude.use("db");
    try { await db.doc("papers/p0").set({ x: 1 }); return "wrote"; } catch (e) { return "blocked"; }
  });
  check("writes to data are blocked", w === "blocked");
  check("no network request left the page", requests.length === 0, requests.join(" | "));
  check("scheduled task id is not published", !(await pg.content()).includes("trig_"));
  check("no page errors", errors.length === 0, errors.join(" | "));

  for (const [s, n, d] of results) console.log(`${s}  ${n}${d ? "  (" + d + ")" : ""}`);
  await browser.close();
  process.exit(results.some((r) => r[0] === "FAIL") ? 1 : 0);
})();
