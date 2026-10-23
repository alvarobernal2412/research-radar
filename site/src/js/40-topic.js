/* ---------- topic & scans page ---------- */
// Sections: your topic (view / edit / derive from papers) · stored contributions
// (rescore, remove, run a scan) · sources & API keys · scan log · data export.
const TP={mode:null,draft:null,dirty:false,changed:null,msg:{},busy:false,confirm:null,
  derive:{docs:[],text:"",useCurrent:true,status:"",busy:false,ctl:null}};
function topicReset(){if(TP.busy||TP.derive.busy)return;TP.mode=null;TP.draft=null;TP.dirty=false;TP.confirm=null;TP.msg={};TP.derive={docs:[],text:"",useCurrent:true,status:"",busy:false,ctl:null}}
function topicBusy(){return !!(TP.mode||TP.dirty||TP.busy||TP.confirm||TP.derive.busy)}
function themesEqual(a,b){const n=t=>JSON.stringify({d:(t&&t.description)||"",t:arr(t&&t.themes).map(x=>[x.name,x.weight??1,arr(x.keywords)]),e:arr(t&&t.exclude)});return n(a)===n(b)}
function msgLine(k){const m=TP.msg[k];return m?`<span class="tpmsg ${m.kind||""}" role="status">${esc(m.text)}</span>`:`<span class="tpmsg" role="status"></span>`}
function setMsg(k,text,kind){TP.msg[k]={text,kind};const el=document.querySelector(`[data-msg="${k}"]`);if(el)el.innerHTML=msgLine(k)}

function renderTopic(){
  const t=S.topic||{};
  let h=`<div class="pagehead"><div><h1>Topic &amp; scans</h1><p>Every paper and venue is scored against this profile. ${S.canEdit?"Change it here, or derive it from papers you already know, and the next scan uses the new version.":""}</p></div></div>`;
  if(TP.changed)h+=topicChangedBanner();
  h+=`<section class="block" id="tp-topic">${TP.mode==="edit"?topicEditor():TP.mode==="derive"?derivePanel():topicView(t)}</section>`;
  if(S.canEdit)h+=`<section class="block" id="tp-maint">${maintenanceSection()}</section>`;
  h+=`<section class="block" id="tp-sources">${sourcesSection()}</section>`;
  h+=`<section class="block" id="tp-log">${scanLogSection()}</section>`;
  h+=`<section class="block">${exportSection()}</section>`;
  app.innerHTML=h;
}
// Called on data updates while the viewer is mid-edit: refresh only the read-only parts.
function renderTopicLive(){const l=document.getElementById("tp-log");if(l)l.innerHTML=scanLogSection();const c=document.getElementById("tp-counts");if(c)c.innerHTML=paperCounts()}

function topicView(t){
  const themes=arr(t.themes);
  let h=`<div class="sechead"><h2>Your topic</h2><span class="muted" style="font-size:.8rem">${t.updatedAt?`Revision ${topicRevision()} · updated ${fmtDate(t.updatedAt)}${t.updatedBy?` by ${esc(t.updatedBy)}`:""}`:""}</span></div>`;
  if(S.canEdit)h+=`<div class="btnrow"><button type="button" class="btn" data-tp="edit">Edit topic</button><button type="button" class="btn" data-tp="derive">Derive from papers</button></div>`;
  h+=t.description?`<p style="max-width:75ch;margin:0">${esc(t.description)}</p>`:`<div class="empty"><b>No topic yet</b><span>Describe your topic, or derive it from a few papers that define it.</span></div>`;
  if(themes.length)h+=`<div class="tblwrap"><table><thead><tr><th>Theme</th><th>Weight</th><th>Keywords</th></tr></thead><tbody>${themes.map(x=>`<tr><td><b>${esc(x.name)}</b></td><td class="num">${esc(x.weight??1)}</td><td>${arr(x.keywords).map(k=>`<span class="pill" style="margin:0 4px 4px 0">${esc(k)}</span>`).join("")}</td></tr>`).join("")}</tbody></table></div>`;
  if(arr(t.exclude).length)h+=`<p class="muted" style="margin:0;font-size:.85rem">Lowers affinity: ${esc(arr(t.exclude).join(", "))}</p>`;
  const seeds=arr(t.seeds);
  if(seeds.length)h+=`<details class="seeds"><summary>${seeds.length} seed paper${seeds.length>1?"s":""} this topic was derived from</summary><ul>${seeds.map(s=>`<li>${esc(s.title||s.doi||"Untitled")}${s.doi?` <a href="https://doi.org/${esc(s.doi)}" target="_blank" rel="noopener">DOI ↗</a>`:""}</li>`).join("")}</ul></details>`;
  if(t.selfName)h+=`<p class="muted" style="margin:0;font-size:.85rem">You appear in the network as ${esc(t.selfName)}.</p>`;
  return h;
}

