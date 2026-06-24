// Render — mapeditor canvas draw loop
// Owns all drawing: background, tiles, walls, fog, tokens, props, stamps, doors,
// previews, selection, grid, weather, pings, lasers, ruler
// Reads opacity per layer from layers.js

import { camera, toScreen }               from "./camera.js";
import { textures, tokenTextures, propTextures } from "./assets.js";
import { drawToken }                       from "./tokens.js";
import { drawFog }                         from "./fog.js";
import { drawChains }                      from "./chains.js";
import { drawWeather }                     from "./weather.js";
import { drawPings, drawLasers }           from "./pings.js";
import { drawRuler }                       from "./ruler.js";
import { getShakeOffset }                  from "./mic.js";
import { getLayerOpacity, getActiveLayer, getWallSub, getFogType } from "./layers.js";
import { getTERRAINS, TILE }               from "./config.js";

// ── State refs (set by init) ──────────────────────────────────────────────────
let _canvas, _ctx;
let _state;       // { tiles, fogGroups, wallGroups, doors, tokens, stamps, props, chains }
let _editor;      // { bgImage, bgPpi, nightMode, pcsData, CONDITIONS, propDefs }
let _interaction; // { dragging, startX, startY, curX, curY, hoverTileX, hoverTileY,
                  //   currentShape, currentTerrain, selectPhase, selectTiles,
                  //   selMinX, selMinY, selMaxX, selMaxY, moveOffX, moveOffY,
                  //   placingToken, currentStamp, currentProp, rulerStart, rulerEnd,
                  //   activePings, activeLasers }
let _running = false;

export function initRender(canvas, state, editor, interaction) {
  _canvas      = canvas;
  _ctx         = canvas.getContext("2d");
  _state       = state;
  _editor      = editor;
  _interaction = interaction;
}

