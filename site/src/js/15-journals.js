/* ---------- journals ---------- */
function jSorter(a,b){if(S.jSort==="fit")return (num(b.topicScore)||0)-(num(a.topicScore)||0);return (num(b.impactFactor)||-1)-(num(a.impactFactor)||-1)||(num(b.topicScore)||0)-(num(a.topicScore)||0)}
function renderJournals(){
  let h=`<div class="pagehead"><div><h1>Journals</h1><p>Journals that publish work close to your topic, with their impact metrics, open special issues and editorial boards.</p></div><div class="seg" role="group" aria-label="Order journals by"><button type="button" data-jsort="if" aria-pressed="${S.jSort==="if"}">Impact factor</button><button type="button" data-jsort="fit" aria-pressed="${S.jSort==="fit"}">Topic fit</button></div></div>`;
  if(!S.loaded.j){app.innerHTML=h+loadingBlock();return}
  if(!S.jours.length){app.innerHTML=h+emptyBlock("No journals yet","The scan adds journals, their metrics and editorial boards.");return}
  const main=S.jours.filter(j=>!j.emerging).sort(jSorter),em=S.jours.filter(j=>j.emerging).sort(jSorter);
  h+=`<section class="block"><div class="tblwrap"><table><thead><tr><th>#</th><th>Journal</th><th>Impact factor</th><th>Quartile</th><th>Topic fit</th><th>Open special issues</th></tr></thead><tbody>`;
  main.forEach((j,i)=>{const si=arr(j.specialIssues).filter(s=>!s.deadline||s.deadline>=today());h+=`<tr class="click" data-go="${H("journal",j.id)}"><td class="num muted">${i+1}</td><td><a href="${H("journal",j.id)}"><b>${esc(j.name)}</b></a>${venueGaps(j,"journal").length?` <span class="pill amb" title="${esc(venueGaps(j,"journal").join(" "))}">Incomplete</span>`:""}<div class="muted" style="font-size:.78rem">${esc([j.publisher,j.abbrev].filter(Boolean).join(" · "))}</div></td><td class="num">${num(j.impactFactor)!==null?j.impactFactor.toFixed(1):"—"}${j.ifYear?`<span class="muted" style="font-size:.72rem"> (${esc(j.ifYear)})</span>`:""}</td><td>${j.quartile?`<span class="pill${String(j.quartile).toUpperCase()==="Q1"?" acc":""}">${esc(j.quartile)}</span>`:"—"}</td><td class="num"><span class="bar"><i style="width:${num(j.topicScore)||0}%"></i></span>${num(j.topicScore)!==null?j.topicScore:"—"}</td><td>${si.length?si.map(s=>`<div style="font-size:.8rem">${esc(s.title)}${s.deadline?` <span class="due ${daysUntil(s.deadline)<=30?"soon":""}">· ${fmtDate(s.deadline)}</span>`:""}</div>`).join(""):`<span class="muted">—</span>`}</td></tr>`});
  h+=`</tbody></table></div></section>`;
  h+=emergingSection(em.map(j=>`<a class="card" href="${H("journal",j.id)}"><b>${esc(j.name)}</b><div class="muted" style="font-size:.8rem">${esc(j.publisher||"")}${num(j.impactFactor)!==null?" · IF "+j.impactFactor.toFixed(1):""}</div><p>${esc(j.emergingReason||"")}</p></a>`),"journals");
  app.innerHTML=h;
}
function renderJournalDetail(id){
  const j=S.jours.find(x=>x.id===id);
  if(!j){app.innerHTML=S.loaded.j?notFound("journal",H("journals"),"Journals"):loadingBlock();return}
  const m=[["Impact factor",num(j.impactFactor)!==null?j.impactFactor.toFixed(2)+(j.ifYear?` (${j.ifYear})`:""):null],["5-year IF",num(j.impactFactor5y)!==null?j.impactFactor5y.toFixed(2):null],["2-yr mean citedness (OpenAlex)",num(j.citedness2y)!==null?j.citedness2y.toFixed(2):null],["CiteScore",j.citeScore],["SJR",j.sjr],["Quartile",j.quartile],["h-index",j.hIndex],["Time to 1st decision",j.reviewTime],["Acceptance rate",j.acceptanceRate],["Open access",j.openAccess],["ISSN",j.issn],["Topic fit",num(j.topicScore)!==null?j.topicScore+"%":null],["Papers here",String(venuePapers(j).length)],["Updated",j.updatedAt?fmtDate(j.updatedAt):null]].filter(x=>x[1]!=null&&x[1]!=="");
  let h=`<a class="back" href="${H("journals")}">← Journals</a><div class="dhead"><div class="eyebrow">${j.emerging?"Emerging journal":"Journal"}</div><h1>${esc(j.name)}</h1><div class="meta">${esc(j.publisher||"")}${j.url?` · <a href="${esc(j.url)}" target="_blank" rel="noopener">Website ↗</a>`:""}</div></div><div class="dgrid"><div class="prose" style="max-width:none">`;
  if(j.scope)h+=`<div><div class="eyebrow">Aims and scope</div><p>${esc(j.scope)}</p></div>`;
  if(j.topicNote)h+=`<div><div class="eyebrow">Why it matters for your topic</div><p>${esc(j.topicNote)}</p></div>`;
  if(j.emerging&&j.emergingReason)h+=`<div class="notice"><b>Emerging:</b> ${esc(j.emergingReason)}</div>`;
  h+=gapNotice(venueGaps(j,"journal"));
  h+=guidelinesBlock(j);
  const si=arr(j.specialIssues);
  h+=`<div style="display:flex;flex-direction:column;gap:10px"><h2>Special issues</h2>${si.length?`<div class="tblwrap"><table><thead><tr><th>Title</th><th>Submission deadline</th></tr></thead><tbody>${si.map(s=>`<tr><td>${s.url?`<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>`:esc(s.title)}${s.relevant?` <span class="pill acc">fits your topic</span>`:""}</td><td class="num">${s.deadline?fmtDate(s.deadline):"—"}</td></tr>`).join("")}</tbody></table></div>`:`<div class="empty"><span>No special issues tracked.</span></div>`}</div>`;
  h+=venuePapersBlock(j,"journal");
  h+=`<div style="display:flex;flex-direction:column;gap:14px"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><h2>Editorial board</h2>${relToggle()}</div>${peopleBlock([["Editors-in-chief",j.editorsInChief],["Associate / area editors",j.associateEditors],["Editorial board",j.editorialBoard]])}</div>`;
  h+=`</div><aside class="dside"><div class="panel"><div class="eyebrow">Metrics</div><dl class="kv">${m.map(([k,v])=>`<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl></div>${srcList(j.sources)}</aside></div>`;
  app.innerHTML=h;
}
