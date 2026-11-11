import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

const worldCampaigns={'world__daddies':'Dungeons & Daddies','world__disney':'Dungeons & Disney'};
const own=(v,k)=>v!=null&&Object.hasOwn(v,k);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const copy=v=>structuredClone(v);
const get=(v,path)=>path.reduce((o,k)=>own(o,k)?o[k]:undefined,v)??null;
function put(v,path,value){let o=v;for(const k of path.slice(0,-1)){o[k]??={};o=o[k];}o[path.at(-1)]=copy(value);}
function integer(v,min=0,max=1000000){if(!Number.isSafeInteger(v)||v<min||v>max)throw Error(`Expected integer ${min}–${max}.`);return v;}
function text(v,max=6000){if(typeof v!=='string'||v.length>max)throw Error('Invalid or oversized text.');return v;}
const requiredText=v=>{if(!text(v,200).trim())throw Error('Name must not be empty.');return v.trim();};
function keys(args,required,optional=[]){if(!args||typeof args!=='object'||Array.isArray(args)||required.some(k=>!own(args,k))||Object.keys(args).some(k=>![...required,...optional].includes(k)))throw Error('Required fields: '+required.join(', ')+'. Optional: '+optional.join(', '));}

export const commandGuide=[
 ['hp_damage','{character} takes 5 damage.','target, amount','Damage consumes temporary HP first, then current HP; minimum zero.'],
 ['hp_heal','Heal {character} by 3 HP.','target, amount','Healing caps at saved maximum HP.'],
 ['hp_set','Set {character} current HP to 20.','target, value','Absolute current HP, bounded by max HP.'],
 ['hp_temp_set','Set {character} temporary HP to 5.','target, value','Replaces temporary HP; does not stack it.'],
 ['hp_max_set','Set {character} maximum HP to 40.','target, value','Manual correction. Lowering maximum HP also caps current HP.'],
 ['slot_spend','{character} expended 1 level 1 spell slot.','target, rank, amount','Increases slots_used without changing slot capacity.'],
 ['slot_restore','Restore 1 level 1 spell slot to {character}.','target, rank, amount','Decreases slots_used; cannot restore more than spent.'],
 ['slot_set_remaining','Set {character} remaining level 1 spell slots to 2.','target, rank, value','Converts remaining count to slots_used.'],
 ['ability_spend','{character} used 1 Channel Divinity charge.','target, field, amount','Only saved charge abilities; no automatic linked resource deductions.'],
 ['ability_restore','Restore 1 Channel Divinity charge to {character}.','target, field, amount','Cannot exceed saved maximum.'],
 ['coin_add','Give {character} 10 gold pieces.','target, field, amount','field: cp, sp, ep, gp or pp. No automatic conversion.'],
 ['coin_spend','{character} spent 2 gold pieces.','target, field, amount','Cannot spend more than owned.'],
 ['level_set','Correct {character} level field to 6.','target, value','Manual level-field correction ONLY. Does not perform a rules-based level-up.'],
 ['xp_add','Award {character} 100 XP.','target, amount','Records XP only; does not automatically level up.'],
 ['stat_set','Set {character} strength score to 16.','target, field, value','field: str, dex, con, int, wis, cha. No automatic derived-stat recalculation.'],
 ['detail_set','Set {character} background to Sailor.','target, field, value','Profile fields: alignment, background, class, subclass, species, player_name, size, combat_role.'],
 ['combat_set','Set {character} armor class to 17.','target, field, value','field: ac, speed, initiative_bonus, inspiration, exhaustion.'],
 ['notes_append','Add to {character} notes: Met a mysterious traveler.','target, value','Appends to existing character or campaign-entity notes.'],
 ['notes_set','Replace {character} notes with: Resting at the inn.','target, value','Exact replacement shown for approval.'],
 ['npc_create','Create an NPC named Mira with notes: A friendly innkeeper.','name; optional notes, location','Creates a stable NPC sheet and linked world record, without invented stats.'],
 ['npc_update','Set Mira status to Missing.','target, field, value','field: name, notes, status, role, faction. Updates linked sheet where applicable.'],
 ['location_create','Create a location named Willow Inn with notes: A quiet roadside inn.','name; optional notes','Creates a location record in the active campaign.'],
 ['location_update','Set Willow Inn notes to: Closed after the storm.','target, field, value','field: name, notes, category.'],
 ['entity_move','Move {character} to Willow Inn.','target, location','Resolves saved location in the same campaign. Records position; does not move VTT tokens.'],
 ['party_move','Move the party to Willow Inn.','location','Records narrative party location; does not move VTT viewport or tokens.'],
 ['event_create','Record an event named Arrival at Willow Inn with notes: The party arrived safely.','name; optional notes, location, when','Stores only supplied facts with stable ID and optional location link.'],
 ['note_create','Create a campaign note named The Missing Key with notes: Mira lost the cellar key.','name; optional notes','Creates a persistent campaign note.']
].map(([action,example,arguments_,policy])=>({action,example,arguments:arguments_,policy}));

