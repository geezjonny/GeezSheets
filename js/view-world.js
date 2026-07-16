/**
 * view-world.js — World map view
 * True extraction of chaia-map-viewer.html — minimal changes:
 *   document.getElementById for top-level elements → scoped to container
 *   Local JSON fetches → Firebase reads from campaigns/${campaignId}/map/
 *   Save via /save/*.json → Firebase set
 *   Functions called from HTML onclick attributes exposed on the container's scope
 * 
 * Usage:
 *   import { initWorldView, destroyWorldView } from './js/view-world.js';
 *   const cleanup = await initWorldView(container, { campaignId: 'default', worldImage: 'chaia-world.png' });
 */

import { ref as _fbRef, onValue, set, update, remove, get }
  from "https://www.gstatic.com/firebasejs/11.1.0/firebase-database.js";
import { db } from "./firebase.js";

// Inject CSS + Leaflet once
const STYLE_ID = 'view-world-css';
function injectCSS() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = "\n  :root{\n    --ink:#2b2620;\n    --parchment:#ece4d2;\n    --parchment-dark:#d8cdb4;\n    --accent:#8a3324;\n    --accent-light:#c9876f;\n    --panel-bg:#f4eedd;\n  }\n  *{box-sizing:border-box;}\n  html,body{margin:0;height:100%;font-family:'Segoe UI',system-ui,sans-serif;background:var(--ink);}\n  #topbar{\n    height:48px;display:flex;align-items:center;justify-content:space-between;\n    padding:0 16px;background:var(--ink);color:var(--parchment);\n    border-bottom:1px solid #4a4338;gap:8px;\n  }\n  #topbar h1{font-size:15px;font-weight:600;margin:0;letter-spacing:.02em;flex:0 0 auto;}\n  #topbar-right{display:flex;align-items:center;gap:8px;flex-wrap:nowrap;overflow-x:auto;}\n  #saveStatus{font-size:11px;color:#a89e8c;min-width:60px;flex:0 0 auto;}\n  #topbar span{font-size:12px;color:#a89e8c;flex:0 0 auto;}\n  #map{position:absolute;top:48px;left:0;right:0;bottom:0;background:#1c1a16;}\n  .leaflet-container{background:#1c1a16;}\n\n  .poi-pin{\n    position:relative;width:18px;height:18px;border-radius:50%;\n    background:var(--accent);border:2px solid var(--parchment);\n    box-shadow:0 0 0 2px rgba(0,0,0,.35);\n    cursor:pointer;\n  }\n  .poi-pin.has-map::after{\n    content:'';position:absolute;width:40%;height:40%;top:30%;left:30%;\n    border-radius:50%;background:#fff;\n  }\n  .poi-pin.capital{border-width:3px;box-shadow:0 0 0 2px rgba(0,0,0,.35),0 0 0 4px rgba(212,160,50,.55);}\n  .poi-pin.destroyed{filter:grayscale(1) brightness(0.7);}\n  .poi-pin.occupied{box-shadow:0 0 0 2px rgba(0,0,0,.35),0 0 0 4px rgba(180,40,40,.6);}\n  .flavor-pin{\n    width:20px;height:20px;border-radius:50%;\n    background:var(--parchment);border:1.5px solid var(--accent);\n    display:flex;align-items:center;justify-content:center;\n    font-size:11px;cursor:pointer;box-shadow:0 0 0 1px rgba(0,0,0,.3);\n  }\n  .poi-label{\n    font-size:12px;color:var(--parchment);background:rgba(20,18,15,.75);\n    padding:2px 6px;border-radius:3px;white-space:nowrap;font-weight:500;\n  }\n\n  #legend{\n    position:fixed;left:12px;bottom:12px;z-index:500;\n    background:rgba(20,18,15,.85);color:var(--parchment);\n    border-radius:6px;padding:10px 12px;font-size:12px;line-height:1.5;\n    max-width:170px;\n  }\n  .legend-title{font-weight:600;margin-bottom:4px;}\n  .legend-row{display:flex;align-items:center;gap:6px;margin:2px 0;}\n  .legend-swatch{\n    width:10px;height:10px;border-radius:50%;display:inline-block;flex:0 0 auto;\n    border:1px solid rgba(255,255,255,.4);position:relative;\n  }\n  .capital-swatch{background:#8a8470;box-shadow:0 0 0 2px rgba(212,160,50,.65);}\n  .hasmap-swatch{background:#2f5f8f;}\n  .hasmap-swatch::after{\n    content:'';position:absolute;width:40%;height:40%;top:30%;left:30%;\n    border-radius:50%;background:#fff;\n  }\n\n  #overlay{\n    position:fixed;inset:0;background:rgba(15,13,10,.6);\n    display:none;align-items:center;justify-content:center;z-index:1000;\n  }\n  #overlay.open{display:flex;}\n  #panel{\n    background:var(--panel-bg);color:var(--ink);\n    width:min(640px,90vw);max-height:85vh;overflow:auto;\n    border-radius:6px;padding:24px;box-shadow:0 12px 40px rgba(0,0,0,.4);\n  }\n  #panel h2{margin:0 0 4px;font-size:18px;font-weight:600;}\n  #panel p.sub{margin:0 0 14px;font-size:13px;color:#6b6353;}\n  .sub-label{font-size:12px;font-weight:600;color:#6b6353;margin:0 0 8px;text-transform:uppercase;letter-spacing:.03em;}\n  .divider{border:none;border-top:1px solid var(--parchment-dark);margin:18px 0;}\n  .field-row{display:flex;align-items:center;gap:10px;margin-bottom:8px;}\n  .field-row label{width:90px;flex:0 0 auto;font-size:13px;color:#6b6353;}\n  .field-row input[type=text], .field-row input[type=number], .field-row select, .field-row input[type=range]{\n    flex:1;font-family:inherit;font-size:13px;padding:6px 8px;\n    border:1px solid var(--parchment-dark);border-radius:4px;background:#fff;color:var(--ink);\n  }\n  .field-row input[type=color]{\n    width:50px;height:32px;padding:2px;flex:0 0 auto;\n    border:1px solid var(--parchment-dark);border-radius:4px;\n  }\n  .field-row input[type=checkbox]{width:16px;height:16px;}\n  .field-row .hint{font-size:11px;color:#9b9484;flex:0 0 auto;}\n  .custom-row{display:flex;gap:6px;margin-bottom:6px;align-items:flex-start;}\n  .custom-row input.custom-key{\n    width:140px;flex:0 0 auto;font-size:12px;padding:6px 8px;\n    border:1px solid var(--parchment-dark);border-radius:4px;background:#fff;color:var(--ink);\n  }\n  .custom-row input.custom-key:disabled{background:#ece6d8;color:#5c5648;}\n  .custom-row textarea.custom-val{\n    flex:1;font-family:inherit;font-size:12px;padding:6px 8px;resize:vertical;min-height:32px;\n    border:1px solid var(--parchment-dark);border-radius:4px;background:#fff;color:var(--ink);\n  }\n  .iconbtn{\n    flex:0 0 auto;width:28px;height:28px;padding:0;font-size:13px;line-height:1;\n  }\n  .gallery{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:10px;}\n  .gallery-item{width:140px;display:flex;flex-direction:column;gap:4px;}\n  .gallery-item img{width:100%;height:90px;object-fit:cover;border-radius:4px;display:block;background:#ddd4c0;}\n  .gallery-item-row{display:flex;gap:4px;}\n  .gallery-label{flex:1;font-size:11px;padding:4px 6px;border:1px solid var(--parchment-dark);border-radius:3px;}\n  .drop{\n    border:1.5px dashed var(--parchment-dark);border-radius:6px;\n    padding:24px 16px;text-align:center;font-size:13px;color:#6b6353;\n    cursor:pointer;display:block;\n  }\n  .drop:hover{border-color:var(--accent-light);}\n  .drop input{display:none;}\n  .btnrow{display:flex;gap:8px;justify-content:flex-end;margin-top:12px;}\n  button{\n    font-family:inherit;font-size:13px;font-weight:500;padding:8px 14px;\n    border-radius:5px;border:1px solid var(--parchment-dark);background:#fff;\n    color:var(--ink);cursor:pointer;\n  }\n  button.primary{background:var(--accent);border-color:var(--accent);color:#fff;}\n  button:hover{filter:brightness(0.97);}\n  button.small{\n    font-size:11px;padding:5px 10px;background:transparent;color:var(--parchment);\n    border:1px solid #5a5346;\n  }\n  button.small:hover{background:#3a352c;filter:none;}\n";
  document.head.appendChild(style);
  if (!document.querySelector('link[href*="leaflet"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css';
    document.head.appendChild(link);
  }
}

