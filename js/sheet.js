// Sheet — character sheet card builder
// Used by both index.html (read-only player view) and mapeditor.html (GM editable)
// Depends on: firebase.js, light.js, config.js

import { db } from "./firebase.js";
import { ref, get, set, update, onValue } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-database.js";
import { sendChat } from "./chat.js";
import {
  LIGHT_SOURCES, HEAL_ITEMS, CONDITION_REMOVERS,
  itemKey, getLightDef, useItem, removeItem, addItem, giveLight, extinguishLight,
} from "./light.js";

// ── Ability score helpers ─────────────────────────────────────────────────────
export const ABILITY_KEYS   = ["str","dex","con","int","wis","cha"];
export const ABILITY_LABELS = { str:"STR", dex:"DEX", con:"CON", int:"INT", wis:"WIS", cha:"CHA" };

export const SKILLS = [
  {key:"acrobatics",     label:"Acrobatics",     stat:"dex"},
  {key:"animal_handling",label:"Animal Handling", stat:"wis"},
  {key:"arcana",         label:"Arcana",          stat:"int"},
  {key:"athletics",      label:"Athletics",       stat:"str"},
  {key:"deception",      label:"Deception",       stat:"cha"},
  {key:"history",        label:"History",         stat:"int"},
  {key:"insight",        label:"Insight",         stat:"wis"},
  {key:"intimidation",   label:"Intimidation",    stat:"cha"},
  {key:"investigation",  label:"Investigation",   stat:"int"},
  {key:"medicine",       label:"Medicine",        stat:"wis"},
  {key:"nature",         label:"Nature",          stat:"int"},
  {key:"perception",     label:"Perception",      stat:"wis"},
  {key:"performance",    label:"Performance",     stat:"cha"},
  {key:"persuasion",     label:"Persuasion",      stat:"cha"},
  {key:"religion",       label:"Religion",        stat:"int"},
  {key:"sleight_of_hand",label:"Sleight of Hand", stat:"dex"},
  {key:"stealth",        label:"Stealth",         stat:"dex"},
  {key:"survival",       label:"Survival",        stat:"wis"},
];