export function initializeCommands(store,source){
 store.db.exec('CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY,campaign TEXT NOT NULL,kind TEXT NOT NULL,data TEXT NOT NULL)');
 if(store.db.prepare("SELECT value FROM meta WHERE key='commands-source-v1'").get()||!source)return;
 const raw=typeof source==='string'?JSON.parse(readFileSync(source,'utf8').replace(/^\uFEFF/,'')):source;
 store.tx(()=>{
  const insert=store.db.prepare('INSERT OR IGNORE INTO records VALUES(?,?,?,?)');
  for(const [id,v]of Object.entries(raw.characters?.npcs||{}))insert.run('characters/npcs/'+id,v.campaign||'__unassigned__','npc_sheet',JSON.stringify(v));
  for(const [id,v]of Object.entries(raw.geezvtt?.campaign?.things||{})){
   const campaign=worldCampaigns[v.campaign];
   insert.run('geezvtt/campaign/things/'+id,campaign||'__unassigned__',v.type||'unknown',JSON.stringify(v));
  }
  store.db.prepare('INSERT INTO meta VALUES(?,?)').run('commands-source-v1',JSON.stringify({at:new Date().toISOString(),worldCampaigns}));
 });
}
export function records(store,campaign){return store.db.prepare('SELECT * FROM records WHERE campaign=? ORDER BY id').all(campaign).map(r=>({...r,data:JSON.parse(r.data)}));}
function characterRefs(store,campaign){return store.characters(campaign).map(c=>({id:c.id,name:c.name,table:'characters',kind:'pc',data:c}));}
function entityRefs(store,campaign){
 const all=records(store,campaign);
 return all.filter(r=>r.kind!=='npc_sheet'&&!r.id.startsWith('companion/')&&!r.data.traits?.pc).map(r=>({...r,table:'records',name:r.data.name})).concat(all.filter(r=>r.kind==='npc_sheet'&&!all.some(w=>w.kind==='npc'&&w.data.id===r.data.id)).map(r=>({...r,table:'records',name:r.data.name})));
}
function refs(store,campaign,kind='any'){
 const chars=characterRefs(store,campaign),entities=entityRefs(store,campaign);
 if(kind==='pc')return chars;
 if(kind==='character')return [...chars,...entities.filter(r=>['npc_sheet'].includes(r.kind))];
 if(kind==='any')return [...chars,...entities];
 return entities.filter(r=>r.kind===kind&&(kind!=='npc'||!r.data.traits?.pc));
}
class Clarification extends Error{constructor(candidates,message){super(message);this.candidates=candidates;}}
function resolveRef(store,campaign,query,kind='any'){
 const matches=store.resolve(refs(store,campaign,kind),query);
 if(matches.length!==1)throw new Clarification(matches.map(r=>({id:r.id,name:r.name,kind:r.kind})),matches.length?'Which record do you mean?':'No matching record in the active campaign.');
 return matches[0];
}
function sheetRef(store,campaign,query){
 const r=resolveRef(store,campaign,query);
 if(r.table==='characters'||r.kind==='npc_sheet')return r;
 if(r.kind==='npc'){
  const sheet=store.db.prepare('SELECT * FROM records WHERE id=? AND campaign=?').get('characters/npcs/'+r.data.id,campaign);
  if(sheet)return {...sheet,table:'records',name:r.name,data:JSON.parse(sheet.data)};
 }
 throw Error('That record has no character sheet.');
}
function freshRef(store,campaign,table,id){
 if(!['characters','records'].includes(table))throw Error('Invalid record table.');
 const r=store.db.prepare('SELECT * FROM '+table+' WHERE id=? AND campaign=?').get(id,campaign);
 return r?{...r,table,data:JSON.parse(r.data)}:null;
}
function worldId(campaign){const world=Object.keys(worldCampaigns).find(k=>worldCampaigns[k]===campaign);if(!world)throw Error('No verified world mapping for this campaign.');return world;}

