// GM attack flow: token right-click > Attack > weapon / cantrip / spell > ghost on the map > click a cell or token > roll.
// Reads the attacker's weapons and spells from their sheet (characters/npcs|pcs/<id>), rolls through the shared dice tray.
import { readAt } from "../store.js";
import { S, cellOf } from "./state.js";
import { rollDice } from "./dice.js";
import { el } from "./draw.js";
import { effectBonuses } from "./effects.js";

const SPELLS_URL = "https://geezjonny.github.io/GeezSheets/data/spells.json";
const map = () => document.querySelector("#map");
let spellData = null, ghost = null, card = null, active = null;   // active = { id, opt, cleanup }
const sheetCache = {};

const bonusOf = (v) => parseInt(String(v ?? "").replace(/[^0-9-]/g, ""), 10) || 0;
const feetToCells = (s, melee = 1) => { const n = parseInt(String(s ?? "").match(/\d+/)?.[0], 10); return /touch|melee/i.test(s) || !n ? (/self/i.test(s) ? 0 : melee) : Math.max(1, Math.round(n / 5)); };
const sign = (n) => (n >= 0 ? "+" : "") + n;

// "2d6+3", "1d8 + 1d6 + 2 slashing" -> { dice: [6,6], mod: 3 }
export function parseDice(text) {
  const dice = []; let mod = 0;
  for (const m of String(text || "").matchAll(/([+-]?)\s*(\d*)d(\d+)|([+-])\s*(\d+)(?!\s*d)/g)) {
    if (m[3]) for (let i = 0; i < (+m[2] || 1); i++) dice.push(+m[3]);
    else mod += (m[4] === "-" ? -1 : 1) * +m[5];
  }
  return { dice, mod };
}
const diceText = (text) => { const { dice, mod } = parseDice(text); const by = {}; dice.forEach((s) => (by[s] = (by[s] || 0) + 1)); return Object.entries(by).map(([s, n]) => `${n}d${s}`).join("+") + (mod ? sign(mod) : "") || String(text || "—"); };

async function loadSpells() {
  if (spellData) return spellData;
  spellData = {};
  try { for (const s of await (await fetch(SPELLS_URL)).json()) spellData[s.name.toLowerCase()] = s; } catch (err) { console.warn("Spell data unavailable", err); }
  return spellData;
}
export async function sheetOf(t, pcId) {
  const path = t?.npc ? `characters/npcs/${t.npc}` : pcId ? `characters/pcs/${pcId}` : null; if (!path) return null;
  if (!(path in sheetCache) || Date.now() - sheetCache[path].t > 20000) { let v = null; try { v = await readAt(path); } catch { /* offline */ } sheetCache[path] = { v, t: Date.now() }; }
  return sheetCache[path].v;
}

// Everything the attacker can do, as menu rows: { label, name, bonus, dmg, dmgType, range (cells), area, save, noRoll }
export async function attackOptions(token, pcId) {
  const ch = await sheetOf(token, pcId), out = [];
  for (const a of ch?.attacks || []) {
    const melee = /melee|reach/i.test(`${a.range} ${a.properties}`) || !a.range || /^\s*5\s*(ft|feet)?\s*$/i.test(a.range);
    out.push({ group: "Weapons", label: a.name || "Attack", name: a.name || "Attack", bonus: bonusOf(a.to_hit ?? a.attack_bonus), dmg: a.damage || a.damage_dice || "", dmgType: a.damage_type || "", range: melee ? 1 : feetToCells(a.range), roll: true });
  }
  const sp = ch?.spellcasting;
  if (sp?.spells?.length) {
    const data = await loadSpells(), lvl = Number(ch.level) || 1;
    for (const s of sp.spells) {
      const d = data[String(s.name).toLowerCase()], level = s.level ?? d?.level ?? 0, cantrip = level === 0 || s.prepared_type === "cantrip";
      const table = d?.damage?.damage_at_slot_level || d?.damage?.damage_at_character_level;
      let dmg = ""; if (table) { const keys = Object.keys(table).map(Number).sort((x, y) => x - y); dmg = table[String(cantrip ? [...keys].reverse().find((k) => k <= lvl) ?? keys[0] : (keys.includes(level) ? level : keys[0]))] || ""; }
      const aoe = d?.area_of_effect, save = d?.dc?.dc_type?.name;
      out.push({ group: cantrip ? "Cantrips" : `Level ${level} spells`, level: cantrip ? 0 : level, label: s.name, name: s.name, dmg, dmgType: d?.damage?.damage_type?.name || "", range: feetToCells(d?.range, 0) || 0, selfRange: /self/i.test(d?.range || ""),
        bonus: bonusOf(sp.spell_attack_bonus), roll: !!d?.attack_type, save: save ? { abil: save, dc: bonusOf(sp.spell_save_dc), success: d.dc.dc_success } : null,
        area: aoe ? { type: aoe.type, size: Math.max(1, Math.round(aoe.size / 5)) } : null, spell: true });
    }
  }
  if (!out.length) out.push({ group: "Weapons", label: "Attack (no sheet found)", name: "Attack", bonus: 0, dmg: "1d6", dmgType: "", range: 1, roll: true });
  return out;
}

