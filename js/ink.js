// Ink cartography. All raster surfaces below are generated canvases; no image assets or URLs.
import {drawStamp} from './stamps.js';
import {computeVisibilityPolygon, activeOccluders, isPathBlocked, distToSegment} from './geometry.js';
export const INK = '#211b15', PAPER = '#82704f';
function hash(s) { let n=2166136261; for(const c of String(s)) n=Math.imul(n^c.charCodeAt(0),16777619); return n>>>0; }
function random(seed) { let n=hash(seed); return ()=>{n+=0x6D2B79F5;let t=Math.imul(n^n>>>15,1|n);t^=t+Math.imul(t^t>>>7,61|t);return ((t^t>>>14)>>>0)/4294967296;}; }
function canvas(w,h) { const c=document.createElement('canvas');c.width=Math.max(1,Math.ceil(w));c.height=Math.max(1,Math.ceil(h));return c; }
function line(c,x,y,X,Y) {c.beginPath();c.moveTo(x,y);c.lineTo(X,Y);c.stroke();}
function circle(c,x,y,r) {c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.stroke();}
function hatch(c,x,y,w,h,spacing=.15,cross=false) {
    c.save();c.beginPath();c.rect(x,y,w,h);c.clip();
    c.beginPath();for(let i=-h;i<w+h;i+=spacing){c.moveTo(x+i,y+h);c.lineTo(x+i+h,y);if(cross){c.moveTo(x+i,y);c.lineTo(x+i+h,y+h);}}c.stroke();c.restore();
}
const aliases={flagstone:'stone',stone_floor:'stone',wood_planks:'wood',cobblestone:'cobble',grassland:'grass',cobble_road:'cobble',dirt_path:'dirt',stream:'water',river:'water'};
// Public so editor previews use precisely the same ink as published scenes.
export function drawCell(c,id,x,y,g=1,seed='') {
    id=aliases[id]||id;if(!id||id==='neutral')return;
    const r=random(seed+':'+x+','+y+':'+id);c.save();c.translate(x*g,y*g);c.scale(g,g);c.beginPath();c.rect(0,0,1,1);c.clip();c.strokeStyle=INK;c.fillStyle=INK;c.lineWidth=.014;c.globalAlpha=.40;
    if(['wood','timber'].includes(id)) {for(let i=0;i<4;i++){const yy=i/4+.02;line(c,0,yy,1,yy+.012);line(c,(i%2)*.5+.16,yy,(i%2)*.5+.16,yy+.25);for(let j=0;j<2;j++){const xx=r();line(c,xx,yy+.07,xx+.22,yy+.08);}}}
    else if(['stone','slab','brick','ashlar','marble','cobble','cave','fieldstone'].includes(id)) {const n=id==='cobble'?3:2;for(let yy=0;yy<n;yy++)for(let xx=-1;xx<n;xx++){const a=(xx+(yy%2)*.5)/n+.025,b=yy/n+.025,w=1/n-.045,h=1/n-.05;c.beginPath();c.roundRect(a+r()*.02,b,w,h,.045);c.stroke();if(r()<.35)line(c,a+.08,b+.06,a+.17,b+.10);}}
    else if(id==='tile'){for(let i=0;i<3;i++){line(c,i*.5,0,i*.5,1);line(c,0,i*.5,1,i*.5);}hatch(c,0,0,.5,.5,.1);hatch(c,.5,.5,.5,.5,.1);}
    else if(id==='carpet'){c.strokeRect(.07,.07,.86,.86);c.strokeRect(.12,.12,.76,.76);for(let i=0;i<6;i++){line(c,.02,i/6,.07,i/6+.04);line(c,.93,i/6,.98,i/6+.04);}}
    else if(['water','lava'].includes(id)){for(let i=0;i<5;i++){c.beginPath();for(let j=-1;j<8;j++){const xx=j/6,yy=i*.23+.035*Math.sin(j*2+i);j===-1?c.moveTo(xx,yy):c.lineTo(xx,yy);}c.stroke();}if(id==='lava'){c.lineWidth=.035;line(c,.2,.1,.35,.4);line(c,.35,.4,.15,.7);line(c,.35,.4,.7,.6);}}
    else if(id==='ice'){for(let i=0;i<3;i++){const x=r(),y=r();line(c,x,y,x+.3,y-.3);line(c,x+.12,y-.12,x+.06,y-.33);}}
    else if(id==='grass'){for(let i=0;i<7;i++){const x=r(),y=r();line(c,x-.04,y-.09,x,y);line(c,x,y,x+.05,y-.12);}}
    else if(['rocks','gravel'].includes(id)){for(let i=0;i<10;i++){c.beginPath();c.ellipse(r(),r(),.025+r()*.035,.018+r()*.025,r()*3,0,7);c.stroke();}}
    else {const n=id==='mud'?60:id==='snow'?5:23;for(let i=0;i<n;i++){c.beginPath();c.arc(r(),r(),id==='snow'?.012:.007+r()*.007,0,7);c.fill();}}
    c.restore();
}
// Stamps (props) are drawn by js/stamps.js: one entry per stamp, easy to redraw.
export function drawProp(c,p,g=1) { drawStamp(c,p,g); }
export function drawDoor(c,d,g=1) {
    const a=d.a||[d.x1,d.y1],b=d.b||[d.x2,d.y2],kind=d.kind||d.mat||'door',mat=d.material||d.mat||'wood',len=Math.hypot(b[0]-a[0],b[1]-a[1]);
    c.save();c.translate(a[0]*g,a[1]*g);c.rotate(Math.atan2(b[1]-a[1],b[0]-a[0]));c.scale(g,g);c.fillStyle=PAPER;c.strokeStyle=INK;c.lineWidth=.035;
    c.fillRect(-.025,-.16,len+.05,.32);line(c,0,-.19,0,.19);line(c,len,-.19,len,.19);
    if(kind==='arch') {line(c,0,-.25,0,.25);line(c,len,-.25,len,.25);}
    else if(kind==='window'){line(c,.07,-.065,len-.07,-.065);line(c,.07,.065,len-.07,.065);}
    else if(!d.closed){c.save();c.rotate(-Math.PI*.42);c.strokeRect(0,-.035,len,.07);c.restore();c.globalAlpha=.4;c.setLineDash([.055,.06]);c.beginPath();c.arc(0,0,len,-Math.PI*.42,0);c.stroke();}
    else if(kind==='curtain'||mat==='curtain'){c.beginPath();for(let i=0;i<=20;i++)c.lineTo(len*i/20,Math.sin(i*Math.PI/2)*.075);c.stroke();}
    else {c.strokeRect(.04,-.09,Math.max(.01,len-.08),.18);if(kind==='iron'||mat==='iron')line(c,.07,0,len-.07,0);if(kind==='secret'||mat==='secret'){c.fillStyle=INK;c.font='italic .3px Georgia';c.textAlign='center';c.fillText('S',len/2,.10);}}
    c.restore();
}
export function geometry(scene,level=scene.floors[0].level,states={}) {
    const f=scene.floors.find(f=>f.level===level)||scene.floors[0],seg=v=>({x1:v.a[0],y1:v.a[1],x2:v.b[0],y2:v.b[1]});
    return {walls:(f.walls||[]).map(seg),doors:(f.portals||[]).map((p,i)=>{const closed=p.kind==='arch'?false:p.kind==='window'?true:(states['scene-door-'+i]===undefined?p.closed:states['scene-door-'+i]!=='open');return {...seg(p),closed,sight:closed&&p.kind!=='window',pass:!closed};})};
}
export function visionFor(scene,viewers,level=scene.floors[0].level,states={}) {
    const geo=geometry(scene,level,states),occ=activeOccluders(geo.walls,geo.doors.filter(d=>d.sight));
    return {dark:false,lights:[],views:viewers.map(v=>({los:computeVisibilityPolygon(v.x,v.y,occ,v.range||Math.hypot(scene.grid.cols,scene.grid.rows)),dv:null}))};
}
const shadeCache=new Map();
export function drawLighting(ctx,cols,rows,lights,g) {
    if(!lights?.length)return;
    const key=JSON.stringify([cols,rows,lights.map(l=>[l.x,l.y,l.range,l.intensity])]);
    let shade=shadeCache.get(key);
    if(!shade){const k=Math.min(g,1024/Math.max(cols,rows));shade=canvas(cols*k,rows*k);const c=shade.getContext('2d');c.scale(k,k);c.strokeStyle=INK;c.lineWidth=.012;
        for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){let light=0;for(const l of lights)light=Math.max(light,Math.max(0,1-Math.hypot(x+.5-l.x,y+.5-l.y)/Math.max(.01,l.range))*(l.intensity??1));if(light<.8){c.globalAlpha=(.8-light)*.24;hatch(c,x,y,1,1,.18);}}
        shadeCache.set(key,shade);while(shadeCache.size>4)shadeCache.delete(shadeCache.keys().next().value);
    }ctx.drawImage(shade,0,0,cols*g,rows*g);
}
// Reused by the page and standalone harness. Static art is bounded to 2048px and never redrawn on token moves.
export function createInkRenderer(scene,{level=scene.floors[0].level,ppg=48,maxPixels=2048}={}) {
    const f=scene.floors.find(f=>f.level===level)||scene.floors[0],cols=scene.grid.cols,rows=scene.grid.rows,g=Math.min(ppg,maxPixels/Math.max(cols,rows));
    const base=canvas(cols*g,rows*g),c=base.getContext('2d'),seed=scene.name+':'+level,r=random(seed),cells=f.cells||{},geo=geometry(scene,level);
    c.fillStyle=PAPER;c.fillRect(0,0,base.width,base.height);
    // Fibres and broad stains are deterministic and have no repeating bitmap tile.
    for(let i=0;i<200;i++){const x=r()*base.width,y=r()*base.height,rad=20+r()*180,gr=c.createRadialGradient(x,y,0,x,y,rad);gr.addColorStop(0,r()<.5?'rgba(32,20,9,.055)':'rgba(224,196,138,.055)');gr.addColorStop(1,'transparent');c.fillStyle=gr;c.fillRect(x-rad,y-rad,rad*2,rad*2);}
    for(let i=0;i<base.width*base.height/9;i++){c.fillStyle=r()<.5?'rgba(24,17,10,.065)':'rgba(232,209,163,.045)';c.fillRect(r()*base.width,r()*base.height,.5+r(),.5+r());}
    c.save();c.scale(g,g);c.strokeStyle=INK;c.fillStyle=INK;
    for(const [key,cell] of Object.entries(cells)){const [x,y]=key.split(',').map(Number);drawCell(c,cell.floor,x,y,1,seed);if(cell.terrain)drawCell(c,cell.terrain,x,y,1,seed);}
    // Flood from the map edge, crossing only open space, to distinguish solid exterior from rooms.
    const outside=new Uint8Array(cols*rows),queue=[],barriers=[...geo.walls,...geo.doors.map(d=>({...d,closed:true}))];
    const buckets=new Map();for(const b of barriers)for(let y=Math.max(0,Math.floor(Math.min(b.y1,b.y2))-1);y<=Math.min(rows-1,Math.ceil(Math.max(b.y1,b.y2))+1);y++)for(let x=Math.max(0,Math.floor(Math.min(b.x1,b.x2))-1);x<=Math.min(cols-1,Math.ceil(Math.max(b.x1,b.x2))+1);x++){const key=y*cols+x;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(b);}
    const add=(x,y)=>{const i=y*cols+x;if(!outside[i]&&!cells[x+','+y]?.floor){outside[i]=1;queue.push([x,y]);}};
    for(let x=0;x<cols;x++){add(x,0);add(x,rows-1);}for(let y=0;y<rows;y++){add(0,y);add(cols-1,y);}
    for(let i=0;i<queue.length;i++){const [x,y]=queue[i];for(const [X,Y] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]])if(X>=0&&Y>=0&&X<cols&&Y<rows&&!outside[Y*cols+X]&&!isPathBlocked(x+.5,y+.5,X+.5,Y+.5,buckets.get(y*cols+x)||[],[]))add(X,Y);}
    const near=new Float32Array(cols*rows);near.fill(99);
    for(const w of geo.walls)for(let y=Math.max(0,Math.floor(Math.min(w.y1,w.y2))-3);y<Math.min(rows,Math.ceil(Math.max(w.y1,w.y2))+3);y++)for(let x=Math.max(0,Math.floor(Math.min(w.x1,w.x2))-3);x<Math.min(cols,Math.ceil(Math.max(w.x1,w.x2))+3);x++)near[y*cols+x]=Math.min(near[y*cols+x],distToSegment(x+.5,y+.5,w.x1,w.y1,w.x2,w.y2));
    const distance=(x,y)=>{const X=Math.max(0,Math.min(cols-1,x-.5)),Y=Math.max(0,Math.min(rows-1,y-.5)),ix=Math.floor(X),iy=Math.floor(Y),fx=X-ix,fy=Y-iy;
        const at=(a,b)=>near[Math.min(rows-1,b)*cols+Math.min(cols-1,a)];return (at(ix,iy)*(1-fx)+at(ix+1,iy)*fx)*(1-fy)+(at(ix,iy+1)*(1-fx)+at(ix+1,iy+1)*fx)*fy;};
    for(let y=0;y<rows;y++)for(let x=0;x<cols;x++)if(outside[y*cols+x]&&near[y*cols+x]<3.1){
        // Short, scattered pen strokes avoid visible cell-shaped bands in the distance fade.
        for(let i=0;i<24;i++){const px=x+r(),py=y+r(),d=distance(px,py);if(d>=2.6)continue;c.globalAlpha=.55*Math.pow(1-d/2.6,1.3);c.lineWidth=.014;const len=.12+r()*.15;line(c,px-len/2,py+len/2,px+len/2,py-len/2);if(d<.8&&r()<.6)line(c,px-len/2,py-len/2,px+len/2,py+len/2);}
    }
    c.globalAlpha=1;c.lineWidth=.012;c.strokeStyle='rgba(33,27,21,.17)';c.beginPath();for(let x=0;x<=cols;x++){c.moveTo(x,0);c.lineTo(x,rows);}for(let y=0;y<=rows;y++){c.moveTo(0,y);c.lineTo(cols,y);}c.stroke();c.strokeStyle=INK;
    for(const [key,cell] of Object.entries(cells)) {const [x,y]=key.split(',').map(Number),h=cell.elevation||0;for(const [X,Y,a,b] of [[x+1,y,[x+1,y],[x+1,y+1]],[x,y+1,[x,y+1],[x+1,y+1]],[x-1,y,[x,y],[x,y+1]],[x,y-1,[x,y],[x+1,y]]]){const other=cells[X+','+Y],oh=other?.elevation||0;if(h>oh){c.lineWidth=.022;c.globalAlpha=.7;line(c,...a,...b);c.lineWidth=.012;line(c,a[0]+(X-x)*.08,a[1]+(Y-y)*.08,b[0]+(X-x)*.08,b[1]+(Y-y)*.08);c.globalAlpha=.4;hatch(c,X,Y,1,1,.12);}if(cell.terrain==='water'&&other?.terrain!=='water'){c.globalAlpha=.7;c.lineWidth=.035;line(c,...a,...b);}}}
    c.globalAlpha=1;
    for(const [i,w] of (f.walls||[]).entries()) {const [x,y]=w.a,[X,Y]=w.b,dx=X-x,dy=Y-y,len=Math.hypot(dx,dy);if(!len)continue;
        c.save();c.translate(x,y);c.rotate(Math.atan2(dy,dx));c.lineWidth=.012;c.globalAlpha=.38;hatch(c,0,-.25,len,.5,.09);c.globalAlpha=1;
        const wood=/wood|timber|palisade/.test(w.material),width=wood?.09:.16;
        c.lineWidth=width;c.lineCap='round';if(w.material==='palisade'){c.setLineDash([.075,.1]);line(c,0,0,len,0);}else {const rr=random(seed+i);c.beginPath();c.moveTo(0,0);for(let t=.18;t<len;t+=.18)c.lineTo(t,(rr()-.5)*.025);c.lineTo(len,0);c.stroke();c.strokeStyle='#b09a71';c.lineWidth=.018;line(c,0,-width*.17,len,-width*.17);}c.restore();
    }
    for(const p of f.props||[])drawProp(c,p);
    // Light affects ink density only. Absence of lights leaves a readable daylight map.
    if(f.lights?.length)for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){let light=0;for(const l of f.lights)light=Math.max(light,Math.max(0,1-Math.hypot(x+.5-l.x,y+.5-l.y)/Math.max(.01,l.range))*(l.intensity??1));if(light<.8){c.globalAlpha=(.8-light)*.2;c.lineWidth=.012;hatch(c,x,y,1,1,.18);}}
    c.restore();
    const fg=Math.min(g,512/Math.max(cols,rows)),fw=cols*fg,fh=rows*fg;
    const fog=canvas(fw,fh),memory=canvas(fw,fh),mask=canvas(fw,fh),one=canvas(fw,fh),light=canvas(fw,fh);
    const dense=canvas(64,64),dc=dense.getContext('2d');dc.fillStyle='#453b2c';dc.fillRect(0,0,64,64);dc.strokeStyle='#201c16';dc.lineWidth=.5;hatch(dc,0,0,64,64,3,true);dc.strokeStyle='rgba(192,164,113,.16)';dc.lineWidth=.4;hatch(dc,0,0,64,64,12);
    function poly(ctx,p){if(!p?.length)return;ctx.beginPath();ctx.moveTo(p[0].x*fg,p[0].y*fg);for(const v of p)ctx.lineTo(v.x*fg,v.y*fg);ctx.closePath();ctx.fill();}
    return {canvas:base,ppg:g,cols,rows,level,
        drawBase(ctx,w=base.width,h=base.height){ctx.drawImage(base,0,0,w,h);},
        drawDoors(ctx,states={},scale=g){for(const [i,p] of (f.portals||[]).entries())drawDoor(ctx,{...p,closed:p.kind==='arch'?false:states['scene-door-'+i]===undefined?p.closed:states['scene-door-'+i]!=='open'},scale);},
        resetExplored(){memory.getContext('2d').clearRect(0,0,memory.width,memory.height);},
        restoreExplored(keys=[]) {const x=memory.getContext('2d');x.fillStyle='#fff';for(const key of keys){const [cx,cy]=key.split(',').map(Number);if(Number.isInteger(cx)&&Number.isInteger(cy)&&cx>=0&&cy>=0&&cx<cols&&cy<rows)x.fillRect(cx*fg,cy*fg,fg,fg);}},
        exploredCells() {const d=memory.getContext('2d').getImageData(0,0,memory.width,memory.height).data,out=[];for(let y=0;y<rows;y++)for(let x=0;x<cols;x++)if(d[(Math.floor((y+.5)*fg)*memory.width+Math.floor((x+.5)*fg))*4+3]>127)out.push(x+','+y);return out;},
        drawFog(ctx,vis,{gm=false,preview=false,width=base.width,height=base.height}={}) {
            if((gm&&!preview)||!vis)return;
            const m=mask.getContext('2d'),o=one.getContext('2d'),l=light.getContext('2d'),ex=memory.getContext('2d'),fc=fog.getContext('2d');
            m.clearRect(0,0,mask.width,mask.height);l.clearRect(0,0,light.width,light.height);l.fillStyle='#fff';for(const p of vis.lights||[])poly(l,p);
            for(const v of vis.views){o.globalCompositeOperation='source-over';o.clearRect(0,0,one.width,one.height);o.fillStyle='#fff';poly(o,v.los);if(vis.dark){o.globalCompositeOperation='destination-in';o.drawImage(light,0,0);}m.drawImage(one,0,0);if(v.dv){m.fillStyle='#fff';poly(m,v.dv);}}
            ex.drawImage(mask,0,0);fc.globalCompositeOperation='source-over';fc.clearRect(0,0,fog.width,fog.height);fc.fillStyle=fc.createPattern(dense,'repeat');fc.fillRect(0,0,fog.width,fog.height);
            fc.globalCompositeOperation='destination-out';fc.globalAlpha=.72;fc.drawImage(memory,0,0);fc.globalAlpha=1;fc.drawImage(mask,0,0);fc.globalCompositeOperation='source-over';ctx.drawImage(fog,0,0,width,height);
        }
    };
}
