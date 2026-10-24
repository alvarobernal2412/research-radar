// Turn an export (format research-radar/v1) or a directory tree of
// <collection>/<doc>.json files (as ArtifactData's out_dir writes) into
// {path: data} documents, and upsert them into the store (files or Postgres, see store/index.js).
//   node import.js <export.json | dir>
const fs = require("fs");
const path = require("path");
const { split } = require("./store/common");
const { createStore } = require("./store");

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

const upsert = (store, docs) => store.upsertMany(docs);

module.exports = { toDocs, fromDir, split, upsert, prefixOf, RADAR_ID, ROOT_RADAR };

if (require.main === module) {
  (async () => {
    const src = process.argv[2];
    if (!src) { console.error("usage: node import.js <export.json | dir>"); process.exit(2); }
    const store = createStore();
    await store.init();
    const st = fs.statSync(src);
    const docs = st.isDirectory() ? fromDir(src) : toDocs(JSON.parse(fs.readFileSync(src, "utf8")));
    console.log(`imported ${await upsert(store, docs)} documents`);
    await store.close();
  })().catch((e) => { console.error(e.message); process.exit(1); });
}
