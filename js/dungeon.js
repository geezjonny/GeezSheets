// dungeon.js — procedural dungeon generator
// Generates a tile-based dungeon, renders to canvas, pushes to RTDB
// Used by rollers.html and mapeditor.html GM Tools panel

import { db }      from "./firebase.js";
import { ref, set } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-database.js";
import { pick, d, POI_TABLE, HAZARD, DANGER_TABLE, TREASURE_SPECIALS, LOOT, ENEMY_TABLE } from "./rollers.js";

// ── Cell types ────────────────────────────────────────────────────────────────
export const CELL = { VOID:0, FLOOR:1, WALL:2, CORRIDOR:3, DOOR:4 };

// ── Config ────────────────────────────────────────────────────────────────────
export const DUNGEON_SIZES = {
  small:  { w:14, h:10, tileSize:40 },
  medium: { w:22, h:16, tileSize:34 },
  large:  { w:32, h:24, tileSize:25 },
};

export const DUNGEON_DENSITY = {
  sparse: { minRooms:3,  maxRooms:5,  minW:3, maxW:5, minH:3, maxH:4 },
  normal: { minRooms:5,  maxRooms:9,  minW:3, maxW:6, minH:3, maxH:5 },
  dense:  { minRooms:8,  maxRooms:14, minW:2, maxW:4, minH:2, maxH:4 },
};

export const DUNGEON_PALETTE = {
  ruins: { floor:"#6b5e4e", wall:"#3a3228", wallStroke:"#1a1410", corridor:"#7a6e5e", door:"#8a5a2a", void:"#2a2018", fog:"rgba(10,14,40,0.78)" },
  cave:  { floor:"#5a5040", wall:"#2e2820", wallStroke:"#141008", corridor:"#6a604e", door:"#7a5020", void:"#1e1a10", fog:"rgba(5,10,5,0.80)"   },
  crypt: { floor:"#5a5560", wall:"#2a2830", wallStroke:"#0e0c14", corridor:"#6a6572", door:"#7a3838", void:"#18161e", fog:"rgba(10,5,25,0.82)"  },
  sewer: { floor:"#4a5848", wall:"#282e28", wallStroke:"#101410", corridor:"#5a6858", door:"#6a5838", void:"#141a12", fog:"rgba(5,15,5,0.80)"   },
};

export const TOKEN_TABLES = {
  ruins: { npcs:["Guard","Scout","Bandit","Mercenary"],            monsters:["Goblin","Skeleton","Zombie","Rat Swarm","Cultist"],                  bosses:["Bandit Lord","Undead Knight","Mage"] },
  cave:  { npcs:["Lost Miner","Hermit"],                           monsters:["Giant Spider","Bat Swarm","Kobold","Troglodyte","Cave Bear"],         bosses:["Troll","Basilisk","Dragon Wyrmling"] },
  crypt: { npcs:["Grave Robber","Cleric"],                         monsters:["Skeleton","Zombie","Shadow","Ghoul","Specter"],                       bosses:["Lich","Death Knight","Mummy Lord"] },
  sewer: { npcs:["Urchin","Spy"],                                  monsters:["Giant Rat","Otyugh","Troglodyte","Were-rat","Crocodile"],             bosses:["Thieves Guild Master","Aboleth","Sewer Hag"] },
};

export const STAMP_TABLES = {
  ruins: ["💀","⚔️","🛡️","🔥","💰","🗝️","📜","🗡️","⭐","❗"],
  cave:  ["💀","🦴","🕷️","🌿","💎","❄️","🍄","🐍","⭐","🔒"],
  crypt: ["💀","⚰️","🕯️","☠️","📜","🗝️","👁️","🧪","❗","🔒"],
  sewer: ["💀","🪣","🐀","🍄","⛓️","🔥","🗝️","💧","❗","🔒"],
};

