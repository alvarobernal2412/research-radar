/* ---------- conferences ---------- */
function confSort(a,b){return (num(b.topicScore)||0)-(num(a.topicScore)||0)||String(a.acronym||a.name).localeCompare(String(b.acronym||b.name))}
function renderConferences(){
  const main=S.confs.filter(c=>!c.emerging),em=S.confs.filter(c=>c.emerging).sort(confSort);
  let h=`<div class="pagehead"><div><h1>Conferences</h1><p>Venues where work on your topic gets published, grouped by CORE rank. Within each rank, the venues that fit your topic best come first.</p></div></div>`;
  if(!S.loaded.c){app.innerHTML=h+loadingBlock();return}
  if(!S.confs.length){app.innerHTML=h+emptyBlock("No conferences yet",`The scan fills this tier list with venues, deadlines and committees. It runs ${scheduleText()}.`);return}
  h+=`<section class="block"><div class="tierlist">`;
  for(const [lab,k,desc] of RANKS){
    const items=main.filter(c=>rankKey(c.coreRank)===k).sort(confSort);
    if(k==="u"&&!items.length)continue;
    h+=`<div class="tier"><div class="tier-lab t-${k}">${esc(lab==="Unranked"?"–":lab)}<small>${esc(desc)}</small></div><div class="tier-items">`;
    h+=items.length?items.map(confChip).join(""):`<span class="tier-empty">No tracked venues at this rank.</span>`;
    h+=`</div></div>`;
  }
  h+=`</div></section>`;
  h+=deadlineTimeline(S.confs);
  const upcoming=main.map(c=>({c,nd:nextDeadline(c)})).sort((a,b)=>(a.nd?a.nd.date:"9999")<(b.nd?b.nd.date:"9999")?-1:1);
  h+=`<section class="block"><div class="sechead"><h2>Editions and deadlines</h2><span class="muted" style="font-size:.85rem">Sorted by the next open deadline</span></div><div class="tblwrap"><table><thead><tr><th>Venue</th><th>CORE</th><th>Topic fit</th><th>Next deadline</th><th>Next edition</th><th>Following edition</th></tr></thead><tbody>`;
  for(const {c,nd} of upcoming){h+=`<tr class="click" data-go="${H("conf",c.id)}"><td><a href="${H("conf",c.id)}"><b>${esc(c.acronym||c.name)}</b></a>${venueGaps(c,"conf").length?` <span class="pill amb" title="${esc(venueGaps(c,"conf").join(" "))}">Incomplete</span>`:""}<div class="muted" style="font-size:.78rem">${esc(c.acronym?c.name:"")}</div></td><td>${rkBadge(c.coreRank)}</td><td class="num"><span class="bar"><i style="width:${num(c.topicScore)||0}%"></i></span>${num(c.topicScore)!==null?c.topicScore:"—"}</td><td>${nd?`${dueHtml(nd)}<div class="muted mono" style="font-size:.74rem">${fmtDate(nd.date)} · ${esc(nd.what)}</div>`:dueHtml(null)}</td><td>${edLine(c.nextEdition)}</td><td>${edLine(c.followingEdition)}</td></tr>`}
  h+=`</tbody></table></div></section>`;
  h+=emergingSection(em.map(c=>`<a class="card" href="${H("conf",c.id)}"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><b>${esc(c.acronym||c.name)}</b>${rkBadge(c.coreRank)}</div><div class="muted" style="font-size:.8rem">${esc(c.acronym?c.name:"")}</div><p>${esc(c.emergingReason||"")}</p><div style="font-size:.8rem">${edLine(c.nextEdition)}</div>${dueHtml(nextDeadline(c))}</a>`),"conferences");
  app.innerHTML=h;
}
function confChip(c){const nd=nextDeadline(c);const ne=c.nextEdition;const where=ne?([ne.city,ne.country].filter(Boolean).join(", ")||ne.location||""):"";return `<a class="vchip" href="${H("conf",c.id)}" title="${esc(c.name)}"><span class="acr">${esc(c.acronym||c.name)}<span class="mono muted" style="font-size:.72rem">${num(c.topicScore)!==null?c.topicScore+"% fit":""}</span></span><span class="fit"><i style="width:${num(c.topicScore)||0}%"></i></span>${dueHtml(nd)}<span class="ln">${esc(where||"Next edition not announced")}${ne&&ne.year?" · "+esc(ne.year):""}</span></a>`}
function emergingSection(cards,what){return `<section class="block"><div class="sechead"><h2>Emerging</h2><span class="muted" style="font-size:.85rem">Lower impact today, gaining traction in the community</span></div>${cards.length?`<div class="grid">${cards.join("")}</div>`:`<div class="empty"><span>No emerging ${what} flagged yet.</span></div>`}</section>`}
function peopleBlock(groups){
  let any=false,h="";
  for(const [label,list] of groups){const L=arr(list);if(!L.length)continue;any=true;
    const sorted=L.slice().sort((a,b)=>(b.relatedToTopic?1:0)-(a.relatedToTopic?1:0));
    const shown=S.peopleRelOnly&&L.length>12?sorted.filter(p=>p.relatedToTopic):sorted;
    const rel=L.filter(p=>p.relatedToTopic).length;
    h+=`<div style="display:flex;flex-direction:column;gap:8px"><div style="display:flex;gap:10px;align-items:baseline;flex-wrap:wrap"><h3>${esc(label)}</h3><span class="muted" style="font-size:.8rem">${L.length} people${rel?` · ${rel} related to your topic`:""}</span></div>`;
    h+=shown.length?`<div class="people">${shown.map(personHtml).join("")}</div>`:`<span class="muted" style="font-size:.85rem">None flagged as related. Switch to “Everyone” to see all ${L.length}.</span>`;
    h+=`</div>`}
  if(!any)return`<div class="empty"><span>Committee lists haven't been published or collected yet.</span></div>`;
  return h;
}
function personHtml(p){if(typeof p==="string")p={name:p};return `<div class="person${p.relatedToTopic?" rel":""}"><b>${esc(p.name)}</b>${p.affiliation?`<span class="aff">${esc(p.affiliation)}</span>`:""}${p.relatedToTopic?`<span class="why">● ${esc(p.relationNote||"Works on related topics")}</span>`:""}</div>`}
function relToggle(){return `<div class="seg" role="group" aria-label="Committee filter"><button type="button" data-rel="1" aria-pressed="${S.peopleRelOnly}">Related first</button><button type="button" data-rel="0" aria-pressed="${!S.peopleRelOnly}">Everyone</button></div>`}
function renderConfDetail(id){
  const c=S.confs.find(x=>x.id===id);
  if(!c){app.innerHTML=S.loaded.c?notFound("conference",H("conferences"),"Conferences"):loadingBlock();return}
  const nd=nextDeadline(c);
  let h=`<a class="back" href="${H("conferences")}">← Conferences</a><div class="dhead"><div class="eyebrow">${c.emerging?"Emerging conference":"Conference"}</div><h1>${esc(c.name)}${c.acronym?` <span class="muted" style="font-weight:500">(${esc(c.acronym)})</span>`:""}</h1><div class="meta">${rkBadge(c.coreRank)}<span>CORE ${esc(rankLabel(c.coreRank))}${c.coreSource?" · "+esc(c.coreSource):""}</span>${num(c.topicScore)!==null?`<span class="pill acc">${c.topicScore}% topic fit</span>`:""}${c.url?`<a href="${esc(c.url)}" target="_blank" rel="noopener">Website ↗</a>`:""}${c.dblpUrl?`<a href="${esc(c.dblpUrl)}" target="_blank" rel="noopener">DBLP ↗</a>`:""}</div></div>`;
  h+=`<div class="dgrid"><div class="prose" style="max-width:none">`;
  if(c.scope)h+=`<div><div class="eyebrow">Scope</div><p>${esc(c.scope)}</p></div>`;
  if(c.topicNote)h+=`<div><div class="eyebrow">Why it matters for your topic</div><p>${esc(c.topicNote)}</p></div>`;
  if(c.emerging&&c.emergingReason)h+=`<div class="notice"><b>Emerging:</b> ${esc(c.emergingReason)}</div>`;
  h+=gapNotice(venueGaps(c,"conf"));
  h+=guidelinesBlock(c);
  h+=`<div class="editions"><div class="panel"><div class="eyebrow">Next edition${c.nextEdition&&c.nextEdition.year?" · "+esc(c.nextEdition.year):""}</div><div>${edLine(c.nextEdition)}</div>${c.nextEdition&&c.nextEdition.url?`<a href="${esc(c.nextEdition.url)}" target="_blank" rel="noopener" style="font-size:.85rem">Edition website ↗</a>`:""}</div><div class="panel"><div class="eyebrow">Following edition${c.followingEdition&&c.followingEdition.year?" · "+esc(c.followingEdition.year):""}</div><div>${edLine(c.followingEdition)}</div></div></div>`;
  const dl=arr(c.deadlines);
  h+=`<div style="display:flex;flex-direction:column;gap:10px"><h2>Submission deadlines</h2>${dl.length?`<div class="tblwrap"><table><thead><tr><th>Track</th><th>Type</th><th>Abstract</th><th>Paper</th><th>Notification</th><th>Camera-ready</th></tr></thead><tbody>${dl.map(d=>`<tr><td>${d.url?`<a href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.track||"—")}</a>`:esc(d.track||"—")}${d.pageLimit?`<div class="muted" style="font-size:.75rem">${esc(d.pageLimit)}</div>`:""}</td><td><span class="pill">${esc(d.type||"—")}</span></td>${["abstractDue","paperDue","notification","cameraReady"].map(k=>`<td class="num">${d[k]?fmtDate(d[k])+(k!=="notification"&&k!=="cameraReady"&&daysUntil(d[k])!==null&&daysUntil(d[k])>=0?`<div class="due ${daysUntil(d[k])<=14?"soon":daysUntil(d[k])<=45?"near":""}">in ${daysUntil(d[k])}d</div>`:""):"—"}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`:`<div class="empty"><span>The call for papers for the next edition isn't out yet.</span></div>`}${c.deadlineNote?`<p class="muted" style="font-size:.85rem">${esc(c.deadlineNote)}</p>`:""}</div>`;
  h+=venuePapersBlock(c,"conference");
  h+=`<div style="display:flex;flex-direction:column;gap:14px"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><h2>People</h2>${relToggle()}</div>${peopleBlock([["Steering committee",c.steeringCommittee],["General chairs",c.generalChairs],["Program chairs",c.pcChairs],["Senior program committee",c.seniorPC],["Program committee",c.programCommittee]])}</div>`;
  h+=`</div><aside class="dside"><div class="panel"><div class="eyebrow">At a glance</div><dl class="kv"><dt>CORE</dt><dd>${esc(rankLabel(c.coreRank))}</dd><dt>Topic fit</dt><dd>${num(c.topicScore)!==null?c.topicScore+"%":"—"}</dd><dt>Next due</dt><dd>${nd?fmtDate(nd.date):"—"}</dd>${c.acceptanceRate?`<dt>Acceptance</dt><dd>${esc(c.acceptanceRate)}</dd>`:""}${c.publisher?`<dt>Proceedings</dt><dd style="font-family:var(--f-body)">${esc(c.publisher)}</dd>`:""}<dt>Papers here</dt><dd>${venuePapers(c).length}</dd><dt>Updated</dt><dd>${fmtDate(c.updatedAt)}</dd></dl></div>${arr(c.relevantTracks).length?`<div class="panel"><div class="eyebrow">Tracks that fit your topic</div><div class="chips">${arr(c.relevantTracks).map(t=>`<span class="pill acc">${esc(t)}</span>`).join("")}</div></div>`:""}${srcList(c.sources)}</aside></div>`;
  app.innerHTML=h;
}
