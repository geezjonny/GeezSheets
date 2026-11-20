export function validateTemplate(v,db,campaign,bad){
 if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!['owner','map','shape','size','x','y','angle','f','color'].includes(k)))bad('Invalid template fields');
 if(!['cone','circle','line','square'].includes(v.shape)||!Number.isFinite(v.size)||v.size<5||v.size>1000||![v.x,v.y].every(n=>Number.isFinite(n)&&n>=0&&n<=1)||!Number.isFinite(v.angle)||Math.abs(v.angle)>1000||!Number.isInteger(v.f)||Math.abs(v.f)>100||!/^#[0-9a-f]{6}$/i.test(v.color||''))bad('Invalid template geometry');
 const map=db.worlds.gaia.entities[v.map];if(!map||!['place','map'].includes(map.kind)||map.campaign&&map.campaign!==campaign)bad('Template needs a map in this campaign');
 if(typeof v.owner!=='string'||v.owner.length>200)bad('Invalid template owner');
}
// Narrow Sheets player records. Both persistence transports call this boundary.
// Shortest distance (grid squares) from a point to a door segment.
const segDist=(x,y,[ax,ay],[bx,by])=>{const dx=bx-ax,dy=by-ay,l=dx*dx+dy*dy,t=l?Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/l)):0;return Math.hypot(x-ax-t*dx,y-ay-t*dy);};
const deny = message => { throw Object.assign(new Error(message), {status:403}); };
const bad = message => { throw Object.assign(new Error(message), {status:400}); };
export function playerWrite(db, parts, body, auth, equal) {
 const [,campaign,,field,...keys]=parts, entities=db.worlds.gaia.entities;
 const pcs=(auth.pcs||[]).map(id=>entities[id]).filter(e=>e?.kind==='pc'&&e.campaign===campaign&&db.campaigns[campaign]?.party?.[e.id]);
 if(!pcs.length&&auth.role!=='gm')deny('Players may write only in their own PC campaign');
 if(Object.keys(body).some(k=>!['value','expected','call'].includes(k))||!Object.hasOwn(body,'value'))bad('Expected {value, expected?, call?}');
 const pc=pcs[0], own=id=>auth.role==='gm'||pcs.some(e=>e.id===id), names=pcs.map(e=>e.name);
 const value=body.value;
 // Bound all free text and nested payloads before storing it.
 function bounded(v,depth=0){
  if(depth>12)bad('Player record is too deeply nested');
  if(typeof v==='string'&&v.length>4000)bad('Player text is limited to 4000 characters');
  if(typeof v==='number'&&!Number.isFinite(v))bad('Expected finite numbers');
  if(v&&typeof v==='object')for(const x of Object.values(v))bounded(x,depth+1);
 }
 bounded(value);if(JSON.stringify(value).length>20000)bad('Player record exceeds 20000 characters');
 const obj=v=>v&&typeof v==='object'&&!Array.isArray(v);
 let path;
 if(field==='templates'&&keys.length===1){
  path=`campaigns/${campaign}/state/templates/${keys[0]}`;
  if(value!==null){validateTemplate(value,db,campaign,bad);if(!db.campaigns[campaign].state.templates?.[keys[0]]&&Object.keys(db.campaigns[campaign].state.templates||{}).length>=100)bad('At most 100 templates per campaign');}
 }else if(['rolls','pings','presence'].includes(field)&&keys.length===1){
  path=`campaigns/${campaign}/state/${field}/${keys[0]}`;
 }else if(field==='rollcall'&&keys.length===1){
  path=`campaigns/${campaign}/state/rollcall/results/${keys[0]}`;
 }else if(['notes','cards','links'].includes(field)&&keys.length===(field==='notes'?2:1)){
  path=`apps/sheets/party/${campaign}/${field}/${keys.join('/')}`;
  if(field==='notes'&&db.campaigns[campaign].reveals?.[keys[0]]?.notes?.[keys[1]])path=`campaigns/${campaign}/reveals/${keys[0]}/notes/${keys[1]}`;
 }else if(field==='board'&&keys.length===1){
  path=`apps/sheets/party/${campaign}/layouts/${pc.id}/${keys[0]}`;
 }else if(field==='initiative'&&keys.length===1){
  const state=db.campaigns[campaign].state, old=state.initiative||{round:1,turn:0,order:[]};
  const prior=old.order.find(r=>r.id===keys[0]);
  if(prior&&!own(prior.entity)||value!==null&&(!obj(value)||!own(value.entity)))deny('Players may edit only their own initiative row');
  if(!prior&&value===null)deny('Unknown initiative row');
  if(value!==null&&(Object.keys(value).some(k=>!['id','entity','label','init'].includes(k))||value.id!==keys[0]||value.label!==entities[value.entity]?.name||!Number.isFinite(value.init)||Math.abs(value.init)>1000))bad('Invalid initiative row');
  if(value&&!prior&&old.order.some(r=>r.entity===value.entity))deny('PC already has an initiative row; edit that row');
  const order=old.order.filter(r=>r.id!==keys[0]);if(value)order.push(value);order.sort((a,b)=>b.init-a.init);
  const current=old.order[old.turn]?.id;
  return {path:`campaigns/${campaign}/state/initiative`,value:{...old,order,turn:Math.max(0,order.findIndex(r=>r.id===current))}};
 }else if(field==='doors'&&keys.length===3){
  // Players open/close real doors only, and only while their own token stands next to it on that floor.
  const [place,floorKey,door]=keys,level=Number(floorKey),p=entities[place];
  if(value!=='open'&&value!=='closed')bad('Door state must be open or closed');
  const map=p&&(p.data?.scene?p:Object.values(entities).find(m=>m.kind==='map'&&m.data?.scene&&(m.id===p.data?.childMap||m.data.parent_place===p.id)));
  if(!map||p.campaign&&p.campaign!==campaign)bad('Unknown battle map');
  const fl=map.data.scene.floors.find(f=>f.level===level),n=/^scene-door-(\d+)$/.exec(door),portal=n&&fl?.portals?.[Number(n[1])];
  if(!portal)bad('Unknown door');
  if(['window','arch'].includes(portal.kind))deny('That opening cannot be opened or closed');
  if(portal.locked)deny('That door is locked');
  const {cols,rows}=map.data.scene.grid,st=db.campaigns[campaign].state.tokens||{};
  const at=(k,pc)=>st[k]?.[pc]||Object.values(st).find(t=>t?.entity===pc&&t.map===k);
  const near=pcs.some(pc=>[place,map.id].some(k=>{const t=at(k,pc.id);return t&&(Number(t.floor??t.f)||0)===level&&segDist(t.x*cols,t.y*rows,portal.a,portal.b)<=1.5;}));
  if(!near)deny('Stand next to the door to open or close it');
  return {path:`apps/sheets/table3d/${db.apps.sheets?.campaignIds?.[campaign]||'world__'+campaign}/${place}/doors/${level}/${door}`,value};
 }else deny('This write requires a GM');
 const previous=path.split('/').reduce((o,k)=>o?.[k],db)??null;
 if(Object.hasOwn(body,'expected')&&!equal(previous,body.expected))throw Object.assign(new Error('Player record changed; retry'),{status:409});
 const owned=v=>obj(v)&&own(v.owner);
 if(previous&&!owned(previous)&&!(field==='notes'&&!previous.owner&&names.includes(previous.author)))deny('Players may change only entries they own; ask the GM about unowned legacy cards');
 if(value!==null&&(!obj(value)||!own(value.owner)))deny('Player record must identify its own PC owner');
 if(field==='rolls'){
  if(previous||!value)deny('Player rolls are append-only');
  if(!names.includes(value.by)||value.char&&!own(value.char))deny('Players may roll only as their own PC');
  if(typeof value.expr!=='string'||value.expr.length>200||typeof value.detail!=='string'||!Number.isFinite(value.total)||!Array.isArray(value.dice)||value.dice.length>40)bad('Invalid roll');
 }
 if(field==='pings'&&value){
  if(db.campaigns[campaign].state.session?.lockPings)deny('The GM has locked map pings');
  if(!names.includes(value.by)||![value.x,value.y].every(n=>Number.isFinite(n)&&n>=0&&n<=1)||typeof value.v!=='string')bad('Invalid ping');
 }
 if(field==='presence'){
  if(!pcs.some(e=>keys[0]==='p_'+e.name.replace(/[.#$\[\]\/]/g,'_')))deny('Players may update only their own presence key');
  if(value&&(!names.includes(value.name)||value.dm!==false))deny('Players may report only their own presence');
 }
 if(field==='rollcall'){
  const call=db.campaigns[campaign].state.rollcall;
  if(!call?.open||call.id!==body.call||value?.call!==call.id)deny('Roll call closed or changed; answer the current call');
  if(!own(keys[0])||!own(value?.charId)||!names.includes(value?.name)||!Object.hasOwn(call.to||{},keys[0]))deny('Players may answer only a roll call addressed to their own PC');
  if(previous||!value)deny('Rollcall answers are write-once');
 }
 if(field==='notes'&&value&&(!names.includes(value.author)||typeof value.text!=='string'))deny('Players may write only their own notes');
 if(field==='cards'&&value&&(value.id!==keys[0]||typeof value.name!=='string'||!value.name.trim()||value.name.length>200||typeof value.type!=='string'))bad('Cards need their own id, type and a name of at most 200 characters');
 if(field==='links'&&value&&(!['from','to','label'].every(k=>typeof value[k]==='string')||value.label.length>200))bad('Strings need from/to IDs and a label of at most 200 characters');
 if(field==='board'&&value&&![value.x,value.y].every(Number.isFinite))bad('Expected board x/y');
 return {path,value};
}
