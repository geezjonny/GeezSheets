import { inventoryItem } from './actions.mjs';
const norm=s=>String(s).trim().toLowerCase().replace(/\s+/g,' ');
export const conditions=['blinded','charmed','deafened','exhaustion','frightened','grappled','incapacitated','invisible','paralyzed','petrified','poisoned','prone','restrained','stunned','unconscious'];
// Exact match first, then a unique prefix (including a multi-word first name).
export function shorthandEntity(g,q,c,kinds,optional=false){
 const all=Object.values(g.worlds.gaia.entities).filter(e=>(!e.campaign||e.campaign===c)&&(!kinds||kinds.includes(e.kind))),n=norm(q);
 let found=all.filter(e=>e.id===q||norm(e.name)===n);if(!found.length)found=all.filter(e=>norm(e.name).startsWith(n));
 if(found.length===1)return found[0];if(!found.length&&optional)return null;
 throw Error(found.length?`Which ${q}: ${found.map(e=>`${e.name} (${e.id})`).join(', ')}?`:`Who or what is "${q}"?`);
}
export function parseShorthand(line,g,campaign){
 try{
  if(typeof line!=='string'||!line.trim())throw Error('What should change?');if(!Object.hasOwn(g.campaigns,campaign))throw Error('Which campaign?');
  const out=[];let last;
  const emit=(name,args={})=>out.push({name,args:{...args,campaign}});
  const entity=(q,kinds=['pc','npc','creature'])=>/^(party|everyone)$/i.test(q)?'party':shorthandEntity(g,q,campaign,kinds).id;
  const inv=(id,q)=>{const e=g.worlds.gaia.entities[id];if(!e||e.kind!=='pc')throw Error('Which PC inventory?');return inventoryItem(e,q);};
  const item=(q,id,create=false)=>{q=q.trim().replace(/^an?\s+/i,'');try{return inv(id,q)[1].name;}catch(error){if(!create||!error.message.startsWith('Unknown item'))throw error;return q;}};
  const chunks=line.trim().split(/[;\n]+/).flatMap(part=>{
   // Damage and initiative headers consume comma-separated numeric entries only.
   const bits=part.split(/\s*,\s*/),groups=[];for(const bit of bits){if(groups.length&&/^[^:]+\s+-?\d+$/.test(bit)&&(/^[^:]+:/.test(groups.at(-1))||/^(?:inits?|initiative|roll order)\s+/i.test(groups.at(-1))))groups[groups.length-1]+=', '+bit;else groups.push(bit);}return groups;
  });
  for(let text of chunks){text=text.trim();if(!text)continue;let m;
   if((m=text.match(/^init add (.+)\s+(-?\d+)$/i))){const e=shorthandEntity(g,m[1],campaign,['pc','npc','creature'],true);emit('initiative.add',{name:e?.id??m[1],init:+m[2]});continue;}
   if((m=text.match(/^init remove (.+)$/i))){emit('initiative.remove',{id:m[1]});continue;}
   if((m=text.match(/^(?:inits?|initiative|roll order)(?:\s*:\s*|\s+)(.*)$/i))){const list=m[1].split(',').map(v=>{const x=v.trim().match(/^(.+?)\s+(-?\d+)$/);if(!x)throw Error('Supply a name and initiative for each combatant');const e=shorthandEntity(g,x[1],campaign,['pc','npc','creature'],true);return {name:e?.id??x[1],init:+x[2]};});emit('initiative.set',{list});continue;}
   if(/^(next|prev)$/i.test(text)){emit('initiative.'+text.toLowerCase());continue;}
   if(/^end combat$/i.test(text)){emit('combat.end');continue;}
   if((m=text.match(/^[^:]+:\s*(.+\s+\d+(?:,.*)?)$/))&&!/^(?:note|inits?|initiative|roll order)\s*:/i.test(text)){for(const v of m[1].split(',')){const x=v.trim().match(/^(.+?)\s+(\d+)$/);if(!x)throw Error('Supply damage for each target');emit('hp.damage',{entity:entity(x[1]),amount:+x[2]});}continue;}
   if((m=text.match(/^new npc (.+?) at (.+)$/i))){emit('npc.create',{name:m[1],at:entity(m[2],['place'])});continue;}
   if((m=text.match(/^reveal (.+)$/i))){emit('reveal',{entity:entity(m[1],null)});continue;}
   if((m=text.match(/^party to (.+)$/i))){emit('party.move',{to:entity(m[1],['place'])});continue;}
   if((m=text.match(/^weather (clear|cloudy|rain|storm|fog|snow|ash|heavy rain|drizzle|thunderstorm|foggy|mist|snowing|sunny|overcast)$/i))){const word=m[1].toLowerCase(),weather=({'heavy rain':'rain',drizzle:'rain',thunderstorm:'storm',foggy:'fog',mist:'fog',snowing:'snow',sunny:'clear',overcast:'cloudy'})[word]??word;emit('weather.set',{weather,...(weather!==word?{wind:m[1]}:{})});continue;}
   if(/^(dawn|day|dusk|night)$/i.test(text)){emit('time.set',{time_of_day:text.toLowerCase()});continue;}
   if((m=text.match(/^note:\s*(.+)$/i))){emit('log.add',{text:m[1]});continue;}
   if((m=text.match(/^(long|short) rest (.+)$/i))){emit('rest.'+m[1].toLowerCase(),{entity:entity(m[2])});continue;}
   if((m=text.match(/^heal (.+) (\d+)$/i))){emit('hp.heal',{entity:entity(m[1]),amount:+m[2]});continue;}
   if((m=text.match(/^clear (.+)$/i))){const id=entity(m[1]),ids=id==='party'?Object.keys(g.campaigns[campaign].party).filter(k=>g.campaigns[campaign].party[k]):[id];for(const id of ids){const e=g.worlds.gaia.entities[id],s=e.kind==='pc'?e.data:e.data.statblock;const pending=out.filter(a=>a.name==='condition.add'&&(a.args.entity===id||a.args.entity==='party'&&g.campaigns[campaign].party?.[id])).map(a=>a.args.condition);for(const condition of new Set([...(s?.combat?.conditions??[]),...pending]))emit('condition.remove',{entity:id,condition});emit('concentration.clear',{entity:id});}continue;}
   if((m=text.match(/^give (.+?) (.+?)[\u2019']s (.+)$/i))){const from=entity(m[2]),to=entity(m[1]);emit('item.move',{from,to,item:item(m[3],from),qty:1});continue;}
   if((m=text.match(/^give (.+?) (\d+) (.+?) from (.+)$/i))){const from=entity(m[4]),to=entity(m[1]);emit('item.move',{from,to,item:item(m[3],from),qty:+m[2]});continue;}
   // Every remaining statement begins with a character name. Choose the longest
   // resolvable boundary, never a best-scoring candidate.
   let id,tail;
   if(last&&(conditions.includes(norm(text))||/^(not |-|concentrating )/i.test(text))){id=last;tail=text;}
   else {const words=text.split(/\s+/);for(let i=words.length-1;i>0;i--){const q=words.slice(0,i).join(' '),t=words.slice(i).join(' ');if(!/^(?:[-+]|takes |hp |temp |max |slot |used |not |concentrating |gets |drinks |equips |unequips |dons |save |stable$)/i.test(t)&&!conditions.includes(norm(t))&&!/ [-+]\d+$/.test(t))continue;const e=/^(party|everyone)$/i.test(q)?{id:'party'}:shorthandEntity(g,q,campaign,['pc','npc','creature'],true);if(!e)continue;id=e.id;tail=t;break;}}
   if(!id)throw Error(`How should I read "${text}"?`);last=id;
   const a={entity:id};
   if((m=tail.match(/^([+-])\s*(\d+)\s+(cp|sp|ep|gp|pp|xp)(?:\s+(each|split))?$/i))){const type=m[3].toLowerCase();if(type==='xp'&&m[1]==='-')throw Error('XP awards must be positive');emit(type==='xp'?'xp.add':m[1]==='+'?'coin.add':'coin.spend',{...a,amount:+m[2],...(type==='xp'?{}:{coin:type}),...(m[4]?.toLowerCase()==='split'?{split:true}:{})});continue;}
   if((m=tail.match(/^\+\s*(\d+) temp$/i))){emit('hp.temp',{...a,amount:+m[1]});continue;}
   if((m=tail.match(/^([+-])(\d+)$/))){emit(m[1]==='-'?'hp.damage':'hp.heal',{...a,amount:+m[2]});continue;}
   if((m=tail.match(/^takes (\d+)(?: damage)?$/i))){emit('hp.damage',{...a,amount:+m[1]});continue;}
   if((m=tail.match(/^(hp|temp|max) (\d+)$/i))){emit('hp.'+({hp:'set',temp:'temp',max:'max'})[m[1].toLowerCase()],{...a,amount:+m[2]});continue;}
   if((m=tail.match(/^slot ([1-9])(?: ([+-])(\d+))?$/i))){emit(m[2]==='+'?'slot.restore':'slot.spend',{...a,level:+m[1],amount:m[3]?+m[3]:1});continue;}
   if((m=tail.match(/^(?:not |\-)(.+)$/i))&&conditions.includes(norm(m[1]))){emit('condition.remove',{...a,condition:norm(m[1])});continue;}
   if(conditions.includes(norm(tail))){emit('condition.add',{...a,condition:norm(tail)});continue;}
   if((m=tail.match(/^concentrating (.+)$/i))){emit('concentration.set',{...a,spell:m[1]});continue;}
   if(/^(?:not concentrating|concentration clear)$/i.test(tail)){emit('concentration.clear',a);continue;}
   if((m=tail.match(/^save (pass|fail)$/i))){emit('deathsave.'+m[1].toLowerCase(),a);continue;}
   if(/^stable$/i.test(tail)){emit('deathsave.stable',a);continue;}
   if((m=tail.match(/^(equips|dons|unequips) (.+)$/i))){const unset=m[1].toLowerCase()==='unequips',q=m[2];let slot=/shield/i.test(q)?'shield':m[1].toLowerCase()==='dons'?'armor':'main_hand',name;
    if(unset&&['armor','shield','main_hand','off_hand'].includes(norm(q)))slot=norm(q);else {const [,v]=inv(id,q);name=v.name;if(v.category==='armor'&&slot!=='shield')slot='armor';}
    emit(unset?'equip.unset':'equip.set',{...a,slot,...(!unset?{item:name}:{})});continue;}
   if((m=tail.match(/^(?:gets\s+|\+\s*)(?:(\d+)\s+)?(.+)$/i))){emit('item.give',{...a,qty:+(m[1]??1),item:item(m[2],id,true)});continue;}
   if((m=tail.match(/^(?:-(\d+)\s+|drinks\s+(?:an?\s+)?)(.+)$/i))){emit('item.take',{...a,qty:+(m[1]??1),item:item(m[2],id)});continue;}
   if((m=tail.match(/^(?:used (.+)|(.+) ([+-])(\d+))$/i))){const q=m[1]??m[2],e=g.worlds.gaia.entities[id],found=Object.entries((e.kind==='pc'?e.data:e.data.statblock).abilities??{}).filter(([k,v])=>v.kind==='charge'&&(norm(k.replaceAll('_',' '))===norm(q)||norm(v.label)===norm(q)));if(found.length!==1)throw Error(`Which saved ability is "${q}"?`);emit(m[3]==='+'?'ability.restore':'ability.spend',{...a,ability:found[0][0],amount:+(m[4]??1)});continue;}
   throw Error(`How should I read "${text}"?`);
  }
  return {actions:out};
 }catch(error){return {question:error.message};}
}
