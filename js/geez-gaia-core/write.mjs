import {validate} from './validate.mjs';
import {newId} from './ids.mjs';
import {actions} from './actions.mjs';
import {prepareChanges, at} from './changes.mjs';
import {parseShorthand} from './shorthand.mjs';
import {playerWrite} from './player-writes.mjs';
// RTDB may return object keys in a different order from a local staged write.
// RTDB never stores null: a null array slot or object key comes back missing (sparse arrays, absent keys).
// So null and undefined compare equal, and only present (non-null) keys count.
export function equalJSON(a,b){
 if(a===b)return true;
 if(a==null||b==null)return a==null&&b==null;
 if(typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
 const present=o=>Object.keys(o).filter(k=>o[k]!=null),ka=present(a),kb=present(b);
 return ka.length===kb.length&&ka.every(k=>b[k]!=null&&equalJSON(a[k],b[k]));
}
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const fail = (status, message, errors) => { throw Object.assign(new Error(message), { status, errors }); };
const safe = parts => {
  if (parts.some(p => !p || ['__proto__', 'prototype', 'constructor'].includes(p))) fail(400, 'Unsafe or empty path');
  return parts;
};
function merge(a, b) {
  if (!object(a) || !object(b)) return structuredClone(b);
  const out = structuredClone(a);
  for (const [k, v] of Object.entries(b)) out[k] = object(v) && object(a[k]) ? merge(a[k], v) : structuredClone(v);
  return out;
}
function checkKeys(v) {
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { safe([k]); checkKeys(x); }
}
function set(root, parts, value) {
  let at = root;
  for (const p of parts.slice(0, -1)) {
    if (!object(at[p]) && !Array.isArray(at[p])) at[p] = {};
    at = at[p];
  }
  at[parts.at(-1)] = value;
}
const lookup = (root, parts) => parts.reduce((v, p) => v != null && Object.hasOwn(v, p) ? v[p] : undefined, root);
const allowedPC = p => /^data\.(combat\.(hp_current|temp_hp|conditions|death_saves|death_save_[^.]+)|spellcasting\.slots_used|abilities\.[^.]+\.current|inventory|coin_purse)(\.|$)/.test(p);


// Shared write boundary. Stage privately; persistence follows successful validation.
export function executeWrite(snapshot,schema,path,method,body,auth){
 const db=structuredClone(snapshot),writes=[],req={method},parts=safe(path.split('/'));
 let result,status;
 const send=(code,value)=>{status=code;result=value;};
 const commit=(path,value,op='put')=>{
  const ps=safe(path.split('/'));
  if(value===null){const parent=lookup(db,ps.slice(0,-1));if(parent)delete parent[ps.at(-1)];}
  else set(db,ps,value);
  writes.push({path,value:structuredClone(value),op});return value;
 };
  const checked = (def, value) => {
    const errors = validate(schema, def, value);
    if (errors.length) fail(400, 'Validation failed', errors);
    return value;
  };
  const stamp = (value, role) => {
    const now = new Date().toISOString();
    return { ...value, meta: { schema: 1, created_at: now, ...value.meta, updated_at: now, updated_by: role } };
  };
  const entities = db.worlds.gaia.entities;
  const existing = (path) => { const v = lookup(db, path.split('/')); if (v === undefined) fail(404, 'Record not found'); return v; };
  function patchEntity(id, patch, auth) {
    const path = `worlds/gaia/entities/${id}`;
    const old = existing(path);
    if (auth.role !== 'gm' && (old.kind !== 'pc' || !auth.pcs.includes(id))) fail(403, 'Players may patch only their own PCs');
    const out = structuredClone(old);
    for (const [p, value] of Object.entries(patch)) {
      if (auth.role !== 'gm' && !allowedPC(p)) fail(403, `Players cannot patch ${p}`);
      set(out, safe(p.split('.')), value);
    }
    if (out.id !== id) fail(400, 'Entity id cannot change');
    if (out.campaign != null && !Object.hasOwn(db.campaigns,out.campaign)) fail(400,'Unknown campaign');
    return checked('entity', stamp(out, auth.role));
  }

 function run(){
      // The HTTP adapter stages the same atomic plan list as Firebase. Recheck
      // guards before any plan, so a stale GM initiative save cannot erase a
      // player's just-edited row (even when the save also runs an action).
      if(path==='batch'&&req.method==='POST'){
        if(!object(body)||Object.keys(body).some(k=>!['plans','guards'].includes(k))||!Array.isArray(body.plans)||body.plans.length>1000||body.guards!==undefined&&!Array.isArray(body.guards))fail(400,'Expected {plans, guards?}');
        checkKeys(body);
        for(const guard of body.guards||[]){
          if(!object(guard)||typeof guard.path!=='string')fail(400,'Invalid guard');
          const ps=safe(guard.path.split('/'));
          if(!equalJSON(lookup(db,ps)??null,guard.value))fail(409,'Gaia value changed; retry transaction');
        }
        let last=null;
        for(const p of body.plans){
          if(!object(p)||typeof p.path!=='string'||p.path==='batch'||!['PUT','PATCH','POST'].includes(p.method))fail(400,'Invalid write plan');
          const out=executeWrite(db,schema,p.path,p.method,p.body,auth);last=out.result;
          for(const w of out.writes)commit(w.path,w.value,w.op);
        }
        send(200,last);return;
      }
      if (parts[0]==='campaigns' && parts[2]==='player' && req.method==='PUT' && auth.role!=='gm') {
        if(!object(body))fail(400,'Expected a JSON object');checkKeys(body);
        const w=playerWrite(db,parts,body,auth,equalJSON);
        send(200,commit(w.path,w.value));return;
      }
      const proposalCreate = req.method === 'POST' && /^campaigns\/[^/]+\/proposals$/.test(path);
      const ownPatch = req.method === 'PATCH' && (parts[0] === 'entities' || /^campaigns\/[^/]+\/tokens\/[^/]+$/.test(path));
      const groupedMove = req.method === 'PATCH' && /^campaigns\/[^/]+\/tokens\/[^/]+\/[^/]+$/.test(path);
      if (auth.role !== 'gm' && !groupedMove && !proposalCreate && !ownPatch && parts[0] !== 'actions') fail(403, 'This write requires a GM');
      if (!object(body)) fail(400, 'Expected a JSON object');
      checkKeys(body);
      if (req.method === 'POST' && ['shorthand','undo'].includes(path)) {
        if (Object.keys(body).some(k=>!['line','campaign','preview','count'].includes(k))||body.preview!==undefined&&typeof body.preview!=='boolean') fail(400,'Expected {line, campaign, preview?}');
        const campaign=body.campaign;if(typeof campaign!=='string'||!Object.hasOwn(db.campaigns,campaign)) fail(400,'A valid campaign is required');
        const hp='campaigns/'+campaign+'/state/history',history=at(db,hp)??[];
        const undo=path==='undo'?[]:typeof body.line==='string'?body.line.trim().match(/^undo(?:\s+(\d+))?$/i):null;
        if(undo){
          const count=path==='undo'?(body.count??1):Number(undo[1]??1);if(!Number.isSafeInteger(count)||count<1||count>history.length)fail(400,'Not enough history to undo');
          const shadow=structuredClone(db),writes=[];
          for(const entry of history.slice(-count).reverse())for(const w of entry.writes){
            if(!equalJSON(at(shadow,w.path)??null,w.value))fail(409,'Undo target changed since this line: '+w.path);
            if(w.before===null){const parts=w.path.split('/'),parent=lookup(shadow,parts.slice(0,-1));if(parent)delete parent[parts.at(-1)];}else set(shadow,w.path.split('/'),structuredClone(w.before));
            writes.push({path:w.path,value:w.before,op:'undo'});
          }
          if(!body.preview){for(const w of writes)commit(w.path,w.value,w.op);commit(hp,history.slice(0,-count),'undo');}
          send(200,{summary:'Undid '+count+' line'+(count===1?'':'s'),changes:writes});return;
        }
        const parsed=parseShorthand(body.line,db,campaign);if(parsed.question){send(200,parsed);return;}
        const shadow=structuredClone(db),changes=[],summaries=[];
        for(const a of parsed.actions){
          const plan=actions[a.name].run(shadow,a.args,auth);changes.push(...plan.changes);summaries.push(plan.summary);
          // Semantic staging lets later actions see earlier HP, inventory and world edits.
          for(const c of plan.changes){
            if(c.op==='patch'){const e=shadow.worlds.gaia.entities[c.entity];for(const [p,v]of Object.entries(c.patch))set(e,safe(p.split('.')),structuredClone(v));}
            else if(c.op==='put')shadow.worlds.gaia.entities[c.entity.id]=structuredClone(c.entity);
            else if(c.op==='env'||c.op==='initiative')set(shadow,['campaigns',campaign,'state',c.field??'initiative'],structuredClone(c.value));
          }
        }
        const writes=prepareChanges(db,changes,schema,auth.role),unique=new Map();
        for(const w of writes)unique.set(w.path,{...w,before:unique.get(w.path)?.before??w.before});
        const entry={line:body.line,writes:[...unique.values()]},next=checked('history',[...history,entry].slice(-100));
        if(!body.preview){for(const w of writes)commit(w.path,w.value,w.op);commit(hp,next,'history');}
        send(200,{summary:summaries.join(' · '),changes});return;
      }
      if (parts[0] === 'actions' && req.method === 'POST' && (parts.length === 2 || parts.length === 3 && parts[2] === 'propose')) {
        const action = actions[parts[1]];
        if (!action) fail(404, 'Unknown action: ' + parts[1]);
        if (Object.keys(body).some(k => !['args', 'preview'].includes(k)) || body.preview !== undefined && typeof body.preview !== 'boolean') fail(400, 'Expected {args, preview?: boolean}');
        const proposing = parts[2] === 'propose';
        const plan = action.run(db, body.args, proposing ? { role: 'gm', pcs: [] } : auth);
        const writes = prepareChanges(db, plan.changes, schema, auth.role);
        if (proposing) {
          if (body.preview) { send(200, plan); return; }
          const campaign = body.args.campaign ?? (body.args.entity ? Object.values(entities).find(e => e.id === plan.changes[0]?.entity)?.campaign : undefined);
          if (!campaign || !Object.hasOwn(db.campaigns, campaign)) fail(400, 'A valid campaign is required for proposals');
          const guards = writes.map(w => ({ path: w.path, value: w.before }));
          const proposal = checked('proposal', stamp({ id: newId('proposal'), status: 'pending', action: action.name, args: body.args, ...plan, guards }, auth.role));
          send(201, commit('campaigns/'+campaign+'/proposals/'+proposal.id, proposal)); return;
        }
        if (!body.preview) for (const w of writes) commit(w.path, w.value, w.op);
        send(200, plan); return;
      }
      if (parts[0] === 'campaigns' && parts.length === 2 && req.method === 'PUT') {
        const id=parts[1];
        if (!/^[a-z0-9_-]+$/.test(id)) fail(400,'Invalid campaign id');
        if (Object.keys(body).some(k=>!['name','gm'].includes(k)) || typeof body.name!=='string' || !body.name.trim() || body.gm!==undefined && typeof body.gm!=='string') fail(400,'Expected {name, gm?}');
        if (Object.hasOwn(db.campaigns,id)) {send(200,db.campaigns[id]);return;}
        send(201,commit(path,checked('campaign',{info:{name:body.name,world:'gaia',gm:body.gm??'gm'},party:{},reveals:{},state:{}})));return;
      }
      if (parts[0] === 'campaigns' && parts.length === 3 && parts[2] === 'info' && req.method === 'PATCH') {
        if (Object.keys(body).length!==1 || typeof body.name!=='string' || !body.name.trim()) fail(400,'Expected {name}');
        send(200,commit(path,checked('campaign_info',{...existing(path),name:body.name}),'patch'));return;
      }
      // Migration snapshots retain grouped token positions. Permit only own-PC movement.
      if (groupedMove) {
        const [,campaign,,map,entity]=parts;
        const target='campaigns/'+campaign+'/state/tokens/'+map+'/'+entity;
        const previous=existing(target), active=lookup(db,['campaigns',campaign,'state','active_map']);
        if (Object.keys(body).some(k=>!['x','y'].includes(k)) || Object.values(body).some(v=>typeof v!=='number'||!Number.isFinite(v))) fail(400,'Expected numeric token x/y');
        if (auth.role!=='gm' && (entities[entity]?.kind!=='pc'||!auth.pcs.includes(entity)||entities[entity].campaign!=null&&entities[entity].campaign!==campaign||active!=null&&active!==map||lookup(db,['campaigns',campaign,'state','session','lockMove']))) fail(403,'Players may move only their own PC in their campaign on the active map');
        send(200,commit(target,{...previous,...body},'patch'));return;
      }
      // Sheets compatibility storage. GM-only (the role gate above applies).
      // Values use an envelope so scalars, arrays and deletion remain unambiguous.
      if (['PUT','PATCH'].includes(req.method) &&
          (parts[0] === 'apps' && parts[1] === 'sheets' && parts.length >= 3 ||
           parts[0] === 'campaigns' && parts[2] === 'state' && parts.length === 4)) {
        if (Object.keys(body).some(k => !['value','expected'].includes(k)) || !Object.hasOwn(body,'value')) fail(400,'Expected {value, expected?}');
        const previous = lookup(db, parts);
        if (Object.hasOwn(body,'expected') && !equalJSON(previous ?? null,body.expected)) fail(409,'Sheets value changed; retry transaction');
        const value = req.method === 'PATCH' ? merge(previous ?? {}, body.value) : body.value;
        const jsonRule = {anyOf:[{type:['string','number','boolean','null']},{type:'array',items:{$ref:'#/$defs/sheets_json'}},{type:'object',additionalProperties:{$ref:'#/$defs/sheets_json'}}]};
        schema.$defs.sheets_json = jsonRule;
        checked('sheets_json',value);
        if (parts[0] === 'campaigns') {
          existing('campaigns/'+parts[1]);
          const field = parts[3];
          if (!['initiative','tokens','rolls','pings','audio','presence','dmAt','rollcall','session','handouts','environment','active_map','party_location'].includes(field)) fail(400,'Unsupported Sheets state field');
          if (value !== null) {
            if (['initiative','environment','party_location'].includes(field)) checked(field,value);
            else if (field === 'active_map') { if (typeof value !== 'string') fail(400,'Expected active map ID'); }
            else if (!object(value)) fail(400,'Expected state object');
            if (field === 'tokens') for (const [id,token] of Object.entries(value)) {
              if (token.entity) checked('token',token);
              else for (const position of Object.values(token)) {
                if (!object(position) || typeof position.x !== 'number' || typeof position.y !== 'number') fail(400,'Expected grouped token x/y');
              }
            }
          }
        }
        send(200,commit(path,value,req.method.toLowerCase())); return;
      }
      if (parts[0] === 'links' && parts.length === 2 && req.method === 'PATCH') {
        const target='worlds/gaia/links/'+parts[1], value=checked('link',stamp(merge(existing(target),body),auth.role));
        if(value.id!==parts[1]) fail(400,'Link id cannot change');
        send(200,commit(target,value,'patch'));return;
      }
      if (parts[0] === 'entities') {
        if (parts.length === 1 && req.method === 'POST') {
          const value = stamp({ ...body, id: body.id ?? newId(body.kind) }, auth.role);
          checked('entity', value);
          if (value.campaign != null && !Object.hasOwn(db.campaigns,value.campaign)) fail(400,'Unknown campaign');
          if (Object.hasOwn(entities, value.id)) fail(409, 'Entity already exists');
          send(201, commit(`worlds/gaia/entities/${value.id}`, value)); return;
        }
        if (parts.length === 2 && ['PUT', 'PATCH'].includes(req.method)) {
          const id = parts[1], target = `worlds/gaia/entities/${id}`;
          const value = req.method === 'PATCH' ? patchEntity(id, body, auth) : checked('entity', stamp(merge(existing(target), body), auth.role));
          if (value.id !== id) fail(400, 'Entity id cannot change');
          if (value.campaign != null && !Object.hasOwn(db.campaigns,value.campaign)) fail(400,'Unknown campaign');
          send(200, commit(target, value, req.method.toLowerCase())); return;
        }
      }
      if (path === 'links' && req.method === 'POST') {
        const value = checked('link', stamp({ ...body, id: body.id ?? newId('link') }, auth.role));
        const target = `worlds/gaia/links/${value.id}`;
        if (lookup(db, target.split('/')) !== undefined) fail(409, 'Link already exists');
        send(201, commit(target, value)); return;
      }
      if (parts[0] === 'campaigns' && parts.length >= 3) {
        const [, campaign, resource, id, action] = parts;
        const base = `campaigns/${campaign}`;
        existing(base);
        if (resource === 'reveals' && parts.length === 4 && req.method === 'PUT') {
          send(200, commit(`${base}/reveals/${id}`, checked('reveal', stamp(body, auth.role)))); return;
        }
        if (resource === 'tokens' && (parts.length === 3 && req.method === 'POST' || parts.length === 4 && req.method === 'PATCH')) {
        const tokenId = id ?? newId('token');
        const target = `${base}/state/tokens/${tokenId}`;
          const old = id ? existing(target) : {};
          if (auth.role !== 'gm') {
            if (!auth.pcs.includes(old.entity) || entities[old.entity]?.kind !== 'pc') fail(403, 'Players may move only their own PC tokens');
            if (entities[old.entity].campaign!=null && entities[old.entity].campaign!==campaign || lookup(db,['campaigns',campaign,'state','session','lockMove'])) fail(403,'Players may move only in their campaign while movement is unlocked');
            if (Object.keys(body).some(k => !['x', 'y'].includes(k))) fail(403, 'Players may change token x and y only');
            // Existing migrations may have no active map; an explicit active map must match.
            const active = lookup(db, [ 'campaigns', campaign, 'state', 'active_map' ]);
            if (active != null && active !== old.map) fail(403, 'Token is not on the active map');
          }
          const value = checked('token', stamp({ ...merge(old, body), id: tokenId }, auth.role));
          const kind = entities[value.entity]?.kind;
          if (!['pc', 'npc', 'creature'].includes(kind)) fail(400, 'Token entity must be a PC, NPC, or creature');
          if (kind !== 'creature' && ('hp_current' in value || 'conditions' in value)) fail(400, 'PC and NPC HP and conditions belong on the entity');
          send(id ? 200 : 201, commit(target, value, id ? 'patch' : 'put')); return;
        }
        if (resource === 'log' && parts.length === 3 && req.method === 'POST') {
          const value = checked('log', stamp({ ...body, id: newId('log'), at: new Date().toISOString() }, auth.role));
          send(201, commit(`${base}/log/${value.id}`, value)); return;
        }
        if (proposalCreate) {
          const value = checked('proposal', stamp({ ...body, id: newId('proposal'), status: 'pending' }, auth.role));
          if (value.action) fail(400, 'Use the action proposal endpoint');
          for (const p of Object.keys(value.patch)) safe(p.split('.'));
          send(201, commit(`${base}/proposals/${value.id}`, value)); return;
        }
        if (resource === 'proposals' && parts.length === 5 && action === 'approve' && req.method === 'POST') {
          const target = `${base}/proposals/${id}`, proposal = existing(target);
          if (proposal.status !== 'pending') fail(409, 'Proposal already approved');
          if (proposal.action) {
            for (const guard of proposal.guards) if (!equalJSON(at(db, guard.path) ?? null,guard.value)) fail(409, 'Proposal is stale; preview and propose again');
            if (!actions[proposal.action]) fail(400, 'Unknown proposed action');
            actions[proposal.action].run(db, proposal.args, auth);
            const writes = prepareChanges(db, proposal.changes, schema, auth.role);
            const approved = checked('proposal', stamp({ ...proposal, status: 'approved' }, auth.role));
            for (const w of writes) commit(w.path, w.value, w.op);
            send(200, commit(target, approved)); return;
          }
          const entity = patchEntity(proposal.entity, proposal.patch, auth);
          const approved = checked('proposal', stamp({ ...proposal, status: 'approved' }, auth.role));
          commit(`worlds/gaia/entities/${proposal.entity}`, entity, 'patch');
          send(200, commit(target, approved)); return;
        }
      }
      fail(404, 'Route not found');
 }
 run();return {result,status,writes};
}
