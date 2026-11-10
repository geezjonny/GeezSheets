import {MapmakerStudio} from './studio.js';
(() => {
'use strict';
const C=HearthCore,R=HearthRender,catalog=HEARTH_CATALOG.assets,$=id=>document.getElementById(id);
const h=(tag,attrs={},...children)=>{const el=document.createElement(tag);for(const [key,value]of Object.entries(attrs)){if(key.startsWith('on'))el.addEventListener(key.slice(2),value);else if(key==='class')el.className=value;else if(key==='checked')el.checked=!!value;else if(key==='value')el.value=value;else if(value!=null)el.setAttribute(key,value);}for(const child of children.flat())if(child!=null)el.append(child);return el;};
const tools=[
 ['select','↖','Select','V','Select or move a prop. Right-drag to orbit. Space-drag to pan. Tab for top view.'],
 ['room','▱','Room','B','Drag from one corner to another to draw a room with walls.'],
 ['floor','▧','Floor brush','P','Drag to paint your selected floor material.'],
 ['terrain','♧','Terrain brush','T','Drag to paint a natural terrain.'],
 ['wall','╱','Wall','W','Drag between two points to draw a wall.'],
 ['door','⊏','Door','D','Click a wall to place a door. Its opening is cut into exported walls.'],
 ['prop','♜','Prop','O','Click to place the selected prop. R rotates, Shift+R rotates back.'],
 ['light','☼','Light','L','Click to place a VTT light. Select it to adjust its range and color.'],
 ['label','T','Label','N','Click to add a map label. Edit its text in the inspector.'],
 ['erase','⌫','Erase','E','Click or drag across an object to erase it. Undo brings it back.'],
 ['pan','✥','Pan','H','Drag to move the canvas. Scroll to zoom. F fits the map.']
];
const layerNames={labels:'Labels',lights:'Lights',props:'Props & furniture',walls:'Walls & doors',rooms:'Room floors',terrain:'Terrain & ground'};
const history=new C.History();
let map=C.demoMap(),tool='select',category='props',activeTag='',favoritesOnly=false,selected=null;
let favorites=new Set(),settings={prop:'prop-oak',floor:'floor-flagstone',terrain:'terrain-grass',wall:'wall-stone',brush:1,rotation:0,scale:1,doorWidth:1,lightRange:4,lightColor:'#ffb45e',lightIntensity:.8,label:'A place of interest',labelSize:.4};
let view={x:0,y:0,zoom:24},visible={terrain:true,rooms:true,walls:true,props:true,lights:true,labels:true},grid=true,snap=true,lighting=false,space=false,drag=null,hover=null;
let saveTimer,toastTimer,raf=0;
try{const saved=localStorage.getItem('hearth.project.v1');if(saved)map=C.validateMap(JSON.parse(saved),catalog);favorites=new Set(JSON.parse(localStorage.getItem('hearth.favorites.v1')||'[]'));}catch(e){console.warn('Could not restore stored map:',e.message);}
const canvas=$('map-canvas'),wrap=$('canvas-wrap');
function floorImage(source,visibility={}){const out=document.createElement('canvas');out.width=source.width*32;out.height=source.height*32;const c=out.getContext('2d');c.scale(32,32);R.drawWorld(c,source,{ppg:32,grid:false,lighting:false,visible:{...visibility,props:false,walls:false,lights:false}});return out;}
const studio=new MapmakerStudio(canvas,{catalog,surface:floorImage,request:draw,toast});
function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3300);}
function saveLocal(){clearTimeout(saveTimer);$('save-state').textContent='Saving…';saveTimer=setTimeout(()=>{try{localStorage.setItem('hearth.project.v1',JSON.stringify(map));$('save-state').textContent='Saved locally';}catch{$('save-state').textContent='Download a project to save';toast('Browser storage is full or unavailable. Use Save project to keep your work.');}},350);}
function changed(){saveLocal();updateChrome();renderLayers();draw();}
function commit(fn){history.record(map);fn();changed();renderSelection();}
function entity(){for(const kind of ['props','lights','labels','doors','walls','rooms']){const item=map[kind].find(o=>o.id===selected);if(item)return{kind,item};}return null;}
function screenToWorld(e){return studio.ground(e.clientX,e.clientY);}
const within=p=>p.x>=0&&p.y>=0&&p.x<=map.width&&p.y<=map.height;
const bound=p=>({x:C.clamp(p.x,0,map.width),y:C.clamp(p.y,0,map.height)});
const snapped=p=>snap?{x:Math.round(p.x),y:Math.round(p.y)}:p;
const placed=p=>snap?{x:Math.floor(p.x)+.5,y:Math.floor(p.y)+.5}:p;
function hitTest(p,e){
 if(e){const picked=studio.pick(e.clientX,e.clientY,map,visible);if(picked)return picked;}
 if(visible.labels)for(const l of [...map.labels].reverse())if(Math.abs(p.y-l.y)<l.size*.8&&Math.abs(p.x-l.x)<l.text.length*l.size*.3)return{kind:'labels',item:l};
 if(visible.lights&&(tool==='light'||lighting))for(const l of [...map.lights].reverse())if(C.distance(p,l)<.35)return{kind:'lights',item:l};
 if(visible.props)for(const prop of [...map.props].reverse()){const b=C.propBounds(prop,catalog),dx=p.x-prop.x,dy=p.y-prop.y,x=dx*Math.cos(b.rot)+dy*Math.sin(b.rot),y=-dx*Math.sin(b.rot)+dy*Math.cos(b.rot);if(Math.abs(x)<b.w/2+.08&&Math.abs(y)<b.h/2+.08)return{kind:'props',item:prop};}
 if(visible.lights)for(const l of [...map.lights].reverse())if(C.distance(p,l)<.25)return{kind:'lights',item:l};
 if(visible.walls){for(const d of [...map.doors].reverse()){const [a,b]=C.doorBounds(d);if(C.project(p,a,b).distance<.25)return{kind:'doors',item:d};}const wall=C.nearestWall(map,p,.22);if(wall)return{kind:'walls',item:wall.wall};}
 if(visible.rooms)for(const r of [...map.rooms].reverse())if(p.x>r.x&&p.y>r.y&&p.x<r.x+r.w&&p.y<r.y+r.h)return{kind:'rooms',item:r};
 return null;
}
function fit(){studio.fit(map);draw();}
function zoomBy(factor){studio.zoom(factor);draw();}
function draw(){if(raf)return;raf=requestAnimationFrame(()=>{raf=0;paintCanvas();});}
function paintCanvas(){
 studio.update(map,{visible,grid,lighting,tool,settings,drag,hover:hover&&tool==='prop'?bound(placed(hover)):hover,entity:entity()});
 const a=studio.project(0,0),b=studio.project(1,0);view.zoom=Math.hypot(a.x-b.x,a.y-b.y);view.x=a.x;view.y=a.y;
 $('zoom-level').textContent=Math.round(view.zoom/32*100)+'%';
 $('top-view').classList.toggle('active',studio.topDown);$('top-view').setAttribute('aria-pressed',String(studio.topDown));
 $('orbit-view').classList.toggle('active',!studio.topDown);$('orbit-view').setAttribute('aria-pressed',String(!studio.topDown));
}

