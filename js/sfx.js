// Runtime-only, procedural dark-fantasy audio. No context or nodes are created on import.
export const SFX = [
  ['thunder','Thunder','cloud-bolt'], ['sword','Sword clash','khanda'],
  ['arrow','Arrow','location-arrow'], ['fireball','Fireball','fire'],
  ['explosion','Explosion','burst'], ['magic','Magic','wand-magic-sparkles'],
  ['heal','Healing','heart'], ['door','Wooden door','door-open'],
  ['gate','Iron gate','dungeon'], ['footsteps','Stone footsteps','shoe-prints'],
  ['coins','Coins','coins'], ['roar','Monster roar','dragon'],
  ['scream','Eerie scream','ghost'], ['bell','Deep bell','bell'],
  ['horn','War horn','bullhorn'], ['crit','Natural 20','crown'],
  ['fail','Natural 1','skull'], ['heartbeat','Heartbeat','heart-pulse'],
  ['glass','Breaking glass','wine-glass'], ['splash','Splash','water']
].map(([id,name,icon]) => ({id,name,icon}));
export const AMBIENCE = [
  ['rain','Rain','cloud-rain'], ['storm','Thunderstorm','cloud-bolt'],
  ['wind','Wind','wind'], ['fire','Campfire','fire'], ['cave','Cave','mountain'],
  ['tavern','Tavern','beer-mug-empty'], ['forest','Forest','tree'],
  ['ocean','Ocean','water'], ['dungeon','Dungeon','dungeon'],
  ['swamp','Swamp','frog'], ['night','Night','moon'], ['battle','Distant battle','shield-halved']
].map(([id,name,icon]) => ({id,name,icon}));

