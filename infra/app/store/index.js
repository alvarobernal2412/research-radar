// Pick the document store: RADAR_STORE=files|postgres, else Postgres when DATABASE_URL is set, else files.
const path = require("path");

function createStore(env = process.env) {
  const kind = env.RADAR_STORE || (env.DATABASE_URL ? "postgres" : "files");
  if (kind === "postgres") {
    if (!env.DATABASE_URL) throw new Error("RADAR_STORE=postgres needs DATABASE_URL");
    return require("./postgres")(env.DATABASE_URL);
  }
  if (kind !== "files") throw new Error("unknown RADAR_STORE: " + kind);
  return require("./files")(env.DATA_DIR || path.resolve(__dirname, "..", "..", "..", "data", "selfhost"));
}

module.exports = { createStore };
