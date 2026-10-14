/* ---------- state ---------- */
// Shared documents: papers/*, conferences/*, journals/*, meta/topic, meta/run, meta/config, meta/control.
// Private per viewer: data/users/<id>/marks, data/users/<id>/settings (holds API keys).
const S={confs:[],jours:[],papers:[],topic:null,run:null,config:null,control:null,settings:null,marks:{},sel:new Set(),shown:[],loaded:{c:false,j:false,p:false,m:false,settings:false},dbState:"loading",db:null,canEdit:false,uid:null,editingTopic:false,peopleRelOnly:true,jSort:"if"};
const RANKS=[["A*","astar","Flagship"],["A","a","Excellent"],["B","b","Good"],["C","c","Other"],["Unranked","u","Not ranked"]];
// Sources the weekly scan can search. `api` sources are queried directly; `browser` ones need the owner's Chrome.
const SOURCES=[
  {id:"openalex",label:"OpenAlex",kind:"api",note:"Free scholarly API. Works best with an API key.",def:true},
  {id:"dblp",label:"DBLP",kind:"browser",note:"Computer science bibliography.",def:true},
  {id:"sciencedirect",label:"ScienceDirect",kind:"browser",note:"Elsevier journals.",def:true},
  {id:"ieee",label:"IEEE Xplore",kind:"browser",note:"IEEE conferences and journals.",def:true},
  {id:"springer",label:"SpringerLink",kind:"browser",note:"LNCS, LNBIP and Springer journals.",def:true},
  {id:"acm",label:"ACM Digital Library",kind:"browser",note:"Often blocks automated access.",def:false},
  {id:"arxiv",label:"arXiv",kind:"browser",note:"Preprints.",def:true},
  {id:"scholar",label:"Google Scholar",kind:"browser",note:"Frequently shows a CAPTCHA to automated searches.",def:false},
  {id:"scopus",label:"Scopus",kind:"browser",note:"Needs a signed-in session and blocks bots; OpenAlex covers most of it.",def:false}
];
const app=document.getElementById("app");
// Filled in by site/build.py from site/vendor.json ("lazy" libraries, loaded on demand).
const VENDOR_LAZY=/*@VENDOR_LAZY@*/{};
function cfg(){return S.config||{}}
function siteName(){return cfg().siteName||"Research Radar"}
function scheduleText(){return cfg().scheduleText||"weekly"}
function sourceOn(id){const s=cfg().sources;if(s&&typeof s[id]==="boolean")return s[id];const d=SOURCES.find(x=>x.id===id);return !!(d&&d.def)}
function topicRevision(){return num(S.topic&&S.topic.revision)||1}

/* ---------- utils ---------- */
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const arr=v=>Array.isArray(v)?v:[];
const num=v=>typeof v==="number"&&isFinite(v)?v:null;
const today=()=>new Date().toISOString().slice(0,10);
function fmtDate(d){if(!d)return"—";const t=Date.parse(String(d).length===10?d+"T12:00:00":d);if(isNaN(t))return esc(d);return new Date(t).toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"})}
function fmtRange(a,b){if(!a)return"Dates not announced";return b&&b!==a?fmtDate(a)+" – "+fmtDate(b):fmtDate(a)}
function daysUntil(d){const t=Date.parse(d+"T23:59:59");return isNaN(t)?null:Math.ceil((t-Date.now())/864e5)}
function rankKey(r){const x=String(r||"").toUpperCase().replace("+","*");const f=RANKS.find(k=>k[0].toUpperCase()===x);return f?f[1]:"u"}
function rankLabel(r){const k=rankKey(r);return RANKS.find(x=>x[1]===k)[0]}
function rkBadge(r){return `<span class="rk rk-${rankKey(r)}" title="CORE rank">${esc(rankLabel(r))}</span>`}
function ring(v,size){size=size||44;v=Math.max(0,Math.min(100,+v||0));const r=size/2-4,c=2*Math.PI*r,off=c*(1-v/100),cls=v>=75?"hi":v>=50?"mid":"lo";return `<svg class="ring ${cls}${size>60?" big":""}" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="Affinity ${Math.round(v)} percent"><circle cx="${size/2}" cy="${size/2}" r="${r}" class="trk"/><circle cx="${size/2}" cy="${size/2}" r="${r}" class="val" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}" transform="rotate(-90 ${size/2} ${size/2})"/><text x="50%" y="50%" dy=".35em" text-anchor="middle">${Math.round(v)}</text></svg>`}
function nextDeadline(c){let best=null;const t=today();for(const d of arr(c.deadlines)){for(const [k,lab] of [["abstractDue","abstract"],["paperDue","paper"]]){const v=d[k];if(v&&v>=t&&(!best||v<best.date))best={date:v,track:d.track||d.type||"Track",what:lab}}}return best}
function dueHtml(nd){if(!nd)return`<span class="due muted">No open deadline</span>`;const n=daysUntil(nd.date);const cls=n<=14?"soon":n<=45?"near":"";return `<span class="due ${cls}" title="${esc(nd.track)} ${nd.what} due ${esc(nd.date)}">${n===0?"today":n+"d"} · ${esc(nd.track)}</span>`}
function edLine(e){if(!e)return"Not announced";const where=[e.city,e.country].filter(Boolean).join(", ")||e.location||"Location TBA";return `${esc(where)} · ${fmtRange(e.startDate,e.endDate)}`}
function isNewPaper(p){const lr=S.run&&S.run.lastRunAt?String(S.run.lastRunAt).slice(0,10):null;if(!p.discoveredAt)return false;if(lr)return p.discoveredAt>=lr;return daysUntil(p.discoveredAt)!==null&&daysUntil(p.discoveredAt)>-8}
function authorNames(p){return arr(p.authors).map(a=>typeof a==="string"?a:a&&a.name).filter(Boolean)}
function lsGet(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}}
function lsSet(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
function srcList(s){s=arr(s);if(!s.length)return"";return `<div class="panel"><div class="eyebrow">Sources</div><div class="srcs">${s.map(u=>{const url=typeof u==="string"?u:u.url;return /^https?:\/\//.test(url||"")?`<a href="${esc(url)}" target="_blank" rel="noopener">${esc(url.replace(/^https?:\/\//,"").slice(0,70))}</a>`:`<span>${esc(url)}</span>`}).join("")}</div></div>`}

/* ---------- filters ---------- */
const F_DEFAULT={q:"",minAff:0,kind:"all",type:"all",venue:"all",theme:"all",db:"all",comp:"all",yearFrom:"",yearTo:"",onlyNew:false,onlyStar:false,hideRead:false,sort:"affinity"};
const F=Object.assign({},F_DEFAULT,lsGet("pr-filters",{}));
S.jSort=lsGet("pr-jsort","if");
