import {sha256} from './sha256.mjs';
// Escape '%' as well, making the key codec reversible and collision-free.
export const encodeKey=k=>String(k).replace(/[%\u0000-\u001f\u007f.#$\[\]\/]|^\d+$/g,c=>[...c].map(x=>'%'+x.charCodeAt(0).toString(16).padStart(2,'0').toUpperCase()).join(''));
export const decodeKey=k=>k.replace(/%([0-9A-F]{2})/g,(_,h)=>String.fromCharCode(parseInt(h,16)));
export const encodePath=p=>p.split('/').map(encodeKey).join('/');
// RTDB drops empty containers; preserve them so schema-required {} and [] survive.
export function encodeTree(v){
 if(v&&typeof v==='object'&&!Object.keys(v).length)return {'%EMPTY':Array.isArray(v)?'array':'object'};
 if(Array.isArray(v))return v.map(encodeTree);
 if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[encodeKey(k),encodeTree(x)]));
 return v;
}
export function decodeTree(v){
 if(v&&typeof v==='object'&&Object.keys(v).length===1&&v['%EMPTY'])return v['%EMPTY']==='array'?[]:{};
 if(Array.isArray(v))return v.map(decodeTree);
 if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[decodeKey(k),decodeTree(x)]));
 return v;
}
export function firebaseLayout(input){
 const tree=structuredClone(input),files=tree.apps?.sheets?.files||{};
 if(tree.apps?.sheets)delete tree.apps.sheets.files;
 const stored={...tree.files,...files};delete tree.files;
 // Older snapshots may embed a picture directly in image fields rather than
 // apps/sheets/files. Replace it with a deterministic filename for lazy loading.
 function extract(v){
  if(typeof v==='string'&&v.startsWith('data:')){const key='gaia-inline-'+sha256(v).slice(0,24);stored[key]=v;return key;}
  if(Array.isArray(v))return v.map(extract);
  if(v&&typeof v==='object')for(const k of Object.keys(v))v[k]=extract(v[k]);
  return v;
 }
 extract(tree);tree.files=stored;
 return encodeTree(tree);
}
export function sizes(tree){
 const size=v=>new TextEncoder().encode(JSON.stringify(v??null)).length;
 const {files,...initial}=tree;
 return {worlds:size(tree.worlds),campaigns:size(tree.campaigns),apps:size(tree.apps),files:size(files),initial:size(initial),total:size(tree)};
}
