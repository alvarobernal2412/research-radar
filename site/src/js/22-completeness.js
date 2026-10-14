/* ---------- completeness ---------- */
// How much of a record the scan actually managed to collect. The scan sets
// fullTextRead / fullTextSource / fetchNotes / pendingDetail; everything else
// is inferred here so older records get flagged too.
//
// Levels:  complete  – full text read, analysis fields present
//          partial   – analysed from title + abstract only, or some fields missing
//          minimal   – metadata only (no abstract and no summary) or still pending
const COMP_LABEL={complete:"Complete",partial:"Partial",minimal:"Metadata only"};
function paperCompleteness(p){
  const issues=[];
  const notRead=p.fullTextRead!==true;
  if(p.pendingDetail)issues.push("Waiting for analysis by the next scan.");
  if(!p.abstract)issues.push("No abstract stored.");
  if(notRead)issues.push(`Full text not read: analysed from ${p.abstract?"the title and abstract":"the title and metadata"} only${p.fullTextSource&&p.fullTextSource!=="full text"?` (${p.fullTextSource})`:""}.`);
  if(p.fetchNotes)issues.push(String(p.fetchNotes));
  if(!p.summary&&!p.contribution)issues.push("No summary or main contribution.");
  const auth=arr(p.authors).filter(a=>a&&typeof a==="object");
  const noKw=auth.filter(a=>!arr(a.keywords).length).length;
  if(auth.length&&noKw===auth.length)issues.push("No research keywords for the authors.");
  let level="complete";
  if(p.pendingDetail||(!p.abstract&&!p.summary))level="minimal";
  else if(notRead||!p.abstract||(!p.summary&&!p.contribution))level="partial";
  const stale=(num(p.scoredTopicRevision)||1)<topicRevision();
  return{level,issues,notRead,stale};
}
// Text for author-stated fields: distinguishes "the authors state none" from "we could not check".
function statedField(list,notRead,noneText){
  const L=arr(list);
  if(L.length)return `<ul>${L.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>`;
  if(list===null||notRead)return `<p class="unknown">Unknown. The full text wasn't read, so this couldn't be checked.</p>`;
  return `<p class="muted" style="margin:0">${esc(noneText)}</p>`;
}
function compPill(c){
  if(c.level==="complete")return"";
  return `<span class="pill ${c.level==="minimal"?"crit":"amb"}" title="${esc(c.issues.join(" "))}">${COMP_LABEL[c.level]}</span>`;
}
function stalePill(c){return c.stale?`<span class="pill" title="Affinity was scored against an earlier version of your topic. It is updated when a scan rescores.">Rescore due</span>`:""}
function venueGaps(v,kind){
  const g=[];
  if(kind==="conf"){
    if(!arr(v.deadlines).length)g.push("No submission deadlines collected.");
    if(!v.nextEdition)g.push("Next edition not known.");
    const ppl=["steeringCommittee","generalChairs","pcChairs","seniorPC","programCommittee"].reduce((n,k)=>n+arr(v[k]).length,0);
    if(!ppl)g.push("No committee lists collected.");
    if(!v.coreRank)g.push("CORE rank not recorded.");
  }else{
    if(num(v.impactFactor)===null)g.push("No impact factor recorded.");
    const ppl=["editorsInChief","associateEditors","editorialBoard"].reduce((n,k)=>n+arr(v[k]).length,0);
    if(!ppl)g.push("No editorial board collected.");
  }
  if(v.fetchNotes)g.push(String(v.fetchNotes));
  return g;
}
function gapNotice(g){return g.length?`<div class="notice gap"><b>Incomplete record.</b> ${g.map(esc).join(" ")}</div>`:""}