// ── Formatting helpers ────────────────────────────────────────────────────────
export function sMod(s) { const m = Math.floor((s-10)/2); return (m>=0?"+":"")+m; }
export function sFmt(n) { return (n>=0?"+":"")+n; }
export function sEsc(str) {
  return String(str)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
export function sSpellLevel(lvl) {
  if (lvl===0) return "Cantrip";
  return lvl + (["th","st","nd","rd","th","th","th","th","th","th"][lvl]||"th") + " Level";
}
export function sHpColor(cur,max) {
  if (!max) return "#c8a84b";
  const p = cur/max;
  return p > .5 ? "#5a9a5a" : p > .25 ? "#aaaa30" : "#e04040";
}

// ── Spell/item API data cache ─────────────────────────────────────────────────
// These are lazy-loaded when the sheet is first opened
import { getSpells, getEquipment, getMagicItems, getSkills, getClassLevels, getClasses, getFeatures } from "./data.js";

let spellsDb = {}, equipDb = {}, magicDb = {}, skillsDb = null, apiLoaded = false;

export async function loadSheetApi() {
  if (apiLoaded) return;
  apiLoaded = true;
  try {
    const [spells, skills, equip, magic] = await Promise.all([
      getSpells(),
      getSkills(),
      getEquipment(),
      getMagicItems(),
    ]);
    spells.forEach(s => { spellsDb[s.name.toLowerCase()] = s; });
    equip.forEach(e  => { equipDb[e.name.toLowerCase()]  = e; });
    magic.forEach(m  => { magicDb[m.name.toLowerCase()]  = m; });
    skillsDb = skills.map(s => ({
      key:   s.index.replace(/-/g,"_"),
      label: s.name,
      stat:  s.ability_score?.index?.slice(0,3) ?? "str",
      desc:  Array.isArray(s.desc) ? s.desc[0] : (s.desc || ""),
    }));
  } catch {
    skillsDb = SKILLS;
  }
}

function getSkillsDb() { return skillsDb || SKILLS; }
export { getSkillsDb };

/** Every skill's total modifier for this character, using the exact same
 *  formula the sheet itself renders with -- kept in one place so a caller
 *  (like the turn menu's Roll list) never has to duplicate the proficiency/
 *  expertise math and risk it drifting out of sync with the sheet. */
export function getCharacterSkillModifiers(char) {
  const st = char.stats || {};
  const sk = char.skills || {};
  const profBonus = char.combat?.proficiency_bonus ?? 2;
  return getSkillsDb().map(s => {
    const d = sk[s.key] || {};
    const base = Math.floor(((st[s.stat] ?? 10) - 10) / 2);
    const bonus = d.bonus != null ? d.bonus : (base + (d.proficient ? profBonus : 0) + (d.expertise ? profBonus : 0));
    return { key: s.key, label: s.label, stat: s.stat, bonus, proficient: !!d.proficient, expertise: !!d.expertise };
  });
}

function sheetGetItem(name) {
  if (!name) return null;
  const k = name.toLowerCase();
  return equipDb[k] ?? magicDb[k] ?? null;
}
function sheetItemDesc(item) {
  if (!item) return "";
  const d = item.desc ?? item.special ?? [];
  return Array.isArray(d) ? d[0] ?? "" : `${d}`;
}
function sheetItemCat(item) {
  if (!item) return null;
  return item.equipment_category?.name ?? item.gear_category?.name ?? item.rarity?.name ?? null;
}
export function sheetSpellDesc(name) {
  const s = spellsDb[name?.toLowerCase()];
  if (!s) return "";
  const d = s.desc ?? [];
  return Array.isArray(d) ? d[0] ?? "" : `${d}`;
}
export function sheetSpellMeta(name) {
  const s = spellsDb[name?.toLowerCase()];
  if (!s) return "";
  const parts = [];
  if (s.casting_time) parts.push(`Cast: <span>${s.casting_time}</span>`);
  if (s.range)        parts.push(`Range: <span>${s.range}</span>`);
  if (s.duration)     parts.push(`Duration: <span>${s.duration}</span>`);
  return parts.length ? `<div class="spell-meta">${parts.map(p=>`<span>${p}</span>`).join("")}</div>` : "";
}
/** Plain-text version of the same info, properly separated -- for contexts
 *  (like the turn menu) that don't use the sheet's own flex-spaced CSS. */
export function sheetSpellMetaText(name) {
  const s = spellsDb[name?.toLowerCase()];
  if (!s) return "";
  const parts = [];
  if (s.casting_time) parts.push(`Cast: ${s.casting_time}`);
  if (s.range)        parts.push(`Range: ${s.range}`);
  if (s.duration)     parts.push(`Duration: ${s.duration}`);
  return parts.join(" · ");
}
/** Just the raw range string for a spell (e.g. "60 feet"), separate from
 *  the formatted display text -- for callers that need to parse it (like
 *  the turn menu's range-highlighting) rather than just show it. */
export function getSpellRange(name) {
  return spellsDb[name?.toLowerCase()]?.range || "";
}

// ── Global window handlers (set once, safe to call from HTML) ─────────────────
let _toastFn = null;
export function setSheetToastFn(fn) { _toastFn = fn; }

function toast(msg) { _toastFn?.(msg); }

window.togglePanel = function(panelId, btnId) {
  const p = document.getElementById(panelId), b = document.getElementById(btnId);
  if (!p || !b) return;
  const open = p.classList.toggle("open");
  b.classList.toggle("open", open);
};

window.toggleSlot = function(pip, ev) {
  ev?.stopPropagation();
  const { charid, lvl, idx, max } = pip.dataset;
  const pips = [...pip.parentElement.querySelectorAll(".slot-pip")];
  const clamped = Math.max(0, Math.min(+max, pip.classList.contains("used") ? +idx : +idx+1));
  pips.forEach((p,i) => p.classList.toggle("used", i < clamped));
  set(ref(db, `characters/pcs/${charid}/spellcasting/slots_used/${lvl}`), clamped).catch(console.error);
};

window.toggleCharge = function(pip, ev) {
  ev?.stopPropagation();
  const { charid, abkey, idx, max } = pip.dataset;
  const pips = [...pip.parentElement.querySelectorAll(".charge-pip")];
  const clamped = Math.max(0, Math.min(+max, pip.classList.contains("used") ? +idx : +idx+1));
  pips.forEach((p,i) => p.classList.toggle("used", i < clamped));
  set(ref(db, `characters/pcs/${charid}/abilities/${abkey}/current`), +max-clamped).catch(console.error);
};

window.adjustHp = async function(charId, isHeal) {
  const deltaEl = document.getElementById(`hpdelta-${charId}`);
  const delta   = parseInt(deltaEl?.value, 10) || 1;
  if (!deltaEl || delta <= 0) return;
  try {
    const found = await _fetchCharPath(charId);
    if (!found) return;
    const { path, data: c } = found;
    const combat = c.combat || {}, max = combat.hp_max ?? 1;
    let cur = combat.hp_current ?? 0;
    cur = isHeal ? Math.min(max, cur+delta) : Math.max(0, cur-delta);
    const updates = { hp_current: cur };
    // Regaining any HP clears death saves and revives from unconscious
    if (isHeal && cur > 0) updates.deathSaves = null;
    await update(ref(db, `${path}/combat`), updates);
    deltaEl.value = "";
    // Taking damage while concentrating prompts a check -- DC 10 or half
    // the damage taken, whichever is higher, per the standard 5e rule
    if (!isHeal && combat.concentration) {
      const dc = Math.max(10, Math.floor(delta / 2));
      await sendChat(`⚠ ${c.name||"Someone"} took ${delta} damage while concentrating on **${combat.concentration.spell}** — CON save DC ${dc} or lose it.`, "GM", "system");
      toast(`⚠ Concentration check: DC ${dc}`);
    }
  } catch(e) { console.error("HP save failed:", e); }
};

window.rollDeathSave = async function(charId, charName) {
  try {
    const found = await _fetchCharPath(charId);
    if (!found) return;
    const { path, data: c } = found;
    if ((c.combat?.hp_current ?? 0) > 0) return; // only relevant at 0 HP
    const ds = c.combat?.deathSaves || { successes: 0, failures: 0 };
    const roll = 1 + Math.floor(Math.random() * 20);
    let text;
    if (roll === 20) {
      await update(ref(db, `${path}/combat`), { hp_current: 1, deathSaves: null });
      text = `rolled a death save: **20** — natural 20! ${charName||c.name} claws back to 1 HP.`;
    } else if (roll === 1) {
      const failures = Math.min(3, ds.failures + 2);
      await update(ref(db, `${path}/combat`), { deathSaves: { successes: ds.successes, failures } });
      text = `rolled a death save: **1** — natural 1, counts as two failures (${failures}/3 failures).`;
    } else if (roll >= 10) {
      const successes = Math.min(3, ds.successes + 1);
      await update(ref(db, `${path}/combat`), { deathSaves: { successes, failures: ds.failures } });
      text = `rolled a death save: **${roll}** — success (${successes}/3 successes).`;
    } else {
      const failures = Math.min(3, ds.failures + 1);
      await update(ref(db, `${path}/combat`), { deathSaves: { successes: ds.successes, failures } });
      text = `rolled a death save: **${roll}** — failure (${failures}/3 failures).`;
    }
    await sendChat(text, charName||c.name||"Unknown", "dice");
  } catch(e) { console.error("Death save failed:", e); }
};

window.setDeathSave = async function(charId, type, count) {
  try {
    const found = await _fetchCharPath(charId);
    if (!found) return;
    const { path, data: c } = found;
    const ds = c.combat?.deathSaves || { successes: 0, failures: 0 };
    ds[type] = count;
    await update(ref(db, `${path}/combat`), { deathSaves: ds });
  } catch(e) { console.error("Death save update failed:", e); }
};

window.setConcentration = async function(charId) {
  const spell = prompt("Concentrating on which spell?");
  if (!spell || !spell.trim()) return;
  try {
    const found = await _fetchCharPath(charId);
    if (!found) return;
    await update(ref(db, `${found.path}/combat`), { concentration: { spell: spell.trim(), startedAt: Date.now() } });
  } catch(e) { console.error("Concentration save failed:", e); }
};

window.clearConcentration = async function(charId) {
  try {
    const found = await _fetchCharPath(charId);
    if (!found) return;
    await update(ref(db, `${found.path}/combat`), { concentration: null });
  } catch(e) { console.error("Concentration clear failed:", e); }
};

window.useItem = (charId, idx) => useItem(charId, idx, toast);


async function _fetchCharPath(charId) {
  let path = `characters/pcs/${charId}`;
  let snap = await get(ref(db, path));
  if (!snap.exists()) { path = `characters/npcs/${charId}`; snap = await get(ref(db, path)); }
  if (!snap.exists()) return null;
  return { path, data: snap.val() };
}

window.levelUpChar = async function(charId) {
  const found = await _fetchCharPath(charId);
  if (!found) return;
  const { path, data: c } = found;
  const curLevel = parseInt(c.level, 10) || 1;

  const targetStr = prompt(`Level up ${c.name || "this character"} from level ${curLevel} to:`, String(curLevel + 1));
  if (targetStr === null) return;
  const targetLevel = parseInt(targetStr, 10);
  if (!targetLevel || targetLevel <= curLevel || targetLevel > 20) {
    toast("Enter a level higher than the current one (1-20).");
    return;
  }

  const classKey = (c.class || "").toLowerCase().trim();
  const [allLevels, allClasses, allFeatures] = await Promise.all([getClassLevels(), getClasses(), getFeatures()]);
  const levels = allLevels[classKey];
  if (!levels) {
    toast(`Couldn't find "${c.class}" in the class data — check the class name matches SRD spelling (e.g. "Wizard", "Fighter").`);
    return;
  }
  const classInfo = allClasses.find(cl => cl.index === classKey);
  const hitDie = classInfo?.hit_die || 8;

  // Walk every level from curLevel+1 through targetLevel, collecting what changed along the way
  const gainedFeatures = [];
  let newProfBonus = c.proficiency_bonus ?? 2;
  let newSlots = null;
  let latestClassSpecific = null;
  for (let lv = curLevel + 1; lv <= targetLevel; lv++) {
    const entry = levels.find(l => l.level === lv);
    if (!entry) continue;
    if (entry.prof_bonus != null) newProfBonus = entry.prof_bonus;
    if (entry.spellcasting) {
      newSlots = {};
      for (let sl = 1; sl <= 9; sl++) {
        const v = entry.spellcasting[`spell_slots_level_${sl}`];
        if (v) newSlots[sl] = v;
      }
    }
    if (entry.class_specific && Object.keys(entry.class_specific).length) latestClassSpecific = entry.class_specific;
    for (const f of (entry.features || [])) {
      const detail = allFeatures.find(ft => ft.index === f.index);
      gainedFeatures.push({ name: f.name, level: lv, desc: detail?.desc?.[0] || "" });
    }
  }

  const levelsGained = targetLevel - curLevel;
  const avgHpPerLevel = Math.floor(hitDie / 2) + 1;
  const suggestedHp = avgHpPerLevel * levelsGained;
  const hpInput = prompt(
    `HP gained over ${levelsGained} level${levelsGained > 1 ? "s" : ""} (d${hitDie} hit die).\n` +
    `Roll ${levelsGained} × d${hitDie} yourself, or just use the average (${suggestedHp}):`,
    String(suggestedHp)
  );
  if (hpInput === null) return;
  const hpGained = parseInt(hpInput, 10) || 0;

  const updates = { level: targetLevel, proficiency_bonus: newProfBonus };
  if (c.combat) {
    updates["combat/hp_max"] = (c.combat.hp_max || 0) + hpGained;
    updates["combat/hp_current"] = (c.combat.hp_current || 0) + hpGained;
  }
  if (newSlots) {
    for (const [sl, v] of Object.entries(newSlots)) updates[`spellcasting/slots/${sl}`] = v;
  }
  if (gainedFeatures.length) {
    const existingText = c.text_blocks?.features_traits || "";
    const newText = gainedFeatures.map(f => `Level ${f.level} — ${f.name}${f.desc ? ": " + f.desc : ""}`).join("\n\n");
    updates["text_blocks/features_traits"] = existingText ? `${existingText}\n\n${newText}` : newText;
  }

  const flatUpdates = {};
  for (const [k, v] of Object.entries(updates)) flatUpdates[`${path}/${k}`] = v;
  await update(ref(db), flatUpdates);

  let summary = `⬆ ${c.name || "Character"} is now level ${targetLevel}!\n\nProficiency bonus: +${newProfBonus}\nHP: +${hpGained}`;
  if (gainedFeatures.length) summary += `\n\nNew features:\n${gainedFeatures.map(f=>"• "+f.name).join("\n")}`;
  if (latestClassSpecific) summary += `\n\n⚠ Class resources changed — update these manually if you're tracking them as charges:\n${Object.entries(latestClassSpecific).map(([k,v])=>`${k}: ${v}`).join("\n")}`;
  alert(summary);
};

async function _executeLongRest(charId) {
  try {
    const found = await _fetchCharPath(charId);
    if (!found) return;
    const { path, data: c } = found;
    const updates = {};
    updates[`${path}/combat/hp_current`] = c.combat?.hp_max ?? c.hp_max ?? 1;
    if (c.spellcasting?.slots) updates[`${path}/spellcasting/slots_used`] = null;
    for (const [abKey, ab] of Object.entries(c.abilities || {})) {
      if (ab?.kind === "charge" && ab.max) updates[`${path}/abilities/${abKey}/current`] = ab.max;
    }
    await update(ref(db), updates);
    toast("🌙 Long rest complete — HP, spell slots, and abilities restored.");
  } catch(e) { console.error("Long rest failed:", e); }
}

async function _executeShortRest(charId) {
  const hpInput = prompt("HP recovered from spending Hit Dice this short rest (enter an amount, or leave blank to skip HP recovery):", "");
  if (hpInput === null) return; // cancelled entirely
  try {
    const found = await _fetchCharPath(charId);
    if (!found) return;
    const { path, data: c } = found;
    const updates = {};
    const heal = parseInt(hpInput, 10) || 0;
    if (heal > 0) {
      const max = c.combat?.hp_max ?? 1, cur = c.combat?.hp_current ?? 0;
      updates[`${path}/combat/hp_current`] = Math.min(max, cur + heal);
    }
    let restoredAbility = false;
    for (const [abKey, ab] of Object.entries(c.abilities || {})) {
      if (ab?.kind === "charge" && ab.max && /short/i.test(ab.recharge || "")) {
        updates[`${path}/abilities/${abKey}/current`] = ab.max;
        restoredAbility = true;
      }
    }
    // Warlocks (Pact Magic) recover spell slots on a short rest, unlike other casters
    let restoredSlots = false;
    if (c.spellcasting?.slots && /warlock/i.test(c.class || "")) {
      updates[`${path}/spellcasting/slots_used`] = null;
      restoredSlots = true;
    }
    await update(ref(db), updates);
    toast(`☕ Short rest complete${heal>0?` — recovered ${heal} HP`:""}${restoredAbility||restoredSlots?", abilities restored":""}.`);
  } catch(e) { console.error("Short rest failed:", e); }
}

/** DM grants a rest directly to one character, bypassing the party vote --
 *  same execution logic as an approved vote, just triggered immediately. */
export async function grantRest(charId, type, charName) {
  await sendChat(`🎁 The DM has granted ${charName||"a player"} a ${type==="long"?"Long":"Short"} Rest.`, "GM", "system");
  if (type === "long") await _executeLongRest(charId);
  else await _executeShortRest(charId);
}

// ── Party rest votes ─────────────────────────────────────────────────────────
// A rest can't just be clicked and happen instantly -- every present PC has to
// vote yes, and then the DM has to confirm it's actually safe, before anyone's
// HP/slots/charges actually get restored. Session-wide, not per-character.
// Every vote is announced in chat with a running count -- the DM watches that
// count (and the chat log) and decides when it's enough, rather than the app
// trying to compute who's "present" and auto-advancing.

/** Player clicks Short/Long Rest on their own sheet -- this casts (or starts)
 *  a vote rather than resting immediately, and announces it in chat. */
window.longRest = async function(charId) { await requestOrJoinRest(charId, "long"); };
window.shortRest = async function(charId) { await requestOrJoinRest(charId, "short"); };

export async function requestOrJoinRest(charId, type) {
  const found = await _fetchCharPath(charId);
  const name = found?.data?.name || "A player";
  const typeLabel = type === "long" ? "Long Rest" : "Short Rest";

  const snap = await get(ref(db, "session/restRequest"));
  const existing = snap.val();

  if (!existing || existing.status === "denied" || existing.status === "approved") {
    // Starting a fresh vote
    await set(ref(db, "session/restRequest"), { type, votes: { [charId]: true }, status: "voting" });
    await sendChat(`🗳️ ${name} has requested a ${typeLabel}. Click ${typeLabel} on your own sheet to vote yes. (1 vote so far)`, "GM", "system");
    return;
  }

  if (existing.type !== type) {
    toast(`A vote for a ${existing.type === "long" ? "Long" : "Short"} Rest is already in progress.`);
    return;
  }
  if (existing.votes?.[charId]) {
    toast("You've already voted for this.");
    return;
  }
  const votes = { ...(existing.votes || {}), [charId]: true };
  await set(ref(db, "session/restRequest/votes"), votes);
  await sendChat(`🗳️ ${name} voted yes for the ${typeLabel}. (${Object.keys(votes).length} votes so far)`, "GM", "system");
}

export async function dmResolveRest(approve) {
  const snap = await get(ref(db, "session/restRequest"));
  const req = snap.val();
  if (!req) return;
  const typeLabel = req.type === "long" ? "Long Rest" : "Short Rest";
  await sendChat(approve ? `✅ The DM has approved the ${typeLabel}.` : `❌ The DM has denied the ${typeLabel} request.`, "GM", "system");
  await update(ref(db, "session/restRequest"), { status: approve ? "approved" : "denied" });
}

export function subscribeRestRequest(cb) {
  return onValue(ref(db, "session/restRequest"), snap => cb(snap.val()));
}

/** Called once per player, when their own client sees status flip to
 *  "approved" and their character was part of the vote. */
export async function runApprovedRest(charId, type) {
  if (type === "long") await _executeLongRest(charId);
  else await _executeShortRest(charId);
}

export async function clearRestRequest() {
  await set(ref(db, "session/restRequest"), null);
}

window.removeItem = (charId, idx) => removeItem(charId, idx);

window.addItem = async (charId) => {
  // Remove any existing picker
  document.getElementById("item-picker-overlay")?.remove();

  const overlay = document.createElement("div");
  overlay.id = "item-picker-overlay";
  overlay.style.cssText = "position:fixed;inset:0;z-index:900;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.6)";

  overlay.innerHTML = `
    <div style="background:#1a1510;border:1px solid #3d2e1a;border-radius:8px;width:480px;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 16px 48px rgba(0,0,0,.8);overflow:hidden">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid #3d2e1a;flex-shrink:0">
        <span style="font-family:'Cinzel',serif;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#c8a84b">Add Item</span>
        <button id="ipc-close" style="border:none;background:transparent;color:#6b5a38;font-size:16px;cursor:pointer">✕</button>
      </div>
      <div style="padding:10px 12px;border-bottom:1px solid #3d2e1a;flex-shrink:0">
        <input id="ipc-search" type="text" placeholder="Search equipment, weapons, magic items…" spellcheck="false"
          style="width:100%;background:rgba(255,255,255,.04);border:1px solid #3d2e1a;border-radius:4px;color:#d4c49a;font-family:'Cinzel',serif;font-size:10px;padding:7px 10px;outline:none;box-sizing:border-box">
        <div style="display:flex;gap:6px;margin-top:6px">
          <button class="ipc-tab active" data-src="all"     style="font-family:'Cinzel',serif;font-size:9px;padding:3px 8px;border-radius:3px;border:1px solid #3d2e1a;background:rgba(200,168,75,.1);color:#c8a84b;cursor:pointer">All</button>
          <button class="ipc-tab"        data-src="equip"   style="font-family:'Cinzel',serif;font-size:9px;padding:3px 8px;border-radius:3px;border:1px solid #3d2e1a;background:transparent;color:#6b5a38;cursor:pointer">Equipment</button>
          <button class="ipc-tab"        data-src="magic"   style="font-family:'Cinzel',serif;font-size:9px;padding:3px 8px;border-radius:3px;border:1px solid #3d2e1a;background:transparent;color:#6b5a38;cursor:pointer">Magic Items</button>
        </div>
      </div>
      <div style="display:flex;flex:1;overflow:hidden;min-height:0">
        <div id="ipc-list" style="width:200px;flex-shrink:0;overflow-y:auto;border-right:1px solid #3d2e1a;padding:4px"></div>
        <div id="ipc-preview" style="flex:1;overflow-y:auto;padding:12px;font-size:.72rem;line-height:1.6;color:#d4c49a">
          <div style="color:#6b5a38;font-family:'Cinzel',serif;font-size:.65rem;text-align:center;margin-top:20px">Search and select an item to preview</div>
        </div>
      </div>
      <div style="padding:10px 12px;border-top:1px solid #3d2e1a;display:flex;align-items:center;gap:8px;flex-shrink:0">
        <input id="ipc-qty" type="number" value="1" min="1" style="width:52px;background:rgba(255,255,255,.04);border:1px solid #3d2e1a;border-radius:4px;color:#d4c49a;font-family:'Cinzel',serif;font-size:10px;padding:5px 8px;outline:none;text-align:center">
        <button id="ipc-add" disabled style="flex:1;font-family:'Cinzel',serif;font-size:10px;font-weight:700;padding:8px;border-radius:4px;border:1px solid #7a6228;background:rgba(200,168,75,.08);color:#7a6228;cursor:not-allowed">Select an item to add</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  let allItems = [], filtered = [], selected = null, activeTab = "all";

  // Load both datasets
  // Load both datasets via shared data.js cache
  const [eq, mg] = await Promise.all([
    getEquipment(),
    getMagicItems(),
  ]);
  allItems = [
    ...eq.map(i=>({...i, _src:"equip"})),
    ...mg.map(i=>({...i, _src:"magic"})),
  ].sort((a,b)=>a.name.localeCompare(b.name));

  function renderList() {
    const q = document.getElementById("ipc-search").value.trim().toLowerCase();
    filtered = allItems.filter(i => {
      if(activeTab==="equip" && i._src!=="equip") return false;
      if(activeTab==="magic" && i._src!=="magic") return false;
      return !q || i.name.toLowerCase().includes(q);
    }).slice(0,80);
    const list = document.getElementById("ipc-list");
    list.innerHTML = filtered.map((item,idx)=>`
      <div class="ipc-row" data-idx="${idx}" style="padding:5px 8px;border-radius:3px;cursor:pointer;font-family:'Cinzel',serif;font-size:.65rem;color:#6b5a38;display:flex;align-items:center;gap:5px">
        <span style="color:${item._src==="magic"?"#c084fc":"#6b5a38"};font-size:8px">${item._src==="magic"?"✨":"⚔"}</span>
        <span>${item.name}</span>
      </div>`).join("");
    list.querySelectorAll(".ipc-row").forEach(row=>{
      row.onmouseenter=()=>{row.style.background="rgba(200,168,75,.06)";row.style.color="#d4c49a";};
      row.onmouseleave=()=>{if(row!==document.querySelector(".ipc-row.sel")){row.style.background="";row.style.color="#6b5a38";}};
      row.onclick=()=>selectItem(parseInt(row.dataset.idx));
    });
  }

  function selectItem(idx) {
    selected = filtered[idx];
    document.querySelectorAll(".ipc-row").forEach(r=>r.classList.remove("sel"));
    const row = document.querySelector(`.ipc-row[data-idx="${idx}"]`);
    if(row){row.classList.add("sel");row.style.background="rgba(200,168,75,.1)";row.style.color="#c8a84b";}
    const prev = document.getElementById("ipc-preview");
    const i = selected;
    const cat = i.equipment_category?.name || i.rarity?.name || "";
    const desc = Array.isArray(i.desc) ? i.desc.join(" ") : (i.desc||"No description.");
    const props = i.properties?.map(p=>p.name).join(", ")||"";
    prev.innerHTML = `
      <div style="font-family:'Cinzel',serif;font-size:.85rem;font-weight:700;color:#c8a84b;margin-bottom:4px">${i.name}</div>
      <div style="font-size:.62rem;color:#6b5a38;margin-bottom:8px">${cat}${props?` · ${props}`:""}</div>
      ${i.damage?`<div style="color:#d4c49a;margin-bottom:6px">⚔ ${i.damage.damage_dice} ${i.damage.damage_type?.name||""}</div>`:""}
      ${i.armor_class?`<div style="color:#d4c49a;margin-bottom:6px">🛡 AC ${i.armor_class.base}${i.armor_class.dex_bonus?" + DEX":""}</div>`:""}
      ${i.cost?`<div style="color:#d4c49a;margin-bottom:6px">💰 ${i.cost.quantity} ${i.cost.unit}</div>`:""}
      ${i.weight?`<div style="color:#6b5a38;margin-bottom:6px">⚖ ${i.weight} lb</div>`:""}
      <div style="color:#a89070;line-height:1.5;font-size:.68rem">${desc}</div>`;
    const btn = document.getElementById("ipc-add");
    btn.disabled = false;
    btn.style.color="#c8a84b";btn.style.borderColor="#c8a84b";btn.style.cursor="pointer";
    btn.textContent=`Add "${i.name}"`;
  }

  // Tab switching
  overlay.querySelectorAll(".ipc-tab").forEach(tab=>{
    tab.onclick=()=>{
      activeTab=tab.dataset.src;
      overlay.querySelectorAll(".ipc-tab").forEach(t=>{t.style.background="transparent";t.style.color="#6b5a38";t.classList.remove("active");});
      tab.style.background="rgba(200,168,75,.1)";tab.style.color="#c8a84b";tab.classList.add("active");
      renderList();
    };
  });

  document.getElementById("ipc-search").addEventListener("input", renderList);
  document.getElementById("ipc-close").onclick = ()=>overlay.remove();
  overlay.onclick = e=>{ if(e.target===overlay) overlay.remove(); };

  document.getElementById("ipc-add").onclick = async ()=>{
    if(!selected) return;
    const qty = parseInt(document.getElementById("ipc-qty").value)||1;
    await addItem(charId, selected.name, qty);
    overlay.remove();
  };

  renderList();
  document.getElementById("ipc-search").focus();
};

window.giveLight = async (charId) => {
  const name    = prompt("Light source name (e.g. 'Flaming Sword'):");
  if (!name?.trim()) return;
  const bright  = parseInt(prompt("Bright radius (tiles):", "4")) || 4;
  const dim     = parseInt(prompt("Dim radius (tiles):",    "8")) || 8;
  const consume = prompt("Consume item from inventory? (leave blank to skip):");
  await giveLight(charId, name.trim(), bright, dim, consume?.trim() || null);
  toast(`🕯 ${name} lit`);
};

window.extinguishLight = async (charId) => {
  await extinguishLight(charId);
  toast("Light extinguished");
};

// ── buildSheetCard ────────────────────────────────────────────────────────────
// char:     full character object with .id set
// editable: true = GM view (remove/add inventory, give light), false = player view
export function buildSheetCard(char, editable = false) {
  const c  = char.combat || {}, st = char.stats || {};
  const sp = char.spellcasting || null, sk = char.skills || {};
  const conds   = c.conditions || [];
  const hpCur   = c.hp_current ?? 0, hpMax = c.hp_max ?? 1;
  const hpPct   = Math.max(0, Math.min(1, hpCur/hpMax));
  const tempHp  = c.temp_hp ?? 0;
  const deathSaves = c.deathSaves || { successes: 0, failures: 0 };
  const concentration = c.concentration || null;
  const initBonus  = c.initiative_bonus ?? Math.floor(((st.dex??10)-10)/2);
  const profBonus  = c.proficiency_bonus ?? 2;
  const passPerc   = char.senses?.passive_perception ?? (10+Math.floor(((st.wis??10)-10)/2));
  const subLine    = `Lv ${char.level??'?'} ${char.class||''}${char.subclass?` (${char.subclass})`:''}${char.species?` · ${char.species}`:''}`;

  const abilityBoxes = ABILITY_KEYS.map(k => {
    const score = st[k] ?? 10;
    return `<div class="ab-box"><div class="ab-name">${ABILITY_LABELS[k]}</div><div class="ab-score">${score}</div><div class="ab-mod">${sMod(score)}</div></div>`;
  }).join('');

  const condPills = conds.map(cd => `<div class="cond-pill">${cd}</div>`).join('');

  // ── Concentration ──
  const concentrationHtml = concentration
    ? `<div class="hp-controls" style="margin-top:4px;justify-content:space-between">
         <span style="font-family:'Cinzel',serif;font-size:.6rem;color:var(--gold,#c8a84b)">🎯 Concentrating: ${sEsc(concentration.spell)}</span>
         <button class="hp-btn" style="padding:1px 8px;color:#fca5a5;border-color:rgba(224,64,64,.3)" onclick="window.clearConcentration('${char.id}')">✕ Lost it</button>
       </div>`
    : `<div class="hp-controls" style="margin-top:4px">
         <button class="hp-btn" style="flex:1" onclick="window.setConcentration('${char.id}')">🎯 Start concentrating…</button>
       </div>`;

  // ── Death saves — only relevant at 0 HP ──
  const deathSavesHtml = hpCur <= 0 ? `
    <div class="hp-controls" style="margin-top:4px;flex-direction:column;align-items:stretch;gap:4px">
      <div style="display:flex;align-items:center;justify-content:space-between;font-family:'Cinzel',serif;font-size:.6rem;color:var(--text-dim,#8a7a5a)">
        <span>${deathSaves.failures>=3?'💀 DEAD':deathSaves.successes>=3?'✅ STABLE':'⚠ DYING'}</span>
        <button class="hp-btn" style="padding:1px 8px" onclick="window.rollDeathSave('${char.id}','${sEsc(char.name||'')}')">🎲 Roll</button>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-family:'Cinzel',serif;font-size:.58rem;color:#4a9a4a;width:52px">Success</span>
        ${[0,1,2].map(i=>`<span onclick="window.setDeathSave('${char.id}','successes',${i<deathSaves.successes?i:i+1})" style="cursor:pointer;width:12px;height:12px;border-radius:50%;border:1px solid #4a9a4a;background:${i<deathSaves.successes?'#4a9a4a':'transparent'};display:inline-block"></span>`).join('')}
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-family:'Cinzel',serif;font-size:.58rem;color:#e04040;width:52px">Failure</span>
        ${[0,1,2].map(i=>`<span onclick="window.setDeathSave('${char.id}','failures',${i<deathSaves.failures?i:i+1})" style="cursor:pointer;width:12px;height:12px;border-radius:50%;border:1px solid #e04040;background:${i<deathSaves.failures?'#e04040':'transparent'};display:inline-block"></span>`).join('')}
      </div>
    </div>` : '';

  // ── Light banner ──
  const lightActive = char.light?.active;
  const lightBanner = lightActive
    ? `<div style="display:flex;align-items:center;justify-content:space-between;padding:5px 12px;background:rgba(200,168,75,.08);border-bottom:1px solid rgba(200,168,75,.2)">
         <span style="font-family:'Cinzel',serif;font-size:.65rem;color:var(--gold)">🕯 ${sEsc(char.light.source||'Light')} — ${char.light.bright}ft bright</span>
         <button onclick="window.extinguishLight('${char.id}')" style="font-family:'Cinzel',serif;font-size:.58rem;padding:1px 6px;border-radius:3px;border:1px solid rgba(224,64,64,.3);background:transparent;color:#fca5a5;cursor:pointer">Extinguish</button>
       </div>` : '';

  // ── Weapons ──
  const attacks = char.attacks || [];
  let weaponHtml = '';
  if (attacks.length) {
    const items = attacks.map(a => {
      const raw = a.to_hit != null && a.to_hit !== '' ? a.to_hit : (a.attack_bonus ?? 0);
      const atk = sFmt(parseInt(String(raw).replace(/[^0-9\-]/g,""),10) || 0);
      const notes = [a.properties, a.notes].filter(Boolean).join(' · ');
      return `<div class="weapon-item">
        <div class="weapon-top"><div class="weapon-name">${sEsc(a.name||'Unnamed')}</div>${a.damage_type?`<div class="weapon-type">${sEsc(a.damage_type)}</div>`:''}</div>
        <div class="weapon-stats">
          <div class="wstat"><div class="wstat-label">Attack</div><div class="wstat-val">${atk}</div></div>
          <div class="wstat"><div class="wstat-label">Damage</div><div class="wstat-val">${sEsc(a.damage||'—')}</div></div>
          ${a.range?`<div class="wstat"><div class="wstat-label">Range</div><div class="wstat-val">${sEsc(a.range)}</div></div>`:''}
        </div>${notes?`<div class="weapon-notes">${sEsc(notes)}</div>`:''}</div>`;
    }).join('');
    weaponHtml = `<div class="expand-panel" id="wp-${char.id}"><div class="weapon-list">${items}</div></div>`;
  }

  // ── Inventory ──
  const invRaw   = char.inventory ?? {};
  const inventory = Array.isArray(invRaw) ? invRaw : Object.values(invRaw);
  let invHtml = '';
  if (inventory.length || editable) {
    const items = inventory.map((item, idx) => {
      const api      = sheetGetItem(item.name);
      const rarity   = api?.rarity?.name?.toLowerCase().replace(/\s+/g,'-') ?? null;
      const rc       = rarity && rarity!=='none' ? ` inv-rarity-${rarity}` : '';
      const key      = itemKey(item.name);
      const lightDef = LIGHT_SOURCES[key];
      const isHeal   = !!HEAL_ITEMS[key];
      const litNow   = char.light?.active && char.light?.source === item.name;
      const useLabel = lightDef ? (litNow ? '🕯 Extinguish' : '🕯 Light') : (isHeal ? '❤️ Use' : '✨ Use');
      const useBtnStyle = litNow ? 'color:#c8a84b;border-color:rgba(200,168,75,.4)' : '';
      return `<div class="inv-item${rc}">
        <div class="inv-item-top">
          <span class="inv-name">${sEsc(item.name||'Unnamed')}</span>
          <div style="display:flex;align-items:center;gap:3px;flex-shrink:0">
            ${(item.qty??1)>1?`<span class="inv-qty">×${item.qty}</span>`:''}
            <button onclick="window.useItem('${char.id}',${idx})" style="font-family:'Cinzel',serif;font-size:.56rem;padding:2px 5px;border-radius:3px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.04);color:var(--dim,#6b5a38);cursor:pointer;${useBtnStyle}">${useLabel}</button>
            ${editable?`<button onclick="window.removeItem('${char.id}',${idx})" style="font-family:'Cinzel',serif;font-size:.6rem;padding:2px 5px;border-radius:3px;border:1px solid rgba(224,64,64,.3);background:rgba(224,64,64,.06);color:#fca5a5;cursor:pointer">✕</button>`:''}
          </div>
        </div>
        ${sheetItemCat(api)?`<span class="inv-cat">${sEsc(sheetItemCat(api))}</span>`:''}
        ${item.desc||sheetItemDesc(api)?`<div class="inv-desc">${sEsc(item.desc||sheetItemDesc(api))}</div>`:''}
        ${item.notes?`<div class="inv-notes">${sEsc(item.notes)}</div>`:''}
      </div>`;
    }).join('');

    const addRow  = editable
      ? `<button onclick="window.addItem('${char.id}')" style="width:100%;margin-top:6px;font-family:'Cinzel',serif;font-size:.65rem;padding:6px;border-radius:4px;border:1px solid rgba(200,168,75,.25);background:rgba(200,168,75,.06);color:var(--gold-dim,#7a6228);cursor:pointer">+ Add Item</button>` : '';
    const giveRow = editable
      ? `<button onclick="window.giveLight('${char.id}')" style="width:100%;margin-top:4px;font-family:'Cinzel',serif;font-size:.65rem;padding:6px;border-radius:4px;border:1px solid rgba(200,168,75,.2);background:transparent;color:var(--dim,#6b5a38);cursor:pointer">🕯 Give Custom Light</button>` : '';

    invHtml = `<div class="expand-panel" id="inv-${char.id}">${items}${addRow}${giveRow}</div>`;
  }

  // ── Spells ──
  let spellHtml = '', hasSpells = false;
  if (sp) {
    const spMeta = [
      sp.ability        ? `Ability: <span>${sp.ability.toUpperCase()}</span>` : null,
      sp.spell_save_dc  ? `DC <span>${sp.spell_save_dc}</span>`               : null,
      sp.spell_attack_bonus != null ? `Atk <span>${sFmt(sp.spell_attack_bonus)}</span>` : null,
    ].filter(Boolean).map(s=>`<div class="sp-meta-item">${s}</div>`).join('');

    let slotRows = '';
    for (let lvl = 1; lvl <= 9; lvl++) {
      const maxS  = sp.slots?.[String(lvl)] ?? sp.slots?.[lvl] ?? 0;
      if (!maxS) continue;
      const usedS = sp.slots_used?.[String(lvl)] ?? sp.slots_used?.[lvl] ?? 0;
      let pips = '';
      for (let i = 0; i < maxS; i++) {
        pips += `<div class="slot-pip${i<usedS?' used':''}" data-charid="${char.id}" data-lvl="${lvl}" data-idx="${i}" data-max="${maxS}" onclick="window.toggleSlot(this,event)"></div>`;
      }
      slotRows += `<div class="slot-level-row"><div class="slot-level-label">${sSpellLevel(lvl)}</div><div class="slot-pips">${pips}</div></div>`;
    }

    const spells   = sp.spells || [];
    const cantrips = spells.filter(s => s.prepared_type==='cantrip' || s.level===0);
    const prepared = spells.filter(s => s.prepared_type!=='cantrip' && s.level!==0);

    const renderSpell = s => `<div class="spell-item">
      <div class="spell-item-top">
        <span class="spell-name">${sEsc(s.name)}</span>
        <span class="spell-level-tag">${s.level===0||s.prepared_type==='cantrip'?'Cantrip':sSpellLevel(s.level||1)}</span>
      </div>
      ${sheetSpellDesc(s.name)?`<div class="spell-desc">${sEsc(sheetSpellDesc(s.name))}</div>`:''}
      ${sheetSpellMeta(s.name)}
      ${s.beginner_tip?`<div class="spell-tip"><span class="spell-tip-text">✦ ${sEsc(s.beginner_tip)}</span></div>`:''}
    </div>`;

    hasSpells = !!(cantrips.length || prepared.length || slotRows);
    spellHtml = `<div class="expand-panel" id="sp-${char.id}">
      ${spMeta?`<div class="sp-meta">${spMeta}</div>`:''}
      ${slotRows?`<div class="slot-levels">${slotRows}</div>`:''}
      ${cantrips.length?`<div class="sp-section-title">Cantrips</div><div class="spell-list">${cantrips.map(renderSpell).join('')}</div>`:''}
      ${prepared.length?`<div class="sp-section-title">Prepared</div><div class="spell-list">${prepared.map(renderSpell).join('')}</div>`:''}
      ${!cantrips.length&&!prepared.length?`<div class="empty-panel">No spells recorded.</div>`:''}
    </div>`;
  }

  // ── Skills ──
  const skillRows = getSkillsDb().map(s => {
    const d    = sk[s.key] || {};
    const base = Math.floor(((st[s.stat]??10)-10)/2);
    const bonus = d.bonus != null ? d.bonus : (base + (d.proficient?profBonus:0) + (d.expertise?profBonus:0));
    const cls  = d.expertise ? 'expert' : d.proficient ? 'prof' : '';
    return `<div class="skill-row-item ${cls}" title="${s.desc||s.label}"><span class="skill-name">${s.label}</span><span class="skill-val">${sFmt(bonus)}</span></div>`;
  }).join('');

  // ── Saves ──
  const saveProfList = char.saves?.proficient || [];
  const saveRows = ABILITY_KEYS.map(k => {
    const base = Math.floor(((st[k]??10)-10)/2);
    const prof = saveProfList.includes(k);
    return `<div class="save-row-item${prof?' prof':''}"><span class="skill-name">${ABILITY_LABELS[k]}</span><span class="skill-val">${sFmt(base+(prof?profBonus:0))}</span></div>`;
  }).join('');

  // ── Senses ──
  const sensePills = Object.entries(char.senses||{}).map(([k,v]) => {
    if (v==null||v===false||v==='') return '';
    const label = k.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
    const val   = typeof v==='number' ? ` ${v} ft` : (v===true ? '' : ` ${v}`);
    return `<div class="sense-pill">${label}${val}</div>`;
  }).join('');

  // ── Abilities/Features ──
  const abilityCards = Object.entries(char.abilities||{}).map(([abKey,ab]) => {
    if (!ab||!ab.label) return '';
    if (ab.kind==='charge' && ab.max) {
      const used = ab.max - (ab.current ?? ab.max);
      const meta = [ab.die?`${ab.die}`:null, ab.recharge?`recharge: ${ab.recharge}`:null].filter(Boolean).join(' · ');
      const pips = Array.from({length:ab.max},(_,i)=>`<div class="charge-pip${i<used?' used':''}" data-charid="${char.id}" data-abkey="${abKey}" data-idx="${i}" data-max="${ab.max}" onclick="window.toggleCharge(this,event)"></div>`).join('');
      return `<div class="ability-charge">
        <div class="ability-charge-top"><span class="ability-charge-name">${sEsc(ab.label)}</span>${meta?`<span class="ability-charge-meta">${sEsc(meta)}</span>`:''}</div>
        <div class="charge-pips">${pips}</div>
        ${ab.effect_desc?`<div class="feat-desc" style="margin-top:4px">${sEsc(ab.effect_desc)}</div>`:''}
      </div>`;
    }
    return `<div class="feat-item"><div class="feat-name">${sEsc(ab.label)}</div>${ab.effect_desc?`<div class="feat-desc">${sEsc(ab.effect_desc)}</div>`:''}</div>`;
  }).join('');

  const featuresText = char.text_blocks?.features_traits || '';
  const profText     = char.text_blocks?.proficiencies_languages || '';
  const featuresBlock = featuresText ? `<div class="feat-item"><div class="feat-desc" style="white-space:pre-wrap">${sEsc(featuresText)}</div></div>` : '';
  const profBlock     = profText ? `<div class="sp-section-title">Proficiencies &amp; Languages</div><div class="feat-item"><div class="feat-desc" style="white-space:pre-wrap">${sEsc(profText)}</div></div>` : '';

  const skillPanel = `<div class="expand-panel" id="sk-${char.id}">
    <div class="sp-section-title">Saving Throws</div><div class="save-grid">${saveRows}</div>
    ${sensePills?`<div class="sp-section-title">Senses</div><div class="senses-block">${sensePills}</div>`:''}
    <div class="sp-section-title">Skills</div><div class="skill-grid">${skillRows}</div>
    ${abilityCards||featuresBlock?`<div class="sp-section-title">Features &amp; Traits</div>${abilityCards}${featuresBlock}`:''}
    ${profBlock}
  </div>`;

  const hasTip  = !!char.beginner_tip;
  const tipPanel = hasTip ? `<div class="expand-panel" id="tg-${char.id}"><div class="combat-guide-wrap"><div class="combat-guide">${sEsc(char.beginner_tip)}</div></div></div>` : '';

  // ── Equipped & coins ──
  const eq = char.equipped || {}, eqParts = [];
  if (eq.armor)   eqParts.push(`<div class="equipped-badge">🛡 <span>${sEsc(eq.armor)}</span></div>`);
  if (eq.shield)  eqParts.push(`<div class="equipped-badge">🔰 <span>Shield</span></div>`);
  if (eq.offhand) eqParts.push(`<div class="equipped-badge">✋ <span>${sEsc(eq.offhand)}</span></div>`);

  const cp = char.coin_purse;
  const coinRow = cp ? `<div class="coin-row"><span class="coin-label">💰</span>
    <div class="coin pp">◈ ${cp.pp??0}pp</div><div class="coin gp">◉ ${cp.gp??0}gp</div>
    <div class="coin ep">◈ ${cp.ep??0}ep</div><div class="coin sp">◎ ${cp.sp??0}sp</div>
    <div class="coin cp">○ ${cp.cp??0}cp</div></div>` : '';

  // ── Assemble card ──
  const card = document.createElement('div');
  card.className = 'card'; card.id = `card-${char.id}`;
  card.innerHTML = `
    <div class="card-header">
      <div class="char-name">${sEsc(char.name||'Unnamed')}</div>
      <div class="char-sub">${sEsc(subLine)}</div>
      ${char.combat_role?`<div class="char-role-badge">${sEsc(char.combat_role)}</div>`:''}
      <div class="hp-row">
        <div class="hp-label">HP</div>
        <div class="hp-bar-wrap"><div class="hp-bar" id="hpbar-${char.id}" style="width:${Math.round(hpPct*100)}%;background:${sHpColor(hpCur,hpMax)}"></div></div>
        <div class="hp-val" id="hpval-${char.id}">${hpCur} / ${hpMax}</div>
        ${tempHp?`<div class="temp-badge">+${tempHp} tmp</div>`:''}
      </div>
      ${concentrationHtml}
      ${deathSavesHtml}
      <div class="hp-controls">
        <input class="hp-delta" id="hpdelta-${char.id}" type="number" min="1" placeholder="amt"/>
        <button class="hp-btn heal" onclick="window.adjustHp('${char.id}',true)">+ Heal</button>
        <button class="hp-btn dmg"  onclick="window.adjustHp('${char.id}',false)">− Dmg</button>
      </div>
      <div class="hp-controls" style="margin-top:4px">
        <button class="hp-btn" style="flex:1" onclick="window.shortRest('${char.id}')">☕ Short Rest</button>
        <button class="hp-btn" style="flex:1" onclick="window.longRest('${char.id}')">🌙 Long Rest</button>
      </div>
      ${editable?`<div class="hp-controls" style="margin-top:4px">
        <button class="hp-btn" style="flex:1;color:var(--gold,#c8a84b);border-color:rgba(200,168,75,.4)" onclick="window.levelUpChar('${char.id}')">⬆ Level Up</button>
      </div>`:''}
    </div>
    ${lightBanner}
    <div class="stats-row">
      <div class="stat-cell"><div class="stat-label">AC</div><div class="stat-val">${c.ac??'—'}</div></div>
      <div class="stat-cell"><div class="stat-label">Speed</div><div class="stat-val">${c.speed??30}</div></div>
      <div class="stat-cell"><div class="stat-label">Init</div><div class="stat-val">${sFmt(initBonus)}</div></div>
      <div class="stat-cell"><div class="stat-label">Prof</div><div class="stat-val">+${profBonus}</div></div>
      <div class="stat-cell"><div class="stat-label">Perc</div><div class="stat-val">${passPerc}</div></div>
    </div>
    ${eqParts.length?`<div class="equipped-row">${eqParts.join('')}</div>`:''}
    ${coinRow}
    <div class="ability-grid">${abilityBoxes}</div>
    ${condPills?`<div class="conditions-row">${condPills}</div>`:''}
    <div class="card-footer">
      ${hasTip?`<button class="panel-btn tip-btn" id="tgbtn-${char.id}" onclick="window.togglePanel('tg-${char.id}','tgbtn-${char.id}')">✦ Combat Guide <span class="chevron">▾</span></button>`:''}
      ${attacks.length?`<button class="panel-btn weapon-btn" id="wpbtn-${char.id}" onclick="window.togglePanel('wp-${char.id}','wpbtn-${char.id}')">⚔ Weapons &amp; Attacks <span class="chevron">▾</span></button>`:''}
      <button class="panel-btn skill-btn" id="skbtn-${char.id}" onclick="window.togglePanel('sk-${char.id}','skbtn-${char.id}')">📋 Skills &amp; Saves <span class="chevron">▾</span></button>
      ${hasSpells?`<button class="panel-btn spell-btn" id="spbtn-${char.id}" onclick="window.togglePanel('sp-${char.id}','spbtn-${char.id}')">✨ Spells <span class="chevron">▾</span></button>`:''}
      ${inventory.length||editable?`<button class="panel-btn inv-btn" id="invbtn-${char.id}" onclick="window.togglePanel('inv-${char.id}','invbtn-${char.id}')">🎒 Inventory <span class="chevron">▾</span></button>`:''}
    </div>
    ${tipPanel}
    ${attacks.length?weaponHtml:''}
    ${skillPanel}
    ${hasSpells?spellHtml:''}
    ${inventory.length||editable?invHtml:''}
  `;
  return card;
}

// ── Sheet panel controller ────────────────────────────────────────────────────
let _sheetWatcher = null;

export function closeSheetPanel() {
  document.getElementById('sheet-panel')?.classList.remove('open');
  if (_sheetWatcher) { _sheetWatcher(); _sheetWatcher = null; }
}

export async function openCharSheet(charId, charName, editable = false) {
  await loadSheetApi();
  const panel = document.getElementById('sheet-panel');
  const view  = document.getElementById('sheet-view');
  const title = document.getElementById('sheet-panel-title');
  if (!panel || !view) return;

  panel.classList.add('open');
  view.innerHTML = '<div id="sheet-empty">Loading…</div>';
  if (title) title.textContent = `📋 ${charName || 'CHARACTER'}`;

  if (_sheetWatcher) { _sheetWatcher(); _sheetWatcher = null; }

  const path = charId && charId !== '__npc__' ? `characters/pcs/${charId}` : null;
  if (!path) {
    view.innerHTML = `<div id="sheet-empty">No sheet for<br><strong>${charName || 'this token'}</strong></div>`;
    return;
  }

  _sheetWatcher = onValue(ref(db, path), snap => {
    if (!snap.exists()) { view.innerHTML = `<div id="sheet-empty">Character not found</div>`; return; }
    const char = { ...snap.val(), id: charId };
    view.innerHTML = '';
    view.appendChild(buildSheetCard(char, editable));
  });
}
