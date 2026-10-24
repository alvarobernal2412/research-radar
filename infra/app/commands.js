// Run operator-configured commands (ASK_COMMAND, SCAN_COMMAND) without letting a request
// choose what runs: the command string comes from the environment, and a request only
// supplies stdin text, a validated radar id and environment variables.
const { spawn } = require("child_process");

// Split a command line into words. Understands "double" and 'single' quotes; no expansion.
function tokenize(s) {
  const out = [];
  let cur = "", q = null, has = false;
  for (const ch of String(s)) {
    if (q) { if (ch === q) q = null; else cur += ch; }
    else if (ch === '"' || ch === "'") { q = ch; has = true; }
    else if (/\s/.test(ch)) { if (cur || has) out.push(cur); cur = ""; has = false; }
    else cur += ch;
  }
  if (q) throw new Error("unterminated quote in command");
  if (cur || has) out.push(cur);
  return out;
}

// Windows can't spawn .cmd shims (codex.cmd, npx.cmd) without a shell, so there the whole
// operator-written command line goes through cmd.exe. extraArgs must already be safe words.
function launch(command, extraArgs, opts) {
  if (process.platform === "win32") return spawn([command].concat(extraArgs).join(" "), [], { shell: true, windowsHide: true, ...opts });
  const [bin, ...args] = tokenize(command);
  if (!bin) throw new Error("empty command");
  return spawn(bin, args.concat(extraArgs), opts);
}

// Run to completion, feeding `input` on stdin. Resolves {code, stdout, stderr}.
function run(command, { input = "", env = {}, timeoutMs = 300000, extraArgs = [] } = {}) {
  return new Promise((resolve, reject) => {
    let child;
    try { child = launch(command, extraArgs, { env: { ...process.env, ...env }, stdio: ["pipe", "pipe", "pipe"] }); } catch (e) { return reject(e); }
    let stdout = "", stderr = "", done = false;
    const finish = (fn, v) => { if (!done) { done = true; clearTimeout(timer); fn(v); } };
    const timer = setTimeout(() => { child.kill(); finish(reject, Object.assign(new Error("command timed out"), { code: "timeout" })); }, timeoutMs);
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; });
    child.on("error", (e) => finish(reject, e));
    child.on("close", (code) => finish(resolve, { code, stdout, stderr }));
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}

// First JSON object in a model answer (it may be wrapped in prose or a code fence).
function extractJson(text) {
  const t = String(text).trim();
  try { return JSON.parse(t); } catch (e) { /* fall through */ }
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { /* fall through */ } }
  return null;
}

module.exports = { tokenize, launch, run, extractJson };
