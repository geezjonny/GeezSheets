// Editor — all GM tool wiring for mapeditor
// Handles: token modal, chain modal, prop modal, drop handler,
// HP adjust popover, weather panel, clear section, JSON import,
// terrain/stamp/prop dropdowns, AFK oracle, GM notes, initiative UI,
// background image tools, session tabs

import { db }                              from "./firebase.js";
import { ref, set, get, child, update, remove, push } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-database.js";
import { getTERRAINS, getSTAMPS, getSIZES, TILE }     from "./config.js";
import { textures, tokenTextures, propTextures,
         tryLoadTokenTexture, tryLoadPropTexture }     from "./assets.js";
import { camera, toWorld }                             from "./camera.js";
import { saveFog }                                     from "./fog.js";
import { saveWeather, weather }                        from "./weather.js";
import { sendChat }                                    from "./chat.js";
import { addToInitiative, removeFromInitiative,
         nextTurn, clearInitiative, reorderInitiative,
         renderInitTrack }                             from "./initiative.js";
import { applyCondition, deleteToken as deleteTokenRTDB } from "./tokens.js";
import { saveChain, deleteChain, chainsForToken }      from "./chains.js";
import { rollAfkDecision, EXPLORE_TABLE }              from "./afkOracle.js";
import { saveTiles, saveWallGroups, saveDoors,
         saveStamp, savePropsLocal }                   from "./map.js";
import { pushUndo }                                    from "./undo.js";

// ── State refs (set by initEditor) ────────────────────────────────────────────
let S; // shared state: { tiles, fogGroups, wallGroups, doors, tokens, stamps, props, chains }
let E; // editor state: { bgImage, bgUrl, bgPpi, nightMode, pcsData, propDefs, customProps,
       //                  currentTerrain, currentStamp, currentProp, placingToken,
       //                  playerName, mapInput, statusEl }
let I; // interaction: { ctxTokenId, ctxPropKey, initiative, lastCtxX, lastCtxY }
let _toast, _getMapName, _showNameModal, _subscribeLive, _commitSelection;

export function initEditor(state, editorState, interaction, helpers) {
  S = state;
  E = editorState;
  I = interaction;
  ({ toast: _toast, getMapName: _getMapName, showNameModal: _showNameModal,
     subscribeLive: _subscribeLive, commitSelection: _commitSelection } = helpers);

  _wireWeather();
  _wireChat();
  _wireInitiative();
  _wireContextMenu();
  _wireHpPopover();
  _wirePropContextMenu();
  _wireClearSection();
  _wireJsonImport();
  _wireDragDrop();
  _wireTokenModal();
  _wirePropModal();
  _wireDropdowns();
  _wireSessionTabs();
  _wireAfkOracle();
  _wireGmNotes();
  _wireBgTools();
}

// ── Save helpers ──────────────────────────────────────────────────────────────
export function scheduleSave() {
  const el = E.statusEl;
  if (el) { el.className="saving"; el.textContent="Saving…"; }
  clearTimeout(E.saveTimer);
  E.saveTimer = setTimeout(async () => {
    const m = _getMapName();
    try {
      E.isSavingTiles = true;
      await set(ref(db, `maps/${m}/tiles`), Object.keys(S.tiles).length ? S.tiles : null);
      await set(ref(db, `maps/${m}/updatedAt`), Date.now());
      if (el) { el.className="live"; el.textContent="Live ✓"; }
    } catch(e) {
      if (el) { el.className="error"; el.textContent="Error"; }
    } finally { E.isSavingTiles = false; }
  }, 600);
}

export async function saveTokenLocal(id, data) {
  await set(ref(db, `maps/${_getMapName()}/tokens/${id}`), data);
}

export async function savePropDef(p) {
  await set(ref(db, `propDefs/${p.id}`), p);
}

// ── Terrain / Stamp / Prop dropdowns ─────────────────────────────────────────
export function buildTerrainDropdown() {
  const dd = document.getElementById("terrain-swatch-grid");
  if (!dd) return;
  dd.innerHTML = "";
  const TERRAINS = getTERRAINS();
  [...TERRAINS, {id:"erase",label:"Erase",color:"#1a1510"}].forEach(t => {
    const el = document.createElement("div");
    el.className = "opt-swatch" + (t.id===E.currentTerrain?" active":"");
    if (t.id==="erase") {
      el.innerHTML = `<span style="font-size:16px">✕</span><div class="opt-swatch-label">Erase</div>`;
      el.style.background="#1a1510";
    } else {
      if (textures[t.id]) el.style.backgroundImage = `url(${textures[t.id].src})`;
      else el.style.backgroundColor = t.color || "#334";
      el.innerHTML = `<div class="opt-swatch-label">${t.label}</div>`;
    }
    el.onclick = () => selectTerrain(t.id);
    dd.appendChild(el);
  });
  // Also rebuild wall terrain grid
  const wg = document.getElementById("wall-terrain-grid");
  if (!wg) return;
  wg.innerHTML = "";
  TERRAINS.forEach(t => {
    const el = document.createElement("div");
    el.className = "opt-swatch" + (t.id===E.currentTerrain?" active":"");
    if (textures[t.id]) el.style.backgroundImage = `url(${textures[t.id].src})`;
    else el.style.backgroundColor = t.color || "#334";
    el.innerHTML = `<div class="opt-swatch-label">${t.label}</div>`;
    el.onclick = () => selectTerrain(t.id);
    wg.appendChild(el);
  });
}

