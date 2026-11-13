// Shared map/sheet concentration controls. All mutations use the Gaia adapter.
export function concentrationControls(host,{combat,editable,save,roll}) {
 const c=combat?.concentration||{};
 host.replaceChildren();host.className='geez-vtt-controls';
 const line=document.createElement('label'),toggle=document.createElement('input'),spell=document.createElement('input');
 toggle.type='checkbox';toggle.checked=!!c.active;toggle.disabled=!editable;toggle.setAttribute('aria-label','Concentrating');
 spell.value=c.spell||'';spell.placeholder='Spell';spell.maxLength=200;spell.disabled=!editable;spell.setAttribute('aria-label','Concentration spell');
 line.append(toggle,document.createTextNode(' Concentrating on: '),spell);host.append(line);
 const update=()=>save({concentration:{active:toggle.checked,spell:spell.value.trim()||'Spell',check:null}});
 toggle.onchange=()=>{toggle.blur();update().catch(showError);};spell.onchange=()=>{if(toggle.checked)update().catch(showError);};
 if(c.active&&c.check&&editable){
  const prompt=document.createElement('div');prompt.className='geez-concentration-prompt';prompt.setAttribute('role','alert');
  prompt.append(document.createTextNode(`Concentration save: CON DC ${c.check.dc} `));
  for(const [label,fn] of [['Roll CON save',roll],['Keep',()=>save({concentration:{...c,check:null}})],['Drop',()=>save({concentration:{active:false,spell:'',check:null}})]]){
   const b=document.createElement('button');b.textContent=label;b.onclick=()=>{b.blur();Promise.resolve(fn()).catch(showError);};prompt.append(b);
  }host.append(prompt);
 }
 function showError(e){let out=host.querySelector('[data-error]');if(!out){out=document.createElement('p');out.dataset.error='';host.append(out);}out.textContent=e.message;}
}
// Local coordinates in grid squares; circle radius, square side, cone length, line length x one cell.
export function contains(t,x,y,scale=5){
 const dx=x-t.x,dy=y-t.y,c=Math.cos(t.angle),s=Math.sin(t.angle),u=dx*c+dy*s,v=-dx*s+dy*c,n=t.size/scale,eps=1e-8;
 if(t.shape==='circle')return dx*dx+dy*dy<=n*n+eps;
 if(t.shape==='cone')return u>=-eps&&u<=n+eps&&Math.abs(v)<=u*Math.tan(26.5*Math.PI/180)+eps;
 if(t.shape==='line')return u>=-eps&&u<=n+eps&&Math.abs(v)<=2.5/scale+eps;
 return u>=-eps&&u<=n+eps&&Math.abs(v)<=n/2+eps;
}
export function createVttCore(api){
 let records={},selected=null,armed=null,origin=null,ready=false;
 const panel=document.createElement('div');panel.id='geezTemplateTool';panel.className='geez-vtt-controls geez-template-tool';panel.hidden=true;
 panel.innerHTML='<details><summary>Area templates</summary><div class="geez-template-fields"><select aria-label="Template shape"><option value="cone">Cone (53°)</option><option value="circle">Sphere / circle</option><option value="line">Line (5 ft wide)</option><option value="square">Cube / square</option></select><label>Feet <input aria-label="Template size" type="number" min="5" max="1000" step="5" value="20"></label><button data-place>Place template</button><button data-cancel hidden>Cancel</button></div><div data-template-info></div></details>';
 api.viewport.append(panel);
 for(const type of ['pointerdown','pointerup','click','wheel'])panel.addEventListener(type,e=>e.stopPropagation());
 const info=panel.querySelector('[data-template-info]');
 const error=e=>{info.textContent=e.message;};
 const own=t=>!api.player||t.owner===api.owner();
 const put=(id,t)=>api.write('templates/'+id,t);
 panel.querySelector('[data-place]').onclick=()=>{armed='place';origin=null;api.pan();panel.querySelector('[data-cancel]').hidden=false;info.textContent='Tap the origin, then tap to aim.';};
 const cancel=()=>{armed=null;origin=null;panel.querySelector('[data-cancel]').hidden=true;};panel.querySelector('[data-cancel]').onclick=cancel;
 addEventListener('keydown',e=>{if(e.key==='Escape')cancel();});
 // Capture map interactions while placing; two primary taps also work with touch.
 api.viewport.addEventListener('pointerdown',e=>{
  if(!armed||panel.contains(e.target)||e.target.closest?.('#appHeader')||!api.scene()||e.button!==0)return;
  e.preventDefault();e.stopImmediatePropagation();const pt=api.content(e.clientX,e.clientY),s=api.scene(),point={x:Math.max(0,Math.min(1,pt.x/s.w)),y:Math.max(0,Math.min(1,pt.y/s.h))};
  if(armed==='move'){put(selected,{...records[selected],...point}).catch(error);cancel();return;}
  if(!origin){origin=point;info.textContent='Tap to aim and finish.';return;}
  const angle=Math.atan2((point.y-origin.y)*s.h,(point.x-origin.x)*s.w);
  if(armed==='aim')put(selected,{...records[selected],angle}).catch(error);
  else {const size=Number(panel.querySelector('input').value);if(!Number.isFinite(size)||size<5||size>1000){error(Error('Size must be 5–1000 ft'));cancel();return;}
   const id=crypto.randomUUID();put(id,{...origin,map:api.bid(),owner:api.owner()||'gm',shape:panel.querySelector('select').value,size,angle,f:api.floor(),color:api.color()}).catch(error);selected=id;
  }cancel();
 },true);
 for(const type of ['pointerup','click','pointermove'])api.viewport.addEventListener(type,e=>{if(armed&&!panel.contains(e.target)&&!e.target.closest?.('#appHeader')){e.preventDefault();e.stopImmediatePropagation();}},true);
 function draw(){
  panel.hidden=!api.scene()||!api.visible();api.layer.querySelectorAll('[data-aoe]').forEach(e=>e.remove());if(panel.hidden)return;
  if(selected&&!records[selected]){selected=null;info.replaceChildren();}
  const s=api.scene(),g=s.ppg,scale=api.scale(),cols=s.w/g,rows=s.h/g;
  for(const [id,t]of Object.entries(records)){
   if(t.map!==api.bid()||t.f!==api.floor())continue;
   const local={...t,x:t.x*cols,y:t.y*rows},n=t.size/scale,x=t.x*s.w,y=t.y*s.h;
   const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.dataset.aoe=id;svg.setAttribute('viewBox',`0 0 ${s.w} ${s.h}`);svg.style.cssText=`position:absolute;inset:0;width:${s.w}px;height:${s.h}px;pointer-events:none;overflow:visible`;
   // Restrict centre tests to the area's bounding box, capped by map dimensions.
   let cells='';for(let r=Math.max(0,Math.floor(local.y-n));r<Math.min(rows,local.y+n+1);r++)for(let c=Math.max(0,Math.floor(local.x-n));c<Math.min(cols,local.x+n+1);c++)if(contains(local,c+.5,r+.5,scale))cells+=`<rect x="${c*g}" y="${r*g}" width="${g}" height="${g}" fill-opacity=".22" stroke-width=".6"/>`;
   const length=n*g,width=(t.shape==='line'?5/scale:n)*g,half=length*Math.tan(26.5*Math.PI/180);
   const shape=t.shape==='circle'?`<circle r="${length}"/>`:t.shape==='cone'?`<path d="M0 0 L${length} ${-half} L${length} ${half} Z"/>`:`<rect x="0" y="${-width/2}" width="${length}" height="${width}"/>`;
   svg.innerHTML=`<g fill="${t.color}" stroke="${t.color}">${cells}<g transform="translate(${x} ${y}) rotate(${t.angle*180/Math.PI})" fill-opacity=".14" stroke-width="2">${shape}</g></g>`;api.layer.prepend(svg);
   const caught=api.tokens().filter(p=>contains(local,p.x*cols,p.y*rows,scale)).map(p=>p.name);
   const label=document.createElement('button');label.dataset.aoe=id;label.className='geez-template-label';label.style.cssText=`position:absolute;left:${x}px;top:${y}px;border-color:${t.color}`;label.textContent=`${t.size} ft`;label.title=`${t.shape}: ${caught.join(', ')||'No tokens'}`;label.onpointerdown=e=>e.stopPropagation();label.onclick=e=>{e.stopPropagation();panel.querySelector('details').open=true;selected=id;showInfo(t,caught);};api.layer.append(label);
   if(selected===id)showInfo(t,caught);
  }
 }
 function showInfo(t,caught){
  info.replaceChildren();const text=document.createElement('p');text.textContent=`${t.size} ft ${t.shape} · Caught: ${caught.join(', ')||'none'}`;info.append(text);
  if(own(t))for(const [label,fn] of [['Move',()=>{armed='move';origin=null;}],['Aim / rotate',()=>{armed='aim';origin={x:t.x,y:t.y};}],['Rotate +15°',()=>put(selected,{...t,angle:t.angle+Math.PI/12})],['Delete',()=>put(selected,null)]]){
   const b=document.createElement('button');b.textContent=label;b.onclick=()=>{Promise.resolve(fn()).catch(error);if(armed)panel.querySelector('[data-cancel]').hidden=false;};info.append(b);
  }
 }
 if(!api.player){const clear=document.createElement('button');clear.textContent='Clear scene templates';clear.onclick=()=>Promise.all(Object.entries(records).filter(([,t])=>t.map===api.bid()).map(([id])=>put(id,null))).catch(error);panel.querySelector('details').append(clear);}
 return {receive(v){records=v||{};ready=true;draw();},draw,records:()=>records,ready:()=>ready};
}

