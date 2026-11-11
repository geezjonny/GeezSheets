let state,campaign='',busy=false,retry=null,last='',locals=[];
const pageStarts=new Map(),seenInk=new Set();
const $=id=>document.getElementById(id);
function pref(key,value){try{if(value===undefined)return localStorage.getItem('compendium-'+key);localStorage.setItem('compendium-'+key,value);}catch{}return '';}
campaign=pref('campaign')||'';
function node(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
function status(text,error=false){$('status').textContent=text;$('status').className=error?'error':'';}
async function api(path,payload){const r=await fetch(path,payload?{method:'POST',headers:{'Content-Type':'application/json','X-Companion-Token':state.csrf},body:JSON.stringify(payload)}:{});const d=await r.json();if(!r.ok)throw Error(d.error||'Request failed.');return d;}
function fill(text){$('message').value=text;$('message').focus();}
function card(p){
 const e=node('article',undefined,'proposal');e.append(node('span','CHANGE TO REVIEW','speaker'));
 if(p.operation==='campaign_change'){
  e.append(node('h3',p.title.replaceAll('_',' ')));if(p.warning)e.append(node('p',p.warning,'warning'));
  for(const patch of p.patches){if(patch.before===null||typeof patch.after==='object'){const d=node('details',undefined,'patch');d.append(node('summary',patch.label),node('pre','Before: '+JSON.stringify(patch.before,null,2)+'\n\nAfter: '+JSON.stringify(patch.after,null,2)));e.append(d);}else e.append(node('div',patch.label+': '+String(patch.before)+' → '+String(patch.after),'patch'));}
 }else e.append(node('h3',p.characterName+' | '+p.item.name),node('div',p.before+' → '+p.after,'change'));
 if(p.conflict)e.append(node('p',p.conflict,'warning'));
 const actions=node('div',undefined,'actions');
 for(const [action,label]of [['approve','Let it be written'],['reject','Leave it']]){const b=node('button',label,action==='reject'?'secondary':'');b.type='button';b.disabled=action==='approve'&&p.blocked;b.onclick=async()=>{b.disabled=true;try{const r=await api('/api/review',{campaign,id:p.id,revision:p.revision,action});status(r.conflict&&r.status==='pending_review'?r.conflict:r.status==='applied'?'Change saved.':'Change rejected.');await refresh();}catch(err){status(err.message,true);}finally{b.disabled=action==='approve'&&p.blocked;}};actions.append(b);}e.append(actions);return e;
}
function render(){
 const signature=JSON.stringify([campaign,state.messages,state.proposals,locals]);if(signature===last)return;last=signature;
 const log=$('messages');const atEnd=document.documentElement.scrollHeight-window.scrollY-window.innerHeight<180;
 if(!pageStarts.has(campaign))pageStarts.set(campaign,Math.max(0,...state.messages.map(m=>m.seq||0)));
 const start=pageStarts.get(campaign),past=state.messages.filter(m=>m.seq<=start);
 const messages=[...state.messages.filter(m=>m.seq>start),...locals];
 $('earlier').hidden=!past.length;
 $('archive').replaceChildren(...past.map(m=>node('article',m.content,'message '+m.role)));
 log.replaceChildren(...messages.map(m=>{
  const key=campaign+':'+(m.seq||m.content),fresh=!seenInk.has(key);seenInk.add(key);const e=node('article',m.content,'message '+m.role+(fresh&&m.role==='assistant'?' new-ink':''));
  if(m.choices)for(const c of state.campaigns){const b=node('button',c,'campaign-choice');b.type='button';b.onclick=async()=>{pref('draft-'+campaign,$('message').value);campaign=c;pref('campaign',c);locals=[];last='';$('message').value=pref('draft-'+c)||'';try{await refresh();status('Using '+c+'.');}catch(err){status(err.message,true);}};e.append(document.createElement('br'),b);}
  return e;
 }));
 for(const p of state.proposals.filter(p=>p.status==='pending_review'))log.append(card(p));
 if(atEnd)requestAnimationFrame(()=>window.scrollTo({top:document.documentElement.scrollHeight,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'}));
}
async function refresh(){state=await api('/api/state'+(campaign?'?campaign='+encodeURIComponent(campaign):''));campaign=state.campaign;pref('campaign',campaign);render();}
async function send(request){
 busy=true;retry=request;$('message').disabled=true;$('retry').hidden=true;document.body.classList.add('waiting');status('');
 try{const result=await api(request.note?'/api/journal':'/api/chat',{campaign:request.campaign,text:request.text,requestId:request.requestId});retry=null;pref('draft-'+campaign,'');$('message').value='';status('');$('message').style.height='140px';if(request.note)status('Kept in your notes.');}
 catch(e){status(e.message,true);$('retry').hidden=false;}
 finally{document.body.classList.remove('waiting');busy=false;$('message').disabled=false;try{await refresh();}catch(e){status(e.message,true);}$('message').focus();}
}
$('chat-form').onsubmit=e=>{e.preventDefault();if(busy||!state)return;let text=$('message').value.trim();if(!text)return;
 if(/^\/(?:campaigns?|switch)$/i.test(text)){locals.push({role:'assistant',content:'Which campaign would you like to use? Current campaign: '+campaign+'.',choices:true});$('message').value='';render();return;}
 const note=text.match(/^(?:\/note\s+|journal:\s*|save a note:\s*)([\s\S]+)$/i);if(note)text=note[1];
 if(!note&&text.length>2000){status('Questions and commands can contain up to 2,000 characters. Use /note for longer notes.',true);return;}
 send({campaign,text,requestId:crypto.randomUUID(),note:!!note});
};
$('message').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('chat-form').requestSubmit();}};
$('message').oninput=()=>{pref('draft-'+campaign,$('message').value);$('message').style.height='auto';$('message').style.height=Math.max(140,$('message').scrollHeight)+'px';};
$('retry').onclick=()=>{if(retry&&!busy)send(retry);};
refresh().then(()=>{$('message').value=pref('draft-'+campaign)||'';$('message').focus();}).catch(e=>status(e.message,true));
setInterval(()=>{if(!busy)refresh().catch(e=>status('Reconnecting... '+e.message,true));},4000);
