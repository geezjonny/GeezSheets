/* Pure map and Universal VTT geometry. Grid squares are the source of truth. */
(() => {
'use strict';
const clone = value => JSON.parse(JSON.stringify(value));
let serial = 0;
const uid = prefix => prefix + '-' + Date.now().toString(36) + '-' + (++serial).toString(36);
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function project(p,a,b) { const dx=b.x-a.x,dy=b.y-a.y,l2=dx*dx+dy*dy;const t=l2?clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/l2,0,1):0;const point={x:a.x+t*dx,y:a.y+t*dy};return {point,t,distance:distance(p,point)}; }
function blankMap(width=32,height=24,name='An Untold Adventure') {
 return {version:1,name,width,height,base:'terrain-grass',rooms:[],walls:[],doors:[],props:[],lights:[],labels:[],paint:[],assetTags:{}};
}
function addRoom(map,a,b,material='floor-flagstone',wallMaterial='wall-stone') {
 const x=Math.min(a.x,b.x),y=Math.min(a.y,b.y),w=Math.abs(b.x-a.x),h=Math.abs(b.y-a.y);
 if(w<1||h<1)return null;
 const room={id:uid('room'),x,y,w,h,material,name:'Room '+(map.rooms.length+1)};map.rooms.push(room);
 const ps=[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}];
 for(let i=0;i<4;i++)map.walls.push({id:uid('wall'),a:ps[i],b:ps[(i+1)%4],material:wallMaterial,roomId:room.id});
 return room;
}
function nearestWall(map,p,max=.65) {
 let best=null;
 for(const wall of map.walls){const hit=project(p,wall.a,wall.b);if(hit.distance<max){max=hit.distance;best={wall,...hit};}}
 return best;
}
function addDoor(map,p,width=1) {
 const hit=nearestWall(map,p);
 if(!hit)return null;
 const {wall}=hit,length=distance(wall.a,wall.b);
 if(length<width)return null;
 const t=clamp(hit.t,width/2/length,1-width/2/length),ux=(wall.b.x-wall.a.x)/length,uy=(wall.b.y-wall.a.y)/length;
 const center={x:wall.a.x+ux*length*t,y:wall.a.y+uy*length*t};
 if(map.doors.some(d=>distance(d,center)<(d.width+width)/2-.02))return null;
 const door={id:uid('door'),x:center.x,y:center.y,rotation:Math.atan2(uy,ux),width,closed:true};map.doors.push(door);return door;
}
function doorBounds(d){const dx=Math.cos(d.rotation)*d.width/2,dy=Math.sin(d.rotation)*d.width/2;return[{x:d.x-dx,y:d.y-dy},{x:d.x+dx,y:d.y+dy}];}
function lineOfSight(map) {
 const paths=[];
 for(const w of map.walls){
  const length=distance(w.a,w.b);if(length<.001)continue;
  const gaps=[];
  for(const d of map.doors){
   const mid=project(d,w.a,w.b);
   const ux=(w.b.x-w.a.x)/length,uy=(w.b.y-w.a.y)/length;
   if(mid.distance>.05||Math.abs(ux*Math.cos(d.rotation)+uy*Math.sin(d.rotation))<.999)continue;
   gaps.push([clamp(mid.t-d.width/2/length,0,1),clamp(mid.t+d.width/2/length,0,1)]);
  }
  gaps.sort((a,b)=>a[0]-b[0]);let from=0;
  const p=t=>({x:w.a.x+(w.b.x-w.a.x)*t,y:w.a.y+(w.b.y-w.a.y)*t});
  for(const [start,end]of gaps){if(start>from+.00001)paths.push([p(from),p(start)]);from=Math.max(from,end);}
  if(from<1-.00001)paths.push([p(from),p(1)]);
 }
 const seen=new Set();
 return paths.filter(line=>{const ps=line.map(p=>p.x.toFixed(5)+','+p.y.toFixed(5)).sort(),key=ps.join('|');if(seen.has(key))return false;seen.add(key);return true;});
}
function propBounds(p,catalog){const asset=catalog.find(a=>a.id===p.asset),w=(asset?.size?.[0]||1)*(p.scale||1),h=(asset?.size?.[1]||1)*(p.scale||1),rot=(p.rotation||0)*Math.PI/180;return{w,h,rot,points:[[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]].map(([x,y])=>({x:p.x+x*Math.cos(rot)-y*Math.sin(rot),y:p.y+x*Math.sin(rot)+y*Math.cos(rot)}))};}
function toUVTT(map,image,ppg,catalog=[],grid=false) {
 if(!Number.isInteger(ppg)||ppg<16||ppg>300)throw Error('Pixels per grid must be between 16 and 300.');
 if(typeof image!=='string'||!image.startsWith('iVBOR'))throw Error('Export requires a base64 PNG image without its data URL prefix.');
 return {format:.3,resolution:{map_origin:{x:0,y:0},map_size:{x:map.width,y:map.height},pixels_per_grid:ppg},
 line_of_sight:lineOfSight(map),
 objects_line_of_sight:map.props.filter(p=>p.blocksSight).map(p=>{const points=propBounds(p,catalog).points.map(q=>({x:clamp(q.x,0,map.width),y:clamp(q.y,0,map.height)}));return[...points,points[0]];}),
 portals:map.doors.map(d=>({position:{x:d.x,y:d.y},bounds:doorBounds(d),rotation:d.rotation,closed:d.closed,freestanding:false})),
 lights:map.lights.map(l=>({position:{x:l.x,y:l.y},range:l.range,intensity:l.intensity,color:'ff'+l.color.replace('#',''),shadows:true})),
 environment:{baked_lighting:false,ambient_light:'ffffffff'},image,
 software:'Hearth DD2VTT Creator',creator:'Hearth',
 hearth:{version:1,name:map.name,grid,assets:map.props.map(p=>({asset:p.asset,position:{x:p.x,y:p.y},rotation:p.rotation,scale:p.scale,tags:[...new Set([...(catalog.find(a=>a.id===p.asset)?.tags||[]),...(map.assetTags[p.asset]||[]),...(p.tags||[])])]}))}};
}
function deleteEntity(map,id) {
 const wasWall=map.walls.find(w=>w.id===id);
 for(const key of ['rooms','walls','doors','props','lights','labels'])map[key]=map[key].filter(o=>o.id!==id);
 map.walls=map.walls.filter(w=>w.roomId!==id);
 if(wasWall)map.doors=map.doors.filter(d=>project(d,wasWall.a,wasWall.b).distance>.05||nearestWall(map,d,.06));
 else map.doors=map.doors.filter(d=>nearestWall(map,d,.06));
}
function validateMap(raw,catalog=[]) {
 if(!raw||raw.version!==1)throw Error('This file is not a supported Hearth project.');
 const num=(v,min,max,label)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw Error('Invalid '+label);return v;};
 const text=(s,max=300)=>String(s??'').slice(0,max);
 const width=num(raw.width,8,80,'width'),height=num(raw.height,8,80,'height');
 if(!Number.isInteger(width)||!Number.isInteger(height))throw Error('Map dimensions must be whole squares.');
 const map=blankMap(width,height,text(raw.name,100)||'Untitled map');
 const assetIds=new Set(catalog.map(a=>a.id));
 const asset=(id,category)=>{if(!assetIds.has(id)||catalog.find(a=>a.id===id)?.category!==category)throw Error('Unknown '+category+' asset: '+id);return id;};
 map.base=asset(raw.base,'terrain');
 const point=p=>({x:num(p?.x,0,width,'X coordinate'),y:num(p?.y,0,height,'Y coordinate')});
 const ids=new Set();const id=o=>{const value=text(o.id,100);if(!value||ids.has(value))throw Error('Missing or duplicate object ID.');ids.add(value);return value;};
 for(const key of ['rooms','walls','doors','props','lights','labels','paint']){
  if(!Array.isArray(raw[key])||raw[key].length>20000)throw Error('Invalid '+key+' collection.');
  map[key]=raw[key].map(o=>{
   if(key==='paint'){const r=num(o.radius,.1,12,'brush radius');if(!Array.isArray(o.points)||o.points.length>10000)throw Error('Invalid brush stroke.');if(!assetIds.has(o.material)||!['terrain','floors'].includes(catalog.find(a=>a.id===o.material)?.category))throw Error('Invalid brush material.');return{id:id(o),material:o.material,radius:r,points:o.points.map(point)};}
   if(key==='walls')return{id:id(o),a:point(o.a),b:point(o.b),material:asset(o.material,'walls'),...(o.roomId?{roomId:text(o.roomId,100)}:{})};
   const base={id:id(o),...point(o)};
   if(key==='rooms'){const w=num(o.w,1,width,'room width'),h=num(o.h,1,height,'room height');if(o.x+w>width||o.y+h>height)throw Error('Room outside map bounds.');return{...base,w,h,material:asset(o.material,'floors'),name:text(o.name,100)};}
   if(key==='doors'){const d={...base,width:num(o.width,.25,4,'door width'),rotation:num(o.rotation,-Math.PI*2,Math.PI*2,'door rotation'),closed:!!o.closed};if(doorBounds(d).some(p=>p.x<-.001||p.y<-.001||p.x>width+.001||p.y>height+.001))throw Error('Door outside map bounds.');return d;}
   if(key==='props')return{...base,asset:asset(o.asset,'props'),rotation:num(o.rotation??0,-36000,36000,'prop rotation'),scale:num(o.scale??1,.25,4,'prop scale'),blocksSight:!!o.blocksSight,tags:Array.isArray(o.tags)?o.tags.slice(0,30).map(t=>text(t,40)):[],notes:text(o.notes,3000)};
   if(key==='lights'){if(!/^#[\da-f]{6}$/i.test(o.color))throw Error('Invalid light color.');return{...base,range:num(o.range,.5,20,'light range'),intensity:num(o.intensity,0,2,'light intensity'),color:o.color};}
   return{...base,text:text(o.text,200),size:num(o.size,.2,2,'label size')};
  });
 }
 if(raw.assetTags&&typeof raw.assetTags==='object')for(const [key,tags]of Object.entries(raw.assetTags))if(assetIds.has(key)&&Array.isArray(tags))map.assetTags[key]=tags.slice(0,30).map(t=>text(t,40));
 return map;
}
function demoMap(){
 const m=blankMap(32,24,'The Old Wayside Chapel');m.base='terrain-forest';
 const room=(a,b,mat,name)=>{const r=addRoom(m,{x:a[0],y:a[1]},{x:b[0],y:b[1]},mat);r.name=name;return r;};
 room([10,6],[20,17],'floor-flagstone','The nave');
 room([12,3],[18,6],'floor-cobble','Old sanctuary');
 room([20,10],[25,16],'floor-wood-floor','The vestry');
 addDoor(m,{x:15,y:17},2);addDoor(m,{x:15,y:6},2);addDoor(m,{x:20,y:13},1);
 m.paint.push({id:uid('paint'),material:'terrain-grass',radius:3,points:[{x:7,y:8},{x:8,y:15},{x:12,y:19},{x:23,y:18},{x:26,y:11},{x:21,y:5}]},{id:uid('paint'),material:'floor-dirt',radius:1.2,points:[{x:14,y:24},{x:14.3,y:22},{x:15,y:20},{x:15,y:17}]});
 const prop=(asset,x,y,rotation=0,scale=1)=>m.props.push({id:uid('prop'),asset:'prop-'+asset,x,y,rotation,scale,blocksSight:false,tags:[],notes:''});
 prop('altar',15,4.3,0,1.7);prop('statue',12.9,4.2,0,.8);prop('statue',17.1,4.2,0,.8);
 for(const y of [8.5,10.6,12.7]){prop('bench',12.2,y,0,1.6);prop('bench',17.8,y,0,1.6);}
 prop('carpet',15,8,0,1.5);prop('bookshelf',23,10.65,0,1.4);prop('table',23.4,13,0,1.3);prop('chair',23.4,14.4,180);prop('chest',21.2,15.2);prop('barrel',24,15.1);prop('barrel',24,14.1,.0,.85);
 prop('crate',21.3,11.1);prop('crate',22.1,11.3,15,.8);
 const trees=[[3,3,1.5],[6,2,1.3],[9,1,1.1],[23,2,1.6],[28,4,1.7],[29,8,1.3],[3,10,1.6],[4,15,1.3],[6,20,1.7],[3,22,1.1],[24,21,1.6],[28,18,1.5],[30,22,1.4],[30,12,1],[9,22,1.1],[19,22,1]];
 trees.forEach(([x,y,s],i)=>prop(i%3===0?'pine':'oak',x,y,i*38,s));
 [[7,5],[7,13],[9,18],[21,6],[27,15],[21,20],[2,18],[27,22],[11,21]].forEach(([x,y],i)=>prop('bush',x,y,i*43,1.3));
 [[8,9],[7,17],[22,4],[26,19],[19,20],[4,7]].forEach(([x,y],i)=>prop('rock',x,y,i*60,1.2));
 prop('stump',7,22);prop('dead-tree',27,10,10,1.4);prop('wall-torch',10.4,15.7,90);prop('wall-torch',19.6,15.7,-90);
 [[10.7,15.5],[19.3,15.5],[15,4.8],[23,13]].forEach(([x,y])=>m.lights.push({id:uid('light'),x,y,range:4,intensity:.8,color:'#ffb45e'}));
 m.labels.push({id:uid('label'),x:15,y:19.8,text:'THE WAYSIDE CHAPEL',size:.36});
 return m;
}
class History {
 constructor(limit=80){this.limit=limit;this.past=[];this.future=[];}
 record(map){this.past.push(clone(map));if(this.past.length>this.limit)this.past.shift();this.future=[];}
 undo(map){if(!this.past.length)return null;this.future.push(clone(map));return this.past.pop();}
 redo(map){if(!this.future.length)return null;this.past.push(clone(map));return this.future.pop();}
}
// This contract is also shipped to Ink VTT. Unknown assets fail before export;
// they must never silently become unrelated props in the destination.
const INK_KEYS={
 object:'barrel crate table chair bench bed chest bookshelf torch wall-torch brazier campfire tree bush rock boulder statue altar well cart tent stairs-up stairs-down trapdoor pine ladder carpet'.split(' '),
 furniture:'shelf counter hearth forge anvil workbench rack hay'.split(' '),
 vegetation:'oak reeds dead-tree stump dry-bush'.split(' '),
 floors:'flagstone cobble dirt wood-floor rock-floor sand grass mud shallow-water deep-water'.split(' '),
 terrain:'deep-sea shallows beach grass forest hills mountains snowy-peaks marsh dry-plain'.split(' '),
 walls:'stone timber palisade'.split(' ')
};
function inkNative(asset){
 if(!asset)throw Error('Missing Ink asset definition.');
 const category=asset.category,key=asset.key;
 const kind=category==='props'?['object','furniture','vegetation'].find(k=>INK_KEYS[k].includes(key)):category;
 if(!kind||!INK_KEYS[kind]?.includes(key)||asset.id!==(category==='props'?'prop-':category==='floors'?'floor-':category==='walls'?'wall-':'terrain-')+key)throw Error('Ink VTT does not support this asset: '+asset.id);
 return{kind,key};
}
function validateInkExtension(raw,width,height){
 if(raw?.version!==2||raw.units!=='grid-squares'||raw.feetPerSquare!==5)throw Error('Unsupported Hearth/Ink map version. Update both the creator and Ink VTT.');
 if(!Array.isArray(raw.catalog)||raw.catalog.length>256)throw Error('Invalid Ink asset manifest.');
 const ids=new Set(),short=(s,n=160)=>String(s??'').slice(0,n),tags=v=>Array.isArray(v)?v.slice(0,30).map(t=>short(t,40)):[];
 const catalog=raw.catalog.map(a=>{
  inkNative(a);if(ids.has(a.id))throw Error('Duplicate Ink asset definition.');ids.add(a.id);
  if(!/^#[\da-f]{6}$/i.test(a.color))throw Error('Invalid Ink asset color.');
  const out={id:a.id,key:a.key,category:a.category,name:short(a.name),color:a.color,tags:tags(a.tags),source:short(a.source),blocksMovement:!!a.blocksMovement};
  if(a.category==='props'){if(!Array.isArray(a.size)||a.size.length!==2||a.size.some(v=>!Number.isFinite(v)||v<.1||v>10))throw Error('Invalid Ink prop footprint.');out.size=[...a.size];}
  return out;
 });
 const map=validateMap(raw.map,catalog);
 if(map.width!==width||map.height!==height)throw Error('Ink map dimensions disagree with the DD2VTT grid.');
 if(map.lights.length>256||map.doors.length>2000||map.walls.length>20000)throw Error('Ink supports up to 256 lights, 2,000 doors, and 20,000 wall segments per map.');
 if(map.walls.some(w=>distance(w.a,w.b)<.001))throw Error('Remove zero-length walls before exporting to Ink.');
 const surface=raw.surface;
 if(!surface||!Number.isInteger(surface.pixelsPerGrid)||surface.pixelsPerGrid<16||surface.pixelsPerGrid>32||typeof surface.png!=='string'||surface.png.length>8*1024*1024||!/^iVBORw0KGgo[\da-z+/]*={0,2}$/i.test(surface.png))throw Error('Missing or invalid Ink floor artwork.');
 let bytes;try{bytes=atob(surface.png.slice(0,44));}catch{throw Error('Invalid Ink floor PNG.');}
 const u32=i=>((bytes.charCodeAt(i)*16777216)+(bytes.charCodeAt(i+1)<<16)+(bytes.charCodeAt(i+2)<<8)+bytes.charCodeAt(i+3));
 if(bytes.slice(12,16)!=='IHDR'||u32(16)!==width*surface.pixelsPerGrid||u32(20)!==height*surface.pixelsPerGrid)throw Error('Ink floor artwork dimensions do not match the map.');
 return{version:2,units:'grid-squares',feetPerSquare:5,map,catalog,surface:{pixelsPerGrid:surface.pixelsPerGrid,png:surface.png}};
}
function toInkUVTT(map,image,ppg,catalog,grid,surface){
 const out=toUVTT(map,image,ppg,catalog,grid);
 if([...out.line_of_sight,...out.objects_line_of_sight].reduce((n,p)=>n+Math.max(0,p.length-1),0)>20000)throw Error('This map exceeds Ink\'s 20,000 wall/blocker segment limit.');
 const needed=new Set([map.base,...map.rooms.map(r=>r.material),...map.walls.map(w=>w.material),...map.props.map(p=>p.asset),...map.paint.map(p=>p.material)]);
 out.hearth=validateInkExtension({version:2,units:'grid-squares',feetPerSquare:5,map,catalog:catalog.filter(a=>needed.has(a.id)),surface},map.width,map.height);
 return out;
}
globalThis.HearthCore={clone,uid,clamp,distance,project,blankMap,addRoom,addDoor,nearestWall,doorBounds,lineOfSight,propBounds,toUVTT,toInkUVTT,inkNative,validateInkExtension,deleteEntity,validateMap,demoMap,History};
})();