function topicEditor(){
  const t=TP.draft||S.topic||{};
  const lines=arr(t.themes).map(x=>`${x.name} | ${x.weight??1} | ${arr(x.keywords).join(", ")}`).join("\n");
  return `<div class="sechead"><h2>${TP.draft?"Review the proposed topic":"Edit your topic"}</h2></div>
  ${TP.draft?`<div class="notice">Claude proposed this from ${TP.draft._from||"your papers"}. Edit anything before you save. Nothing changes until you save.</div>`:""}
  <form class="panel" id="tp-form" onsubmit="return false">
    <div class="fld"><label for="tp-desc">Topic description</label><textarea id="tp-desc" rows="5">${esc(t.description||"")}</textarea></div>
    <div class="fld"><label for="tp-themes">Themes, one per line: name | weight (0–1) | keywords, comma-separated</label><textarea id="tp-themes" rows="10">${esc(lines)}</textarea></div>
    <div class="fld"><label for="tp-ex">Exclude: comma-separated terms that should lower affinity</label><textarea id="tp-ex" rows="2">${esc(arr(t.exclude).join(", "))}</textarea></div>
    <div class="fld"><label for="tp-self">Your name as it appears on papers (marks you in the network)</label><input type="search" id="tp-self" value="${esc((S.topic&&S.topic.selfName)||"")}" placeholder="e.g. Ada Lovelace"></div>
    <div class="btnrow"><button type="button" class="btn primary" data-tp="save">Save topic</button><button type="button" class="btn" data-tp="cancel">Cancel</button><span data-msg="topic">${msgLine("topic")}</span></div>
  </form>`;
}
function parseThemes(txt){return txt.split("\n").map(l=>l.trim()).filter(Boolean).map(l=>{const [n,w,k]=l.split("|").map(s=>(s||"").trim());const wt=parseFloat(w);return{name:n,weight:isFinite(wt)?Math.max(0,Math.min(1,wt)):1,keywords:(k||"").split(",").map(s=>s.trim()).filter(Boolean)}}).filter(x=>x.name)}
async function saveTopic(){
  const old=S.topic||{};
  const next={description:document.getElementById("tp-desc").value.trim(),themes:parseThemes(document.getElementById("tp-themes").value),exclude:document.getElementById("tp-ex").value.split(",").map(s=>s.trim()).filter(Boolean)};
  if(!next.themes.length){setMsg("topic","Add at least one theme.","err");return}
  const changed=!themesEqual(old,next);
  const body=Object.assign({},old,next,{selfName:document.getElementById("tp-self").value.trim(),updatedAt:new Date().toISOString(),updatedBy:TP.draft?"you (from seed papers)":"you",revision:topicRevision()+(changed?1:0)});
  if(TP.draft&&arr(TP.draft.seeds).length)body.seeds=TP.draft.seeds;
  if(!body.selfName)delete body.selfName;
  setMsg("topic","Saving…");TP.busy=true;
  try{await S.db.doc(rp("meta/topic")).set(body);S.topic=body;TP.busy=false;TP.mode=null;TP.draft=null;TP.dirty=false;
    if(changed&&S.papers.length)TP.changed={revision:body.revision};renderTopic();
    if(TP.changed){const b=document.getElementById("tp-changed");if(b)b.scrollIntoView({block:"start"})}}
  catch(e){TP.busy=false;setMsg("topic",e&&e.code==="invalid_argument"?"You don't have permission to change the topic.":"Couldn't save. Try again in a moment.","err")}
}
function topicChangedBanner(){
  const n=S.papers.length;
  return `<div class="notice changed" id="tp-changed"><b>Your topic changed (revision ${TP.changed.revision}).</b> The ${n} stored paper${n===1?" was":"s were"} scored against the previous version, so their affinity is out of date. Choose below whether to rescore them, remove some, or start a fresh search.</div>`;
}

