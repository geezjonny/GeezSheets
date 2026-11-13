import assert from 'node:assert/strict';
import {makeInterior,validateInterior,worldPoint,localPoint,doorOffset,itemBounds,segmentHits} from '../interior-layout.js';
let count=0;
for(const kind of ['home','store','inn','tavern','smithy','warehouse','chapel','library','barracks','healer','barn','stables','workshop','manor'])for(let seed=0;seed<500;seed++){
 const h={x:123.4,z:-234.5,L:3.6+(seed%27)*.65,D:5.1+(seed%31)*.6,yaw:seed*.147},key='layout:'+seed;
 const a=makeInterior(h,kind,key),b=makeInterior(h,kind,key);assert.deepEqual(a,b);assert.deepEqual(validateInterior(a),[],kind+' '+seed);
 const p=worldPoint(h,.7,-1.2),q=localPoint(h,p.x,p.z);assert.ok(Math.hypot(q.x-.7,q.z+1.2)<1e-9);
 assert.equal(a.door.x,doorOffset(h.L,key));
 if(a.items.length>1){const removed=a.items[0].id,c=makeInterior(h,kind,key,{removed:[removed]});assert.deepEqual(c.items,a.items.slice(1),'Removal must not reshuffle or spawn furnishings');}
 if(a.items.length){const o=a.items[0],c=makeInterior(h,kind,key,{moved:{[o.id]:{x:999,z:999}}});assert.deepEqual(c.items,a.items,'Invalid saved move must not escape footprint');}
 count++;
}
const h={L:10,D:14},shop=makeInterior(h,'store','shop'),home=makeInterior(h,'home','home');
for(const type of ['shelf','counter','crate','barrel'])assert.ok(shop.items.some(o=>o.type===type),type);
for(const type of ['bed','table'])assert.ok(home.items.some(o=>o.type===type),type);
assert.equal(segmentHits({x:-3,z:0},{x:3,z:0},{x:0,z:0,w:1,d:1},.2),true);
assert.equal(segmentHits({x:-3,z:3},{x:3,z:3},{x:0,z:0,w:1,d:1},.2),false);
console.log('PASS: '+count+' deterministic layouts, 14 building types, footprints, clear aisles/room entrances, rotations, stable removal, safe saved moves, and type-specific furnishings.');
