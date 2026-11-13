import { validate } from './validate.mjs';
import {schema as sceneSchema} from './schema-loader.mjs';
import {sha256} from './sha256.mjs';
import { canonicalName } from './ids.mjs';
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const int=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&v>=min&&v<=max?v:fail(`Expected integer ${min}..${max}, got ${v}`);
const arg=(name,type='string',required=true,values)=>({name,type,required,...(values?{enum:values}:{})});
const target=arg('entity'), amount=arg('amount','integer');
export const actions=Object.create(null);
export function validateArgs(action,args){
 if(!action)fail('Unknown action');
 if(!args||typeof args!=='object'||Array.isArray(args))fail('Expected args object');
 for(const k of Object.keys(args))if(!action.args.some(s=>s.name===k))fail(`Unknown argument: ${k}`);
 for(const s of action.args){const v=args[s.name];if(v===undefined){if(s.required)fail(`Missing argument: ${s.name}`);continue;}
 const ok=s.type==='integer'?Number.isSafeInteger(v):s.type==='number'?typeof v==='number'&&Number.isFinite(v):s.type==='combatants'?Array.isArray(v)&&v.every(x=>x&&typeof x.name==='string'&&x.name.trim()&&Number.isSafeInteger(x.init)):s.type==='array'?Array.isArray(v)&&v.every(x=>typeof x==='string'):typeof v===s.type;
 if(!ok||(s.type==='string'&&!v.trim())||(s.enum&&!s.enum.includes(v)))fail(`Invalid ${s.name}: expected ${s.enum?.join('|')??s.type}`);
 }
}
export function resolveEntity(g,q,c,kinds){
 const all=Object.values(g.worlds.gaia.entities).filter(e=>(!c||!e.campaign||e.campaign===c)&&(!kinds||kinds.includes(e.kind)));
 let found=all.filter(e=>e.id===q);if(!found.length)found=all.filter(e=>canonicalName(e.name)===canonicalName(q));
 if(found.length!==1)fail(found.length?`Ambiguous name "${q}": ${found.map(e=>`${e.name} (${e.id}, ${e.campaign??'shared'})`).join(', ')}`:`Entity not found: ${q}`);
 return found[0];
}
const idFor=(g,kind,a)=>`${kind}_${sha256(JSON.stringify([g,kind,a])).slice(0,12)}`;
const result=(changes,summary)=>({changes,summary});
const patch=(e,p,summary)=>result([{op:'patch',entity:e.id,patch:p}],summary);
const scope=(g,a)=>{if(!a.campaign||!Object.hasOwn(g.campaigns,a.campaign))fail('A valid campaign is required (--campaign or GEEZ_CAMPAIGN)');return a.campaign;};
const sheet=e=>{if(!['pc','npc','creature'].includes(e.kind))fail('Expected character');return e.kind==='pc'?e.data:e.data.statblock;};
const base=e=>e.kind==='pc'?'data.':'data.statblock.';
function add(name,summary,args,player,compute){actions[name]={name,summary,args:[...args,arg('campaign','string',['reveal','hide','party.move','log.add','weather.set','time.set'].includes(name)||name.startsWith('token.')||name.startsWith('initiative.')||name==='combat.end')],roles:player?['gm','player']:['gm'],run(g,a,as={role:'gm',pcs:[]}){
 validateArgs(this,a);if(name!=='campaign.create'&&a.campaign&&!Object.hasOwn(g.campaigns,a.campaign))fail(`Unknown campaign: ${a.campaign}`);
 if(!this.roles.includes(as.role))fail('This action requires a GM',403);
 if(/^(party|everyone)$/i.test(a.entity??'')&&/^(hp|coin|xp|condition|rest)\./.test(name)){
  const c=scope(g,a),ids=Object.keys(g.campaigns[c].party??{}).filter(id=>g.campaigns[c].party[id]&&g.worlds.gaia.entities[id]?.kind==='pc');if(!ids.length)fail('Party has no PCs');
  const n=a.split?Math.floor(int(a.amount,1)/ids.length):a.amount;
  const plans=ids.map(entity=>this.run(g,{...a,entity,...(a.split?{amount:n,split:false}:{})},as));
  return result(plans.flatMap(p=>p.changes),plans.map(p=>p.summary).join(' · ')+(a.split?' · remainder '+a.amount%ids.length+' '+a.coin:''));
 }
 const e=a.entity?resolveEntity(g,a.entity,a.campaign):null;
 if(as.role==='player') {
  if(name==='token.move') {
   const token=g.campaigns[a.campaign]?.state?.tokens?.[a.token];
   const active=g.campaigns[a.campaign]?.state?.active_map;
   if(!token||!as.pcs?.includes(token.entity)||g.worlds.gaia.entities[token.entity]?.kind!=='pc'||g.worlds.gaia.entities[token.entity].campaign!=null&&g.worlds.gaia.entities[token.entity].campaign!==a.campaign||g.campaigns[a.campaign].state.session?.lockMove||active!=null&&active!==token.map)fail('Players may move only their own PC tokens in their campaign on the active map while movement is unlocked',403);
  } else if(name!=='item.move'&&(e?.kind!=='pc'||!as.pcs?.includes(e.id)))fail('Players may act only on their own PCs',403);
 }
 return compute(g,a,e,as);
}};}
add('campaign.create','Create a campaign if absent.',[arg('id'),arg('name'),arg('gm','string',false)],false,(g,a)=>{
 if(!/^[a-z0-9_-]+$/.test(a.id)||['__proto__','prototype','constructor'].includes(a.id))fail('Invalid campaign id');
 return result(Object.hasOwn(g.campaigns,a.id)?[]:[{op:'campaign',id:a.id,value:{info:{name:a.name,world:'gaia',gm:a.gm??'gm'},party:{},reveals:{},state:{}}}],`Created campaign ${a.name}`);
});
for(const mode of ['damage','heal','set','temp','max'])add(`hp.${mode}`,({damage:'Deal damage, consuming temporary HP first.',heal:'Heal up to saved maximum HP.',set:'Set current HP within saved bounds.',temp:'Replace temporary HP.',max:'Correct maximum HP and cap current HP.'})[mode],[target,amount],mode!=='max',(g,a,e)=>{
 const c=sheet(e)?.combat;if(!c)fail('No saved combat stats; supply stats explicitly first');
 const max=int(c.hp_max,1),hp=int(c.hp_current,0,max),temp=int(c.temp_hp??0),n=int(a.amount,['damage','heal','max'].includes(mode)?1:0);let next=hp,t=temp;const p={},b=base(e)+'combat.';
 if(mode==='damage'){t=Math.max(0,temp-n);next=Math.max(0,hp-Math.max(0,n-temp));p[b+'temp_hp']=t;}
 if(mode==='heal')next=Math.min(max,hp+n);
 if(mode==='set')next=int(n,0,max);
 if(mode==='temp'){t=n;p[b+'temp_hp']=t;}
 if(mode==='max'){p[b+'hp_max']=n;next=Math.min(hp,n);}
 if(next===0 && c.concentration?.active)p[b+'concentration']={active:false,spell:'',check:null};
 else if(c.concentration?.active && (mode==='damage'||mode==='set'&&next<hp))p[b+'concentration']={...c.concentration,check:{id:globalThis.crypto.randomUUID(),dc:Math.max(10,Math.floor((mode==='damage'?n:hp-next)/2))}};
 if(mode==='damage'&&hp===0)p[b+'death_saves']={success:c.death_saves?.success||0,fail:Math.min(3,(c.death_saves?.fail||0)+1)};
 if(next>0&&c.death_saves)p[b+'death_saves']={success:0,fail:0};
 p[b+'hp_current']=next;return patch(e,p,`${e.name}: HP ${hp} -> ${next} (temp ${t})${mode==='max'?`; max ${max} -> ${n}`:''}`);
});
for(const mode of ['spend','restore']){
 add(`slot.${mode}`,`${mode==='spend'?'Spend':'Restore'} saved spell slots.`,[target,amount,arg('level','integer')],true,(g,a,e)=>{
 const s=sheet(e)?.spellcasting,l=int(a.level,1,9),max=int(s?.slots?.[l]??0,1),old=int(s?.slots_used?.[l]??0,0,max),next=int(old+(mode==='spend'?1:-1)*int(a.amount,1),0,max);
 const used=structuredClone(s.slots_used??(Array.isArray(s.slots)?[null]:{}));used[l]=next;
 return patch(e,{[base(e)+'spellcasting.slots_used']:used},`${e.name}: level ${l} slots used ${old} -> ${next}`);
 });
 add(`ability.${mode}`,`${mode==='spend'?'Spend':'Restore'} saved ability charges.`,[target,arg('ability'),amount],true,(g,a,e)=>{
 const found=Object.entries(sheet(e)?.abilities??{}).filter(([id,v])=>v.kind==='charge'&&(id===a.ability||canonicalName(v.label??id)===canonicalName(a.ability)));
 if(found.length!==1)fail(`Expected one saved charge ability: ${a.ability}; candidates: ${found.map(([id])=>id).join(', ')}`);
 const [id,v]=found[0],max=int(v.max),old=int(v.current,0,max),next=int(old+(mode==='spend'?-1:1)*int(a.amount,1),0,max);
 return patch(e,{[base(e)+`abilities.${id}.current`]:next},`${e.name}: ${v.label??id} ${old} -> ${next}`);
 });
}
for(const mode of ['add','remove'])add(`condition.${mode}`,`${mode==='add'?'Add':'Remove'} a character condition.`,[target,arg('condition')],true,(g,a,e)=>{
 const s=sheet(e);if(!s?.combat)fail('No saved combat stats');const old=s.combat.conditions??[];if(!Array.isArray(old))fail('Invalid saved conditions');
 return patch(e,{[base(e)+'combat.conditions']:mode==='add'?[...new Set([...old,a.condition])]:old.filter(x=>x!==a.condition)},`${e.name}: ${mode} ${a.condition}`);
});
for(const mode of ['add','spend'])add(`coin.${mode}`,`${mode==='add'?'Add':'Spend'} coins without conversion.`,[target,amount,arg('coin','string',true,['cp','sp','ep','gp','pp']),...(mode==='add'?[arg('split','boolean',false)]:[])],true,(g,a,e)=>{
 const old=int(sheet(e)?.coin_purse?.[a.coin]??0),next=int(old+(mode==='add'?1:-1)*int(a.amount,mode==='add'?0:1));return patch(e,{[base(e)+`coin_purse.${a.coin}`]:next},`${e.name}: ${a.coin} ${old} -> ${next}`);
});
for(const mode of ['give','take'])add(`item.${mode}`,`${mode==='give'?'Give':'Take'} PC inventory items.`,[target,arg('item'),arg('qty','integer')],true,(g,a,e)=>{
 if(e.kind!=='pc')fail('Inventory actions require a PC');const inv=structuredClone(e.data.inventory??{});if(Array.isArray(inv))fail('Expected inventory keyed by slugs');
 const slug=a.item.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');if(!slug)fail('Invalid item slug');
 let found;try{found=[inventoryItem(e,a.item)[0]];}catch(error){if(mode==='take'||!error.message.startsWith('Unknown item'))throw error;found=[];}
 const key=found[0]??slug;if(!found.length&&inv[key])fail('Inventory slug collision');const old=int(inv[key]?.qty??0),next=int(old+(mode==='give'?1:-1)*int(a.qty,1));
 inv[key]={...inv[key],name:inv[key]?.name??a.item,qty:next};return patch(e,{'data.inventory':inv},`${e.name}: ${inv[key].name} ${old} -> ${next}`);
});
add('xp.add','Award XP without changing level.',[target,amount],false,(g,a,e)=>{sheet(e);return patch(e,{[base(e)+'xp']:int(int(sheet(e).xp??0)+int(a.amount,1))},`${e.name}: +${a.amount} XP`);});
for(const kind of ['npc','creature','place'])add(`${kind}.create`,`Create a ${kind} using only supplied facts.`,[arg('name'),...(kind==='npc'?['ancestry','profession','notes','at'].map(k=>arg(k,'string',false)):kind==='creature'?[arg('srd_index','string',false)]:[arg('place_kind'),arg('in','string',false),arg('notes','string',false)])],false,(g,a)=>{
 const data=kind==='npc'?{profile:{}}:kind==='creature'?{statblock:{}}:{place_kind:a.place_kind};
 for(const k of ['ancestry','profession'])if(a[k]!==undefined)data.profile[k]=a[k];if(a.notes!==undefined)data.notes=a.notes;if(a.srd_index)data.statblock.srd_index=a.srd_index;
 const parent=a.at??a.in;if(parent)data[kind==='npc'?'home':'parent']=resolveEntity(g,parent,a.campaign,['place']).id;
 const e={id:idFor(g,kind,a),kind,name:a.name,world:'gaia',campaign:a.campaign??null,data,source:{system:'geez'}};const changes=[{op:'put',entity:e}];
 if(parent)changes.push({op:'link',from:e.id,to:data.home??data.parent,role:'located_in',...(a.campaign?{campaign:a.campaign}:{})});return result(changes,`Created ${kind} ${a.name}`);
});
for(const kind of ['npc','place'])add(`${kind}.update`,`Update supplied ${kind} fields.`,[target,...(kind==='npc'?['status','disposition','notes','home']:['name','place_kind','in','notes']).map(k=>arg(k,'string',false))],false,(g,a,e)=>{
 if(e.kind!==kind)fail(`Expected ${kind}`);const p={};for(const [k,v]of Object.entries(a))if(!['entity','campaign'].includes(k))p[k==='name'?'name':`data.${k==='in'?'parent':k}`]=['home','in'].includes(k)?resolveEntity(g,v,a.campaign,['place']).id:v;
 if(!Object.keys(p).length)fail('Supply at least one update field');return patch(e,p,`Updated ${e.name}`);
});
add('link.add','Link two saved entities.',[arg('from'),arg('to'),arg('role')],false,(g,a)=>result([{op:'link',from:resolveEntity(g,a.from,a.campaign).id,to:resolveEntity(g,a.to,a.campaign).id,role:a.role,...(a.campaign?{campaign:a.campaign}:{})}],'Added relationship'));
for(const mode of ['reveal','hide'])add(mode,`${mode==='reveal'?'Reveal':'Hide'} an entity for a campaign.`,[target,...(mode==='reveal'?[arg('known','boolean',false)]:[])],false,(g,a,e)=>result([{op:'reveal',campaign:scope(g,a),entity:e.id,known:mode==='reveal'?(a.known??true):false}],`${e.name}: ${mode==='reveal'?'revealed':'hidden'}`));
for(const mode of ['place','move','remove'])add(`token.${mode}`,`${mode==='place'?'Place':mode==='move'?'Move':'Remove'} a map token.`,mode==='place'?[target,arg('map'),arg('x','number'),arg('y','number')]:[arg('token'),...(mode==='move'?[arg('x','number'),arg('y','number')]:[])],mode==='move',(g,a,e)=>{
 const c=scope(g,a),tokens=g.campaigns[c].state?.tokens??{};
 if(mode==='place'){if(!['pc','npc','creature'].includes(e.kind))fail('Token requires character');return result([{op:'token',campaign:c,id:idFor(g,'token',a),value:{entity:e.id,map:resolveEntity(g,a.map,c,['map']).id,x:a.x,y:a.y}}],`Placed ${e.name}`);}
 if(!Object.hasOwn(tokens,a.token))fail(`Token not found: ${a.token}`);return result([{op:'token',campaign:c,id:a.token,value:mode==='remove'?null:{...tokens[a.token],x:a.x,y:a.y}}],`${mode==='move'?'Moved':'Removed'} token ${a.token}`);
});
add('party.move','Record narrative party location.',[arg('to')],false,(g,a)=>result([{op:'env',campaign:scope(g,a),field:'party_location',value:resolveEntity(g,a.to,a.campaign,['place']).id}],'Moved party'));
add('log.add','Append a campaign journal entry.',[arg('text'),arg('refs','array',false)],false,(g,a)=>result([{op:'log',campaign:scope(g,a),text:a.text,refs:(a.refs??[]).map(q=>resolveEntity(g,q,a.campaign).id)}],a.text));
add('weather.set','Set campaign weather and optional wind.',[arg('weather','string',true,['clear','cloudy','rain','storm','fog','snow','ash']),arg('wind','string',false)],false,(g,a)=>{scope(g,a);return result([{op:'env',campaign:a.campaign,field:'environment',value:{...g.campaigns[a.campaign].state?.environment,weather:a.weather,...(a.wind!==undefined?{wind:a.wind}:{})}}],`Weather: ${a.weather}`);});
add('time.set','Set time of day and optional day number.',[arg('time_of_day','string',true,['dawn','day','dusk','night']),arg('day_number','integer',false)],false,(g,a)=>{scope(g,a);if(a.day_number!==undefined)int(a.day_number);return result([{op:'env',campaign:a.campaign,field:'environment',value:{...g.campaigns[a.campaign].state?.environment,time_of_day:a.time_of_day,...(a.day_number!==undefined?{day_number:a.day_number}:{})}}],`Time: ${a.time_of_day}`);});
const initiative=(g,a)=>structuredClone(g.campaigns[scope(g,a)].state?.initiative??{round:1,turn:0,order:[]});
const initResult=(a,value,summary)=>result([{op:'initiative',campaign:a.campaign,value}],summary);
function combatant(g,a,v,i){
 let e;try{e=resolveEntity(g,v.name,a.campaign,['pc','npc','creature']);}catch(error){if(!error.message.startsWith('Entity not found:'))throw error;}
 return {id:`combatant_${i}`,label:e?.name??v.name,...(e?{entity:e.id}:{}),init:int(v.init,-1000,1000)};
}
add('initiative.set','Set initiative order; begin round one.',[arg('list','combatants')],false,(g,a)=>{scope(g,a);if(!a.list.length)fail('Supply combatants');return initResult(a,{round:1,turn:0,order:a.list.map((v,i)=>combatant(g,a,v,i)).sort((a,b)=>b.init-a.init)},'Initiative set · round 1');});
add('initiative.add','Add an initiative combatant.',[arg('name'),arg('init','integer')],false,(g,a)=>{
 const v=initiative(g,a),current=v.order[v.turn]?.id;let i=0;while(v.order.some(x=>x.id===`combatant_${i}`))i++;
 v.order.push(combatant(g,a,a,i));v.order.sort((a,b)=>b.init-a.init);v.turn=current?v.order.findIndex(x=>x.id===current):0;return initResult(a,v,`Initiative: added ${a.name}`);
});
add('initiative.remove','Remove one initiative combatant.',[arg('id')],false,(g,a)=>{
 const v=initiative(g,a),found=v.order.filter(x=>x.id===a.id||x.entity===a.id||canonicalName(x.label)===canonicalName(a.id));if(found.length!==1)fail('Expected one combatant');
 const current=v.order[v.turn]?.id,index=v.order.indexOf(found[0]);v.order.splice(index,1);v.turn=Math.max(0,v.order.findIndex(x=>x.id===current));if(current===found[0].id)v.turn=index%Math.max(1,v.order.length);return initResult(a,v,`Initiative: removed ${found[0].label}`);
});
for(const mode of ['next','prev'])add(`initiative.${mode}`,'Advance or rewind initiative.',[],false,(g,a)=>{
 const v=initiative(g,a);if(!v.order.length)fail('No active combat');v.turn+=mode==='next'?1:-1;if(v.turn>=v.order.length){v.turn=0;v.round++;}if(v.turn<0){if(v.round<=1)fail('Already at the beginning of combat');v.turn=v.order.length-1;v.round--;}return initResult(a,v,`Round ${v.round} · ${v.order[v.turn].label}`);
});
add('combat.end','End initiative.',[],false,(g,a)=>{scope(g,a);return initResult(a,null,'Combat ended');});
function deathPatch(e,success,failures){const b=base(e)+'combat.',p={[b+'death_save_successes']:success,[b+'death_save_failures']:failures};if(sheet(e).combat.death_saves)p[b+'death_saves']={...sheet(e).combat.death_saves,success,fail:failures};return p;}
for(const mode of ['long','short'])add(`rest.${mode}`,`Take a ${mode} rest using saved recharge fields.`,[target],true,(g,a,e)=>{
 if(e.kind!=='pc'||!e.data.combat)fail('Rest requires a PC sheet');const s=e.data,p={};
 for(const [id,v]of Object.entries(s.abilities??{}))if(v.kind==='charge'&&(v.recharge==='short_or_long_rest'||v.recharge==='short_rest'||mode==='long'&&v.recharge==='long_rest'))p[`data.abilities.${id}.current`]=int(v.max);
 if(mode==='long'){Object.assign(p,deathPatch(e,0,0),{'data.combat.hp_current':int(s.combat.hp_max,1),'data.combat.temp_hp':0});if(s.spellcasting){const used=structuredClone(s.spellcasting.slots_used??s.spellcasting.slots??{});for(const k of Object.keys(used))if(used[k]!==null)used[k]=0;p['data.spellcasting.slots_used']=used;}}
 return patch(e,p,`${e.name}: ${mode} rest`);
});
for(const mode of ['pass','fail','stable'])add(`deathsave.${mode}`,'Update saved death saves.',[target],true,(g,a,e)=>{
 const c=sheet(e)?.combat;if(!c)fail('No saved combat stats');const success=mode==='stable'?3:Math.min(3,int(c.death_save_successes??c.death_saves?.success??0,0,3)+(mode==='pass'?1:0)),failures=mode==='stable'?0:Math.min(3,int(c.death_save_failures??c.death_saves?.fail??0,0,3)+(mode==='fail'?1:0));return patch(e,deathPatch(e,success,failures),`${e.name}: death saves ${success} pass / ${failures} fail`);
});
for(const mode of ['set','clear'])add(`concentration.${mode}`,'Update saved concentration.',[target,...(mode==='set'?[arg('spell')]:[])],true,(g,a,e)=>{if(!sheet(e)?.combat)fail('No saved combat stats');if(mode==='set'&&(a.spell.length>200||sheet(e).combat.hp_current===0))fail('Concentration needs a spell of at most 200 characters and positive HP');return patch(e,{[base(e)+'combat.concentration']:{...sheet(e).combat.concentration,active:mode==='set',spell:mode==='set'?a.spell:'',check:null}},`${e.name}: ${mode==='set'?'concentrating '+a.spell:'concentration cleared'}`);});
export function inventoryItem(e,q){
 const norm=s=>canonicalName(s).replace(/\bpotions\b/g,'potion').replace(/^potion of healing$/,'healing potion').replace(/(ch|sh|ss|x|z)es$/,'$1').replace(/ies$/,'y').replace(/s$/,'');const entries=Object.entries(e.data.inventory??{}),n=norm(q);
 let found=entries.filter(([id,v])=>id===q||canonicalName(v.name)===canonicalName(q));if(!found.length)found=entries.filter(([,v])=>norm(v.name)===n);
 if(found.length!==1)fail(`${found.length?'Ambiguous':'Unknown'} item "${q}" on ${e.name}`);return found[0];
}
add('item.move','Move saved inventory between PCs.',[arg('from'),arg('to'),arg('item'),arg('qty','integer')],true,(g,a,e,as)=>{
 const from=resolveEntity(g,a.from,a.campaign,['pc']),to=resolveEntity(g,a.to,a.campaign,['pc']);if(from.id===to.id)fail('Choose different PCs');if(as.role==='player'&&(!as.pcs.includes(from.id)||!as.pcs.includes(to.id)))fail('Players may act only on their own PCs',403);
 const [key,item]=inventoryItem(from,a.item),qty=int(a.qty,1),inv=structuredClone(to.data.inventory??{});let dest;try{dest=inventoryItem(to,item.name)[0];}catch(error){if(!error.message.startsWith('Unknown'))throw error;dest=key;if(inv[dest])fail('Inventory slug collision');}
 inv[dest]={...item,...inv[dest],qty:int(inv[dest]?.qty??0)+qty};return result([{op:'patch',entity:from.id,patch:{[`data.inventory.${key}.qty`]:int(int(item.qty)-qty)}},{op:'patch',entity:to.id,patch:{'data.inventory':inv}}],`${from.name} -> ${to.name}: ${qty} ${item.name}`);
});
for(const mode of ['set','unset'])add(`equip.${mode}`,'Change equipped gear; compute AC only from saved fields.',[target,arg('slot','string',true,['armor','shield','main_hand','off_hand']),...(mode==='set'?[arg('item')]:[])],false,(g,a,e)=>{
 if(e.kind!=='pc')fail('Equipment requires a PC');const eq={...e.data.equipped};if(mode==='set'){const [,item]=inventoryItem(e,a.item);if(!int(item.qty))fail('Item is not held');eq[a.slot]=a.slot==='shield'?true:item.name;}else if(a.slot==='shield')eq.shield=false;else delete eq[a.slot];
 const p={'data.equipped':eq};let ac;
 // Only explicit numeric armor fields are authoritative; prose descriptions are not rules.
 const armor=eq.armor?Object.values(e.data.inventory??{}).find(v=>v.name===eq.armor):null;
 const dex=e.data.stats?.dex,def=armor?.armor_class;
 if(!eq.armor&&Number.isFinite(dex))ac=10+Math.floor((dex-10)/2);
 else if(typeof def==='number')ac=def;
 else if(Number.isFinite(def?.base)&&(!def.dex_bonus||Number.isFinite(dex)))ac=def.base+(def.dex_bonus?Math.min(Math.floor((dex-10)/2),def.max_bonus??Infinity):0);
 if(ac!==undefined&&eq.shield){const sh=Object.values(e.data.inventory??{}).find(v=>v.name?.toLowerCase()==='shield');if(Number.isFinite(sh?.ac_bonus))ac+=sh.ac_bonus;else ac=undefined;}
 if(ac!==undefined)p['data.combat.ac']=ac;return patch(e,p,`${e.name}: ${mode==='set'?'equipped':'unequipped'} ${a.slot} · ${ac===undefined?'AC not computable from saved fields':`AC ${ac}`}`);
});