export function selectTerrain(t) {
  E.currentTerrain = t;
  buildTerrainDropdown();
}

export function buildStampDropdown() {
  const grid = document.getElementById("stamp-swatch-grid");
  if (!grid) return;
  grid.innerHTML = "";
  const STAMPS = getSTAMPS();
  // Erase
  const eraseEl = document.createElement("div");
  eraseEl.className = "stamp-item" + (E.currentStamp==="erase"?" active":"");
  eraseEl.textContent = "✕"; eraseEl.style.fontSize="16px";
  eraseEl.onclick = () => selectStamp("erase");
  grid.appendChild(eraseEl);
  STAMPS.forEach(s => {
    const el = document.createElement("div");
    el.className = "stamp-item" + (s===E.currentStamp?" active":"");
    el.textContent = s;
    el.onclick = () => selectStamp(s);
    grid.appendChild(el);
  });
}

export function selectStamp(s) {
  E.currentStamp = s; E.currentProp = null;
  buildStampDropdown(); buildPropDropdown();
}

export function buildPropDropdown() {
  const grid = document.getElementById("prop-swatch-grid");
  if (!grid) return;
  grid.innerHTML = "";
  // Erase
  const eraseEl = document.createElement("div");
  eraseEl.className = "prop-item" + (E.currentProp==="erase"?" active":"");
  eraseEl.innerHTML = `<span style="font-size:16px">✕</span>`;
  eraseEl.onclick = () => selectProp("erase");
  grid.appendChild(eraseEl);
  E.customProps.forEach(p => {
    const el = document.createElement("div");
    el.className = "prop-item" + (E.currentProp&&E.currentProp.id===p.id?" active":"");
    const img = propTextures[p.id];
    if (img) el.style.backgroundImage = `url(${img.src})`;
    else el.textContent = p.emoji || "📦";
    el.title = p.label;
    el.onclick = () => selectProp(p);
    grid.appendChild(el);
  });
}

export function selectProp(p) {
  E.currentProp = p; E.currentStamp = null;
  buildPropDropdown(); buildStampDropdown();
}

// ── Background tools ──────────────────────────────────────────────────────────
function _wireBgTools() {
  document.getElementById("bg-set-btn")?.addEventListener("click", async () => {
    const url = document.getElementById("bg-url-input")?.value.trim();
    const ppi = parseInt(document.getElementById("bg-ppi-input")?.value) || 70;
    if (!url) return;
    const m = _getMapName();
    await set(ref(db, `maps/${m}/background`), url);
    await set(ref(db, `maps/${m}/backgroundPpi`), ppi);
    _toast("Background set");
  });

  document.getElementById("bg-clear-btn")?.addEventListener("click", async () => {
    if (!confirm("Clear background image?")) return;
    const m = _getMapName();
    await set(ref(db, `maps/${m}/background`), null);
    await set(ref(db, `maps/${m}/backgroundPpi`), null);
    E.bgImage = null; E.bgUrl = "";
    _toast("Background cleared");
  });

  document.getElementById("night-toggle-btn")?.addEventListener("click", async () => {
    E.nightMode = !E.nightMode;
    await set(ref(db, `maps/${_getMapName()}/nightMode`), E.nightMode);
    refreshNightBtn();
  });

  document.getElementById("fit-btn")?.addEventListener("click", () => {
    const canvas = document.getElementById("canvas");
    if (!canvas) return;
    const coords = Object.keys(S.tiles).map(k=>k.split(",").map(Number));
    if (!coords.length) return;
    const xs=coords.map(([x])=>x),ys=coords.map(([,y])=>y);
    const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
    const mapW=(maxX-minX+1)*TILE,mapH=(maxY-minY+1)*TILE;
    camera.zoom=Math.min((canvas.width-80)/mapW,(canvas.height-80)/mapH,2);
    camera.x=canvas.width/2-(minX*TILE+mapW/2)*camera.zoom;
    camera.y=canvas.height/2-(minY*TILE+mapH/2)*camera.zoom;
  });
}

export function refreshNightBtn() {
  const btn = document.getElementById("night-toggle-btn");
  if (btn) btn.textContent = E.nightMode ? "🌙 Night Mode: On" : "🌙 Night Mode: Off";
}

export function refreshBgStatus(url) {
  const el = document.getElementById("bg-status-text");
  if (el) el.textContent = url ? `Set: ${url.slice(0,40)}…` : "";
}

