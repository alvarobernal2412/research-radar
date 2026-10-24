/* ---------- marks (per viewer) ---------- */
let markBusy=Promise.resolve();
function toggleMark(id,kind){
  if(!S.db||!S.uid)return;
  const cur=Object.assign({},S.marks[id]||{});cur[kind]=!cur[kind];
  S.marks=Object.assign({},S.marks,{[id]:cur});schedule();if(route().view==="paper")render(true);
  const snapshot=S.marks,path=marksPath();
  markBusy=markBusy.then(()=>S.db.doc(path).set({papers:snapshot})).catch(()=>{});
}
