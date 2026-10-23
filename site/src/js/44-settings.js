/* ---------- sources, API keys, scan log, export ---------- */
// API keys live in data/users/<viewer id>/settings: private to the viewer (not
// even the artifact owner can read another viewer's), never exported. The scan
// runs as the owner and reads the owner's copy.
function maskKey(k){k=String(k||"");return k.length>6?"••••••"+k.slice(-4):"••••"}
function sourcesSection(){
  const st=S.settings||{};const key=st.openalexKey;
  let h=`<div class="sechead"><h2>Sources &amp; API keys</h2></div><div class="maintgrid">`;
  h+=`<form class="panel" onsubmit="return false"><h3>OpenAlex API key</h3>
    <p class="muted" style="margin:0;font-size:.86rem">OpenAlex is an open index of more than 250 million works. With a key, the scan can query it directly instead of scraping sites that block bots. Get a free key at <a href="https://openalex.org/settings/api" target="_blank" rel="noopener">openalex.org</a>.</p>`;
  if(!S.uid)h+=`<p class="muted" style="margin:0">Sign in to Claude to store an API key.</p>`;
  else if(!S.loaded.settings)h+=`<p class="muted" style="margin:0">Loading…</p>`;
  else h+=`${key&&!TP.keyEdit?`<div class="keyrow"><span class="mono">${esc(maskKey(key))}</span><span class="pill acc">Saved</span><button type="button" class="btn" data-tp="key-edit">Replace</button><button type="button" class="btn" data-tp="key-del">Remove</button></div>`:`<div class="fld"><label for="tp-key">API key</label><input type="password" id="tp-key" autocomplete="off" spellcheck="false" placeholder="Paste your OpenAlex key"></div><div class="fld"><label for="tp-mail">Contact email for OpenAlex (optional)</label><input type="search" id="tp-mail" value="${esc(st.openalexEmail||"")}" placeholder="you@university.edu"></div><div class="btnrow"><button type="button" class="btn primary" data-tp="key-save">Save key</button>${key?`<button type="button" class="btn" data-tp="key-cancel">Cancel</button>`:""}</div>`}
    <p class="muted" style="margin:0;font-size:.8rem">Stored privately for your account. Other viewers of this site can't see it, and it's never included in exports.</p>`;
  h+=`<div data-msg="key">${msgLine("key")}</div></form>`;
  h+=`<form class="panel" onsubmit="return false"><h3>Where the scan searches</h3>
    <div class="srclist">${SOURCES.map(s=>`<label class="chk"><input type="checkbox" data-src="${s.id}"${sourceOn(s.id)?" checked":""}${S.canEdit?"":" disabled"}><span><b>${esc(s.label)}</b> <span class="pill">${s.kind==="api"?"API":"via your browser"}</span><br><span class="muted" style="font-size:.8rem">${esc(s.note)}</span></span></label>`).join("")}</div>
    <p class="muted" style="margin:0;font-size:.8rem">Sources marked “via your browser” are read through Chrome on your computer, so they need it to be on during a scan. Duplicates across sources are merged by DOI, then by title, first author and year.</p>
    <div data-msg="src">${msgLine("src")}</div></form></div>`;
  return h;
}
function scanLogSection(){
  const run=S.run||{};const hist=arr(run.history);
  let h=`<div class="sechead"><h2>Scan log</h2><span class="muted" style="font-size:.8rem">Runs ${esc(scheduleText())}</span></div>`;
  if(run.lastRunAt){h+=`<div class="panel"><dl class="kv"><dt>Last scan</dt><dd>${fmtDate(String(run.lastRunAt).slice(0,10))}</dd><dt>Status</dt><dd>${esc(run.status||"—")}</dd><dt>Access</dt><dd style="font-family:var(--f-body)">${esc(run.accessMode||"—")}</dd>${run.counts?Object.entries(run.counts).map(([k,v])=>`<dt>${esc(k.replace(/([A-Z])/g," $1").toLowerCase())}</dt><dd>${esc(v)}</dd>`).join(""):""}</dl>${run.summary?`<p style="margin:0">${esc(run.summary)}</p>`:""}${arr(run.issues).length?`<div class="notice"><b>Issues:</b> ${arr(run.issues).map(esc).join(" · ")}</div>`:""}</div>`}
  else h+=`<div class="empty"><span>No scans have run yet.</span></div>`;
  if(hist.length)h+=`<div class="tblwrap"><table><thead><tr><th>Date</th><th>Status</th><th>Access</th><th>New papers</th><th>Notes</th></tr></thead><tbody>${hist.slice().reverse().map(r=>`<tr><td class="num">${fmtDate(r.date)}</td><td>${esc(r.status||"")}</td><td>${esc(r.accessMode||"")}</td><td class="num">${esc(r.newPapers??"")}</td><td style="font-size:.82rem">${esc(r.note||"")}</td></tr>`).join("")}</tbody></table></div>`;
  return h;
}
function exportSection(){
  return `<div class="sechead"><h2>Your data</h2></div><div class="btnrow"><button type="button" class="btn" data-tp="export">Download all data (JSON)</button><span data-msg="export">${msgLine("export")}</span></div><p class="muted" style="margin:0;font-size:.8rem;max-width:70ch">One file with your topic, settings for the scan, the scan log, and every paper, conference and journal. Commit it to the project's data folder to keep a history, or use it to move to another site. API keys are left out.</p>`;
}
async function saveKey(){
  const k=(document.getElementById("tp-key")||{}).value||"";const mail=((document.getElementById("tp-mail")||{}).value||"").trim();
  if(!k.trim()&&!(S.settings&&S.settings.openalexKey)){setMsg("key","Paste a key first.","err");return}
  const body=Object.assign({},S.settings||{},{openalexKey:k.trim()||S.settings.openalexKey,updatedAt:new Date().toISOString()});
  if(mail)body.openalexEmail=mail;else delete body.openalexEmail;
  try{await S.db.doc(`data/users/${S.uid}/settings`).set(body);S.settings=body;TP.keyEdit=false;TP.dirty=false;rerenderSources();setMsg("key","Saved. The next scan will use it.","ok")}
  catch(e){setMsg("key","Couldn't save the key. You need at least Contributor access to this site.","err")}
}
async function removeKey(){
  const body=Object.assign({},S.settings||{});delete body.openalexKey;body.updatedAt=new Date().toISOString();
  try{await S.db.doc(`data/users/${S.uid}/settings`).set(body);S.settings=body;rerenderSources();setMsg("key","Key removed.","ok")}catch(e){setMsg("key","Couldn't remove the key.","err")}
}
function rerenderSources(){const s=document.getElementById("tp-sources");if(s)s.innerHTML=sourcesSection()}
async function toggleSource(id,on){
  const src=Object.assign({},cfg().sources||{});SOURCES.forEach(s=>{if(typeof src[s.id]!=="boolean")src[s.id]=s.def});src[id]=on;
  try{await writeConfig({sources:src});setMsg("src",`${SOURCES.find(s=>s.id===id).label} ${on?"on":"off"} for future scans.`,"ok")}
  catch(e){setMsg("src","Couldn't save. You may not have permission to change this site.","err");rerenderSources()}
}
async function exportData(){
  let dl=null;try{dl=await window.claude.use("downloads")}catch(e){}
  if(!dl){setMsg("export","Downloads aren't available in this view.","err");return}
  const strip=d=>{const o=Object.assign({},d);return o};
  const data={format:"research-radar/v1",exportedAt:new Date().toISOString(),site:{name:siteName(),radar:S.rid},topic:S.topic,config:S.config,run:S.run,control:S.control,papers:S.papers.map(strip),conferences:S.confs.map(strip),journals:S.jours.map(strip)};
  const slug=siteName().toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")||"radar";
  try{await dl.save({filename:`${slug}-data-${today()}.json`,data:JSON.stringify(data,null,2)});setMsg("export","Saved.","ok")}
  catch(e){if(e&&e.code!=="declined")setMsg("export","Couldn't save the file.","err")}
}

