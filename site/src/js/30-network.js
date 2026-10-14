/* ---------- network ---------- */
const NET={hidden:new Set(lsGet("pr-net-hidden",[])),q:"",sig:null,graph:null,sim:null,pos:new Map(),sel:null,zoom:null,svgSel:null,root:null,ro:null,W:800,H:600,fitted:false};
function nkey(s){return String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim()}
const nRad=n=>4+3.4*Math.sqrt(n);
const eW=w=>Math.min(9,0.6+0.75*w);
function buildGraph(){
  const selfK=S.topic&&S.topic.selfName?nkey(S.topic.selfName):null;
  const nodes=new Map(),links=new Map();
  for(const p of S.papers){
    const auth=arr(p.authors).map(a=>typeof a==="string"?{name:a}:a||{}).filter(a=>a.name);
    const keys=[];
    for(const a of auth){
      const k=nkey(a.name);if(!k||keys.includes(k))continue;keys.push(k);
      let n=nodes.get(k);
      if(!n){n={id:k,names:{},papers:[],aff:"",kw:new Set(),profile:"",self:false};nodes.set(k,n)}
      n.names[a.name]=(n.names[a.name]||0)+1;
      n.papers.push(p);
      if(a.affiliation&&!n.aff)n.aff=a.affiliation;
      arr(a.keywords).forEach(x=>n.kw.add(x));
      if(a.profileUrl&&!n.profile)n.profile=a.profileUrl;
      if(a.self||k===selfK)n.self=true;
    }
    for(let i=0;i<keys.length;i++)for(let j=i+1;j<keys.length;j++){
      const [s,t]=keys[i]<keys[j]?[keys[i],keys[j]]:[keys[j],keys[i]];const id=s+"|"+t;
      let l=links.get(id);if(!l){l={id,s,t,w:0,papers:[]};links.set(id,l)}
      l.w++;l.papers.push(p);
    }
  }
  for(const n of nodes.values()){
    // display the most frequent spelling, preferring one with accents on ties
    n.name=Object.entries(n.names).sort((a,b)=>b[1]-a[1]||(b[0].normalize("NFD").length-b[0].length)-(a[0].normalize("NFD").length-a[0].length))[0][0];
    n.n=n.papers.length;n.kw=[...n.kw].slice(0,6);
  }
  const me=[...nodes.values()].find(n=>n.self);
  const coSet=new Set();if(me)for(const l of links.values()){if(l.s===me.id)coSet.add(l.t);if(l.t===me.id)coSet.add(l.s)}
  for(const n of nodes.values())n.co=coSet.has(n.id);
  const list=[...nodes.values()].sort((a,b)=>(b.self?1:0)-(a.self?1:0)||b.n-a.n||a.name.localeCompare(b.name));
  return{nodes,links:[...links.values()],list,me};
}
function netStop(){if(NET.sim){NET.sim.stop();NET.sim=null}if(NET.ro){NET.ro.disconnect();NET.ro=null}NET.svgSel=null;NET.root=null;NET.sig=null}
function renderNetworkShell(){
  netStop();NET.fitted=false;
  app.innerHTML=`<div class="pagehead"><div><h1>Network</h1><p>Researchers behind the papers in the radar. Each circle is a person, sized by how many radar papers they authored. Lines join co-authors, and a thicker line means more papers together.</p></div><div class="muted" id="net-stats" style="font-size:.85rem"></div></div>
  <div class="netgrid">
    <aside class="panel palette" aria-label="People">
      <div class="fld"><label for="net-q">Find people</label><input type="search" id="net-q" placeholder="Name or affiliation" value="${esc(NET.q)}"></div>
      <div class="palbtns"><button type="button" class="btn" id="net-all">Select all</button><button type="button" class="btn" id="net-none">Deselect all</button></div>
      <div class="palcount" id="net-count"></div>
      <ul class="pallist" id="net-list"></ul>
    </aside>
    <div class="netmain">
      <div class="netstage" id="net-stage">
        <svg id="net-svg" role="img" aria-label="Co-authorship network"></svg>
        <div class="netmsg" id="net-msg" hidden></div>
        <div class="netctl"><button type="button" class="btn" id="net-me" hidden>Find me</button><button type="button" class="btn" id="net-fit">Fit to view</button></div>
        <div class="netlegend" aria-hidden="true">
          <div class="row"><span><span class="sw" style="background:var(--node-me)"></span> You</span><span><span class="sw" style="background:var(--node-co)"></span> Your co-authors</span><span><span class="sw" style="background:var(--node)"></span> Others</span></div>
          <div class="row"><span>Papers</span><svg width="80" height="32" viewBox="0 0 80 32">${[1,4,9].map((v,i)=>`<circle cx="${[9,30,62][i]}" cy="16" r="${nRad(v).toFixed(1)}" fill="none" stroke="var(--muted)"/>`).join("")}</svg><span class="mono">1 · 4 · 9</span></div>
          <div class="row"><span>Shared</span><svg width="70" height="14" viewBox="0 0 70 14">${[1,3,6].map((v,i)=>`<line x1="${i*24+2}" x2="${i*24+18}" y1="7" y2="7" stroke="var(--edge)" stroke-width="${eW(v)}" stroke-linecap="round"/>`).join("")}</svg><span class="mono">1 · 3 · 6</span></div>
        </div>
      </div>
      <div class="panel netinfo" id="net-info"><span class="muted" style="font-size:.88rem">Select a person in the graph or the list to see their papers and collaborators. Drag to pan, scroll to zoom, and drag a circle to move it.</span></div>
    </div>
  </div>`;
  let qT=0;
  document.getElementById("net-q").addEventListener("input",e=>{clearTimeout(qT);qT=setTimeout(()=>{NET.q=e.target.value;renderNetList()},120)});
  document.getElementById("net-all").onclick=()=>{netMatches().forEach(n=>NET.hidden.delete(n.id));netSaveHidden();renderNetList();drawNet()};
  document.getElementById("net-none").onclick=()=>{netMatches().forEach(n=>NET.hidden.add(n.id));netSaveHidden();renderNetList();drawNet()};
  document.getElementById("net-fit").onclick=()=>netFit(true);
  document.getElementById("net-me").onclick=()=>{const me=NET.graph&&NET.graph.me;if(me){if(NET.hidden.has(me.id)){NET.hidden.delete(me.id);netSaveHidden();renderNetList();drawNet()}netSelect(me.id,true)}};
  const list=document.getElementById("net-list");
  list.addEventListener("change",e=>{const cb=e.target.closest("input[data-nid]");if(!cb)return;if(cb.checked)NET.hidden.delete(cb.dataset.nid);else NET.hidden.add(cb.dataset.nid);cb.closest("li").classList.toggle("off",!cb.checked);netSaveHidden();netCounts();drawNet()});
  list.addEventListener("click",e=>{const b=e.target.closest("button[data-nid]");if(!b)return;const id=b.dataset.nid;if(NET.hidden.has(id)){NET.hidden.delete(id);netSaveHidden();renderNetList();drawNet()}netSelect(id,true)});
  const app2=document.getElementById("net-info");
  app2.addEventListener("click",e=>{const b=e.target.closest("button[data-nid]");if(b){netSelect(b.dataset.nid,true)}const c=e.target.closest("[data-netclear]");if(c)netSelect(null)});
}
function netSaveHidden(){lsSet("pr-net-hidden",[...NET.hidden])}
function netMatches(){const g=NET.graph;if(!g)return[];const q=nkey(NET.q);if(!q)return g.list;return g.list.filter(n=>(nkey(n.name)+" "+nkey(n.aff)).includes(q))}
function netCounts(){const g=NET.graph;if(!g)return;const shown=g.list.filter(n=>!NET.hidden.has(n.id)).length;const m=netMatches().length;
  document.getElementById("net-count").textContent=`${shown} of ${g.list.length} people shown${NET.q.trim()?` · ${m} match the search`:""}`;
  const a=document.getElementById("net-all"),z=document.getElementById("net-none");if(a){a.textContent=NET.q.trim()?`Select ${m} found`:"Select all";z.textContent=NET.q.trim()?`Deselect ${m} found`:"Deselect all"}}
