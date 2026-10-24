/* ---------- stored contributions: rescore, remove, run a scan ---------- */
// Requests to the scan go through meta/control. The scan reads it first, does
// what it asks, then marks it done. "Run now" also starts the scheduled task
// through the Claude Code Remote connector; without it the request simply waits
// for the next scheduled run.
const SCAN_MODES=[
  ["incremental","Look for new papers since the last scan"],
  ["rescore","Rescore stored papers against the current topic, then look for new ones"],
  ["full","Start over: search the whole lookback period again"]
];
async function writeControl(patch){const rid=S.rid,body=Object.assign({},S.control||{},patch,{updatedAt:new Date().toISOString()});await S.db.doc(rp("meta/control")).set(body);if(S.rid===rid){S.control=body;renderRunStat()}return body}
async function writeConfig(patch){const rid=S.rid,body=Object.assign({},S.config||{},patch,{updatedAt:new Date().toISOString()});await S.db.doc(rp("meta/config")).set(body);if(S.rid===rid)S.config=body;return body}
function paperCounts(){
  const P=S.papers;const starred=P.filter(p=>(S.marks[p.id]||{}).star).length;
  const inc=P.filter(p=>paperCompleteness(p).level!=="complete").length;const stale=P.filter(p=>paperCompleteness(p).stale).length;
  return `<span><b class="mono">${P.length}</b> papers</span><span><b class="mono">${starred}</b> starred</span><span><b class="mono">${inc}</b> incomplete</span><span><b class="mono">${stale}</b> scored against an older topic</span><span><b class="mono">${S.confs.length}</b> conferences</span><span><b class="mono">${S.jours.length}</b> journals</span>`;
}
function maintenanceSection(){
  const RM=TP.rm||{scope:"unstarred",thr:50,venues:false};
  const c=S.control||{};const queued=c.status==="queued";
  const years=num(c.lookbackYears)||num(cfg().lookbackYears)||3;
  const defMode=TP.changed?"rescore":(queued&&c.mode)||"incremental";
  let h=`<div class="sechead"><h2>Stored contributions</h2></div><div class="counts" id="tp-counts">${paperCounts()}</div>`;
  if(queued)h+=`<div class="notice">A scan request is queued: <b>${esc((SCAN_MODES.find(m=>m[0]===c.mode)||[,"new papers"])[1].toLowerCase())}</b>${c.deriveTopicFromSeeds?", and derive the topic from the seed DOIs":""}${arr(c.retryPaperIds).length?`, and retry ${arr(c.retryPaperIds).length} incomplete paper${arr(c.retryPaperIds).length>1?"s":""}`:""}. Requested ${fmtDate(String(c.requestedAt||c.updatedAt||"").slice(0,10))}. ${c.firedAt?"The scan was started and will clear this when it finishes.":"It runs at the next scheduled scan unless you start it now."}</div>`;
  h+=`<div class="maintgrid">
  <form class="panel" onsubmit="return false"><h3>Run a scan</h3>
    <fieldset class="radios"><legend class="sr">What the scan should do</legend>${SCAN_MODES.map(([v,l])=>`<label class="chk"><input type="radio" name="tp-mode" value="${v}"${v===defMode?" checked":""}> ${esc(l)}</label>`).join("")}</fieldset>
    <div class="fld" style="max-width:220px"><label for="tp-years">Lookback for a full search (years)</label><input type="number" id="tp-years" min="1" max="15" value="${years}"></div>
    <div class="btnrow"><button type="button" class="btn primary" data-tp="run-now"${cfg().triggerId?"":" disabled title=\"No scheduled task is linked to this site\""}>Run now</button><button type="button" class="btn" data-tp="run-queue">Queue for the next scheduled scan</button></div>
    <p class="muted" style="margin:0;font-size:.8rem">Run now starts the scan in the background through your Claude account. It usually takes 20–60 minutes; the page updates as results arrive.</p>
  </form>
  <form class="panel" onsubmit="return false"><h3>Remove papers</h3>
    <div class="fld"><label for="tp-rmscope">Which papers</label><select id="tp-rmscope">${[["unstarred","Papers you haven't starred"],["below","Papers below an affinity threshold"],["incomplete","Papers that are only partially analysed"],["all","All papers"]].map(([v,l])=>`<option value="${v}"${RM.scope===v?" selected":""}>${esc(l)}</option>`).join("")}</select></div>
    <div class="fld" style="max-width:220px"><label for="tp-rmthr">Affinity threshold (%)</label><input type="number" id="tp-rmthr" min="0" max="100" step="5" value="${RM.thr}"></div>
    <label class="chk"><input type="checkbox" id="tp-rmvenues"${RM.venues?" checked":""}> Also remove all conferences and journals (for a completely new topic)</label>
    <div class="btnrow"><button type="button" class="btn danger" data-tp="rm-ask">Remove…</button></div>
    ${TP.confirm?confirmBox():""}
  </form></div>
  ${radarPanel()}
  <div data-msg="maint">${msgLine("maint")}</div>`;
  return h;
}
function rmSelection(){
  const scope=(document.getElementById("tp-rmscope")||{}).value||"unstarred";
  const thr=Number((document.getElementById("tp-rmthr")||{}).value)||0;
  const venues=!!(document.getElementById("tp-rmvenues")||{}).checked;
  const P=S.papers.filter(p=>scope==="all"?true:scope==="unstarred"?!(S.marks[p.id]||{}).star:scope==="below"?(num(p.affinity)||0)<thr:paperCompleteness(p).level!=="complete");
  TP.rm={scope,thr,venues};return{scope,thr,venues,ids:P.map(p=>p.id)};
}
function confirmBox(){
  const c=TP.confirm;const v=c.venues?` and ${S.confs.length} conferences and ${S.jours.length} journals`:"";
  return `<div class="confirm" role="alertdialog" aria-labelledby="tp-cf-t"><p id="tp-cf-t" style="margin:0"><b>Permanently delete ${c.ids.length} paper${c.ids.length===1?"":"s"}${v}?</b> This can't be undone. Download the data first if you may want it back.</p><div class="btnrow"><button type="button" class="btn danger" data-tp="rm-go"${c.ids.length||c.venues?"":" disabled"}>Delete ${c.ids.length} paper${c.ids.length===1?"":"s"}${c.venues?" and venues":""}</button><button type="button" class="btn" data-tp="rm-cancel">Keep them</button></div></div>`;
}
async function removeSelected(){
  const c=TP.confirm;if(!c)return;TP.busy=true;let done=0,failed=0;
  const P=rp("papers/"),C=rp("conferences/"),J=rp("journals/"),confs=c.venues?S.confs.slice():[],jours=c.venues?S.jours.slice():[];
  const total=c.ids.length+confs.length+jours.length;
  const step=async path=>{try{await S.db.doc(path).delete();done++}catch(e){failed++}setMsg("maint",`Deleting… ${done+failed} of ${total}`)};
  for(const id of c.ids)await step(P+id);
  for(const v of confs)await step(C+v.id);
  for(const v of jours)await step(J+v.id);
  TP.busy=false;TP.confirm=null;
  renderTopic();setMsg("maint",failed?`Deleted ${done}; ${failed} couldn't be deleted (you may not have permission).`:`Deleted ${done} record${done===1?"":"s"}.`,failed?"err":"ok");
}
async function requestScan(runNow){
  const mode=(document.querySelector('input[name="tp-mode"]:checked')||{}).value||"incremental";
  const years=Math.max(1,Math.min(15,Number((document.getElementById("tp-years")||{}).value)||3));
  TP.busy=true;setMsg("maint","Saving the request…");
  try{await writeControl({status:"queued",mode,lookbackYears:years,rescore:mode!=="incremental",requestedAt:new Date().toISOString(),requestedBy:"site",firedAt:null,lastError:null})}
  catch(e){TP.busy=false;setMsg("maint","Couldn't save the request. You may not have permission to change this site.","err");return}
  if(!runNow){TP.busy=false;TP.changed=null;renderTopic();setMsg("maint","Queued for the next scheduled scan.","ok");return}
  setMsg("maint","Starting the scan… you may be asked to allow this page to use Claude Code Remote.");
  const r=await fireScan(`Requested from the site${isRoot()?"":` for radar ${S.rid}`}: mode=${mode}, lookbackYears=${years}. Read meta/control and follow it.`);
  TP.busy=false;
  if(r.ok){try{await writeControl({firedAt:new Date().toISOString()})}catch(e){}TP.changed=null;renderTopic();setMsg("maint","Scan started. It runs in the background; new results appear here as they're written.","ok")}
  else{renderTopic();setMsg("maint",r.msg+" The request stays queued for the next scheduled scan.","err")}
}
async function fireScan(text){
  const trig=cfg().triggerId;if(!trig)return{ok:false,msg:"No scheduled task is linked to this site."};
  let mcp=null;try{mcp=await window.claude.use("mcp")}catch(e){}
  if(!mcp)return{ok:false,msg:"Starting scans isn't available in this view."};
  try{await mcp.callTool("Claude Code Remote","fire_trigger",{trigger_id:trig,text},{cache:false});return{ok:true}}
  catch(e){
    const m={server_not_connected:"The Claude Code Remote connector isn't connected for your account. Add it in Claude's Settings → Connectors.",needs_reauth:"Reconnect Claude Code Remote in Claude's Settings → Connectors.",not_in_manifest:"This page isn't allowed to start scans. You can allow it from the page's Permissions menu.",approval_required:"The scan needs your approval to start.",blocked_by_policy:"Your organization doesn't allow pages to start scans.",tool_error:"The scheduled task refused to start"+(e.message?`: ${e.message}`:"."),cancelled:"Cancelled."}[e&&e.code];
    try{await writeControl({lastError:(e&&e.code)||"error"})}catch(_){}
    return{ok:false,msg:m||"Couldn't start the scan right now."};
  }
}
async function retryPaper(id){
  const ids=arr(S.control&&S.control.retryPaperIds);if(ids.includes(id))return;
  try{await writeControl({retryPaperIds:ids.concat(id),status:"queued",mode:(S.control&&S.control.status==="queued"&&S.control.mode)||"incremental",requestedAt:(S.control&&S.control.status==="queued"&&S.control.requestedAt)||new Date().toISOString()});render(true)}
  catch(e){const b=document.querySelector(`[data-retry="${CSS.escape(id)}"]`);if(b)b.textContent="Couldn't queue the retry"}
}
function radarPanel(){
  const r=S.radars.find(x=>x.id===S.rid);
  if(!r||!S.canEdit)return"";
  return `<form class="panel" onsubmit="return false"><h3>This radar</h3><p class="muted" style="margin:0;font-size:.86rem">${r.archived?"Archived radars stay in the menu under Archived and keep their data. Their scheduled scan keeps running until you delete the task in Claude Code.":"Archiving hides the radar from the main list. Its data is kept."}${radarSlot(r)?` Scans ${esc(radarSlot(r))}.`:""}</p><div class="btnrow"><button type="button" class="btn" data-tp="${r.archived?"restore":"archive"}">${r.archived?"Restore radar":"Archive radar"}</button></div></form>`;
}
