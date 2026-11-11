// Gaia projects the legacy RTDB tree at the boundary; renderers keep their existing model.
(function () {
  const copy = v => v == null ? null : JSON.parse(JSON.stringify(v));
  // RTDB returns sorted object keys; local projections need semantic equality
  // so a harmless key-order change does not reset a view or stage extra writes.
  const json = v => JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a<b?-1:a>b?1:0)):x);
  const parts = p => String(p || '').split('/').filter(Boolean);
  const get = (o, p) => parts(p).reduce((v, k) => v?.[k], o) ?? null;
  function put(o, p, v) {
    const ks = parts(p);
    if (ks.some(k => ['__proto__', 'prototype', 'constructor'].includes(k))) throw Error('Unsafe path');
    for (const k of ks.slice(0, -1)) o = o[k] ||= {};
    if (v == null) delete o[ks.at(-1)]; else o[ks.at(-1)] = copy(v);
  }
  const snap = (key, v) => ({ key, val: () => copy(v), exists: () => v != null });
  window.GeezGaiaDb = function (base = 'http://127.0.0.1:8740') {
    base = base.replace(/\/$/, '');
    let tree, raw, queue = Promise.resolve(), loadQueue=Promise.resolve(), loading=false, writing=false;
    const pendingEvents=[];
    const watchers = new Set(), oldToNew = new Map(), newToOld = new Map(), sheetIds = new Map();
    const qs = new URLSearchParams(location.search);
    const player = qs.has('player') || !(qs.get('gm') === 'jonny' || qs.has('gmjonny'));
    let selected = qs.get('pc') || qs.get('char') || localStorage.getItem('geezvtt.player.'+(qs.get('campaign')||localStorage.getItem('geezvtt.player.lastCampaign')||'world__daddies')+'.name') || '';
    const selectedId = () => oldToNew.get(selected) || raw?.entities.find(e=>e.kind==='pc'&&e.name===selected)?.id || selected;
    const identity = () => player ? 'player:' + selectedId() : 'gm';
    const firebaseMode=base.startsWith('firebase');
    const backend=firebaseMode?import('./geez-gaia-firebase.mjs').then(m=>m.connect(base,event=>{
      if(!raw||loading||writing)pendingEvents.push(event);
      else {applyEvent(event);project();fire();}
    },identity)):null;
    async function request(path, method = 'GET', body) {
      if(backend)return (await backend).request(path,method,body);
      const r = await fetch(base + '/v2/' + path, { method, headers: { 'Content-Type': 'application/json', 'X-Geez-As': identity() }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      const v = await r.json();
      if (!r.ok) throw Object.assign(Error(v.error || `Gaia ${r.status}`), { status: r.status, errors: v.errors });
      return v;
    }
    const old = id => newToOld.get(id) || id;
    const canonical = id => oldToNew.get(id) || id;
    const sceneMap = id => raw?.entities.find(e=>e.kind==='map' && e.data.scene && (e.id===canonical(id) || e.data.parent_place===canonical(id)));
    const battleMap = id => old(sceneMap(id)?.data.parent_place || id);
    const canonicalMap = id => sceneMap(id)?.id || canonical(id);
    const refs = new Set(['char','from','to','owner','entity','map','parent_map','parent_place','parent','home','where','childMap','charId','characterId','pcId','npcId','entityId','mapId','target','locationId','linkedCharacterId']);
    function translate(v, toOld = true, key = '') {
      const id = toOld ? old : canonical;
      if (typeof v === 'string') return toOld && ['charId','char','owner'].includes(key) ? sheetIds.get(v)||old(v) : refs.has(key) || key === 'chain' ? id(v) : v;
      if (!v || typeof v !== 'object') return v;
      if (Array.isArray(v)) return v.map(x => translate(x, toOld, key));
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [id(k), translate(x, toOld, k)]));
    }
    function project() {
      const { entities, links, campaigns, apps } = raw;
      oldToNew.clear(); newToOld.clear(); sheetIds.clear();
      for (const e of entities) {
        const paths = [e.source?.id, ...(e.source?.mirrors || [])].filter(Boolean);
        const prefix = e.kind === 'map' ? 'geezvtt/campaign/maps/' : 'geezvtt/campaign/things/';
        const scope=(qs.get('campaign')||'world__daddies').replace(/^world__/,'');
        const path = (player && paths.find(p=>p.startsWith(prefix)&&p.endsWith('__'+scope))) || paths.find(p => p.startsWith(prefix)) || e.source?.id;
        const id = path?.split('/').at(-1) || e.id;
        newToOld.set(e.id, id); oldToNew.set(id, e.id); oldToNew.set(e.id, e.id);
        for (const p of paths) { oldToNew.set(p, e.id); oldToNew.set(p.split('/').at(-1), e.id); }
        const sp = paths.find(p => p.startsWith('characters/'));
        if (sp) sheetIds.set(e.id, sp.split('/').at(-1));
      }
      tree = { characters: { pcs: {}, npcs: {} }, geezvtt: { campaign: { things: {}, maps: {}, links: {}, battles: copy(apps.sheets?.campaign?.battles || apps.vtt?.battles || {}), settings: copy(apps.sheets?.campaign?.settings || apps.vtt?.settings || {}), version: 1 }, party: {}, live: {}, table3d:copy(apps.sheets?.table3d||{}),meta:copy(apps.sheets?.meta||{}) }, session:copy(apps.sheets?.session||{}), maps:copy(apps.sheets?.battlemaps||{}), dice:copy(apps.sheets?.dice||{}) };
      const campaign = tree.geezvtt.campaign;
      for (const e of entities) {
        if (e.data._sheetsDeleted) continue;
        const id = old(e.id), d = translate(copy(e.data));
        const paths = [e.source?.id, ...(e.source?.mirrors || [])].filter(Boolean);
        const legacy = paths.reduce((o, p) => ({ ...o, ...copy(e.data._legacy?.[p] || {}) }), {});
        const extra = copy(e.data.sheets || legacy);
        if (e.kind === 'map') {
          campaign.maps[id] = { ...extra, id, name: e.name, scene: d.scene || null, image: d.image || null, gridSize: d.grid_size || 40, parentMap: d.parent_map || null, parentThing: d.parent_place || null, pins: d.pins || {}, roads: d.roads || {}, tiles: extra.tiles || {}, ...(d.shift ? {shift:d.shift} : {}) };
          continue;
        }
        const combat = e.kind === 'pc' ? d.combat : d.statblock?.combat;
        const sid = sheetIds.get(e.id) || id;
        if (['pc','npc','creature'].includes(e.kind)) {
          const sheet = e.kind === 'pc' ? d : { ...copy(e.data._legacy?.[e.source?.id] || {}), ...d.profile, ...d.statblock, ...d };
          tree.characters[e.kind === 'pc' ? 'pcs' : 'npcs'][sid] = { ...sheet, id: sid, name: e.name };
        }
        const reveal = campaigns[e.campaign]?.reveals?.[e.id] || Object.values(campaigns).map(c => c.reveals?.[e.id]).find(Boolean);
        campaign.things[id] = { ...extra, id, type: ({place:'location',pc:'npc',creature:'npc'})[e.kind] || e.kind, name:e.name,
          campaign: apps.sheets?.campaignIds?.[e.campaign] || 'world__' + (e.campaign || (player ? (qs.get('campaign')||'world__daddies').replace(/^world__/,'') : Object.keys(campaigns)[0])), notes:d.description || d.text || extra.notes || '', board:extra.board || reveal?.board || null,
          traits: { ...extra.traits, ...(e.kind === 'place' ? { scene: d.scene || entities.find(m=>m.kind==='map' && (m.id===e.data.childMap || m.data.parent_place===e.id))?.data.scene || null, category:d.place_kind, ...(d.childMap ? {childMap:d.childMap} : {}) } : {}), ...(combat ? {hp:combat.hp_current, ac:combat.ac} : {}), ...(e.kind === 'pc' ? {pc:true, charId:sid} : {}), ...(['npc','creature'].includes(e.kind) ? {charId:sid} : {}), ...(d.token || {}), ...(d.status ? {status:d.status} : {}) }, properties:copy(extra.properties || []) };
        if (e.kind === 'map' || d.dd2vtt) campaign.things[id].traits.dd2vtt = d.dd2vtt;
      }
      for (const l of Object.values(links)) if (!l._sheetsDeleted) campaign.links[l.id] = translate(l);
      for (const [c, value] of Object.entries(campaigns)) {
        const key = apps.sheets?.campaignIds?.[c] || 'world__' + c;
        campaign.maps[key] = {...(campaign.maps[key] || {pins:{},roads:{},tiles:{},gridSize:40,parentMap:null}), ...copy(apps.sheets?.campaignWorlds?.[c] || {}), id:key,name:value.info.name};
        const party = tree.geezvtt.party[key] = {cards:{}, board:{}, notes:{}, links:{}, ...translate(copy(apps.sheets?.party?.[c] || {}))};
        const ownLayout=player ? translate(copy(apps.sheets?.party?.[c]?.layouts?.[selectedId()]||{})) : {};
        party.board={...party.board,...ownLayout};
        for (const [id, r] of Object.entries(value.reveals || {})) {
          if (!r.known) continue;
          if (r.board && !ownLayout[old(id)]) party.board[old(id)] = copy(r.board);
          if (r.notes) party.notes[old(id)] = {...translate(copy(r.notes)),...party.notes[old(id)]};
          // Standard revealed things enter through pc-known. Only explicit custom cards
          // belong in party.cards: the UI treats these as party-authored, editable records.
          if(r.card && typeof r.card==='object')party.cards[old(id)]=copy(r.card);
          const t = campaign.things[old(id)];
          // Player projection uses pc-known; only the selected campaign's reveals grant it.
          if (t && (!player || c === (qs.get('campaign') || qs.get('live') || 'world__daddies').replace(/^world__/, ''))) {
            t.properties = t.properties.filter(p => p.key !== 'pc-known'); t.properties.push({key:'pc-known',value:'true'});
            // Visited clears the players' fog. Older data kept it only in the legacy card properties.
            const ent = entities.find(x => x.id === id), legacyVisited = Object.values(ent?.data?._legacy || {}).some(v => (v?.properties || []).some(p => p.key === 'pc-visited' && /^(true|yes|y|1|x)$/i.test(String(p.value))));
            if ((r.visited ?? legacyVisited) && !t.properties.some(p => p.key === 'pc-visited')) t.properties.push({key:'pc-visited',value:'true'});
          }
        }
        const state = tree.geezvtt.live[key] = translate(copy(value.state || {}));
        if(value.state?.rollcall)for(const field of ['to','results'])if(value.state.rollcall[field])state.rollcall[field]=Object.fromEntries(Object.entries(value.state.rollcall[field]).map(([id,v])=>[sheetIds.get(id)||old(id),translate(v)]));
        state.table3d=translate(copy(apps.sheets?.table3d?.[key]||{}));
        if (value.state?.initiative) {
          const i = value.state.initiative;
          state.initiative = { round:i.round, turn:i.order[i.turn]?.id || null, rows:Object.fromEntries(i.order.map(r => [r.id, {name:r.label, init:r.init, ...(r.entity ? {thingId:old(r.entity), charId:sheetIds.get(r.entity) || old(r.entity)} : {})}])) };
        }
        // Both the migration's grouped positions and standard flat tokens are accepted.
        const tokens = {};
        for (const [id, t] of Object.entries(state.tokens || {})) {
          if (t.entity && t.map) (tokens[battleMap(t.map)] ||= {})[t.entity] = {...t, f:t.floor ?? t.f};
          else tokens[battleMap(id)] = t;
        }
        state.tokens = tokens;
      }
      if (player) for (const t of Object.values(campaign.things)) {
        const c = (qs.get('campaign') || 'world__daddies').replace(/^world__/, '');
        if (!campaigns[c]?.reveals?.[canonical(t.id)]?.known) t.properties = t.properties.filter(p => p.key !== 'pc-known' && p.key !== 'pc-visited');
      }
      if(apps.sheets?.dmCampaign)tree.geezvtt.live._dmCampaign=copy(apps.sheets.dmCampaign);
      for (const [c, s] of Object.entries(tree.geezvtt.live)) for (const [bid, tokens] of Object.entries(s.tokens || {})) {
        (campaign.battles[bid] ||= {}).tokens = copy(tokens);
      }
    }
    function fire() {
      for (const w of watchers) {
        const v = get(tree, w.path), text = json(v);
        if (text !== w.last) { w.last = text; try { w.cb(snap(parts(w.path).at(-1), v)); } catch(e) { console.error(e); } }
      }
    }
    function applyEvent(event) {
      const snapshot={worlds:{gaia:{entities:Object.fromEntries(raw.entities.map(e=>[e.id,e])),links:raw.links}},campaigns:raw.campaigns,apps:raw.apps};
      put(snapshot,event.path.replace(/^\/v2\//,''),event.value);
      raw={entities:Object.values(snapshot.worlds.gaia.entities),links:snapshot.worlds.gaia.links,campaigns:snapshot.campaigns,apps:snapshot.apps};
    }
    function adoptFirebase(b) {
      const s=b.snapshot();
      raw={entities:Object.values(s.worlds.gaia.entities),links:s.worlds.gaia.links,campaigns:s.campaigns,apps:s.apps};
      pendingEvents.length=0;project();fire();
    }
    function load() {
      const result=loadQueue.then(async()=>{
        loading=true;
        try {
          if(backend){adoptFirebase(await backend);return;}
          const [entities, links, campaigns, apps] = await Promise.all(['entities','worlds/gaia/links','campaigns','apps'].map(p => request(p)));
          raw = {entities, links, campaigns, apps};
          // Firebase's snapshot already includes buffered child events. Replaying an
          // older event over that snapshot can roll back a concurrent transaction.
          const buffered=pendingEvents.splice(0);
          if(!backend)for(const event of buffered)applyEvent(event);
          project();fire();
        } finally {loading=false;}
      });
      loadQueue=result.catch(()=>{});return result;
    }
    const ready = load();
    ready.catch(e => console.error('Gaia load failed', e));
    const same = (a,b) => json(a) === json(b);
    function diff(a,b,prefix='',out={}) {
      if(same(a,b)) return out;
      if(a && b && typeof a==='object' && typeof b==='object' && !Array.isArray(a) && !Array.isArray(b)) {
        for(const k of new Set([...Object.keys(a),...Object.keys(b)])) diff(a[k],b[k],prefix?prefix+'.'+k:k,out);
      } else out[prefix]=b??null;
      return out;
    }
    const campaignId = c => Object.entries(raw?.apps.sheets?.campaignIds || {}).find(([,id])=>id===c)?.[0] || c.replace(/^world__/, '');
    async function characterPlans(e,before,after) {
      if(!after) return [{path:'entities/'+e.id,method:'PATCH',body:{'data._sheetsDeleted':true}}];
      if(player && selectedId()!==e.id) throw Object.assign(Error('Players may change only their own PC'),{status:403});
      const plans=[], patch={}, changes=diff(before,after), args={entity:e.id};
      let concentrationHandled=false;
      const action=(name,values)=>plans.push({path:'actions/'+name,method:'POST',body:{args:{...args,...values}}});
      if(!same(before.inventory,after.inventory)) {
        for(const k of new Set([...Object.keys(before.inventory||{}),...Object.keys(after.inventory||{})])) {
          const prev=before.inventory?.[k],next=after.inventory?.[k],n=Number(next?.qty||0)-Number(prev?.qty||0);
          if(n)action('item.'+(n>0?'give':'take'),{item:prev?k:next.name,qty:Math.abs(n)});
        }
        patch['data.inventory']=copy(after.inventory||{});
      }
      for(const [p,v] of Object.entries(changes)) {
        if(p==='id')continue;
        if(p==='name') {patch.name=v;continue;}
        const b=e.kind==='pc'?'data.':'data.statblock.';
        if(p==='combat.hp_current') action('hp.set',{amount:v});
        else if(p==='combat.elevation')action('elevation.set',{feet:v});
        else if(p.startsWith('combat.concentration')&&!concentrationHandled){
          concentrationHandled=true;const c=after.combat?.concentration;
          if(!c?.active)action('concentration.clear',{});
          else if(before.combat?.concentration?.check&&!c.check)action('concentration.keep',{check:before.combat.concentration.check.id});
          else action('concentration.set',{spell:c.spell});
        }else if(p.startsWith('combat.concentration'))continue;
        else if(p==='combat.hp_max') action('hp.max',{amount:v});
        else if(p==='combat.temp_hp')action('hp.temp',{amount:v});
        else if(p==='combat.conditions') {
          for(const c of before.combat?.conditions||[])if(!(v||[]).includes(c))action('condition.remove',{condition:c});
          for(const c of v||[])if(!(before.combat?.conditions||[]).includes(c))action('condition.add',{condition:c});
        } else if(p==='spellcasting.slots_used') {
          for(const [level,count]of Object.entries(v||{})) {
            if(!Number(level))continue;
            const n=Number(count)-Number(before.spellcasting?.slots_used?.[level]||0);
            if(n)action('slot.'+(n>0?'spend':'restore'),{level:Number(level),amount:Math.abs(n)});
          }
        } else if(/^spellcasting.slots_used.\d+$/.test(p)) {
          const n=Number(v)-Number(get(before,p.replaceAll('.','/'))||0);if(n)action('slot.'+(n>0?'spend':'restore'),{level:Number(p.split('.').at(-1)),amount:Math.abs(n)});
        } else if(/^abilities.[^.]+.current$/.test(p) && before.abilities?.[p.split('.')[1]]?.kind==='charge') {
          const n=Number(v)-Number(get(before,p.replaceAll('.','/'))||0);if(n)action('ability.'+(n<0?'spend':'restore'),{ability:p.split('.')[1],amount:Math.abs(n)});
        } else if(/^coin_purse.[^.]+$/.test(p)) {
          const n=Number(v)-Number(before.coin_purse?.[p.split('.')[1]]||0);if(n)action('coin.'+(n>0?'add':'spend'),{coin:p.split('.')[1],amount:Math.abs(n)});
        } else if(p==='inventory'||p.startsWith('inventory.')) {
          // Quantity actions above run first; the patch retains item details and original keys.
        } else patch[b+p]=copy(v);
      }
      if(Object.keys(patch).length)plans.push({path:'entities/'+e.id,method:'PATCH',body:patch});
      return plans;
    }
    function entityBody(value,kind,id) {
      const data={sheets:copy(value)};
      if(kind==='map') Object.assign(data,{image:value.image||'',grid_size:value.gridSize||40,parent_map:canonical(value.parentMap)||'',parent_place:canonical(value.parentThing)||'',pins:translate(value.pins||{},false),roads:translate(value.roads||{},false),shift:value.shift||null});
      else {
        if(kind==='place')data.place_kind=value.traits?.category||'site';
        if(value.notes!==undefined)data[kind==='note'?'text':'description']=value.notes;
        if(value.traits?.childMap)data.childMap=canonical(value.traits.childMap);
        if(value.traits?.dd2vtt)data.dd2vtt=value.traits.dd2vtt;
      }
      return {kind,name:value.name||id,world:'gaia',campaign:campaignId(value.campaign||'world__daddies'),tags:[],data,source:{system:'geezsheets',id:`geezvtt/campaign/${kind==='map'?'maps':'things'}/${id}`}};
    }
    async function persist(path,v,update,transactionFn,editBase) {
      await ready;
      // Fetch current server values before evaluating a write; rejected writes never change the mirror.
      await load();
      const transactionEntity=backend&&transactionFn&&path.startsWith('characters/')?copy(raw.entities.find(e=>e.id===canonical(parts(path)[2]))):null;
      if(transactionFn){v=transactionFn(copy(get(tree,path)));if(v===undefined)return {committed:false,snapshot:snap(parts(path).at(-1),get(tree,path))};}
      const before=copy(tree), after=copy(tree);
      if(editBase && !transactionFn){
        // Diff against what the caller edited, before any await or queued write.
        const desired=copy(editBase);
        if(update)for(const [p,x]of Object.entries(v||{}))put(desired,path+'/'+p,x);else put(desired,path,v);
        function intent(a,b,current){
          if(same(a,b))return copy(current);
          if(a&&b&&typeof a==='object'&&typeof b==='object'&&!Array.isArray(a)&&!Array.isArray(b)){
            const out=copy(current)||{};
            for(const k of new Set([...Object.keys(a),...Object.keys(b)]))if(!same(a[k],b[k])){
              if(b[k]===undefined)delete out[k];else out[k]=intent(a[k],b[k],current?.[k]);
            }
            return out;
          }
          return copy(b);
        }
        Object.assign(after,intent(editBase,desired,after));
      }else if(update)for(const [p,x]of Object.entries(v||{}))put(after,path+'/'+p,x);else put(after,path,v);
      const plans=[],guards=[];
      const stage=(path,method,body)=>plans.push({path,method,body});
      // Campaign roots are campaign records, not world entities. Stage them before all entities.
      const campaignMaps=after.geezvtt.campaign.maps;
      const roots=new Map(Object.entries(campaignMaps).filter(([id,m])=>!m.parentMap && (id.startsWith('world__') || !before.geezvtt.campaign.maps[id] || Object.values(raw.apps.sheets?.campaignIds||{}).includes(id))));
      const rootIds=new Map();
      for(const [id,value] of roots) {
        let c=campaignId(id);
        if(!/^[a-z0-9_-]+$/.test(c))c=c.toLowerCase().normalize('NFKD').replace(/[^a-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'')||'campaign';
        const owner=Object.entries(raw.apps.sheets?.campaignIds||{}).find(([key])=>key===c)?.[1] || 'world__'+c;
        if((raw.campaigns[c] && owner!==id) || [...rootIds].some(([key,value])=>value===c && key!==id))throw Error('Campaign slug collision: '+c);
        rootIds.set(id,c);
        if(same(before.geezvtt.campaign.maps[id],value))continue;
        if(!raw.campaigns[c])stage('campaigns/'+c,'PUT',{name:value.name||id});
        else if(raw.campaigns[c].info.name!==value.name)stage('campaigns/'+c+'/info','PATCH',{name:value.name});
        if(id!=='world__'+c)stage('apps/sheets/campaignIds/'+c,'PUT',{value:id});
        stage('apps/sheets/campaignWorlds/'+c,'PUT',{value});
      }
      const mapCampaign = id => {
        const seen=new Set();let m=campaignMaps[id];
        while(m?.parentMap&&!seen.has(m.id)){seen.add(m.id);m=campaignMaps[m.parentMap];}
        return rootIds.get(m?.id) || (m?.id?campaignId(m.id):undefined);
      };
      for(const group of ['pcs','npcs']) {
        const a=before.characters[group],b=after.characters[group];
        for(const id of new Set([...Object.keys(a),...Object.keys(b)]))if(!same(a[id],b[id])) {
          const e=raw.entities.find(e=>e.id===canonical(id));
          if(e)plans.push(...await characterPlans(e,a[id],b[id]));
          else stage('entities','POST',{kind:group==='pcs'?'pc':'npc',name:b[id].name||id,world:'gaia',data:group==='pcs'?b[id]:{statblock:b[id]},source:{system:'geezsheets',id:`characters/${group}/${id}`}});
        }
      }
      const a=before.geezvtt.campaign,b=after.geezvtt.campaign;
      for(const group of ['things','maps'])for(const id of new Set([...Object.keys(a[group]),...Object.keys(b[group])]))if(!same(a[group][id],b[group][id])) {
        if(group==='maps' && roots.has(id))continue;
        const value=b[group][id], e=raw.entities.find(e=>e.id===canonical(id));
        if(!value){if(e)stage('entities/'+e.id,'PATCH',{'data._sheetsDeleted':true});continue;}
        const kind=group==='maps'?'map':({location:'place',object:'item',plan:'note'})[value.type]||value.type;
        const body=entityBody({...value,campaign:rootIds.get(value.campaign)||value.campaign||mapCampaign(id)},e?.kind||kind,id);
        if(e){const patch={name:body.name};for(const [k,x]of Object.entries(body.data))patch['data.'+k]=x;
          if(value.campaign!==a[group][id]?.campaign)patch.campaign=body.campaign;
          // HP edits made from the inspector use the same actions as sheets.
          if(['pc','npc','creature'].includes(e.kind)) {
            const prev=a[group][id]?.traits||{}, next=value.traits||{};
            if(next.hp!==prev.hp)stage('actions/hp.set','POST',{args:{entity:e.id,amount:Number(next.hp)}});
          }
          stage('entities/'+e.id,'PATCH',patch);
        } else stage('entities','POST',body);
        // Known flags are the campaign's reveals, never a second canon permission flag.
        const flag=(t,k='pc-known')=>(t?.properties||[]).find(p=>p.key===k)?.value, yes=v=>/^(true|yes|y|1|x)$/i.test(String(v));
        if(e && (flag(a[group][id])!==flag(value)||yes(flag(a[group][id],'pc-visited'))!==yes(flag(value,'pc-visited'))))
          stage(`campaigns/${body.campaign}/reveals/${e.id}`,'PUT',{...raw.campaigns[body.campaign]?.reveals?.[e.id],known:yes(flag(value)),visited:yes(flag(value,'pc-visited'))});
      }
      for(const id of new Set([...Object.keys(a.links),...Object.keys(b.links)]))if(!same(a.links[id],b.links[id])) {
        const value=b.links[id];
        if(!value)stage('links/'+id,'PATCH',{_sheetsDeleted:true});
        else stage(raw.links[id]?'links/'+id:'links',raw.links[id]?'PATCH':'POST',{...translate(value,false),id,role:value.role||value.label||'related_to'});
      }
      for(const key of ['battles','settings','version'])if(!same(a[key],b[key]))stage('apps/sheets/campaign/'+key,'PUT',{value:b[key]??null});
      for(const key of new Set([...Object.keys(before.geezvtt.party),...Object.keys(after.geezvtt.party)])) {
        const a=before.geezvtt.party[key],b=after.geezvtt.party[key];if(same(a,b))continue;
        const c=rootIds.get(key)||campaignId(key);
        if(player){
          for(const field of ['notes','cards','links','board']){
            const prev=a?.[field]||{},next=b?.[field]||{};
            for(const id of new Set([...Object.keys(prev),...Object.keys(next)])){
              const entries=field==='notes'?new Set([...Object.keys(prev[id]||{}),...Object.keys(next[id]||{})]):[''];
              for(const sub of entries){
                const x=sub?prev[id]?.[sub]:prev[id],y=sub?next[id]?.[sub]:next[id];if(same(x,y))continue;
                const value=y?{...translate(y,false),owner:selectedId()}:null;
                stage('campaigns/'+c+'/player/'+field+'/'+canonical(id)+(sub?'/'+sub:''),'PUT',{value});
              }
            }
          }
        }else{
          for(const id of new Set([...Object.keys(a?.board||{}),...Object.keys(b?.board||{})]))if(!same(a?.board?.[id],b?.board?.[id]))stage(`campaigns/${c}/reveals/${canonical(id)}`,'PUT',{...raw.campaigns[c]?.reveals?.[canonical(id)],known:!!b?.board?.[id],...(b?.board?.[id]?{board:b.board[id]}:{})});
          const {board,...extras}=b||{};stage('apps/sheets/party/'+c,'PUT',{value:translate(extras,false)});
        }
      }
      for(const key of new Set([...Object.keys(before.geezvtt.live),...Object.keys(after.geezvtt.live)])) {
        const a=before.geezvtt.live[key]||{},b=after.geezvtt.live[key]||{},c=rootIds.get(key)||campaignId(key);
        if(key==='_dmCampaign'){if(!same(a,b))stage('apps/sheets/dmCampaign','PUT',{value:b});continue;}
        for(const field of new Set([...Object.keys(a),...Object.keys(b)]))if(!same(a[field],b[field])) {
          if(field==='templates'){
            const prev=a.templates||{},next=b.templates||{};
            for(const id of new Set([...Object.keys(prev),...Object.keys(next)]))if(!same(prev[id],next[id]))stage(`campaigns/${c}/player/templates/${id}`,'PUT',{value:next[id]?translate(next[id],false):null});
          }else if(player && ['rolls','pings','presence','rollcall','initiative'].includes(field)) {
            if(field==='initiative'){
              if(b.initiative?.round!==a.initiative?.round||b.initiative?.turn!==a.initiative?.turn)throw Object.assign(Error('Only the GM controls initiative turn and round'),{status:403});
              const prev=a.initiative?.rows||{},next=b.initiative?.rows||{};
              for(const id of new Set([...Object.keys(prev),...Object.keys(next)]))if(!same(prev[id],next[id])){
                const r=next[id],entity=canonical(r?.charId||r?.thingId||prev[id]?.charId||prev[id]?.thingId);
                const rowId=raw.campaigns[c]?.state?.initiative?.order?.find(row=>row.entity===entity)?.id||id;
                stage('campaigns/'+c+'/player/initiative/'+rowId,'PUT',{value:r?{id:rowId,entity,label:r.name,init:r.init===''?0:Number(r.init)}:null});
              }
            }else{
              const prev=field==='rollcall'?a[field]?.results||{}:a[field]||{},next=field==='rollcall'?b[field]?.results||{}:b[field]||{};
              if(field==='rollcall'&&!same({...a[field],results:null},{...b[field],results:null}))throw Object.assign(Error('Only the GM starts or changes a roll call'),{status:403});
              for(const id of new Set([...Object.keys(prev),...Object.keys(next)]))if(!same(prev[id],next[id])){
                const value=next[id]?{...translate(next[id],false),owner:selectedId()}:null;
                stage('campaigns/'+c+'/player/'+field+'/'+(field==='rollcall'?canonical(id):id),'PUT',{value,...(field==='rollcall'?{call:a[field]?.id}:{})});
              }
            }
          } else if(field==='initiative') {
            guards.push({path:'campaigns/'+c+'/state/initiative',value:raw.campaigns[c]?.state?.initiative??null});
            const value=b[field];
            if(!value||!Object.keys(value.rows||{}).length)stage('actions/combat.end','POST',{args:{campaign:c}});
            else {
              const order=Object.entries(value.rows).map(([id,r])=>({id,label:r.name||id,init:Number(r.init)||0,...(r.charId||r.thingId?{entity:canonical(r.charId||r.thingId)}:{})})).sort((a,b)=>b.init-a.init);
              if(!same(a.initiative?.rows,value.rows))stage('actions/initiative.set','POST',{args:{campaign:c,list:order.map(r=>({name:r.entity||r.label,init:r.init}))}});
              else if(value.turn!==a.initiative?.turn) {
                const current=Object.keys(a.initiative.rows).sort((x,y)=>Number(a.initiative.rows[y].init)-Number(a.initiative.rows[x].init));
                const idx=current.indexOf(a.initiative.turn),next=current[(idx+1)%current.length];
                if(value.turn===next)stage('actions/initiative.next','POST',{args:{campaign:c}});
              }
              stage(`campaigns/${c}/state/initiative`,'PUT',{value:{round:value.round||1,turn:Math.max(0,order.findIndex(r=>r.id===value.turn)),order}});
            }
          } else if(field==='table3d')stage('apps/sheets/table3d/'+key,'PUT',{value:translate(b[field],false)});
          else if(field==='presence'&&!transactionFn){
            // Browsers report presence entries independently. Merge those entries
            // instead of replacing another browser's concurrently sent heartbeat.
            const value={};
            for(const id of new Set([...Object.keys(a.presence||{}),...Object.keys(b.presence||{})]))if(!same(a.presence?.[id],b.presence?.[id]))value[id]=b.presence?.[id]??null;
            stage(`campaigns/${c}/state/presence`,'PATCH',{value});
          }
          else if(field==='tokens' && player) {
            for(const [map,tokens]of Object.entries(b.tokens||{}))for(const [id,pos]of Object.entries(tokens)) {
              const prev=a.tokens?.[map]?.[id];if(same(prev,pos))continue;
              if(canonical(id)!==selectedId())throw Object.assign(Error('Players may move only their own PC token'),{status:403});
              if(Object.keys(diff(prev,pos)).some(k=>!['x','y'].includes(k)))throw Object.assign(Error('Players may move token x/y only'),{status:403});
              const flat=Object.entries(raw.campaigns[c].state.tokens||{}).find(([,t])=>t.entity===canonical(id)&&t.map===canonicalMap(map));
              stage(`campaigns/${c}/tokens/${flat?flat[0]:canonicalMap(map)+'/'+canonical(id)}`,'PATCH',{x:pos.x,y:pos.y});
            }
          } else if(field==='tokens' && Object.keys(b.tokens||{}).some(id=>sceneMap(id))) {
            const value=copy(raw.campaigns[c]?.state?.tokens||{});
            for(const map of new Set([...Object.keys(a.tokens||{}),...Object.keys(b.tokens||{})])) {
              for(const id of new Set([...Object.keys(a.tokens?.[map]||{}),...Object.keys(b.tokens?.[map]||{})])) {
                const prev=a.tokens?.[map]?.[id],pos=b.tokens?.[map]?.[id];if(same(prev,pos))continue;
                const flat=Object.entries(value).find(([,t])=>t.entity===canonical(id)&&t.map===canonicalMap(map));
                if(flat){if(!pos)delete value[flat[0]];else value[flat[0]]={...flat[1],...pos,entity:canonical(id),map:canonicalMap(map),floor:pos.f??pos.floor??0};}
                else {const key=canonicalMap(map);value[key]||={};if(pos)value[key][canonical(id)]=translate(pos,false);else delete value[key][canonical(id)];}
              }
            }
            stage('campaigns/'+c+'/state/tokens','PUT',{value,expected:raw.campaigns[c]?.state?.tokens??null});
          } else stage(`campaigns/${c}/state/${field}`,'PUT',{value:translate(b[field]??null,false),expected:raw.campaigns[c]?.state?.[field]??null});
        }
      }
      for(const [legacy,target]of [['session','session'],['maps','battlemaps'],['dice','dice'],['geezvtt/meta','meta'],['geezvtt/table3d','table3d']])if(!same(get(before,legacy),get(after,legacy)))stage('apps/sheets/'+target,'PUT',{value:get(after,legacy)});
      if(!plans.length && !same(before,after))throw Object.assign(Error(player?'This change requires a GM: '+path:'Unsupported Gaia path: '+path),{status:player?403:400});
      // Preview every standard action and check non-action ownership before applying any changes.
      if(player)for(const p of plans) {
        if(p.path.startsWith('entities/')) {
          if(selectedId()!==p.path.slice(9))throw Object.assign(Error('Players may change only their own PC'),{status:403});
          for(const key of Object.keys(p.body))if(!/^data\.(combat\.(hp_current|temp_hp|conditions|death_saves|death_save_[^.]+)|spellcasting\.slots_used|abilities\.[^.]+\.current|inventory|coin_purse)(\.|$)/.test(key))throw Object.assign(Error('Players cannot patch '+key),{status:403});
        } else if(!p.path.startsWith('actions/')&&!/^campaigns\/[^/]+\/(tokens|player)\//.test(p.path))throw Object.assign(Error('This write requires a GM'),{status:403});
      }
      for(const p of plans)if(p.path.startsWith('actions/'))await request(p.path,'POST',{...p.body,preview:true});
      // A sheet's read/modify/write function must retry if another browser changed
      // the character before our Firebase batch acquired its cross-page lock.
      if(transactionEntity)guards.push({path:'worlds/gaia/entities/'+transactionEntity.id,value:transactionEntity});
      writing=true;
      try { if(backend)await (await backend).batch(plans,guards);else await request('batch','POST',{plans,guards}); }
      finally { try { await load(); } finally { writing=false;if(backend)adoptFirebase(await backend); } }
      return {committed:true,snapshot:snap(parts(path).at(-1),get(tree,path))};
    }
    function write(path,v,update=false) {
      const editBase=copy(tree);v=copy(v);
      const result=queue.then(async()=>{for(let attempt=0;attempt<2;attempt++){try{return await persist(path,v,update,undefined,editBase);}catch(e){if(e.status!==409||attempt===1)throw e;if(backend)await (await backend).refresh();}}});
      queue=result.catch(()=>{});return result;
    }

    function ref(path = '') {
      const local = new Map(), key = parts(path).at(-1);
      return {
        key, child:p => ref(path + '/' + p),
        on(event, cb, error) {
          if (path.startsWith('.info/')) { ready.then(() => cb(snap(key, key === 'connected' ? true : 0)), error); return cb; }
          const w = {path,cb}; watchers.add(w); local.set(cb,w); if (tree) fire(); ready.catch(error || console.error); return cb;
        },
        off(event, cb) { if (cb) {watchers.delete(local.get(cb));local.delete(cb);} else {local.forEach(w=>watchers.delete(w));local.clear();} },
        once:async () => { await ready; return snap(key,get(tree,path)); },
        set:v => write(path,v), update:v => write(path,v,true), remove:() => write(path,null),
        push(v) {const r=ref(path+'/k'+crypto.randomUUID().replaceAll('-','')); if(v!==undefined){const p=r.set(v);r.then=p.then.bind(p);r.catch=p.catch.bind(p);}return r;},
        transaction(fn) {
          const result=queue.then(async()=>{for(let attempt=0;attempt<2;attempt++){try{return await persist(path,null,false,fn);}catch(e){if(e.status!==409||attempt===1)throw e;if(backend)await (await backend).refresh();}}});
          queue=result.catch(()=>{});return result;
        }
      };
    }
    let closed=false, streamController;
    async function stream() {
      streamController=new AbortController();
      try {
        const response=await fetch(base+'/v2/events',{headers:{'X-Geez-As':identity()},signal:streamController.signal});
        if(!response.ok)throw Error('Gaia SSE '+response.status);
        await ready; await load(); // Refresh on every connection, including after missed events.
        const reader=response.body.getReader(), decoder=new TextDecoder();let buffer='';
        while(!closed){
          const {value,done}=await reader.read();if(done)break;
          buffer+=decoder.decode(value,{stream:true}).replaceAll('\r','');
          let boundary;
          while((boundary=buffer.indexOf('\n\n'))>=0){
            const block=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2);
            const payload=block.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');
            if(!payload)continue;
            const event=JSON.parse(payload);
            if(loading || writing)pendingEvents.push(event);
            else {applyEvent(event);project();fire();}
          }
        }
      } catch(error){if(!closed)console.warn('Gaia stream reconnecting:',error.message);}
      if(!closed)setTimeout(stream,1000);
    }
    if(!backend)stream();
    return {
      damage(entity,amount) {
        const result=queue.then(async()=>{await ready;await load();
          const out=await request('actions/hp.damage','POST',{args:{entity:canonical(entity),amount}});
          await load();fire();return out;
        });queue=result.catch(()=>{});return result;
      },
      async storeFile(name,blob) {
        const value=await new Promise((ok,no)=>{
          const reader=new FileReader();
          reader.onload=()=>ok(reader.result);reader.onerror=()=>no(reader.error);
          reader.readAsDataURL(blob);
        });
        return request('apps/sheets/files/'+encodeURIComponent(name),'PUT',{value});
      },
      async loadFile(name) {
        try {
          const url=await request('apps/sheets/files/'+encodeURIComponent(name));
          return url?(await fetch(url)).blob():null;
        } catch(error) {if(error.status===404)return null;throw error;}
      },
      async publishScene(entity,scene,campaign) {
        await ready;await queue;await load();
        return request('actions/map.publish','POST',{args:{entity:canonical(entity),scene,campaign:campaignId(campaign)}});
      },
      close:()=>{closed=true;streamController?.abort();backend?.then(b=>b.close());}, ref, ready, gaia:true, base,
      selectPC:id=>{selected=id;}, ids:()=>({oldToNew:Object.fromEntries(oldToNew),newToOld:Object.fromEntries(newToOld)})
    };
  };
})();