function renderNetList(){
  const el=document.getElementById("net-list");if(!el||!NET.graph)return;
  const L=netMatches();
  el.innerHTML=L.length?L.map(n=>`<li class="${NET.hidden.has(n.id)?"off":""}"><input type="checkbox" id="nc-${esc(n.id.replace(/ /g,"_"))}" data-nid="${esc(n.id)}"${NET.hidden.has(n.id)?"":" checked"} aria-label="Show ${esc(n.name)} in the graph"><button type="button" class="nm" data-nid="${esc(n.id)}" title="${esc(n.name)}${n.aff?" · "+esc(n.aff):""}">${esc(n.name)}</button>${n.self?`<span class="me">you</span>`:""}<span class="cnt" title="Papers in the radar">${n.n}</span></li>`).join(""):`<li class="muted" style="justify-content:center">No one matches “${esc(NET.q)}”.</li>`;
  netCounts();
}
function updateNetwork(){
  const stats=document.getElementById("net-stats");
  if(!S.loaded.p){document.getElementById("net-msg").hidden=false;document.getElementById("net-msg").textContent="Loading…";return}
  const sig=S.papers;const selfName=S.topic&&S.topic.selfName;
  if(NET.sig===sig&&NET.sigSelf===selfName&&NET.svgSel)return;
  NET.sig=sig;NET.sigSelf=selfName;
  NET.graph=buildGraph();
  if(stats)stats.textContent=`${NET.graph.list.length} researchers · ${NET.graph.links.length} collaborations · ${S.papers.length} papers`;
  document.getElementById("net-me").hidden=!NET.graph.me;
  renderNetList();
  if(typeof d3==="undefined"){const m=document.getElementById("net-msg");m.hidden=false;m.textContent="The graph library didn't load. Reload the page to try again.";return}
  drawNet();
}
function drawNet(){
  const g=NET.graph;const stage=document.getElementById("net-stage");if(!g||!stage||typeof d3==="undefined")return;
  const msg=document.getElementById("net-msg");
  NET.W=stage.clientWidth||800;NET.H=stage.clientHeight||600;
  if(!NET.svgSel){
    const svg=d3.select("#net-svg");NET.svgSel=svg;
    NET.root=svg.append("g");NET.root.append("g").attr("class","lks");NET.root.append("g").attr("class","nds");
    NET.zoom=d3.zoom().scaleExtent([0.15,5]).on("zoom",ev=>NET.root.attr("transform",ev.transform));
    svg.call(NET.zoom).on("dblclick.zoom",null);
    svg.on("click",ev=>{if(ev.target===svg.node())netSelect(null)});
    NET.ro=new ResizeObserver(()=>{const w=stage.clientWidth,h=stage.clientHeight;if(Math.abs(w-NET.W)>4||Math.abs(h-NET.H)>4){NET.W=w;NET.H=h;if(NET.sim){NET.sim.force("x").x(w/2);NET.sim.force("y").y(h/2)}}});
    NET.ro.observe(stage);
  }
  if(NET.sim){NET.sim.nodes().forEach(n=>NET.pos.set(n.id,{x:n.x,y:n.y}));NET.sim.stop()}
  const vis=g.list.filter(n=>!NET.hidden.has(n.id));
  if(!g.list.length){msg.hidden=false;msg.textContent="No authors yet. People appear here once the weekly scan has added papers."}
  else if(!vis.length){msg.hidden=false;msg.textContent="No one is selected. Tick people in the list, or use Select all."}
  else msg.hidden=true;
  const visIds=new Set(vis.map(n=>n.id));
  let fresh=0;
  const nodes=vis.map(n=>{const p=NET.pos.get(n.id);if(!p)fresh++;return{id:n.id,ref:n,r:nRad(n.n),x:p?p.x:NET.W/2+(Math.random()-.5)*NET.W*.6,y:p?p.y:NET.H/2+(Math.random()-.5)*NET.H*.6}});
  const links=g.links.filter(l=>visIds.has(l.s)&&visIds.has(l.t)).map(l=>({id:l.id,source:l.s,target:l.t,w:l.w,ref:l}));
  const sim=d3.forceSimulation(nodes)
    .force("link",d3.forceLink(links).id(d=>d.id).distance(l=>28+52/Math.sqrt(l.w)+l.source.r+l.target.r).strength(l=>Math.min(1,0.25+0.12*l.w)))
    .force("charge",d3.forceManyBody().strength(d=>-40-18*d.ref.n).distanceMax(420))
    .force("collide",d3.forceCollide(d=>d.r+3))
    .force("x",d3.forceX(NET.W/2).strength(0.045)).force("y",d3.forceY(NET.H/2).strength(0.045));
  sim.stop();
  const reduce=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pre=fresh>nodes.length*0.3?260:(fresh?60:0);
  for(let i=0;i<pre;i++)sim.tick();
  NET.sim=sim;
  const lk=NET.root.select("g.lks").selectAll("line").data(links,d=>d.id).join("line").attr("class","lk").attr("stroke-width",d=>eW(d.w)).attr("stroke-opacity",d=>Math.min(.9,.35+.12*d.w));
  lk.selectAll("title").data(d=>[d]).join("title").text(d=>`${d.source.ref.name} & ${d.target.ref.name}: ${d.w} paper${d.w>1?"s":""} together`);
  const labelMin=vis.length>80?3:2;
  const nd=NET.root.select("g.nds").selectAll("g.nd").data(nodes,d=>d.id).join(enter=>{const e=enter.append("g").attr("class","nd");e.append("circle");e.append("text");e.append("title");return e});
  nd.attr("class",d=>"nd"+(d.ref.self?" me":d.ref.co?" co":"")+(d.ref.n>=labelMin||d.ref.self?" lab":""));
  nd.select("circle").attr("r",d=>d.r);
  nd.select("text").attr("x",d=>d.r+3).attr("dy","0.35em").text(d=>d.ref.name);
  nd.select("title").text(d=>`${d.ref.name}${d.ref.aff?" · "+d.ref.aff:""}\n${d.ref.n} paper${d.ref.n>1?"s":""} in the radar`);
  nd.on("click",(ev,d)=>{ev.stopPropagation();netSelect(d.id,false)});
  nd.call(d3.drag()
    .on("start",(ev,d)=>{if(!ev.active)sim.alphaTarget(0.25).restart();d.fx=d.x;d.fy=d.y})
    .on("drag",(ev,d)=>{d.fx=ev.x;d.fy=ev.y})
    .on("end",(ev,d)=>{if(!ev.active)sim.alphaTarget(0);d.fx=null;d.fy=null}));
  const tick=()=>{lk.attr("x1",d=>d.source.x).attr("y1",d=>d.source.y).attr("x2",d=>d.target.x).attr("y2",d=>d.target.y);nd.attr("transform",d=>`translate(${d.x},${d.y})`)};
  sim.on("tick",tick);tick();
  if(reduce){for(let i=0;i<120;i++)sim.tick();tick()}else sim.alpha(pre?0.15:0.4).restart();
  netApplyFocus();
  if(!NET.fitted&&nodes.length){NET.fitted=true;setTimeout(()=>netFit(false),reduce?0:400)}
}
function netFit(anim){
  if(!NET.sim||!NET.svgSel)return;const ns=NET.sim.nodes();if(!ns.length)return;
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  for(const n of ns){x0=Math.min(x0,n.x-n.r);y0=Math.min(y0,n.y-n.r);x1=Math.max(x1,n.x+n.r+90);y1=Math.max(y1,n.y+n.r)}
  const pad=30,k=Math.max(0.15,Math.min(2,Math.min((NET.W-pad*2)/(x1-x0||1),(NET.H-pad*2)/(y1-y0||1))));
  const t=d3.zoomIdentity.translate(NET.W/2-k*(x0+x1)/2,NET.H/2-k*(y0+y1)/2).scale(k);
  (anim?NET.svgSel.transition().duration(450):NET.svgSel).call(NET.zoom.transform,t);
}
function netSelect(id,center){
  NET.sel=id;netApplyFocus();renderNetInfo();
  if(id&&center&&NET.sim&&NET.svgSel){const n=NET.sim.nodes().find(x=>x.id===id);if(n){const k=Math.max(1,d3.zoomTransform(NET.svgSel.node()).k);NET.svgSel.transition().duration(450).call(NET.zoom.transform,d3.zoomIdentity.translate(NET.W/2-k*n.x,NET.H/2-k*n.y).scale(k))}}
}
function netApplyFocus(){
  const stage=document.getElementById("net-stage");if(!stage||!NET.root)return;
  const id=NET.sel&&NET.sim&&NET.sim.nodes().some(n=>n.id===NET.sel)?NET.sel:null;
  stage.classList.toggle("focus",!!id);
  const nb=new Set(id?[id]:[]);
  NET.root.selectAll("line.lk").classed("hl",d=>{const on=!!id&&(d.source.id===id||d.target.id===id);if(on){nb.add(d.source.id);nb.add(d.target.id)}return on});
  NET.root.selectAll("g.nd").classed("hl",d=>nb.has(d.id)).classed("sel",d=>d.id===id);
}
function renderNetInfo(){
  const el=document.getElementById("net-info");if(!el)return;const g=NET.graph;
  const n=NET.sel&&g?g.nodes.get(NET.sel):null;
  if(!n){el.innerHTML=`<span class="muted" style="font-size:.88rem">Select a person in the graph or the list to see their papers and collaborators. Drag to pan, scroll to zoom, and drag a circle to move it.</span>`;return}
  const co=g.links.filter(l=>l.s===n.id||l.t===n.id).map(l=>({o:g.nodes.get(l.s===n.id?l.t:l.s),w:l.w})).sort((a,b)=>b.w-a.w||a.o.name.localeCompare(b.o.name));
  const papers=n.papers.slice().sort((a,b)=>(num(b.affinity)||0)-(num(a.affinity)||0));
  el.innerHTML=`<div class="hd"><div style="display:flex;flex-direction:column;gap:4px"><h2>${esc(n.name)}${n.self?` <span class="pill amb" style="vertical-align:middle">you</span>`:""}</h2>${n.aff?`<span class="muted" style="font-size:.86rem">${esc(n.aff)}</span>`:""}${n.kw.length?`<div class="chips">${n.kw.map(k=>`<span class="pill">${esc(k)}</span>`).join("")}</div>`:""}</div><div style="display:flex;gap:8px;align-items:center">${n.profile?`<a href="${esc(n.profile)}" target="_blank" rel="noopener" style="font-size:.85rem">Profile ↗</a>`:""}<button type="button" class="btn" data-netclear>Clear selection</button></div></div>
  <div class="cols"><div style="display:flex;flex-direction:column;gap:6px"><div class="eyebrow">${papers.length} paper${papers.length>1?"s":""} in the radar</div><ul>${papers.map(p=>`<li><a href="#paper.${esc(p.id)}">${esc(p.title)}</a> <span class="muted" style="font-size:.78rem">· ${esc(p.venueName||"")}${num(p.affinity)!==null?` · ${p.affinity}%`:""}</span></li>`).join("")}</ul></div>
  <div style="display:flex;flex-direction:column;gap:6px"><div class="eyebrow">${co.length} collaborator${co.length===1?"":"s"}</div>${co.length?`<div class="collab">${co.map(c=>`<button type="button" data-nid="${esc(c.o.id)}"${NET.hidden.has(c.o.id)?' title="Hidden in the graph"':""}><span>${esc(c.o.name)}${NET.hidden.has(c.o.id)?" (hidden)":""}</span><span>${c.w} shared</span></button>`).join("")}</div>`:`<span class="muted" style="font-size:.86rem">No co-authors among the radar papers.</span>`}</div></div>`;
}
