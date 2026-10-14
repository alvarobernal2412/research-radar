/* ---------- boot ---------- */
render(true);
(async()=>{
  let db=null;
  try{db=window.claude&&window.claude.use?await window.claude.use("db"):null}catch(e){db=null}
  if(!db){S.dbState="none";render(true);return}
  S.db=db;S.dbState="ok";
  const fail=()=>{};
  db.collection("conferences").limit(500).onSnapshot(s=>{S.confs=s.docs.map(d=>Object.assign({id:d.id},d.data()));S.loaded.c=true;schedule()},fail);
  db.collection("journals").limit(500).onSnapshot(s=>{S.jours=s.docs.map(d=>Object.assign({id:d.id},d.data()));S.loaded.j=true;schedule()},fail);
  db.collection("papers").limit(1000).onSnapshot(s=>{S.papers=s.docs.map(d=>Object.assign({id:d.id},d.data()));S.loaded.p=true;schedule()},fail);
  db.collection("meta").onSnapshot(s=>{
    const by={};for(const d of s.docs)by[d.id]=d.data();
    S.topic=by.topic||null;S.run=by.run||null;S.config=by.config||null;S.control=by.control||null;
    schedule();
  },fail);
  try{
    const user=await window.claude.use("user");
    if(user){S.canEdit=!!(await user.canEdit());S.uid=await user.id();
      if(S.uid){
        db.doc(`data/users/${S.uid}/marks`).onSnapshot(d=>{const v=d.exists?d.data():null;S.marks=(v&&v.papers)||{};schedule()},fail);
        db.doc(`data/users/${S.uid}/settings`).onSnapshot(d=>{S.settings=d.exists?Object.assign({},d.data()):{};S.loaded.settings=true;if(route().view==="topic"&&!TP.keyEdit)rerenderSources()},()=>{S.loaded.settings=true});
      }
      if(route().view==="contributions"||route().view==="topic")render(true);else schedule();}
  }catch(e){}
})();
