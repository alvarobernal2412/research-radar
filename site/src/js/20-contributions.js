/* ---------- contributions ---------- */
function opts(list,cur,allLabel){return `<option value="all">${esc(allLabel)}</option>`+list.map(v=>`<option value="${esc(v)}"${v===cur?" selected":""}>${esc(v)}</option>`).join("")}
function distinct(f){return [...new Set(S.papers.flatMap(p=>{const v=f(p);return Array.isArray(v)?v:[v]}).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b)))}
function renderContributionsShell(){
  const srcNames=SOURCES.filter(s=>sourceOn(s.id)).map(s=>s.label);
  const srcText=srcNames.length>1?srcNames.slice(0,-1).join(", ")+" and "+srcNames.slice(-1):srcNames.join("");
  app.innerHTML=`<div class="pagehead"><div><h1>Contributions</h1><p>Papers the scan found${srcText?` in ${esc(srcText)}`:""}, merged so each paper appears once. Affinity is how much a paper overlaps your topic. Papers marked Partial or Metadata only were analysed without their full text.</p></div></div>
  <form class="toolbar" id="flt" role="search" onsubmit="return false">
    <div class="fld wide"><label for="flt-q">Search title or author</label><input type="search" id="flt-q" placeholder="A word from the title, or an author's surname" value="${esc(F.q)}"></div>
    <div class="fld"><label for="flt-aff">Min. affinity <span class="mono" id="flt-aff-v">${F.minAff}%</span></label><input type="range" id="flt-aff" min="0" max="100" step="5" value="${F.minAff}"></div>
    <div class="fld"><label for="flt-kind">Venue kind</label><select id="flt-kind">${[["all","All kinds"],["conference","Conference"],["workshop","Workshop"],["journal","Journal"],["preprint","Preprint"]].map(([v,l])=>`<option value="${v}"${F.kind===v?" selected":""}>${l}</option>`).join("")}</select></div>
    <div class="fld"><label for="flt-type">Paper type</label><select id="flt-type"></select></div>
    <div class="fld"><label for="flt-venue">Venue</label><select id="flt-venue"></select></div>
    <div class="fld"><label for="flt-theme">Theme</label><select id="flt-theme"></select></div>
    <div class="fld"><label for="flt-db">Found in</label><select id="flt-db"></select></div>
    <div class="fld"><label for="flt-comp">Completeness</label><select id="flt-comp">${[["all","Any"],["complete","Complete"],["incomplete","Partial or metadata only"],["partial","Partial"],["minimal","Metadata only"],["stale","Rescore due"]].map(([v,l])=>`<option value="${v}"${F.comp===v?" selected":""}>${l}</option>`).join("")}</select></div>
    <div class="fld"><label for="flt-y1">Year from</label><input type="number" id="flt-y1" min="1990" max="2100" placeholder="any" value="${esc(F.yearFrom)}"></div>
    <div class="fld"><label for="flt-y2">Year to</label><input type="number" id="flt-y2" min="1990" max="2100" placeholder="any" value="${esc(F.yearTo)}"></div>
    <div class="fld"><label for="flt-sort">Order by</label><select id="flt-sort">${[["affinity","Affinity, highest first"],["newest","Publication date, newest"],["oldest","Publication date, oldest"],["discovered","Recently discovered"],["citations","Citations, most first"],["venue","Venue rank (CORE / IF)"],["title","Title, A–Z"]].map(([v,l])=>`<option value="${v}"${F.sort===v?" selected":""}>${l}</option>`).join("")}</select></div>
    <div class="toggles wide"><label><input type="checkbox" id="flt-new"${F.onlyNew?" checked":""}> New this week</label><label><input type="checkbox" id="flt-star"${F.onlyStar?" checked":""}> Starred only</label><label><input type="checkbox" id="flt-read"${F.hideRead?" checked":""}> Hide read</label><button type="button" class="btn" id="flt-reset" style="margin-left:auto">Clear filters</button></div>
  </form>
  <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><span class="rescount" id="rescount"></span>${S.uid?"":`<span class="muted" style="font-size:.8rem">Sign in to Claude to star papers and mark them read.</span>`}</div>
  <div id="results"></div>`;
  const on=(id,ev,fn)=>document.getElementById(id).addEventListener(ev,fn);
  let qT=0;on("flt-q","input",e=>{clearTimeout(qT);qT=setTimeout(()=>{F.q=e.target.value;commit()},150)});
  on("flt-aff","input",e=>{F.minAff=+e.target.value;document.getElementById("flt-aff-v").textContent=F.minAff+"%";commit()});
  [["flt-kind","kind"],["flt-type","type"],["flt-venue","venue"],["flt-theme","theme"],["flt-db","db"],["flt-comp","comp"],["flt-sort","sort"]].forEach(([id,k])=>on(id,"change",e=>{F[k]=e.target.value;commit()}));
  on("flt-y1","input",e=>{F.yearFrom=e.target.value;commit()});on("flt-y2","input",e=>{F.yearTo=e.target.value;commit()});
  on("flt-new","change",e=>{F.onlyNew=e.target.checked;commit()});on("flt-star","change",e=>{F.onlyStar=e.target.checked;commit()});on("flt-read","change",e=>{F.hideRead=e.target.checked;commit()});
  on("flt-reset","click",()=>{Object.assign(F,F_DEFAULT);lsSet("pr-filters",F);renderContributionsShell();updateContribResults()});
}
function commit(){lsSet("pr-filters",F);updateContribResults()}
function setSelect(id,list,cur,all){const el=document.getElementById(id);if(!el)return;const html=opts(list,cur,all);if(el.dataset.h!==html){el.innerHTML=html;el.dataset.h=html}if(cur!=="all"&&!list.includes(cur))el.value="all";}
function venueRankVal(p){const c=S.confs.find(x=>x.id===p.venueId);if(c){const order={astar:4,a:3,b:2,c:1,u:0};return 10+order[rankKey(c.coreRank)]}const j=S.jours.find(x=>x.id===p.venueId);if(j)return 10+Math.min(4,(num(j.impactFactor)||0)/2);return 0}
function updateContribResults(){
  const res=document.getElementById("results");if(!res)return;
  setSelect("flt-type",distinct(p=>p.paperType),F.type,"All types");
  setSelect("flt-venue",distinct(p=>p.venueName),F.venue,"All venues");
  setSelect("flt-theme",distinct(p=>p.themes),F.theme,"All themes");
  setSelect("flt-db",distinct(p=>p.foundIn),F.db,"Any database");
  if(!S.loaded.p){res.innerHTML=loadingBlock();document.getElementById("rescount").textContent="";return}
  if(!S.papers.length){res.innerHTML=emptyBlock("No papers yet",`The first scan looks back ${num(cfg().lookbackYears)||3} years; after that, each scan adds what's new. Papers appear here with their affinity to your topic.`);document.getElementById("rescount").textContent="";return}
  const q=F.q.trim().toLowerCase();const y1=parseInt(F.yearFrom,10),y2=parseInt(F.yearTo,10);
  let L=S.papers.filter(p=>{
    if((num(p.affinity)||0)<F.minAff)return false;
    if(F.kind!=="all"&&p.venueKind!==F.kind)return false;
    if(F.type!=="all"&&p.paperType!==F.type)return false;
    if(F.venue!=="all"&&p.venueName!==F.venue)return false;
    if(F.theme!=="all"&&!arr(p.themes).includes(F.theme))return false;
    if(F.db!=="all"&&!arr(p.foundIn).includes(F.db))return false;
    if(!isNaN(y1)&&(num(p.year)||0)<y1)return false;
    if(!isNaN(y2)&&(num(p.year)||9999)>y2)return false;
    if(F.onlyNew&&!isNewPaper(p))return false;
    if(F.comp!=="all"){const c=paperCompleteness(p);
      if(F.comp==="incomplete"?c.level==="complete":F.comp==="stale"?!c.stale:c.level!==F.comp)return false}
    const mk=S.marks[p.id]||{};
    if(F.onlyStar&&!mk.star)return false;
    if(F.hideRead&&mk.read)return false;
    if(q){const hay=(String(p.title||"")+" "+authorNames(p).join(" ")).toLowerCase();if(!q.split(/\s+/).every(w=>hay.includes(w)))return false}
    return true});
  const pd=p=>p.publishedDate||(p.year?String(p.year):"");
  const sorts={affinity:(a,b)=>(num(b.affinity)||0)-(num(a.affinity)||0),newest:(a,b)=>pd(b).localeCompare(pd(a)),oldest:(a,b)=>pd(a).localeCompare(pd(b)),discovered:(a,b)=>String(b.discoveredAt||"").localeCompare(String(a.discoveredAt||"")),citations:(a,b)=>(num(b.citations)||0)-(num(a.citations)||0),venue:(a,b)=>venueRankVal(b)-venueRankVal(a),title:(a,b)=>String(a.title).localeCompare(String(b.title))};
  L.sort((a,b)=>(sorts[F.sort]||sorts.affinity)(a,b)||(num(b.affinity)||0)-(num(a.affinity)||0));
  const inc=S.papers.filter(p=>paperCompleteness(p).level!=="complete").length;
  document.getElementById("rescount").textContent=`${L.length} of ${S.papers.length} papers${inc?` · ${inc} analysed without full text or still incomplete`:""}`;
  if(!L.length){res.innerHTML=`<div class="empty"><b>No papers match these filters</b><span>Lower the minimum affinity or clear a filter.</span></div>`;return}
  res.innerHTML=`<div class="plist">${L.map(paperRow).join("")}</div>`;
}
function paperRow(p){
  const names=authorNames(p);const mk=S.marks[p.id]||{};
  const au=names.length>6?names.slice(0,6).join(", ")+` et al.`:names.join(", ");
  const c=paperCompleteness(p);
  return `<article class="prow${mk.read?" read":""}">${ring(p.affinity)}<div class="pbody"><a class="ptitle" href="#paper.${esc(p.id)}">${esc(p.title)}</a><div class="pauth">${esc(au||"Authors unknown")}</div><div class="pmeta">${isNewPaper(p)?`<span class="pill amb">New</span>`:""}${compPill(c)}${stalePill(c)}<span class="pill">${esc(p.venueKind||"venue")}</span>${p.paperType?`<span class="pill">${esc(p.paperType)}</span>`:""}<span>${esc(p.venueName||"Unknown venue")}${p.year?" · "+esc(p.year):""}</span>${arr(p.themes).slice(0,3).map(t=>`<span class="pill acc">${esc(t)}</span>`).join("")}</div></div><div class="pact">${S.uid?`<button type="button" class="icobtn" data-mark="star" data-id="${esc(p.id)}" aria-pressed="${!!mk.star}">${mk.star?"★ Starred":"☆ Star"}</button><button type="button" class="icobtn" data-mark="read" data-id="${esc(p.id)}" aria-pressed="${!!mk.read}">${mk.read?"✓ Read":"Mark read"}</button>`:""}</div></article>`;
}