/* ----- topic page events ----- */
app.addEventListener("click",e=>{
  const rt=e.target.closest("[data-retry]");if(rt){e.preventDefault();rt.disabled=true;rt.textContent="Queuing…";retryPaper(rt.dataset.retry);return}
  const b=e.target.closest("[data-tp]");if(!b||route().view!=="topic")return;
  const a=b.dataset.tp;
  if(a==="edit"){TP.mode="edit";TP.draft=null;TP.msg={};renderTopic()}
  else if(a==="derive"){TP.mode="derive";TP.msg={};renderTopic()}
  else if(a==="cancel"){if(TP.derive.ctl)TP.derive.ctl.abort();TP.mode=null;TP.draft=null;TP.dirty=false;TP.msg={};TP.derive={docs:[],text:"",useCurrent:true,status:"",busy:false,ctl:null};renderTopic()}
  else if(a==="save")saveTopic();
  else if(a==="propose")proposeTopic();
  else if(a==="stop"){if(TP.derive.ctl)TP.derive.ctl.abort()}
  else if(a==="queue-derive")queueDerive();
  else if(a==="rmdoc"){TP.derive.docs.splice(Number(b.dataset.i),1);rerenderTopicSection()}
  else if(a==="archive")setArchived(true);
  else if(a==="restore")setArchived(false);
  else if(a==="run-now")requestScan(true);
  else if(a==="run-queue")requestScan(false);
  else if(a==="rm-ask"){TP.confirm=rmSelection();const s=document.getElementById("tp-maint");if(s)s.innerHTML=maintenanceSection()}
  else if(a==="rm-cancel"){TP.confirm=null;const s=document.getElementById("tp-maint");if(s)s.innerHTML=maintenanceSection()}
  else if(a==="rm-go"){b.disabled=true;removeSelected()}
  else if(a==="key-save")saveKey();
  else if(a==="key-edit"){TP.keyEdit=true;rerenderSources()}
  else if(a==="key-cancel"){TP.keyEdit=false;TP.dirty=false;rerenderSources()}
  else if(a==="key-del")removeKey();
  else if(a==="export")exportData();
});
app.addEventListener("change",e=>{
  if(route().view!=="topic")return;
  const s=e.target.closest("[data-src]");if(s){toggleSource(s.dataset.src,s.checked);return}
  if(e.target.id==="tp-files"&&e.target.files&&e.target.files.length){addDocs([...e.target.files]);e.target.value=""}
  if(/^tp-rm/.test(e.target.id)){rmSelection();if(TP.confirm){TP.confirm=null;const m=document.getElementById("tp-maint");if(m)m.innerHTML=maintenanceSection()}}
});
app.addEventListener("input",e=>{if(route().view==="topic"&&e.target.matches("input,textarea"))TP.dirty=true});
app.addEventListener("dragover",e=>{const z=e.target.closest&&e.target.closest("#tp-drop");if(z){e.preventDefault();z.classList.add("over")}});
app.addEventListener("dragleave",e=>{const z=e.target.closest&&e.target.closest("#tp-drop");if(z)z.classList.remove("over")});
app.addEventListener("drop",e=>{const z=e.target.closest&&e.target.closest("#tp-drop");if(!z)return;e.preventDefault();z.classList.remove("over");const f=[...(e.dataTransfer&&e.dataTransfer.files||[])];if(f.length)addDocs(f)});
