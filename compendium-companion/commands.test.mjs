import test from 'node:test';
import assert from 'node:assert/strict';
import { Companion,chat } from './core.mjs';
import { queueChange,records,inspectRecord,commandResult,commandGuide } from './commands.mjs';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const campaign='Dungeons & Daddies';
function fixture(){return {characters:{pcs:{ashara:{id:'ashara',name:'Ashara',campaign,level:5,xp:0,combat:{hp_current:20,hp_max:30,temp_hp:3,ac:15},inventory:{},coin_purse:{gp:10},spellcasting:{slots:[null,4,2],slots_used:[null,1]},abilities:{channel_divinity:{kind:'charge',label:'Channel Divinity',current:1,max:2}},text_blocks:{notes:'Original'}}}},geezvtt:{campaign:{things:{inn:{id:'inn',name:'Willow Inn',type:'location',campaign:'world__daddies',notes:'Old notes',traits:{}},other:{id:'other',name:'Disney Inn',type:'location',campaign:'world__disney',traits:{}},pc:{id:'pc',name:'Ashara',type:'npc',campaign:'world__daddies',traits:{pc:true}}}}}};}
let sequence=0;
function queue(s,args){return queueChange(s,campaign,'command-'+(++sequence),args);}
function apply(s,args){const p=queue(s,args);return s.review(campaign,p.id,p.revision,'approve');}
const pc=s=>s.characters(campaign)[0];
test('HP policy, rejection, exact approval, replay and inventory isolation',()=>{
 const s=new Companion(':memory:',fixture());const p=queue(s,{action:'hp_damage',target:'Ashara',amount:5});assert.equal(pc(s).combat.hp_current,20);
 const inventory=s.queue(campaign,'award-pending1',{character:'Ashara',item:'healing potion',quantity:3});
 s.review(campaign,p.id,1,'approve');s.review(campaign,p.id,1,'approve');assert.equal(pc(s).combat.hp_current,18);assert.equal(pc(s).combat.temp_hp,0);
 s.review(campaign,inventory.id,1,'approve');assert.equal(pc(s).combat.hp_current,18);assert.equal(pc(s).inventory.fixture_healing.qty,3);
 apply(s,{action:'hp_heal',target:'Ashara',amount:100});assert.equal(pc(s).combat.hp_current,30);
 const rejected=queue(s,{action:'hp_set',target:'Ashara',value:3});s.review(campaign,rejected.id,1,'reject');assert.equal(pc(s).combat.hp_current,30);
 assert.throws(()=>queue(s,{action:'hp_set',target:'Ashara',value:31}));s.close();
});
test('stale HP preview is refreshed and absolute sets need renewed approval',()=>{
 const s=new Companion(':memory:',fixture());const p=queue(s,{action:'hp_set',target:'Ashara',value:10});
 apply(s,{action:'hp_heal',target:'Ashara',amount:2});const stale=s.review(campaign,p.id,1,'approve');assert.equal(stale.status,'pending_review');assert.equal(stale.revision,2);assert.equal(pc(s).combat.hp_current,22);
 assert.throws(()=>s.review(campaign,p.id,1,'approve'));s.review(campaign,p.id,2,'approve');assert.equal(pc(s).combat.hp_current,10);s.close();
});
test('slots enforce capacities and preserve sparse arrays',()=>{
 const s=new Companion(':memory:',fixture());apply(s,{action:'slot_spend',target:'Ashara',rank:1,amount:2});assert.equal(pc(s).spellcasting.slots_used[1],3);
 apply(s,{action:'slot_restore',target:'Ashara',rank:1,amount:1});assert.equal(pc(s).spellcasting.slots_used[1],2);
 apply(s,{action:'slot_set_remaining',target:'Ashara',rank:2,value:0});assert.equal(pc(s).spellcasting.slots_used[2],2);assert.ok(Array.isArray(pc(s).spellcasting.slots_used));
 assert.throws(()=>queue(s,{action:'slot_spend',target:'Ashara',rank:2,amount:1}));assert.throws(()=>queue(s,{action:'slot_spend',target:'Ashara',rank:9,amount:1}));s.close();
});
test('currency, resources, stats, profile, level and notes have bounded explicit operations',()=>{
 const s=new Companion(':memory:',fixture());
 const changes=[{action:'ability_spend',field:'Channel Divinity',amount:1},{action:'ability_restore',field:'channel_divinity',amount:2},{action:'coin_add',field:'gp',amount:5},{action:'coin_spend',field:'gp',amount:2},{action:'level_set',value:6},{action:'xp_add',amount:100},{action:'stat_set',field:'str',value:16},{action:'detail_set',field:'background',value:'Sailor'},{action:'combat_set',field:'inspiration',value:true},{action:'notes_append',value:'More notes'},{action:'notes_set',value:'Replaced'}];
 for(const change of changes){const result=apply(s,{target:'Ashara',...change});if(change.action==='level_set')assert.match(result.warning,/not a completed level-up/);}
 assert.equal(pc(s).abilities.channel_divinity.current,2);assert.equal(pc(s).coin_purse.gp,13);assert.equal(pc(s).level,6);assert.equal(pc(s).xp,100);assert.equal(pc(s).text_blocks.notes,'Replaced');
 assert.throws(()=>queue(s,{action:'coin_spend',target:'Ashara',field:'gp',amount:100}));assert.throws(()=>queue(s,{action:'detail_set',target:'Ashara',field:'campaign',value:'other'}));s.close();
});
test('NPC creation, linked updates, events, notes, locations and movement survive approval',()=>{
 const s=new Companion(':memory:',fixture());const p=queue(s,{action:'npc_create',name:'Mira',notes:'Innkeeper',location:'Willow Inn'}),id=p.context.id;
 assert.equal(records(s,campaign).filter(r=>r.data.name==='Mira').length,0);
 s.review(campaign,p.id,1,'approve');s.review(campaign,p.id,1,'approve');assert.equal(records(s,campaign).filter(r=>r.data.id===id).length,2);
 apply(s,{action:'npc_update',target:'Mira',field:'status',value:'Missing'});
 assert.equal(records(s,campaign).find(r=>r.kind==='npc_sheet').data.vtt_profile.status,'Missing');
 apply(s,{action:'location_create',name:'New Inn',notes:'Quiet'});apply(s,{action:'location_update',target:'New Inn',field:'category',value:'tavern'});
 apply(s,{action:'entity_move',target:'Mira',location:'New Inn'});apply(s,{action:'entity_move',target:'Ashara',location:'New Inn'});apply(s,{action:'party_move',location:'New Inn'});
 apply(s,{action:'event_create',name:'Arrival',notes:'Party arrived',location:'New Inn',when:'Day 2'});apply(s,{action:'note_create',name:'Key',notes:'Missing key'});
 assert.equal(inspectRecord(s,campaign,'Arrival').record.traits.when,'Day 2');assert.equal(records(s,campaign).find(r=>r.kind==='party_location').data.name,'New Inn');
 assert.throws(()=>queue(s,{action:'entity_move',target:'Ashara',location:'Disney Inn'}));s.close();
});
test('unknown fields, path injection, ambiguity, ID reuse and cross-campaign review are rejected',()=>{
 const s=new Companion(':memory:',fixture());
 assert.throws(()=>queue(s,{action:'hp_set',target:'Ashara',value:10,path:'/characters/pcs'}));
 assert.throws(()=>queue(s,{action:'delete_everything',target:'Ashara'}));
 const missing=commandResult(()=>queue(s,{action:'notes_set',target:'No such person',value:'Hi'}));assert.equal(missing.needsClarification,true);
 const p=queueChange(s,campaign,'request-bound',{action:'hp_set',target:'Ashara',value:10});
 assert.throws(()=>queueChange(s,campaign,'request-bound',{action:'hp_set',target:'Ashara',value:11}));assert.throws(()=>s.review('Dungeons & Disney',p.id,1,'approve'));s.close();
});
test('fake Qwen can inspect a record then queue an HP change without applying it',async()=>{
 const s=new Companion(':memory:',fixture());let n=0;
 const response=await chat(s,campaign,'chat-campaign-001','Ashara takes 5 damage.',async()=>++n===1?{role:'assistant',content:'',tool_calls:[{function:{name:'inspect_campaign_record',arguments:{target:'Ashara'}}}]}:n===2?{role:'assistant',content:'',tool_calls:[{function:{name:'prepare_campaign_update',arguments:{action:'hp_damage',target:'Ashara',amount:5}}}]}:{role:'assistant',content:'Prepared'});
 assert.equal(response.proposal.operation,'campaign_change');assert.equal(pc(s).combat.hp_current,20);assert.equal(commandGuide.length,27);s.close();
});
test('new records and pending revisions persist across restart without reseeding changes',()=>{
 const dir=mkdtempSync(join(tmpdir(),'compendium-commands-'));
 try{
  const path=join(dir,'test.sqlite');let s=new Companion(path,fixture());
  const p=queue(s,{action:'npc_create',name:'Mira',notes:'Draft NPC'});s.close();
  s=new Companion(path,fixture());assert.equal(s.proposal(p.id).context.id,p.context.id);s.review(campaign,p.id,1,'approve');s.close();
  s=new Companion(path,fixture());assert.equal(inspectRecord(s,campaign,'Mira').record.id,p.context.id);assert.equal(s.proposal(p.id).status,'applied');s.close();
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('journal notes save once without model calls or campaign mutations',()=>{
 const s=new Companion(':memory:',fixture());const before=JSON.stringify(pc(s));
 const entry=s.journal(campaign,'journal-entry-001','Mira told the party about a missing key.');
 assert.deepEqual(s.journal(campaign,'journal-entry-001',entry.content),entry);
 assert.throws(()=>s.journal(campaign,'journal-entry-001','Different note'));
 assert.equal(s.state(campaign).messages.length,1);assert.equal(s.state(campaign).messages[0].role,'journal');assert.ok(s.state(campaign).messages[0].createdAt);
 assert.equal(JSON.stringify(pc(s)),before);assert.equal(s.state(campaign).proposals.length,0);s.close();
});