// ── Weather ───────────────────────────────────────────────────────────────────
function _wireWeather() {
  const btn = document.getElementById("weatherBtn");
  const panel = document.getElementById("weather-panel");
  if (!btn || !panel) return;
  ["rain","snow","mist","storm"].forEach(t => {
    const toggle = document.getElementById(`wx-${t}-toggle`);
    const slider = document.getElementById(`wx-${t}-intensity`);
    if (!toggle||!slider) return;
    toggle.checked = weather[t].enabled; slider.value = weather[t].intensity;
    toggle.onchange = () => { weather[t].enabled = toggle.checked; saveWeather(); };
    slider.oninput  = () => { weather[t].intensity = parseFloat(slider.value); saveWeather(); };
  });
  btn.onclick = e => {
    e.stopPropagation();
    const r = btn.getBoundingClientRect();
    panel.style.left = r.left + "px";
    panel.classList.toggle("open");
  };
  panel.addEventListener("click",         e=>e.stopPropagation());
  panel.addEventListener("pointerdown",   e=>e.stopPropagation());
  panel.addEventListener("pointerup",     e=>e.stopPropagation());
}

// ── Chat & Dice ───────────────────────────────────────────────────────────────
function _wireChat() {
  const sendBtn  = document.getElementById("chat-send");
  const chatInput = document.getElementById("chat-input");
  if (!sendBtn||!chatInput) return;
  sendBtn.onclick = () => {
    if (!E.playerName) { _showNameModal(); return; }
    sendChat(chatInput.value, E.playerName); chatInput.value="";
  };
  chatInput.addEventListener("keydown", e => {
    if (e.key==="Enter"&&!e.shiftKey) {
      e.preventDefault();
      if (!E.playerName) { _showNameModal(); return; }
      sendChat(chatInput.value, E.playerName); chatInput.value="";
    }
  });
}

// ── Initiative ────────────────────────────────────────────────────────────────
function _wireInitiative() {
  document.getElementById("init-add-btn")?.addEventListener("click", () => {
    const name = prompt("Add to initiative — name:");
    if (!name?.trim()) return;
    addToInitiative(I.initiative, name.trim(), E.playerName||"GM");
  });
  document.getElementById("init-next-btn")?.addEventListener("click",  () => nextTurn(I.initiative, E.playerName||"GM"));
  document.getElementById("init-clear-btn")?.addEventListener("click", () => { if(confirm("Clear initiative?")) clearInitiative(); });
}

export function renderInit(containerEl) {
  renderInitTrack(containerEl, I.initiative, {
    onCardClick: (id, entry) => {
      const tok = Object.values(S.tokens).find(t=>t.name?.toLowerCase()===entry.name.toLowerCase());
      if (tok) { /* ping to token */ }
    },
    onRemove: id => removeFromInitiative(I.initiative, id, E.playerName||"GM"),
    onDropReorder: newOrder => reorderInitiative(I.initiative, newOrder),
  });
}

// ── Context menu ──────────────────────────────────────────────────────────────
function _wireContextMenu() {
  document.querySelectorAll(".ctx-item").forEach(item => {
    item.onclick = () => {
      if (!I.ctxTokenId) { document.getElementById("ctx-menu")?.classList.remove("open"); return; }
      const cond=item.dataset.condition, action=item.dataset.action;
      const m = _getMapName();
      if (cond)               applyCondition(m, I.ctxTokenId, cond, S.tokens);
      if (action==="delete")  _deleteToken(I.ctxTokenId);
      if (action==="edit")    { document.getElementById("ctx-menu")?.classList.remove("open"); openEditTokenModal(I.ctxTokenId); return; }
      if (action==="chain")   { openChainModal(I.ctxTokenId); return; }
      if (action==="unchain") removeChainsForToken(I.ctxTokenId);
      if (action==="hide-hp") setTokenHideHp(I.ctxTokenId, true);
      if (action==="show-hp") setTokenHideHp(I.ctxTokenId, false);
      if (action==="adjust-hp") { document.getElementById("ctx-menu")?.classList.remove("open"); setTimeout(()=>openHpAdjustPopover(I.ctxTokenId),0); return; }
      document.getElementById("ctx-menu")?.classList.remove("open");
      if (action!=="chain") I.ctxTokenId=null;
    };
  });
  document.addEventListener("click", () => {
    document.getElementById("ctx-menu")?.classList.remove("open");
    document.getElementById("prop-ctx-menu").style.display="none";
    document.getElementById("weather-panel")?.classList.remove("open");
  });
}

async function _deleteToken(tokId) {
  await deleteTokenRTDB(_getMapName(), tokId, S.tokens);
}

async function setTokenHideHp(tokId, hide) {
  await update(ref(db, `maps/${_getMapName()}/tokens/${tokId}`), {hideHp:hide});
  if (S.tokens[tokId]) S.tokens[tokId].hideHp=hide;
  _toast(hide?"HP bar hidden":"HP bar shown");
}

