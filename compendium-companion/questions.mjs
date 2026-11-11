import { records, inspectRecord } from './commands.mjs';

const normalize=s=>String(s).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const campaignName=s=>normalize(String(s).replace(/&/g,' and '));
export function namedQuestionCampaign(store,text,current){
 const phrase=' '+campaignName(text)+' ';
 const matches=store.campaigns().filter(c=>{
  const full=campaignName(c),short=full.replace(/^dungeons and /,'');
  return phrase.includes(' '+full+' ')||(short!==full&&phrase.includes(' '+short+' '));
 });
 if(matches.length>1)return null;
 if(!matches.length&&/\bdungeons and\b/.test(phrase))return null;
 return matches[0]||current;
}
export function rosterLookup(store,text,current){
 if(!isRecordQuestion(text)||!(/\b(?:pcs?|player characters?|party|party members)\b/i.test(text)))return null;
 if(/\b(?:hp|health|inventory|potions?|slots?|level|levels|strength|gold|notes?)\b/i.test(text))return null;
 const campaign=namedQuestionCampaign(store,text,current);if(!campaign)return null;
 return {campaign,args:{query:'',kind:'pc',scope:'current'},count:/\bhow many\b/i.test(text)};
}
export function rosterReply(result,count=false){
 const names=result.results.map(r=>r.name),campaign=result.campaign;
 if(!names.length)return 'I have no player characters recorded for '+campaign+'.';
 const list=names.length>1?names.slice(0,-1).join(', ')+' and '+names.at(-1):names[0];
 return count?'There are '+result.total+' player characters in '+campaign+': '+list+'.':'The player characters in '+campaign+' are '+list+'.';
}
export const isRecordQuestion=text=>/^(?:do (?:we|i|you) (?:have|know)|does\b|is (?:there|.+? (?:an? |saved|recorded|in |at ))|are there\b|who\b|what\b|where\b|when\b|how (?:many|much)\b|can you (?:tell|find|show|list|check|search)\b|tell me about\b|list\b|show me\b|find\b|search\b|remind me\b)/i.test(text.trim());
export function existenceLookup(text){
 const m=text.trim().match(/^(?:do (?:we|i|you) have|is there)\s+(.+?)(?:\s+(?:as\s+)?(?:an?\s+)?(?:npc|character|location|event|note)(?:\s+(?:saved|recorded))?)?[?.!]*$/i);
 if(!m)return null;
 let query=m[1].replace(/^(?:an?\s+)?(?:npc|character|location|event|note)\s+(?:named|called)\s+/i,'').replace(/[?.!]+$/,'').trim();
 if(!query)return null;
 const kind=/\bnpc\b/i.test(text)?'npc':/\blocation\b/i.test(text)?'location':/\bevent\b/i.test(text)?'event':/\bnote\b/i.test(text)?'note':'any';
 return {query,kind,scope:'all'};
}
export function searchSavedRecords(store,campaign,args){
 store.checkCampaign(campaign);
 if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>!['query','kind','scope'].includes(k))||typeof args.query!=='string'||args.query.length>200)throw Error('Expected query, optional kind and scope.');
 const kind=args.kind||'any',scope=args.scope||'current';
 if(!['any','npc','pc','location','event','note','journal'].includes(kind)||!['current','all'].includes(scope))throw Error('Invalid search kind or scope.');
 const categoryWords={pc:['pc','pcs','player character','player characters','party','party members'],npc:['npc','npcs','non player character','non player characters'],location:['location','locations'],event:['event','events'],note:['note','notes']};
 const query=(categoryWords[kind]||[]).includes(normalize(args.query))?'':normalize(args.query),tokens=query.split(' ').filter(Boolean),campaigns=scope==='all'?store.campaigns():[campaign];
 let results=[];
 for(const c of campaigns){
  if(['any','pc'].includes(kind))for(const pc of store.characters(c))results.push({id:pc.id,name:pc.name,kind:'pc',campaign:c,source:'characters/pcs/'+pc.id,status:'saved',summary:pc.text_blocks?.notes||''});
  const all=records(store,c);
  for(const r of all){
   if(r.data.traits?.pc||r.id.startsWith('companion/'))continue;
   const type=r.kind==='npc_sheet'?'npc':r.kind;
   if(!['npc','location','event','note'].includes(type)||(kind!=='any'&&kind!==type))continue;
   // Keep one source per NPC; the world record is inspected with its linked sheet.
   if(r.kind==='npc_sheet'&&all.some(w=>w.kind==='npc'&&w.data.id===r.data.id))continue;
   results.push({id:r.id,name:r.data.name,kind:type,campaign:c,source:r.id,status:'saved',summary:r.data.notes||r.data.text_blocks?.notes||''});
  }
  if(['any','journal'].includes(kind))for(const j of store.db.prepare('SELECT id,content,created_at FROM journal_entries WHERE campaign=? ORDER BY created_at DESC').all(c))results.push({id:j.id,name:'Journal entry',kind:'journal',campaign:c,source:'journal/'+j.id,status:'journal note — not approved canon',summary:j.content,createdAt:j.created_at});
 }
 results=results.filter(r=>!query||tokens.every(t=>normalize(r.name+' '+r.summary).includes(t))).sort((a,b)=>Number(b.campaign===campaign)-Number(a.campaign===campaign)||Number(normalize(b.name)===query)-Number(normalize(a.name)===query)||a.name.localeCompare(b.name));
 return {query:args.query,scope,campaign:scope==='current'?campaign:undefined,total:results.length,results:results.slice(0,20).map(r=>({...r,summary:r.summary.slice(0,1800)})),note:'Saved records are separate from journal notes. Pending or rejected proposals are not included. Other campaigns are searchable by the local DM only; this app has no player/LAN mode.'};
}
export function lookupReply(result){
 const {query,results,total}=result;
 if(!total)return 'I could not find a saved record for “'+query+'” among these campaigns. We may not have written about them yet.';
 if(total===1){const r=results[0];return 'Yes. '+r.name+' is recorded as '+(r.kind==='npc'?'an NPC':'a '+r.kind)+' in '+r.campaign+'.'+(r.summary?'\n\n'+r.summary:'');}
 const lines=results.map(r=>r.name+' — '+(r.kind==='npc'?'NPC':r.kind)+' in '+r.campaign);
 return 'I have '+total+' matching records. Which one did you have in mind?\n\n'+lines.join('\n')+(total>results.length?'\nThese are the first '+results.length+'.':'');
}
export const searchTool={type:'function',function:{name:'search_campaign_records',description:'READ ONLY. Find saved PCs, NPCs, locations, events, notes, or journal entries by name/keywords. Empty query lists records. scope=current searches active campaign; scope=all searches the local DM\'s campaigns and labels each result. Does not create records or proposals. Journal notes are not canon. Use for questions such as do we have Old Man Shade as an NPC.',parameters:{type:'object',additionalProperties:false,required:['query'],properties:{query:{type:'string',maxLength:200},kind:{type:'string',enum:['any','npc','pc','location','event','note','journal']},scope:{type:'string',enum:['current','all']}}}}};
