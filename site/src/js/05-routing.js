/* ---------- routing ---------- */
function route(){const h=(location.hash||"").replace(/^#/,"");if(!h)return{view:"contributions"};const i=h.indexOf(".");if(i>0)return{view:h.slice(0,i),id:h.slice(i+1)};return{view:h}}
let lastKey="";
function render(force){
  const r=route();const key=r.view+"|"+(r.id||"");
  document.querySelectorAll("nav.tabs a").forEach(a=>{const t=a.dataset.tab;const on=t===r.view||(r.view==="conf"&&t==="conferences")||(r.view==="journal"&&t==="journals")||(r.view==="paper"&&t==="contributions");if(on)a.setAttribute("aria-current","page");else a.removeAttribute("aria-current")});
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
  else{location.hash="#contributions";return}
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
  el.innerHTML=`<span class="dot ${st}"></span><span>Last scan ${fmtDate(String(run.lastRunAt).slice(0,10))}${nn!==null?` · ${nn} new`:""}${queued?` · <a href="#topic">request queued</a>`:""}</span>`;
}
function renderBrand(){
  const b=document.querySelector(".brand");if(!b)return;
  b.innerHTML=`<b>${esc(siteName())}</b>${cfg().tagline?`<span>${esc(cfg().tagline)}</span>`:""}`;
}