// ── HP Adjust Popover ─────────────────────────────────────────────────────────
function _wireHpPopover() {
  const popover = document.getElementById("hp-adjust-popover");
  const slider  = document.getElementById("hp-adjust-slider");
  if (!popover||!slider) return;
  let hpCharId=null;
  slider.addEventListener("input", () => {
    document.getElementById("hp-adjust-current").textContent=slider.value;
  });
  slider.addEventListener("change", async () => {
    if (!hpCharId) return;
    const v=parseInt(slider.value);
    const c=E.pcsData[hpCharId]||{};
    const updates={};
    if(c.combat?.hp_current!==undefined) updates[`characters/pcs/${hpCharId}/combat/hp_current`]=v;
    else updates[`characters/pcs/${hpCharId}/hp`]=v;
    await update(ref(db),updates);
  });
  document.addEventListener("click",e=>{if(!popover.contains(e.target))popover.style.display="none";});

  window._openHpAdjustPopover=function(tokId){
    const tok=S.tokens[tokId];
    if(!tok||tok.type!=="pc"){_toast("Adjust HP is for PC tokens");return;}
    hpCharId=tok.characterId;
    const c=E.pcsData[hpCharId]||{};
    const maxHp=c.maxHp??c.combat?.hp_max??tok.maxHp??10;
    const hp=c.hp??c.combat?.hp_current??tok.hp??maxHp;
    document.getElementById("hp-adjust-name").textContent=tok.name||"PC";
    slider.max=maxHp; slider.value=hp;
    document.getElementById("hp-adjust-current").textContent=hp;
    document.getElementById("hp-adjust-max").textContent=maxHp;
    popover.style.left=I.lastCtxX+"px"; popover.style.top=I.lastCtxY+"px";
    popover.style.display="block";
  };
}

// alias used by context menu
function openHpAdjustPopover(tokId){window._openHpAdjustPopover?.(tokId);}

// ── Token modal ───────────────────────────────────────────────────────────────
let editingTokenId=null;

function _wireTokenModal() {
  const tokenBtn    = document.getElementById("tokenBtn");
  const tokCharSel  = document.getElementById("tok-char");
  const tokNameInput= document.getElementById("tok-name");
  const tokTypeInput= document.getElementById("tok-type");
  const tokHpInput  = document.getElementById("tok-hp");
  const tokMaxHpInput=document.getElementById("tok-maxhp");
  if (!tokenBtn) return;

  tokenBtn.onclick = async () => {
    tokCharSel.innerHTML='<option value="">Loading…</option>';
    try {
      const snap = await get(child(ref(db),"characters/pcs"));
      tokCharSel.innerHTML='<option value="__npc__">— Blank NPC —</option>';
      if (snap.exists()) {
        for (const [id,c] of Object.entries(snap.val())) {
          const opt=document.createElement("option");
          opt.value=id; opt.textContent=c.name||id;
          opt.dataset.hp=c.hp??c.combat?.hp_current??10;
          opt.dataset.maxhp=c.maxHp??c.combat?.hp_max??10;
          opt.dataset.type="pc";
          tokCharSel.appendChild(opt);
        }
      }
    } catch { tokCharSel.innerHTML='<option value="__npc__">— Blank NPC —</option>'; }
    tokNameInput.value=""; tokHpInput.value="10"; tokMaxHpInput.value="10"; tokTypeInput.value="npc";
    document.getElementById("tok-hp-row").style.display="flex";
    document.getElementById("tok-lookup-name").value="";
    document.getElementById("token-modal").classList.remove("hidden");
  };

  tokCharSel.addEventListener("change", () => {
    const opt=tokCharSel.selectedOptions[0];
    const isNpc=!opt||opt.value==="__npc__";
    document.getElementById("tok-hp-row").style.display=isNpc?"flex":"none";
    if (!isNpc&&opt.dataset.hp) { tokHpInput.value=opt.dataset.hp; tokMaxHpInput.value=opt.dataset.maxhp; tokTypeInput.value=opt.dataset.type||"pc"; }
    else { tokHpInput.value=""; tokMaxHpInput.value=""; tokTypeInput.value="npc"; }
  });

  document.getElementById("tok-cancel").onclick=()=>{editingTokenId=null;document.getElementById("tok-place").textContent="Place on Map";document.getElementById("token-modal").classList.add("hidden");E.placingToken=null;};

  document.getElementById("tok-place").onclick=async()=>{
    const charId=tokCharSel.value, opt=tokCharSel.selectedOptions[0];
    const name=tokNameInput.value.trim()||opt?.textContent||"Token";
    const lookupName=document.getElementById("tok-lookup-name").value.trim()||name;
    const type=tokTypeInput.value;
    const hp=parseInt(tokHpInput.value)||10, maxHp=parseInt(tokMaxHpInput.value)||hp;
    const size=parseFloat(document.getElementById("tok-size").value)||1;
    if (editingTokenId) {
      const tok=S.tokens[editingTokenId];
      if(tok){Object.assign(tok,{name,lookupName,type,hp,maxHp,size,characterId:charId});tryLoadTokenTexture(charId,lookupName);await saveTokenLocal(editingTokenId,tok);}
      editingTokenId=null;document.getElementById("tok-place").textContent="Place on Map";document.getElementById("token-modal").classList.add("hidden");_toast("Token updated");
    } else {
      E.placingToken={id:"tok_"+Date.now(),characterId:charId,name,lookupName,type,hp,maxHp,size,x:0,y:0};
      tryLoadTokenTexture(charId,lookupName);
      document.getElementById("token-modal").classList.add("hidden");_toast("Click the map to place token");
    }
  };

  // Spawn NPC quick button
  document.getElementById("spawn-npc-btn")?.addEventListener("click", () => {
    const name=document.getElementById("spawn-npc-name")?.value.trim()||"NPC";
    const hp=parseInt(document.getElementById("spawn-npc-hp")?.value)||10;
    const lookup=document.getElementById("spawn-npc-lookup")?.value.trim()||name;
    E.placingToken={id:"tok_"+Date.now(),characterId:"__npc__",name,lookupName:lookup,type:"npc",hp,maxHp:hp,size:1,x:0,y:0};
    tryLoadTokenTexture("__npc__",lookup);
    _toast("Click the map to place NPC");
  });
}

