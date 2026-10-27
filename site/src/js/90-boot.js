/* ---------- boot ---------- */
// attachRadar() points the page at one radar's documents. It drops the previous radar's listeners
// and state first, so nothing from one radar shows up in another.
let radarUnsubs=[];
function attachRadar(rid){
  radarUnsubs.forEach(u=>{try{u()}catch(e){}});radarUnsubs=[];
  S.rid=rid;lsSet("pr-radar",rid);
  Object.assign(S,{confs:[],jours:[],papers:[],topic:null,run:null,config:null,control:null,marks:{},sel:new Set(),shown:[],editingTopic:false});
  Object.assign(S.loaded,{c:false,j:false,p:false,m:false});
  Object.assign(F,F_DEFAULT,lsGet(rkey("pr-filters"),{}));normFilters();
  S.jSort=lsGet(rkey("pr-jsort"),"if");
  NET.hidden=new Set(lsGet(rkey("pr-net-hidden"),[]));NET.q="";NET.sig=null;NET.graph=null;NET.pos=new Map();NET.sel=null;NET.fitted=false;
  topicReset();
  if(!S.db)return;
  const db=S.db,fail=()=>{};
  // Snapshots that arrive after a switch belong to the previous radar: ignore them.
  const live=fn=>x=>{if(S.rid===rid)fn(x)};
  const keep=u=>{if(typeof u==="function")radarUnsubs.push(u)};
  keep(db.collection(rp("conferences")).limit(500).onSnapshot(live(s=>{S.confs=s.docs.map(d=>Object.assign({id:d.id},d.data()));S.loaded.c=true;schedule()}),fail));
  keep(db.collection(rp("journals")).limit(500).onSnapshot(live(s=>{S.jours=s.docs.map(d=>Object.assign({id:d.id},d.data()));S.loaded.j=true;schedule()}),fail));
  keep(db.collection(rp("papers")).limit(1000).onSnapshot(live(s=>{S.papers=s.docs.map(d=>Object.assign({id:d.id},d.data()));S.loaded.p=true;schedule()}),fail));
  keep(db.collection(rp("meta")).onSnapshot(live(s=>{
    const by={};for(const d of s.docs)by[d.id]=d.data();
    S.topic=by.topic||null;S.run=by.run||null;S.config=by.config||null;S.control=by.control||null;
    schedule();
  }),fail));
  if(S.uid)keep(db.doc(marksPath()).onSnapshot(live(d=>{const v=d.exists?d.data():null;S.marks=(v&&v.papers)||{};schedule()}),fail));
}
render(true);
(async()=>{
  let db=null;
  try{db=window.claude&&window.claude.use?await window.claude.use("db"):null}catch(e){db=null}
  if(!db){S.dbState="none";render(true);return}
  S.db=db;S.dbState="ok";
  db.collection("radars").onSnapshot(s=>{
    S.radars=s.docs.map(d=>Object.assign({id:d.id},d.data()));S.radarsLoaded=true;
    if(route().rid!==S.rid)render(true);else schedule();
  },()=>{S.radarsLoaded=true});
  try{
    const user=await window.claude.use("user");
    if(user){S.canEdit=!!(await user.canEdit());S.uid=await user.id();
      if(S.uid){
        db.doc(`data/users/${S.uid}/settings`).onSnapshot(d=>{S.settings=d.exists?Object.assign({},d.data()):{};S.loaded.settings=true;if(route().view==="topic"&&!TP.keyEdit)rerenderSources()},()=>{S.loaded.settings=true});
      }
    }
  }catch(e){}
  attachRadar(S.rid);
  if(route().view==="contributions"||route().view==="topic")render(true);else schedule();
})();
