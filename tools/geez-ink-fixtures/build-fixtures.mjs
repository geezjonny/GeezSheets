import {readFile,writeFile} from 'node:fs/promises';
import {dd2vttToScene} from '../../js/geez2vtt.js';
const save=(name,s)=>writeFile(new URL(name+'.geez2vtt',import.meta.url),JSON.stringify(s,null,2)+'\n');
for(const n of ['prison_01','market_district_01','azurite_pointe','cavesystem']) {
    const d=JSON.parse(await readFile(new URL('../../../GeezSuite/maps/legacy/'+n+'.dd2vtt',import.meta.url)));
    await save(n,dd2vttToScene(d,n));
}
const prison=JSON.parse(await readFile(new URL('prison_01.geez2vtt',import.meta.url)));
prison.name='The Gaoler’s House';const p=prison.floors[0];
for(let y=4;y<18;y++)for(let x=4;x<25;x++)p.cells[x+','+y]={floor:'stone',elevation:x>=18&&y>=8&&y<14?5:0};
for(const [id,x,y,rotation] of [['table',12,10,0],['chair',12,9,0],['barrel',5,11,0],['crate',6,12,15],['stairs',23,11,0],['altar',20,9,0],['brazier',17,11,0],['bookshelf',24,12,90],['chest',20,16,0],['bed',6,5,90],['bed',9,5,90],['bed',14,16,90],['coffin',24,16,0]])p.props.push({id,x,y,rotation,scale:1});
await save('converted_prison_01',prison);
const s={format:'geez2vtt',version:1,style:'ink',name:'The Blackthorn Sanctuary',grid:{cols:24,rows:20,cell_ft:5},floors:[{level:0,name:'Sanctuary',elevation:0,cells:{},walls:[],portals:[],lights:[{x:10,y:9,range:12,intensity:1,color:'#ffbb66'}],props:[]}]};
const f=s.floors[0];
for(let y=3;y<17;y++)for(let x=3;x<21;x++)f.cells[x+','+y]={floor:y<9?'stone':x<12?'wood':'tile',elevation:x>16?5:0};
for(const [i,t] of ['dirt','sand','grass','water','mud','snow','lava','ice','rocks','gravel','carpet','cobble'].entries())for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++)f.cells[(3+(i%6)*3+dx)+','+(4+Math.floor(i/6)*4+dy)]={terrain:t,elevation:t==='water'?-5:0};
for(const [a,b,material] of [[[3,3],[11,3],'stone'],[[12,3],[21,3],'stone'],[[21,3],[21,17],'stone'],[[21,17],[3,17],'stone'],[[3,17],[3,3],'stone'],[[12,10],[12,16],'wood'],[[17,10],[20,10],'palisade']])f.walls.push({a,b,material});
f.portals=[{a:[11,3],b:[12,3],kind:'door',material:'iron',closed:true,reviewed:true},{a:[21,6],b:[21,7],kind:'window',material:'wood',closed:true,reviewed:true},{a:[3,10],b:[3,12],kind:'arch',material:'stone',closed:false,reviewed:true}];
for(const [i,id] of ['table','chair','bed','barrel','crate','chest','bookshelf','altar','statue','pillar','tree','bush','boulder','campfire','brazier','torch_sconce','stairs','ladder','well','cart','fountain','coffin','anvil','cauldron','anchor'].entries())f.props.push({id,x:4+(i%8)*2.1,y:11+Math.floor(i/8)*1.6,rotation:i%3===0?25:0,scale:.8});
await save('sanctuary',s);