export const STAMP_MEANINGS = {
  "💀":"Danger — death nearby","⚔️":"Combat likely","🛡️":"Former defender","🔥":"Fire hazard",
  "💰":"Treasure here","🗝️":"A key — to something","📜":"Important text or clue","🗡️":"Weapon or violence",
  "⭐":"Point of interest","❗":"Warning","🦴":"Old bones","🕷️":"Spider territory","🌿":"Unusual growth",
  "💎":"Gemstone or mineral","❄️":"Magical cold","🍄":"Fungal growth","🐍":"Snake or reptile",
  "🔒":"Sealed / locked","⚰️":"A sarcophagus","🕯️":"Ritual or shrine","☠️":"Skull — death magic",
  "👁️":"Being watched","🧪":"Alchemical remnants","🪣":"Container","🐀":"Rats — infestation",
  "⛓️":"Someone was restrained here","💧":"Water — flooding risk",
};

// ── Generator ─────────────────────────────────────────────────────────────────
function rInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

export function generateDungeon(sizeKey = "medium", typeKey = "ruins", densityKey = "normal") {
  const { w, h, tileSize } = DUNGEON_SIZES[sizeKey];
  const dc                 = DUNGEON_DENSITY[densityKey];
  const { npcs, monsters, bosses } = TOKEN_TABLES[typeKey];
  const stampPool          = STAMP_TABLES[typeKey];

  const grid = Array.from({ length: h }, () => Array(w).fill(CELL.VOID));
  const rooms = [];
  const numRooms = rInt(dc.minRooms, dc.maxRooms);

  // Place rooms
  for (let r = 0; r < numRooms; r++) {
    for (let attempt = 0; attempt < 200; attempt++) {
      const rw = rInt(dc.minW, dc.maxW), rh = rInt(dc.minH, dc.maxH);
      const rx = rInt(1, w - rw - 2),   ry = rInt(1, h - rh - 2);
      let ok = true;
      for (const rm of rooms) {
        if (rx < rm.x+rm.w+1 && rx+rw > rm.x-1 && ry < rm.y+rm.h+1 && ry+rh > rm.y-1) { ok=false; break; }
      }
      if (ok) {
        rooms.push({ x:rx, y:ry, w:rw, h:rh });
        for (let cy=ry; cy<ry+rh; cy++) for (let cx=rx; cx<rx+rw; cx++) grid[cy][cx] = CELL.FLOOR;
        break;
      }
    }
  }

  // Connect rooms with corridors
  const shuffled = [...rooms].sort(() => Math.random() - 0.5);
  for (let i = 1; i < shuffled.length; i++) {
    const a = shuffled[i-1], b = shuffled[i];
    const ax = Math.floor(a.x+a.w/2), ay = Math.floor(a.y+a.h/2);
    const bx = Math.floor(b.x+b.w/2), by = Math.floor(b.y+b.h/2);
    const midX = Math.random() < 0.5 ? ax : bx;
    const midY = Math.random() < 0.5 ? ay : by;
    for (let cx=Math.min(ax,midX); cx<=Math.max(ax,midX); cx++) if (grid[ay][cx]===CELL.VOID) grid[ay][cx]=CELL.CORRIDOR;
    for (let cy=Math.min(ay,midY); cy<=Math.max(ay,midY); cy++) if (grid[cy][midX]===CELL.VOID) grid[cy][midX]=CELL.CORRIDOR;
    for (let cx=Math.min(midX,bx); cx<=Math.max(midX,bx); cx++) if (grid[by][cx]===CELL.VOID) grid[by][cx]=CELL.CORRIDOR;
    for (let cy=Math.min(midY,by); cy<=Math.max(midY,by); cy++) if (grid[cy][bx]===CELL.VOID) grid[cy][bx]=CELL.CORRIDOR;
  }

  // Add walls around floor/corridor tiles
  const dirs8 = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
  for (let cy=0; cy<h; cy++) for (let cx=0; cx<w; cx++) {
    if (grid[cy][cx] !== CELL.VOID) continue;
    for (const [dy,dx] of dirs8) {
      const ny=cy+dy, nx=cx+dx;
      if (ny>=0&&ny<h&&nx>=0&&nx<w && (grid[ny][nx]===CELL.FLOOR||grid[ny][nx]===CELL.CORRIDOR)) {
        grid[cy][cx]=CELL.WALL; break;
      }
    }
  }

  // Place doors at room perimeters
  for (const rm of rooms) {
    const perim = [];
    for (let cx=rm.x; cx<rm.x+rm.w; cx++) { perim.push([rm.y,cx]); perim.push([rm.y+rm.h-1,cx]); }
    for (let cy=rm.y; cy<rm.y+rm.h; cy++) { perim.push([cy,rm.x]); perim.push([cy,rm.x+rm.w-1]); }
    for (const [cy,cx] of perim) {
      for (const [dy,dx] of [[0,1],[0,-1],[1,0],[-1,0]]) {
        const ny=cy+dy, nx=cx+dx;
        if (ny>=0&&ny<h&&nx>=0&&nx<w && grid[ny][nx]===CELL.CORRIDOR && Math.random()<0.5) {
          grid[ny][nx]=CELL.DOOR;
        }
      }
    }
  }

  // Build output objects
  const tiles={}, fogCells={}, tokens={}, stamps={}, props={};
  let tileCount=0, tokId=1;

  for (let cy=0; cy<h; cy++) for (let cx=0; cx<w; cx++) {
    const t = grid[cy][cx]; if (t===CELL.VOID) continue;
    const key = `${cx},${cy}`;
    tiles[key] = { terrain: t===CELL.DOOR ? "wood" : "stone", walls: t===CELL.WALL };
    fogCells[key] = true; tileCount++;
  }

  // Place tokens in rooms
  for (let i=0; i<rooms.length; i++) {
    const rm = rooms[i];
    const cx = Math.floor(rm.x+rm.w/2), cy = Math.floor(rm.y+rm.h/2);
    let name, hp=10, maxHp=10;
    if (i===rooms.length-1 && rooms.length>1) { name=pick(bosses); hp=rInt(40,80); maxHp=hp; }
    else if (i===0)                            { name=pick(npcs);   hp=rInt(6,14);  maxHp=hp; }
    else if (Math.random()<0.65)               { name=pick(monsters);hp=rInt(8,25); maxHp=hp; }
    else continue;
    tokens[`tok_${tokId++}`] = { x:cx, y:cy, name, type:"npc", hp, maxHp, characterId:"__npc__" };
  }

  // Place stamps and props
  for (const rm of rooms) {
    const n = rInt(0,2);
    for (let s=0; s<n; s++) {
      const sx=rInt(rm.x,rm.x+rm.w-1), sy=rInt(rm.y,rm.y+rm.h-1);
      if (grid[sy][sx]===CELL.FLOOR) stamps[`${sx}_${sy}`] = pick(stampPool);
    }
    if (Math.random()<0.5) {
      const px=rInt(rm.x,rm.x+rm.w-1), py=rInt(rm.y,rm.y+rm.h-1);
      if (grid[py][px]===CELL.FLOOR) props[`${px},${py}`] = { propId: Math.random()<0.5?"barrel":"chest", w:1, h:1 };
    }
  }

  const mapName = `${typeKey}-${Math.floor(Math.random()*9000)+1000}`;
  return {
    mapName, sizeKey, typeKey, densityKey,
    grid, rooms, w, h, tileSize,
    output: { mapName, tiles, fog: { fog_1: { cells: fogCells } }, tokens, stamps, props },
    stats: { rooms: rooms.length, tiles: tileCount, tokens: Object.keys(tokens).length, props: Object.keys(props).length },
  };
}

