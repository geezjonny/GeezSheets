import './hearth-core.js';
// The standard top-level image remains skipped. Creator maps explicitly carry a
// separate ground-only texture and a validated, versioned editable scene.
const FIELDS=new Set(['format','resolution','line_of_sight','objects_line_of_sight','portals','lights','hearth']);
export function readStructure(text){
 if(typeof text!=='string'||text.length>110*1024*1024)throw Error('Choose a dd2vtt file smaller than 100 MB.');
 let i=text.charCodeAt(0)===0xfeff?1:0;
 const ws=()=>{while(/\s/.test(text[i]||'x'))i++;};
 function stringEnd(start){let p=start+1;for(;;){p=text.indexOf('"',p);if(p<0)throw Error('Unterminated JSON string.');let n=0,j=p-1;while(text[j--]==='\\')n++;if(n%2===0)return p+1;p++;}}
 function valueEnd(start){
  if(text[start]==='"')return stringEnd(start);
  if(text[start]==='['||text[start]==='{'){
   const stack=[text[start]];let p=start+1;
   while(stack.length){const c=text[p];if(c===undefined)throw Error('Incomplete dd2vtt JSON.');if(c==='"'){p=stringEnd(p);continue;}if(c==='['||c==='{')stack.push(c);if(c===']'||c==='}'){if(stack.pop()!==(c===']'?'[':'{'))throw Error('Malformed dd2vtt JSON.');}if(stack.length>128)throw Error('Map data is nested too deeply.');p++;}return p;
  }
  let p=start;while(p<text.length&&text[p]!==','&&text[p]!=='}')p++;
  if(!/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)$/.test(text.slice(start,p).trim()))throw Error('Invalid JSON value.');return p;
 }
 ws();if(text[i++]!=='{')throw Error('A dd2vtt file must contain a JSON object.');const out={};ws();
 while(text[i]!=='}'){
  if(text[i]!=='"')throw Error('Malformed dd2vtt JSON.');let end=stringEnd(i);const key=JSON.parse(text.slice(i,end));i=end;ws();if(text[i++]!==':')throw Error('Malformed dd2vtt field.');ws();end=valueEnd(i);
  if(FIELDS.has(key)){if(Object.hasOwn(out,key))throw Error('Duplicate '+key+' field.');out[key]=JSON.parse(text.slice(i,end));}
  i=end;ws();if(text[i]===','){i++;ws();if(text[i]==='}')throw Error('Unexpected trailing comma.');}else if(text[i]!=='}')throw Error('Malformed dd2vtt JSON.');
 }
 i++;ws();if(i!==text.length)throw Error('Unexpected text after map data.');return out;
}
const number=(v,label,min=-1e5,max=1e5)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw Error('Invalid '+label+'.');return v;};
export function lightColor(value){
 const s=String(value??'ffffffff').replace(/^#/,'');if(!/^(?:[\da-f]{6}|[\da-f]{8})$/i.test(s))throw Error('Invalid light color.');
 return{color:'#'+s.slice(-6),alpha:s.length===8?parseInt(s.slice(0,2),16)/255:1};
}
export function normalizeDD2VTT(j){
 const r=j?.resolution;if(!r?.map_size)throw Error('This is not a dd2vtt/Universal VTT file (missing resolution).');
 const w=number(r.map_size.x,'map width',.1,512),h=number(r.map_size.y,'map height',.1,512),o=r.map_origin||{x:0,y:0};
 number(o.x,'map origin X');number(o.y,'map origin Y');
 const point=p=>{if(!p)throw Error('Missing map point.');const x=number(p.x,'point X')-o.x,y=number(p.y,'point Y')-o.y;if(x<-.05||y<-.05||x>w+.05||y>h+.05)throw Error('Map geometry lies outside its resolution bounds.');return{x,y};};
 const walls=[];
 for(const field of ['line_of_sight','objects_line_of_sight']){
  const lines=j[field]||[];if(!Array.isArray(lines)||lines.length>20000)throw Error('Too many wall paths.');
  for(const line of lines){if(!Array.isArray(line)||line.length>20001)throw Error('Invalid wall path.');let a=null;for(const raw of line){const b=point(raw);if(a&&Math.hypot(a.x-b.x,a.y-b.y)>.0001)walls.push({a,b});a=b;if(walls.length>20000)throw Error('This map has more than 20,000 wall segments.');}}
 }
 if(!Array.isArray(j.portals||[])||(j.portals||[]).length>2000)throw Error('Too many doors.');
 const doors=(j.portals||[]).map((p,i)=>{if(!Array.isArray(p.bounds)||p.bounds.length!==2)throw Error('Door '+(i+1)+' has no valid endpoints.');const a=point(p.bounds[0]),b=point(p.bounds[1]);if(Math.hypot(a.x-b.x,a.y-b.y)<.01)throw Error('Door '+(i+1)+' has zero length.');return{id:'door_'+i,a,b,closed:p.closed!==false,freestanding:!!p.freestanding};});
 if(!Array.isArray(j.lights||[])||(j.lights||[]).length>256)throw Error('This map has more than 256 lights.');
 const lights=(j.lights||[]).map((l,i)=>({id:'light_'+i,position:point(l.position),range:number(l.range??5,'light range',0,512),intensity:number(l.intensity??1,'light intensity',0,20),...lightColor(l.color),shadows:l.shadows!==false}));
 let hearth=null;
 if(j.hearth?.version!==undefined&&j.hearth.version!==1)hearth=globalThis.HearthCore.validateInkExtension(j.hearth,w,h);
 if(!hearth&&!walls.length&&!doors.length&&!lights.length)throw Error('This file has no walls, doors, or lights to import.');
 // Rich props are rebuilt as props, never as little stone LOS walls.
 return{version:1,w,h,walls:hearth?hearth.map.walls.map(v=>({a:v.a,b:v.b,material:v.material})):walls,doors,lights,pixelsPerGrid:number(r.pixels_per_grid??70,'pixels per grid',1,8192),...(hearth?{hearth}:{})};
}
export const parseDD2VTT=text=>normalizeDD2VTT(readStructure(text));

// Portal openings take precedence over a coincident LOS wall, including long walls.
export function wallPieces(walls,doors){
 const out=[];
 for(const wall of walls){const{a,b}=wall;const dx=b.x-a.x,dy=b.y-a.y,len2=dx*dx+dy*dy,len=Math.sqrt(len2);let spans=[[0,1]];
  for(const d of doors){
   if(Math.abs((d.a.x-a.x)*dy-(d.a.y-a.y)*dx)/len>.035||Math.abs((d.b.x-a.x)*dy-(d.b.y-a.y)*dx)/len>.035)continue;
   const t0=((d.a.x-a.x)*dx+(d.a.y-a.y)*dy)/len2,t1=((d.b.x-a.x)*dx+(d.b.y-a.y)*dy)/len2,lo=Math.max(0,Math.min(t0,t1)),hi=Math.min(1,Math.max(t0,t1));if(hi<=lo)continue;
   spans=spans.flatMap(([u,v])=>hi<=u||lo>=v?[[u,v]]:[[u,Math.max(u,lo)],[Math.min(v,hi),v]].filter(([x,y])=>y-x>1e-6));
  }
  for(const [u,v]of spans)out.push({...wall,a:{x:a.x+dx*u,y:a.y+dy*u},b:{x:a.x+dx*v,y:a.y+dy*v}});
 }return out;
}
export function rotatePoint(p,w,h,rot){switch(((rot%4)+4)%4){case 1:return{x:h-p.y,y:p.x};case 2:return{x:w-p.x,y:h-p.y};case 3:return{x:p.y,y:w-p.x};default:return{x:p.x,y:p.y};}}
export function pointSegment(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-a.x-dx*t,p.y-a.y-dy*t);}
export function segmentsTouch(a,b,c,d){
 const cross=(p,q,r)=>(q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);
 const ab1=cross(a,b,c),ab2=cross(a,b,d),cd1=cross(c,d,a),cd2=cross(c,d,b);
 if(ab1*ab2<0&&cd1*cd2<0)return true;
 return Math.min(pointSegment(a,c,d),pointSegment(b,c,d),pointSegment(c,a,b),pointSegment(d,a,b))<.08;
}
