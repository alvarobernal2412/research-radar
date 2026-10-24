// Postgres store: one `docs` row per document (see schema.sql).
const fs = require("fs");
const path = require("path");
const { Conflict, split } = require("./common");

module.exports = function postgresStore(connectionString) {
  const { Pool } = require("pg");
  const pool = new Pool({ connectionString });
  const store = {
    kind: "postgres",
    async init() { await pool.query(fs.readFileSync(path.join(__dirname, "..", "schema.sql"), "utf8")); },
    async get(p) {
      const { rows } = await pool.query("SELECT data, version FROM docs WHERE path=$1", [p]);
      return rows[0] || null;
    },
    async put(p, data, { ifNoneMatch, ifVersion } = {}) {
      const { collection, id } = split(p);
      let res;
      if (ifNoneMatch) {
        res = await pool.query(
          "INSERT INTO docs (path, collection, id, data) VALUES ($1,$2,$3,$4) ON CONFLICT (path) DO NOTHING RETURNING version",
          [p, collection, id, data]);
      } else if (ifVersion != null) {
        res = await pool.query(
          "UPDATE docs SET data=$2, version=version+1, updated_at=now() WHERE path=$1 AND version=$3 RETURNING version",
          [p, data, ifVersion]);
      } else {
        res = await pool.query(
          `INSERT INTO docs (path, collection, id, data) VALUES ($1,$2,$3,$4)
           ON CONFLICT (path) DO UPDATE SET data=EXCLUDED.data, version=docs.version+1, updated_at=now() RETURNING version`,
          [p, collection, id, data]);
      }
      if (!res.rows[0]) {
        const cur = await store.get(p);
        throw new Conflict(cur ? cur.version : null);
      }
      return { version: res.rows[0].version };
    },
    async del(p) { await pool.query("DELETE FROM docs WHERE path=$1", [p]); },
    async col(c) {
      return (await pool.query("SELECT id, data, version FROM docs WHERE collection=$1 ORDER BY id", [c])).rows;
    },
    async all() { return (await pool.query("SELECT path, data FROM docs WHERE path !~ '^data/users/'")).rows; },
    async upsertMany(docs) {
      const entries = Object.entries(docs).filter(([p]) => p.includes("/"));
      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        for (const [p, data] of entries) {
          const { collection, id } = split(p);
          await c.query(
            `INSERT INTO docs (path, collection, id, data) VALUES ($1,$2,$3,$4)
             ON CONFLICT (path) DO UPDATE SET data = EXCLUDED.data, version = docs.version + 1, updated_at = now()`,
            [p, collection, id, data]);
        }
        await c.query("COMMIT");
      } catch (e) {
        await c.query("ROLLBACK");
        throw e;
      } finally {
        c.release();
      }
      return entries.length;
    },
    async close() { await pool.end(); },
  };
  return store;
};
