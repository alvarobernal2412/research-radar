/* ---------- routing ---------- */
function route(){
  let h=(location.hash||"").replace(/^#/,"");let rid=MAIN;
  if(!h)rid=lsGet("pr-radar",MAIN);
  else{const t=h.indexOf("~");if(t>0){rid=h.slice(0,t);h=h.slice(t+1)}}
  if(!RADAR_ID.test(rid)||(S.radarsLoaded&&!radarInfo(rid)))rid=MAIN;
  if(!h)return{rid,view:"contributions"};
  const i=h.indexOf(".");if(i>0)return{rid,view:h.slice(0,i),id:h.slice(i+1)};return{rid,view:h};
}
let lastKey="";
function render(force){
  const r=route();
  if(r.rid!==S.rid){attachRadar(r.rid);force=true}
  const key=r.rid+"|"+r.view+"|"+(r.id||"");
  document.querySelectorAll("nav.tabs a").forEach(a=>{const t=a.dataset.tab;const on=t===r.view||(r.view==="conf"&&t==="conferences")||(r.view==="journal"&&t==="journals")||(r.view==="paper"&&t==="contributions");if(on)a.setAttribute("aria-current","page");else a.removeAttribute("aria-current")});
  document.querySelectorAll("nav.tabs a").forEach(a=>a.setAttribute("href",H(a.dataset.tab)));
  renderRunStat();renderBrand();
  if(S.dbState==="none"){app.innerHTML=`<div class="empty"><b>The radar's data store isn't available here</b><span>Open this page in Claude while signed in to see the venues and papers it has collected.</span></div>`;return}
  const changed=key!==lastKey;lastKey=key;
  if(r.view!=="network"&&NET.svgSel)netStop();
  if(r.view==="contributions"){if(changed||force||!document.getElementById("flt-q"))renderContributionsShell();updateContribResults();}
  else if(r.view==="topic"){if(changed)topicReset();if(!changed&&topicBusy()){renderTopicLive();return}renderTopic()}
  else if(r.view==="conferences")renderConferences();
  else if(r.view==="journals")renderJournals();
  else if(r.view==="conf")renderConfDetail(r.id);
  else if(r.view==="journal")renderJournalDetail(r.id);
  else if(r.view==="paper")renderPaperDetail(r.id);
  else if(r.view==="network"){if(changed||!document.getElementById("net-svg"))renderNetworkShell();updateNetwork();}
  else{location.hash=H("contributions");return}
  if(changed)window.scrollTo(0,0);
}
window.addEventListener("hashchange",()=>{S.editingTopic=false;render(true)});
let raf=0;function schedule(){if(raf)return;raf=requestAnimationFrame(()=>{raf=0;render(false)})}

function renderRunStat(){
  const el=document.getElementById("runstat");const run=S.run;
  if(S.dbState==="loading"){el.innerHTML=`<span class="dot"></span><span>Connecting…</span>`;return}
  const ctl=S.control;const queued=ctl&&ctl.status==="queued";
  if(!run||!run.lastRunAt){el.innerHTML=`<span class="dot"></span><span>No scan yet · runs ${esc(scheduleText())}</span>`;return}
  const st=run.status==="ok"?"ok":run.status==="partial"?"warn":run.status==="failed"?"err":"";
  const nn=num(run.counts&&run.counts.newPapers);
  el.innerHTML=`<span class="dot ${st}"></span><span>Last scan ${fmtDate(String(run.lastRunAt).slice(0,10))}${nn!==null?` · ${nn} new`:""}${queued?` · <a href="${H("topic")}">request queued</a>`:""}</span>`;
}