// ---- targeting -------------------------------------------------------------
function point(e) { const m = map(), p = m.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(m.getScreenCTM().inverse()); }
const dist = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) / 40;   // cells, diagonals count as 1

// The shape an attack covers when aimed at cell c from the attacker's cell a: used for both the ghost and picking targets.
function shapeOf(opt, a, c) {
  const ar = opt.area, dx = c.x - a.x, dy = c.y - a.y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len, px = -uy, py = ux;
  if (!ar) return { kind: "cell", c };
  const size = ar.size * 40;
  if (ar.type === "sphere" || ar.type === "cylinder") return { kind: "circle", c, r: size };
  if (ar.type === "cube") return { kind: "rect", c, half: size / 2 };
  if (ar.type === "cone") return { kind: "poly", pts: [[a.x, a.y], [a.x + ux * size + px * size / 2, a.y + uy * size + py * size / 2], [a.x + ux * size - px * size / 2, a.y + uy * size - py * size / 2]] };
  const w = 20;   // line: 5 ft wide
  return { kind: "poly", pts: [[a.x + px * w, a.y + py * w], [a.x + ux * size + px * w, a.y + uy * size + py * w], [a.x + ux * size - px * w, a.y + uy * size - py * w], [a.x - px * w, a.y - py * w]] };
}
function inside(shape, t) {
  if (shape.kind === "cell") return t.x === shape.c.x && t.y === shape.c.y;
  if (shape.kind === "circle") return Math.hypot(t.x - shape.c.x, t.y - shape.c.y) <= shape.r + 1;
  if (shape.kind === "rect") return Math.abs(t.x - shape.c.x) <= shape.half && Math.abs(t.y - shape.c.y) <= shape.half;
  let hit = false;   // point in polygon
  for (let i = 0, j = shape.pts.length - 1; i < shape.pts.length; j = i++) {
    const [xi, yi] = shape.pts[i], [xj, yj] = shape.pts[j];
    if ((yi > t.y) !== (yj > t.y) && t.x < ((xj - xi) * (t.y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
function drawGhost(opt, a, c) {
  ghost.replaceChildren();
  const range = opt.selfRange ? 0 : opt.range, ok = opt.selfRange || dist(a, c) <= range + 0.01, cls = ok ? "atk-ok" : "atk-bad";
  if (range) el("circle", { cx: a.x, cy: a.y, r: range * 40 + 20, class: "atk-range" }, ghost);
  el("line", { x1: a.x, y1: a.y, x2: c.x, y2: c.y, class: `atk-line ${cls}` }, ghost);
  const s = shapeOf(opt, a, c);
  if (s.kind === "cell") el("rect", { x: c.x - 20, y: c.y - 20, width: 40, height: 40, class: `atk-shape ${cls}` }, ghost);
  else if (s.kind === "circle") el("circle", { cx: s.c.x, cy: s.c.y, r: s.r, class: `atk-shape ${cls}` }, ghost);
  else if (s.kind === "rect") el("rect", { x: s.c.x - s.half, y: s.c.y - s.half, width: s.half * 2, height: s.half * 2, class: `atk-shape ${cls}` }, ghost);
  else el("polygon", { points: s.pts.map((q) => q.join(",")).join(" "), class: `atk-shape ${cls}` }, ghost);
  for (const [id, t] of Object.entries(S.tokens)) if (id !== active.id && inside(s, t)) el("circle", { cx: t.x, cy: t.y, r: 21, class: "atk-target" }, ghost);
  return ok;
}

export function cancelAttack() { active?.cleanup(); active = null; ghost?.remove(); ghost = null; map()?.classList.remove("aiming"); document.getElementById("atk-hint")?.remove(); }

export function beginAttack(tokenId, opt, hooks) {
  cancelAttack(); closeCard();
  const att = S.tokens[tokenId], m = map(); if (!att) return;
  const a = { x: att.x, y: att.y };
  ghost = el("g", { id: "atk-ghost", "pointer-events": "none" }, m); m.classList.add("aiming");
  const hint = document.createElement("div"); hint.id = "atk-hint";
  hint.textContent = `${att.label || tokenId} · ${opt.name}${opt.dmg ? ` (${diceText(opt.dmg)} ${opt.dmgType})` : ""}: click a cell or token to aim · Esc or right-click cancels`; document.body.append(hint);
  const move = (e) => { if (!active) return; drawGhost(opt, a, cellOf(point(e))); };
  const down = async (e) => {
    if (e.button === 2) return;   // right-click cancels (handled below)
    e.preventDefault(); e.stopImmediatePropagation();
    const c = cellOf(point(e));   // out of range is allowed (the ghost shows red); the DM decides
    const shape = shapeOf(opt, a, c), targets = Object.entries(S.tokens).filter(([id, t]) => (opt.area ? id !== tokenId || opt.area.type === "sphere" : id !== tokenId) && !(t.hidden && !S.isGM) && inside(shape, t)).map(([id]) => id);
    cancelAttack(); resolve(tokenId, opt, targets, c, hooks);
  };
  const key = (e) => { if (e.key === "Escape") cancelAttack(); };
  const ctx = (e) => { e.preventDefault(); e.stopImmediatePropagation(); cancelAttack(); };
  m.addEventListener("pointermove", move); m.addEventListener("pointerdown", down, true); m.addEventListener("contextmenu", ctx, true); document.addEventListener("keydown", key);
  active = { id: tokenId, opt, cleanup() { m.removeEventListener("pointermove", move); m.removeEventListener("pointerdown", down, true); m.removeEventListener("contextmenu", ctx, true); document.removeEventListener("keydown", key); } };
  drawGhost(opt, a, a);
}

// ---- rolling ---------------------------------------------------------------
function closeCard() { card?.remove(); card = null; }
const nameOf = (id) => S.tokens[id]?.label || id;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function resolve(tokenId, opt, targets, cell, hooks) {
  closeCard();
  const att = nameOf(tokenId), who = targets.length ? targets.map(nameOf).join(", ") : "(no one there)";
  card = document.createElement("div"); card.id = "atk-card";
  const head = document.createElement("b"); head.textContent = `${att} · ${opt.name} → ${who}`;
  const body = document.createElement("div"), btns = document.createElement("div"); btns.className = "atk-btns"; card.append(head, body, btns); document.body.append(card);
  const add = (text, fn, cls) => { const b = document.createElement("button"); b.textContent = text; if (cls) b.className = cls; b.addEventListener("click", () => fn(b)); btns.append(b); return b; };
  const line = (text, cls) => { const d = document.createElement("div"); d.textContent = text; if (cls) d.className = cls; body.append(d); return d; };
  add("Done", closeCard, "atk-done");
  let crit = false;

  const damage = async (btn) => {
    btn?.remove(); const { dice, mod } = parseDice(opt.dmg); if (!dice.length) return line("No damage dice on this one.");
    const list = crit ? [...dice, ...dice] : dice, r = await rollDice(list, mod, () => ({ by: att }));
    await wait(2600);
    line(`Damage: ${r.total} ${opt.dmgType}${crit ? " (critical)" : ""}  [${r.dice.map((d) => d.result).join(", ")}${mod ? sign(mod) : ""}]`, "atk-big");
    for (const id of targets) {
      const row = document.createElement("div"); row.className = "atk-row"; row.append(`${nameOf(id)}: `);
      const apply = (amt, label) => { const b = document.createElement("button"); b.textContent = `${label} ${amt}`; b.addEventListener("click", () => { hooks.applyDamage(id, amt, opt.dmgType); row.querySelectorAll("button").forEach((x) => (x.disabled = true)); }); row.append(b); };
      apply(r.total, opt.save ? "Failed save −" : "Hit −"); if (opt.save) apply(Math.floor(r.total / 2), "Saved −");
      body.append(row);
    }
  };

  if (opt.roll) {   // attack roll
    const attackBonus = opt.bonus + effectBonuses(S.tokens[tokenId]?.effects).attack;
    const r = await rollDice([20], attackBonus, () => ({ by: att })), nat = r.dice[0].result; await wait(2600);
    crit = nat === 20;
    line(`Attack: ${r.total} (d20 ${nat}${sign(attackBonus)})${nat === 20 ? " — natural 20!" : nat === 1 ? " — natural 1" : ""}`, "atk-big");
    for (const id of targets) {
      const sh = await hooks.sheetFor(id), baseAc = sh?.combat?.ac, ac = baseAc == null ? null : Number(baseAc) + effectBonuses(S.tokens[id]?.effects).ac;
      if (ac != null) line(`${nameOf(id)} AC ${ac}: ${nat === 20 || (nat !== 1 && r.total >= ac) ? "HIT" : "MISS"}`, nat === 20 || (nat !== 1 && r.total >= ac) ? "atk-hit" : "atk-miss");
    }
    if (opt.dmg) add(`Roll damage ${diceText(opt.dmg)}${crit ? " (crit)" : ""}`, damage);
  } else if (opt.save) {
    line(`${opt.save.abil} save, DC ${opt.save.dc || "?"}${opt.save.success === "half" ? " (half on success)" : ""} — ${targets.length} in the area`, "atk-big");
    if (opt.dmg) add(`Roll damage ${diceText(opt.dmg)}`, damage);
  } else {
    line(`${opt.name} cast${opt.dmg ? "" : " — no damage to roll"}.`);
    if (opt.dmg) add(`Roll damage ${diceText(opt.dmg)}`, damage);
  }
}

const css = `
#map.aiming { cursor: crosshair; }
#tokmenu { z-index: 20; }
#atk-ghost .atk-range { fill: none; stroke: #f3e7c8; stroke-width: 1.5; stroke-dasharray: 4 4; opacity: .7; }
#atk-ghost .atk-line { stroke-width: 2; stroke-dasharray: 6 4; }
#atk-ghost .atk-shape { fill-opacity: .28; stroke-width: 2; }
#atk-ghost .atk-ok { stroke: #e0b04a; fill: #e0b04a; }
#atk-ghost .atk-bad { stroke: #c0392b; fill: #c0392b; }
#atk-ghost line.atk-line { fill: none; }
#atk-ghost .atk-target { fill: none; stroke: #ff5a3c; stroke-width: 3; }
.token .turn-ring { fill: none; stroke: #ffd35c; stroke-width: 3; pointer-events: none; animation: turn-pulse 1.4s ease-in-out infinite; }
@keyframes turn-pulse { 0%,100% { opacity: 1; stroke-width: 3; } 50% { opacity: .45; stroke-width: 5; } }
#atk-hint { position: fixed; z-index: 6; left: 50%; bottom: 18px; transform: translateX(-50%); padding: 6px 12px; background: var(--leather-dk, #2b1d12); color: var(--paper, #f3e7c8); border: 2px solid var(--brass, #b98f45); border-radius: 4px; font: 14px Georgia, serif; pointer-events: none; }
#atk-card { position: fixed; z-index: 7; left: 50%; bottom: 18px; transform: translateX(-50%); min-width: 280px; max-width: min(520px, 92vw); padding: 10px 12px; background: var(--paper, #f3e7c8); color: var(--ink, #1c1209); border: 2px solid var(--brass, #b98f45); border-radius: 4px; font: 15px Georgia, serif; box-shadow: 0 4px 16px #0008; }
#atk-card .atk-big { font-weight: bold; margin: 5px 0 2px; }
#atk-card .atk-hit { color: #2f7a46; font-weight: bold; } #atk-card .atk-miss { color: #a22; font-weight: bold; }
#atk-card .atk-btns, #atk-card .atk-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 6px; }
#atk-card button { font: inherit; padding: 2px 9px; border: 1px solid var(--brass, #b98f45); border-radius: 3px; background: var(--leather-dk, #2b1d12); color: var(--paper, #f3e7c8); cursor: pointer; }
#atk-card button:disabled { opacity: .45; cursor: default; }
#atk-card .atk-done { margin-left: auto; }
`;
export function initAttack() {
  const s = document.createElement("style"); s.id = "attack-css"; s.textContent = css; document.head.append(s);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeCard(); });
}