export const listActions=()=>Object.values(actions).map(({name,summary,args,roles})=>({name,summary,args,roles}));

add('map.publish','Publish a data map scene.',[target,arg('scene','object')],false,(g,a,e)=>{
 const errors=validate(sceneSchema,'geez2vtt',a.scene);
 if(errors.length)fail('Invalid geez2vtt: '+errors.join('; '));
 if(new Set(a.scene.floors.map(f=>f.level)).size!==a.scene.floors.length)fail('Duplicate floor level');
 if(!['place','map'].includes(e.kind))fail('Expected a map or place');
 const changes=[];let map=e;
 if(e.kind==='place'){
  map=e.data.childMap?resolveEntity(g,e.data.childMap,a.campaign,['map']):Object.values(g.worlds.gaia.entities).find(m=>m.kind==='map'&&m.data.parent_place===e.id&&(!a.campaign||!m.campaign||m.campaign===a.campaign));
  if(!map){map={id:idFor(g,'map',a),kind:'map',name:a.scene.name,world:'gaia',campaign:a.campaign??e.campaign??null,data:{parent_place:e.id},source:{system:'geez'}};changes.push({op:'put',entity:map});}
  changes.push({op:'patch',entity:e.id,patch:{'data.childMap':map.id}});
 }
 changes.push({op:'patch',entity:map.id,patch:{'data.scene':a.scene,'data.size':{cols:a.scene.grid.cols,rows:a.scene.grid.rows},'data.floors':a.scene.floors.map(({level,name,elevation})=>({level,name,elevation}))}});
 return result(changes,'Published '+a.scene.name);
});

add('elevation.set','Set character token elevation in feet.',[target,arg('feet','integer')],true,(g,a,e)=>{sheet(e);int(a.feet,-10000,10000);return patch(e,{[base(e)+'combat.elevation']:a.feet},`${e.name}: elevation ${a.feet} ft`);});
add('concentration.keep','Resolve a concentration check.',[target,arg('check')],true,(g,a,e)=>{const c=sheet(e)?.combat?.concentration;if(!c?.active||c.check?.id!==a.check)fail('Concentration check changed',409);return patch(e,{[base(e)+'combat.concentration']:{...c,check:null}},`${e.name}: concentration kept`);});
