// Local mirror server: serves the built radar page with a runtime shim and a
// small document API backed by Postgres. Snapshots go to the files volume.
const fs = require("fs");
const path = require("path");
const http = require("http");
const { Pool } = require("pg");
const { toDocs, split, upsert, prefixOf, RADAR_ID, ROOT_RADAR } = require("./import");

const PORT = +process.env.PORT || 8080;
const FILES = process.env.FILES_DIR || "/data/files";
const PAGE = process.env.PAGE_FILE || "/app/radar.html";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const PATH_RE = /^[A-Za-z0-9_\-.~:@+]+(\/[A-Za-z0-9_\-.~:@+]+)+$/;

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

// One export per radar: the root radar ("main") or radars/<id>/.
async function radarIds() {
  const { rows } = await pool.query("SELECT DISTINCT split_part(path, '/', 2) AS id FROM docs WHERE path LIKE 'radars/%/%'");
  return [ROOT_RADAR, ...rows.map((r) => r.id).filter((id) => id !== ROOT_RADAR && RADAR_ID.test(id))];
}

async function exportAll(radar = ROOT_RADAR) {
  const pre = prefixOf(radar);
  const { rows } = await pool.query("SELECT path, data FROM docs WHERE path !~ '^data/users/'");
  const out = { format: "research-radar/v1", exportedAt: new Date().toISOString(), site: { name: "local mirror", radar }, papers: [], conferences: [], journals: [] };
  for (const r of rows) {
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
  for (const id of await radarIds()) {
    const f = path.join(dir, `${stamp}-${label}${id === ROOT_RADAR ? "" : "-" + id}.json`);
    fs.writeFileSync(f, JSON.stringify(await exportAll(id), null, 1));
    files.push(f);
  }
  return files;
}

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, "http://x");
    if (req.method === "GET" && u.pathname === "/") {
      const html = fs.readFileSync(PAGE, "utf8");
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end('<!doctype html><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1"><script src="/shim.js"></script>' + html);
    }
    if (req.method === "GET" && u.pathname === "/shim.js") {
      res.writeHead(200, { "content-type": "application/javascript" });
      return res.end(fs.readFileSync(path.join(__dirname, "shim.js")));
    }
    if (u.pathname === "/api/doc") {
      const p = u.searchParams.get("path") || "";
      if (!PATH_RE.test(p)) return json(res, 400, { error: "bad path" });
      if (req.method === "GET") {
        const { rows } = await pool.query("SELECT data, version FROM docs WHERE path=$1", [p]);
        return rows[0] ? json(res, 200, rows[0]) : json(res, 404, { error: "not found" });
      }
      if (req.method === "PUT") {
        const data = JSON.parse(await readBody(req));
        const { collection, id } = split(p);
        await pool.query(
          `INSERT INTO docs (path, collection, id, data) VALUES ($1,$2,$3,$4)
           ON CONFLICT (path) DO UPDATE SET data=EXCLUDED.data, version=docs.version+1, updated_at=now()`,
          [p, collection, id, data]);
        return json(res, 200, { ok: true });
      }
      if (req.method === "DELETE") {
        await pool.query("DELETE FROM docs WHERE path=$1", [p]);
        return json(res, 200, { ok: true });
      }
    }
    if (req.method === "GET" && u.pathname === "/api/col") {
      const c = u.searchParams.get("path") || "";
      if (!PATH_RE.test(c + "/x")) return json(res, 400, { error: "bad path" });
      const { rows } = await pool.query("SELECT id, data FROM docs WHERE collection=$1 ORDER BY id", [c]);
      return json(res, 200, rows);
    }
    if (req.method === "POST" && u.pathname === "/api/import") {
      const docs = toDocs(JSON.parse(await readBody(req)));
      const before = await snapshot("pre-import");
      const n = await upsert(pool, docs);
      return json(res, 200, { imported: n, snapshot: path.basename(before[0]), snapshots: before.map((f) => path.basename(f)) });
    }
    if (req.method === "GET" && u.pathname === "/api/export") {
      const radar = u.searchParams.get("radar") || ROOT_RADAR;
      if (radar !== ROOT_RADAR && !RADAR_ID.test(radar)) return json(res, 400, { error: "bad radar id" });
      return json(res, 200, await exportAll(radar));
    }
    if (req.method === "GET" && u.pathname === "/healthz") { await pool.query("SELECT 1"); return json(res, 200, { ok: true }); }
    json(res, 404, { error: "not found" });
  } catch (e) {
    json(res, 500, { error: String(e.message || e) });
  }
});

(async () => {
  await pool.query(fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8"));
  server.listen(PORT, "0.0.0.0", () => console.log("radar mirror on :" + PORT));
})().catch((e) => { console.error(e); process.exit(1); });