// ── Renderer ──────────────────────────────────────────────────────────────────
export function renderDungeon(canvasEl, dungeon) {
  const { grid, w, h, tileSize, typeKey, output } = dungeon;
  const pal = DUNGEON_PALETTE[typeKey] || DUNGEON_PALETTE.ruins;
  const { stamps, tokens, props } = output;

  canvasEl.width  = w * tileSize;
  canvasEl.height = h * tileSize;
  const ctx = canvasEl.getContext("2d");

  ctx.fillStyle = pal.void;
  ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);

  // Tiles
  for (let cy=0; cy<h; cy++) for (let cx=0; cx<w; cx++) {
    const t=grid[cy][cx]; if (t===CELL.VOID) continue;
    const px=cx*tileSize, py=cy*tileSize;
    if (t===CELL.WALL) {
      ctx.fillStyle=pal.wall; ctx.fillRect(px,py,tileSize,tileSize);
      ctx.strokeStyle=pal.wallStroke; ctx.lineWidth=1; ctx.strokeRect(px+.5,py+.5,tileSize-1,tileSize-1);
      ctx.strokeStyle="rgba(0,0,0,.15)"; ctx.lineWidth=.5;
      ctx.beginPath(); ctx.moveTo(px,py); ctx.lineTo(px+tileSize,py+tileSize);
      ctx.moveTo(px+tileSize,py); ctx.lineTo(px,py+tileSize); ctx.stroke();
    } else if (t===CELL.FLOOR) {
      ctx.fillStyle=pal.floor; ctx.fillRect(px,py,tileSize,tileSize);
      ctx.strokeStyle="rgba(0,0,0,.12)"; ctx.lineWidth=.5; ctx.strokeRect(px+.5,py+.5,tileSize-1,tileSize-1);
    } else if (t===CELL.CORRIDOR) {
      ctx.fillStyle=pal.corridor; ctx.fillRect(px,py,tileSize,tileSize);
    } else if (t===CELL.DOOR) {
      ctx.fillStyle=pal.floor; ctx.fillRect(px,py,tileSize,tileSize);
      const dw=Math.max(4,tileSize*.55), dh=Math.max(4,tileSize*.7);
      ctx.fillStyle=pal.door; ctx.fillRect(px+(tileSize-dw)/2,py+(tileSize-dh)/2,dw,dh);
      ctx.strokeStyle="rgba(0,0,0,.5)"; ctx.lineWidth=1;
      ctx.strokeRect(px+(tileSize-dw)/2+.5,py+(tileSize-dh)/2+.5,dw-1,dh-1);
    }
  }

  // Fog overlay (light)
  ctx.fillStyle = pal.fog.replace(/[\d.]+\)$/,"0.42)");
  for (const key of Object.keys(output.fog?.fog_1?.cells || {})) {
    const [fx,fy] = key.split(",").map(Number);
    ctx.fillRect(fx*tileSize, fy*tileSize, tileSize, tileSize);
  }

  // Stamps
  const sfs = Math.max(10, tileSize*.55);
  ctx.font=`${sfs}px serif`; ctx.textAlign="center"; ctx.textBaseline="middle";
  for (const [key,emoji] of Object.entries(stamps)) {
    const [sx,sy] = key.split("_").map(Number);
    ctx.fillText(emoji, sx*tileSize+tileSize/2, sy*tileSize+tileSize/2);
  }

  // Props
  const propEmoji = { barrel:"🛢", chest:"📦" };
  for (const [key,prop] of Object.entries(props)) {
    const [px2,py2] = key.split(",").map(Number);
    ctx.font=`${sfs}px serif`; ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.fillText(propEmoji[prop.propId]||"📦", px2*tileSize+tileSize/2, py2*tileSize+tileSize/2);
  }

  // Tokens
  const tfs = Math.max(8, tileSize*.48);
  const tokEmoji = { guard:"💂",goblin:"👹",skeleton:"💀",zombie:"🧟",shadow:"👤",bandit:"🗡️",mage:"🧙",troll:"👺",spider:"🕷️",lich:"💀",rat:"🐀",default:"👾" };
  for (const tok of Object.values(tokens)) {
    const tx=tok.x*tileSize, ty=tok.y*tileSize;
    ctx.beginPath(); ctx.arc(tx+tileSize/2, ty+tileSize/2, tileSize*.38, 0, Math.PI*2);
    ctx.fillStyle = tok.type==="pc" ? "rgba(10,30,10,.8)" : "rgba(10,10,30,.75)"; ctx.fill();
    ctx.strokeStyle = tok.type==="pc" ? "rgba(100,220,120,.9)" : "rgba(201,162,39,.8)"; ctx.lineWidth=1.5; ctx.stroke();
    const nl = tok.name.toLowerCase(); let em="👾";
    for (const [k,v] of Object.entries(tokEmoji)) { if (nl.includes(k)) { em=v; break; } }
    ctx.font=`${tfs}px serif`; ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.fillText(em, tx+tileSize/2, ty+tileSize/2);
    if (tileSize>=28) {
      ctx.font=`bold ${Math.max(7,tileSize*.22)}px sans-serif`;
      ctx.fillStyle = tok.type==="pc" ? "rgba(180,255,180,.9)" : "rgba(255,240,180,.9)";
      ctx.textBaseline="bottom";
      ctx.fillText(tok.name.split(" ")[0], tx+tileSize/2, ty+tileSize-2);
    }
  }

  // Grid lines
  ctx.strokeStyle="rgba(255,255,255,.04)"; ctx.lineWidth=.5;
  for (let cx=0; cx<=w; cx++) { ctx.beginPath(); ctx.moveTo(cx*tileSize,0); ctx.lineTo(cx*tileSize,h*tileSize); ctx.stroke(); }
  for (let cy=0; cy<=h; cy++) { ctx.beginPath(); ctx.moveTo(0,cy*tileSize); ctx.lineTo(w*tileSize,cy*tileSize); ctx.stroke(); }
}