export function openEditTokenModal(tokId) {
  const tok=S.tokens[tokId]; if(!tok)return;
  editingTokenId=tokId;
  const tokNameInput=document.getElementById("tok-name");
  const tokTypeInput=document.getElementById("tok-type");
  const tokHpInput  =document.getElementById("tok-hp");
  const tokMaxHpInput=document.getElementById("tok-maxhp");
  if(tokNameInput)tokNameInput.value=tok.name||"";
  document.getElementById("tok-lookup-name").value=tok.lookupName||"";
  if(tokTypeInput)tokTypeInput.value=tok.type||"npc";
  if(tokHpInput)tokHpInput.value=tok.hp||10;
  if(tokMaxHpInput)tokMaxHpInput.value=tok.maxHp||tok.hp||10;
  document.getElementById("tok-hp-row").style.display="flex";
  const sizeSelect=document.getElementById("tok-size");
  if(sizeSelect)sizeSelect.value=tok.size||1;
  document.getElementById("tok-place").textContent="Save Changes";
  document.getElementById("token-modal").classList.remove("hidden");
}

// ── Chain modal ───────────────────────────────────────────────────────────────
function openChainModal(tokId) {
  const list=document.getElementById("chain-token-list"); list.innerHTML="";
  for (const [id,tok] of Object.entries(S.tokens)) {
    if (id===tokId) continue;
    const btn=document.createElement("button");
    btn.style.cssText="width:100%;height:36px;text-align:left;padding:0 12px;font-family:'Cinzel',serif;font-size:11px;border:1px solid var(--border);border-radius:4px;background:transparent;color:var(--text);cursor:pointer";
    btn.textContent=`${tok.type==="pc"?"👤":"👹"} ${tok.name}`;
    btn.onmouseenter=()=>btn.style.borderColor="var(--gold-dim)";
    btn.onmouseleave=()=>btn.style.borderColor="var(--border)";
    btn.onclick=async()=>{
      const maxDist=parseInt(document.getElementById("chain-max-dist")?.value)||6;
      const chainId="chain_"+Date.now(), m=_getMapName();
      await saveChain(m,chainId,tokId,id,maxDist);
      S.chains[chainId]={tokenA:tokId,tokenB:id,maxDistance:maxDist};
      document.getElementById("chain-modal").classList.add("hidden");
      _toast(`Chained ${S.tokens[tokId]?.name} ↔ ${tok.name}`);
    };
    list.appendChild(btn);
  }
  if(!Object.keys(S.tokens).filter(id=>id!==tokId).length) list.innerHTML=`<p style="font-size:12px;color:var(--text-dim)">No other tokens on map</p>`;
  document.getElementById("chain-modal").classList.remove("hidden");
  document.getElementById("chain-cancel").onclick=()=>{document.getElementById("chain-modal").classList.add("hidden");I.ctxTokenId=null;};
}

async function removeChainsForToken(tokId) {
  const m=_getMapName();
  const matches=chainsForToken(S.chains,tokId);
  for(const[chainId]of matches) await deleteChain(m,chainId,S.chains);
  _toast(matches.length?"Chain removed":"No chain on this token");
}

// ── Prop context menu ─────────────────────────────────────────────────────────
function _wirePropContextMenu() {
  document.getElementById("prop-ctx-attach")?.addEventListener("click", ()=>{
    document.getElementById("prop-ctx-menu").style.display="none"; if(!I.ctxPropKey)return;
    const list=document.getElementById("attach-token-list"); list.innerHTML="";
    for(const[id,tok]of Object.entries(S.tokens)){
      const btn=document.createElement("button");
      btn.style.cssText="width:100%;height:36px;text-align:left;padding:0 12px;font-family:'Cinzel',serif;font-size:11px;border:1px solid var(--border);border-radius:4px;background:transparent;color:var(--text);cursor:pointer";
      btn.textContent=`${tok.type==="pc"?"👤":"👹"} ${tok.name}`;
      btn.onmouseenter=()=>btn.style.borderColor="var(--gold-dim)";
      btn.onmouseleave=()=>btn.style.borderColor="var(--border)";
      btn.onclick=async()=>{
        const p=S.props[I.ctxPropKey]; if(!p)return;
        const[px,py]=I.ctxPropKey.split(",").map(Number);
        p.attachedTo=id; p.offsetX=px-tok.x; p.offsetY=py-tok.y;
        await savePropsLocal(_getMapName(),S.props);
        document.getElementById("attach-modal").classList.add("hidden");
        _toast(`Prop attached to ${tok.name}`);
      };
      list.appendChild(btn);
    }
    document.getElementById("attach-modal").classList.remove("hidden");
  });
  document.getElementById("prop-ctx-detach")?.addEventListener("click", async()=>{
    document.getElementById("prop-ctx-menu").style.display="none";
    if(!I.ctxPropKey||!S.props[I.ctxPropKey])return;
    const p=S.props[I.ctxPropKey];
    if(p.attachedTo&&S.tokens[p.attachedTo]){
      const nk=`${S.tokens[p.attachedTo].x+(p.offsetX||0)},${S.tokens[p.attachedTo].y+(p.offsetY||0)}`;
      S.props[nk]={propId:p.propId,w:p.w,h:p.h}; delete S.props[I.ctxPropKey];
    }
    await savePropsLocal(_getMapName(),S.props); _toast("Prop detached");
  });
  document.getElementById("prop-ctx-delete")?.addEventListener("click", async()=>{
    document.getElementById("prop-ctx-menu").style.display="none";
    if(!I.ctxPropKey)return;
    delete S.props[I.ctxPropKey];
    await savePropsLocal(_getMapName(),S.props); _toast("Prop deleted");
  });
  document.getElementById("attach-cancel")?.addEventListener("click", ()=>document.getElementById("attach-modal").classList.add("hidden"));
}

