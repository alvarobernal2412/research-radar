/* ---------- radar picker and "New radar" ---------- */
// The brand in the menu bar is a dropdown listing the radars. "New radar" cannot create the scheduled
// task from the page, so it fills in a prompt for Claude Code (docs/add-radar-prompt.md) that does.
const RM={open:false,modal:null,sig:""};
// Filled in by site/build.py from docs/add-radar-prompt.md.
const ADD_RADAR_PROMPT=/*@ADD_RADAR_PROMPT@*/"";
const DAY_NAMES=["Mondays","Tuesdays","Wednesdays","Thursdays","Fridays","Saturdays","Sundays"];
function radarSlot(r){return r.scheduleText||(Number.isInteger(r.weekday)?`${DAY_NAMES[r.weekday]} at ${r.time||"09:00"}`:"")}
function slugify(s){return String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,30).replace(/-+$/,"")}
function radarItem(r){
  const on=r.id===S.rid;
  return `<button type="button" role="menuitemradio" aria-checked="${on}" class="rmi${on?" on":""}" data-radar="${esc(r.id)}"><span>${esc(r.name||r.id)}</span>${radarSlot(r)?`<small>${esc(radarSlot(r))}</small>`:""}</button>`;
}
function radarMenuHtml(){
  const L=radarList(),act=L.filter(r=>!r.archived),arch=L.filter(r=>r.archived);
  return `<div class="rmenu" id="radar-menu" role="menu" aria-label="Radars">${act.map(radarItem).join("")}${arch.length?`<div class="rmh">Archived</div>${arch.map(radarItem).join("")}`:""}${S.canEdit?`<div class="rsep"></div><button type="button" role="menuitem" class="rmi add" data-rm="new">New radar…</button>`:""}</div>`;
}
function renderBrand(){
  const b=document.querySelector(".brand");if(!b)return;
  const L=radarList();
  const sig=JSON.stringify([siteName(),cfg().tagline,S.rid,RM.open,S.canEdit,L.map(r=>[r.id,r.name,r.archived,radarSlot(r)])]);
  if(sig===RM.sig)return;RM.sig=sig;
  b.innerHTML=`<button type="button" class="brand-btn" id="radar-btn" aria-haspopup="menu" aria-expanded="${RM.open}" aria-controls="radar-menu" data-rm="toggle"><span class="brand-name"><b>${esc(siteName())}</b>${cfg().tagline?`<span>${esc(cfg().tagline)}</span>`:""}</span><svg class="chev" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 4.5l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>${RM.open?radarMenuHtml():""}`;
}
function setMenu(open){
  RM.open=open;RM.sig="";renderBrand();
  if(open){const on=document.querySelector("#radar-menu .rmi.on")||document.querySelector("#radar-menu .rmi");if(on)on.focus()}
}
function switchRadar(id){
  setMenu(false);
  if(id===S.rid)return;
  const v=route().view;const list=["conf","journal","paper"].includes(v)?({conf:"conferences",journal:"journals",paper:"contributions"})[v]:v;
  location.hash="#"+(id===MAIN?"":id+"~")+list;
}
/* new radar dialog */
function rmClose(){const m=document.getElementById("radar-modal");if(m)m.remove();RM.modal=null;const b=document.getElementById("radar-btn");if(b)b.focus()}
function rmProblem(name){
  const id=slugify(name);
  if(!name.trim())return"Give the radar a name.";
  if(!RADAR_ID.test(id))return"Use at least two letters or digits in the name.";
  if(id===MAIN||radarList().some(r=>r.id===id))return`A radar with the id "${id}" already exists. Use a different name.`;
  return"";
}
function rmPrompt(f){
  const L=radarList().map(r=>`${r.id} ("${r.name||r.id}")`).join(", ");
  return ADD_RADAR_PROMPT.split("{{RADAR_NAME}}").join(f.name.trim()).split("{{RADAR_ID}}").join(slugify(f.name)).split("{{TAGLINE}}").join(f.tagline.trim()||"your topic in a few words").split("{{TOPIC}}").join(f.topic.trim()||"(not given: I will set the topic on the site)").split("{{EXISTING}}").join(L);
}
function rmShell(inner){
  let m=document.getElementById("radar-modal");
  if(!m){m=document.createElement("div");m.id="radar-modal";m.className="modal-back";document.body.appendChild(m)}
  m.innerHTML=`<div class="modal" role="dialog" aria-modal="true" aria-labelledby="rm-title">${inner}</div>`;
  return m;
}
function rmForm(f,err){
  rmShell(`<h2 id="rm-title">New radar</h2><p class="muted" style="margin:0">A radar tracks one research topic with its own papers, venues and weekly scan. The scan gets its own weekday, so no source is queried twice in one day. Scheduled scans have to be created from Claude Code: fill this in and copy the prompt it produces.</p>
  <div class="fld"><label for="rm-name">Name</label><input type="text" id="rm-name" value="${esc(f.name)}" maxlength="60" autocomplete="off"><span class="muted" id="rm-id" style="font-size:.78rem">${f.name.trim()?`Radar id: ${esc(slugify(f.name)||"…")}`:""}</span></div>
  <div class="fld"><label for="rm-tagline">Radar description</label><input type="text" id="rm-tagline" value="${esc(f.tagline)}" maxlength="80" autocomplete="off" placeholder="What this radar tracks, in a few words"></div>
  <div class="fld"><label for="rm-topic">The topic in a sentence or two</label><textarea id="rm-topic" rows="3" maxlength="600">${esc(f.topic)}</textarea></div>
  <div class="tpmsg err" id="rm-err" role="alert">${esc(err||"")}</div>
  <div class="btnrow"><button type="button" class="btn primary" data-rm="make">Create prompt</button><button type="button" class="btn" data-rm="close">Cancel</button></div>`);
  const n=document.getElementById("rm-name");if(n){n.focus();n.setSelectionRange(n.value.length,n.value.length)}
}
function rmShow(f){
  rmShell(`<h2 id="rm-title">Prompt for Claude Code</h2><p class="muted" style="margin:0">Paste this into Claude Code from your Research Radar clone. It asks a few questions, picks the weekday for "${esc(f.name.trim())}", creates the scheduled task and registers the radar here. The new radar appears in the menu when it's done.</p>
  <div class="fld"><label for="rm-prompt">Prompt</label><textarea id="rm-prompt" rows="14" readonly>${esc(rmPrompt(f))}</textarea></div>
  <div class="tpmsg" id="rm-msg" role="status"></div>
  <div class="btnrow"><button type="button" class="btn primary" data-rm="copy">Copy prompt</button><button type="button" class="btn" data-rm="save">Save as file</button><button type="button" class="btn" data-rm="back">Back</button><button type="button" class="btn" data-rm="close">Close</button></div>`);
  document.getElementById("rm-prompt").focus();
}
function rmMsg(t,kind){const el=document.getElementById("rm-msg");if(el){el.textContent=t;el.className="tpmsg"+(kind?" "+kind:"")}}
function rmFields(){const v=id=>(document.getElementById(id)||{}).value||"";return{name:v("rm-name"),tagline:v("rm-tagline"),topic:v("rm-topic")}}
async function rmCopy(){
  const ta=document.getElementById("rm-prompt");if(!ta)return;
  try{await navigator.clipboard.writeText(ta.value);rmMsg("Copied.","ok")}
  catch(e){ta.focus();ta.select();rmMsg("Press Ctrl+C (or ⌘C) to copy the selected text.")}
}
async function rmSave(){
  let dl=null;try{dl=await window.claude.use("downloads")}catch(e){}
  if(!dl){rmMsg("Downloads aren't available in this view. Use Copy prompt.","err");return}
  const f=RM.modal;
  try{await dl.save({filename:`add-radar-${slugify(f.name)}.txt`,data:rmPrompt(f)});rmMsg("Saved.","ok")}
  catch(e){if(e&&e.code!=="declined")rmMsg("Couldn't save the file.","err")}
}
function rmAct(act){
  if(act==="new"){setMenu(false);RM.modal={name:"",tagline:"",topic:""};rmForm(RM.modal);return}
  if(act==="close"){rmClose();return}
  if(act==="make"){const f=rmFields();const p=rmProblem(f.name);if(p){RM.modal=f;rmForm(f,p);return}RM.modal=f;rmShow(f);return}
  if(act==="back"){rmForm(RM.modal);return}
  if(act==="copy"){rmCopy();return}
  if(act==="acopy"){rmCopy();return}
  if(act==="asave"){rmActionSave();return}
  if(act==="save"){rmSave();return}
}
document.addEventListener("click",e=>{
  const t=e.target.closest("[data-rm]");
  if(t){e.preventDefault();if(t.dataset.rm==="toggle")setMenu(!RM.open);else rmAct(t.dataset.rm);return}
  const r=e.target.closest("[data-radar]");if(r){e.preventDefault();switchRadar(r.dataset.radar);return}
  if(e.target.id==="radar-modal"){rmClose();return}
  if(RM.open&&!e.target.closest(".brand"))setMenu(false);
});
document.addEventListener("input",e=>{
  if(e.target.id==="rm-confirm"){const ok=e.target.value.trim()===RM.modal.name;document.querySelectorAll('[data-rm="acopy"],[data-rm="asave"]').forEach(b=>{b.disabled=!ok})}
  if(e.target.id==="rm-name"){const el=document.getElementById("rm-id");if(el){const s=slugify(e.target.value);el.textContent=e.target.value.trim()?`Radar id: ${s||"…"}`:""}}
});
document.addEventListener("keydown",e=>{
  if(e.key==="Escape"){if(document.getElementById("radar-modal")){rmClose();return}if(RM.open){setMenu(false);const b=document.getElementById("radar-btn");if(b)b.focus()}return}
  if(RM.open&&(e.key==="ArrowDown"||e.key==="ArrowUp")){
    const items=[...document.querySelectorAll("#radar-menu [role^='menuitem']")];if(!items.length)return;
    e.preventDefault();const i=items.indexOf(document.activeElement);
    items[(i+(e.key==="ArrowDown"?1:-1)+items.length)%items.length].focus();
  }
});
/* archive / restore (Topic & scans) */
async function setArchived(flag){
  const r=S.radars.find(x=>x.id===S.rid);if(!r||!S.db)return;
  const {id,...rest}=r;try{await S.db.doc(`radars/${S.rid}`).set(Object.assign({},rest,{archived:flag}));setMsg("maint",flag?"Radar archived. It stays in the menu under Archived.":"Radar restored.","ok")}
  catch(e){setMsg("maint","Couldn't change the radar. You may not have permission.","err")}
}
/* stop / resume / delete (Topic & scans): the page can't touch the scheduled task, so it writes the message for the artifact chat */
function radarActionPrompt(kind,r){
  const task=r.triggerId||(r.id===S.rid&&cfg().triggerId)||"(look it up in the radar's config)";
  const head=`This is about the radar "${r.name||r.id}" (id: ${r.id}, scheduled task: ${task}) in this Research Radar. Only touch this radar; leave every other radar alone.`;
  if(kind==="stop")return `${head}\n\nStop its scheduled scan: pause the scheduled task so it no longer runs. Do not delete the task, and keep all of the radar's papers, venues and settings. Then set paused: true in radars/${r.id} (keep its other fields) so the site shows the radar as paused. Tell me what you changed.`;
  if(kind==="resume")return `${head}\n\nResume its scheduled scan: re-enable the paused scheduled task with its existing schedule. Then set paused: false in radars/${r.id} (keep its other fields). Tell me what you changed.`;
  return `${head}\n\nDelete this radar completely. In this order: (1) delete the scheduled task; (2) delete every document under radars/${r.id}/ (papers, conferences, journals, meta/*), and the viewers' marks-${r.id} documents under data/users/ that you can reach; (3) delete the registry document radars/${r.id}. Do not touch the main radar's documents at the database root or the shared scan lock unless it is held by this radar's scan. List what you deleted, and anything you could not.`;
}
function radarActionDialog(kind){
  const r=S.radars.find(x=>x.id===S.rid)||radarInfo(S.rid);if(!r)return;
  const del=kind==="delete",nm=r.name||r.id;
  RM.modal={act:kind,name:nm};
  rmShell(`<h2 id="rm-title">${{stop:"Stop scans",resume:"Resume scans",delete:"Delete radar"}[kind]}: ${esc(nm)}</h2><p class="muted" style="margin:0">${del?`This can't be undone. Send this message in the artifact chat (the Claude conversation for this page); it names the radar so only "${esc(nm)}" is removed.`:`Send this message in the artifact chat (the Claude conversation for this page). It names the radar so only "${esc(nm)}" is affected.`}</p>${del?`<div class="fld"><label for="rm-confirm">Type the radar's name to enable the prompt</label><input type="text" id="rm-confirm" autocomplete="off" placeholder="${esc(nm)}"></div>`:""}
  <div class="fld"><label for="rm-prompt">Message</label><textarea id="rm-prompt" rows="9" readonly>${esc(radarActionPrompt(kind,r))}</textarea></div>
  <div class="tpmsg" id="rm-msg" role="status"></div>
  <div class="btnrow"><button type="button" class="btn primary" data-rm="acopy"${del?" disabled":""}>Copy message</button><button type="button" class="btn" data-rm="asave"${del?" disabled":""}>Save as file</button><button type="button" class="btn" data-rm="close">Close</button></div>`);
}
async function rmActionSave(){
  let dl=null;try{dl=await window.claude.use("downloads")}catch(e){}
  if(!dl){rmMsg("Downloads aren't available in this view. Use Copy message.","err");return}
  const r=radarInfo(S.rid)||{id:S.rid};
  try{await dl.save({filename:`${RM.modal.act}-radar-${r.id}.txt`,data:document.getElementById("rm-prompt").value});rmMsg("Saved.","ok")}
  catch(e){if(e&&e.code!=="declined")rmMsg("Couldn't save the file.","err")}
}