function updateChrome(){
 $('map-name').value=map.name;$('map-caption').textContent=map.name.toUpperCase();$('map-breadcrumb').textContent=map.name;$('map-size').textContent=map.width+' × '+map.height+' squares';$('dimensions-detail').textContent=map.width+' × '+map.height;
 $('undo').disabled=!history.past.length;$('redo').disabled=!history.future.length;
}
function setTool(value){
 tool=value;drag=null;
 document.querySelectorAll('[data-tool]').forEach(el=>{const on=el.dataset.tool===tool;el.classList.toggle('active',on);el.setAttribute('aria-pressed',String(on));});
 const info=tools.find(t=>t[0]===value);$('active-tool').textContent=info[2];$('tool-hint').textContent=info[4];$('tool-settings-icon').textContent=info[1];canvas.style.cursor=tool==='pan'?'grab':tool==='select'?'default':'crosshair';
 if(value==='prop')setCategory('props');if(value==='floor')setCategory('floors');if(value==='terrain')setCategory('terrain');if(value==='wall')setCategory('walls');
 renderSettings();draw();
}
function setCategory(value){category=value;activeTag='';document.querySelectorAll('[data-category]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.category===value)));renderLibrary();}
function allTags(asset){return[...new Set([...asset.tags,...(map.assetTags[asset.id]||[])])];}
function activeAsset(){return catalog.find(a=>a.id===settings[category==='props'?'prop':category==='floors'?'floor':category==='walls'?'wall':'terrain']);}
function pickAsset(asset){
 settings[asset.category==='props'?'prop':asset.category==='floors'?'floor':asset.category==='walls'?'wall':'terrain']=asset.id;
 setTool({props:'prop',floors:'floor',terrain:'terrain',walls:'wall'}[asset.category]);renderLibrary();renderSettings();draw();
}
function renderLibrary(){
 const search=$('asset-search').value.toLowerCase().trim(),counts=catalog.filter(a=>a.category===category);
 const choices=category==='props'?['All','nature','furniture','storage','lighting','architecture','sacred','camp','workshop']:category==='floors'?['All','stone','wood','natural','water']:category==='terrain'?['All','land','water','vegetation','elevation']:['All','stone','wood'];
 $('tag-filters').replaceChildren(...choices.map(tag=>h('button',{class:(!activeTag&&tag==='All'||activeTag===tag)?'active':'',onclick:()=>{activeTag=tag==='All'?'':tag;renderLibrary();}},tag[0].toUpperCase()+tag.slice(1))));
 const filtered=counts.filter(a=>(!activeTag||allTags(a).includes(activeTag))&&(!favoritesOnly||favorites.has(a.id))&&(!search||search.split(/\s+/).every(term=>(a.name+' '+a.key+' '+allTags(a).join(' ')).toLowerCase().includes(term))));
 $('asset-count').textContent=filtered.length+' '+(category==='props'?'assets':category==='floors'?'materials':category==='terrain'?'terrains':'wall types');
 const active=activeAsset(),cards=filtered.map(asset=>{
  const thumb=h('canvas',{'aria-hidden':'true'}),card=h('button',{class:'asset-card'+(active?.id===asset.id?' active':''),'data-asset':asset.id,title:asset.name+' · '+allTags(asset).join(', '),onclick:()=>pickAsset(asset)},thumb,h('span',{class:'asset-title'},asset.name));
  if(favorites.has(asset.id))card.append(h('span',{class:'favorite-star'},'★'));return{card,thumb,asset};
 });
 $('asset-grid').replaceChildren(...(cards.length?cards.map(v=>v.card):[h('div',{class:'empty-library'},'No assets found. Try another tag or search.')]));
 requestAnimationFrame(()=>cards.forEach(({thumb,asset})=>R.thumbnail(thumb,asset)));
}
const field=(name,input)=>h('label',{},name,input);
const numberField=(value,min,max,step,onchange,aria)=>h('input',{type:'number',value,min,max,step,'aria-label':aria,onchange:e=>{const n=+e.target.value;if(Number.isFinite(n))onchange(C.clamp(n,min,max));}});
function settingsAsset(id,category,key){const select=h('select',{'aria-label':key,onchange:e=>{settings[key]=e.target.value;renderLibrary();draw();}});for(const a of catalog.filter(a=>a.category===category))select.append(h('option',{value:a.id,selected:a.id===id?'':null},a.name));return select;}
function renderSettings(){
 const panel=$('tool-settings'),name=tools.find(t=>t[0]===tool)[2],description=tools.find(t=>t[0]===tool)[4];panel.replaceChildren(h('div',{class:'setting-name'},name),h('p',{class:'setting-description'},description));
 if(['floor','terrain'].includes(tool)){panel.append(field('Material',settingsAsset(settings[tool],tool==='floor'?'floors':'terrain',tool)),field('Brush radius · squares',numberField(settings.brush,.25,6,.25,n=>settings.brush=n,'Brush radius')));}
 if(tool==='room')panel.append(field('Room floor',settingsAsset(settings.floor,'floors','floor')),field('Wall material',settingsAsset(settings.wall,'walls','wall')));
 if(tool==='wall')panel.append(field('Wall material',settingsAsset(settings.wall,'walls','wall')));
 if(tool==='door')panel.append(field('Door width · squares',numberField(settings.doorWidth,.5,4,.5,n=>settings.doorWidth=n,'Door width')));
 if(tool==='prop'){
  const asset=catalog.find(a=>a.id===settings.prop),preview=h('canvas',{'aria-hidden':'true'});panel.append(h('div',{class:'selected-preview'},preview),h('div',{},asset.name),h('div',{class:'asset-tags'},...allTags(asset).map(t=>h('span',{},t))),h('div',{class:'inline-fields'},field('Rotation °',numberField(settings.rotation,-360,360,15,n=>{settings.rotation=n;draw();},'Placement rotation')),field('Scale',numberField(settings.scale,.25,4,.25,n=>{settings.scale=n;draw();},'Placement scale'))));
  panel.append(h('button',{class:'wide',onclick:()=>{if(favorites.has(asset.id))favorites.delete(asset.id);else favorites.add(asset.id);try{localStorage.setItem('hearth.favorites.v1',JSON.stringify([...favorites]));}catch{}renderSettings();renderLibrary();}},favorites.has(asset.id)?'★ Remove favorite':'☆ Add to favorites'));
  const tags=h('input',{value:(map.assetTags[asset.id]||[]).join(', '),placeholder:'e.g. tavern, haunted','aria-label':'Custom asset tags',onchange:e=>commit(()=>{map.assetTags[asset.id]=e.target.value.split(',').map(t=>t.trim().toLowerCase().slice(0,40)).filter(Boolean).slice(0,30);renderLibrary();})});
  panel.append(field('Custom tags · comma separated',tags),h('p',{class:'source-reference'},'Source: zoom-ink-test/'+asset.source));requestAnimationFrame(()=>R.thumbnail(preview,asset));
 }
 if(tool==='light')panel.append(field('Range · squares',numberField(settings.lightRange,.5,20,.5,n=>settings.lightRange=n,'New light range')),field('Color',h('input',{type:'color',value:settings.lightColor,oninput:e=>settings.lightColor=e.target.value,'aria-label':'New light color'})));
 if(tool==='label')panel.append(field('Label text',h('input',{value:settings.label,maxlength:200,'aria-label':'New label text',oninput:e=>settings.label=e.target.value})),field('Text size · squares',numberField(settings.labelSize,.2,2,.1,n=>settings.labelSize=n,'New label size')));
 if(tool==='select')panel.append(field('Base terrain',h('select',{'aria-label':'Base terrain',onchange:e=>commit(()=>map.base=e.target.value)},...catalog.filter(a=>a.category==='terrain').map(a=>h('option',{value:a.id,selected:map.base===a.id?'':null},a.name)))));
}
function renderSelection(){
 const panel=$('selection-panel'),e=entity();$('selection-kind').textContent=e?e.kind.toUpperCase():'NO SELECTION';
 if(!e){panel.replaceChildren(h('div',{class:'empty-selection'},h('div',{class:'selection-symbol'},'⌖'),'Every detail has a story.',h('br'),'Select something on your map to edit it.'));return;}
 const o=e.item,patch=value=>commit(()=>Object.assign(o,value));
 panel.replaceChildren();
 if(e.kind==='props'){const a=catalog.find(a=>a.id===o.asset);panel.append(h('div',{class:'setting-name'},a?.name||o.asset));panel.append(field('Instance tags',h('input',{value:(o.tags||[]).join(', '),'aria-label':'Instance tags',onchange:ev=>patch({tags:ev.target.value.split(',').map(t=>t.trim().slice(0,40)).filter(Boolean).slice(0,30)})})),field('Notes',h('textarea',{'aria-label':'Prop notes',maxlength:3000,onchange:ev=>patch({notes:ev.target.value})},o.notes||'')),h('div',{class:'inline-fields'},field('Rotation °',numberField(o.rotation,-36000,36000,15,n=>patch({rotation:n}),'Selected rotation')),field('Scale',numberField(o.scale,.25,4,.25,n=>patch({scale:n}),'Selected scale'))),field('Vision',h('span',{class:'check-label'},h('input',{type:'checkbox',checked:o.blocksSight,'aria-label':'Block line of sight',onchange:ev=>patch({blocksSight:ev.target.checked})}),'Block line of sight')));}
 if(e.kind==='rooms')panel.append(field('Room name',h('input',{value:o.name,'aria-label':'Room name',onchange:ev=>patch({name:ev.target.value.slice(0,100)})})),h('p',{class:'setting-description'},o.w+' × '+o.h+' squares · '+catalog.find(a=>a.id===o.material)?.name));
 if(e.kind==='walls')panel.append(h('p',{class:'setting-description'},catalog.find(a=>a.id===o.material)?.name+' · '+C.distance(o.a,o.b).toFixed(1)+' squares'));
 if(e.kind==='doors')panel.append(h('p',{class:'setting-description'},o.width+' square door'),h('label',{class:'check-label'},h('input',{type:'checkbox',checked:o.closed,'aria-label':'Door closed',onchange:ev=>patch({closed:ev.target.checked})}),'Closed door'));
 if(e.kind==='lights')panel.append(field('Light range · squares',numberField(o.range,.5,20,.5,n=>patch({range:n}),'Selected light range')),field('Intensity',numberField(o.intensity,0,2,.1,n=>patch({intensity:n}),'Light intensity')),field('Light color',h('input',{type:'color',value:o.color,'aria-label':'Selected light color',onchange:ev=>patch({color:ev.target.value})})));
 if(e.kind==='labels')panel.append(field('Label text',h('input',{value:o.text,maxlength:200,'aria-label':'Selected label text',onchange:ev=>patch({text:ev.target.value})})),field('Text size',numberField(o.size,.2,2,.1,n=>patch({size:n}),'Selected label size')));
 if(['props','lights','labels'].includes(e.kind))panel.append(h('div',{class:'inline-fields'},field('X · squares',numberField(o.x,0,map.width,.5,n=>patch({x:n}),'Selected X')),field('Y · squares',numberField(o.y,0,map.height,.5,n=>patch({y:n}),'Selected Y'))));
 panel.append(h('button',{class:'wide danger',onclick:deleteSelected},'Delete selection'));
}
function renderLayers(){
 $('layers').replaceChildren(...Object.entries(layerNames).map(([key,name])=>{
  const count=key==='terrain'?map.paint.length+1:key==='walls'?map.walls.length+map.doors.length:map[key].length;
  return h('div',{class:'layer-row','data-visible':visible[key]},h('span',{class:'layer-dot'}),h('span',{},name),h('span',{},String(count)),h('button',{'aria-label':(visible[key]?'Hide ':'Show ')+name,'aria-pressed':String(visible[key]),onclick:()=>{visible[key]=!visible[key];renderLayers();draw();}},visible[key]?'◉':'○'));
 }));
}
function deleteSelected(){if(!selected)return;commit(()=>{C.deleteEntity(map,selected);selected=null;});}
function doUndo(){const prev=history.undo(map);if(!prev)return;map=prev;selected=null;changed();renderSelection();renderLibrary();renderSettings();}
function doRedo(){const next=history.redo(map);if(!next)return;map=next;selected=null;changed();renderSelection();renderLibrary();renderSettings();}
function beginPaint(p){history.record(map);const stroke={id:C.uid('paint'),material:settings[tool],radius:settings.brush,points:[bound(p)]};map.paint.push(stroke);drag={type:'paint',stroke};draw();}
canvas.addEventListener('pointerdown',e=>{
 if(e.button!==0&&e.button!==1)return;e.preventDefault();canvas.focus();canvas.setPointerCapture(e.pointerId);
 const p=screenToWorld(e);
 if(tool==='pan'||space||e.button===1){drag={type:'pan',clientX:e.clientX,clientY:e.clientY,x:view.x,y:view.y};canvas.style.cursor='grabbing';return;}
 if(!within(p))return;
 if(tool==='room'||tool==='wall'){drag={type:tool,start:bound(snapped(p)),end:bound(snapped(p))};draw();return;}
 if(tool==='terrain'||tool==='floor'){beginPaint(p);return;}
 if(tool==='select'){
  const hit=hitTest(p,e);selected=hit?.item.id||null;renderSelection();
  if(hit&&['props','lights','labels'].includes(hit.kind))drag={type:'move',id:hit.item.id,kind:hit.kind,start:p,origin:{x:hit.item.x,y:hit.item.y},before:C.clone(map),moved:false};
  draw();return;
 }
 if(tool==='erase'){const hit=hitTest(p,e);if(hit){history.record(map);C.deleteEntity(map,hit.item.id);selected=null;drag={type:'erase'};changed();renderSelection();}return;}
 const pos=bound(placed(p));
 if(tool==='prop')commit(()=>{const prop={id:C.uid('prop'),asset:settings.prop,...pos,rotation:settings.rotation,scale:settings.scale,blocksSight:false,tags:[],notes:''};map.props.push(prop);selected=prop.id;});
 if(tool==='door'){if(!C.nearestWall(map,p)){toast('Place a door on a wall.');return;}const before=C.clone(map),door=C.addDoor(map,p,settings.doorWidth);if(door){history.record(before);selected=door.id;changed();renderSelection();}else toast('This door overlaps another door or does not fit on the wall.');}
 if(tool==='light')commit(()=>{const light={id:C.uid('light'),...pos,range:settings.lightRange,intensity:settings.lightIntensity,color:settings.lightColor};map.lights.push(light);selected=light.id;});
 if(tool==='label')commit(()=>{const label={id:C.uid('label'),...pos,text:settings.label||'Untitled place',size:settings.labelSize};map.labels.push(label);selected=label.id;});
});
canvas.addEventListener('pointermove',e=>{
 const p=screenToWorld(e);hover=p;$('cursor-coords').textContent='X '+p.x.toFixed(1)+'   Y '+p.y.toFixed(1);
 if(drag?.type==='pan'){studio.pan(e.clientX-drag.clientX,e.clientY-drag.clientY);drag.clientX=e.clientX;drag.clientY=e.clientY;draw();return;}
 if(drag?.type==='room'||drag?.type==='wall')drag.end=bound(snapped(p));
 if(drag?.type==='paint'&&within(p)){const pts=drag.stroke.points;if(C.distance(pts.at(-1),p)>.08)pts.push(bound(p));}
 if(drag?.type==='move'){
  const o=map[drag.kind].find(o=>o.id===drag.id);if(o&&C.distance(p,drag.start)>.05){if(!drag.moved){history.record(drag.before);drag.moved=true;}let x=drag.origin.x+p.x-drag.start.x,y=drag.origin.y+p.y-drag.start.y;if(snap){x=Math.round(x*2)/2;y=Math.round(y*2)/2;}o.x=C.clamp(x,0,map.width);o.y=C.clamp(y,0,map.height);}
 }
 if(drag?.type==='erase'){const hit=hitTest(p,e);if(hit)C.deleteEntity(map,hit.item.id);}
 draw();
});
function endDrag(cancel=false){
 if(!drag)return;const d=drag;drag=null;
 if(cancel){if(d.type==='paint'||d.type==='erase'||(d.type==='move'&&d.moved)){map=history.past.pop()||map;changed();}draw();return;}
 if(d.type==='room'&&Math.abs(d.end.x-d.start.x)>=1&&Math.abs(d.end.y-d.start.y)>=1)commit(()=>{const room=C.addRoom(map,d.start,d.end,settings.floor,settings.wall);selected=room.id;});
 if(d.type==='wall'&&C.distance(d.start,d.end)>.1)commit(()=>{const wall={id:C.uid('wall'),a:d.start,b:d.end,material:settings.wall};map.walls.push(wall);selected=wall.id;});
 if(['paint','move','erase'].includes(d.type)){changed();renderSelection();}
 canvas.style.cursor=tool==='pan'?'grab':tool==='select'?'default':'crosshair';draw();
}
canvas.addEventListener('pointerup',()=>endDrag());canvas.addEventListener('pointercancel',()=>endDrag(true));
canvas.addEventListener('lostpointercapture',()=>endDrag());
canvas.addEventListener('pointerleave',()=>{hover=null;$('cursor-coords').textContent='X —   Y —';draw();});
canvas.addEventListener('wheel',e=>{e.preventDefault();const r=canvas.getBoundingClientRect();zoomBy(Math.exp(-e.deltaY*.0015),{x:e.clientX-r.left,y:e.clientY-r.top});},{passive:false});
for(const [id,icon,name,key]of tools)$('tool-buttons').append(h('button',{'data-tool':id,title:name+' ('+key+')','aria-label':name,onclick:()=>setTool(id)},icon));
document.querySelectorAll('[data-category]').forEach(b=>b.addEventListener('click',()=>setCategory(b.dataset.category)));
$('asset-search').addEventListener('input',renderLibrary);
$('favorites-toggle').onclick=()=>{favoritesOnly=!favoritesOnly;$('favorites-toggle').setAttribute('aria-pressed',String(favoritesOnly));renderLibrary();};
$('undo').onclick=doUndo;$('redo').onclick=doRedo;
$('map-name').addEventListener('change',e=>{const name=e.target.value.trim()||'Untitled map';commit(()=>map.name=name);});
$('grid-toggle').onclick=()=>{grid=!grid;$('grid-toggle').classList.toggle('active',grid);$('grid-toggle').setAttribute('aria-pressed',String(grid));draw();};
$('snap-toggle').onclick=()=>{snap=!snap;$('snap-toggle').classList.toggle('active',snap);$('snap-toggle').setAttribute('aria-pressed',String(snap));};
$('lighting-toggle').onclick=()=>{lighting=!lighting;$('lighting-toggle').classList.toggle('active',lighting);$('lighting-toggle').setAttribute('aria-pressed',String(lighting));draw();};
$('top-view').onclick=()=>{studio.setTop(true);draw();};$('orbit-view').onclick=()=>{studio.setTop(false);draw();};
$('fit-map').onclick=fit;$('zoom-in').onclick=()=>zoomBy(1.2);$('zoom-out').onclick=()=>zoomBy(1/1.2);
function download(data,filename,type='application/json'){const blob=data instanceof Blob?data:new Blob([data],{type}),url=URL.createObjectURL(blob),a=h('a',{href:url,download:filename});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
const filename=()=>map.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'hearth-map';
function saveProject(){download(JSON.stringify(map,null,2),filename()+'.hearth');toast('Editable project saved.');}
$('save-project').onclick=saveProject;$('open-project').onclick=()=>$('project-file').click();
$('project-file').onchange=async e=>{
 const file=e.target.files[0];if(!file)return;
 try{if(file.size>30*1024*1024)throw Error('Choose a Hearth project smaller than 30 MB.');const imported=C.validateMap(JSON.parse(await file.text()),catalog);history.record(map);map=imported;selected=null;changed();renderSelection();renderSettings();renderLibrary();fit();toast('Project opened.');}catch(error){toast('Could not open project: '+error.message);}finally{e.target.value='';}
};
$('new-project').onclick=()=>$('new-dialog').showModal();
$('new-form').onsubmit=e=>{e.preventDefault();const data=new FormData(e.target);history.record(map);map=data.get('template')==='chapel'?C.demoMap():C.blankMap(+data.get('width'),+data.get('height'));map.name=String(data.get('title')).trim()||map.name;selected=null;$('new-dialog').close();changed();renderSelection();renderSettings();renderLibrary();fit();toast('Your new canvas is ready.');};
function exportSummary(){const ppg=+$('export-ppg').value;$('export-summary').replaceChildren(h('span',{},map.width*ppg+' × '+map.height*ppg+' px'),h('span',{},C.lineOfSight(map).length+' walls'),h('span',{},map.doors.length+' doors'),h('span',{},map.lights.length+' lights'));}
$('export').onclick=()=>{for(const option of $('export-ppg').options)option.disabled=map.width*map.height*(+option.value)**2>40000000;if($('export-ppg').selectedOptions[0].disabled)$('export-ppg').value='64';exportSummary();$('export-dialog').showModal();};$('export-ppg').onchange=exportSummary;
function exportImage(ppg,withGrid,surfaceOnly=false){if(map.width*map.height*ppg*ppg>40000000)throw Error('This resolution is too large. Choose 64 pixels per square.');if(!surfaceOnly){paintCanvas();return studio.exportMap(ppg,withGrid);}const out=document.createElement('canvas');out.width=map.width*ppg;out.height=map.height*ppg;const c=out.getContext('2d');c.scale(ppg,ppg);R.drawWorld(c,map,{ppg,grid:withGrid,lighting:false,showLights:false,...(surfaceOnly?{visible:{props:false,walls:false,lights:false}}:{})});return out;}
function inkExport(ppg=64,withGrid=false,image=null){return C.toInkUVTT(map,image||exportImage(ppg,withGrid).toDataURL('image/png').split(',')[1],ppg,catalog,withGrid,{pixelsPerGrid:32,png:exportImage(32,false,true).toDataURL('image/png').split(',')[1]});}
$('download-export').onclick=async()=>{
 const button=$('download-export');button.disabled=true;button.textContent='Preparing your map…';
 try{
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  const ppg=+$('export-ppg').value,withGrid=$('export-grid').checked,out=exportImage(ppg,withGrid);
  if($('export-format').value==='png'){const blob=await new Promise(resolve=>out.toBlob(resolve,'image/png'));if(!blob)throw Error('The browser could not create this image. Try 64 pixels per square.');download(blob,filename()+'.png','image/png');}
  else{const image=out.toDataURL('image/png').split(',')[1],data=$('export-format').value==='ink'?inkExport(ppg,withGrid,image):C.toUVTT(map,image,ppg,catalog,withGrid);download(JSON.stringify(data),filename()+'.dd2vtt');}
  $('export-dialog').close();toast('Your map is ready for its next adventure.');
 }catch(e){toast('Export failed: '+e.message);}
 finally{button.disabled=false;button.textContent='Download map ↗';}
};
function showHelp(){const counts=HEARTH_CATALOG.counts;$('catalog-description').replaceChildren(h('strong',{},'Your Ink Atlas collection'),h('p',{},counts.props+' props · '+counts.floors+' floors · '+counts.terrain+' terrains · '+counts.walls+' wall types. Source references and inferred tags are saved in docs/asset-inventory.json. Custom tags are saved with each Hearth project. These are new 2D representations of the source project’s procedural assets.'),h('a',{href:'https://arkenforge.com/universal-vtt-files/',target:'_blank',rel:'noreferrer'},'Universal VTT format reference ↗'));$('help-dialog').showModal();}
$('help').onclick=showHelp;$('catalog-info').onclick=showHelp;
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
window.addEventListener('keydown',e=>{
 if(document.querySelector('dialog[open]'))return;
 const editing=['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName);
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();saveProject();return;}
 if(editing)return;
 if(e.code==='Space'){e.preventDefault();space=true;canvas.style.cursor='grab';return;}
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?doRedo():doUndo();return;}
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();doRedo();return;}
 if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();deleteSelected();return;}
 if(e.key==='Escape'){endDrag(true);selected=null;renderSelection();draw();return;}
 if(e.key.toLowerCase()==='r'){
  const delta=e.shiftKey?-15:15,e2=entity();if(e2?.kind==='props')commit(()=>e2.item.rotation=(e2.item.rotation+delta)%360);
  settings.rotation=(settings.rotation+delta)%360;renderSettings();draw();return;
 }
 if(e.key==='Tab'){e.preventDefault();studio.setTop(!studio.topDown);draw();return;}if(e.key.toLowerCase()==='f'){fit();return;}if(e.key==='/'){e.preventDefault();$('asset-search').focus();return;}
 if(e.key==='?'){showHelp();return;}if(e.key==='['||e.key===']'){settings.brush=C.clamp(settings.brush+(e.key==='['?-.25:.25),.25,6);renderSettings();draw();return;}
 const info=tools.find(t=>t[3].toLowerCase()===e.key.toLowerCase());if(info&&!e.ctrlKey&&!e.metaKey)setTool(info[0]);
});
window.addEventListener('keyup',e=>{if(e.code==='Space'){space=false;canvas.style.cursor=tool==='pan'?'grab':tool==='select'?'default':'crosshair';}});
window.addEventListener('blur',()=>{space=false;endDrag();});
new ResizeObserver(()=>{if(!drag)fit();}).observe(wrap);
window.addEventListener('beforeunload',()=>{try{localStorage.setItem('hearth.project.v1',JSON.stringify(map));}catch{}});
updateChrome();renderLibrary();renderSelection();renderLayers();setTool('select');fit();R.ready?.then(()=>{renderLibrary();renderSettings();draw();});
window.Hearth={studio,project:(x,y)=>studio.project(x,y),get map(){return map;},get view(){return view;},get tool(){return tool;},get settings(){return settings;},get selected(){return selected;},get visible(){return visible;},catalog,history,setTool,fit,draw,hitTest,exportImage,exportInk:inkExport,exportUVTT:(ppg=64)=>C.toUVTT(map,exportImage(ppg,false).toDataURL().split(',')[1],ppg,catalog),loadProject:raw=>{history.record(map);map=C.validateMap(raw,catalog);selected=null;changed();renderSelection();renderLibrary();renderSettings();fit();},select:id=>{selected=id;renderSelection();draw();}};
})();