// ── Clear section ─────────────────────────────────────────────────────────────
function _wireClearSection() {
  const MSGS={bg:"Clear background image?",tokens:"Clear all tokens?",props:"Clear all props?",
    fog:"Clear all fog?",stamps:"Clear all stamps?",tiles:"Clear all tiles?",
    walls:"Clear all walls?",doors:"Clear all doors?",all:"Clear EVERYTHING?"};
  async function clearSection(section) {
    if(!confirm(MSGS[section]||"Clear?"))return;
    if(section==="tiles"||section==="all")pushUndo();
    const m=_getMapName();
    if(section==="bg"||section==="all"){E.bgImage=null;E.bgUrl="";E.bgPpi=70;await set(ref(db,`maps/${m}/background`),null);await set(ref(db,`maps/${m}/backgroundPpi`),null);}
    if(section==="tokens"||section==="all"){for(const k in S.tokens)delete S.tokens[k];await set(ref(db,`maps/${m}/tokens`),null);for(const k in S.chains)delete S.chains[k];await set(ref(db,`maps/${m}/chains`),null);}
    if(section==="props"||section==="all"){for(const k in S.props)delete S.props[k];await set(ref(db,`maps/${m}/props`),null);}
    if(section==="fog"||section==="all"){for(const k in S.fogGroups)delete S.fogGroups[k];await set(ref(db,`maps/${m}/fog`),null);}
    if(section==="walls"||section==="all"){for(const k in S.wallGroups)delete S.wallGroups[k];await set(ref(db,`maps/${m}/wallGroups`),null);}
    if(section==="doors"||section==="all"){for(const k in S.doors)delete S.doors[k];await set(ref(db,`maps/${m}/doors`),null);}
    if(section==="stamps"||section==="all"){for(const k in S.stamps)delete S.stamps[k];await set(ref(db,`maps/${m}/stamps`),null);}
    if(section==="tiles"||section==="all"){for(const k in S.tiles)delete S.tiles[k];await set(ref(db,`maps/${m}/tiles`),null);}
    _toast(`${section==="all"?"Everything":section} cleared`);
  }
  ["bg","tokens","props","fog","walls","doors","stamps","tiles","all"].forEach(s=>{
    document.getElementById(`clear-${s}`)?.addEventListener("click",()=>clearSection(s));
  });
}

// ── JSON import ───────────────────────────────────────────────────────────────
function _wireJsonImport() {
  document.getElementById("loadJsonBtn")?.addEventListener("click",()=>document.getElementById("jsonFileInput")?.click());
  document.getElementById("jsonFileInput")?.addEventListener("change", async e=>{
    const file=e.target.files[0]; if(!file)return; e.target.value="";
    let data; try{data=JSON.parse(await file.text());}catch{_toast("Invalid JSON");return;}
    const suggested=data.mapName||file.name.replace(".json","").toLowerCase().replace(/\s+/g,"-");
    const mapName=prompt("Import as map name:",suggested); if(!mapName)return;
    E.mapInput.value=mapName;
    try{
      const base=ref(db,`maps/${mapName}`);
      await set(child(base,"tiles"),data.tiles||null);
      await set(child(base,"fog"),data.fog||null);
      await set(child(base,"tokens"),data.tokens||null);
      await set(child(base,"props"),data.props||null);
      if(data.stamps){const n={};for(const[k,v]of Object.entries(data.stamps))n[k.replace(",","_")]=v;await set(child(base,"stamps"),n);}else await set(child(base,"stamps"),null);
      await set(child(base,"updatedAt"),Date.now());
      _toast(`Imported ${Object.keys(data.tiles||{}).length} tiles`);
      _subscribeLive();
    }catch(err){_toast("Import failed: "+err.message);}
  });
}

