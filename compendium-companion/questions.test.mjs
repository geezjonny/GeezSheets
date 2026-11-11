import test from 'node:test';
import assert from 'node:assert/strict';
import {Companion,chat} from './core.mjs';
import {searchSavedRecords,existenceLookup,isRecordQuestion} from './questions.mjs';
const campaign='Dungeons & Daddies';
const fixture={characters:{pcs:{ashara:{id:'ashara',name:'Ashara',campaign,inventory:{}}},npcs:{shade:{id:'shade',name:'Old Man Shade (Hades)',campaign:'Dungeons & Disney',vtt_profile:{status:'Alive'},text_blocks:{notes:'A mysterious traveler.'}}}},geezvtt:{campaign:{things:{shade:{id:'shade',name:'Old Man Shade (Hades)',type:'npc',campaign:'world__disney',notes:'A mysterious traveler.'}}}}};
test('named NPC lookup answers from saved data across DM campaigns without Ollama or proposals',async()=>{
 const s=new Companion(':memory:',fixture);
 // Include the Disney campaign in the fixture campaign roster.
 s.db.prepare('INSERT INTO characters VALUES(?,?,?)').run('disney','Dungeons & Disney',JSON.stringify({id:'disney',name:'Disney PC',campaign:'Dungeons & Disney',inventory:{}}));
 const q='Do we have Old Man Shade as an NPC?';assert.equal(existenceLookup(q).query,'Old Man Shade');assert.equal(isRecordQuestion(q),true);
 const result=await chat(s,campaign,'lookup-shade-0001',q,()=>{throw Error('Must not call Ollama for this lookup.');});
 assert.match(result.reply,/Old Man Shade \(Hades\)/);assert.match(result.reply,/Dungeons & Disney/);assert.equal(result.proposal,null);assert.equal(s.state(campaign).proposals.length,0);
 assert.equal(searchSavedRecords(s,campaign,{query:'Old Man Shade',kind:'npc',scope:'all'}).total,1);
 assert.equal(searchSavedRecords(s,campaign,{query:'Old Man Shade',kind:'npc'}).total,0);s.close();
});
test('missing names and journal mentions are not represented as saved NPC canon',async()=>{
 const s=new Companion(':memory:',fixture);s.journal(campaign,'journal-note-0001','Perhaps we could invent Zorbin the goblin.');
 const result=await chat(s,campaign,'lookup-missing-001','Do we have Zorbin as an NPC?',()=>{throw Error('No model needed');});assert.match(result.reply,/could not find/);assert.equal(s.state(campaign).proposals.length,0);
 const notes=searchSavedRecords(s,campaign,{query:'Zorbin',kind:'journal'});assert.match(notes.results[0].status,/not approved canon/);s.close();
});
test('question tool loop searches records and rejects model mutation attempts',async()=>{
 const s=new Companion(':memory:',fixture);let n=0;
 const result=await chat(s,campaign,'question-guard-0001','Who is Ashara?',async(history,options)=>{
  assert.ok(options.tools.every(t=>!t.function.name.startsWith('prepare_')));
  if(++n===1)return {role:'assistant',content:'',tool_calls:[{function:{name:'prepare_campaign_update',arguments:{action:'npc_create',name:'Bad NPC'}}}]};
  if(n===2){assert.match(history.at(-1).content,/read-only/);return {role:'assistant',content:'',tool_calls:[{function:{name:'search_campaign_records',arguments:{query:'Ashara',kind:'pc'}}}]};}
  assert.match(history.at(-1).content,/characters\/pcs\/ashara/);return {role:'assistant',content:'Ashara is a saved PC in Dungeons & Daddies.'};
 });
 assert.equal(result.proposal,null);assert.equal(s.state(campaign).proposals.length,0);s.close();
});
test('named campaign roster overrides selected campaign and accepts and/ampersand aliases',async()=>{
 const raw=structuredClone(fixture);raw.characters.pcs.esmeralda={id:'esmeralda',name:'Esmeralda',campaign:'Dungeons & Disney',inventory:{}};
 const s=new Companion(':memory:',raw);
 for(const [i,q]of ['What are the names of our PCs in Dungeons and Daddies','Who is in the party in Dungeons & Daddies?','List PCs in Daddies'].entries()){
  const result=await chat(s,'Dungeons & Disney','roster-alias-000'+i,q,()=>{throw Error('Roster should not depend on the model');});
  assert.match(result.reply,/Ashara/);assert.match(result.reply,/Dungeons & Daddies/);assert.doesNotMatch(result.reply,/Esmeralda/);assert.equal(result.proposal,null);
 }
 const current=await chat(s,'Dungeons & Disney','roster-current-001','Who is in our party?',()=>{throw Error('No model');});assert.match(current.reply,/Esmeralda/);
 assert.equal(searchSavedRecords(s,'Dungeons & Daddies',{query:'PCs',kind:'pc'}).total,1);
 assert.equal(s.state('Dungeons & Daddies').proposals.length,0);assert.equal(s.state('Dungeons & Disney').proposals.length,0);s.close();
});
