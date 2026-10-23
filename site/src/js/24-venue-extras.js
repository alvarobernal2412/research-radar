/* ---------- venue guidelines and papers by edition ---------- */
// Shown on the conference and journal detail pages. The guidelines come from the scan
// (venue.aiPolicy, venue.formatGuidelines); the paper list is computed from S.papers.
const AI_STANCE={allowed:["Allowed","acc"],disclosure:["Allowed with disclosure","amb"],restricted:["Restricted","amb"],prohibited:["Prohibited","crit"],unclear:["No specific policy found",""]};
function venuePapers(v){
  const names=[v.name,v.acronym,v.abbrev].filter(Boolean).map(nkey);
  return S.papers.filter(p=>p.venueId?p.venueId===v.id:names.includes(nkey(p.venueName)));
}
function paperYear(p){return num(p.year)||num(parseInt(String(p.publishedDate||"").slice(0,4),10))||null}
function guidelineSource(g){return g.url&&/^https?:\/\//.test(g.url)?`<a href="${esc(g.url)}" target="_blank" rel="noopener">Source ↗</a>`:""}
function guidelineFoot(g){return `<div class="muted" style="font-size:.78rem;display:flex;gap:10px;flex-wrap:wrap">${guidelineSource(g)}${g.checkedAt?`<span>Checked ${fmtDate(String(g.checkedAt).slice(0,10))}</span>`:""}</div>`}
function ruleList(g){return arr(g.rules).length?`<ul>${arr(g.rules).map(r=>`<li>${esc(r)}</li>`).join("")}</ul>`:""}
function aiPolicyPanel(v){
  const g=v.aiPolicy;
  if(!g||typeof g!=="object")return `<div class="panel"><h3>AI usage guidelines</h3><p class="unknown">Not collected yet. The next scan looks for the venue's policy on generative AI.</p></div>`;
  const st=AI_STANCE[g.stance]||AI_STANCE.unclear;
  return `<div class="panel"><h3>AI usage guidelines</h3><div><span class="pill ${st[1]}">${esc(st[0])}</span></div>${g.summary?`<p style="margin:0">${esc(g.summary)}</p>`:""}${ruleList(g)}${guidelineFoot(g)}</div>`;
}
function formatPanel(v){
  const g=v.formatGuidelines;
  if(!g||typeof g!=="object")return `<div class="panel"><h3>Format guidelines</h3><p class="unknown">Not collected yet. The next scan looks for the template and submission rules.</p></div>`;
  const kv=[["Template",g.templateUrl&&/^https?:\/\//.test(g.templateUrl)?`<a href="${esc(g.templateUrl)}" target="_blank" rel="noopener">${esc(g.template||"Download")} ↗</a>`:esc(g.template)],["Page limit",esc(g.pageLimit)],["Review",esc(g.anonymization&&g.anonymization!=="unknown"?g.anonymization:"")],["References",esc(g.referenceStyle)]].filter(x=>x[1]);
  return `<div class="panel"><h3>Format guidelines</h3>${g.summary?`<p style="margin:0">${esc(g.summary)}</p>`:""}${kv.length?`<dl class="kv">${kv.map(([k,val])=>`<dt>${k}</dt><dd style="font-family:var(--f-body)">${val}</dd>`).join("")}</dl>`:""}${ruleList(g)}${guidelineFoot(g)}</div>`;
}
function guidelinesBlock(v){return `<div style="display:flex;flex-direction:column;gap:10px"><h2>Submission guidelines</h2><div class="limits">${aiPolicyPanel(v)}${formatPanel(v)}</div></div>`}
function venuePapersBlock(v,kind){
  const L=venuePapers(v);
  const head=`<h2>Papers found here</h2>`;
  if(!L.length)return `<div style="display:flex;flex-direction:column;gap:10px">${head}<div class="empty"><span>No stored paper was published in this ${kind}.</span></div></div>`;
  const by={};for(const p of L){const y=paperYear(p)||"Year unknown";(by[y]=by[y]||[]).push(p)}
  const years=Object.keys(by).sort((a,b)=>(+b||0)-(+a||0));
  const rows=years.map(y=>{
    const ps=by[y].sort((a,b)=>(num(b.affinity)||0)-(num(a.affinity)||0));
    return `<div class="panel"><div class="eyebrow">${kind==="conference"&&+y?`${esc(y)} edition`:esc(y)} · ${ps.length} paper${ps.length===1?"":"s"}</div>${ps.map(p=>`<div style="display:flex;gap:10px;align-items:center">${ring(p.affinity,36)}<div><a href="${H("paper",p.id)}">${esc(p.title)}</a><div class="muted" style="font-size:.78rem">${esc(authorNames(p).slice(0,4).join(", ")+(authorNames(p).length>4?" et al.":""))}</div></div></div>`).join("")}</div>`}).join("");
  return `<div style="display:flex;flex-direction:column;gap:10px">${head}${rows}</div>`;
}