// ── Drag & drop ───────────────────────────────────────────────────────────────
function _wireDragDrop() {
  const canvasWrap=document.getElementById("canvas-wrap");
  const dropOverlay=document.getElementById("drop-overlay");
  const dropModal=document.getElementById("drop-modal");
  if(!canvasWrap||!dropOverlay||!dropModal)return;
  let dropBase64=null,dropFilename="",dropTileX=0,dropTileY=0,dropType="map";

  function openDropModal(){
    dropType="map";
    document.querySelectorAll(".drop-type-btn").forEach(b=>b.classList.remove("active"));
    document.querySelector(".drop-type-btn[data-type='map']")?.classList.add("active");
    document.getElementById("drop-map-fields").style.display="block";
    document.getElementById("drop-token-fields").style.display="none";
    document.getElementById("drop-prop-fields").style.display="none";
    document.getElementById("drop-preview").style.backgroundImage=`url(${dropBase64})`;
    document.getElementById("drop-filename").textContent=dropFilename;
    document.getElementById("drop-map-name").textContent=E.mapInput.value||"dungeon-1";
    const base=dropFilename.replace(/\.[^.]+$/,"").replace(/_/g," ");
    document.getElementById("drop-tok-name").value=base;
    document.getElementById("drop-prop-name").value=base.toLowerCase().replace(/\s+/g,"_");
    document.getElementById("drop-prop-label").value=base;
    dropModal.classList.remove("hidden");
  }

  document.querySelectorAll(".drop-type-btn").forEach(btn=>btn.onclick=()=>{
    dropType=btn.dataset.type;
    document.querySelectorAll(".drop-type-btn").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("drop-map-fields").style.display=dropType==="map"?"block":"none";
    document.getElementById("drop-token-fields").style.display=dropType==="token"?"block":"none";
    document.getElementById("drop-prop-fields").style.display=dropType==="prop"?"block":"none";
  });

  document.getElementById("drop-cancel").onclick=()=>{dropModal.classList.add("hidden");dropBase64=null;};
  document.getElementById("drop-confirm").onclick=async()=>{
    if(!dropBase64)return; const m=_getMapName();
    if(dropType==="map"){
      await set(ref(db,`maps/${m}/background`),dropBase64);
      E.bgUrl=dropBase64; E.bgImage=null; const img=new Image(); img.onload=()=>E.bgImage=img; img.src=dropBase64;
      _toast("Map background set");
    } else if(dropType==="token"){
      const name=document.getElementById("drop-tok-name").value.trim()||"Token";
      const type=document.getElementById("drop-tok-type").value;
      const hp=parseInt(document.getElementById("drop-tok-hp").value)||10;
      const maxHp=parseInt(document.getElementById("drop-tok-maxhp").value)||hp;
      const safeId="drop_"+Date.now();
      await set(ref(db,`assets/uploads/tokens/${safeId}`),dropBase64);
      const tokId="tok_"+Date.now();
      const tokData={id:tokId,name,type,hp,maxHp,characterId:safeId,x:dropTileX,y:dropTileY,conditions:[]};
      S.tokens[tokId]=tokData;
      const img=new Image(); img.onload=()=>{tokenTextures[safeId]=img;}; img.src=dropBase64; tokenTextures[safeId]=null;
      await saveTokenLocal(tokId,tokData); _toast(`Token "${name}" placed`);
    } else if(dropType==="prop"){
      const id=document.getElementById("drop-prop-name").value.trim().toLowerCase().replace(/\s+/g,"_")||"prop_"+Date.now();
      const label=document.getElementById("drop-prop-label").value.trim()||id;
      const w=parseInt(document.getElementById("drop-prop-w").value)||1;
      const h=parseInt(document.getElementById("drop-prop-h").value)||1;
      await set(ref(db,`assets/uploads/props/${id}`),dropBase64);
      const newProp={id,label,emoji:"📦",w,h,uploadedBase64:true};
      if(!E.customProps.find(p=>p.id===id))E.customProps.push(newProp);
      const img=new Image(); img.onload=()=>{propTextures[id]=img;}; img.src=dropBase64;
      await savePropDef(newProp);
      const k=`${dropTileX},${dropTileY}`; S.props[k]={propId:id,w,h};
      await savePropsLocal(m,S.props); buildPropDropdown(); _toast(`Prop "${label}" placed`);
    }
    dropModal.classList.add("hidden"); dropBase64=null;
  };

  canvasWrap.addEventListener("dragenter",e=>{e.preventDefault();dropOverlay.style.display="block";});
  canvasWrap.addEventListener("dragover",e=>e.preventDefault());
  canvasWrap.addEventListener("dragleave",e=>{if(!canvasWrap.contains(e.relatedTarget))dropOverlay.style.display="none";});
  canvasWrap.addEventListener("drop",e=>{
    e.preventDefault(); dropOverlay.style.display="none";
    const canvas=document.getElementById("canvas"); if(!canvas)return;
    const r=canvas.getBoundingClientRect();
    const[wx,wy]=toWorld(e.clientX-r.left,e.clientY-r.top);
    dropTileX=Math.floor(wx/TILE); dropTileY=Math.floor(wy/TILE);
    const files=e.dataTransfer.files;
    if(files&&files.length>0){
      const file=files[0]; if(!file.type.startsWith("image/")){_toast("Images only");return;}
      dropFilename=file.name;
      const reader=new FileReader(); reader.onload=ev=>{dropBase64=ev.target.result;openDropModal();}; reader.readAsDataURL(file);
      return;
    }
    const url=e.dataTransfer.getData("text/uri-list")||e.dataTransfer.getData("text/plain");
    if(url&&url.startsWith("http")){
      dropFilename=url.split("/").pop()||"image";
      fetch(url).then(r=>r.blob()).then(blob=>{const reader=new FileReader();reader.onload=ev=>{dropBase64=ev.target.result;openDropModal();};reader.readAsDataURL(blob);}).catch(()=>_toast("Could not load URL"));
    }
  });
}

