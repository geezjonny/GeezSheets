import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {executeWrite} from '../../GeezSuite/core/write.mjs';
import {schema} from '../../GeezSuite/core/schema-loader.mjs';
import {decodeTree,encodeTree} from '../../GeezSuite/core/firebase-layout.mjs';
const source=new URL('../../GeezSuite/data/gaia-v2.json',import.meta.url),original=await readFile(source),db=JSON.parse(original);
const ash=Object.values(db.worlds.gaia.entities).find(e=>e.kind==='pc'&&e.name==='Ashara'),other=Object.values(db.worlds.gaia.entities).find(e=>e.kind==='pc'&&e.name==='Liora');
const auth={role:'player',pcs:[ash.id]},root=`campaigns/${ash.campaign}/player/`;
function write(path,value,extra={},as=auth){
 const out=executeWrite(db,schema,path,'PUT',{value,...extra},as);
 for(const w of out.writes){const ks=w.path.split('/');let o=db;for(const k of ks.slice(0,-1))o=o[k]??={};if(w.value===null)delete o[ks.at(-1)];else o[ks.at(-1)]=w.value;}
 return out;
}
function denied(path,value,status=403,extra={}){
 const before=JSON.stringify(db);assert.throws(()=>write(path,value,extra),e=>e.status===status);assert.equal(JSON.stringify(db),before,'rejected write must be pure');
}
const roll={owner:ash.id,by:ash.name,char:ash.id,expr:'1d20',detail:'[12]',total:12,dice:[{s:20,v:12}],ts:Date.now()};
write(root+'rolls/mine',roll);denied(root+'rolls/mine',roll);denied(root+'rolls/mine',null);
denied(root+'rolls/spoof',{...roll,owner:other.id});denied(root+'rolls/spoof',{...roll,by:other.name});denied(root+'rolls/spoof',{...roll,char:other.id});
denied('campaigns/disney/player/rolls/mine',roll);denied(root+'rolls/too-big',{...roll,detail:'x'.repeat(4001)},400);
write(root+'presence/p_Ashara',{owner:ash.id,name:ash.name,dm:false});denied(root+'presence/p_Liora',{owner:ash.id,name:other.name,dm:false});
denied(root+'presence/p_Ashara',{owner:ash.id,name:ash.name,dm:true});
write(root+'presence/p_Ashara',null);
const note={owner:ash.id,author:ash.name,text:'mine'};
write(root+`notes/${ash.id}/mine`,note);write(root+`notes/${ash.id}/mine`,{...note,text:'changed'});write(root+`notes/${ash.id}/mine`,null);
db.campaigns[ash.campaign].reveals[ash.id]??={known:true};
db.campaigns[ash.campaign].reveals[ash.id].notes={legacy:{author:ash.name,text:'legacy'},foreign:{author:other.name,text:'foreign'}};
write(root+`notes/${ash.id}/legacy`,note);write(root+`notes/${ash.id}/legacy`,null);
assert.equal(db.campaigns[ash.campaign].reveals[ash.id].notes.legacy,undefined);
denied(root+`notes/${ash.id}/foreign`,note);denied(root+`notes/${ash.id}/foreign`,null);
denied(root+'cards/x',{owner:other.id,name:'spoof'});
write(root+'cards/x',{owner:ash.id,id:'x',type:'note',name:'clue'});denied(root+'cards/x',{owner:other.id,id:'x',type:'note',name:'spoof'});
write(root+'cards/x',null);write(root+'board/x',{owner:ash.id,x:10,y:20});
assert.ok(db.apps.sheets.party[ash.campaign].layouts[ash.id].x);
const state=db.campaigns[ash.campaign].state;
state.rollcall={id:'call',open:true,to:{[ash.id]:ash.name}};
const answer={owner:ash.id,charId:ash.id,name:ash.name,call:'call',total:12};
denied(root+'rollcall/'+ash.id,answer,403,{call:'old'});write(root+'rollcall/'+ash.id,answer,{call:'call'});
denied(root+'rollcall/'+ash.id,answer,403,{call:'call'});denied(root+'rollcall/'+other.id,{...answer,charId:other.id},403,{call:'call'});
state.rollcall={id:'new',open:true,to:{[ash.id]:ash.name}};denied(root+'rollcall/'+ash.id,answer,403,{call:'new'});
state.initiative={round:2,turn:0,order:[{id:'other',entity:other.id,label:other.name,init:11}]};
write(root+'initiative/ash',{id:'ash',entity:ash.id,label:ash.name,init:19});
assert.equal(db.campaigns[ash.campaign].state.initiative.order[db.campaigns[ash.campaign].state.initiative.turn].id,'other');
denied(root+'initiative/other',{id:'other',entity:ash.id,label:ash.name,init:20});
denied(root+'initiative/duplicate',{id:'duplicate',entity:ash.id,label:ash.name,init:20});
denied(root+'initiative/ash',{id:'ash',entity:other.id,label:other.name,init:20});
write(root+'initiative/ash',null);
for(const field of ['session','audio','tokens','dmAt','handouts'])denied(root+field+'/x',{owner:ash.id});
const prior=JSON.stringify(db);
assert.throws(()=>executeWrite(db,schema,'batch','POST',{plans:[
 {path:root+'rolls/batch',method:'PUT',body:{value:roll}},
 {path:root+'rolls/foreign',method:'PUT',body:{value:{...roll,owner:other.id}}}
]},auth),e=>e.status===403);
assert.equal(JSON.stringify(db),prior,'failed batch must leave no partial player writes');
assert.throws(()=>executeWrite(db,schema,'batch','POST',{guards:[{path:`campaigns/${ash.campaign}/state/initiative`,value:null}],plans:[
 {path:`campaigns/${ash.campaign}/state/initiative`,method:'PUT',body:{value:{round:1,turn:0,order:[]}}}
]},{role:'gm',pcs:[]}),e=>e.status===409);
assert.equal(JSON.stringify(db),prior,'stale GM batch must preserve player initiative');
const tokenMap='player_campaign_test';
db.campaigns.disney.state.tokens??={};db.campaigns.disney.state.tokens[tokenMap]={[ash.id]:{x:0,y:0}};
assert.throws(()=>executeWrite(db,schema,`campaigns/disney/tokens/${tokenMap}/${ash.id}`,'PATCH',{x:1,y:1},auth),e=>e.status===403);
db.campaigns[ash.campaign].state.tokens??={};db.campaigns[ash.campaign].state.tokens.flat={entity:ash.id,map:tokenMap,x:0,y:0};
db.campaigns[ash.campaign].state.session={lockMove:true};
assert.throws(()=>executeWrite(db,schema,`campaigns/${ash.campaign}/tokens/flat`,'PATCH',{x:1,y:1},auth),e=>e.status===403);
assert.throws(()=>executeWrite(db,schema,'actions/token.move','POST',{args:{campaign:ash.campaign,token:'flat',x:1,y:1}},auth),e=>e.status===403);
assert.deepEqual(decodeTree({'%EMPTY':'object',card:encodeTree({name:'clue'})}),{card:{name:'clue'}});
assert.deepEqual(await readFile(source),original);
console.log('PASS direct shared-core ownership, legacy notes, append-only rolls, stale rollcall, initiative, text bounds and campaign isolation; rejected writes pure; source byte-identical');
