// Persistent identities and references for generated campaign content.
// Rendering stays in the existing town/building/token systems; this is their shared ledger.
import { rollPlace } from './lore.js';
import { makeNPC } from './rollers.js';

const clone = x => JSON.parse(JSON.stringify(x));
export const canonicalName = s => String(s || '').normalize('NFKC').toLowerCase().replace(/[\u2018\u2019]/g,"'").replace(/^(?:the|a|an)\s+/, '').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const hash = s => {let n=2166136261;for(const c of s)n=Math.imul(n^c.charCodeAt(0),16777619);return(n>>>0).toString(36);};
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const TYPES=['person','place','thing','event','faction'];
const SKIP=/^(?:Who|What|When|Where|Why|How|The|A|An|It|Its|They|Their|You|Your|Someone|Something|Every|Each|No|None|Once|Before|After|This|That|These|Those|First|Second|Third|Last|Level|DC|HP|AC|GM|SRD|Str|Dex|Con|Int|Wis|Cha|Perception|Investigation|Arcana|Dexterity|Constitution|Strength|Wisdom|Intelligence|Charisma|Stealth|Insight|Persuasion|Survival|Athletics|Deception|Medicine|History|Commoner|Guard|Scout|Priest|Noble|Veteran|Bandit|Spy|Thug|Knight|Mage|Acolyte|Cult Fanatic|Misty Step|Cure Wounds|Detect Magic|Spell Scroll|Potion of Healing|Roll|Go|Copy|Save|Reroll|Unknown|Nothing|Undead|Uncommon|Rare|Common|Legendary|Very|Minor|Major|Coins|Reward|Rewarded|Disarm|Spot|Save|Against|For|And|In|On|At|From|To|With|Without|Used|Made|Found|Taken|Carried|Recovered|Hidden|Sealed|Returned|Lost|Was|Worked|Served|Spent|Learned|Left|Raised|Bought|Built|Delivered|Grew|Returned|Inherited|Survived|Escape|Free|Find|Recover|Rescue|Clear|Escort|Deliver|Protect|Steal|Map|Track|Hold|People|Citizens|Cult|A vampire|Zombies)$/i;
const PLACE_END=/\b(?:inn|tavern|chapel|temple|crypt|mausoleum|abbey|tower|spire|keep|castle|manor|hall|house|hospice|well|cistern|reservoir|lodge|archive|library|mine|quarry|cave|caves|barrow|shrine|bridge|ford|mill|granary|warehouse|observatory|graveyard|cemetery|ossuary|cellar|vault|prison|estate|sanctuary|gate|orchard|camp|district|quarter|market|forge|bakery|shop)\b/i;
const FACTION=/\b(?:cult|court|guild|order|brotherhood|sisterhood|congregation|society|colony|company|consortium|council|circle|choir|lodge|clan|family|gang)\b/i;
const THING=/\b(?:relic|reliquary|crystal|ledger|bell|clapper|sword|key|amulet|ring|flask|shroud|scroll|book|token|seal|mask|coin|chalice|crown|staff|wand|mirror|lantern|rod|cloak|boots|gauntlet|skull|compass|dagger|tome|heirloom)\b/i;
const EVENT=/\b(?:tithe|plague|outbreak|wedding|vigil|procession|siege|war|festival|ritual|murder|disappearance|funeral|initiation|rite)\b/i;
const PERSON=/\b(?:lord|lady|count|countess|steward|priest|priestess|ruler|necromancer|vampire|illithid|hunter|keeper|gravedigger|magistrate|captain|courier|surgeon|notary|patron|heir|saint|king|queen|master)\b/i;
const typeOf = (name, fallback='place') => FACTION.test(name)?'faction':EVENT.test(name)?'event':PLACE_END.test(name)?'place':THING.test(name)?'thing':PERSON.test(name)?'person':fallback;

