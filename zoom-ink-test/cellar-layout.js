import * as THREE from 'three';
import {Detail,TILE,decodeTile,squareAt,SQ} from './detail.js';
const copy=x=>JSON.parse(JSON.stringify(x));
export function cellarBounds(map,w=map.w,h=map.h){const[cx,cz]=squareAt(0,0),origin=map.origin||{sx:cx-Math.floor(map.w/2),sz:cz-Math.floor(map.h/2)};return{sx:origin.sx,sz:origin.sz,w,h,right:origin.sx+w,bottom:origin.sz+h};}
const inside=(b,x,z)=>x>=b.sx&&x<b.right&&z>=b.sz&&z<b.bottom;
export function resizePreview(map,width,height,tokens=[]){
 const w=Number(width),h=Number(height);if(!Number.isInteger(w)||!Number.isInteger(h)||w<6||h<6||w>120||h>120)return{ok:false,message:'Use whole dimensions from 6 to 120 squares.'};
 const b=cellarBounds(map,w,h),blocked={props:0,stairs:0,tokens:0,imports:0},stairs=new Set();
 for(const[key,tile]of Object.entries(map.detail)){const[level,ti,tj]=key.split(',').map(Number);if(level!==0)continue;for(const o of tile.objects||[]){const sx=ti*TILE+o.i,sz=tj*TILE+o.j;if(!inside(b,sx,sz)){if(['stairs-up','stairs-down','ladder'].includes(o.k))stairs.add(sx+','+sz);else blocked.props++;}}}
 for(const e of map.exits||[])if(!inside(b,e.sx,e.sz))stairs.add(e.sx+','+e.sz);
 if(!inside(b,map.entry.sx,map.entry.sz))stairs.add(map.entry.sx+','+map.entry.sz);blocked.stairs=stairs.size;
 for(const t of tokens)if(t.space===map.id&&!inside(b,Math.round(t.sx),Math.round(t.sz)))blocked.tokens++;
 for(const s of map.imports||[]){const x=(s.x+20480)/SQ,z=(s.z+20480)/SQ,iw=s.rot%2?s.h:s.w,ih=s.rot%2?s.w:s.h;if(x<b.sx-.001||z<b.sz-.001||x+iw>b.right+.001||z+ih>b.bottom+.001)blocked.imports++;}
 const blockedText=Object.entries(blocked).filter(([,n])=>n).map(([k,n])=>`${n} ${k}`).join(', '),shrinking=w<map.w||h<map.h;
 return{ok:!blockedText,w,h,bounds:b,blocked,message:blockedText?'Move these inside the proposed bounds first: '+blockedText+'.':`${w*5} × ${h*5} feet. Northwest corner stays fixed. ${w===map.w&&h===map.h?'No size change.':shrinking?'Floors and walls outside the new bounds will be trimmed.':'New space gets a flagstone floor.'} Props, stairs, tokens, and imports stay in place.`};
}
export function resizeCellar(map,width,height,tokens=[]){
 const preview=resizePreview(map,width,height,tokens);if(!preview.ok)throw Error(preview.message);
 const out=copy(map),old=cellarBounds(map),next=preview.bounds;out.origin={sx:old.sx,sz:old.sz};if(next.w===map.w&&next.h===map.h)return out;
 const draft=new Detail({data:out,latticeHeight:()=>0},new THREE.Scene());
 // Remove old east/south shell edges when those sides move. Imported geometry
 // remains authored geometry; resizing its floor never scales its walls or doors.
 if(!(map.imports||[]).length){if(next.w!==old.w)for(let z=old.sz;z<old.bottom;z++)draft.setSquare(0,old.right,z,{wallW:0});if(next.h!==old.h)for(let x=old.sx;x<old.right;x++)draft.setSquare(0,x,old.bottom,{wallN:0});}
 for(const[key,tile]of Object.entries(copy(out.detail))){const[level,ti,tj]=key.split(',').map(Number);if(level!==0)continue;const t=decodeTile(tile);for(let j=0;j<TILE;j++)for(let i=0;i<TILE;i++){
  const sx=ti*TILE+i,sz=tj*TILE+j,k=j*TILE+i,patch={};if(!inside(next,sx,sz)){if(t.ground[k])patch.ground=0;}
  if(t.wallN[k]&&!(sx>=next.sx&&sx<next.right&&sz>=next.sz&&sz<=next.bottom))patch.wallN=0;
  if(t.wallW[k]&&!(sx>=next.sx&&sx<=next.right&&sz>=next.sz&&sz<next.bottom))patch.wallW=0;
  if(Object.keys(patch).length)draft.setSquare(0,sx,sz,patch);
 }}
 for(let z=next.sz;z<next.bottom;z++)for(let x=next.sx;x<next.right;x++)if(!inside(old,x,z))draft.setSquare(0,x,z,{ground:2});
 if(!(map.imports||[]).length){
  for(let x=next.sx;x<next.right;x++){if(x>=old.right)draft.setSquare(0,x,next.sz,{wallN:1});if(next.h!==old.h||x>=old.right)draft.setSquare(0,x,next.bottom,{wallN:1});}
  for(let z=next.sz;z<next.bottom;z++){if(z>=old.bottom)draft.setSquare(0,next.sx,z,{wallW:1});if(next.w!==old.w||z>=old.bottom)draft.setSquare(0,next.right,z,{wallW:1});}
 }
 out.w=next.w;out.h=next.h;return out;
}