export function planChange(store,campaign,args,context={}){
 store.checkCampaign(campaign);
 const {action}=args||{};if(!commandGuide.some(c=>c.action===action))throw Error('Unsupported campaign action.');
 const patches=[],guards=[];let title='',warning='';
 function patch(r,path,after,label){const before=path.length?get(r.data,path):r.data;patches.push({table:r.table,id:r.id,kind:r.kind,path,before:copy(before),after:copy(after),label});}
 function guard(r,path){guards.push({table:r.table,id:r.id,path,value:get(r.data,path)});}
 function target(kind='sheet'){return kind==='sheet'?sheetRef(store,campaign,args.target):resolveRef(store,campaign,args.target,kind);}
 const required=(...ks)=>keys(args,['action',...ks]);
 if(action.startsWith('hp_')){
  const delta=['hp_damage','hp_heal'].includes(action);required('target',delta?'amount':'value');
  const r=target(),combat=r.data.combat;
  if(!combat)throw Error('No saved combat stats for this character. Supply stats explicitly first.');
  const max=integer(combat.hp_max,1),hp=integer(combat.hp_current,0,max),temp=integer(combat.temp_hp??0);
  const n=integer(delta?args.amount:args.value,delta?1:0);title=r.data.name+' — '+action;
  for(const field of ['hp_current','hp_max','temp_hp'])guard(r,['combat',field]);
  if(action==='hp_damage'){patch(r,['combat','temp_hp'],Math.max(0,temp-n),'Temporary HP');patch(r,['combat','hp_current'],Math.max(0,hp-Math.max(0,n-temp)),'Current HP');}
  if(action==='hp_heal')patch(r,['combat','hp_current'],Math.min(max,hp+n),'Current HP');
  if(action==='hp_set'){integer(n,0,max);patch(r,['combat','hp_current'],n,'Current HP');}
  if(action==='hp_temp_set')patch(r,['combat','temp_hp'],n,'Temporary HP');
  if(action==='hp_max_set'){integer(n,1);patch(r,['combat','hp_max'],n,'Maximum HP');if(hp>n)patch(r,['combat','hp_current'],n,'Current HP (capped)');}
 }else if(action.startsWith('slot_')){
  required('target','rank',action==='slot_set_remaining'?'value':'amount');
  const r=target(),rank=integer(args.rank,1,9),max=integer(r.data.spellcasting?.slots?.[rank]??0);
  if(!max)throw Error('No saved spell slots at that rank.');
  const used=integer(r.data.spellcasting?.slots_used?.[rank]??0,0,max),n=integer(action==='slot_set_remaining'?args.value:args.amount,action==='slot_set_remaining'?0:1,max);
  const next=action==='slot_spend'?used+n:action==='slot_restore'?used-n:max-n;integer(next,0,max);
  guard(r,['spellcasting','slots',String(rank)]);
  // Preserve the exported sparse-array/object convention for slots_used.
  if(!r.data.spellcasting.slots_used){patch(r,['spellcasting','slots_used'],Object.assign(Array.isArray(r.data.spellcasting.slots)?[null]:{}, {[rank]:next}), 'Spell slots used');}
  else patch(r,['spellcasting','slots_used',String(rank)],next,'Level '+rank+' slots used');
  title=r.data.name+' — level '+rank+' spell slots';
 }else if(action.startsWith('ability_')){
  required('target','field','amount');const r=target();
  const abilities=Object.entries(r.data.abilities||{}).filter(([,a])=>a.kind==='charge').map(([id,a])=>({id,name:a.label||id,...a}));
  const matches=store.resolve(abilities,args.field);if(matches.length!==1)throw new Clarification(matches.map(a=>({id:a.id,name:a.name})), 'Which saved charge ability?');
  const a=matches[0],max=integer(a.max),current=integer(a.current,0,max),n=integer(args.amount,1),next=current+(action==='ability_spend'?-n:n);integer(next,0,max);
  guard(r,['abilities',a.id,'max']);patch(r,['abilities',a.id,'current'],next,a.name+' charges');title=r.data.name+' — '+a.name;
 }else if(action.startsWith('coin_')){
  required('target','field','amount');const r=target(),field=args.field;if(!['cp','sp','ep','gp','pp'].includes(field))throw Error('Choose cp, sp, ep, gp or pp.');
  const current=integer(r.data.coin_purse?.[field]??0),n=integer(args.amount,1),next=current+(action==='coin_spend'?-n:n);integer(next);
  patch(r,['coin_purse',field],next,field.toUpperCase());title=r.data.name+' — currency';
 }else if(['level_set','xp_add','stat_set','detail_set','combat_set'].includes(action)){
  required('target',...(action==='xp_add'?['amount']:action==='level_set'?['value']:['field','value']));const r=target();let path,value;
  if(action==='level_set'){path=['level'];value=integer(args.value,1,20);warning='Manual level-field correction only. HP, proficiency, spells, features and choices are NOT recalculated. This is not a completed level-up.';}
  if(action==='xp_add'){path=['xp'];value=integer(integer(r.data.xp??0)+integer(args.amount,1));}
  if(action==='stat_set'){if(!['str','dex','con','int','wis','cha'].includes(args.field))throw Error('Unknown ability score.');path=['stats',args.field];value=integer(args.value,1,30);warning='Manual score correction; derived bonuses are not recalculated.';}
  if(action==='detail_set'){if(!['alignment','background','class','subclass','species','player_name','size','combat_role'].includes(args.field))throw Error('Unsupported profile field.');path=[args.field];value=text(args.value,500);warning='Profile correction only; no automatic rules calculations.';}
  if(action==='combat_set'){if(!['ac','speed','initiative_bonus','inspiration','exhaustion'].includes(args.field))throw Error('Unsupported combat field.');path=['combat',args.field];value=args.field==='inspiration'?args.value:integer(args.value,args.field==='initiative_bonus'?-100:0,args.field==='exhaustion'?6:1000);if(args.field==='inspiration'&&typeof value!=='boolean')throw Error('Inspiration must be true or false.');}
  patch(r,path,value,path.join('.'));title=r.data.name+' — '+path.join('.');
 }else if(['notes_set','notes_append'].includes(action)){
  required('target','value');const r=target('any'),path=r.table==='characters'||r.kind==='npc_sheet'?['text_blocks','notes']:['notes'];const old=get(r.data,path);
  const value=action==='notes_append'?[old,text(args.value)].filter(Boolean).join('\n'):text(args.value);text(value,30000);patch(r,path,value,'Notes');title=r.data.name+' — notes';
  if(r.kind==='npc'){const sheet=freshRef(store,campaign,'records','characters/npcs/'+r.data.id);if(sheet)patch(sheet,['text_blocks','notes'],value,'Linked NPC sheet notes');}
 }else if(action.endsWith('_create')){
  keys(args,['action','name'],['notes',...(['npc_create','event_create'].includes(action)?['location']:[]),...(action==='event_create'?['when']:[])]);
  const kind=action.replace('_create',''),name=requiredText(args.name),world=worldId(campaign);title='Create '+kind+': '+name;
  if(!context.id)context.id=kind+'_'+randomUUID().replaceAll('-','');const id=context.id;
  const existing=entityRefs(store,campaign).filter(r=>r.kind===kind&&r.name.toLowerCase()===name.toLowerCase());if(existing.length)throw Error('A '+kind+' with this name already exists. Update it or choose a distinct name.');
  const notes=args.notes===undefined?'':text(args.notes),traits={};
  if(args.location!==undefined)traits.locationId=resolveRef(store,campaign,args.location,'location').data.id;
  if(args.when!==undefined)traits.when=text(args.when,200);
  const data={id,name,type:kind,campaign:world,notes,traits};
  if(kind==='npc'){
   const sheet={id,name,campaign,record_type:'npc',text_blocks:{notes},meta:{record_type:'npc',created_at_iso:context.createdAt||(context.createdAt=new Date().toISOString())}};
   patch({table:'records',id:'characters/npcs/'+id,kind:'npc_sheet',data:null},[],sheet,'NPC sheet');
  }
  patch({table:'records',id:'geezvtt/campaign/things/'+id,kind,data:null},[],data,kind+' record');
 }else if(['npc_update','location_update'].includes(action)){
  required('target','field','value');const kind=action==='npc_update'?'npc':'location',r=target(kind);
  if(!(kind==='npc'?['name','notes','status','role','faction']:['name','notes','category']).includes(args.field))throw Error('Unsupported '+kind+' field.');
  const value=args.field==='name'?requiredText(args.value):text(args.value),path=['name','notes'].includes(args.field)?[args.field]:['traits',args.field];
  patch(r,path,value,args.field);title=r.data.name+' — '+args.field;
  if(kind==='npc'){
   const sheet=freshRef(store,campaign,'records','characters/npcs/'+r.data.id);
   if(sheet){const paths={name:['name'],notes:['text_blocks','notes'],status:['vtt_profile','status']};if(paths[args.field])patch(sheet,paths[args.field],value,'Linked NPC sheet '+args.field);}
  }
 }else if(action==='entity_move'||action==='party_move'){
  required(...(action==='entity_move'?['target','location']:['location']));const location=resolveRef(store,campaign,args.location,'location');
  if(action==='party_move'){
   const id='companion/party_location/'+worldId(campaign),old=freshRef(store,campaign,'records',id);patch(old||{table:'records',id,kind:'party_location',data:null},[],{locationId:location.data.id,name:location.name},'Party location');title='Party location';
  }else{
   const r=target('any');if(!['pc','npc','npc_sheet'].includes(r.kind))throw Error('Only characters and NPCs can move.');
   if(r.kind==='npc')patch(r,['traits','locationId'],location.data.id,'Location');
   else{const id='companion/character_locations/'+r.id,old=freshRef(store,campaign,'records',id);patch(old||{table:'records',id,kind:'character_location',data:null},[],{characterId:r.id,locationId:location.data.id,name:location.name},'Character location');}
   title=r.data.name+' — location';
  }
 }
 return {title,warning,patches,guards,context};
}

