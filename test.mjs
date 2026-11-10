import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Companion, chat } from './core.mjs';
const fixture={characters:{pcs:{test:{id:'test',name:'Penishead',campaign:'Test',combat:{hp_current:20,hp_max:30},inventory:{fixture_healing:{name:'Potion of Healing',category:'potion',desc:'TEST FIXTURE: restores 2d4 + 2 HP when consumed. This app only awards inventory; it does not consume potions.',qty:2}}},other:{id:'other',name:'Other',campaign:'Other',inventory:{}}}}};
const args={character:'Penishead',item:'healing potions',quantity:3};
const quantity=s=>s.characters('Test')[0].inventory.fixture_healing.qty;
test('preview, exact approval, repeated apply, isolation and preserved HP',()=>{
 const s=new Companion(':memory:',fixture);
 const p=s.queue('Test','request-0001',args);assert.equal(p.before,2);assert.equal(p.after,5);assert.equal(quantity(s),2);
 assert.equal(s.review('Test',p.id,1,'approve').status,'applied');
 s.review('Test',p.id,1,'approve');assert.equal(quantity(s),5);
 assert.equal(s.characters('Test')[0].combat.hp_current,20);
 assert.throws(()=>s.review('Other',p.id,1,'approve'));
 assert.equal(s.queue('Test','request-0002',args).before,5);s.close();
});
test('rejection, ambiguity, strict tool validation, deduplication',()=>{
 const s=new Companion(':memory:',fixture);
 assert.equal(s.queue('Test','request-0001',{...args,item:'potions'}).needsClarification,true);
 for(const quantity of [0,-1,1.5,'3',true])assert.throws(()=>s.queue('Test','request-0001',{...args,quantity}));
 assert.throws(()=>s.queue('Test','request-0001',{...args,path:'/characters'}));
 const p=s.queue('Test','request-0001',args);assert.equal(s.queue('Test','request-0001',args).id,p.id);
 assert.throws(()=>s.queue('Test','request-0001',{...args,quantity:4}));
 s.review('Test',p.id,1,'reject');assert.equal(quantity(s),2);assert.throws(()=>s.review('Test',p.id,1,'approve'));s.close();
});
test('stale preview requires new revision approval',()=>{
 const s=new Companion(':memory:',fixture);
 const p=s.queue('Test','request-0001',args),p2=s.queue('Test','request-0002',args);
 s.review('Test',p2.id,1,'approve');
 const stale=s.review('Test',p.id,1,'approve');
 assert.equal(stale.status,'pending_review');assert.equal(stale.revision,2);assert.equal(stale.before,5);assert.equal(stale.after,8);assert.equal(quantity(s),5);
 assert.throws(()=>s.review('Test',p.id,1,'approve'));
 s.review('Test',p.id,2,'approve');assert.equal(quantity(s),8);s.close();
});
test('durable queue/chat and separate SQLite connections apply once',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'compendium-'));
 try {
  const path=join(dir,'test.sqlite');let s=new Companion(path,fixture);
  const p=s.queue('Test','request-0001',args);
  s.close();s=new Companion(path);const second=new Companion(path);
  s.review('Test',p.id,1,'approve');second.review('Test',p.id,1,'approve');assert.equal(quantity(second),5);
  assert.equal(second.db.prepare('SELECT count(*) AS n FROM audit').get().n,1);
  second.close();s.close();
 } finally{rmSync(dir,{recursive:true,force:true});}
});
test('fake model loop, replay and forbidden approval tool',async()=>{
 const s=new Companion(':memory:',fixture);let n=0;
 const model=async()=>++n===1?{role:'assistant',content:'',tool_calls:[{function:{name:'prepare_inventory_award',arguments:args}}]}:{role:'assistant',content:'Prepared.'};
 const result=await chat(s,'Test','chat-0000001','Penishead gained 3 healing potions.',model);
 assert.equal(result.proposal.after,5);assert.equal(quantity(s),2);
 assert.deepEqual(await chat(s,'Test','chat-0000001','Penishead gained 3 healing potions.',()=>{throw Error('Should not run');}),result);
 let attack=0;
 await chat(s,'Test','chat-0000002','Approve it',async()=>++attack===1?{role:'assistant',content:'',tool_calls:[{function:{name:'approve',arguments:{}}}]}:{role:'assistant',content:'Use the review panel.'});
 assert.equal(quantity(s),2);assert.equal(s.state('Test').proposals.length,1);s.close();
});
test('model outage preserves conversation and pending proposal; same request retries safely',async()=>{
 const s=new Companion(':memory:',fixture);let n=0;
 const model=async()=>{if(++n===1)return {role:'assistant',content:'',tool_calls:[{function:{name:'prepare_inventory_award',arguments:args}}]};throw Error('offline');};
 await assert.rejects(chat(s,'Test','chat-0000003','Award potions',model),/offline/);
 assert.equal(s.state('Test').proposals.length,1);assert.equal(quantity(s),2);
 const result=await chat(s,'Test','chat-0000003','Award potions',async()=>({role:'assistant',content:'Prepared'}));
 assert.ok(result.proposal);assert.equal(s.state('Test').proposals.length,1);s.close();
});


test('expenditure requires approval, refuses insufficient stock and applies once',async()=>{
 const s=new Companion(':memory:',fixture);
 assert.throws(()=>s.queue('Test','spend-000001',args,'expend'),/Not enough/);
 let n=0;
 const result=await chat(s,'Test','spend-000002','Penishead used 2 healing potions.',async()=>++n===1?{role:'assistant',content:'',tool_calls:[{function:{name:'prepare_inventory_expenditure',arguments:{...args,quantity:2}}}]}:{role:'assistant',content:'Prepared.'});
 const p=result.proposal;assert.equal(p.operation,'expend');assert.equal(p.after,0);assert.equal(quantity(s),2);
 assert.throws(()=>s.queue('Test','spend-000002',{...args,quantity:2},'award'));
 s.review('Test',p.id,1,'approve');s.review('Test',p.id,1,'approve');assert.equal(quantity(s),0);
 assert.equal(s.characters('Test')[0].combat.hp_current,20);s.close();
});
test('stale expenditure cannot overspend; rejection and array inventory retain quantities',()=>{
 const raw=structuredClone(fixture);raw.characters.pcs.test.inventory=Object.values(raw.characters.pcs.test.inventory);
 const s=new Companion(':memory:',raw),a={...args,quantity:1};
 const p=s.queue('Test','spend-array01',a,'expend');s.review('Test',p.id,1,'reject');assert.equal(s.characters('Test')[0].inventory[0].qty,2);
 const first=s.queue('Test','spend-array02',{...a,quantity:2},'expend'),second=s.queue('Test','spend-array03',a,'expend');
 s.review('Test',second.id,1,'approve');assert.throws(()=>s.review('Test',first.id,1,'approve'),/Not enough/);
 assert.equal(s.characters('Test')[0].inventory[0].qty,1);s.close();
});