// ── Canvas interaction ────────────────────────────────────────────────────────
// Returns { kind, data } for whatever is at canvas coords (e.clientX/Y)
export function getThingAtClick(canvasEl, dungeon, clientX, clientY) {
  if (!dungeon) return null;
  const { tileSize, grid, output } = dungeon;
  const rect  = canvasEl.getBoundingClientRect();
  const scale = canvasEl.width / rect.width;
  const tx    = Math.floor((clientX - rect.left) * scale / tileSize);
  const ty    = Math.floor((clientY - rect.top)  * scale / tileSize);

  // Token
  for (const [id,tok] of Object.entries(output.tokens)) {
    if (tok.x===tx && tok.y===ty) return { kind:"token", id, tok };
  }
  // Prop
  const pk = `${tx},${ty}`;
  if (output.props[pk]) return { kind:"prop", key:pk, prop:output.props[pk] };
  // Stamp
  const sk = `${tx}_${ty}`;
  if (output.stamps[sk]) return { kind:"stamp", key:sk, emoji:output.stamps[sk] };
  // Door
  if (grid[ty]?.[tx]===CELL.DOOR) return { kind:"door" };
  return null;
}

// Roll a contextual result for clicking on a thing
export function rollForThing(thing, dungeon) {
  if (!thing) return null;
  if (thing.kind==="token" && thing.tok.type==="pc") return null;
  if (thing.kind==="token") {
    const tiers = Object.keys(ENEMY_TABLE);
    const tier  = pick(tiers.filter(t=>t!=="boss")) ;
    const data  = ENEMY_TABLE[tier];
    return { title:`👹 ${thing.tok.name}`, body:`Behavior: ${pick(data.behaviors)}\nSecret: ${pick(data.secrets)}`, flavor:`Tactics: ${pick(data.tactics)}` };
  }
  if (thing.kind==="prop") {
    const propId = thing.prop.propId;
    const ct     = { barrel:{ poor:["salted pork, rancid","river water, murky","old nails"], rich:["fine ale","lamp oil","trade spice"] }, chest:{ poor:["copper coins (2d6)","old letters"], rich:["silver coins (3d6)","a sealed envelope","thieves' tools"] } };
    const data   = ct[propId] || ct.chest;
    const tier   = d(6)>=4?"rich":"poor";
    return { title:`📦 ${propId[0].toUpperCase()+propId.slice(1)} Contents`, body:pick(data[tier]), flavor:tier==="rich"?"Well-stocked.":"Mostly empty." };
  }
  if (thing.kind==="stamp") {
    const emoji   = thing.emoji;
    const meaning = STAMP_MEANINGS[emoji] || "Point of interest";
    if (["💰"].includes(emoji)) {
      const tier = pick(["poor","modest","rich"]);
      const data = LOOT[tier];
      return { title:"💰 Treasure", body:`${data.coin()} · ${pick(data.items)}`, flavor:d(6)>=4?pick(TREASURE_SPECIALS):"" };
    }
    if (["❗","⭐"].includes(emoji)) {
      const poi = pick(POI_TABLE);
      return { title:`❗ ${poi.what}`, body:poi.detail, flavor:poi.hook };
    }
    if (["🔥","⚔️","🗡️","🛡️"].includes(emoji)) {
      const t  = pick(Object.keys(HAZARD));
      const hz = pick(HAZARD[t]);
      return { title:`🔥 Hazard: ${hz.name}`, body:hz.effect, flavor:`Trigger: ${hz.trigger}` };
    }
    if (["💀","☠️","👁️"].includes(emoji)) {
      const dng = pick(DANGER_TABLE);
      return { title:`💀 ${dng.threat}`, body:dng.detail, flavor:dng.sign };
    }
    const poi2 = pick(POI_TABLE);
    return { title:`${emoji} ${meaning}`, body:poi2.detail, flavor:poi2.hook };
  }
  return null;
}

