import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('./table3d-layer.js',import.meta.url),'utf8');
const {doorRules,elevationEdges,liftedRoof,smoothPath,floorList,onStairs}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
let n=0;
function test(name,fn){fn();console.log(`ok ${++n} - ${name}`);}
test('door rules separate movement, sight and toggling',()=>{
    for(const kind of ['wood','iron','double','secret']){assert.deepEqual(doorRules(kind),{closed:true,toggle:true,sight:true,pass:false});assert.equal(doorRules(kind,true).pass,true);}
    for(const kind of ['bars','portcullis']){assert.equal(doorRules(kind).sight,false);assert.equal(doorRules(kind).pass,false);assert.equal(doorRules(kind,true).pass,true);}
    assert.deepEqual(doorRules('window',true),{closed:true,toggle:false,sight:false,pass:false});
    assert.deepEqual(doorRules('arch'),{closed:false,toggle:false,sight:false,pass:true});
    assert.deepEqual(doorRules('curtain'),{closed:true,toggle:true,sight:true,pass:true});
});
test('elevation edges include every unequal neighbour, deduplicated',()=>{
    assert.deepEqual(elevationEdges({}),[]);assert.equal(elevationEdges({'0_0':.5}).length,4);
    assert.equal(elevationEdges({'0_0':1,'1_0':1}).length,6);
    const e=elevationEdges({'0_0':1,'1_0':-1});assert.equal(e.length,7);assert.ok(e.some(a=>a.join()==='1,0,1,1'));
    assert.equal(elevationEdges({'-1_-1':-.5}).length,4);
    assert.equal(elevationEdges({'0_0':0}).length,0);
});
test('roof lift is four-connected, covers mixed materials, supports negative cells',()=>{
    const roof=Object.freeze({'0_0':'thatch','1_0':'tile','1_1':'tile','3_3':'thatch','-1_0':'tile'});
    assert.deepEqual([...liftedRoof(roof,[{x:.5,y:.5}])].sort(),['-1_0','0_0','1_0','1_1']);
    assert.equal(liftedRoof(roof,[{x:2.5,y:2.5}]).size,0);
    assert.equal(liftedRoof(roof,[{x:.5,y:.5},{x:3.5,y:3.5}]).size,5);
    assert.equal(liftedRoof({'0_0':'tile','1_1':'tile'},[{x:.5,y:.5}]).size,1);
});
test('smooth paths retain endpoints and support two points and bends',()=>{
    assert.deepEqual(smoothPath([]),[]);assert.deepEqual(smoothPath([[0,0]]),[]);
    assert.deepEqual(smoothPath([[0,0],[4,2]]),[['M',0,0],['L',4,2]]);
    const p=Object.freeze([Object.freeze([0,0]),Object.freeze([2,4]),Object.freeze([8,0])]);
    assert.deepEqual(smoothPath(p),[['M',0,0],['Q',2,4,5,2],['L',8,0]]);
});
test('floor ordering preserves basements, sparse floors and Firebase object arrays',()=>{
    assert.deepEqual(floorList({floors:[2,-2,0,-1,2]}),[-2,-1,0,2]);
    assert.deepEqual(floorList({floors:{0:-1,1:0,2:3}}),[-1,0,3]);
    assert.deepEqual(floorList(),[0]);
});
test('stair hit testing follows the rotated footprint',()=>{
    const stair={x:1,y:1,w:1,h:3,rot:90};
    assert.equal(onStairs(stair,1.5,2.5),true);
    assert.equal(onStairs(stair,.1,2.5),true);
    assert.equal(onStairs(stair,1.5,1.1),false);
    assert.equal(onStairs({...stair,rot:0},1.5,1.1),true);
});
console.log(`Passed ${n} GeezTabletop tests.`);