// ── Prop modal ────────────────────────────────────────────────────────────────
function _wirePropModal() {
  document.getElementById("prop-cancel")?.addEventListener("click",()=>document.getElementById("prop-modal").classList.add("hidden"));
  document.getElementById("new-prop-btn")?.addEventListener("click",()=>document.getElementById("prop-modal").classList.remove("hidden"));
  document.getElementById("prop-confirm")?.addEventListener("click",()=>{
    const id=document.getElementById("prop-id-input").value.trim().toLowerCase().replace(/\s+/g,"_");
    const label=document.getElementById("prop-label-input").value.trim()||id;
    const w=parseInt(document.getElementById("prop-w-input").value)||1;
    const h=parseInt(document.getElementById("prop-h-input").value)||1;
    const emoji=document.getElementById("prop-emoji-input").value||"📦";
    if(!id){_toast("Enter a prop ID");return;}
    if(E.customProps.find(p=>p.id===id)){_toast("Prop ID already exists");return;}
    const newProp={id,label,emoji,w,h};
    E.customProps.push(newProp); tryLoadPropTexture(id); savePropDef(newProp); buildPropDropdown(); selectProp(newProp);
    document.getElementById("prop-modal").classList.add("hidden");
  });
}

// ── Session tabs ──────────────────────────────────────────────────────────────
function _wireSessionTabs() {
  document.querySelectorAll(".session-tab").forEach(tab=>{
    tab.onclick=()=>{
      document.querySelectorAll(".session-tab").forEach(t=>t.classList.remove("active"));
      document.querySelectorAll(".session-panel").forEach(p=>p.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById(`panel-${tab.dataset.tab}`)?.classList.add("active");
    };
  });
}

// ── AFK Oracle ────────────────────────────────────────────────────────────────
function _wireAfkOracle() {
  function setAfkMode(mode){
    document.getElementById("afk-mode-combat")?.classList.toggle("on",mode==="combat");
    document.getElementById("afk-mode-explore")?.classList.toggle("on",mode==="explore");
    document.getElementById("afk-combat-btns").style.display=mode==="combat"?"flex":"none";
    document.getElementById("afk-explore-btns").style.display=mode==="explore"?"block":"none";
  }
  document.getElementById("afk-mode-combat")?.addEventListener("click",()=>setAfkMode("combat"));
  document.getElementById("afk-mode-explore")?.addEventListener("click",()=>setAfkMode("explore"));
  setAfkMode("combat");
  async function roll(kind){
    const name=document.getElementById("afk-name-input")?.value.trim()||"PC";
    const cls=document.getElementById("afk-class-select")?.value||"";
    const target=document.getElementById("afk-target-input")?.value.trim()||"";
    const result=await rollAfkDecision(kind,name,cls,target);
    if(result)document.getElementById("afk-result-text").textContent=result.choice;
  }
  document.getElementById("afk-roll-style")?.addEventListener("click",()=>roll("style"));
  document.getElementById("afk-roll-main")?.addEventListener("click",()=>roll("mainAction"));
  document.getElementById("afk-roll-bonus")?.addEventListener("click",()=>roll("bonusAction"));
  document.getElementById("afk-roll-explore")?.addEventListener("click",()=>roll("explore"));
}

// ── GM Notes ──────────────────────────────────────────────────────────────────
function _wireGmNotes() {
  const area=document.getElementById("gm-notes-area");
  const status=document.getElementById("gm-notes-status");
  if(!area)return;
  let saveTimer=null;
  area.addEventListener("input",()=>{
    if(status)status.textContent="unsaved";
    clearTimeout(saveTimer);
    saveTimer=setTimeout(()=>{
      localStorage.setItem("gm_notes",area.value);
      if(status)status.textContent="saved";
    },800);
  });
  area.value=localStorage.getItem("gm_notes")||"";
}

// ── Dropdown helpers ──────────────────────────────────────────────────────────
function _wireDropdowns() {
  // Close all on outside click
  document.addEventListener("click",()=>{
    document.getElementById("ctx-menu")?.classList.remove("open");
  });
}

export function propAtTile(tx,ty) {
  for(const[k,p]of Object.entries(S.props)){
    let px,py;
    if(p.attachedTo&&S.tokens[p.attachedTo]){px=S.tokens[p.attachedTo].x+(p.offsetX||0);py=S.tokens[p.attachedTo].y+(p.offsetY||0);}
    else{[px,py]=k.split(",").map(Number);}
    const def=E.customProps.find(d=>d.id===p.propId)||{w:1,h:1};
    const w=p.w||def.w||1,h=p.h||def.h||1;
    if(tx>=px&&tx<px+w&&ty>=py&&ty<py+h)return k;
  }
  return null;
}