/* ----- derive topic from papers ----- */
function derivePanel(){
  const D=TP.derive;
  const dois=extractDois(D.text);
  return `<div class="sechead"><h2>Derive your topic from papers</h2></div>
  <div class="panel" style="gap:14px">
    <p style="margin:0;max-width:70ch">Add a few papers that define your topic: your own, or the ones closest to what you work on. Claude reads their titles, abstracts and introductions and proposes themes and keywords. You review the result before anything is saved.</p>
    <label class="dropzone" id="tp-drop" for="tp-files"><input type="file" id="tp-files" accept=".pdf,.txt,.md,application/pdf,text/plain" multiple><b>Drop PDFs here</b><span>or click to choose files. Only the first pages are read, in your browser.</span></label>
    ${D.docs.length?`<ul class="doclist">${D.docs.map((d,i)=>`<li><span class="dot ${d.state==="ok"?"ok":d.state==="err"?"err":""}"></span><span class="nm">${esc(d.title||d.name)}</span><span class="muted">${d.state==="ok"?`${Math.round(d.text.length/100)/10}k characters`:d.state==="err"?esc(d.err):"Reading…"}</span><button type="button" class="icobtn" data-tp="rmdoc" data-i="${i}">Remove</button></li>`).join("")}</ul>`:""}
    <div class="fld"><label for="tp-paste">Or paste abstracts, titles or DOIs (separate papers with a blank line)</label><textarea id="tp-paste" rows="7" placeholder="10.1007/978-3-032-40795-5_31&#10;&#10;Title of another paper&#10;Its abstract…">${esc(D.text)}</textarea></div>
    ${S.topic&&arr(S.topic.themes).length?`<label class="chk"><input type="checkbox" id="tp-usecur"${D.useCurrent?" checked":""}> Refine my current topic instead of starting from scratch</label>`:""}
    <div class="btnrow"><button type="button" class="btn primary" data-tp="propose"${D.busy?" disabled":""}>Propose topic with Claude</button>${D.busy?`<button type="button" class="btn" data-tp="stop">Stop</button>`:""}<button type="button" class="btn" data-tp="queue-derive"${dois.length?"":" disabled"} title="For DOIs only: the scan looks them up in OpenAlex and derives the topic.">Let the next scan derive it${dois.length?` (${dois.length} DOI${dois.length>1?"s":""})`:""}</button><button type="button" class="btn" data-tp="cancel">Cancel</button></div>
    <div data-msg="derive">${msgLine("derive")}</div>
    <p class="muted" style="margin:0;font-size:.8rem">DOIs alone can't be read here, because this page can't reach the web. Paste the abstracts or drop the PDFs to get a proposal now, or let the next scan look the DOIs up.</p>
  </div>`;
}
function extractDois(s){return [...new Set((String(s||"").match(/10\.\d{4,9}\/[^\s"<>]+/g)||[]).map(d=>d.replace(/[.,;)\]]+$/,"").toLowerCase()))]}
let pdfLib=null;
function loadScript(url){return new Promise((res,rej)=>{const s=document.createElement("script");s.src=url;s.onload=res;s.onerror=()=>rej(new Error("Couldn't load "+url));document.head.appendChild(s)})}
function ensurePdf(){
  // The worker build registers a global handler, so pdf.js runs on the main thread (the page can't start cross-origin workers).
  if(!pdfLib)pdfLib=loadScript(VENDOR_LAZY["pdf.js worker"]).then(()=>loadScript(VENDOR_LAZY["pdf.js"])).then(()=>{if(!window.pdfjsLib)throw new Error("PDF reader unavailable");return window.pdfjsLib});
  return pdfLib;
}
async function readDoc(file){
  if(/\.(txt|md)$/i.test(file.name)||file.type.startsWith("text/")){const t=await file.text();return{title:t.split("\n").find(l=>l.trim())?.trim().slice(0,200)||file.name,text:t.replace(/\s+/g," ").slice(0,9000)}}
  const lib=await ensurePdf();
  const doc=await lib.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false}).promise;
  let out="";for(let i=1;i<=Math.min(doc.numPages,4)&&out.length<9000;i++){const pg=await doc.getPage(i);const tc=await pg.getTextContent();out+=tc.items.map(x=>x.str).join(" ")+"\n"}
  let title="";try{const md=await doc.getMetadata();title=(md&&md.info&&md.info.Title)||""}catch(e){}
  const text=out.replace(/\s+/g," ").trim().slice(0,9000);
  if(text.length<200)throw new Error("No text found (scanned PDF?)");
  return{title:title&&title.length>8?title:text.slice(0,140),text};
}
async function addDocs(files){
  const D=TP.derive;TP.dirty=true;
  for(const f of files){if(D.docs.length>=12){setMsg("derive","Up to 12 papers at a time.","err");break}
    const d={name:f.name,state:"reading",text:"",title:""};D.docs.push(d);rerenderTopicSection();
    try{const r=await readDoc(f);d.title=r.title;d.text=r.text;d.state="ok"}catch(e){d.state="err";d.err=(e&&e.message)||"Couldn't read this file"}
    rerenderTopicSection();}
}
function rerenderTopicSection(){const s=document.getElementById("tp-topic");if(!s)return;const ta=document.getElementById("tp-paste");if(ta)TP.derive.text=ta.value;s.innerHTML=TP.mode==="edit"?topicEditor():TP.mode==="derive"?derivePanel():topicView(S.topic||{})}
async function proposeTopic(){
  const D=TP.derive;const ta=document.getElementById("tp-paste");if(ta)D.text=ta.value;
  const cur=document.getElementById("tp-usecur");if(cur)D.useCurrent=cur.checked;
  const docs=D.docs.filter(d=>d.state==="ok");
  const pasted=D.text.split(/\n\s*\n/).map(s=>s.trim()).filter(s=>s&&!/^10\.\d{4,9}\/\S+$/.test(s));
  if(!docs.length&&!pasted.length){setMsg("derive","Add at least one PDF or pasted abstract. DOIs alone need the scan.","err");return}
  let sample=null;try{sample=await window.claude.use("sample")}catch(e){}
  if(!sample){setMsg("derive","Asking Claude isn't available in this view. Use “Let the next scan derive it” instead.","err");return}
  const papers=[...docs.map(d=>`TITLE: ${d.title}\nTEXT: ${d.text.slice(0,7000)}`),...pasted.map(p=>`TEXT: ${p.slice(0,7000)}`)];
  const current=D.useCurrent&&S.topic&&arr(S.topic.themes).length?`\nThe researcher's CURRENT topic profile, to refine rather than replace (keep themes that still fit, rename or merge where the papers suggest it):\n${JSON.stringify({description:S.topic.description,themes:S.topic.themes,exclude:S.topic.exclude})}\n`:"";
  const prompt=`You help a researcher define the topic profile that a literature-monitoring tool uses to find and score related papers.
Read the seed papers below and propose a profile that captures the research topic they share.
${current}
Rules:
- description: 2-4 sentences in plain language, naming the core problem, the methods and the application area.
- themes: 5 to 9 themes. Each theme is one facet a relevant paper could be about. weight is 1.0 for the core facets and 0.5-0.9 for adjacent ones.
- keywords: 5 to 10 per theme, written the way they appear in paper titles and abstracts (include common synonyms and acronyms).
- exclude: 0 to 6 terms for look-alike fields that share vocabulary but are not this topic.
- seeds: one entry per seed paper with its title and DOI if the text contains one (else null).
Reply with only JSON in exactly this shape:
{"description":"...","themes":[{"name":"...","weight":1.0,"keywords":["..."]}],"exclude":["..."],"seeds":[{"title":"...","doi":null}]}

SEED PAPERS (${papers.length}):
${papers.map((p,i)=>`--- Paper ${i+1} ---\n${p}`).join("\n\n")}`;
  D.busy=true;D.ctl=new AbortController();rerenderTopicSection();setMsg("derive","Claude is reading the papers… this usually takes under a minute.");
  try{
    const r=await sample.json(prompt,{signal:D.ctl.signal,cache:false});
    if(!r||!Array.isArray(r.themes)||!r.themes.length)throw{code:"invalid_json"};
    const seeds=arr(r.seeds).map(s=>({title:String(s&&s.title||"").slice(0,300),doi:s&&s.doi?String(s.doi).toLowerCase():null})).filter(s=>s.title||s.doi);
    extractDois(D.text).forEach(d=>{if(!seeds.some(s=>s.doi===d))seeds.push({title:"",doi:d})});
    TP.draft={description:String(r.description||""),themes:r.themes.map(x=>({name:String(x.name||"").trim(),weight:Math.max(0,Math.min(1,Number(x.weight)||1)),keywords:arr(x.keywords).map(String)})).filter(x=>x.name),exclude:arr(r.exclude).map(String),seeds,_from:`${papers.length} paper${papers.length>1?"s":""}`};
    D.busy=false;TP.mode="edit";TP.msg={};renderTopic();
  }catch(e){
    D.busy=false;rerenderTopicSection();
    const m={cancelled:"Stopped.",not_granted:"You didn't allow this page to ask Claude, so it can't propose a topic here.",rate_limited:"Claude is busy or you've reached a usage limit. Try again in a few minutes.",invalid_json:"Claude's answer couldn't be read. Try again, or with fewer papers.",prompt_too_large:"That's too much text at once. Remove a few papers and try again."}[e&&e.code];
    setMsg("derive",m||"Couldn't get a proposal. Try again.","err");
  }
}
async function queueDerive(){
  const ta=document.getElementById("tp-paste");if(ta)TP.derive.text=ta.value;
  const dois=extractDois(TP.derive.text);if(!dois.length)return;
  const topic=Object.assign({},S.topic||{});const seeds=arr(topic.seeds).slice();
  dois.forEach(d=>{if(!seeds.some(s=>s.doi===d))seeds.push({title:"",doi:d})});
  TP.busy=true;setMsg("derive","Saving…");
  try{topic.seeds=seeds;await S.db.doc(rp("meta/topic")).set(topic);S.topic=topic;
    await writeControl({status:"queued",deriveTopicFromSeeds:true,mode:(S.control&&S.control.status==="queued"&&S.control.mode)||"incremental",requestedAt:new Date().toISOString()});
    TP.busy=false;TP.mode=null;TP.dirty=false;TP.derive.text="";renderTopic();
    setMsg("maint",`Queued: the next scan will look up ${dois.length} DOI${dois.length>1?"s":""} and derive your topic. Run it now below, or wait for the schedule.`,"ok");
  }catch(e){TP.busy=false;setMsg("derive","Couldn't save the request. Try again.","err")}
}
