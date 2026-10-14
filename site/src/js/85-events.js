/* ---------- events ---------- */
app.addEventListener("change",e=>{
  const c=e.target.closest("input[data-sel]");if(!c)return;
  if(c.checked)S.sel.add(c.dataset.sel);else S.sel.delete(c.dataset.sel);
  updateSelBar();
});
app.addEventListener("click",e=>{
  const sa=e.target.closest("[data-selact]");if(sa){
    const act=sa.dataset.selact;
    if(act==="export"){exportBibtex();return}
    for(const id of S.shown){if(act==="all")S.sel.add(id);else S.sel.delete(id)}
    document.querySelectorAll("input[data-sel]").forEach(c=>{c.checked=S.sel.has(c.dataset.sel)});
    updateSelBar();return}
  const m=e.target.closest("[data-mark]");if(m){e.preventDefault();toggleMark(m.dataset.id,m.dataset.mark);return}
  const r=e.target.closest("[data-rel]");if(r){S.peopleRelOnly=r.dataset.rel==="1";render(true);return}
  const js=e.target.closest("[data-jsort]");if(js){S.jSort=js.dataset.jsort;lsSet("pr-jsort",S.jSort);render(true);return}
  const au=e.target.closest("[data-author]");if(au){e.preventDefault();F.q=au.dataset.author;lsSet("pr-filters",F);location.hash="#contributions";return}
  const tr=e.target.closest("tr[data-go]");if(tr&&!e.target.closest("a")){location.hash=tr.dataset.go}
});
