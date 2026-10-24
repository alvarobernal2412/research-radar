// Self-hosted Research Radar server: serves the built page with a runtime (runtime.js) and a
// small document API. Documents live in JSON files (default, no database needed) or Postgres.
// Optional: ASK_COMMAND answers "Propose topic", SCAN_COMMAND starts a scan for "Run now".
const fs = require("fs");
const path = require("path");
const http = require("http");
const { createStore } = require("./store");
const { Conflict, split, validPath } = require("./store/common");
const { toDocs, prefixOf, RADAR_ID, ROOT_RADAR } = require("./import");
const { launch, run, extractJson } = require("./commands");

const PORT = +process.env.PORT || 8787;
const HOST = process.env.HOST || "127.0.0.1";
const REPO = path.resolve(__dirname, "..", "..");
const FILES = process.env.FILES_DIR || path.join(process.env.DATA_DIR || path.join(REPO, "data", "selfhost"), "files");
const PAGE = process.env.PAGE_FILE || path.join(REPO, "dist", "radar.html");
const ASK_COMMAND = process.env.ASK_COMMAND || "";
const SCAN_COMMAND = process.env.SCAN_COMMAND || "";
const ASK_MAX_CHARS = +process.env.ASK_MAX_CHARS || 200000;
// Requests must name this server by one of these hostnames (blocks DNS rebinding).
const ALLOWED_HOSTS = (process.env.ALLOWED_HOSTS || "127.0.0.1,localhost,[::1]").split(",").map((s) => s.trim().toLowerCase());

const store = createStore();

const json = (res, code, body) => {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};
const readBody = (req, max = 32 * 1024 * 1024) => new Promise((resolve, reject) => {
  let n = 0; const chunks = [];
  req.on("data", (c) => { n += c.length; if (n > max) { reject(new Error("body too large")); req.destroy(); } else chunks.push(c); });
  req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  req.on("error", reject);
});

// A page from another origin must not be able to write documents or start commands.
function sameOrigin(req) {
  const host = String(req.headers.host || "").toLowerCase();
  if (!ALLOWED_HOSTS.includes(host.replace(/:\d+$/, ""))) return false;
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host.toLowerCase() === host; } catch (e) { return false; }
}