// ── RTDB push ─────────────────────────────────────────────────────────────────
// Push generated dungeon to RTDB, optionally placing party PC tokens at entrance
export async function pushDungeonToRTDB(dungeon, partyPcs = []) {
  const payload = JSON.parse(JSON.stringify(dungeon.output));

  // Place party PCs at entrance room (first room)
  const entranceRoom = dungeon.rooms[0];
  if (entranceRoom && partyPcs.length) {
    const openTiles = [];
    for (let cy=entranceRoom.y; cy<entranceRoom.y+entranceRoom.h; cy++) {
      for (let cx=entranceRoom.x; cx<entranceRoom.x+entranceRoom.w; cx++) {
        const key = `${cx},${cy}`;
        if (payload.tiles[key] && !payload.tiles[key].walls) {
          if (!Object.values(payload.tokens).some(t=>t.x===cx&&t.y===cy)) {
            openTiles.push({ x:cx, y:cy });
          }
        }
      }
    }
    // Shuffle
    for (let i=openTiles.length-1; i>0; i--) {
      const j=Math.floor(Math.random()*(i+1));
      [openTiles[i],openTiles[j]]=[openTiles[j],openTiles[i]];
    }
    partyPcs.forEach((pc, i) => {
      const tile = openTiles[i % Math.max(1, openTiles.length)];
      if (!tile) return;
      payload.tokens[`pc_${pc.id||i}`] = {
        x:tile.x, y:tile.y, name:pc.name, type:"pc",
        hp:pc.hp??pc.combat?.hp_current??10,
        maxHp:pc.maxHp??pc.combat?.hp_max??10,
        characterId:pc.id||"__npc__",
      };
    });
  }

  await set(ref(db, `maps/${payload.mapName}`), payload);
  return payload.mapName;
}