export function queueChange(store,campaign,requestId,args){
 return store.tx(()=>{
  const previous=store.db.prepare('SELECT id FROM proposals WHERE request_id=?').get(requestId);
  if(previous){const p=store.proposal(previous.id);if(p.campaign!==campaign||p.operation!=='campaign_change'||!same(p.args,args))throw Error('This message already queued a different change.');return p;}
  const plan=planChange(store,campaign,args),p={id:randomUUID(),campaign,requestId,revision:1,status:'pending_review',operation:'campaign_change',args:copy(args),...plan,createdAt:new Date().toISOString()};
  store.db.prepare('INSERT INTO proposals VALUES(?,?,?,?,?,?)').run(p.id,campaign,requestId,1,p.status,JSON.stringify(p));return p;
 });
}
export function reviewChange(store,p){
 const stale=p.patches.some(x=>{const r=freshRef(store,p.campaign,x.table,x.id);return !same(x.path.length?get(r?.data,x.path):r?.data??null,x.before);})||p.guards.some(x=>!same(get(freshRef(store,p.campaign,x.table,x.id)?.data,x.path),x.value));
 if(stale){
  try{Object.assign(p,planChange(store,p.campaign,p.args,p.context));p.blocked=false;p.conflict='Relevant state changed. Review the refreshed preview and approve again.';}
  catch(e){p.blocked=true;p.conflict='Cannot apply this proposal: '+e.message+' Reject it and submit a corrected request.';}
  p.revision++;store.saveProposal(p);return p;
 }
 if(p.blocked)throw Error(p.conflict);
 // Revalidate bounds and references on every application, even when fields match.
 planChange(store,p.campaign,p.args,p.context);
 for(const x of p.patches){
  const r=freshRef(store,p.campaign,x.table,x.id);let data=r?copy(r.data):null;
  if(x.path.length){if(!r)throw Error('Record was removed.');put(data,x.path,x.after);}else data=copy(x.after);
  if(r)store.db.prepare('UPDATE '+x.table+' SET data=? WHERE id=? AND campaign=?').run(JSON.stringify(data),x.id,p.campaign);
  else if(x.table==='records')store.db.prepare('INSERT INTO records VALUES(?,?,?,?)').run(x.id,p.campaign,x.kind,JSON.stringify(data));
  else throw Error('Creating player records is unsupported.');
 }
 Object.assign(p,{status:'applied',appliedAt:new Date().toISOString(),approval:{actor:'local DM',revision:p.revision,timestamp:new Date().toISOString()}});
 store.saveProposal(p);store.db.prepare('INSERT INTO audit VALUES(?,?)').run(p.id,JSON.stringify(p));return p;
}
export function commandResult(fn){try{return fn();}catch(e){if(e instanceof Clarification)return {needsClarification:true,candidates:e.candidates,message:e.message};throw e;}}
export function inspectRecord(store,campaign,target){
 const r=resolveRef(store,campaign,target);
 function bounded(record){
  const data=copy(record);if(data.spellcasting?.spells)data.spellcasting.spells=Object.values(data.spellcasting.spells).map(s=>({name:s.name,level:s.level,prepared_type:s.prepared_type}));
  if(data.abilities)data.abilities=Object.fromEntries(Object.entries(data.abilities).map(([key,a])=>[key,{label:a.label,kind:a.kind,current:a.current,max:a.max,recharge:a.recharge}]));
  return JSON.stringify(data).length>16000?{id:data.id,name:data.name,combat:data.combat,level:data.level,spellcasting:data.spellcasting,coin_purse:data.coin_purse,abilities:data.abilities,notice:'Large descriptions omitted; inspect the campaign records browser for full text.'}:data;
 }
 const sheet=r.kind==='npc'?freshRef(store,campaign,'records','characters/npcs/'+r.data.id):null;
 return {id:r.id,kind:r.kind,record:bounded(r.data),...(sheet?{sheet:bounded(sheet.data)}:{})};
}
export function commandDirectory(store,campaign){return {npcs:refs(store,campaign,'npc').map(r=>({id:r.id,name:r.name})),locations:refs(store,campaign,'location').map(r=>({id:r.id,name:r.name})),notes:refs(store,campaign,'note').map(r=>({id:r.id,name:r.name})),events:refs(store,campaign,'event').map(r=>({id:r.id,name:r.name}))};}
export const commandTools=[{type:'function',function:{name:'prepare_campaign_update',description:'Prepare ONE validated campaign change for approval. Actions and required fields: '+commandGuide.map(c=>c.action+'('+c.arguments+')').join('; ')+'. All updates require human approval. level_set is a manual level-field correction, never a complete level-up.',parameters:{type:'object',additionalProperties:false,required:['action'],properties:{action:{type:'string',enum:commandGuide.map(c=>c.action)},target:{type:'string'},amount:{type:'integer',minimum:1},value:{type:['string','integer','boolean']},rank:{type:'integer',minimum:1,maximum:9},field:{type:'string'},name:{type:'string'},notes:{type:'string'},location:{type:'string'},when:{type:'string'}}}}},{type:'function',function:{name:'inspect_campaign_record',description:'Read a character, NPC, location, event or note in the active campaign. Use to inspect HP, spell slots, ability charge keys, inventory or notes before proposing a change.',parameters:{type:'object',additionalProperties:false,required:['target'],properties:{target:{type:'string'}}}}}];
