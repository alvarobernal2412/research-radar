/* ---------- BibTeX export of the selected papers ---------- */
// Selection lives in S.sel (paper ids, in memory). "Select all" and "Deselect
// all" act on the papers the current filters show (S.shown); the export takes
// everything selected, including papers a filter now hides.
const BIB_STOP=new Set(["a","an","the","of","on","for","and","in","to","with","from","towards","toward","using","how","what","why","is","are"]);
const BIB_PARTICLES=new Set(["van","von","de","del","della","der","den","di","da","la","le","du","dos","das","bin","al","ter","ten"]);
function bibFold(s){return String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^A-Za-z0-9]/g,"")}
// Escape LaTeX specials. Non-ASCII letters stay as UTF-8 (biber / xelatex / modern bibtex8).
function bibEsc(s){return String(s==null?"":s).replace(/\\/g,"\\textbackslash{}").replace(/([&%$#_{}])/g,"\\$1").replace(/~/g,"\\textasciitilde{}").replace(/\^/g,"\\textasciicircum{}").replace(/\s+/g," ").trim()}
// "First Middle Last" or "Last, First" -> {last, first}; keeps particles ("van der Aalst").
function bibName(n){
  n=String(n||"").trim();if(!n)return null;
  if(n.includes(",")){const i=n.indexOf(",");return{last:n.slice(0,i).trim(),first:n.slice(i+1).trim()}}
  const w=n.split(/\s+/);if(w.length===1)return{last:w[0],first:""};
  let i=w.length-1;while(i>1&&BIB_PARTICLES.has(w[i-1].toLowerCase()))i--;
  return{last:w.slice(i).join(" "),first:w.slice(0,i).join(" ")};
}
function bibAuthors(p){
  return authorNames(p).map(bibName).filter(Boolean).map(a=>a.first?`${bibEsc(a.last)}, ${bibEsc(a.first)}`:`{${bibEsc(a.last)}}`).join(" and ");
}
function bibType(p){
  const k=String(p.venueKind||"").toLowerCase();
  if(k==="journal")return{type:"article",venueField:"journal"};
  if(k==="conference"||k==="workshop")return{type:"inproceedings",venueField:"booktitle"};
  return{type:"misc",venueField:"howpublished"};
}
function bibKeyBase(p){
  const a=bibName(authorNames(p)[0]);
  const last=(a&&bibFold(a.last).toLowerCase())||"anon";
  const word=String(p.title||"").split(/[^A-Za-z0-9\u00C0-\u024F]+/).map(w=>bibFold(w).toLowerCase()).find(w=>w.length>=3&&!BIB_STOP.has(w))||"";
  return `${last}${p.year||""}${word}`;
}
function toBibtex(papers){
  const used=new Map();
  const out=[`% Exported from ${siteName()} on ${today()} · ${papers.length} entr${papers.length===1?"y":"ies"} · encoding: UTF-8`];
  for(const p of papers){
    let key=bibKeyBase(p);const n=used.get(key)||0;used.set(key,n+1);
    if(n)key+=String.fromCharCode(97+n); // second -> b, third -> c ...
    const t=bibType(p);
    const f=[["title",`{${bibEsc(p.title)}}`],["author",bibAuthors(p)],["year",p.year],[t.venueField,p.venueName?bibEsc(p.venueName):""],["doi",p.doi],["url",p.url&&!p.doi?p.url:""],["keywords",arr(p.keywords).map(bibEsc).join(", ")]]
      .filter(([,v])=>v!==""&&v!=null&&v!==undefined);
    out.push(`@${t.type}{${key},\n${f.map(([k,v])=>`  ${k} = {${v}}`).join(",\n")}\n}`);
  }
  return out.join("\n\n")+"\n";
}
function selectedPapers(){return S.papers.filter(p=>S.sel.has(p.id))}
function updateSelBar(){
  const bar=document.getElementById("selbar");if(!bar)return;
  const shown=S.shown||[];const nShown=shown.length;
  const sel=selectedPapers().length;
  const shownSel=shown.filter(id=>S.sel.has(id)).length;
  const hidden=sel-shownSel;
  const b=(act,label,dis)=>`<button type="button" class="btn" data-selact="${act}"${dis?" disabled":""}>${label}</button>`;
  bar.innerHTML=`${b("all",`Select all shown (${nShown})`,!nShown||shownSel===nShown)}${b("none","Deselect all shown",!shownSel)}<button type="button" class="btn primary" data-selact="export"${sel?"":" disabled"}>Export BibTeX (${sel})</button><span class="rescount" role="status">${sel?`${sel} selected${hidden?` · ${hidden} hidden by filters`:""}`:"Tick papers to export them as BibTeX."}</span><span class="tpmsg" id="selmsg" role="status"></span>`;
}
function setSelMsg(text,kind){const el=document.getElementById("selmsg");if(el){el.textContent=text;el.className="tpmsg"+(kind?" "+kind:"")}}
async function exportBibtex(){
  const list=selectedPapers();if(!list.length)return;
  let dl=null;try{dl=await window.claude.use("downloads")}catch(e){}
  if(!dl){setSelMsg("Downloads aren't available in this view.","err");return}
  const slug=siteName().toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")||"radar";
  try{await dl.save({filename:`${slug}-selection-${today()}.bib`,data:toBibtex(list)});setSelMsg(`Saved ${list.length} entr${list.length===1?"y":"ies"}.`,"ok")}
  catch(e){if(e&&e.code!=="declined")setSelMsg("Couldn't save the file.","err")}
}