const cache = new WeakMap();
const rand = (a,b) => a + Math.random()*(b-a);
const level = v => Number.isFinite(v) ? Math.max(0,Math.min(1,v)) : 0;
function buffers(ctx) {
  if (cache.has(ctx)) return cache.get(ctx);
  const noise = ctx.createBuffer(1,ctx.sampleRate*4,ctx.sampleRate);
  const n = noise.getChannelData(0);
  // Crossfade the noise seam, so even the unfiltered looping source is continuous.
  for(let i=0;i<n.length;i++) n[i]=rand(-1,1);
  const seam = Math.floor(ctx.sampleRate*.03);
  for(let i=0;i<seam;i++) {
    const x=i/(seam-1); n[n.length-seam+i]=n[n.length-seam+i]*(1-x)+n[i]*x;
  }
  n[n.length-1]=n[0];
  const impulse=ctx.createBuffer(2,Math.ceil(ctx.sampleRate*2.8),ctx.sampleRate);
  for(let c=0;c<2;c++) {
    const d=impulse.getChannelData(c);
    for(let i=0;i<d.length;i++) d[i]=rand(-1,1)*Math.exp(-i/(ctx.sampleRate*.48))*.38;
  }
  const result={noise,impulse}; cache.set(ctx,result); return result;
}
function voice(ctx,dest,volume,fade=0,scale=.9) {
  const nodes=new Set(), sources=new Set();
  const node=n => {nodes.add(n);return n;};
  const out=node(ctx.createGain()), dry=node(ctx.createGain());
  const reverb=node(ctx.createConvolver()), wet=node(ctx.createGain());
  reverb.buffer=buffers(ctx).impulse; wet.gain.value=.16;
  dry.connect(out); dry.connect(reverb); reverb.connect(wet); wet.connect(out); out.connect(dest);
  const now=ctx.currentTime;
  out.gain.setValueAtTime(fade>0?0:level(volume)*scale,now);
  if(fade>0) out.gain.linearRampToValueAtTime(level(volume)*scale,now+fade);
  let disposed=false;
  function source(s,t,d,release=[]) {
    sources.add(s); s.onended=()=>{ sources.delete(s); try{s.disconnect();}catch{} for(const n of release){n.disconnect();nodes.delete(n);} };
    if(s.buffer && s.buffer.length>1)s.start(t,rand(0,s.buffer.duration));else s.start(t); if(d!==undefined) s.stop(t+d); return s;
  }
  function env(t,d,a,attack=.01) {
    const g=node(ctx.createGain());
    g.gain.setValueAtTime(0,t);
    g.gain.linearRampToValueAtTime(a,t+Math.min(attack,d*.3));
    g.gain.exponentialRampToValueAtTime(.00001,t+d);
    g.gain.setValueAtTime(0,t+d+.005); g.connect(dry); return g;
  }
  function tone(t,d,f,a=.2,type='sine',end=f,attack=.01) {
    const s=ctx.createOscillator(), g=env(t,d,a,attack);
    s.type=type; s.detune.value=rand(-9,9); s.frequency.setValueAtTime(f,t); s.frequency.exponentialRampToValueAtTime(Math.max(10,end),t+d);
    s.connect(g); source(s,t,d+.01,[g]); return s;
  }
  function noise(t,d,a=.3,f=1000,q=.7,type='lowpass',attack=.01,end=f) {
    const s=ctx.createBufferSource(), filter=node(ctx.createBiquadFilter());
    s.buffer=buffers(ctx).noise; s.loop=true;
    filter.type=type; filter.frequency.setValueAtTime(f,t);filter.frequency.exponentialRampToValueAtTime(Math.max(20,end),t+d);filter.Q.value=q;
    const g=env(t,d,a,attack);s.connect(filter);filter.connect(g);
    source(s,t,d+.01,[filter,g]);return s;
  }
  function bed(a,f,type='lowpass',rate=.12,depth=.3) {
    const s=ctx.createBufferSource(), filter=node(ctx.createBiquadFilter()), g=node(ctx.createGain());
    s.buffer=buffers(ctx).noise;s.loop=true;filter.type=type;filter.frequency.value=f;filter.Q.value=.6;
    g.gain.value=a; s.connect(filter);filter.connect(g);g.connect(dry);
    const l=ctx.createOscillator(),lg=node(ctx.createGain());l.frequency.value=rate;lg.gain.value=a*depth;l.connect(lg);lg.connect(g.gain);
    source(s,now);source(l,now);
  }
  function drone(f,a,rate=.1) {
    const s=ctx.createOscillator(),g=node(ctx.createGain()),l=ctx.createOscillator(),lg=node(ctx.createGain());
    s.frequency.value=f;g.gain.value=a;l.frequency.value=rate;lg.gain.value=a*.25;
    s.connect(g);g.connect(dry);l.connect(lg);lg.connect(g.gain);source(s,now);source(l,now);
  }
  function clean(){if(disposed)return;disposed=true;for(const s of sources){try{s.stop();}catch{}s.disconnect();}sources.clear();for(const n of nodes)n.disconnect();nodes.clear();}
  return {ctx,out,tone,noise,bed,drone,clean};
}
function effect(v,id,t) {
  const {tone:T,noise:N}=v;
  const metal=(at,f,a=.13,d=1)=>{[1,1.47,2.09,2.73].forEach((r,i)=>T(at,d/(1+i*.2),f*r,a/(i+1)));};
  switch(id) {
    case 'thunder': N(t, .22,.85,2400,.5,'lowpass',.002,180);N(t+.06,4,.85,150,.6,'lowpass',.06,40);T(t,2,49,.22,'sine',28);return 4.2;
    case 'sword': N(t,.08,.35,4500,.8,'highpass',.001);metal(t,rand(650,850),.22,1.8);return 2;
    case 'arrow': N(t,.3,.5,1900,1,'bandpass',.08,550);N(t+.28,.16,.55,450);T(t+.28,.15,140,.28,'sine',65);return .6;
    case 'fireball': N(t,.65,.65,800,1,'bandpass',.2,2800);N(t+.5,1.9,.75,800,.6,'lowpass',.025,90);T(t+.5,1,85,.18,'sine',30);return 2.6;
    case 'explosion': N(t,.18,.8,2000,.6,'lowpass',.002,300);N(t,2.8,.9,150,.7,'lowpass',.008,35);T(t,1,65,.38,'sine',25);return 3;
    case 'magic': for(let i=0;i<18;i++) {const f=rand(700,2400);T(t+i*.065,.65,f,.065);T(t+i*.065,.4,f*1.502,.025);}return 2;
    case 'heal': [523.25,659.25,783.99,1046.5].forEach((f,i)=>{T(t+i*.22,1.5,f,.16,'sine',f,.06);T(t+i*.22,1.1,f*2,.035);});return 2.3;
    case 'door': N(t,1,.3,440,7,'bandpass',.09,170);T(t,.9,140,.055,'triangle',63,.1);N(t+1,.2,.6,320);T(t+1,.23,85,.25,'sine',40);return 1.4;
    case 'gate': for(let i=0;i<7;i++){metal(t+i*.17,rand(160,240),.055,.5);N(t+i*.17,.13,.2,700);}N(t+1.3,.65,.65,170);metal(t+1.3,95,.2,1.5);return 3;
    case 'footsteps': for(let i=0;i<4;i++){N(t+i*.43,.15,.5,rand(550,1000));T(t+i*.43,.12,rand(90,130),.16,'sine',45);}return 1.7;
    case 'coins': for(let i=0;i<9;i++)metal(t+rand(0,.65),rand(1700,2900),.055,.45);return 1.2;
    case 'roar': N(t,2.5,.7,420,3,'bandpass',.2,180);N(t,2.3,.35,1000,2,'bandpass',.25,480);T(t,2.4,65,.10,'sawtooth',34,.2);return 2.7;
    case 'scream': {const s=T(t,2.8,420,.16,'triangle',850,.35);const l=v.ctx.createOscillator(),g=v.ctx.createGain();l.frequency.value=6;g.gain.value=22;l.connect(g);g.connect(s.frequency);l.start(t);l.stop(t+2.8);l.onended=()=>{l.disconnect();g.disconnect();};N(t,2.6,.13,1400,3,'bandpass',.3,2400);return 3;}
    case 'bell': [1,2.01,2.76,4.07,5.43].forEach((r,i)=>T(t,5-i*.65,110*r,.25/(i+1),'sine',110*r,.003));return 5.2;
    case 'horn': for(let h=1;h<=6;h++)T(t,2.6,110*h,.22/(h*h),'sine',116*h,.25);return 2.8;
    case 'crit': [261.63,329.63,392,523.25].forEach((f,i)=>{T(t+i*.13,.85,f,.18,'triangle');T(t+i*.13,.9,f*2,.045);});return 1.5;
    case 'fail': [220,174.61,130.81,82.41].forEach((f,i)=>T(t+i*.23,.55,f,.23,'triangle',f*.94));return 1.5;
    case 'heartbeat': for(let i=0;i<3;i++){T(t+i*.8,.16,64,.5,'sine',38);T(t+i*.8+.22,.14,55,.35,'sine',32);}return 2;
    case 'glass': N(t,.12,.5,3500,.6,'highpass',.001);for(let i=0;i<26;i++)T(t+rand(0,.65),rand(.08,.5),rand(2200,7000),.027);return 1.3;
    case 'splash': N(t,.65,.7,900,.7,'lowpass',.015,260);for(let i=0;i<12;i++)T(t+rand(.1,.65),.12,rand(400,1400),.04,'sine',rand(100,300));return .9;
    default:return 0;
  }
}
export function playSfx(ctx,dest,id,{volume=1}={}) {
  if(!SFX.some(s=>s.id===id))return Promise.resolve();
  const v=voice(ctx,dest,volume), t=ctx.currentTime+.005;
  const duration=effect(v,id,t)+2.8;
  return new Promise(resolve=>{
    const end=ctx.createBufferSource();end.buffer=ctx.createBuffer(1,1,ctx.sampleRate);
    end.onended=()=>{end.disconnect();v.clean();resolve();};end.start(t+duration);
  });
}
export function startAmbience(ctx,dest,id,{volume=1,fadeIn=2}={}) {
  if(!AMBIENCE.some(s=>s.id===id))return {setVolume(){},stop(){}};
  const v=voice(ctx,dest,volume,Math.max(0,fadeIn),.22),t=ctx.currentTime;
  const {bed:B,drone:D,tone:T,noise:N}=v;
  switch(id) {
    case 'rain':case 'storm':B(.38,2900,'lowpass',.09,.18);B(.12,6000,'highpass',.17,.12);break;
    case 'wind': B(.4,650,'lowpass',.11,.7);B(.10,380,'bandpass',.07,.8);break;
    case 'fire':B(.45,230,'lowpass',.23,.35);B(.12,1800,'lowpass',.7,.4);break;
    case 'cave':D(48,.09);D(72.3,.04);B(.08,320,'lowpass',.08,.5);break;
    case 'tavern':for(let i=0;i<4;i++)B(.11,250+i*260,'bandpass',.3+i*.11,.8);B(.12,180,'lowpass',.1,.2);break;
    case 'forest':B(.24,1800,'lowpass',.13,.55);B(.11,4200,'highpass',.2,.4);break;
    case 'ocean':B(.6,1000,'lowpass',.075,.85);B(.18,3400,'lowpass',.075,.9);break;
    case 'dungeon':D(39,.10);D(58.7,.065);D(78.3,.025);B(.1,180,'lowpass',.07,.5);break;
    case 'swamp':B(.07,2400,'bandpass',.8,.8);D(62,.025);break;
    case 'night':B(.035,4800,'bandpass',.13,.5);break;
    case 'battle':B(.4,160,'lowpass',.12,.5);B(.12,700,'bandpass',.3,.6);break;
  }
  const interval={rain:1.3,storm:5,wind:4,fire:.22,cave:1.7,tavern:1.2,forest:2.5,ocean:4,dungeon:3.8,swamp:.8,night:.26,battle:1.5}[id];
  let next=t+.1, stopped=false, timer;
  function event(at) {
    switch(id) {
      case 'rain':N(at,.08,.04,3000);break;
      case 'storm':N(at,4,.33,100,.7,'lowpass',.4,35);break;
      case 'wind':N(at,3,.10,460,2,'bandpass',1,220);break;
      case 'fire':N(at,rand(.015,.09),rand(.06,.22),rand(1000,4000),.5,'lowpass',.001);break;
      case 'cave':T(at,.25,rand(700,1400),.08,'sine',350);T(at+.12,.4,520,.025);break;
      case 'tavern':T(at,.32,rand(1400,2200),.035);T(at,.2,2800,.015);break;
      case 'forest':for(let j=0;j<3;j++)T(at+j*.14,.12,rand(1800,2600),.035,'sine',rand(2800,3600),.02);break;
      case 'ocean':N(at,3,.10,1700,.6,'lowpass',1,400);break;
      case 'dungeon':if(Math.random()<.5){T(at,1.5,rand(80,130),.025,'triangle',55,.2);N(at,1,.05,420,5,'bandpass',.1,170);}else{for(let j=0;j<3;j++)T(at+j*.13,.4,rand(600,1400),.035);}break;
      case 'swamp':T(at,.23,rand(150,220),.085,'triangle',85,.025);T(at+.28,.15,190,.04,'triangle',110);break;
      case 'night':for(let j=0;j<3;j++)T(at+j*.045,.025,rand(3900,4400),.045,'sine',4100,.005);break;
      case 'battle':if(Math.random()<.5){T(at,.6,rand(350,650),.055);N(at,.1,.13,1700);}else{N(at,1,.14,500,3,'bandpass',.15,250);T(at,.7,95,.025,'sawtooth',65,.1);}break;
    }
  }
  // Look ahead far enough for offline rendering, while browser timers replenish
  // the schedule during real-time playback. Random events never depend on loop seams.
  function schedule(){if(stopped)return;while(next<ctx.currentTime+12){event(next);next+=interval*rand(.7,1.3);}timer=setTimeout(schedule,1000);}
  schedule();
  return {
    setVolume(value,sec=.5){if(stopped)return;const at=ctx.currentTime;v.out.gain.cancelAndHoldAtTime(at);v.out.gain.linearRampToValueAtTime(level(value)*.22,at+Math.max(.005,sec));},
    stop(fadeOut=2){if(stopped)return;stopped=true;clearTimeout(timer);const at=ctx.currentTime,d=Math.max(.005,Number.isFinite(fadeOut)?fadeOut:2);v.out.gain.cancelAndHoldAtTime(at);v.out.gain.linearRampToValueAtTime(0,at+d);const end=ctx.createBufferSource();end.buffer=ctx.createBuffer(1,1,ctx.sampleRate);end.onended=()=>{end.disconnect();v.clean();};end.start(at+d+.02);}
  };
}


