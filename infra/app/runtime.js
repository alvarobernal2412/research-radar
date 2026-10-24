// Host runtime for the self-hosted server: the capabilities the page asks for through
// rtUse() (site/src/js/01-runtime.js), backed by the server's HTTP API. db polls; user is a
// single local editor; downloads saves in the browser. `sample` (topic proposals) and `mcp`
// ("Run now") exist only when the server has ASK_COMMAND / SCAN_COMMAND configured, as
// reported by /api/capabilities; otherwise the page shows them as unavailable.
(function () {
  const POLL_MS = 3000;
  const UID = "local";
  const api = async (url, opt) => {
    const r = await fetch(url, opt);
    if (!r.ok && r.status !== 404) throw new Error(url + " " + r.status);
    return r;
  };
  const listeners = new Set();
  const poke = () => listeners.forEach((l) => l.refresh());
  setInterval(poke, POLL_MS);

  const doc = (p) => ({
    id: p.split("/").pop(), path: p,
    get: async () => {
      const r = await api("/api/doc?path=" + encodeURIComponent(p));
      if (r.status === 404) return { exists: false, data: () => undefined };
      const j = await r.json();
      return { exists: true, data: () => j.data };
    },
    set: async (d) => { await api("/api/doc?path=" + encodeURIComponent(p), { method: "PUT", body: JSON.stringify(d) }); poke(); },
    update: async (d) => {
      const r = await api("/api/doc?path=" + encodeURIComponent(p));
      const cur = r.status === 404 ? {} : await r.json();
      await doc(p).set(Object.assign({}, cur.data || {}, d));
    },
    delete: async () => { await api("/api/doc?path=" + encodeURIComponent(p), { method: "DELETE" }); poke(); },
    onSnapshot: (cb, err) => watch(async () => {
      const r = await api("/api/doc?path=" + encodeURIComponent(p));
      const j = r.status === 404 ? null : await r.json();
      return { key: JSON.stringify(j), emit: () => cb({ id: p.split("/").pop(), exists: !!j, data: () => (j ? j.data : undefined) }) };
    }, err),
  });

  function watch(fetcher, err) {
    let last = null, dead = false;
    const l = { refresh: async () => {
      if (dead) return;
      try { const s = await fetcher(); if (s.key !== last) { last = s.key; s.emit(); } } catch (e) { if (err) err(e); }
    } };
    listeners.add(l); l.refresh();
    return () => { dead = true; listeners.delete(l); };
  }

  const col = (c) => {
    let max = Infinity;
    const snap = (rows) => {
      const docs = rows.slice(0, max).map((r) => ({ id: r.id, exists: true, data: () => r.data }));
      return { docs, size: docs.length, empty: !docs.length };
    };
    const q = {
      limit: (n) => { max = n; return q; }, where: () => q, orderBy: () => q,
      get: async () => snap(await (await api("/api/col?path=" + encodeURIComponent(c))).json()),
      onSnapshot: (cb, err) => watch(async () => {
        const rows = await (await api("/api/col?path=" + encodeURIComponent(c))).json();
        return { key: JSON.stringify(rows), emit: () => cb(snap(rows)) };
      }, err),
      doc: (id) => doc(c + "/" + id),
    };
    return q;
  };

  // Errors carry the same `code`s the Claude host uses, so the page has one message table.
  const post = async (url, body, signal) => {
    let r;
    try { r = await fetch(url, { method: "POST", body: JSON.stringify(body), signal }); } catch (e) {
      throw Object.assign(new Error(e.message), { code: e && e.name === "AbortError" ? "cancelled" : "tool_error" });
    }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || "request failed (" + r.status + ")"), { code: j.code === "busy" ? "tool_error" : j.code || "tool_error" });
    return j;
  };
  const sample = async () => { throw Object.assign(new Error("use sample.json"), { code: "tool_error" }); };
  sample.json = async (prompt, opt) => (await post("/api/ask", { prompt }, opt && opt.signal)).json;
  const mcp = {
    callTool: async (_server, tool, input) => {
      if (tool !== "fire_trigger") throw Object.assign(new Error("unsupported tool: " + tool), { code: "tool_error" });
      return post("/api/scan", { radar: input.trigger_id, text: input.text });
    },
  };

  const caps = {
    db: { doc, collection: col },
    user: { canEdit: async () => true, id: async () => UID, isOwner: () => true },
    downloads: { save: async ({ filename, data }) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([data], { type: "application/json" }));
      a.download = filename; document.body.appendChild(a); a.click(); a.remove();
      return { status: "saved" };
    } },
  };
  let server = null;
  const info = () => server || (server = fetch("/api/capabilities").then((r) => r.json()).catch(() => ({})));
  window.radarRuntime = {
    use: async (n) => {
      if (n === "sample") return (await info()).ask ? sample : null;
      if (n === "mcp") return (await info()).scan ? mcp : null;
      return caps[n] || null;
    },
  };
})();
