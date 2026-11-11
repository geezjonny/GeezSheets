// Narrow Sheets player records. Both persistence transports call this boundary.
const deny = message => { throw Object.assign(new Error(message), {status:403}); };
const bad = message => { throw Object.assign(new Error(message), {status:400}); };
export function playerWrite(db, parts, body, auth, equal) {
 const [,campaign,,field,...keys]=parts, entities=db.worlds.gaia.entities;
 const pcs=(auth.pcs||[]).map(id=>entities[id]).filter(e=>e?.kind==='pc'&&e.campaign===campaign&&db.campaigns[campaign]?.party?.[e.id]);
 if(!pcs.length)deny('Players may write only in their own PC campaign');
 if(Object.keys(body).some(k=>!['value','expected','call'].includes(k))||!Object.hasOwn(body,'value'))bad('Expected {value, expected?, call?}');
 const pc=pcs[0], own=id=>pcs.some(e=>e.id===id), names=pcs.map(e=>e.name);
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
 if(['rolls','pings','presence'].includes(field)&&keys.length===1){
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
