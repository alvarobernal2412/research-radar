// Smoke test of the built page served by the self-hosted server (infra/app), no Claude runtime:
// the page must find window.radarRuntime, read and write through the HTTP API, ask the
// configured ASK_COMMAND for a topic proposal, and start SCAN_COMMAND from "Run now".
//
//   python site/build.py && node tests/smoke/smoke-selfhosted.js
//
// Set CHROMIUM=/path/to/chrome if Playwright can't find a browser.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { chromium } = require("playwright-core");

const repo = path.resolve(__dirname, "../..");
const agent = path.join(repo, "tests/server/fake-agent.js");
const d3Path = path.join(path.dirname(path.dirname(require.resolve("d3"))), "dist/d3.min.js");
const papers = JSON.parse(fs.readFileSync(path.join(repo, "tests/fixtures/papers.sample.json"), "utf8"));
const PORT = 20000 + Math.floor(Math.random() * 20000);
const BASE = `http://127.0.0.1:${PORT}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-smoke-"));
const scanOut = path.join(dir, "scan.json");

const put = (p, data) => fetch(`${BASE}/api/doc?path=${encodeURIComponent(p)}`, { method: "PUT", body: JSON.stringify(data) });

(async () => {
  const srv = spawn(process.execPath, [path.join(repo, "infra/app/server.js")], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dir, RADAR_STORE: "files", PAGE_FILE: path.join(repo, "dist/radar.html"),
      ASK_COMMAND: `node "${agent}"`, SCAN_COMMAND: `node "${agent}"`, FAKE_SCAN_OUT: scanOut },
    stdio: "ignore",
  });
  const results = [];
  const check = (name, ok, detail = "") => results.push([ok ? "PASS" : "FAIL", name, detail]);
  let browser;
  try {
    for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE + "/healthz")).ok) break; } catch (e) { /* not up yet */ } await new Promise((r) => setTimeout(r, 100)); }
    await put("meta/config", { siteName: "Self Test", tagline: "self-hosted smoke", scheduleText: "Sundays at 09:00" });
    await put("meta/topic", { description: "Old topic", themes: [{ name: "Provenance models", weight: 1, keywords: ["provenance"] }], revision: 1 });
    await put("meta/run", { lastRunAt: "2026-10-13T14:00:00Z", status: "ok", counts: { newPapers: 3 } });
    await put("radars/main", { name: "Self Test", root: true, weekday: 6, time: "09:00" });
    papers.forEach((p, i) => put("papers/" + (p.id || "p" + i), p));
    await new Promise((r) => setTimeout(r, 300));

    browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
    const pg = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    pg.on("pageerror", (e) => errors.push(e.message));
    await pg.route("**/d3.min.js", (r) => r.fulfill({ body: fs.readFileSync(d3Path, "utf8"), contentType: "application/javascript" }));
    await pg.route(/fonts\.(googleapis|gstatic)/, (r) => r.fulfill({ body: "", contentType: "text/css" }));

    await pg.goto(BASE + "/#contributions");
    await pg.waitForTimeout(1500);
    check("the page finds the self-hosted runtime", (await pg.evaluate(() => typeof window.radarRuntime === "object" && !window.claude)) !== false);
    check("brand comes from meta/config over HTTP", (await pg.textContent(".brand b")) === "Self Test");
    check("papers render", /of \d+ papers/.test(await pg.textContent("#rescount")), await pg.textContent("#rescount"));
    check("the viewer is an editor", await pg.evaluate(async () => (await (await window.radarRuntime.use("user")).canEdit()) === true));

    await pg.goto(BASE + "/#topic");
    await pg.waitForTimeout(600);
    await pg.click('[data-tp="derive"]');
    await pg.fill("#tp-paste", "Exploratory process mining with provenance. We study how analysts branch and compare analyses.");
    await pg.click('[data-tp="propose"]');
    await pg.waitForTimeout(2500);
    check("Propose topic goes through ASK_COMMAND", !!(await pg.$("#tp-themes")) && (await pg.inputValue("#tp-themes")).includes("Fake theme"));
    await pg.click('[data-tp="save"]');
    await pg.waitForTimeout(600);
    const topic = await (await fetch(`${BASE}/api/doc?path=meta/topic`)).json();
    check("the saved topic reached the server", topic.version >= 2 && topic.data.themes.some((t) => t.name === "Fake theme"), JSON.stringify(topic.data.themes));

    await pg.check('input[name="tp-mode"][value="rescore"]');
    await pg.click('[data-tp="run-now"]');
    for (let i = 0; i < 40 && !fs.existsSync(scanOut); i++) await new Promise((r) => setTimeout(r, 100));
    const seen = fs.existsSync(scanOut) ? JSON.parse(fs.readFileSync(scanOut, "utf8")) : null;
    check("Run now starts SCAN_COMMAND for this radar without a task id", !!seen && seen.args.join(" ") === "--radar main", JSON.stringify(seen));
    check("the request text reaches the scan", !!seen && /mode=rescore/.test(seen.text), seen && seen.text);
    const control = await (await fetch(`${BASE}/api/doc?path=meta/control`)).json();
    check("the request is queued in meta/control", control.data.status === "queued" && control.data.mode === "rescore", JSON.stringify(control.data));

    check("no page errors", errors.length === 0, errors.join(" | "));
  } finally {
    if (browser) await browser.close();
    srv.kill();
  }
  for (const [s, n, d] of results) console.log(`${s}  ${n}  ${d}`);
  process.exit(results.some((r) => r[0] === "FAIL") ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
