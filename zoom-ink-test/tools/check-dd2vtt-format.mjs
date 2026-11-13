import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseDD2VTT,normalizeDD2VTT,readStructure,wallPieces,rotatePoint,lightColor,segmentsTouch} from '../dd2vtt-format.js';

const source={format:.3,resolution:{map_origin:{x:10,y:20},map_size:{x:8,y:5},pixels_per_grid:256},line_of_sight:[[{x:10,y:21},{x:18,y:21}],[{x:11.25,y:22},{x:14.75,y:24.25}]],objects_line_of_sight:[[{x:12,y:23},{x:13,y:24}]],portals:[{bounds:[{x:12,y:21},{x:13,y:21}],closed:true}],lights:[{position:{x:11.5,y:22.5},range:4,intensity:.8,color:'804488cc',shadows:false}],image:'THIS_IMAGE_MUST_NOT_BE_PARSED_OR_LOADED'};
const text=JSON.stringify(source),originalParse=JSON.parse;
JSON.parse=function(v,...args){assert.ok(!v.includes('THIS_IMAGE_MUST_NOT_BE_PARSED_OR_LOADED'),'embedded image is skipped before JSON.parse');return originalParse(v,...args);};
let parsed;try{parsed=parseDD2VTT(text);}finally{JSON.parse=originalParse;}
assert.equal(parsed.walls.length,3);assert.equal(parsed.doors.length,1);assert.equal(parsed.lights.length,1);assert.equal(parsed.walls[1].a.x,1.25);assert.equal(parsed.walls[1].b.y,4.25);
assert.equal(parsed.lights[0].position.x,1.5);assert.equal(parsed.lights[0].color,'#4488cc');assert.equal(parsed.lights[0].alpha,128/255);assert.equal(parsed.lights[0].range,4);assert.equal(parsed.lights[0].shadows,false);
assert.ok(!('image'in parsed));assert.ok(!('image'in readStructure(text)));
Object.defineProperty(source,'image',{get(){throw Error('Image was accessed');}});assert.equal(normalizeDD2VTT(source).walls.length,3);
const split=wallPieces(parsed.walls,parsed.doors);assert.equal(split.length,4);assert.deepEqual(split[0],{a:{x:0,y:1},b:{x:2,y:1}});assert.deepEqual(split[1],{a:{x:3,y:1},b:{x:8,y:1}});
assert.deepEqual(rotatePoint({x:1,y:2},8,5,1),{x:3,y:1});assert.deepEqual(rotatePoint({x:1,y:2},8,5,3),{x:2,y:7});
assert.ok(segmentsTouch({x:0,y:0},{x:2,y:2},{x:0,y:2},{x:2,y:0}));assert.ok(!segmentsTouch({x:0,y:0},{x:1,y:0},{x:3,y:0},{x:4,y:0}));
assert.deepEqual(lightColor('ffeccd8b'),{color:'#eccd8b',alpha:1});
for(const invalid of ['{}','{"resolution":',text.slice(0,-1),'{"resolution":{},}',JSON.stringify({resolution:{map_size:{x:-1,y:3}}})])assert.throws(()=>parseDD2VTT(invalid));
const real=parseDD2VTT(await readFile(new URL('../test.dd2vtt',import.meta.url),'utf8'));
assert.equal(real.w,20);assert.equal(real.h,20);assert.equal(real.walls.length,15);assert.equal(real.doors.length,3);assert.equal(real.lights.length,3);
assert.ok(JSON.stringify(real).length<10000,'25 MB real file reduces to a small structure-only record');
console.log('PASS: image skipped before parsing, nonzero origin, fractional/angled walls, object LOS, door cuts, rotations, ARGB/range/intensity, validation, real test.dd2vtt (15 walls / 3 doors / 3 lights).');