// One export per radar: the root radar ("main") or radars/<id>/.
async function radarIds(all) {
  const ids = new Set([ROOT_RADAR]);
  for (const { path: p } of all) { const m = /^radars\/([^/]+)\//.exec(p); if (m && RADAR_ID.test(m[1])) ids.add(m[1]); }
  return [...ids];
}

async function exportAll(radar = ROOT_RADAR) {
  const pre = prefixOf(radar);
  const out = { format: "research-radar/v1", exportedAt: new Date().toISOString(), site: { name: "self-hosted", radar }, papers: [], conferences: [], journals: [] };
  for (const r of await store.all()) {
    if (pre ? !r.path.startsWith(pre) : r.path.startsWith("radars/") || r.path.startsWith("scanlock/")) continue;
    const { collection, id } = split(r.path.slice(pre.length));
    if (collection === "meta") out[id] = r.data;
    else if (out[collection]) out[collection].push({ id, ...r.data });
  }
  return out;
}

async function snapshot(label) {
  const dir = path.join(FILES, "snapshots");
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const files = [];
  for (const id of await radarIds(await store.all())) {
    const f = path.join(dir, `${stamp}-${label}${id === ROOT_RADAR ? "" : "-" + id}.json`);
    fs.writeFileSync(f, JSON.stringify(await exportAll(id), null, 1));
    files.push(f);
  }
  return files;
}

// Conditional-write headers: If-None-Match: * (create only), If-Match: <version>.
function writeOptions(headers) {
  const o = {};
  if (headers["if-none-match"] === "*") o.ifNoneMatch = true;
  const m = String(headers["if-match"] || "").replace(/"/g, "");
  if (m) { o.ifVersion = +m; if (!Number.isInteger(o.ifVersion)) throw Object.assign(new Error("bad If-Match"), { status: 400 }); }
  return o;
}

async function applyWrite(w) {
  if (!validPath(w.path)) throw Object.assign(new Error("bad path: " + w.path), { status: 400 });
  if (w.op === "delete") { await store.del(w.path); return {}; }
  if (w.op === "set") return store.put(w.path, w.data, { ifNoneMatch: !!w.ifNoneMatch, ifVersion: w.ifVersion == null ? undefined : +w.ifVersion });
  if (w.op === "update") {
    const cur = await store.get(w.path);
    return store.put(w.path, Object.assign({}, cur ? cur.data : {}, w.data), { ifVersion: w.ifVersion == null ? (cur ? cur.version : undefined) : +w.ifVersion });
  }
  throw Object.assign(new Error("bad op: " + w.op), { status: 400 });
}

const running = new Map(); // radar id -> child process, one scan at a time
function startScan(radar, text) {
  if (running.size) return { busy: [...running.keys()][0] };
  const logDir = path.join(FILES, "scan-logs");
  fs.mkdirSync(logDir, { recursive: true });
  const log = path.join(logDir, `${new Date().toISOString().replace(/[:.]/g, "-")}-${radar}.log`);
  const fd = fs.openSync(log, "a");
  const child = launch(SCAN_COMMAND, ["--radar", radar], {
    env: { ...process.env, RADAR_REQUEST_TEXT: text, RADAR_URL: process.env.RADAR_URL || `http://127.0.0.1:${PORT}` },
    stdio: ["ignore", fd, fd],
  });
  running.set(radar, child);
  const done = () => { running.delete(radar); try { fs.closeSync(fd); } catch (e) { /* already closed */ } };
  child.on("error", (e) => { fs.appendFileSync(log, "\nfailed to start: " + e.message + "\n"); done(); });
  child.on("close", done);
  return { log: path.basename(log) };
}

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, "http://x");
    if (!sameOrigin(req)) return json(res, 403, { error: "cross-origin request refused" });
    if (req.method === "GET" && u.pathname === "/") {
      const html = fs.readFileSync(PAGE, "utf8");
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end('<!doctype html><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1"><script src="/runtime.js"></script>' + html);
    }
    if (req.method === "GET" && (u.pathname === "/runtime.js" || u.pathname === "/shim.js")) {
      res.writeHead(200, { "content-type": "application/javascript" });
      return res.end(fs.readFileSync(path.join(__dirname, "runtime.js")));
    }
    if (req.method === "GET" && u.pathname === "/api/capabilities") {
      return json(res, 200, { store: store.kind, user: "local", ask: !!ASK_COMMAND, scan: !!SCAN_COMMAND });
    }
    if (u.pathname === "/api/doc") {
      const p = u.searchParams.get("path") || "";
      if (!validPath(p)) return json(res, 400, { error: "bad path" });
      if (req.method === "GET") {
        const row = await store.get(p);
        return row ? json(res, 200, row) : json(res, 404, { error: "not found" });
      }
      if (req.method === "PUT") {
        const r = await store.put(p, JSON.parse(await readBody(req)), writeOptions(req.headers));
        return json(res, 200, { ok: true, version: r.version });
      }
      if (req.method === "DELETE") {
        await store.del(p);
        return json(res, 200, { ok: true });
      }
    }
    if (req.method === "GET" && u.pathname === "/api/col") {
      const c = u.searchParams.get("path") || "";
      if (!validPath(c + "/x")) return json(res, 400, { error: "bad path" });
      return json(res, 200, await store.col(c));
    }
    // Several writes in order; stops at the first failure and reports how far it got.
    if (req.method === "POST" && u.pathname === "/api/batch") {
      const { writes } = JSON.parse(await readBody(req));
      if (!Array.isArray(writes)) return json(res, 400, { error: "writes must be an array" });
      const results = [];
      for (let i = 0; i < writes.length; i++) {
        try { results.push({ ok: true, ...(await applyWrite(writes[i])) }); } catch (e) {
          if (!(e instanceof Conflict) && !e.status) throw e;
          results.push({ ok: false, error: e.message, version: e.version, status: e instanceof Conflict ? 409 : e.status });
          return json(res, e instanceof Conflict ? 409 : e.status, { results, failedAt: i });
        }
      }
      return json(res, 200, { results });
    }
    if (req.method === "POST" && u.pathname === "/api/ask") {
      if (!ASK_COMMAND) return json(res, 501, { code: "not_configured", error: "ASK_COMMAND is not set" });
      const { prompt } = JSON.parse(await readBody(req));
      if (typeof prompt !== "string" || !prompt) return json(res, 400, { error: "prompt required" });
      if (prompt.length > ASK_MAX_CHARS) return json(res, 413, { code: "prompt_too_large" });
      let out;
      try { out = await run(ASK_COMMAND, { input: prompt, timeoutMs: +process.env.ASK_TIMEOUT_MS || 300000 }); } catch (e) {
        return json(res, 502, { code: e.code === "timeout" ? "rate_limited" : "tool_error", error: e.message });
      }
      if (out.code !== 0) return json(res, 502, { code: "tool_error", error: (out.stderr || "").slice(-500) || "command failed" });
      const parsed = extractJson(out.stdout);
      return parsed ? json(res, 200, { json: parsed }) : json(res, 422, { code: "invalid_json" });
    }
    if (req.method === "POST" && u.pathname === "/api/scan") {
      if (!SCAN_COMMAND) return json(res, 501, { code: "not_configured", error: "SCAN_COMMAND is not set" });
      const { radar = ROOT_RADAR, text = "" } = JSON.parse(await readBody(req));
      if (radar !== ROOT_RADAR && !RADAR_ID.test(radar)) return json(res, 400, { error: "bad radar id" });
      const r = startScan(radar, String(text).slice(0, 2000));
      return r.busy ? json(res, 409, { code: "busy", error: `a scan is already running (${r.busy})` }) : json(res, 202, { ok: true, ...r });
    }
    if (req.method === "POST" && u.pathname === "/api/import") {
      const docs = toDocs(JSON.parse(await readBody(req)));
      const before = await snapshot("pre-import");
      const n = await store.upsertMany(docs);
      return json(res, 200, { imported: n, snapshot: path.basename(before[0]), snapshots: before.map((f) => path.basename(f)) });
    }
    if (req.method === "GET" && u.pathname === "/api/export") {
      const radar = u.searchParams.get("radar") || ROOT_RADAR;
      if (radar !== ROOT_RADAR && !RADAR_ID.test(radar)) return json(res, 400, { error: "bad radar id" });
      return json(res, 200, await exportAll(radar));
    }
    if (req.method === "GET" && u.pathname === "/healthz") { await store.get("healthz/x"); return json(res, 200, { ok: true }); }
    json(res, 404, { error: "not found" });
  } catch (e) {
    if (e instanceof Conflict) return json(res, 409, { error: "version conflict", version: e.version });
    json(res, e.status || 500, { error: String(e.message || e) });
  }
});

(async () => {
  await store.init();
  server.listen(PORT, HOST, () => console.log(`radar server (${store.kind} store) on http://${HOST}:${PORT}`));
})().catch((e) => { console.error(e); process.exit(1); });
