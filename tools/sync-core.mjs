import {readdir,readFile,mkdir,copyFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const src=new URL('../../GeezSuite/core/',import.meta.url),dest=new URL('../js/gaia-core/',import.meta.url);
async function files(dir,prefix=''){
 const out=[];
 for(const e of await readdir(dir,{withFileTypes:true})){
  if(e.isDirectory()&&(prefix||e.name==='schema'))out.push(...await files(new URL(e.name+'/',dir),prefix+e.name+'/'));
  else if(e.isFile()&&(prefix||e.name.endsWith('.mjs')))out.push(prefix+e.name);
 }return out;
}
const list=await files(src);
const texts=new Map();
// Refuse missing browser dependencies or changed module paths before copying.
for(const name of ['write.mjs','actions.mjs','schema-loader.mjs','firebase-layout.mjs'])assert.ok(list.includes(name),`Missing browser entry ${name}`);
for(const name of list.filter(n=>n.endsWith('.mjs'))){
 const text=await readFile(new URL(name,src),'utf8');
 texts.set(name,text);
 for(const match of text.matchAll(/(?:from\s*|import\s*\()['"]\.\/([^'"]+)['"]/g))assert.ok(list.includes(match[1]),`Unpackaged dependency in ${name}: ${match[1]}`);
}
const visited=new Set();
function browserGraph(name){
 if(visited.has(name))return;visited.add(name);
 const text=texts.get(name);assert.ok(text,`Missing browser module ${name}`);
 for(const match of text.matchAll(/\b(?:import|export)\s+[^;]*?\bfrom\s*['"]([^'"]+)['"]/g)){
  assert.ok(match[1].startsWith('./'),`Browser entry ${name} imports unsupported ${match[1]}`);
  browserGraph(match[1].slice(2));
 }
}
for(const entry of ['write.mjs','schema-loader.mjs','firebase-layout.mjs'])browserGraph(entry);
await mkdir(new URL('schema/',dest),{recursive:true});
if(!process.argv.includes('--check'))for(const name of list)await copyFile(new URL(name,src),new URL(name,dest));
for(const name of list)assert.deepEqual(await readFile(new URL(name,dest)),await readFile(new URL(name,src)));
const transport=await readFile(new URL('../js/gaia-firebase.mjs',import.meta.url),'utf8');
assert.match(transport,/\.\/gaia-core\/write\.mjs/);assert.match(transport,/\.\/gaia-core\/schema-loader\.mjs/);
console.log(`PASS ${list.length} shared core/schema files copied and browser entry paths verified`);