// Extract legacy prose references. New/ambiguous names can also be supplied explicitly in m.refs.
export function proseReferences(text) {
 const out=[],add=(name,kind,named=true)=>{name=name.trim().replace(/[.,:;!?]+$/,'');if(named&&name===name.toLowerCase())name=name.replace(/\b[a-z]/g,c=>c.toUpperCase());if(name.length<3||name.length>100||SKIP.test(name))return;if(!out.some(x=>canonicalName(x.name)===canonicalName(name)))out.push({name,kind:kind||typeOf(name),named});};
 for(const m of text.matchAll(/["\u201c]([^"\u201d\n]{3,100})["\u201d]/g))if(m[1].split(/\s+/).length<=7&&!/[.!?]/.test(m[1]))add(m[1]);
 for(const m of text.matchAll(/\b(?:the\s+)?(?:Copper|Silver|Golden|Gold|Black|White|Red|Green|Blue|Pale|Hollow|Silent|Drowned|Crimson|Ashen|Grey|Old|Broken|Velvet|Iron|Blood|Last|Ninth|Seven|Quiet|Weeping|Hungry|Lost|Empty|Stolen|Veiled)(?:\s+(?:of|the|and|[A-Z][a-z]+)){1,4}\b/g)) {
  if(m[0].split(/\s+/).length<=5&&!/\b(?:and|of|the)$/.test(m[0]))add(m[0]);
 }
 for(const m of text.matchAll(/\b[A-Z][a-z]+(?:['\u2019]s)?(?:\s+(?:of the|of|the|[A-Z][a-z]+)){1,4}\b/g)) {
  const words=m[0].replace(/^The /,'').split(/\s+/);if(words.some(w=>SKIP.test(w))&&!/\bof\b/.test(m[0]))continue;add(m[0]);
 }
 // Concrete definite referents, scoped to this locality rather than globally merging every crypt.
 for(const m of text.matchAll(/\bthe\s+((?:(?:old|local|town|village|city|abandoned|sealed|plague|winter|blood|burial|occult|vampire['\u2019]s|illithid|noble|royal|sunken|drowned|forgotten|hidden|stolen|necromantic|command|funeral|public|municipal|charitable|healing|missing|dead|undead)\s+){0,3}(?:tithe|outbreak|wedding|ritual|funeral|cult|court|colony|guild|society|lodge|relic|reliquary|ledger|crystal|bell|clapper|shroud|chapel|crypt|temple|manor|estate|hospice|well|cistern|reservoir|cellar|archive|tower|keep|mill|granary|graveyard|prison|ruler|steward|priest|gravedigger|necromancer|vampire|illithid|patron|heir|captain))\b/gi))add('The '+m[1],typeOf(m[1]),false);
 for(const m of text.matchAll(/\b(?:in|at|from|to|near|outside|beneath|beyond|into)\s+([A-Z][a-z]{2,}(?:[A-Z][a-z]+)*)\b/g))if(!SKIP.test(m[1]))add(m[1],'place');
 // Indefinite concrete people/items still need an identity and a location.
 for(const m of text.matchAll(/\b(?:a|an)\s+((?:(?:stolen|sealed|broken|old|silver|silvered|blood|burial|occult|vampire|illithid|missing|dead|undead|command|necromantic|plague)\s+){0,3}(?:reliquary|relic|ledger|crystal|bell|clapper|shroud|key|sword|amulet|coffin|vampire|illithid|necromancer|priest|steward|cult|hospice|crypt|chapel|manor|tower))\b/gi))add(m[1],typeOf(m[1],THING.test(m[1])?'thing':'person'),false);
 for(const m of text.matchAll(/\bthe\s+(?:copper|silver|golden|black|white|red|pale|hollow|silent|drowned|crimson)\s+(?:dragon|stag|lantern|crown|choir|hand|court|saint|king|queen|bell|tower|chapel|crypt)\b/gi))add(m[0]);
 return out;
}
const h=(tag,attrs={},...kids)=>{const e=document.createElement(tag);for(const[k,v]of Object.entries(attrs)){if(k.startsWith('on'))e.addEventListener(k.slice(2),v);else if(v!=null)e.setAttribute(k,v);}for(const c of kids.flat())if(c!=null)e.append(c);return e;};
const STATE=['entities','worldRolls','settlements','buildings','people','factions'];

export class WorldCanon {
 constructor(app){this.app=app;this.cardCache=new Map();this.ensure();this.el=h('div',{id:'worldBook',class:'panel',hidden:''});this.el.addEventListener('pointerdown',e=>e.stopPropagation());this.el.addEventListener('wheel',e=>e.stopPropagation(),{passive:true});document.body.append(this.el);}
 ensure(){const d=this.app.world.data;d.entities||=[];d.worldRolls||={};d.buildings||={};d.people||={};return d;}
 reset(){this.ensure();this.cardCache.clear();this.el.hidden=true;this.selected=null;if(this.app.rolls){this.app.rolls.result=null;this.app.rolls.history=[];}}
 get entities(){return this.ensure().entities;}
 get(id){return this.entities.find(e=>e.id===id);}
 named(name){const key=canonicalName(name);return this.entities.find(e=>e.scope==null&&[e.name,...e.aliases||[]].some(n=>canonicalName(n)===key));}
 nearest(at){return this.app.world.data.settlements.filter(s=>['city','town','village','hamlet','crossing','farm'].includes(s.kind)).sort((a,b)=>Math.hypot(a.x-at.x,a.z-at.z)-Math.hypot(b.x-at.x,b.z-at.z))[0];}
 snapshot(){const d=this.ensure();return Object.fromEntries(STATE.map(k=>[k,clone(d[k]||{})]));}
 apply(s){const d=this.ensure(),before=clone(d.settlements);for(const k of STATE)d[k]=clone(s[k]);this.changed(before);}
 changed(before){const a=this.app;this.cardCache.clear();a.buildings?.cache.clear();a.buildings?.scache?.clear();a.buildings?.mcache?.clear();a.buildings?.icache?.clear();if(JSON.stringify(before)!==JSON.stringify(a.world.data.settlements))a.tools.pinsChanged('settlements',before,a.world.data.settlements);else{a.save();a.request();}if(!this.el.hidden)this.show(this.selected);}
 id(kind,name,scope){return 'entity_'+hash(kind+'|'+canonicalName(name)+'|'+(scope||''));}
 add(name,kind,at,extra={}){
  name=String(name||'').trim();if(!name)return null;
  const bySource=extra.source?this.source(extra.source.key,extra.source.id):null;
  const existing=bySource||(extra.scope?this.entities.find(e=>e.scope===extra.scope&&canonicalName(e.name)===canonicalName(name)):this.named(name));
  if(existing){if(bySource&&existing.name!==name){if(!existing.aliases.includes(existing.name))existing.aliases.push(existing.name);existing.name=name;}if(extra.source&&!existing.source)existing.source=extra.source;return existing;}
  if(kind==='person'&&!extra.profile){const seed=parseInt(hash(name),36),p=makeNPC(seed);extra={...extra,profile:{...p,name,first:name.split(' ')[0],last:name.split(' ').slice(1).join(' ')||null}};}
  const e={id:this.id(kind,name,extra.scope),name,kind,x:at.x,z:at.z,known:false,aliases:[],links:[],mentions:[],notes:'',...extra};this.entities.push(e);return e;
 }
 source(key,id){return this.entities.find(e=>e.source?.key===key&&e.source.id===id);}
 catalog(){
  const d=this.ensure();
  for(const s of d.settlements){
   const parent=this.add(s.name,'place',s,{source:{key:'settlements',id:s.id}});
   for(const b of s.lore?.buildings||[])this.add(b.name,'place',s,{homeId:parent.id,buildingKind:b.kind,description:b.label||b.kind,sourceHint:true});
   for(const p of [s.lore?.ruler,...s.lore?.npcs||[]].filter(Boolean))this.add(p.name,'person',s,{homeId:parent.id,profile:clone(p)});
   for(const f of [s.lore?.faction,s.lore?.hidden,s.lore?.conspiracy].filter(Boolean))this.add(f.name,'faction',s,{homeId:parent.id,description:f.secret||f.what||f.type});
  }
  for(const m of d.underground?.maps||[])this.add(m.name,'place',{x:0,z:0},{source:{key:'underground',id:m.id},space:m.id});
  for(const f of d.factions||[])this.add(f.name,'faction',this.nearest(this.app.controls.target)||this.app.controls.target,{source:{key:'factions',id:f.id}});
  for(const [key,b]of Object.entries(d.buildings))if(b.name){const f=this.app.buildings.find(key);if(f)this.add(b.name,'place',f.h,{source:{key:'building',id:key},buildingKind:b.kind});}
  for(const t of d.tokens)if(t.name){const x=t.sx*1.5-20480+.75,z=t.sz*1.5-20480+.75;this.add(t.name,'person',{x,z},{source:{key:'tokens',id:t.id}});}
 }
 land(at,r=45,key=''){
  const w=this.app.world,off=parseInt(hash(key),36)%628/100;
  for(let i=0;i<600;i++){const radius=100+Math.sqrt(i)*100,a=off+i*2.399963,x=Math.max(-20200,Math.min(20200,at.x+Math.cos(a)*radius)),z=Math.max(-20200,Math.min(20200,at.z+Math.sin(a)*radius));if(w.height(x,z)>2&&!w.data.settlements.some(s=>Math.hypot(s.x-x,s.z-z)<s.r+r+70)&&!this.app.ddImports?.covers(x,z))return{x,z};}
  throw Error('No clear land nearby for '+key);
 }
 // Give a location a real, stable house plot, reusing its existing named plot first.
 house(e,kind='home',profile=null){
  if(e.source&&!e.sourceHint&&!(e.source.key==='settlements'&&e.buildingKind))return;
  const a=this.app,d=this.ensure(),s=this.nearest(e);if(!s)return;
  const specials=a.buildings.specials(s),houses=a.buildings.housesOf(s);
  let chosen=houses.find(h=>{const key=a.buildings.keyOf(s,h);return canonicalName(d.buildings[key]?.name||specials.get(key)?.name)===canonicalName(e.name);});
  if(!chosen)chosen=houses.find(h=>{const key=a.buildings.keyOf(s,h);return!specials.has(key)&&!d.buildings[key]&&!this.entities.some(q=>q.source?.key==='building'&&q.source.id===key);});
  if(!chosen)return;
  const key=a.buildings.keyOf(s,chosen);e.source={key:'building',id:key};delete e.sourceHint;e.x=chosen.x;e.z=chosen.z;
  const fields={special:true,kind,name:e.name,marked:true,seed:profile?.seed||parseInt(hash(e.id),36)};
  d.buildings[key]={...d.buildings[key],...fields,...(profile?.people?{rolled:clone(profile)}:{})};
  if(profile?.people)profile.people.forEach((p,i)=>{d.people[key+'/'+i]={...clone(p),id:key+'/'+i};});
 }
 place(e,kind){
  if(e.source?.key==='settlements'||e.source?.key==='building')return;
  if(!kind)this.house(e,e.buildingKind||(/dragon|inn|tavern/i.test(e.name)?'inn':'home'));
  if(e.source)return;
  const a=this.app,at=this.land(e,45,e.id),k=kind||(/crypt|ruin|barrow|grave|cemetery|ossuary/i.test(e.name)?'ruin':/shrine|temple|chapel/i.test(e.name)?'shrine':/tower|spire/i.test(e.name)?'tower':/cave|prison|chamber/i.test(e.name)?'cave':'hamlet');
  const s=rollPlace(a.world,at.x,at.z,k,parseInt(hash(e.id),36));s.id='canon_'+e.id;s.name=e.name;s.known=false;
  if(k==='hamlet'){s.r=40;s.lore.pop=24;s.lore.fields=0;s.lore.structures=5;s.lore.buildings=[{kind:e.buildingKind||'inn',name:e.name,label:'Inn'}];}
  a.world.data.settlements.push(s);e.source={key:'settlements',id:s.id};e.x=s.x;e.z=s.z;
 }
 anchor(e,home){if(home&&e.id!==home.id&&!e.homeId){e.homeId=home.id;if(!e.source){e.x=home.x;e.z=home.z;}}return e;}
 mention(e,rollId,path,text){const key=rollId+':'+path;if(!e.mentions.some(m=>m.key===key))e.mentions.push({key,rollId,path,text:String(text).slice(0,1200)});}
 ground(model,at=this.app.controls.target,{key=null,source=null,undo=true}={}){
  if(this.app.role!=='gm')return model;
  const d=this.ensure(),rollId=key||'roll_'+hash(JSON.stringify([model.roller,model.seed,model.opts||{}]));
  if(d.worldRolls[rollId])return clone(d.worldRolls[rollId].model);
  const before=this.snapshot();
  try{
   this.catalog();const town=this.nearest(at),local=town?this.source('settlements',town.id):null,refs=new Set(),roots=[];
   const register=(name,kind,extra={})=>{const e=this.add(name,kind,at,extra);if(e){refs.add(e.id);return e;}};
   let root;
   if(model.place){const S=model.place;root=register(S.name,'place');if(!root.source){const pos=this.land(at,S.r||90,root.id);const s={...clone(S),...pos,id:'canon_'+root.id,known:false};d.settlements.push(s);root.x=s.x;root.z=s.z;root.source={key:'settlements',id:s.id};}const actual=d.settlements.find(s=>s.id===root.source?.id);if(actual)model.place=clone(actual);roots.push(root);}
   if(model.building){const b=model.building;root=register(b.name,'place',{buildingKind:b.kind,profile:clone(b)});this.house(root,b.kind,b);this.anchor(root,local);roots.push(root);}
   if(model.roller==='site'){root=register(model.title,'place',{description:model.sub,profile:{sections:clone(model.sections)}});this.anchor(root,local);this.place(root,({barrow:'ruin',crypt:'ruin',sunken:'shrine',portal:'shrine',battlefield:'ruin',tower:'tower',mine:'mine',grove:'shrine',wreck:'ruin',cave:'cave',ruin:'ruin',shrine:'shrine',camp:'camp'})[model.opts?.kind]||'ruin');roots.push(root);}
   if(model.roller==='shop'){root=register(model.title,'place',{buildingKind:model.shopKind||model.opts?.kind||'shop'});this.anchor(root,local);this.house(root,root.buildingKind,{seed:model.seed,people:model.person?[model.person]:[]});if(!root.source){this.place(root);this.house(root,root.buildingKind,{seed:model.seed,people:model.person?[model.person]:[]});}roots.push(root);}
   if(model.person){const p=model.person;const person=register(p.name,'person',{profile:clone(p)});this.anchor(person,root||local);if(root?.kind==='place'){root.ownerId=person.id;person.homeId=root.id;person.x=root.x;person.z=root.z;}else root=person;roots.push(person);}
   if(model.relic){root=register(model.relic.name,'thing',{profile:clone(model.relic)});this.anchor(root,local);roots.push(root);}
   if(!root){root=register(model.title,model.roller==='loot'?'thing':'event',{scope:rollId,description:model.sub});this.anchor(root,local);roots.push(root);}
   if(source){root.source=source;root.x=at.x;root.z=at.z;}
   const home=model.place?root:local;
   // Structured profiles identify people/buildings even when their names are one word.
   const visited=new WeakSet();
   const structured=(v,parent=home)=>{
    if(!v||typeof v!=='object'||visited.has(v))return;visited.add(v);
    if(Array.isArray(v)){v.forEach(x=>structured(x,parent));return;}
    if(v.name&&v!==model){let kind=v.race||v.first||v.role?'person':v.what&&v.type?'faction':v.people||v.owner||v.label?'place':null;if(kind){const e=register(v.name,kind,{profile:clone(v),...(kind==='place'?{buildingKind:v.kind}:{})});this.anchor(e,parent);if(kind==='place'){this.house(e,v.kind||'home',v);parent=e;}if(kind==='person'&&parent)e.homeId=parent.id;if(kind==='place'&&v.owner){const ownerName=String(v.owner).split(' (')[0];const owner=register(ownerName,'person',{homeId:e.id});owner.x=e.x;owner.z=e.z;e.ownerId=owner.id;}}}
    for(const [k,x]of Object.entries(v))if(!['settlement','house','building','profile','owner','source','worldRefs','references'].includes(k))structured(x,parent);
   };
   for(const f of [model.place?.lore?.faction,model.place?.lore?.hidden,model.place?.lore?.conspiracy].filter(Boolean)){const e=register(f.name,'faction',{homeId:home?.id,description:f.secret||f.what||f.type});if(!d.factions.some(q=>q.id===f.id))d.factions.push({id:f.id,type:f.type,name:f.name});}
   structured(model.place?.lore||{},home);structured(model.building||{},home);structured(model.sections,home);
   // Explicit refs are the preferred contract for future authored tables.
   for(const r of model.refs||[]){const e=register(r.name,TYPES.includes(r.kind)?r.kind:typeOf(r.name),r);if(e){this.anchor(e,home);if(e.kind==='place')this.place(e);else if(e.kind==='thing'&&root.kind==='person'&&!e.ownerId)e.ownerId=root.id;}}
   if(model.loot){root.profile=clone(model.loot);root.inventory=[];for(const label of [...model.loot.items||[],...model.loot.valuables||[]]){const item=this.add(label,'thing',root,{scope:root.id,ownerId:root.id,homeId:home?.id});refs.add(item.id);root.inventory.push(item.id);}}
   const textFields=[];
   const walk=(v,path='result')=>{
    if(typeof v==='string'){if(v.trim())textFields.push([path,v]);return;}
    if(!v||typeof v!=='object')return;
    if(Array.isArray(v)){v.forEach((x,i)=>walk(x,path+'.'+i));return;}
    for(const[k,x]of Object.entries(v))if(!['id','seed','opts','roller','kind','race','role','stats','source','worldRefs','references','profile','house','settlement','at','stock','find','look','name','first','last','gender','age','armour','weapon','hair','clothing','label','t','sub','key'].includes(k))walk(x,path+'.'+k);
   };
   walk({title:model.title,sections:model.sections,person:model.person,building:model.building,relic:model.relic,place:model.place?.lore});
   const known=[...this.entities];
   for(const[path,text]of textFields){
    // Longest known names first; boundaries stop Ann matching Anne or a name inside a word.
    const matched=[];
    for(const e of known){if(e.scope)continue;const re=new RegExp('(?<![\\p{L}\\p{N}])(?:'+[e.name,...e.aliases||[]].map(esc).join('|')+')(?![\\p{L}\\p{N}])','iu');if(re.test(text)){if(e.kind==='place'&&!e.source)this.place(e);refs.add(e.id);this.mention(e,rollId,path,text);matched.push(e.name);}}
    let remainder=text;for(const name of matched.sort((a,b)=>b.length-a.length))remainder=remainder.replace(new RegExp(esc(name),'gi'),' '.repeat(name.length));
    for(const r of proseReferences(remainder)){
     const e=register(r.name,r.kind,r.named?{}:{scope:home?.id||rollId});if(!e)continue;this.anchor(e,home);this.mention(e,rollId,path,text);
     if(e.kind==='place')this.place(e);else if(e.kind==='thing'&&root.kind==='person'&&!e.ownerId)e.ownerId=root.id;
    }
   }
   for(const e of roots){const suffix=e.name.match(/\bof (?:the )?([A-Z][A-Za-z]*(?: [A-Z][A-Za-z]*){0,3})$/);if(suffix){const ref=register(suffix[1],typeOf(suffix[1]));this.anchor(ref,home);this.mention(ref,rollId,'namesake',e.name);}}
   for(const e of roots)this.mention(e,rollId,'root',model.title);
   // Connect each result to its mentioned entities. Mentions record claims, not proven facts.
   root.links=[...new Set([...root.links,...refs])].filter(id=>id!==root.id);
   for(const id of refs){const e=this.get(id);if(e&&e.id!==root.id&&!e.links.includes(root.id))e.links.push(root.id);}
   model.worldRefs=[...refs];model.worldEntity=root.id;model.worldRollId=rollId;
   d.worldRolls[rollId]={id:rollId,title:model.title,entityId:root.id,model:clone(model)};
   const after=this.snapshot();this.changed(before.settlements);
   if(undo)this.app.tools.push({undo:()=>this.apply(before),redo:()=>this.apply(after)});
   return model;
  }catch(error){for(const k of STATE)d[k]=before[k];this.cardCache.clear();throw error;}
 }
 groundCard(key,p){
  if(!p||this.app.role!=='gm'||key==='entities')return[];
  const data=key==='settlements'?{place:{name:p.name,lore:p.lore,kind:p.kind,r:p.r,seed:p.seed}}:key==='building'?{building:{name:p.name,kind:p.kind,seed:p.seed,people:p.people,inside:p.inside,hook:p.hook}}:key==='person'?{person:Object.fromEntries(Object.entries(p).filter(([k])=>k!=='building'))}:null;
  if(!data)return[];
  const sig=key+':'+p.id+':'+hash(JSON.stringify(data));if(this.cardCache.has(sig))return this.cardCache.get(sig);
  // Source settlement/building already exists: never create a preview copy.
  const e=this.add(p.name,key==='person'?'person':'place',p,{source:{key,id:p.id}});e.source={key,id:p.id};
  const m=this.ground({roller:'card',seed:p.seed||0,opts:{},title:p.name,sections:[],...data},p,{key:sig,source:{key,id:p.id},undo:false});this.cardCache.set(sig,m.worldRefs);return m.worldRefs;
 }
 links(ids=[]){return h('div',{class:'world-links'},ids.map(id=>this.get(id)).filter(Boolean).map(e=>h('button',{class:'chip world-ref',onclick:()=>this.show(e.id)},e.name)));}
 text(text,ids=[]){
  const span=h('span'),entities=ids.map(id=>this.get(id)).filter(Boolean).sort((a,b)=>b.name.length-a.name.length);
  if(!entities.length){span.textContent=text;return span;}
  const re=new RegExp('(?<![\\p{L}\\p{N}])('+entities.flatMap(e=>[e.name,...e.aliases||[]]).sort((a,b)=>b.length-a.length).map(esc).join('|')+')(?![\\p{L}\\p{N}])','giu');let pos=0;
  for(const m of String(text).matchAll(re)){span.append(String(text).slice(pos,m.index));const e=entities.find(e=>[e.name,...e.aliases||[]].some(n=>canonicalName(n)===canonicalName(m[0])));span.append(h('button',{class:'world-inline',onclick:()=>this.show(e.id)},m[0]));pos=m.index+m[0].length;}
  span.append(String(text).slice(pos));return span;
 }
 go(e){const src=e.source,a=this.app,space=src?.key==='tokens'?(a.world.data.tokens.find(t=>t.id===src.id)?.space||null):(e.space||null);if(space!==(a.underground?.currentSpace||null)){if(space)a.underground.enter(space);else a.underground?.leave();}const current=src?.key==='tokens'?(()=>{const t=a.world.data.tokens.find(t=>t.id===src.id);return t?{x:t.sx*1.5-20480+.75,z:t.sz*1.5-20480+.75}:null;})():src?.key==='settlements'?a.world.data.settlements.find(s=>s.id===src.id):src?.key==='building'?a.buildings.find(src.id)?.h:null;const at=current||e;a.flyTo(at.x,at.z,e.kind==='place'?120:65,.8);this.el.hidden=true;}
 openSource(e){const s=e.source;if(s?.key==='building'||s?.key==='person'||this.app.world.data[s?.key]?.some?.(q=>q.id===s.id)){this.go(e);this.el.hidden=true;this.app.card.open(s.key,s.id);}else this.go(e);}
 show(id=null){
  if(this.app.role!=='gm')return;this.selected=id;this.el.hidden=false;
  const e=id?this.get(id):null;
  const header=h('div',{class:'chead'},h('div',{class:'ctitle'},e?.name||'World ledger'),e?h('button',{class:'chip',onclick:()=>this.show()},'All entries'):null,h('button',{class:'cx',onclick:()=>{this.el.hidden=true;}},'Close'));
  const body=h('div',{class:'cbody'});
  if(e){const home=this.get(e.homeId),owner=this.get(e.ownerId);body.append(h('div',{class:'csub'},e.kind),h('div',{class:'crowbtn'},h('button',{class:'chip',onclick:()=>this.go(e)},'Go'),e.source?h('button',{class:'chip',onclick:()=>this.openSource(e)},'Open source'):null),h('p',{},e.description||e.profile?.backstory||'An established campaign entity. The accounts below may be rumours.'));
   if(e.kind==='person'&&e.profile)body.append(h('div',{class:'csec'},h('div',{},[e.profile.race,e.profile.role,e.profile.demeanour].filter(Boolean).join(' / ')),h('div',{},e.profile.backstory||'')));
   if(e.kind==='thing'&&e.profile?.power)body.append(h('div',{class:'csec'},e.profile.power));
   if(e.inventory?.length)body.append(h('div',{},'Contents',this.links(e.inventory)));
   if(home)body.append(h('div',{},'Located at ',this.links([home.id])));if(owner)body.append(h('div',{},'Owned by ',this.links([owner.id])));
   body.append(h('label',{},'Notes',h('textarea',{rows:4,onchange:ev=>{e.notes=ev.target.value;this.app.save();}},e.notes||'')));
   if(e.links.length)body.append(h('div',{class:'csh'},'Related'),this.links(e.links));
   body.append(h('div',{class:'csh'},'Mentioned in'),...e.mentions.map(m=>h('div',{class:'csec'},h('div',{},this.app.world.data.worldRolls[m.rollId]?.title||m.rollId),h('div',{class:'dim'},m.text),this.app.world.data.worldRolls[m.rollId]?.model.roller!=='card'?h('button',{class:'chip',onclick:()=>{const result=this.app.world.data.worldRolls[m.rollId]?.model;if(!result)return;this.el.hidden=true;this.app.rolls.cur=result.roller;this.app.rolls.result=clone(result);this.app.rolls.show();}},'Open roll'):null)));
  }else{
   const search=h('input',{type:'search',placeholder:'Find a person, place, thing, event, or faction','aria-label':'Search world ledger'}),list=h('div',{class:'world-entry-list'});let kind='';const filter=h('select',{'aria-label':'Entity type',onchange:ev=>{kind=ev.target.value;render();}},h('option',{value:''},'All types'),TYPES.map(t=>h('option',{value:t},t)));
   const render=()=>{const q=canonicalName(search.value);list.replaceChildren(...this.entities.filter(e=>(!kind||e.kind===kind)&&(!q||canonicalName(e.name).includes(q))).sort((a,b)=>a.name.localeCompare(b.name)).map(e=>h('button',{class:'world-entry',onclick:()=>this.show(e.id)},e.name,h('span',{class:'dim'},e.kind))));};search.oninput=render;body.append(search,filter,list);render();
  }
  this.el.replaceChildren(header,body);
 }
}
