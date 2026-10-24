// Black-box tests of infra/app/server.js with the JSON-file store (no database needed).
//   node --test tests/server
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const repo = path.resolve(__dirname, "../..");
const agent = path.join(__dirname, "fake-agent.js");
const PORT = 20000 + Math.floor(Math.random() * 20000);
const BASE = `http://127.0.0.1:${PORT}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-srv-"));
const scanOut = path.join(dir, "scan.json");
let proc;

const api = async (p, opt = {}) => {
  const r = await fetch(BASE + p, opt);
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null };
};
const put = (p, data, headers = {}) => api("/api/doc?path=" + encodeURIComponent(p), { method: "PUT", body: JSON.stringify(data), headers });
const post = (p, body, headers = {}) => api(p, { method: "POST", body: JSON.stringify(body), headers });

test.before(async () => {
  fs.writeFileSync(path.join(dir, "page.html"), "<html><body>page</body></html>");
  proc = spawn(process.execPath, [path.join(repo, "infra/app/server.js")], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dir, RADAR_STORE: process.env.TEST_STORE || "files", PAGE_FILE: path.join(dir, "page.html"),
      ASK_COMMAND: `node "${agent}"`, SCAN_COMMAND: `node "${agent}"`, FAKE_SCAN_OUT: scanOut, FAKE_SCAN_MS: "600" },
    stdio: "ignore",
  });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(BASE + "/healthz")).ok) return; } catch (e) { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("server did not start");
});
test.after(() => { proc.kill(); });

test("documents round-trip and bump their version", async () => {
  assert.deepStrictEqual((await put("papers/a", { title: "A" })).body, { ok: true, version: 1 });
  assert.deepStrictEqual((await put("papers/a", { title: "A2" })).body, { ok: true, version: 2 });
  const got = await api("/api/doc?path=papers/a");
  assert.deepStrictEqual(got.body, { data: { title: "A2" }, version: 2 });
  assert.strictEqual((await api("/api/doc?path=papers/missing")).status, 404);
});

test("If-None-Match: * creates only once (the scan lock)", async () => {
  assert.strictEqual((await put("scanlock/current", { radarId: "main" }, { "if-none-match": "*" })).status, 200);
  const again = await put("scanlock/current", { radarId: "nlp" }, { "if-none-match": "*" });
  assert.strictEqual(again.status, 409);
  assert.strictEqual(again.body.version, 1);
});

test("If-Match writes only the version that was read", async () => {
  await put("meta/run", { n: 1 });
  assert.strictEqual((await put("meta/run", { n: 2 }, { "if-match": "5" })).status, 409);
  assert.strictEqual((await put("meta/run", { n: 2 }, { "if-match": "1" })).status, 200);
  assert.strictEqual((await put("meta/nothere", { n: 2 }, { "if-match": "1" })).status, 409);
});

test("collections list their direct documents in id order", async () => {
  await put("papers/c", { t: "c" });
  await put("papers/b", { t: "b" });
  await put("radars/nlp/papers/n1", { t: "n" });
  const rows = (await api("/api/col?path=papers")).body;
  assert.deepStrictEqual(rows.map((r) => r.id), ["a", "b", "c"]);
  assert.ok(rows.every((r) => Number.isInteger(r.version)));
  assert.deepStrictEqual((await api("/api/col?path=radars/nlp/papers")).body.map((r) => r.id), ["n1"]);
});

test("ids with ':' survive the file store", async () => {
  await put("data/users/u:1/settings", { k: 1 });
  assert.deepStrictEqual((await api("/api/doc?path=" + encodeURIComponent("data/users/u:1/settings"))).body.data, { k: 1 });
  assert.deepStrictEqual((await api("/api/col?path=" + encodeURIComponent("data/users/u:1"))).body.map((r) => r.id), ["settings"]);
});

test("paths that climb out of the store are refused", async () => {
  for (const p of ["../x/y", "papers/../../x", "a/./b", "nosegment"]) {
    assert.strictEqual((await put(p, {})).status, 400, p);
    assert.strictEqual((await api("/api/doc?path=" + encodeURIComponent(p))).status, 400, p);
  }
});

test("batch applies writes in order and stops at a conflict", async () => {
  const ok = await post("/api/batch", { writes: [{ op: "set", path: "papers/x", data: { t: 1 } }, { op: "update", path: "papers/x", data: { u: 2 } }, { op: "delete", path: "papers/c" }] });
  assert.strictEqual(ok.status, 200);
  assert.deepStrictEqual((await api("/api/doc?path=papers/x")).body.data, { t: 1, u: 2 });
  assert.strictEqual((await api("/api/doc?path=papers/c")).status, 404);
  const bad = await post("/api/batch", { writes: [{ op: "set", path: "papers/y", data: {} }, { op: "set", path: "papers/x", data: {}, ifNoneMatch: true }, { op: "set", path: "papers/z", data: {} }] });
  assert.strictEqual(bad.status, 409);
  assert.strictEqual(bad.body.failedAt, 1);
  assert.strictEqual((await api("/api/doc?path=papers/z")).status, 404);
});

test("a request from another origin is refused, a same-origin one is not", async () => {
  assert.strictEqual((await put("papers/evil", {}, { origin: "http://evil.example" })).status, 403);
  assert.strictEqual((await api("/api/doc?path=papers/evil")).status, 404);
  assert.strictEqual((await put("papers/same", {}, { origin: BASE })).status, 200);
});

test("capabilities report what is configured", async () => {
  assert.deepStrictEqual((await api("/api/capabilities")).body, { store: process.env.TEST_STORE || "files", user: "local", ask: true, scan: true });
});

test("the page is served with the runtime script in front", async () => {
  const html = await (await fetch(BASE + "/")).text();
  assert.ok(html.includes('<script src="/runtime.js"></script>') && html.includes("page"));
  assert.ok((await (await fetch(BASE + "/runtime.js")).text()).includes("radarRuntime"));
});

test("ask runs the configured command and returns the JSON in its answer", async () => {
  const r = await post("/api/ask", { prompt: "hello" });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.json.len, 5);
  assert.strictEqual((await post("/api/ask", { prompt: "x".repeat(200001) })).status, 413);
});

test("scan starts the command with the radar id and request text, one at a time", async () => {
  const r = await post("/api/scan", { radar: "nlp", text: "mode=full; $(touch pwned)" });
  assert.strictEqual(r.status, 202);
  assert.strictEqual((await post("/api/scan", { radar: "main", text: "" })).status, 409);
  for (let i = 0; i < 50 && !fs.existsSync(scanOut); i++) await new Promise((x) => setTimeout(x, 100));
  const seen = JSON.parse(fs.readFileSync(scanOut, "utf8"));
  assert.deepStrictEqual(seen.args, ["--radar", "nlp"]);
  assert.strictEqual(seen.text, "mode=full; $(touch pwned)");
  assert.strictEqual((await post("/api/scan", { radar: "Bad Id", text: "" })).status, 400);
  await new Promise((x) => setTimeout(x, 900));
  assert.strictEqual((await post("/api/scan", { radar: "main", text: "" })).status, 202);
});

test("export has the research-radar/v1 shape and leaves private data out", async () => {
  await put("meta/topic", { revision: 1 });
  const ex = (await api("/api/export")).body;
  assert.strictEqual(ex.format, "research-radar/v1");
  assert.ok(ex.papers.some((p) => p.id === "a"));
  assert.ok(!JSON.stringify(ex).includes("u:1"));
  assert.ok(!ex.papers.some((p) => p.id === "n1"));
});
