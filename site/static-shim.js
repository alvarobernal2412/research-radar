// Read-only window.claude runtime for the static (GitHub Pages) build: `db`
// reads from the snapshot embedded as window.__RADAR_DOCS__ ({path: data}),
// `user` can never edit, and `downloads` saves through the browser. Only
// data/users/** (read marks) is writable, and it stays in this browser's
// localStorage. Anything else that tries to write throws.
(function () {
  const UID = "local";
  const LS = "radar-static:";
  const docs = window.__RADAR_DOCS__ || {};
  const listeners = new Set();
  const poke = () => listeners.forEach((l) => l());
  const mine = (p) => p.startsWith("data/users/");
  const read = (p) => {
    if (mine(p)) { try { const v = localStorage.getItem(LS + p); return v == null ? undefined : JSON.parse(v); } catch (e) { return undefined; } }
    return docs[p];
  };
  const write = (p, d) => {
    if (!mine(p)) throw new Error("This site is read-only");
    try { localStorage.setItem(LS + p, JSON.stringify(d)); } catch (e) { /* private mode: marks last for this page view only */ }
    poke();
  };
  const readOnly = () => { throw new Error("This site is read-only"); };
  const snap = (p) => { const v = read(p); return { id: p.split("/").pop(), exists: v !== undefined, data: () => v }; };
  const watch = (emit) => { const l = () => emit(); listeners.add(l); setTimeout(l, 0); return () => listeners.delete(l); };

  const doc = (p) => ({
    id: p.split("/").pop(), path: p,
    get: async () => snap(p),
    set: async (d) => write(p, d),
    update: async (d) => write(p, Object.assign({}, read(p) || {}, d)),
    delete: async () => readOnly(),
    onSnapshot: (cb) => watch(() => cb(snap(p))),
  });

  const rows = (c) => {
    const depth = c.split("/").length + 1;
    return Object.keys(docs).filter((p) => p.startsWith(c + "/") && p.split("/").length === depth).sort().map((p) => snap(p));
  };
  const out = (ds) => ({ docs: ds, size: ds.length, empty: !ds.length });
  const col = (c) => {
    let max = Infinity;
    const q = {
      limit: (n) => { max = n; return q; }, where: () => q, orderBy: () => q,
      get: async () => out(rows(c).slice(0, max)),
      onSnapshot: (cb) => watch(() => cb(out(rows(c).slice(0, max)))),
      doc: (id) => doc(c + "/" + id),
    };
    return q;
  };

  const caps = {
    db: { doc, collection: col },
    user: { canEdit: async () => false, id: async () => UID, isOwner: () => false },
    downloads: { save: async ({ filename, data }) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([data], { type: "text/plain" }));
      a.download = filename; document.body.appendChild(a); a.click(); a.remove();
      return { status: "saved" };
    } },
  };
  window.claude = { use: async (n) => caps[n] || null };
})();
