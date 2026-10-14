// Minimal window.claude runtime for the local mirror: db (polling), a single
// local user, and downloads. `sample` and `mcp` are intentionally absent: the
// page treats them as unavailable, so topic proposals and "Run now" need the
// Claude artifact.
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
  window.claude = { use: async (n) => caps[n] || null };
})();
