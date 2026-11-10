import { validate } from './validate.mjs';
import { newId } from './ids.mjs';
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const safe=parts=>{if(parts.some(p=>!p||['__proto__','prototype','constructor'].includes(p)))fail('Unsafe or empty path');return parts;};
export const at=(g,path)=>path.split('/').reduce((v,k)=>v&&Object.hasOwn(v,k)?v[k]:undefined,g);
function set(g,path,v){const parts=safe(path.split('/'));let o=g;for(const k of parts.slice(0,-1))o=o[k]??={};if(v===null)delete o[parts.at(-1)];else o[parts.at(-1)]=v;}
// Stage every write on a private snapshot. No persistence or events before success.
export function prepareChanges(db,changes,schema,role='gm'){
 const g=structuredClone(db),writes=[];
 const stamp=v=>{const now=new Date().toISOString();return {...v,meta:{schema:1,created_at:now,...v.meta,updated_at:now,updated_by:role}};};
 const write=(path,value,def,op)=>{safe(path.split('/'));if(value!==null){value=stamp(value);const errors=validate(schema,def,value);if(errors.length)throw Object.assign(new Error('Validation failed'),{status:400,errors});}writes.push({path,value,op,before:at(db,path)??null});set(g,path,value);};
 for(const c of changes){
  if(c.campaign&&!Object.hasOwn(g.campaigns,c.campaign))fail('Unknown campaign');
  if(c.op==='campaign'){
   write(`campaigns/${c.id}`,c.value,'campaign','put');
  }else if(c.op==='put'){
   const e=c.entity;safe([e.id]);if(at(g,`worlds/gaia/entities/${e.id}`))fail('Entity already exists',409);write(`worlds/gaia/entities/${e.id}`,e,'entity','put');
  }else if(c.op==='patch'){
   const path=`worlds/gaia/entities/${c.entity}`,e=structuredClone(at(g,path));if(!e)fail('Entity not found',404);
   for(const [p,v]of Object.entries(c.patch)){const parts=safe(p.split('.'));let o=e;for(const k of parts.slice(0,-1))o=o[k]??={};o[parts.at(-1)]=v;}
   if(e.id!==c.entity)fail('Entity id cannot change');write(path,e,'entity','patch');
  }else if(c.op==='link'){
   for(const id of [c.from,c.to])if(!at(g,`worlds/gaia/entities/${id}`))fail('Link endpoint not found');const {op,...v}=c;v.id=newId('link');write(`worlds/gaia/links/${v.id}`,v,'link','link');
  }else if(c.op==='reveal'){
   if(!at(g,`worlds/gaia/entities/${c.entity}`))fail('Entity not found');write(`campaigns/${c.campaign}/reveals/${c.entity}`,{...at(g,`campaigns/${c.campaign}/reveals/${c.entity}`),known:c.known,revealed_at:new Date().toISOString()},'reveal','reveal');
  }else if(c.op==='token'){
   if(c.value!==null){const e=at(g,`worlds/gaia/entities/${c.value.entity}`),m=at(g,`worlds/gaia/entities/${c.value.map}`);if(!['pc','npc','creature'].includes(e?.kind)||m?.kind!=='map')fail('Invalid token entity or map');if(e.kind!=='creature'&&('hp_current'in c.value||'conditions'in c.value))fail('PC/NPC stats belong on entity');}
   write(`campaigns/${c.campaign}/state/tokens/${c.id}`,c.value===null?null:{...c.value,id:c.id},'token','token');
  }else if(c.op==='log'){
   const id=newId('log');write(`campaigns/${c.campaign}/log/${id}`,{id,at:new Date().toISOString(),type:'action',text:c.text,refs:c.refs},'log','log');
  }else if(c.op==='initiative'){
   const path=`campaigns/${c.campaign}/state/initiative`;if(c.value!==null){const errors=validate(schema,'initiative',c.value);if(errors.length)throw Object.assign(new Error('Invalid initiative'),{status:400,errors});}
   writes.push({path,value:c.value,op:'initiative',before:at(db,path)??null});set(g,path,c.value);
  }else if(c.op==='env'){
   if(!['environment','party_location'].includes(c.field))fail('Unknown state field');
   if(c.field==='party_location'&&at(g,`worlds/gaia/entities/${c.value}`)?.kind!=='place')fail('Party location must be a place');
   if(c.field==='party_location'){const path=`campaigns/${c.campaign}/state/party_location`;const errors=validate(schema,'party_location',c.value);if(errors.length)fail('Invalid party location');writes.push({path,value:c.value,op:'env',before:at(db,path)??null});set(g,path,c.value);}
   else write(`campaigns/${c.campaign}/state/environment`,c.value,'environment','env');
  }else fail(`Unknown change op: ${c.op}`);
 }
 return writes;
}