function ensureLeaflet() {
  return new Promise(resolve => {
    if (window.L) { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js';
    s.onload = resolve;
    document.head.appendChild(s);
  });
}

export async function initWorldView(container, {
  campaignId   = 'default',
  worldImage   = 'chaia-world.png',
  onOpenVTT    = null,
  onOpenBoard  = null,
  onSelectBurg = null,
} = {}) {
  injectCSS();
  await ensureLeaflet();

  container.innerHTML = '<div id="topbar">\n  <h1>Chaia</h1>\n  <div id="topbar-right">\n    <button id="addBurgBtn" class="small" onclick="toggleArm(\'burg\')">+ Add burg</button>\n    <button id="addMarkerBtn" class="small" onclick="toggleArm(\'marker\')">+ Add marker</button>\n    <button id="addHazardBtn" class="small" onclick="toggleArm(\'hazard\')">+ Add hazard zone</button>\n    <button class="small" onclick="advanceDays(1)">Advance 1 Day</button>\n    <button class="small" onclick="advanceDays(7)">Advance 7 Days</button>\n    <button class="small" onclick="advanceDays(30)">Advance 30 Days</button>\n    <button class="small" onclick="advanceDaysCustom()">Advance\\u2026</button>\n    <button class="small" onclick="exportBurgs()">Download burgs.json</button>\n    <button class="small" onclick="exportMarkers()">Download markers.json</button>\n    <button class="small" onclick="exportHazards()">Download hazards.json</button>\n    <span id="dayCounter"></span>\n    <span id="saveStatus"></span>\n    <span id="zoomNote">native resolution &mdash; pan freely</span>\n  </div>\n</div>\n\n<div id="map"></div>\n<div id="legend"></div>\n\n<div id="overlay">\n  <div id="panel"></div>\n</div>';

  // Scope top-level DOM lookups
  const _$ = id => container.querySelector('#' + id);

  // Firebase base path for map data
  const _basePath = 'campaigns/' + campaignId + '/map';

  // Build Firebase load promise (replaces local JSON fetches)
  const _firebaseLoad = (async () => {
    const [burgsSnap, markersSnap, routesSnap, hazardsSnap, wsSnap, logSnap] = await Promise.all([
      get(_fbRef(db, _basePath + '/burgs')),
      get(_fbRef(db, _basePath + '/markers')),
      get(_fbRef(db, _basePath + '/routes')),
      get(_fbRef(db, _basePath + '/hazards')),
      get(_fbRef(db, _basePath + '/worldState')),
      get(_fbRef(db, _basePath + '/eventLog')),
    ]);
    return [
      burgsSnap.exists()   ? Object.values(burgsSnap.val())   : [],
      markersSnap.exists() ? Object.values(markersSnap.val()) : [],
      routesSnap.exists()  ? routesSnap.val()                 : [],
      hazardsSnap.exists() ? Object.values(hazardsSnap.val()) : [],
      wsSnap.exists()      ? wsSnap.val()                     : {},
      logSnap.exists()     ? logSnap.val()                    : [],
    ];
  })();

  // World image path override
  const WORLD_IMAGE = worldImage;
  const IMG_W = 1920, IMG_H = 1006;

  // ── Extracted chaia-map-viewer.html JS ────────────────────────────────────
  

// IMG_W/IMG_H above is the canonical coordinate space -- the one your POI X/Y
// data is defined against. Whatever file WORLD_IMAGE actually points to gets
// probed for its real pixel size; if it's a higher-resolution export of the
// same map, maxZoom rises to match so that extra detail is reachable instead
// of being silently downscaled away. POI coordinates never need to change.
let map, markers = {}, pois = [];
let hazards = [], hazardLayers = {};
let poiSeq = {burg:1, marker:1}, hazardSeq = 1;
let armedFor = null; // null | 'burg' | 'marker' | 'hazard'
let dirty = {burgs:false, markers:false, hazards:false};
let saveStatusTimer = null;
let worldState = {campaignDay: 0};
let eventLog = [];

const TYPE_COLORS = {
  Generic:  '#8a8470',
  Naval:    '#2f5f8f',
  River:    '#3f9e6e',
  Lake:     '#5cb8d4',
  Highland: '#9e6b3f',
  Hunting:  '#7d5ba6',
};
const BURG_STATUSES = ['Unknown', 'Discovered', 'Visited', 'Occupied', 'Destroyed'];

function poiLabel(entity){
  return entity.name || ('Unnamed (' + entity.id + ')');
}

function tooltipFor(poi){
  const notable = poi.status && poi.status !== 'Unknown' && poi.status !== 'Discovered';
  return poiLabel(poi) + (notable ? ' (' + poi.status + ')' : '');
}

function escapeAttr(s){
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function findEntity(id){
  return pois.find(p => p.id === id) || hazards.find(h => h.id === id);
}
function datasetFor(entity){
  if (entity.kind === 'burg') return 'burgs';
  if (entity.kind === 'marker') return 'markers';
  return 'hazards';
}
function reopenEntity(id){
  const entity = findEntity(id);
  if (entity.kind === 'hazard') openHazard(id); else openPoi(id);
}
function bumpSeq(kind, id){
  const m = /(\d+)$/.exec(id || '');
  if (!m) return;
  if (kind === 'hazard') hazardSeq = Math.max(hazardSeq, parseInt(m[1]) + 1);
  else poiSeq[kind] = Math.max(poiSeq[kind], parseInt(m[1]) + 1);
}

function buildLegend(){
  const legend = _$('legend');
  let html = '<div class="legend-title">Burg type</div>';
  for (const [type, color] of Object.entries(TYPE_COLORS)) {
    html += '<div class="legend-row"><span class="legend-swatch" style="background:'+color+'"></span>'+type+'</div>';
  }
  html += '<div class="legend-row"><span class="legend-swatch capital-swatch"></span>Capital</div>';
  html += '<div class="legend-row"><span class="legend-swatch hasmap-swatch"></span>Has city map</div>';
  legend.innerHTML = html;
}

// fetch() of local files is blocked by CORS when an HTML file is opened
// directly (file://), but works fine served over http(s). serve.py (in this
// same folder) is what makes the autosave/image-upload endpoints exist;
// plain `python -m http.server` or GitHub Pages will load the map fine but
// can't accept saves, so edits there fall back to the manual download
// buttons. Each fetch has its own fallback so one missing file doesn't take
// the whole map down with it.
const imageProbe = new Promise(resolve => {
  const probe = new Image();
  probe.onload = () => resolve(Math.max(0, Math.log2(probe.naturalWidth / IMG_W)));
  probe.onerror = () => resolve(0);
  probe.src = WORLD_IMAGE;
});

const dataLoad = _firebaseLoad;

Promise.all([imageProbe, dataLoad]).then(([maxZoom, [BURGS, FLAVOR_MARKERS, ROUTES, HAZARDS, WORLDSTATE, EVENTLOG]]) => {
  BURGS.forEach(b => { b.kind = 'burg'; b.images = b.images || []; b.status = b.status || 'Unknown'; bumpSeq('burg', b.id); });
  FLAVOR_MARKERS.forEach(m => { m.kind = 'marker'; m.images = m.images || []; bumpSeq('marker', m.id); });
  HAZARDS.forEach(h => { h.kind = 'hazard'; h.images = h.images || []; bumpSeq('hazard', h.id); });
  pois = [...BURGS, ...FLAVOR_MARKERS];
  hazards = HAZARDS;
  worldState = {campaignDay: WORLDSTATE.campaignDay || 0};
  eventLog = EVENTLOG;
  buildLegend();
  initMap(maxZoom, ROUTES);
  updateDayCounter();

  // Subscribe to board place nodes live — merge into pois by id or name match
  onValue(_fbRef(db, `campaigns/${campaignId}/nodes`), snap => {
    if (!snap.exists()) return;
    const boardNodes = snap.val();
    let changed = false;

    Object.entries(boardNodes).forEach(([nodeId, node]) => {
      if (node.tag !== 'place') return;

      // Try to find a matching burg: by mapNodeId, burgId, or name
      let existing = pois.find(p => p.mapNodeId === nodeId)
        || (node.burgId && pois.find(p => p.id === node.burgId))
        || pois.find(p => p.name?.toLowerCase() === node.name?.toLowerCase());

      if (existing) {
        // Attach board link + mapRef if not already set
        if (existing.mapNodeId !== nodeId) { existing.mapNodeId = nodeId; changed = true; }
        if (node.mapUrl && !existing.mapRef) { existing.mapRef = node.mapUrl; changed = true; }
      } else {
        // No matching burg — add as synthetic unplaced pin
        const syntheticId = node.burgId || nodeId;
        if (!pois.find(p => p.id === syntheticId)) {
          pois.push({
            id: syntheticId, kind: 'place',
            name: node.name || 'Unnamed place',
            mapNodeId: nodeId, mapRef: node.mapUrl || null,
            status: 'Unknown', images: [], x: null, y: null,
          });
          changed = true;
        }
      }
    });

    if (changed && map) updateBurgVisibility();
  });
}).catch(err => {
  _$('zoomNote').textContent = 'failed to load data -- serve this folder, don\u2019t open the file directly';
  console.error(err);
});

function initMap(maxZoom, ROUTES){
  map = L.map('map', {
    crs: L.CRS.Simple,
    minZoom: -4,
    maxZoom: maxZoom,
    zoomSnap: 0.25,
    attributionControl: false,
  });

  // This export crops ~25.6 canonical units off the TOP relative to the
  // original (less empty ocean margin) while the bottom and both side edges
  // line up with the original almost exactly -- confirmed by matching the
  // 0,0 gridline intersection in both exports rather than assuming a uniform
  // scale-up. Top-anchored bounds would silently shift every burg south.
  //
  // Separately: Leaflet always treats the LARGER of the two lat values as
  // north/top of screen, but burg/route Y data is plain image pixel rows,
  // where SMALLER means closer to the top. Passed in directly, that's
  // backwards -- the map image renders fine on its own, but every marker,
  // route, and hazard ends up mirrored top-to-bottom relative to it.
  // Negating Y everywhere it's handed to Leaflet fixes that without
  // touching the underlying data.
  const TOP_OFFSET = 25.6;
  const bounds = [[-IMG_H, 0], [-TOP_OFFSET, IMG_W]];
  L.imageOverlay(WORLD_IMAGE, bounds).addTo(map);
  map.fitBounds(bounds);

  map.on('zoomend', () => {
    const z = map.getZoom();
    const note = _$('zoomNote');
    if (z >= maxZoom) note.textContent = 'native resolution \u2014 pan freely';
    else if (z > 0) note.textContent = 'zoomed in \u00d7' + Math.round(2**z) + ' (more detail available)';
    else note.textContent = 'zoomed out \u00d7' + Math.round(2**-z);
  });

  // Roads/trails/sea routes drawn first, hazard zones next, markers last --
  // each layer sits visually on top of the one before it so pins stay
  // clickable even with a translucent hazard circle underneath them.
  const routeStyle = {
    roads:     {color:'#5c4a30', weight:1.6, opacity:0.85},
    trails:    {color:'#8a7a5a', weight:0.6, opacity:0.45, dashArray:'2 4'},
    searoutes: {color:'#3a6b8a', weight:0.8, opacity:0.4,  dashArray:'4 4'},
  };
  ROUTES.forEach(r => {
    const style = routeStyle[r.group] || routeStyle.trails;
    L.polyline(r.path.map(p => [-p[0], p[1]]), style).addTo(map);
  });

  hazards.forEach(addHazardLayer);

  pois.forEach(poi => {
    const m = L.marker([-poi.y, poi.x], {icon: makeIcon(poi, poi.images && poi.images.length > 0)});
    m.bindTooltip(tooltipFor(poi), {className:'poi-label', direction:'top', offset:[0,-10]});
    m.on('click', () => openPoi(poi.id));
    markers[poi.id] = m;
    if (poi.kind === 'marker' || poi.capital) m.addTo(map);
  });

  // Arm one of the "+ Add ..." buttons, then the next plain map click (not
  // a click on an existing marker/circle, which stop their own
  // propagation) creates a new one right there and opens it for editing.
  map.on('click', e => {
    if (!armedFor) return;
    const kind = armedFor;
    toggleArm(kind); // flips armedFor back off and resets button text/cursor
    const y = -e.latlng.lat, x = e.latlng.lng;
    if (kind === 'hazard') createHazard(y, x); else createPoi(kind, y, x);
  });

  map.on('zoomend', updateBurgVisibility);
  updateBurgVisibility();
}

// Minor burgs only appear once you've zoomed in enough that 800+ pins
// wouldn't just be a solid mass of dots over the world view. Top-level
// (not nested in initMap) so editing population/capital through the panel
// can re-trigger it immediately.
function burgPopThreshold(z){
  if (z < -2) return Infinity;
  if (z < -1) return 10;
  if (z < 0)  return 3;
  return -Infinity;
}
function updateBurgVisibility(){
  const thresh = burgPopThreshold(map.getZoom());
  pois.forEach(poi => {
    if (poi.kind !== 'burg' || poi.capital) return;
    const m = markers[poi.id];
    const show = poi.population >= thresh;
    const has = map.hasLayer(m);
    if (show && !has) m.addTo(map);
    if (!show && has) map.removeLayer(m);
  });
}

function makeIcon(poi, hasImages){
  if (poi.kind === 'marker') {
    return L.divIcon({
      className: '',
      html: '<div class="flavor-pin">' + (poi.icon || '?') + '</div>',
      iconSize: [20,20],
      iconAnchor: [10,10],
    });
  }
  const color = TYPE_COLORS[poi.type] || TYPE_COLORS.Generic;
  const statusClass = poi.status === 'Destroyed' ? ' destroyed' : poi.status === 'Occupied' ? ' occupied' : '';
  const cls = 'poi-pin' + (poi.capital ? ' capital' : '') + (hasImages ? ' has-map' : '') + statusClass;
  const size = poi.capital ? 22 : 14;
  return L.divIcon({
    className: '',
    html: '<div class="' + cls + '" style="background:' + color + '"></div>',
    iconSize: [size, size],
    iconAnchor: [size/2, size/2],
  });
}

function toggleArm(kind){
  armedFor = (armedFor === kind) ? null : kind;
  document.getElementById('addBurgBtn').textContent = armedFor === 'burg' ? 'Click the map\u2026' : '+ Add burg';
  document.getElementById('addMarkerBtn').textContent = armedFor === 'marker' ? 'Click the map\u2026' : '+ Add marker';
  document.getElementById('addHazardBtn').textContent = armedFor === 'hazard' ? 'Click the map\u2026' : '+ Add hazard zone';
  map.getContainer().style.cursor = armedFor ? 'crosshair' : '';
}

function createPoi(kind, y, x){
  const id = kind + '-' + (poiSeq[kind]++);
  const poi = kind === 'burg'
    ? {id, kind, name:null, x, y, population:0, capital:false, port:false, type:'Generic', status:'Unknown', images:[], custom:{}}
    : {id, kind, name:null, x, y, icon:'\u2753', images:[], custom:{}};
  pois.push(poi);
  const m = L.marker([-poi.y, poi.x], {icon: makeIcon(poi, false)});
  m.bindTooltip(tooltipFor(poi), {className:'poi-label', direction:'top', offset:[0,-10]});
  m.on('click', () => openPoi(poi.id));
  markers[poi.id] = m;
  m.addTo(map);
  markDirty(kind === 'burg' ? 'burgs' : 'markers');
  openPoi(poi.id);
}

function addHazardLayer(hazard){
  const circle = L.circle([-hazard.y, hazard.x], {
    radius: hazard.radius,
    color: hazard.color,
    weight: 1.5,
    fillColor: hazard.color,
    fillOpacity: hazard.opacity,
    opacity: Math.min(1, hazard.opacity + 0.3),
  }).addTo(map);
  circle.bindTooltip(poiLabel(hazard), {className:'poi-label'});
  circle.on('click', e => { L.DomEvent.stopPropagation(e); openHazard(hazard.id); });
  hazardLayers[hazard.id] = circle;
}

function createHazard(y, x){
  const id = 'hazard-' + (hazardSeq++);
  const hazard = {id, name:'New Hazard', kind:'hazard', x, y, radius:30, color:'#5a3d7a', opacity:0.4, images:[], custom:{}};
  hazards.push(hazard);
  addHazardLayer(hazard);
  markDirty('hazards');
  openHazard(id);
}

function deleteHazard(id){
  map.removeLayer(hazardLayers[id]);
  delete hazardLayers[id];
  hazards = hazards.filter(h => h.id !== id);
  markDirty('hazards');
  closeOverlay();
}

const overlay = _$('overlay');
const panel = _$('panel');

function closeOverlay(){ overlay.classList.remove('open'); panel.innerHTML=''; }
overlay.addEventListener('click', e => { if(e.target === overlay) closeOverlay(); });

function setSaveStatus(text, isError){
  const el = _$('saveStatus');
  el.textContent = text;
  el.style.color = isError ? '#d98a7a' : '#a89e8c';
}

// Every mutating action funnels through here, which both flags the dataset
// as changed and immediately tries to autosave it via serve.py. If that
// fetch fails -- no server, or a server with no /save endpoint, e.g. plain
// `python -m http.server` or GitHub Pages -- dirty stays true and the
// always-visible Download button is the fallback.
async function markDirty(which){
  dirty[which] = true;
  setSaveStatus('saving…', false);
  try {
    const dataset = which === 'burgs' ? pois.filter(p=>p.kind==='burg')
                  : which === 'markers' ? pois.filter(p=>p.kind==='marker')
                  : hazards;
    const obj = {};
    dataset.forEach(x => { obj[x.id] = x; });
    await set(_fbRef(_basePath + '/' + which), obj);
    setSaveStatus('saved', false);
    dirty[which] = false;
  } catch(e) {
    setSaveStatus('save failed', true);
  }
}

async function saveWorldState(){
  try {
    await fetch('/save/data/worldstate.json', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(worldState),
    });
  } catch (err) {
    console.warn('failed to save worldstate', err);
  }
}

async function saveEventLog(){
  try {
    await fetch('/save/data/eventlog.json', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(eventLog),
    });
  } catch (err) {
    console.warn('failed to save eventlog', err);
  }
}

function updateDayCounter(){
  document.getElementById('dayCounter').textContent = 'Day ' + (worldState.campaignDay || 0);
}

function rollDie(sides){ return 1 + Math.floor(Math.random() * sides); }

// The whole event engine in one place: who, what they did, how hard it hit.
// Future versions of the Who table can carry per-entry weights (the design
// doc calls these "influence values"); for now every entry is equally
// likely, which is a reasonable starting point until a campaign actually
// needs Bandits to be rarer than Wildlife or whatever else comes up.
const WHO_TABLE = ['Soldiers', 'Refugees', 'Cultists', 'Bandits', 'Zombie Horde', 'Death Fog', 'Citizens', 'Merchants', 'Nobility', 'Wildlife'];

const ACTION_TABLES = {
  'Soldiers':     ['Patrol', 'Mobilize', 'Fortify A Position', 'Skirmish', 'Requisition Supplies', 'Retreat'],
  'Refugees':     ['Flee', 'Arrive Seeking Shelter', 'Settle', 'Beg For Aid', 'Spread Disease', 'Share Unsettling Tales'],
  'Cultists':     ['Recruit', 'Sabotage', 'Hold A Ritual', 'Infiltrate', 'Proselytize', 'Vanish Without Trace'],
  'Bandits':      ['Move', 'Raid', 'Recruit', 'Attack', 'Establish A Camp'],
  'Zombie Horde': ['Wander', 'Attack', 'Consume', 'Grow', 'Split', 'Merge', 'Besiege', 'Overrun'],
  'Death Fog':    ['Advance', 'Intensify', 'Corrupt', 'Recede', 'Surge'],
  'Citizens':     ['Riot', 'Celebrate', 'Migrate', 'Petition Authorities', 'Trade', 'Spread Gossip'],
  'Merchants':    ['Run A Trade Caravan', 'Price Gouge', 'Smuggle Goods', 'Establish A New Route', 'Go Bankrupt'],
  'Nobility':     ['Issue A Decree', 'Raise Taxes', 'Host A Feast', 'Conspire', 'Exile Someone', 'Form An Alliance'],
  'Wildlife':     ['Migrate', 'Stampede', 'Infest An Area', 'Hunt', 'Nest', 'Flee A Danger'],
};

const STRENGTH_LABELS = ['Trivial', 'Tiny', 'Minor', 'Small', 'Moderate', 'Significant', 'Major', 'Severe', 'Critical', 'Catastrophic'];

// Rather than hand-writing a bespoke mechanical effect for every one of the
// ~50 Who+Action combinations (mostly arbitrary precision for no real
// benefit), actions are grouped into a few effect flavors and the actual
// magnitude comes from the strength roll. The Who/Action/Strength text is
// still fully specific even when the underlying number-crunching is generic.
const DESTRUCTIVE_ACTIONS = new Set(['Attack', 'Raid', 'Overrun', 'Besiege', 'Consume', 'Stampede', 'Riot', 'Skirmish', 'Sabotage']);
const FOG_GROWTH_ACTIONS = new Set(['Advance', 'Intensify', 'Corrupt', 'Surge']);
const FOG_RECEDE_ACTIONS = new Set(['Recede']);

function pickRandom(arr){ return arr[Math.floor(Math.random() * arr.length)]; }

// Every event leaves a line in its target's own "Event Log" custom field,
// whether or not it also changed a hard number. That's the actual answer
// to "how does this affect the future": open that burg next session and
// its history -- taxes raised, a caravan passing through, whatever -- is
// sitting right there in its Custom Fields, available to inform whatever
// the DM decides to do with it.
function logEventOnTarget(entity, line){
  entity.custom = entity.custom || {};
  entity.custom['Event Log'] = entity.custom['Event Log'] ? entity.custom['Event Log'] + '\n' + line : line;
}

function resolveOneDay(day){
  const eventRoll = rollDie(6);
  if (eventRoll <= 4) {
    return {day, event: false, text: 'Day ' + day + ': Quiet \u2014 no notable events.'};
  }

  const who = pickRandom(WHO_TABLE);
  const action = pickRandom(ACTION_TABLES[who]);
  const strength = rollDie(10);
  const strengthLabel = STRENGTH_LABELS[strength - 1];
  let effectText = '', target = null, targetName = null;

  // Every event happens somewhere -- Death Fog actions target an actual
  // fog hazard if one exists, everything else targets a random
  // non-destroyed burg. No persistent faction location is tracked (that's
  // the bigger "factions/hordes as real entities" feature, not this one),
  // so "where" is deliberately just "a place," not "the same horde
  // creeping from town to town."
  let targetEntity = null;
  if (who === 'Death Fog' && (FOG_GROWTH_ACTIONS.has(action) || FOG_RECEDE_ACTIONS.has(action)) && hazards.length) {
    targetEntity = hazards.find(h => /fog/i.test(h.name || '')) || hazards[0];
  } else {
    const candidates = pois.filter(p => p.kind === 'burg' && p.status !== 'Destroyed');
    if (candidates.length) targetEntity = pickRandom(candidates);
  }

  if (targetEntity) {
    target = targetEntity.id;
    targetName = poiLabel(targetEntity);

    if (targetEntity.kind === 'hazard') {
      const delta = FOG_RECEDE_ACTIONS.has(action) ? -Math.round(strength * 1.2) : Math.round(strength * 1.5);
      targetEntity.radius = Math.max(1, targetEntity.radius + delta);
      if (hazardLayers[targetEntity.id]) hazardLayers[targetEntity.id].setRadius(targetEntity.radius);
      effectText = ' ' + targetName + (delta >= 0 ? ' grew by ' : ' receded by ') + Math.abs(delta) + ' units.';
    } else if (DESTRUCTIVE_ACTIONS.has(action)) {
      const before = targetEntity.population;
      const lossPct = Math.min(0.95, strength * 0.08);
      targetEntity.population = +(targetEntity.population * (1 - lossPct)).toFixed(3);
      if (strength >= 9) targetEntity.status = 'Destroyed';
      else if (strength >= 5) targetEntity.status = 'Occupied';
      if (markers[targetEntity.id]) {
        markers[targetEntity.id].setIcon(makeIcon(targetEntity, targetEntity.images && targetEntity.images.length > 0));
        markers[targetEntity.id].setTooltipContent(tooltipFor(targetEntity));
      }
      effectText = ' ' + targetName + ' lost population (' + before.toFixed(2) + ' \u2192 ' + targetEntity.population.toFixed(2) + ')' +
        (targetEntity.status === 'Destroyed' ? ', and was destroyed.' : '.');
      updateBurgVisibility();
    } else {
      // No hard stat changes for the other ~40 Who+Action combinations --
      // deliberately not inventing 40 bespoke effects for actions like
      // "Host A Feast" or "Run A Trade Caravan." The log entry is the
      // consequence; it's there to read, reference, and build on.
      effectText = ' Recorded at ' + targetName + '.';
    }

    logEventOnTarget(targetEntity, 'Day ' + day + ': ' + who + ' ' + action.toLowerCase() + ' (' + strengthLabel + ').' + effectText);
    markDirty(targetEntity.kind === 'hazard' ? 'hazards' : 'burgs');
  }

  const text = 'Day ' + day + ': ' + who + ' ' + action.toLowerCase() +
    (targetName ? ' near ' + targetName : '') +
    (strength >= 6 ? ' (severity: ' + strengthLabel + ')' : '') + '.' + effectText;
  return {day, event: true, who, action, strength, strengthLabel, target, targetName, text};
}

function advanceDays(n){
  const results = [];
  for (let i = 0; i < n; i++) {
    worldState.campaignDay = (worldState.campaignDay || 0) + 1;
    results.push(resolveOneDay(worldState.campaignDay));
  }
  eventLog.push(...results);
  saveWorldState();
  saveEventLog();
  updateDayCounter();
  showAdvanceResults(n, results);
}

function advanceDaysCustom(){
  const n = parseInt(prompt('How many days to advance?', '1'), 10);
  if (n && n > 0) advanceDays(n);
}

function showAdvanceResults(n, results){
  const eventCount = results.filter(r => r.event).length;
  panel.innerHTML =
    '<h2>' + n + ' day' + (n > 1 ? 's' : '') + ' advanced</h2>' +
    '<p class="sub">Now on campaign day ' + worldState.campaignDay + ' \u00b7 ' + eventCount + ' event' + (eventCount !== 1 ? 's' : '') + ' occurred</p>' +
    '<ul style="padding-left:18px;font-size:13px;margin:0;max-height:50vh;overflow:auto;">' +
      results.map(r => '<li' + (r.event ? '' : ' style="color:#9b9484"') + '>' + escapeAttr(r.text) + '</li>').join('') +
    '</ul>' +
    '<div class="btnrow"><button class="primary" onclick="closeOverlay()">Close</button></div>';
  overlay.classList.add('open');
}

function renderEditFields(poi){
  let f = '<div class="field-row"><label>Name</label>' +
    '<input type="text" id="f-name" placeholder="' + escapeAttr(poiLabel(poi)) + '" value="' + escapeAttr(poi.name || '') + '"></div>';
  if (poi.kind === 'burg') {
    f += '<div class="field-row"><label>Population</label>' +
      '<input type="number" step="0.001" id="f-population" value="' + (poi.population ?? 0) + '"></div>';
    f += '<div class="field-row"><label>Type</label><select id="f-type">' +
      Object.keys(TYPE_COLORS).map(t => '<option value="'+t+'"'+(t===poi.type?' selected':'')+'>'+t+'</option>').join('') +
      '</select></div>';
    f += '<div class="field-row"><label>Status</label><select id="f-status">' +
      BURG_STATUSES.map(s => '<option value="'+s+'"'+(s===poi.status?' selected':'')+'>'+s+'</option>').join('') +
      '</select></div>';
    f += '<div class="field-row"><label>Capital</label><input type="checkbox" id="f-capital" '+(poi.capital?'checked':'')+'></div>';
    f += '<div class="field-row"><label>Port</label><input type="checkbox" id="f-port" '+(poi.port?'checked':'')+'></div>';
  } else {
    f += '<div class="field-row"><label>Icon</label>' +
      '<input type="text" id="f-icon" maxlength="4" value="' + escapeAttr(poi.icon || '') + '"></div>';
  }
  return f;
}

function renderHazardFields(hazard){
  return '<div class="field-row"><label>Name</label>' +
      '<input type="text" id="h-name" value="' + escapeAttr(hazard.name || '') + '"></div>' +
    '<div class="field-row"><label>Radius</label>' +
      '<input type="number" step="1" min="1" id="h-radius" value="' + hazard.radius + '">' +
      '<span class="hint">canonical units (\u22481 mi each)</span></div>' +
    '<div class="field-row"><label>Color</label>' +
      '<input type="color" id="h-color" value="' + hazard.color + '"></div>' +
    '<div class="field-row"><label>Opacity</label>' +
      '<input type="range" id="h-opacity" min="0.05" max="0.9" step="0.05" value="' + hazard.opacity + '"></div>';
}

function renderCustomFields(entity){
  const custom = entity.custom || {};
  let rows = Object.keys(custom).map(k =>
    '<div class="custom-row">' +
      '<input class="custom-key" value="' + escapeAttr(k) + '" disabled>' +
      '<textarea class="custom-val" data-key="' + escapeAttr(k) + '">' + escapeAttr(custom[k]) + '</textarea>' +
      '<button class="iconbtn remove-custom" data-id="' + entity.id + '" data-key="' + escapeAttr(k) + '" title="Remove field">\u2715</button>' +
    '</div>'
  ).join('');
  rows += '<div class="custom-row">' +
    '<input class="custom-key" id="new-key" placeholder="Field name">' +
    '<textarea class="custom-val" id="new-val" placeholder="e.g. a description, important NPCs, plot hooks..."></textarea>' +
    '<button class="iconbtn" onclick="addCustomField(\'' + entity.id + '\')" title="Add field">+</button>' +
  '</div>';
  return rows;
}

function renderGallery(entity){
  const images = entity.images || [];
  let html = '<div class="gallery">';
  images.forEach((img, i) => {
    html += '<div class="gallery-item">' +
      '<img src="' + escapeAttr(img.path) + '">' +
      '<div class="gallery-item-row">' +
        '<input class="gallery-label" data-idx="' + i + '" placeholder="Label (e.g. City map, NPC portrait)" value="' + escapeAttr(img.label || '') + '">' +
        '<button class="iconbtn remove-image" data-id="' + entity.id + '" data-idx="' + i + '" title="Remove image">\u2715</button>' +
      '</div>' +
    '</div>';
  });
  html += '</div>';
  html += '<label class="drop">Click to add an image, or drag one here' +
      '<input type="file" accept="image/*" onchange="handleImageUpload(event,\'' + entity.id + '\')">' +
    '</label>';
  return html;
}

// Delegated listener covers both the custom-field and gallery remove
// buttons, since both are rebuilt fresh every time the panel re-renders.
panel.addEventListener('click', e => {
  const removeCustom = e.target.closest('.remove-custom');
  if (removeCustom) { removeCustomField(removeCustom.dataset.id, removeCustom.dataset.key); return; }
  const removeImg = e.target.closest('.remove-image');
  if (removeImg) { removeImage(removeImg.dataset.id, parseInt(removeImg.dataset.idx)); return; }
});

function syncGalleryLabels(entity){
  document.querySelectorAll('.gallery-label[data-idx]').forEach(el => {
    const idx = parseInt(el.dataset.idx);
    if (entity.images && entity.images[idx]) entity.images[idx].label = el.value;
  });
}

function openPoi(id){
  const poi = pois.find(p => p.id === id);
  const boardLink = poi.mapNodeId
    ? `<button class="small" id="poi-goto-board" style="background:var(--accent);color:#fff;border:none;padding:5px 10px;border-radius:4px;cursor:pointer;font-size:11px;margin-right:6px">📌 Board</button>`
    : '';
  const vttKey = poi.mapRef || (poi.kind === 'burg' ? poi.id : null);
  const vttLink = vttKey
    ? `<button class="small" id="poi-goto-vtt" style="background:#2a5a2a;color:#fff;border:none;padding:5px 10px;border-radius:4px;cursor:pointer;font-size:11px">▶ Session here</button>`
    : '';

  panel.innerHTML =
    '<h2>' + poiLabel(poi) + '</h2>' +
    '<p class="sub">' + poi.kind + (poi.type ? ' \u00b7 ' + poi.type : '') + '</p>' +
    (boardLink || vttLink ? '<div class="btnrow" style="gap:6px;flex-wrap:wrap">' + boardLink + vttLink + '</div>' : '') +
    '<div id="poi-board-connections" style="margin:8px 0"></div>' +
    renderEditFields(poi) +
    '<div class="btnrow"><button class="primary" onclick="saveEdits(\'' + id + '\')">Save</button></div>' +
    '<hr class="divider">' +
    '<div class="sub-label">Custom fields</div>' +
    renderCustomFields(poi) +
    '<hr class="divider">' +
    '<div class="sub-label">Images</div>' +
    renderGallery(poi) +
    '<div class="btnrow"><button onclick="closeOverlay()">Close</button></div>';

  overlay.classList.add('open');

  // Load connected board nodes if this burg is linked to a board place node
  if(poi.mapNodeId){
    Promise.all([
      get(_fbRef(db, `campaigns/${campaignId}/nodes`)),
      get(_fbRef(db, `campaigns/${campaignId}/edges`)),
    ]).then(([nodesSnap, edgesSnap]) => {
      const allNodes = nodesSnap.val() || {};
      const allEdges = edgesSnap.val() || {};

      // Find edges connected to this place node
      const connected = Object.values(allEdges)
        .filter(e => e.from === poi.mapNodeId || e.to === poi.mapNodeId)
        .map(e => {
          const otherId = e.from === poi.mapNodeId ? e.to : e.from;
          const other   = allNodes[otherId];
          return other ? { role: e.role, node: other } : null;
        })
        .filter(Boolean)
        .sort((a,b) => (a.node.tag||'').localeCompare(b.node.tag||''));

      const TAG_ICONS = { person:'👤', event:'⚡', faction:'⚔', object:'📦', plan:'📋', pc:'🧙' };
      const el = panel.querySelector('#poi-board-connections');
      if(!el || !connected.length) return;
      el.innerHTML = '<div class="sub-label" style="margin-bottom:4px">Board connections</div>'
        + connected.map(({role, node}) =>
            `<div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid rgba(0,0,0,.12);font-size:12px">
              <span>${TAG_ICONS[node.tag]||'•'}</span>
              <span style="flex:1;font-weight:600">${node.name||'?'}</span>
              <span style="color:var(--muted);font-size:11px">${role||''}</span>
            </div>`
          ).join('');
    });
  }

  const boardBtn = panel.querySelector('#poi-goto-board');
  if(boardBtn) boardBtn.addEventListener('click', () => {
    if(onOpenBoard) onOpenBoard(poi.mapNodeId);
  });
  const vttBtn = panel.querySelector('#poi-goto-vtt');
  if(vttBtn) vttBtn.addEventListener('click', () => {
    set(_fbRef(db, 'session/currentMap'), vttKey);
    if(onOpenVTT) onOpenVTT(vttKey);
  });
}

function openHazard(id){
  const hazard = hazards.find(h => h.id === id);
  panel.innerHTML =
    '<h2>' + poiLabel(hazard) + '</h2>' +
    '<p class="sub">Hazard zone</p>' +
    renderHazardFields(hazard) +
    '<div class="btnrow">' +
      '<button onclick="deleteHazard(\'' + id + '\')">Delete</button>' +
      '<button class="primary" onclick="saveHazardEdits(\'' + id + '\')">Save</button>' +
    '</div>' +
    '<hr class="divider">' +
    '<div class="sub-label">Custom fields</div>' +
    renderCustomFields(hazard) +
    '<hr class="divider">' +
    '<div class="sub-label">Images</div>' +
    renderGallery(hazard) +
    '<div class="btnrow"><button onclick="closeOverlay()">Close</button></div>';

  overlay.classList.add('open');
}

function saveEdits(id){
  const poi = pois.find(p => p.id === id);
  poi.name = document.getElementById('f-name').value.trim() || null;
  if (poi.kind === 'burg') {
    poi.population = parseFloat(document.getElementById('f-population').value) || 0;
    poi.type = document.getElementById('f-type').value;
    poi.status = document.getElementById('f-status').value;
    poi.capital = document.getElementById('f-capital').checked;
    poi.port = document.getElementById('f-port').checked;
  } else {
    poi.icon = document.getElementById('f-icon').value || poi.icon;
  }
  document.querySelectorAll('.custom-val[data-key]').forEach(el => {
    poi.custom = poi.custom || {};
    poi.custom[el.dataset.key] = el.value;
  });
  syncGalleryLabels(poi);
  markers[id].setIcon(makeIcon(poi, poi.images && poi.images.length > 0));
  markers[id].setTooltipContent(tooltipFor(poi));
  updateBurgVisibility();
  markDirty(poi.kind === 'burg' ? 'burgs' : 'markers');
  openPoi(id);
}

function saveHazardEdits(id){
  const hazard = hazards.find(h => h.id === id);
  hazard.name = document.getElementById('h-name').value.trim() || null;
  hazard.radius = parseFloat(document.getElementById('h-radius').value) || 1;
  hazard.color = document.getElementById('h-color').value;
  hazard.opacity = parseFloat(document.getElementById('h-opacity').value);
  document.querySelectorAll('.custom-val[data-key]').forEach(el => {
    hazard.custom = hazard.custom || {};
    hazard.custom[el.dataset.key] = el.value;
  });
  syncGalleryLabels(hazard);
  const layer = hazardLayers[id];
  layer.setRadius(hazard.radius);
  layer.setStyle({color: hazard.color, fillColor: hazard.color, fillOpacity: hazard.opacity, opacity: Math.min(1, hazard.opacity + 0.3)});
  layer.setTooltipContent(poiLabel(hazard));
  markDirty('hazards');
  openHazard(id);
}

function addCustomField(id){
  const entity = findEntity(id);
  const key = document.getElementById('new-key').value.trim();
  if (!key) return;
  const val = document.getElementById('new-val').value;
  entity.custom = entity.custom || {};
  entity.custom[key] = val;
  markDirty(datasetFor(entity));
  reopenEntity(id);
}

function removeCustomField(id, key){
  const entity = findEntity(id);
  if (entity.custom) delete entity.custom[key];
  markDirty(datasetFor(entity));
  reopenEntity(id);
}

function removeImage(id, idx){
  const entity = findEntity(id);
  entity.images.splice(idx, 1);
  markDirty(datasetFor(entity));
  reopenEntity(id);
}

async function handleImageUpload(evt, id){
  const file = evt.target.files[0];
  if (!file) return;
  setSaveStatus('Uploading image\u2026', false);
  try {
    const res = await fetch('/upload-image/' + id, {
      method: 'POST',
      headers: {'X-Filename': file.name},
      body: file,
    });
    if (!res.ok) throw new Error('upload endpoint returned ' + res.status);
    const {path} = await res.json();
    const entity = findEntity(id);
    entity.images = entity.images || [];
    entity.images.push({label:'', path});
    if (entity.kind !== 'hazard') {
      markers[id].setIcon(makeIcon(entity, true));
    }
    setSaveStatus('', false);
    markDirty(datasetFor(entity));
    reopenEntity(id);
  } catch (err) {
    setSaveStatus('Image upload failed \u2014 is serve.py running?', true);
    console.warn(err);
  }
}

function cleanForExport(arr){
  return arr.map(({kind, ...rest}) => rest);
}
function downloadJSON(filename, data){
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
function exportBurgs(){ downloadJSON('burgs.json', cleanForExport(pois.filter(p => p.kind === 'burg'))); }
function exportMarkers(){ downloadJSON('markers.json', cleanForExport(pois.filter(p => p.kind === 'marker'))); }
function exportHazards(){ downloadJSON('hazards.json', cleanForExport(hazards)); }


  // ── Expose onclick functions to window (called from injected HTML) ────────
  window.toggleArm      = toggleArm;
  window.advanceDays    = advanceDays;
  window.advanceDaysCustom = advanceDaysCustom;
  window.exportBurgs    = exportBurgs;
  window.exportMarkers  = exportMarkers;
  window.exportHazards  = exportHazards;
  window.closeOverlay   = closeOverlay;
  window.saveEdits      = saveEdits;
  window.saveHazardEdits = saveHazardEdits;
  window.addCustomField = addCustomField;
  window.removeCustomField = removeCustomField;
  window.removeImage    = removeImage;
  window.handleImageUpload = handleImageUpload;
  window.reopenEntity   = reopenEntity;
  window.deleteHazard   = deleteHazard;

  // ── flyTo (called by board view) ──────────────────────────────────────────
  container._flyTo = function(placeNode) {
    const burg = pois.find(p =>
      p.name?.toLowerCase() === placeNode.name?.toLowerCase() || p.id === placeNode.id
    );
    if (burg && map) {
      map.flyTo([-burg.y, burg.x], 1, { duration: 0.8 });
      openPoi(burg.id);
    }
  };

  // ── Seed from JSON (one-time migration) ───────────────────────────────────
  container._seedFromJson = async function({ burgsUrl, markersUrl, routesUrl }) {
    const [b, m, r] = await Promise.all([
      fetch(burgsUrl).then(x=>x.json()).catch(()=>[]),
      fetch(markersUrl).then(x=>x.json()).catch(()=>[]),
      fetch(routesUrl).then(x=>x.json()).catch(()=>[]),
    ]);
    const bo = {}, mo = {};
    b.forEach(x => bo[x.id] = x);
    m.forEach(x => mo[x.id] = x);
    await Promise.all([
      set(_fbRef(db, _basePath + '/burgs'),   bo),
      set(_fbRef(db, _basePath + '/markers'), mo),
      set(_fbRef(db, _basePath + '/routes'),  r),
    ]);
    console.log('[world-view] seeded', b.length, 'burgs,', m.length, 'markers');
  };

  return function destroy() {
    // Remove window-scoped functions
    ['toggleArm','advanceDays','advanceDaysCustom','exportBurgs','exportMarkers',
     'exportHazards','closeOverlay','saveEdits','saveHazardEdits','addCustomField',
     'removeCustomField','removeImage','handleImageUpload','reopenEntity','deleteHazard']
    .forEach(fn => delete window[fn]);
    if (map) { map.remove(); }
    container.innerHTML = '';
  };
}
