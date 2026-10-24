// Turn an export (format research-radar/v1) or a directory tree of
// <collection>/<doc>.json files (as ArtifactData's out_dir writes) into
// {path: data} documents, and upsert them into Postgres.
//   node import.js <export.json | dir>
const fs = require("fs");
const path = require("path");

// The first radar ("main") lives at the root; every other radar under radars/<id>/.
const RADAR_ID = /^[a-z0-9][a-z0-9-]{1,29}$/;
const ROOT_RADAR = "main";
const prefixOf = (radar) => (radar && radar !== ROOT_RADAR && RADAR_ID.test(radar) ? `radars/${radar}/` : "");

function fromExport(x) {
  const docs = {};
  const radar = x.site && x.site.radar;
  if (radar && radar !== ROOT_RADAR && !RADAR_ID.test(radar)) throw new Error("bad radar id in export: " + radar);
  const pre = prefixOf(radar);
  for (const k of ["topic", "config", "run", "control"]) if (x[k]) docs[pre + "meta/" + k] = x[k];
  for (const k of ["papers", "conferences", "journals"]) {
    for (const d of x[k] || []) {
      const { id, ...rest } = d;
      if (id) docs[`${pre}${k}/${id}`] = rest;
    }
  }
  return docs;
}

function fromDir(dir, base = "") {
  const docs = {};
  for (const e of fs.readdirSync(path.join(dir, base), { withFileTypes: true })) {
    const rel = base ? `${base}/${e.name}` : e.name;
    // Private per-viewer data (API keys, marks) is never mirrored.
    // The scan lock is transient state, not data.
    if (rel === "data/users" || rel.startsWith("data/users/") || rel === "scanlock" || rel.startsWith("scanlock/")) continue;
    if (e.isDirectory()) Object.assign(docs, fromDir(dir, rel));
    else if (e.name.endsWith(".json")) docs[rel.replace(/\.json$/, "")] = JSON.parse(fs.readFileSync(path.join(dir, rel), "utf8"));
  }
  return docs;
}

function toDocs(input) {
  if (input && input.format === "research-radar/v1") return fromExport(input);
  throw new Error('not a research-radar/v1 export (expected {"format":"research-radar/v1",...})');
}

function split(p) {
  const i = p.lastIndexOf("/");
  return { collection: p.slice(0, i), id: p.slice(i + 1) };
}

async function upsert(pool, docs) {
  const entries = Object.entries(docs).filter(([p]) => p.includes("/"));
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    for (const [p, data] of entries) {
      const { collection, id } = split(p);
      await c.query(
        `INSERT INTO docs (path, collection, id, data) VALUES ($1,$2,$3,$4)
         ON CONFLICT (path) DO UPDATE SET data = EXCLUDED.data, version = docs.version + 1, updated_at = now()`,
        [p, collection, id, data]
      );
    }
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
  return entries.length;
}

module.exports = { toDocs, fromDir, split, upsert, prefixOf, RADAR_ID, ROOT_RADAR };

if (require.main === module) {
  (async () => {
    const { Pool } = require("pg");
    const src = process.argv[2];
    if (!src) { console.error("usage: node import.js <export.json | dir>"); process.exit(2); }
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query(fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8"));
    const st = fs.statSync(src);
    const docs = st.isDirectory() ? fromDir(src) : toDocs(JSON.parse(fs.readFileSync(src, "utf8")));
    console.log(`imported ${await upsert(pool, docs)} documents`);
    await pool.end();
  })().catch((e) => { console.error(e.message); process.exit(1); });
}
