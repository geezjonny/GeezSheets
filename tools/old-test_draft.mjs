import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const url = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const geometry=await readFile(new URL('../js/old-build-tools.js',import.meta.url),'utf8');
const source=(await readFile(new URL('../js/old-draft-tool.js',import.meta.url),'utf8')).replaceAll('"./old-build-tools.js"',JSON.stringify(url(geometry)));
const d=await import(url(source)),g=await import(url(geometry));
const room=(type,a,b)=>({type,cells:d.rectCells(a,b)});
const edges=walls=>new Set(Object.values(walls).flatMap(g.unitEdges));
let count=0;
function test(name,fn){fn();console.log(`ok ${++count} - ${name}`);}
test('all 29 room types and 16 exact themes',()=>{assert.equal(Object.keys(d.TYPES).length,29);assert.equal(Object.keys(d.THEMES).length,16);assert.equal(d.THEMES.Townhouse.wall,'brick');assert.equal(d.TYPES.Cave.wall,'cave');});
test('two adjacent rooms have exactly one shared door',()=>{
 const plan=[room('Bedroom',[1,1],[4,4]),room('Kitchen',[5,1],[8,4])],b=d.build(plan);
 const shared=Object.values(b.addDoors).filter(s=>s.x1===5&&s.x2===5);
 assert.equal(shared.length,1);assert.equal(Object.keys(b.addDoors).length,2);
 assert.ok(!edges(b.addWalls).has(g.unitEdges(shared[0])[0]));
});
test('hub links to every neighbour before non-hubs spread',()=>{
 const plan=[room('Bedroom',[0,0],[2,2]),room('Kitchen',[3,0],[5,2]),room('Hall',[0,3],[5,5]),room('Office',[0,6],[5,8])];
 assert.equal(d.buildOrder(plan)[0],2);
 const links=d.connections(plan).links;for(const i of [0,1,3])assert.ok(links.some(([a,b])=>a===2&&b===i||b===2&&a===i));
 const b=d.build(plan);assert.equal(Object.keys(b.addDoors).length,4);
});
test('adjacent courtyards have no shared wall or door',()=>{
 const b=d.build([room('Courtyard',[0,0],[2,2]),room('Courtyard',[3,0],[5,2])]);assert.equal(Object.keys(b.addWalls).length,0);assert.equal(Object.keys(b.addDoors).length,0);
});
test('entrance prefers south even when an east or west wall is longer',()=>{
 const b=d.build([room('Bedroom',[2,2],[4,9])]);const door=Object.values(b.addDoors)[0];assert.equal(door.y1,10);assert.equal(door.y2,10);assert.equal(door.x1,3);
});
test('furnish every room type within its shape and outside door clearance',()=>{
 for(const type of Object.keys(d.TYPES)){
  const plan=[room(type,[1,1],[10,9])],b=d.build(plan,{}, {furnish:true}),area=new Set(plan[0].cells);
  const ds=Object.values(b.addDoors).flatMap(g.unitEdges).map(e=>{const [x,y,x2]=e.split(',').map(Number);return `${x},${y},${x===x2?1:0}`;});
  const reserved=d.doorClearance(ds),occupied=new Set();
  for(const p of Object.values(b.props||{})){
   const r=((360-p.rot)%360)/90,dir=[[0,1],[1,0],[0,-1],[-1,0]][r];
   const probe=d.footprint(p.p,[0,0],r).map(k=>k.split('_').map(Number));
   const avg=probe.reduce((a,c)=>[a[0]+c[0],a[1]+c[1]],[0,0]).map(n=>n/probe.length);
   const anchor=[Math.round(p.x-.5-avg[0]),Math.round(p.y-.5-avg[1])];assert.ok(dir);
   for(const k of d.footprint(p.p,anchor,r)){assert.ok(area.has(k),`${type}: ${p.p} outside room`);assert.ok(!reserved.has(k),`${type}: ${p.p} blocks door`);assert.ok(!occupied.has(k));occupied.add(k);}
  }
  if(d.TYPES[type].furnish)assert.ok(Object.keys(b.props||{}).length,`${type} furnished`);
 }
});
test('rotation and footprint centers match bridge quarter turns',()=>{for(let r=0;r<4;r++){const p=d.canvasProp({kind:'bed',cell:[3,4],rot:r});assert.equal(p.rot,(360-r*90)%360);assert.deepEqual([p.x,p.y],[[3.5,5],[4,4.5],[3.5,4],[3,4.5]][r]);}});
test('sketch ownership, extension, retyping, removal and frozen inputs',()=>{
 const first=[room('Hall',[0,0],[1,1])];Object.freeze(first[0].cells);Object.freeze(first[0]);Object.freeze(first);
 const second=d.addCells(first,['1_1','2_1'],'Bedroom');assert.equal(second[0].cells.length,3);assert.equal(second[1].cells.length,2);
 const extended=d.addCells(second,['3_1'],'Kitchen',true);assert.equal(extended[1].type,'Bedroom');assert.equal(extended[1].cells.length,3);
 assert.equal(d.setType(extended,1,'Kitchen')[1].type,'Kitchen');assert.equal(d.removeCells(extended,extended[1].cells).length,1);
 const before=JSON.stringify(first);d.build(first);assert.equal(JSON.stringify(first),before);
});
test('existing props, imported walls and custom non-grid geometry survive conversion',()=>{
 const original={props:{old:{p:'crate',x:2.5,y:2.5,s:1}},paint:{'20_20':'grass'},addWalls:{diagonal:{x1:15,y1:15,x2:17,y2:17,mat:'cave'}}};
 const b=d.build([room('Hall',[1,1],[4,4])],original,{baseWalls:[{key:'source',src:'dd',x1:1,y1:5,x2:5,y2:5,mat:'stone'}]});
 assert.ok(b.hideWalls.source);assert.deepEqual(b.props,original.props);assert.deepEqual(b.addWalls.diagonal,original.addWalls.diagonal);assert.equal(b.paint['20_20'],'grass');
 assert.ok(!Object.keys(b.addWalls).some(k=>k.startsWith('@')));
 assert.deepEqual(d.occupiedProps([original.props.old],()=>({w:1,h:1})),['2_2']);
});
console.log(`Passed ${count} draft tests.`);
