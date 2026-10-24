// JSON-file store: one file per document under <dir>/docs/<path>.json, holding
// {version, updatedAt, data}. Needs no database, so the server runs with plain `node`.
// Single process only: writes are serialised in memory and replaced atomically on disk.
const fs = require("fs");
const path = require("path");
const { Conflict } = require("./common");

// ":" and "%" are not safe in file names on every platform.
const enc = (seg) => seg.replace(/[:%]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
const dec = (seg) => seg.replace(/%([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));

module.exports = function filesStore(dir) {
  const root = path.join(dir, "docs");
  const colDir = (c) => path.join(root, ...c.split("/").map(enc));
  const file = (p) => path.join(root, ...p.split("/").map(enc)) + ".json";
  let chain = Promise.resolve();
  const serial = (fn) => { const r = chain.then(fn); chain = r.catch(() => {}); return r; };
  const read = (f) => {
    try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { if (e.code === "ENOENT") return null; throw e; }
  };
  const readdir = (d) => {
    try { return fs.readdirSync(d, { withFileTypes: true }); } catch (e) { if (e.code === "ENOENT") return []; throw e; }
  };
  const write = (f, doc) => {
    fs.mkdirSync(path.dirname(f), { recursive: true });
    const tmp = f + "." + process.pid + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(doc));
    fs.renameSync(tmp, f);
  };

  function* walk(d, rel) {
    for (const e of readdir(d)) {
      if (e.isDirectory()) yield* walk(path.join(d, e.name), rel.concat(dec(e.name)));
      else if (e.name.endsWith(".json")) yield { path: rel.concat(dec(e.name.slice(0, -5))).join("/"), file: path.join(d, e.name) };
    }
  }

  return {
    kind: "files",
    async init() { fs.mkdirSync(root, { recursive: true }); },
    async get(p) { const r = read(file(p)); return r ? { data: r.data, version: r.version } : null; },
    put(p, data, { ifNoneMatch, ifVersion } = {}) {
      return serial(async () => {
        const f = file(p);
        const cur = read(f);
        if (ifNoneMatch && cur) throw new Conflict(cur.version);
        if (ifVersion != null && (!cur || cur.version !== ifVersion)) throw new Conflict(cur ? cur.version : null);
        const version = cur ? cur.version + 1 : 1;
        write(f, { version, updatedAt: new Date().toISOString(), data });
        return { version };
      });
    },
    del(p) {
      return serial(async () => { try { fs.unlinkSync(file(p)); } catch (e) { if (e.code !== "ENOENT") throw e; } });
    },
    async col(c) {
      const d = colDir(c);
      const rows = [];
      for (const e of readdir(d)) {
        if (!e.isFile() || !e.name.endsWith(".json")) continue;
        const r = read(path.join(d, e.name));
        if (r) rows.push({ id: dec(e.name.slice(0, -5)), data: r.data, version: r.version });
      }
      return rows.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    },
    async all() {
      const out = [];
      for (const e of walk(root, [])) {
        if (e.path.startsWith("data/users/")) continue;
        const r = read(e.file);
        if (r) out.push({ path: e.path, data: r.data });
      }
      return out;
    },
    upsertMany(docs) {
      return serial(async () => {
        const entries = Object.entries(docs).filter(([p]) => p.includes("/"));
        for (const [p, data] of entries) {
          const f = file(p);
          const cur = read(f);
          write(f, { version: cur ? cur.version + 1 : 1, updatedAt: new Date().toISOString(), data });
        }
        return entries.length;
      });
    },
    async close() {},
  };
};
