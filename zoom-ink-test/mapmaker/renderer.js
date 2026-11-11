(() => {
'use strict';
const C=HearthCore,A=()=>HEARTH_CATALOG.assets;
const cache=new Map(),atlas=new Image();let artReadyResolve;const ready=new Promise(resolve=>artReadyResolve=resolve);atlas.onload=()=>artReadyResolve();atlas.onerror=()=>artReadyResolve();if(globalThis.HEARTH_INK_ART)atlas.src=HEARTH_INK_ART.png;else artReadyResolve();
const hash=(x,y=0)=>{const v=Math.sin(x*127.1+y*311.7)*43758.5453;return v-Math.floor(v);};
function line(c,x,y,x2,y2,color='#383c2b',w=.04){c.strokeStyle=color;c.lineWidth=w;c.beginPath();c.moveTo(x,y);c.lineTo(x2,y2);c.stroke();}
function box(c,x,y,w,h,color,stroke='#302d22',lw=.04){c.fillStyle=color;c.fillRect(x,y,w,h);if(stroke){c.strokeStyle=stroke;c.lineWidth=lw;c.strokeRect(x,y,w,h);}}
function ellipse(c,x,y,rx,ry,color,stroke='#333c29',lw=.035){c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fillStyle=color;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=lw;c.stroke();}}
function polygon(c,points,color,stroke='#34402b',lw=.04){c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fillStyle=color;c.fill();if(stroke){c.lineWidth=lw;c.strokeStyle=stroke;c.stroke();}}
function texture(asset) {
 const key=asset?.id||'terrain-grass';if(cache.has(key))return cache.get(key);
 const t=document.createElement('canvas');t.width=t.height=128;const c=t.getContext('2d'),k=asset?.key||'grass',color=asset?.color||'#73845a';
 c.fillStyle=color;c.fillRect(0,0,128,128);
 const stone=/flagstone|cobble|rock-floor|stone/.test(k);
 if(stone){
  const h=k==='cobble'?17:32,w=k==='cobble'?27:48;
  c.strokeStyle='#242c27';c.lineWidth=1.4;
  for(let row=-1;row<128/h+1;row++)for(let col=-1;col<128/w+1;col++){const x=col*w+(row%2)*w/2,y=row*h;c.fillStyle='rgba(224,222,192,'+(.025+hash(row,col)*.13)+')';c.fillRect(x+1,y+1,w-2,h-2);c.globalAlpha=.35;c.strokeRect(x,y,w,h);c.globalAlpha=1;c.strokeStyle='#c5cbb0';c.globalAlpha=.15;c.beginPath();c.moveTo(x+2,y+2);c.lineTo(x+w-3,y+2);c.stroke();c.globalAlpha=1;c.strokeStyle='#242c27';}
 } else if(/wood|timber/.test(k)){
  for(let row=0;row<8;row++){const y=row*16;c.fillStyle='rgba(222,179,114,'+(hash(row)*.2)+')';c.fillRect(0,y,128,15);c.strokeStyle='#36362b';c.globalAlpha=.5;c.strokeRect((row%2)*51-80,y,128,16);c.strokeRect((row%2)*51+48,y,128,16);c.globalAlpha=1;for(let j=0;j<9;j++){c.strokeStyle='rgba(40,35,24,.15)';c.beginPath();c.moveTo(j*18,y+4+hash(row,j)*8);c.bezierCurveTo(j*18+8,y+4,j*18+11,y+13,j*18+22,y+7);c.stroke();}}
 }else if(/water|sea|shallow/.test(k)){
  for(let i=0;i<35;i++){const x=hash(i,8)*128,y=hash(i,7)*128;c.strokeStyle='rgba(184,205,176,.17)';c.beginPath();c.ellipse(x,y,2+hash(i)*7,.8,0,0,Math.PI);c.stroke();}
 }else {
  for(let i=0;i<300;i++){const x=hash(i,1)*128,y=hash(i,2)*128,r=.3+hash(i,3)*1.2;c.fillStyle=i%3?'rgba(226,224,177,.09)':'rgba(18,36,21,.17)';c.fillRect(x,y,r,r);}
  if(/grass|forest|marsh|hills/.test(k))for(let i=0;i<70;i++){const x=hash(i,5)*128,y=hash(i,9)*128;c.strokeStyle=i%2?'rgba(20,41,21,.19)':'rgba(216,221,171,.17)';c.lineWidth=.7;c.beginPath();c.moveTo(x-1.7,y-2);c.lineTo(x,y);c.lineTo(x+1,y-3);c.stroke();}
  if(/mountain|peaks/.test(k))for(let i=0;i<15;i++){const x=hash(i,1)*128,y=hash(i,9)*128;c.strokeStyle='rgba(35,44,36,.14)';c.beginPath();c.moveTo(x-8,y+4);c.lineTo(x,y-8);c.lineTo(x+6,y+3);c.stroke();}
 }
 for(let i=0;i<80;i++){c.fillStyle=i%2?'rgba(249,241,209,.035)':'rgba(31,35,22,.025)';c.beginPath();c.arc(hash(i,10)*128,hash(i,11)*128,3+hash(i,12)*11,0,Math.PI*2);c.fill();}
 cache.set(key,t);return t;
}
function fillMaterial(c,id,x,y,w,h){const a=A().find(a=>a.id===id),p=c.createPattern(texture(a),'repeat');p.setTransform(new DOMMatrix().scale(1/32));c.fillStyle=p;c.fillRect(x,y,w,h);}
function drawProp(c,asset,opts={}) {
 if(!asset)return;const sprite=globalThis.HEARTH_INK_ART?.frames[asset.id];if(sprite&&atlas.complete&&atlas.naturalWidth){c.save();if(opts.shadow!==false){c.shadowColor='#26301e66';c.shadowBlur=2;c.shadowOffsetY=1;}const w=asset.size[0]*sprite.padding,h=asset.size[1]*sprite.padding;c.drawImage(atlas,sprite.x,sprite.y,sprite.width,sprite.height,-w/2,-h/2,w,h);c.restore();return;}const k=asset.key;
 const w=asset.size?.[0]||1,h=asset.size?.[1]||1;c.save();c.scale(w,h);c.lineJoin='round';c.lineCap='round';
 if(opts.shadow!==false){c.shadowColor='rgba(15,24,14,.4)';c.shadowBlur=.12;c.shadowOffsetX=.07;c.shadowOffsetY=.12;}
 const wood='#a48658',dark='#5a4b32',light='#bea476',stone='#999b83',ink='#393d2e';
 const planks=(x,y,pw,ph)=>{box(c,x,y,pw,ph,wood);for(let i=1;i<5;i++)line(c,x+pw*i/5,y+.02,x+pw*i/5,y+ph-.02,'#6a593c',.017);};
 const fire=()=>{ellipse(c,0,0,.25,.26,'#b97035',null);polygon(c,[[-.16,.12],[-.2,-.08],[-.07,-.02],[0,-.34],[.12,-.07],[.2,-.17],[.19,.17]],'#e4a14d','#9b672c',.02);ellipse(c,.02,.05,.085,.12,'#f4d68c',null);};
 const foliage=(pine=false)=>{
  if(pine){polygon(c,Array.from({length:24},(_,i)=>{const a=i*Math.PI/12,r=i%2?.31:.49;return[Math.cos(a)*r,Math.sin(a)*r];}),'#4d6340','#293b27',.025);polygon(c,Array.from({length:18},(_,i)=>{const a=i*Math.PI/9,r=i%2?.22:.38;return[Math.cos(a)*r-.04,Math.sin(a)*r-.06];}),'#62764a','#3d5131',.018);ellipse(c,-.07,-.1,.15,.16,'#74845a',null);}
  else {ellipse(c,0,.04,.44,.4,'#4e5e36',null);for(let i=0;i<9;i++){const a=i*2.399,r=.16+hash(i,8)*.13;ellipse(c,Math.cos(a)*r-.025,Math.sin(a)*r-.025,.2+hash(i,1)*.06,.18+hash(i,2)*.06,i%3===0?'#87925a':i%3===1?'#687c45':'#76864d','#445632',.018);}ellipse(c,-.06,-.1,.2,.16,'#8d9963',null);for(let i=0;i<40;i++){const a=hash(i,1)*6.28,r=hash(i,2)*.37;line(c,Math.cos(a)*r,Math.sin(a)*r,Math.cos(a)*r+.018,Math.sin(a)*r-.03,i%2?'#acb780':'#52683d',.01);}}
 };
 switch(k){
 case 'tree':case 'oak':case 'pine':case 'bush':case 'dry-bush':foliage(k==='pine');if(k==='dry-bush'){c.globalCompositeOperation='source-atop';box(c,-.5,-.5,1,1,'#9d875b66',null);}break;
 case 'dead-tree':{
  const branch=(x,y,angle,len,width,depth)=>{const bx=x+Math.cos(angle)*len,by=y+Math.sin(angle)*len;line(c,x,y,bx,by,'#35372a',width+.025);line(c,x,y,bx,by,'#9e9271',width);if(depth>0){branch(bx,by,angle-.6,len*.62,width*.6,depth-1);branch(bx,by,angle+.8,len*.53,width*.55,depth-1);}};
  for(let i=0;i<5;i++)branch(0,0,i*1.25,.23,.07,2);ellipse(c,0,0,.06,.06,'#6b6148');break;}
 case 'stump':ellipse(c,0,0,.43,.4,dark);ellipse(c,0,-.02,.35,.32,light);for(let r=.09;r<.3;r+=.07){c.beginPath();c.ellipse(0,-.02,r,r*.92,.2,0,6.28);c.strokeStyle='#89734e';c.lineWidth=.018;c.stroke();}break;
 case 'reeds':for(let i=0;i<15;i++){const x=(hash(i,1)-.5)*.75,y=(hash(i,2)-.5)*.75;line(c,x,y,x+.11,y-.19,'#9a9c63',.035);line(c,x,y,x-.08,y-.15,'#657246',.025);}break;
 case 'rock':case 'boulder':polygon(c,[[-.47,.1],[-.32,-.32],[.12,-.44],[.44,-.17],[.48,.2],[.15,.4],[-.21,.35]],'#8e9780');polygon(c,[[-.32,-.32],[.12,-.44],[.15,-.02],[-.15,.2]],'#b4b79c',null);polygon(c,[[.15,-.02],[.44,-.17],[.48,.2],[.15,.4]],'#707c67',null);line(c,-.17,.2,.15,-.02,'#6e7d65',.025);break;
 case 'barrel':ellipse(c,0,0,.46,.46,wood);for(let x=-.3;x<=.3;x+=.15)line(c,x,-Math.sqrt(.19-x*x),x,Math.sqrt(.19-x*x),'#75603c',.025);for(const r of [.35,.43]){c.beginPath();c.arc(0,0,r,0,6.28);c.strokeStyle='#4a4b3b';c.lineWidth=.045;c.stroke();}ellipse(c,.12,.12,.045,.045,dark,null);break;
 case 'crate':case 'hay':planks(-.45,-.45,.9,.9);if(k==='hay'){box(c,-.43,-.43,.86,.86,'#b3a268');for(let i=0;i<30;i++)line(c,-.4+hash(i)*.8,-.42+hash(i,1)*.8,-.3+hash(i)*.8,-.4+hash(i,1)*.8,'#d2bd7c',.012);line(c,-.23,-.44,-.23,.44,dark,.045);line(c,.23,-.44,.23,.44,dark,.045);}else{line(c,-.37,-.37,.37,.37,light,.095);line(c,-.37,.37,.37,-.37,light,.095);box(c,-.43,-.43,.86,.86,'#00000000',dark,.065);}break;
 case 'table':case 'workbench':case 'counter':case 'bench':planks(-.47,-.43,.94,.86);for(const [x,y]of [[-.4,-.35],[.4,-.35],[-.4,.35],[.4,.35]])ellipse(c,x,y,.018,.025,'#453f2d',null);if(k==='workbench'){box(c,.12,-.18,.23,.26,'#6a715c');line(c,-.28,-.1,-.1,.14,'#d2bd89',.05);}if(k==='counter')box(c,-.48,-.48,.96,.12,dark);break;
 case 'chair':planks(-.36,-.33,.72,.72);box(c,-.45,-.45,.9,.17,dark);break;
 case 'bed':box(c,-.46,-.48,.92,.96,dark);box(c,-.4,-.39,.8,.82,'#b0ac8c');box(c,-.38,-.1,.76,.5,'#738066');line(c,-.37,-.06,.37,-.06,'#a8b095',.04);box(c,-.31,-.34,.62,.2,'#d1cbb0','#8a8a70',.018);box(c,-.48,-.48,.96,.08,wood);break;
 case 'chest':planks(-.46,-.43,.92,.86);for(const x of [-.29,.29])box(c,x-.035,-.45,.07,.9,'#535847');box(c,-.07,.29,.14,.17,'#d0b674','#4c4b37',.025);break;
 case 'bookshelf':case 'shelf':box(c,-.49,-.44,.98,.88,dark);for(let i=0;i<11;i++){const x=-.42+i*.077;box(c,x,-.31,.06,.53,['#71806a','#a08d60','#a9674d','#788b84'][i%4],'#343e30',.015);line(c,x+.012,-.2,x+.045,-.2,'#d1c29c',.012);}box(c,-.49,.33,.98,.1,wood);break;
 case 'carpet':box(c,-.49,-.49,.98,.98,'#845b45','#584b35',.03);box(c,-.41,-.42,.82,.84,'#5f6d4e','#c1a87b',.03);polygon(c,[[0,-.29],[.27,0],[0,.29],[-.27,0]],'#aa976d','#c1b18a',.02);for(let i=0;i<10;i++){line(c,-.42+i*.09,-.49,-.42+i*.09,-.56,'#baaa7e',.02);line(c,-.42+i*.09,.49,-.42+i*.09,.56,'#baaa7e',.02);}break;
 case 'altar':box(c,-.46,-.42,.92,.84,'#686f60');box(c,-.5,-.46,1,.86,stone);box(c,-.14,-.47,.28,.91,'#798363','#b8b795',.025);ellipse(c,-.32,-.2,.06,.07,'#dbc58a');ellipse(c,.32,-.2,.06,.07,'#dbc58a');break;
 case 'statue':box(c,-.46,-.46,.92,.92,'#727d68');box(c,-.36,-.36,.72,.72,'#a0a58c');polygon(c,[[-.26,.18],[-.21,-.05],[-.32,-.19],[.32,-.19],[.21,-.05],[.26,.18]],'#6c7865');ellipse(c,0,-.14,.17,.18,'#b4b7a0');break;
 case 'well':ellipse(c,0,0,.48,.48,stone);ellipse(c,0,0,.31,.31,'#354338');for(let i=0;i<10;i++){const a=i*6.28/10;line(c,Math.cos(a)*.33,Math.sin(a)*.33,Math.cos(a)*.46,Math.sin(a)*.46,'#58664f',.025);}box(c,-.5,-.05,1,.1,dark);break;
 case 'tent':polygon(c,[[-.47,-.47],[.47,-.47],[.47,.47],[-.47,.47]],'#a79e78');polygon(c,[[0,-.47],[.47,-.47],[.47,.47],[0,.47]],'#827f5e');line(c,0,-.5,0,.5,'#d0c99f',.04);for(const [x,y]of [[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]])line(c,x,y,x*1.2,y*1.2,'#b8ab7c',.025);break;
 case 'cart':box(c,-.5,-.32,.13,.64,'#414a3a');box(c,.37,-.32,.13,.64,'#414a3a');planks(-.36,-.4,.72,.7);line(c,-.28,.3,-.28,.55,dark,.06);line(c,.28,.3,.28,.55,dark,.06);break;
 case 'stairs-up':case 'stairs-down':box(c,-.48,-.5,.96,1,'#626e5b');for(let i=0;i<7;i++)box(c,-.45,-.48+i*.14,.9,.13,'rgb('+(125+i*7)+','+(135+i*6)+','+(112+i*5)+')','#525e4b',.018);line(c,0,.25,0,-.22,'#d8d8b9',.025);line(c,0,-.22,-.1,-.1,'#d8d8b9',.025);line(c,0,-.22,.1,-.1,'#d8d8b9',.025);break;
 case 'ladder':for(const x of [-.36,.36])box(c,x-.035,-.5,.07,1,wood);for(let i=0;i<7;i++)box(c,-.36,-.45+i*.14,.72,.04,light);break;
 case 'trapdoor':planks(-.47,-.47,.94,.94);for(const y of [-.3,.3])box(c,-.44,y-.03,.88,.06,'#525746');ellipse(c,.26,.07,.07,.085,'#857d57','#363e2d',.035);break;
 case 'torch':case 'wall-torch':line(c,0,.4,0,-.25,wood,.13);fire();break;
 case 'brazier':case 'campfire':case 'hearth':case 'forge':if(k==='campfire'){for(let i=0;i<9;i++){const a=i*6.28/9;ellipse(c,Math.cos(a)*.4,Math.sin(a)*.4,.09,.08,'#92977d');}line(c,-.26,-.12,.26,.16,wood,.13);line(c,-.2,.23,.24,-.2,dark,.13);}else if(k==='brazier')ellipse(c,0,0,.42,.42,'#535b47');else {box(c,-.49,-.46,.98,.92,stone);box(c,-.34,-.31,.68,.65,'#3a4131');}fire();break;
 case 'anvil':box(c,-.35,-.36,.7,.72,dark);polygon(c,[[-.45,-.18],[.23,-.18],[.48,0],[.23,.16],[-.45,.16]],'#727c70','#343d33',.04);line(c,-.35,-.12,.2,-.12,'#a1a99a',.025);break;
 case 'rack':box(c,-.49,-.4,.98,.8,dark);for(let i=0;i<5;i++){line(c,-.36+i*.18,.31,-.31+i*.18,-.33,'#b6bda4',.04);line(c,-.39+i*.18,.17,-.25+i*.18,.18,wood,.045);}break;
 default:box(c,-.45,-.4,.9,.8,wood);
 }
 c.restore();
}
function drawWorld(c,map,options={}){
 const scale=options.ppg||32,grid=options.grid??true;
 c.save();c.beginPath();c.rect(0,0,map.width,map.height);c.clip();
 const drawPaint=strokes=>{for(const stroke of strokes){if(!stroke.points.length)continue;c.save();c.beginPath();if(stroke.points.length===1)c.arc(stroke.points[0].x,stroke.points[0].y,stroke.radius,0,Math.PI*2);else{c.lineWidth=stroke.radius*2;c.lineCap='round';c.lineJoin='round';c.strokeStyle='#000';c.moveTo(stroke.points[0].x,stroke.points[0].y);for(const p of stroke.points)c.lineTo(p.x,p.y);const p=c.createPattern(texture(A().find(a=>a.id===stroke.material)),'repeat');p.setTransform(new DOMMatrix().scale(1/32));c.strokeStyle=p;c.stroke();c.restore();continue;}c.clip();fillMaterial(c,stroke.material,0,0,map.width,map.height);c.restore();}};
 if(options.visible?.terrain!==false){fillMaterial(c,map.base,0,0,map.width,map.height);drawPaint(map.paint.filter(s=>!s.material.startsWith('floor-')));}
 else box(c,0,0,map.width,map.height,'#b5b69b',null);
 if(options.visible?.rooms!==false)for(const r of map.rooms){c.save();c.shadowColor='#25322366';c.shadowBlur=.3;fillMaterial(c,r.material,r.x,r.y,r.w,r.h);c.restore();}
 if(options.visible?.rooms!==false)drawPaint(map.paint.filter(s=>s.material.startsWith('floor-')));
 if(grid){c.lineWidth=.6/scale;c.strokeStyle='rgba(30,40,27,.18)';c.beginPath();for(let x=0;x<=map.width;x++){c.moveTo(x,0);c.lineTo(x,map.height);}for(let y=0;y<=map.height;y++){c.moveTo(0,y);c.lineTo(map.width,y);}c.stroke();}
 if(options.visible?.walls!==false){
  for(const w of map.walls){const a=A().find(a=>a.id===w.material),segments=C.lineOfSight({walls:[w],doors:map.doors});for(const [start,end]of segments){line(c,start.x+.09,start.y+.12,end.x+.09,end.y+.12,'#17231866',.42);line(c,start.x,start.y,end.x,end.y,'#343c2e',.38);line(c,start.x,start.y,end.x,end.y,a?.color||'#949e83',.25);line(c,start.x-.035,start.y-.035,end.x-.035,end.y-.035,'#c0c4a080',.04);const l=C.distance(start,end);for(let i=.25;i<l;i+=.5){const t=i/l,x=start.x+(end.x-start.x)*t,y=start.y+(end.y-start.y)*t,ux=(end.x-start.x)/l,uy=(end.y-start.y)/l;line(c,x-uy*.14,y+ux*.14,x+uy*.14,y-ux*.14,'#39453299',.022);}}}
  for(const d of map.doors){c.save();c.translate(d.x,d.y);c.rotate(d.rotation);box(c,-d.width/2,-.11,d.width,.22,d.closed?'#a78b59':'#7b9a70','#3e4833',.04);for(const x of [-d.width/2,d.width/2])box(c,x-.04,-.17,.08,.34,'#505b43');line(c,-d.width/2,.15,d.width/2,.15,'#c7b381',.03);c.restore();}
 }
 if(options.visible?.props!==false)for(const p of map.props){c.save();c.translate(p.x,p.y);c.rotate((p.rotation||0)*Math.PI/180);c.scale(p.scale||1,p.scale||1);drawProp(c,A().find(a=>a.id===p.asset));c.restore();}
 if(options.lighting){box(c,0,0,map.width,map.height,'#101c2b88',null);c.save();c.globalCompositeOperation='screen';for(const l of map.lights){const g=c.createRadialGradient(l.x,l.y,0,l.x,l.y,l.range);g.addColorStop(0,l.color+'aa');g.addColorStop(.25,l.color+'55');g.addColorStop(1,l.color+'00');c.globalAlpha=Math.min(1,l.intensity);c.fillStyle=g;c.fillRect(l.x-l.range,l.y-l.range,l.range*2,l.range*2);}c.restore();}
 if(options.visible?.labels!==false)for(const l of map.labels){c.font=l.size+'px Georgia';c.textAlign='center';c.textBaseline='middle';c.strokeStyle='#d9d4af';c.lineWidth=.055;c.strokeText(l.text,l.x,l.y);c.fillStyle='#3e4933';c.fillText(l.text,l.x,l.y);}
 if(options.showLights&&options.visible?.lights!==false)for(const l of map.lights){c.save();c.setLineDash([.15,.12]);c.beginPath();c.arc(l.x,l.y,l.range,0,6.28);c.strokeStyle=l.color+'99';c.lineWidth=1/scale;c.stroke();c.setLineDash([]);ellipse(c,l.x,l.y,.14,.14,l.color,'#fff3d0',.03);c.restore();}
 c.restore();
}
function thumbnail(canvas,asset){const dpr=Math.min(devicePixelRatio||1,2),w=canvas.clientWidth||110,h=canvas.clientHeight||78;canvas.width=w*dpr;canvas.height=h*dpr;const c=canvas.getContext('2d');c.scale(dpr,dpr);c.translate(w/2,h/2);if(asset.category==='props'){const largest=Math.max(...asset.size),s=Math.min(w*.68,h*.72)/largest;c.scale(s,s);drawProp(c,asset,{shadow:false});}else {c.scale(22,22);c.rotate(-.12);c.shadowColor='#14201566';c.shadowOffsetY=.15;c.shadowBlur=.3;fillMaterial(c,asset.id,-1.5,-1.15,3,2.3);c.shadowColor='transparent';if(asset.category==='walls'){box(c,-1.5,-.3,3,.6,asset.color,'#283124',.1);for(let x=-1.4;x<1.4;x+=.45)line(c,x,-.3,x,.3,'#343b2a',.04);}c.strokeStyle='#c0c29a55';c.lineWidth=.025;c.strokeRect(-1.5,-1.15,3,2.3);}}
globalThis.HearthRender={ready,drawWorld,drawProp,thumbnail,fillMaterial,box,line,ellipse};
})();