export function startRender() {
  if (_running) return;
  _running = true;
  requestAnimationFrame(_loop);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function key(x, y) { return `${x},${y}`; }

function drawTileAt(x, y, terrain) {
  const TERRAINS = getTERRAINS();
  const px = x * TILE, py = y * TILE;
  if (textures[terrain]) {
    _ctx.drawImage(textures[terrain], px, py, TILE, TILE);
  } else {
    const def = TERRAINS.find(t => t.id === terrain);
    _ctx.fillStyle = def?.color || "#334";
    _ctx.fillRect(px, py, TILE, TILE);
  }
}

function nearestWallEdge(tx, ty) {
  const wallGroups = _state.wallGroups;
  const neighbors  = [
    {dx:0,dy:-1,edge:"n"},{dx:0,dy:1,edge:"s"},
    {dx:-1,dy:0,edge:"w"},{dx:1,dy:0,edge:"e"},
  ];
  function wallGroupAtTile(x,y) {
    const k = key(x,y);
    for (const gid in wallGroups) if (wallGroups[gid].cells?.[k]) return gid;
    return null;
  }
  const myGid = wallGroupAtTile(tx, ty);
  if (myGid) {
    for (const {dx,dy,edge} of neighbors) {
      if (!wallGroups[myGid].cells?.[key(tx+dx,ty+dy)]) return {edge,x:tx,y:ty};
    }
  }
  for (const {dx,dy,edge} of neighbors) {
    const ngid = wallGroupAtTile(tx+dx, ty+dy);
    if (ngid) return {edge:{n:"s",s:"n",e:"w",w:"e"}[edge], x:tx+dx, y:ty+dy};
  }
  return {edge:null, x:tx, y:ty};
}

// ── Sub-draw functions ────────────────────────────────────────────────────────

function drawBackground() {
  const { bgImage, bgPpi, nightMode } = _editor;
  if (!bgImage) return;
  const s  = TILE / (bgPpi || 70);
  const bw = bgImage.width * s, bh = bgImage.height * s;
  const alpha = getLayerOpacity(getActiveLayer(), "bg");
  _ctx.save();
  _ctx.globalAlpha = alpha;
  if (nightMode) {
    _ctx.filter = "saturate(0.55) brightness(0.55)";
    _ctx.drawImage(bgImage, 0, 0, bw, bh);
    _ctx.filter = "none";
    _ctx.globalCompositeOperation = "multiply";
    _ctx.fillStyle = "rgba(40,60,110,0.55)";
    _ctx.fillRect(0, 0, bw, bh);
    _ctx.globalCompositeOperation = "source-over";
  } else {
    _ctx.drawImage(bgImage, 0, 0, bw, bh);
  }
  _ctx.restore();
}

function drawTiles() {
  const alpha = getLayerOpacity(getActiveLayer(), "ground");
  _ctx.save(); _ctx.globalAlpha = alpha;
  for (const k in _state.tiles) {
    const [x,y] = k.split(",").map(Number);
    drawTileAt(x, y, _state.tiles[k].terrain);
  }
  _ctx.restore();
}

function drawWalls() {
  const alpha = getLayerOpacity(getActiveLayer(), "walls");
  _ctx.save(); _ctx.globalAlpha = alpha;
  _ctx.strokeStyle = "#c0392b"; _ctx.lineWidth = 2.5/camera.zoom; _ctx.lineCap = "round";
  for (const gid in _state.wallGroups) {
    const cells = _state.wallGroups[gid].cells || {};
    for (const ck in cells) {
      const [x,y] = ck.split(",").map(Number);
      const px = x*TILE, py = y*TILE;
      [[0,-1,px,py,px+TILE,py],[0,1,px,py+TILE,px+TILE,py+TILE],
       [-1,0,px,py,px,py+TILE],[1,0,px+TILE,py,px+TILE,py+TILE]
      ].forEach(([dx,dy,x1,y1,x2,y2]) => {
        if (!cells[key(x+dx,y+dy)]) {
          _ctx.beginPath(); _ctx.moveTo(x1,y1); _ctx.lineTo(x2,y2); _ctx.stroke();
        }
      });
    }
  }
  _ctx.restore();
}

function drawDoors() {
  const alpha = getLayerOpacity(getActiveLayer(), "walls");
  _ctx.save(); _ctx.globalAlpha = alpha;
  for (const did in _state.doors) {
    const d = _state.doors[did];
    const px = d.x*TILE, py = d.y*TILE;
    const edgeCoords = {
      n:[px,py,px+TILE,py], s:[px,py+TILE,px+TILE,py+TILE],
      w:[px,py,px,py+TILE], e:[px+TILE,py,px+TILE,py+TILE],
    };
    const [x1,y1,x2,y2] = edgeCoords[d.edge] || edgeCoords.n;
    const mx = (x1+x2)/2, my = (y1+y2)/2;
    if (d.open) {
      _ctx.strokeStyle = "#8a6a2a"; _ctx.lineWidth = 2/camera.zoom;
      const len = TILE*0.25, isH = d.edge==="n"||d.edge==="s";
      _ctx.beginPath();
      if (isH) { _ctx.moveTo(x1,y1-len); _ctx.lineTo(x1,y1+len); _ctx.moveTo(x2,y2-len); _ctx.lineTo(x2,y2+len); }
      else      { _ctx.moveTo(x1-len,y1); _ctx.lineTo(x1+len,y1); _ctx.moveTo(x2-len,y2); _ctx.lineTo(x2+len,y2); }
      _ctx.stroke();
    } else {
      _ctx.strokeStyle = d.locked ? "#8a2a2a" : "#8a6a2a"; _ctx.lineWidth = 3.5/camera.zoom;
      _ctx.beginPath(); _ctx.moveTo(x1,y1); _ctx.lineTo(x2,y2); _ctx.stroke();
      const sz = 4/camera.zoom;
      _ctx.fillStyle = d.locked ? "#c04040" : "#c0a040";
      _ctx.fillRect(mx-sz/2, my-sz/2, sz, sz);
    }
  }
  _ctx.restore();
}

function drawStamps() {
  const alpha = getLayerOpacity(getActiveLayer(), "ground");
  _ctx.save(); _ctx.globalAlpha = alpha;
  _ctx.textAlign = "center"; _ctx.textBaseline = "middle";
  _ctx.font = `${Math.round(TILE*.65)}px serif`;
  for (const [k, emoji] of Object.entries(_state.stamps)) {
    const [x,y] = k.split(",").map(Number);
    _ctx.fillText(emoji, x*TILE+TILE/2, y*TILE+TILE/2);
  }
  // Hover preview for stamp placement
  const { currentStamp, hoverTileX, hoverTileY } = _interaction;
  if (currentStamp && currentStamp !== "erase" && getActiveLayer()==="objects") {
    _ctx.globalAlpha = 0.5;
    _ctx.fillText(currentStamp, hoverTileX*TILE+TILE/2, hoverTileY*TILE+TILE/2);
  }
  _ctx.restore();
}

function drawProps() {
  const alpha = getLayerOpacity(getActiveLayer(), "ground");
  _ctx.save(); _ctx.globalAlpha = alpha;
  for (const [k, p] of Object.entries(_state.props)) {
    let rx, ry;
    if (p.attachedTo && _state.tokens[p.attachedTo]) {
      rx = _state.tokens[p.attachedTo].x + (p.offsetX||0);
      ry = _state.tokens[p.attachedTo].y + (p.offsetY||0);
    } else {
      [rx,ry] = k.split(",").map(Number);
    }
    const def = _editor.propDefs[p.propId] || {emoji:"📦",w:1,h:1};
    const pw  = (p.w||def.w||1)*TILE, ph = (p.h||def.h||1)*TILE;
    const ppx = rx*TILE, ppy = ry*TILE;
    const img = propTextures[p.propId];
    if (img) {
      _ctx.drawImage(img, ppx, ppy, pw, ph);
    } else {
      _ctx.font = `${Math.round(Math.min(pw,ph)*0.7)}px serif`;
      _ctx.textAlign = "center"; _ctx.textBaseline = "middle";
      _ctx.fillText(def.emoji, ppx+pw/2, ppy+ph/2);
    }
    if (p.attachedTo) {
      _ctx.strokeStyle = "rgba(200,168,75,0.5)"; _ctx.lineWidth = 1/camera.zoom;
      _ctx.setLineDash([3/camera.zoom,3/camera.zoom]);
      _ctx.strokeRect(ppx,ppy,pw,ph); _ctx.setLineDash([]);
    }
  }
  // Hover preview
  const { currentProp, hoverTileX, hoverTileY } = _interaction;
  if (currentProp && currentProp!=="erase" && getActiveLayer()==="objects") {
    _ctx.globalAlpha = 0.5;
    const def = currentProp, pw=(def.w||1)*TILE, ph=(def.h||1)*TILE;
    const img = propTextures[def.id];
    if (img) _ctx.drawImage(img, hoverTileX*TILE, hoverTileY*TILE, pw, ph);
    else { _ctx.font=`${Math.round(Math.min(pw,ph)*0.7)}px serif`; _ctx.textAlign="center"; _ctx.textBaseline="middle"; _ctx.fillText(def.emoji, hoverTileX*TILE+pw/2, hoverTileY*TILE+ph/2); }
  }
  _ctx.restore();
}

function drawTokens() {
  const { pcsData, CONDITIONS } = _editor;
  const { placingToken, hoverTileX, hoverTileY } = _interaction;
  const tokAlpha  = getLayerOpacity(getActiveLayer(), "tokens");
  const baseAlpha = Math.max(tokAlpha, 0.6); // tokens never below 60%

  // NPCs
  for (const [, tok] of Object.entries(_state.tokens)) {
    if (tok.type !== "npc") continue;
    drawToken(_ctx, tok, camera.zoom, pcsData, CONDITIONS, baseAlpha, getShakeOffset(tok.name));
  }
  // PCs
  for (const [, tok] of Object.entries(_state.tokens)) {
    if (tok.type !== "pc") continue;
    drawToken(_ctx, tok, camera.zoom, pcsData, CONDITIONS, baseAlpha, getShakeOffset(tok.name));
  }
  // Placing preview
  if (placingToken && getActiveLayer()==="objects") {
    const a = 0.6 + 0.2 * Math.sin(Date.now()/300);
    drawToken(_ctx, {...placingToken, x:hoverTileX, y:hoverTileY}, camera.zoom, pcsData, CONDITIONS, a);
  }
}

function drawFogLayer() {
  const alpha = getLayerOpacity(getActiveLayer(), "fog");
  _ctx.save(); _ctx.globalAlpha = alpha;
  drawFog(_ctx, _state.fogGroups, camera.zoom, true); // always GM mode in editor
  _ctx.restore();
}

function drawPreviews() {
  const { dragging, startX, startY, curX, curY, hoverTileX, hoverTileY,
          currentShape, currentTerrain, selectPhase } = _interaction;
  const layer   = getActiveLayer();
  const wallSub = getWallSub();

  if (layer === "ground" && currentShape !== "select") {
    if (!dragging) {
      _ctx.fillStyle = "rgba(200,168,75,0.15)";
      _ctx.fillRect(hoverTileX*TILE, hoverTileY*TILE, TILE, TILE);
      return;
    }
    const minX=Math.floor(Math.min(startX,curX)/TILE), maxX=Math.floor(Math.max(startX,curX)/TILE);
    const minY=Math.floor(Math.min(startY,curY)/TILE), maxY=Math.floor(Math.max(startY,curY)/TILE);
    _ctx.fillStyle = currentTerrain==="erase" ? "rgba(220,60,60,0.25)" : "rgba(200,168,75,0.28)";
    _paintShape(currentShape, minX, minY, maxX, maxY, startX, startY, curX, curY);
    return;
  }

  if (layer === "walls") {
    if (wallSub === "paint" && dragging) {
      const minX=Math.floor(Math.min(startX,curX)/TILE), maxX=Math.floor(Math.max(startX,curX)/TILE);
      const minY=Math.floor(Math.min(startY,curY)/TILE), maxY=Math.floor(Math.max(startY,curY)/TILE);
      _ctx.fillStyle = "rgba(192,57,43,0.2)";
      for (let x=minX;x<=maxX;x++) for (let y=minY;y<=maxY;y++) _ctx.fillRect(x*TILE,y*TILE,TILE,TILE);
    }
    if (wallSub === "door" && !dragging) {
      const {edge,x,y} = nearestWallEdge(hoverTileX, hoverTileY);
      if (edge) {
        const px=x*TILE,py=y*TILE;
        const edgeCoords={n:[px,py,px+TILE,py],s:[px,py+TILE,px+TILE,py+TILE],w:[px,py,px,py+TILE],e:[px+TILE,py,px+TILE,py+TILE]};
        const [x1,y1,x2,y2] = edgeCoords[edge];
        _ctx.strokeStyle="rgba(200,168,75,0.8)"; _ctx.lineWidth=4/camera.zoom;
        _ctx.beginPath(); _ctx.moveTo(x1,y1); _ctx.lineTo(x2,y2); _ctx.stroke();
      }
    }
    return;
  }

  if (layer === "fog" && dragging) {
    const minX=Math.floor(Math.min(startX,curX)/TILE), maxX=Math.floor(Math.max(startX,curX)/TILE);
    const minY=Math.floor(Math.min(startY,curY)/TILE), maxY=Math.floor(Math.max(startY,curY)/TILE);
    const fogType = getFogType();
    _ctx.fillStyle = fogType==="magical" ? "rgba(60,10,80,0.35)" :
                     fogType==="darkness" ? "rgba(10,5,20,0.45)" :
                     "rgba(10,20,40,0.35)";
    _paintShape(currentShape, minX, minY, maxX, maxY, startX, startY, curX, curY);
  }
}

function _paintShape(shape, minX, minY, maxX, maxY, startX, startY, curX, curY) {
  if (shape==="rect") {
    for (let x=minX;x<=maxX;x++) for (let y=minY;y<=maxY;y++) _ctx.fillRect(x*TILE,y*TILE,TILE,TILE);
  } else if (shape==="circle") {
    const cx=(minX+maxX)/2, cy=(minY+maxY)/2;
    const rx=(maxX-minX)/2||0.5, ry=(maxY-minY)/2||0.5;
    for (let x=minX;x<=maxX;x++) for (let y=minY;y<=maxY;y++) {
      const dx=(x-cx)/rx, dy=(y-cy)/ry;
      if (dx*dx+dy*dy<=1) _ctx.fillRect(x*TILE,y*TILE,TILE,TILE);
    }
  } else if (shape==="line") {
    let x0=Math.floor(startX/TILE),y0=Math.floor(startY/TILE);
    let x1=Math.floor(curX/TILE),y1=Math.floor(curY/TILE);
    const dx=Math.abs(x1-x0),dy=Math.abs(y1-y0),sx=x0<x1?1:-1,sy=y0<y1?1:-1;
    let err=dx-dy;
    while(true) {
      _ctx.fillRect(x0*TILE,y0*TILE,TILE,TILE);
      if(x0===x1&&y0===y1) break;
      const e2=2*err;
      if(e2>-dy){err-=dy;x0+=sx;}
      if(e2<dx){err+=dx;y0+=sy;}
    }
  }
}

function drawSelection() {
  const { currentShape, selectPhase, dragging, startX, startY, curX, curY,
          selectTiles, selMinX, selMinY, selMaxX, selMaxY, moveOffX, moveOffY } = _interaction;
  if (currentShape !== "select") return;

  if (selectPhase==="marquee" && dragging) {
    const minX=Math.floor(Math.min(startX,curX)/TILE),maxX=Math.floor(Math.max(startX,curX)/TILE);
    const minY=Math.floor(Math.min(startY,curY)/TILE),maxY=Math.floor(Math.max(startY,curY)/TILE);
    _ctx.fillStyle="rgba(100,160,255,0.15)";
    for(let x=minX;x<=maxX;x++) for(let y=minY;y<=maxY;y++) _ctx.fillRect(x*TILE,y*TILE,TILE,TILE);
    _ctx.strokeStyle="rgba(100,160,255,0.9)"; _ctx.lineWidth=1.5/camera.zoom;
    _ctx.setLineDash([5/camera.zoom,3/camera.zoom]);
    _ctx.strokeRect(minX*TILE,minY*TILE,(maxX-minX+1)*TILE,(maxY-minY+1)*TILE);
    _ctx.setLineDash([]);
    return;
  }

  if (selectPhase==="selected"||selectPhase==="moving") {
    const ox=moveOffX,oy=moveOffY;
    const TERRAINS=getTERRAINS();
    for (const k in selectTiles) {
      const [tx,ty]=k.split(",").map(Number);
      const {terrain}=selectTiles[k];
      const px=(tx+ox)*TILE,py=(ty+oy)*TILE;
      const def=TERRAINS.find(t=>t.id===terrain);
      if(textures[terrain]) _ctx.drawImage(textures[terrain],px,py,TILE,TILE);
      else { _ctx.fillStyle=def?.color||"#333"; _ctx.fillRect(px,py,TILE,TILE); }
    }
    const px=(selMinX+ox)*TILE,py=(selMinY+oy)*TILE;
    const pw=(selMaxX-selMinX+1)*TILE,ph=(selMaxY-selMinY+1)*TILE;
    _ctx.fillStyle="rgba(100,160,255,0.18)"; _ctx.fillRect(px,py,pw,ph);
    _ctx.strokeStyle="rgba(100,160,255,0.95)"; _ctx.lineWidth=2/camera.zoom;
    _ctx.setLineDash([5/camera.zoom,3/camera.zoom]);
    _ctx.strokeRect(px,py,pw,ph); _ctx.setLineDash([]);
  }
}

function drawGrid() {
  _ctx.strokeStyle="rgba(255,255,255,0.04)"; _ctx.lineWidth=1/camera.zoom;
  const l=-camera.x/camera.zoom, t=-camera.y/camera.zoom;
  const r=(canvas.width-camera.x)/camera.zoom, b=(_canvas.height-camera.y)/camera.zoom;
  for(let x=Math.floor(l/TILE)*TILE;x<r;x+=TILE){_ctx.beginPath();_ctx.moveTo(x,t);_ctx.lineTo(x,b);_ctx.stroke();}
  for(let y=Math.floor(t/TILE)*TILE;y<b;y+=TILE){_ctx.beginPath();_ctx.moveTo(l,y);_ctx.lineTo(r,y);_ctx.stroke();}
}

// ── Main loop ─────────────────────────────────────────────────────────────────
function _loop() {
  const W = _canvas.width, H = _canvas.height;

  _ctx.clearRect(0,0,W,H);
  _ctx.fillStyle="#0d0b08"; _ctx.fillRect(0,0,W,H);
  _ctx.save();
  _ctx.translate(camera.x,camera.y); _ctx.scale(camera.zoom,camera.zoom);

  drawBackground();
  drawTiles();
  drawStamps();
  drawProps();
  drawChains(_ctx, _state.chains, _state.tokens, camera.zoom);
  drawTokens();
  drawFogLayer();
  drawWalls();
  drawDoors();
  drawPreviews();
  drawGrid();

  const { currentShape } = _interaction;
  if (currentShape==="select") drawSelection();

  _ctx.restore();

  // Screen-space overlays (not affected by camera transform)
  drawWeather(_ctx, W, H);
  drawPings(_ctx, _interaction.activePings, (wx,wy)=>toScreen(wx,wy));
  drawLasers(_ctx, _interaction.activeLasers, (wx,wy)=>toScreen(wx,wy));
  drawRuler(_ctx, _interaction.rulerStart, _interaction.rulerEnd, (wx,wy)=>toScreen(wx,wy));

  requestAnimationFrame(_loop);
}
