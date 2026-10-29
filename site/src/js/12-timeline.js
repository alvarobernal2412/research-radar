/* ---------- deadline timeline (conferences page) ---------- */
const TL_W=1000,TL_BACK=21,TL_MIN_AHEAD=120,TL_MAX_AHEAD=365,TL_LANE=20,TL_CH=6.4;
function tlDay(d){const t=Date.parse(d+"T12:00:00");if(isNaN(t))return null;const n=new Date();return Math.round((t-Date.UTC(n.getFullYear(),n.getMonth(),n.getDate(),12))/864e5)}
function tlHue(ids,id){return Math.round((ids.indexOf(id)*137.508)%360)}
function tlEvents(confs){
  const by=new Map();
  for(const c of confs)for(const d of arr(c.deadlines))for(const [k,kind] of [["paperDue","paper"],["notification","notif"]]){
    const v=d[k],n=v?tlDay(v):null;
    if(n===null||n<-TL_BACK||n>TL_MAX_AHEAD)continue;
    const key=c.id+"|"+kind+"|"+v;
    if(!by.has(key))by.set(key,{c,kind,date:v,n,tracks:[]});
    const t=d.track||d.type;if(t&&!by.get(key).tracks.includes(t))by.get(key).tracks.push(t);
  }
  return [...by.values()].sort((a,b)=>a.n-b.n||String(a.c.acronym||a.c.name).localeCompare(String(b.c.acronym||b.c.name)));
}
function tlWhen(n){return n===0?"today":n>0?`in ${n}d`:`${-n}d ago`}
function tlLabel(e){return `${e.c.acronym||e.c.name} ${e.kind==="paper"?"paper":"notif"} · ${fmtDate(e.date)} · ${tlWhen(e.n)}`}
function tlLanes(evs,pos){
  const lanes=[];
  for(const e of evs){
    const w=tlLabel(e).length*TL_CH+14,x=pos(e.n)*TL_W/100;
    const l=Math.max(0,Math.min(TL_W-w,x-w/2));e.lw=w;e.l=l;
    let i=0;while(lanes[i]!==undefined&&lanes[i]+8>l)i++;
    lanes[i]=l+w;e.lane=i;
  }
  return lanes.length;
}
function deadlineTimeline(confs){
  const all=confs.filter(c=>arr(c.deadlines).length);
  const evs=tlEvents(all);
  let h=`<section class="block"><div class="sechead"><h2>Deadline timeline</h2><span class="muted" style="font-size:.85rem">Filled dot: paper deadline · ring: notification · days counted from today</span></div>`;
  if(!evs.length)return h+`<div class="empty"><span>No submission or notification dates in the next ${TL_MAX_AHEAD} days${all.length?"":" (no conference has dates yet)"}.</span></div></section>`;
  const end=Math.max(TL_MIN_AHEAD,Math.min(TL_MAX_AHEAD,evs[evs.length-1].n+10)),start=-TL_BACK,span=end-start;
  const pos=n=>(n-start)/span*100;
  const ids=all.map(c=>c.id).sort();
  const up=evs.filter(e=>e.kind==="paper"),down=evs.filter(e=>e.kind==="notif");
  const nu=tlLanes(up,pos),nd=tlLanes(down,pos);
  const lineY=22+14+nu*TL_LANE+8,H_=lineY+nd*TL_LANE+34;
  const st=e=>`--c:hsl(${tlHue(ids,e.c.id)} var(--tl-s) var(--tl-l))`;
  const link=e=>H("conf",e.c.id);
  const tip=e=>`${e.c.name}${e.tracks.length?" · "+e.tracks.join(", "):""} · ${e.kind==="paper"?"paper due":"notification"} ${e.date}`;
  let t="";
  const d0=new Date();d0.setHours(12,0,0,0);
  for(let m=new Date(d0.getFullYear(),d0.getMonth()+Math.floor(start/30)-1,1,12);;m.setMonth(m.getMonth()+1)){
    const n=Math.round((m-d0)/864e5);if(n>end)break;if(n<start)continue;
    t+=`<span class="tl-tick" style="left:${pos(n)}%;top:${H_-20}px">${m.toLocaleDateString(undefined,{month:"short"})}${m.getMonth()===0?" "+m.getFullYear():""}</span>`;
  }
  t+=`<div class="tl-axis" style="top:${lineY}px"></div>`;
  for(const [list,dir] of [[up,-1],[down,1]])for(const e of list){
    const x=pos(e.n),lab=tlLabel(e);
    const ly=dir<0?lineY-14-(e.lane+1)*TL_LANE+4:lineY+14+e.lane*TL_LANE-2;
    const stemTop=dir<0?ly+TL_LANE-6:lineY,stemH=dir<0?lineY-stemTop:ly+6-lineY;
    t+=`<span class="tl-stem${e.n<0?" past":""}" style="${st(e)};left:${x}%;top:${stemTop}px;height:${stemH}px"></span>`;
    t+=`<a class="tl-node ${e.kind}${e.n<0?" past":""}" href="${link(e)}" title="${esc(tip(e))}" aria-label="${esc(tlLabel(e))}" style="${st(e)};left:${x}%;top:${lineY}px"></a>`;
    t+=`<a class="tl-lab${e.n<0?" past":""}" href="${link(e)}" title="${esc(tip(e))}" style="${st(e)};left:${e.l/TL_W*100}%;top:${ly}px">${esc(lab)}</a>`;
  }
  t+=`<div class="tl-now" style="left:${pos(0)}%"></div><span class="tl-nowlab" style="left:${pos(0)}%">Today</span>`;
  h+=`<div class="tl-scroll"><div class="tl" style="height:${H_}px">${t}</div></div>`;
  const shown=new Set(evs.map(e=>e.c.id)),missing=confs.length-all.length;
  h+=`<div class="tl-legend">${[...shown].sort().map(id=>{const c=confs.find(x=>x.id===id);return `<a href="${H("conf",id)}" style="--c:hsl(${tlHue(ids,id)} var(--tl-s) var(--tl-l))"><i></i>${esc(c.acronym||c.name)}</a>`}).join("")}${missing?`<span class="muted">${missing} conference${missing===1?"":"s"} without dates not shown</span>`:""}</div></section>`;
  return h;
}
