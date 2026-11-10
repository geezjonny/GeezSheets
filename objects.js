// The Detail palette shares Builder primitives, palette, flame and halo with towns.
import { PAL, M, ico, gable, cyl, cone } from './style.js';
const names=['Barrel','Crate','Table','Chair','Bench','Bed','Chest','Bookshelf','Torch on a pole','Wall torch','Brazier','Campfire','Tree','Bush','Rock','Boulder','Statue','Altar','Well','Cart','Tent','Stairs up','Stairs down','Trapdoor','Pine','Ladder','Carpet'];
const keys=['barrel','crate','table','chair','bench','bed','chest','bookshelf','torch','wall-torch','brazier','campfire','tree','bush','rock','boulder','statue','altar','well','cart','tent','stairs-up','stairs-down','trapdoor','pine','ladder','carpet'];
const blocking=new Set(['table','bed','chest','statue','altar','well','cart','boulder','tree','bookshelf','pine']);
export const OBJECTS=keys.map((k,i)=>({k,name:names[i],blocks:blocking.has(k)}));
const blob=ico(1), roof=gable(1.25,1.3,1.35);
// Every object fits its anchor square; rot is a quarter turn about its centre.
export function buildObject(b,k,m) {
  const box=(x,y,z,w,h,d,c=PAL.wood,o={})=>b.box(m,x,y,z,w,h,d,c,o);
  const ball=(x,y,z,s,c,sy=s)=>b.g.add(blob,c,m.clone().multiply(M(x,y,z,0,s,sy,s)),{jitter:.06,cj:.08});
  const legs=(w,d,h)=>{for(const x of [-w,w])for(const z of [-d,d])box(x,0,z,.1,h,.1,PAL.woodDark);};
  switch(k) {
    case 'barrel': b.barrel(m,0,0); break;
    case 'crate': b.crate(m,0,0); break;
    case 'torch': b.torch(m,0,0); break;
    case 'brazier': b.brazier(m,0,0); break;
    case 'cart': b.cart(m.clone().multiply(M(0,0,-.2,0,.32,.55,.32)),0,0,0); break;
    case 'rock': case 'boulder': b.rock(m,0,k==='rock'?.18:.45,0,k==='rock'?.3:.55); break;
    case 'tree': b.cyl(m,0,0,0,.12,1.7,PAL.bark,6); ball(0,1.9,0,.65,PAL.leaf1,1); ball(.25,1.65,.12,.4,PAL.leaf2); break;
    // a forest pine (the world's own shape; scaled by o.s to the canopy it came from)
    case 'pine': b.g.add(cyl(.22,.34,2.4,5),PAL.bark,m); b.g.add(cone(2.3,4.2,7),PAL.pine,m.clone().multiply(M(0,1.6,0)),{jitter:.25}); b.g.add(cone(1.75,3.4,7),PAL.pine2,m.clone().multiply(M(0,3.4,0,.4)),{jitter:.2}); b.g.add(cone(1.1,2.7,6),PAL.pine,m.clone().multiply(M(0,5,0,.9)),{jitter:.15}); break;
    case 'bush': ball(0,.35,0,.5,PAL.bush,.4); ball(.25,.3,.15,.3,PAL.leaf2); break;
    case 'table': legs(.48,.43,.75); box(0,.75,0,1.3,.13,1.2,PAL.woodLight); break;
    case 'chair': legs(.23,.23,.5); box(0,.5,0,.65,.1,.65,PAL.woodLight); box(0,.6,-.27,.65,.65,.09); break;
    case 'bench': legs(.5,.2,.5); box(0,.5,0,1.3,.12,.6,PAL.woodLight); break;
    case 'bed': legs(.46,.55,.3); box(0,.3,0,1.15,.22,1.35); box(0,.52,0,1.08,.16,1.22,PAL.canvasDark); box(0,.68,-.38,.85,.12,.32,PAL.canvas); box(0,.3,-.64,1.2,.65,.1); break;
    case 'chest': box(0,0,0,1.1,.6,.7); box(0,.6,0,1.14,.16,.74,PAL.woodLight); for(const x of [-.38,.38])box(x,0,0,.07,.78,.77,PAL.iron); box(0,.4,.4,.14,.2,.05,PAL.iron); break;
    case 'bookshelf':
      for(const x of [-.57,.57])box(x,0,0,.12,1.85,.55);
      box(0,0,-.23,1.2,1.85,.08,PAL.woodDark);
      for(const y of [0,.55,1.1,1.75]) { box(0,y,0,1.2,.09,.55); if(y<1.7)for(let i=0;i<6;i++)box(-.45+i*.18,y+.09,0,.12,.3+(i%3)*.06,.33,[PAL.canvasDark,PAL.slate,PAL.woodLight][i%3]); }
      break;
    case 'wall-torch': box(0,1.45,-.61,.2,.5,.12,PAL.iron); box(0,1.6,-.37,.08,.08,.5,PAL.iron); b.cyl(m,0,1.6,-.18,.07,.45,PAL.wood,6); b.flame(m,0,2,-.18,.9,.85); break;
    case 'campfire':
      for(let i=0;i<8;i++){const a=i*Math.PI/4;b.rock(m,Math.cos(a)*.53,.1,Math.sin(a)*.53,.17,PAL.stoneDark);}
      for(const ry of [-.65,.65])box(0,.12,0,1,.16,.18,PAL.woodDark,{ry}); b.flame(m,0,.22,0,1.6,1.3); break;
    case 'statue': box(0,0,0,.95,.3,.95,PAL.stoneDark); box(0,.3,0,.55,.18,.55,PAL.stoneLight); box(0,.48,0,.4,.85,.32,PAL.stone); box(0,1.1,0,.85,.2,.25,PAL.stone); ball(0,1.6,0,.23,PAL.stoneLight); break;
    case 'altar': box(0,0,0,.85,.8,.65,PAL.stoneDark); box(0,.8,0,1.3,.18,.9,PAL.stone); box(0,.98,0,.4,.04,.5,PAL.canvasDark); break;
    case 'well':
      for(let i=0;i<10;i++){const a=i*Math.PI/5;box(Math.cos(a)*.48,0,Math.sin(a)*.48,.3,.65,.3,PAL.stone,{ry:-a});}
      for(const x of [-.58,.58])box(x,0,0,.1,1.8,.1); box(0,1.72,0,1.3,.12,.12); b.cyl(m,0,.45,0,.3,.05,PAL.deep,10); box(0,.7,0,.025,1,.025,PAL.canvasDark); break;
    case 'tent': b.g.add(roof,PAL.canvas,m,{jitter:.04}); box(0,0,.65,.06,1.4,.06,PAL.woodDark); box(0,1.35,0,1.35,.06,.06,PAL.woodDark,{ry:Math.PI/2}); break;
    case 'stairs-up': case 'stairs-down':
      box(0,0,0,1.35,.07,1.4,PAL.woodDark);
      for(let i=0;i<6;i++)box(0,.07,-.58+i*.23,1.25,(k==='stairs-up'?6-i:i+1)*.17,.23,PAL.stone);
      // Pale arrow makes direction readable even in a top view.
      box(0,1.12,k==='stairs-up'?-.4:.4,.08,.025,.38,PAL.canvas); break;
    case 'ladder': for(const x of [-.43,.43])box(x,0,0,.1,2.2,.12);for(let i=0;i<7;i++)box(0,.2+i*.28,0,.9,.07,.1,PAL.woodLight);break;
    case 'carpet': box(0,0,0,1.45,.025,1.45,PAL.canvasDark);for(const x of [-.64,.64])box(x,.025,0,.07,.01,1.35,PAL.canvas);break;
    case 'trapdoor': box(0,0,0,1.25,.09,1.25,PAL.woodDark); for(let i=0;i<5;i++)box(-.48+i*.24,.09,0,.22,.06,1.17,PAL.woodLight); for(const z of [-.4,.4])box(0,.15,z,1.15,.035,.07,PAL.iron); box(.3,.18,.2,.22,.06,.08,PAL.iron); break;
  }
}
