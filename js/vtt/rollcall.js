// Roll call: the GM picks a stat (initiative / save / skill / ability / custom), sets a DC and ticks which tokens on the map must roll.
// Everyone gets a floating window; each player rolls their own character from its GeezSheets sheet (modifier, advantage, Bless etc.).
//
// Firebase, under /test/rollcall/current:
//   { id, kind, key, title, dc, showDc, mode, to: { <tokenId>: <name> }, open, t,
//     results: { <tokenId>: { name, total, detail, nat, dice: [{ s, v, drop? }], t } } }
// A result is written once per token (first answer wins, through a transaction).
// Initiative calls also drop the total into initiative/order/<tokenId>.
import { watch, put, patch, read, readAt, txn } from "../store.js";
import { S } from "./state.js";
import { floatWindow, addBarButton } from "./ui.js";
import { rollDice } from "./dice.js";
import { visibleToPlayer } from "./visibility.js";
import { isPcToken } from "./draw.js";
import { rollContext, loadRulesData } from "./rollrules.js";
import { effectBonuses } from "./effects.js";

export const ABIL = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };
export const SKILLS = [
  ["acrobatics", "Acrobatics", "dex"], ["animal_handling", "Animal Handling", "wis"], ["arcana", "Arcana", "int"], ["athletics", "Athletics", "str"],
  ["deception", "Deception", "cha"], ["history", "History", "int"], ["insight", "Insight", "wis"], ["intimidation", "Intimidation", "cha"],
  ["investigation", "Investigation", "int"], ["medicine", "Medicine", "wis"], ["nature", "Nature", "int"], ["perception", "Perception", "wis"],
  ["performance", "Performance", "cha"], ["persuasion", "Persuasion", "cha"], ["religion", "Religion", "int"], ["sleight_of_hand", "Sleight of Hand", "dex"],
  ["stealth", "Stealth", "dex"], ["survival", "Survival", "wis"],
];
const EXTRAS = [["bless", "Bless", 4], ["guidance", "Guidance", 4], ["resistance", "Resistance", 4], ["bardic", "Bardic Inspiration", 6]];
const KINDS = [["init", "Initiative"], ["save", "Save"], ["skill", "Skill"], ["ability", "Ability"], ["custom", "Custom"]];

const asList = (x) => (Array.isArray(x) ? x : x && typeof x === "object" ? Object.values(x) : []);
const abMod = (score) => Math.floor(((Number(score) || 10) - 10) / 2);
const sgn = (n) => (n >= 0 ? "+" : "−") + Math.abs(n);
const statOf = (c, ab) => c?.stats?.[ab] ?? c?.abilities?.[ab]?.score ?? 10;
const uid = () => { const a = new Uint32Array(2); crypto.getRandomValues(a); return `${Date.now().toString(36)}-${a[0].toString(36)}${a[1].toString(36)}`; };

// Modifier from the character sheet, with a breakdown: { mod, parts: [[label, n]] }
function callMod(c, call, effects) {
  const prof = Number(c?.combat?.proficiency_bonus) || 2, parts = [];
  if (call.kind === "init") {
    const ib = c?.combat?.initiative_bonus;
    if (ib != null && ib !== "") parts.push(["Initiative", Number(ib) || 0]); else parts.push(["DEX", abMod(statOf(c, "dex"))]);
  } else if (call.kind === "save") {
    parts.push([call.key.toUpperCase(), abMod(statOf(c, call.key))]);
    if (asList(c?.saves?.proficient).includes(call.key)) parts.push(["Proficient", prof]);
  } else if (call.kind === "skill") {
    const sk = SKILLS.find((s) => s[0] === call.key), data = c?.skills?.[call.key] || {};
    if (data.bonus != null && data.bonus !== "") parts.push([sk?.[1] || "Skill", Number(data.bonus) || 0]);
    else {
      parts.push([(sk?.[2] || "dex").toUpperCase(), abMod(statOf(c, sk?.[2] || "dex"))]);
      if (data.proficient) parts.push(["Proficient", prof]);
      if (data.expertise) parts.push(["Expertise", prof]);
    }
  } else if (call.kind === "ability") parts.push([call.key.toUpperCase(), abMod(statOf(c, call.key))]);
  const bonus = effectBonuses(effects).save;
  if (bonus) parts.push(["Effects", bonus]);
  return { mod: parts.reduce((a, p) => a + p[1], 0), parts };
}
// What the sheet gives this roll for free (armor, conditions), merged with the GM's own advantage/disadvantage on the call.
function autoRules(tid, sheet, call) {
  const ctx = rollContext(sheet, call, { skillAbility: SKILLS.find((x) => x[0] === call.key)?.[2], tokenConditions: Object.keys(S.tokens[tid]?.conditions || {}), tokenEffects: S.tokens[tid]?.effects });
  if (call.mode === "adv") ctx.adv.unshift("GM called advantage"); else if (call.mode === "dis") ctx.dis.unshift("GM called disadvantage");
  ctx.mode = ctx.adv.length && ctx.dis.length ? "normal" : ctx.dis.length ? "dis" : ctx.adv.length ? "adv" : "normal";
  return ctx;
}
function callTitle(call) {
  if (call.title) return call.title;
  if (call.kind === "init") return "Initiative";
  if (call.kind === "save") return `${ABIL[call.key] || call.key} Saving Throw`;
  if (call.kind === "skill") { const sk = SKILLS.find((s) => s[0] === call.key); return `${sk ? `${sk[1]} (${sk[2].toUpperCase()})` : call.key} Check`; }
  if (call.kind === "ability") return `${ABIL[call.key] || call.key} Check`;
  return "Roll";
}
const passed = (call, r) => (call?.dc && call.kind !== "init" && r ? r.total >= call.dc : null);

// ---- which sheet belongs to a token ------------------------------------------------------
let pcNames = null;   // [{ id, name }]
async function pcIdFor(tid) {
  const t = S.tokens[tid]; if (!t || t.npc) return null;
  if (t.pc) return t.pc;
  if (S.tokPc?.[tid]) return S.tokPc[tid];
  if (!pcNames) { try { pcNames = Object.entries((await readAt("characters/pcs")) || {}).map(([id, c]) => ({ id, name: c?.name || c?.identity?.name || c?.basic?.name || "" })); } catch { pcNames = []; } }
  const nm = String(t.label || "").toLowerCase();
  return nm ? pcNames.find((c) => c.name.toLowerCase() === nm)?.id || null : null;
}
const sheetOf = async (tid) => { const id = isPcToken(S.tokens[tid] || {}) ? await pcIdFor(tid) : null; return id ? (await readAt(`characters/pcs/${id}`)) || null : null; };
const tokenName = (tid) => S.tokens[tid]?.label || tid;
let me = null; const loadMe = () => { try { me = JSON.parse(localStorage.getItem("vtt-me")); } catch { me = null; } return me; };
// May this player roll for that token? (GM: every one. Player: PC tokens that are theirs, or any PC token if they never picked a character.)
async function mayRoll(tid) {
  const t = S.tokens[tid]; if (!t) return false;
  if (S.isGM) return true;
  if (!isPcToken(t)) return false;
  if (!loadMe()) return true;
  return t.pc ? t.pc === me.id : String(t.label || "").toLowerCase() === me.name.toLowerCase() || (await pcIdFor(tid)) === me.id;
}

// ---- state --------------------------------------------------------------------------------
let current = null, callWin, setupWin, ready = false, seen = new Set(), opt = { mode: null, extras: {}, other: 0, bardicDie: 6 }, optFor = null, mine = [];
const pageLoadedAt = Date.now();
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const STYLE = `#win-rollcall-call .fwin-body,#win-rollcall-setup .fwin-body{color:var(--paper);font:15px Georgia,serif;min-width:270px;max-width:340px}
.rc-h{font:bold 19px Georgia,serif;color:var(--brass-lt)}.rc-sub{font-size:12px;opacity:.8;margin-bottom:6px}
.rc-row{display:flex;align-items:center;gap:8px;border-bottom:1px solid #b98f4566;padding:4px 0}.rc-row.wait{opacity:.55}.rc-row .nm{flex:1}.rc-row b{font-size:17px}.rc-ok{color:#7ddc8c}.rc-bad{color:#ff8a8a}.rc-nat{font-size:11px}
.rc-why{line-height:1.45;font-size:12.5px;opacity:1}.rc-box{margin-top:8px;padding-top:7px;border-top:1px solid var(--brass)}.rc-chips{display:flex;flex-wrap:wrap;gap:4px;margin:5px 0}
.rc-chips button,.rc-act button,.rc-roll{padding:3px 9px;border:1px solid var(--brass);border-radius:11px;background:var(--leather-dk);color:var(--paper);font:13px Georgia,serif;cursor:pointer}
.rc-chips button.on{background:var(--brass);color:var(--ink)}.rc-roll{display:block;width:100%;margin-top:7px;padding:7px;border-radius:5px;font:bold 20px Georgia,serif}.rc-act{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}
#win-rollcall-setup input,#win-rollcall-setup select{background:var(--paper);color:var(--ink);border:1px solid var(--brass);border-radius:3px;font:14px Georgia,serif;padding:2px 4px}
.rc-fld{display:flex;align-items:center;gap:8px;margin:6px 0}.rc-targets{max-height:200px;overflow:auto;margin:4px 0}.rc-targets label{display:flex;align-items:center;gap:6px;padding:2px 0}`;

// ---- the call window (everyone) -----------------------------------------------------------
function targetsOf(call) { return Object.entries(call.to || {}).filter(([tid]) => S.isGM || visibleToPlayer(S.tokens[tid], Object.values(S.map.fog || {}), false, S.currentVisible, S.map.exploredEnabled !== false)).map(([tid, name]) => ({ tid, name: S.tokens[tid]?.label || name, r: call.results?.[tid] })); }

async function render() {
  if (!callWin) return;
  const call = current;
  if (!call?.open) { callWin.hide(); return; }
  if (optFor !== call.id) { optFor = call.id; opt = { mode: null, extras: {}, other: 0, bardicDie: 6 }; }
  const dcShown = call.dc && (S.isGM || call.showDc), rows = targetsOf(call);
  rows.sort((a, b) => (b.r ? 1 : 0) - (a.r ? 1 : 0) || (call.kind === "init" ? (b.r?.total ?? 0) - (a.r?.total ?? 0) : 0));
  const modeTxt = call.mode === "adv" ? " · advantage" : call.mode === "dis" ? " · disadvantage" : "";
  let html = `<div class="rc-sub">${call.kind === "init" ? "Roll for" : "The GM calls for"}</div><div class="rc-h">${esc(callTitle(call))}</div>
    <div class="rc-sub">${dcShown ? `DC ${esc(call.dc)}${call.showDc ? "" : " (hidden from players)"}` : ""}${modeTxt}</div>`;
  html += rows.map(({ name, r }) => {
    const p = dcShown ? passed(call, r) : null;
    return `<div class="rc-row ${r ? "" : "wait"}"><span class="nm">${esc(name)}</span>${r?.nat === 20 ? '<span class="rc-ok rc-nat">nat 20</span>' : r?.nat === 1 ? '<span class="rc-bad rc-nat">nat 1</span>' : ""}${p === true ? '<span class="rc-ok">✔</span>' : p === false ? '<span class="rc-bad">✘</span>' : ""}<b title="${esc(r?.detail || "")}">${r ? esc(r.total) : "waiting…"}</b></div>`;
  }).join("") || '<div class="rc-sub">No one called.</div>';

  // my roll: the first token I may roll for that hasn't answered
  mine = []; for (const { tid, r } of rows) if (!r && await mayRoll(tid)) mine.push(tid);
  if (current !== call) return;   // a newer call arrived while we were looking up sheets
  const tid = mine[0];
  if (tid && (S.isGM ? false : true)) {
    await loadRulesData();
    const sheet = await sheetOf(tid), { mod, parts } = callMod(sheet, call, S.tokens[tid]?.effects), auto = autoRules(tid, sheet, call), mode = auto.mode;
    if (current !== call) return;
    const why = [...auto.adv.map((r) => `<span class="rc-ok">▲ ${esc(r)}</span>`), ...auto.dis.map((r) => `<span class="rc-bad">▼ ${esc(r)}</span>`), ...auto.notes.map((r) => `<span>ⓘ ${esc(r)}</span>`)];
    const chip = (on, attr) => `<button type="button" ${attr} class="${on ? "on" : ""}">`;
    html += `<div class="rc-box"><div class="rc-sub">${esc(tokenName(tid))}: <b>${mode === "normal" ? "1d20" : "2d20"} ${sgn(mod)}</b> · ${esc(parts.map(([l, v]) => `${l} ${sgn(v)}`).join(" · ") || "no sheet, flat d20")}</div>
      ${why.length ? `<div class="rc-sub rc-why">${why.join("<br>")}${auto.adv.length && auto.dis.length ? "<br>Advantage and disadvantage cancel out." : ""}</div>` : ""}
      <div class="rc-sub rc-mode-line">${mode === "dis" ? '<b class="rc-bad">Rolling with disadvantage</b>' : mode === "adv" ? '<b class="rc-ok">Rolling with advantage</b>' : "Normal roll"}</div>
      <div class="rc-chips">${EXTRAS.map(([k, l, d]) => `${chip(opt.extras[k], `data-extra="${k}"`)}${l} +1d${k === "bardic" ? opt.bardicDie : d}</button>`).join("")}</div>
      <div class="rc-fld">${opt.extras.bardic ? `<select data-bardic>${[6, 8, 10, 12].map((d) => `<option value="${d}" ${opt.bardicDie === d ? "selected" : ""}>Bardic d${d}</option>`).join("")}</select>` : ""}Other <input data-other type="number" value="${esc(opt.other || 0)}" style="width:3.5em"></div>
      <button type="button" class="rc-roll" data-roll="${esc(tid)}">ROLL</button></div>`;
  } else if (!S.isGM) html += `<div class="rc-sub rc-box">${rows.some((x) => x.r && x.name) && !mine.length && rows.length ? "Your roll is in." : "Not your roll: watching."}</div>`;
  if (S.isGM) {
    const missing = rows.filter((x) => !x.r);
    html += `<div class="rc-act">${missing.map((x) => `<button type="button" data-for="${esc(x.tid)}">Roll for ${esc(x.name)}</button>`).join("")}<button type="button" data-close>Close for everyone</button></div>`;
  }
  const keepOther = callWin.body.querySelector("[data-other]") === document.activeElement;   // don't clobber typing
  if (keepOther) return;
  callWin.body.innerHTML = html; callWin.show();
}

// Roll for a token: dice animate on everyone's screen, the answer goes in once.
async function answer(tid, o = {}) {
  const call = current; if (!call?.open || call.results?.[tid]) return;
  await loadRulesData();
  const sheet = await sheetOf(tid), { mod } = callMod(sheet, call), mode = autoRules(tid, sheet, call).mode, extras = o.extras || {}, other = Number(o.other) || 0;
  const sides = [20]; if (mode !== "normal") sides.push(20);
  const used = EXTRAS.filter(([k]) => extras[k]).map(([k, , d]) => [k, k === "bardic" ? Number(o.bardicDie || d) : d]);
  for (const [, s] of used) sides.push(s);
  const name = tokenName(tid); let out = null;
  const roll = await rollDice(sides, 0, (dr) => {
    const a = dr[0].result, b = mode === "normal" ? null : dr[1].result, d20 = b == null ? a : mode === "adv" ? Math.max(a, b) : Math.min(a, b);
    const dice = [{ s: 20, v: a, ...(b != null && a !== d20 ? { drop: true } : {}) }]; if (b != null) dice.push({ s: 20, v: b, ...(a === d20 ? { drop: true } : {}) });
    let total = d20 + mod; const bits = [`[${dice.map((x) => x.v).join(", ")}]${mode !== "normal" ? " " + mode : ""}`, sgn(mod)];
    used.forEach(([k, s], i) => { const v = dr[dice.length + i].result; total += v; dice.push({ s, v }); bits.push(`+ ${EXTRAS.find((e) => e[0] === k)[1]} ${v}`); });
    if (other) { total += other; bits.push(sgn(other)); }
    out = { total, detail: bits.join(" "), nat: d20, dice };
    return { by: name, total, nat: d20, sub: `${callTitle(call)}: ${bits.join(" ")}` };
  });
  if (!roll || !out || current?.id !== call.id) return;
  const res = { name, total: out.total, detail: out.detail, nat: out.nat, dice: out.dice, t: Date.now() };
  const ok = await txn(`rollcall/current/results/${tid}`, (cur) => (cur ? undefined : res));
  if (!ok) return;
  if (call.kind === "init") {
    const order = (await read("initiative/order")) || {}, n = Object.values(order).reduce((m, x) => Math.max(m, Number(x?.n) || 0), 0) + 1;
    await patch({ [`initiative/order/${tid}`]: { init: res.total, n: order[tid]?.n ?? n } });
  }
}

function wireCallWindow() {
  callWin.body.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b || !current) return;
    if (b.dataset.extra) { opt.extras[b.dataset.extra] = !opt.extras[b.dataset.extra]; render(); }
    else if (b.dataset.roll) { b.disabled = true; opt.other = parseInt(callWin.body.querySelector("[data-other]")?.value, 10) || 0; answer(b.dataset.roll, opt); }
    else if (b.dataset.for) { b.disabled = true; answer(b.dataset.for, {}); }
    else if (b.hasAttribute("data-close") && S.isGM) put("rollcall/current/open", false);
  });
  callWin.body.addEventListener("change", (e) => {
    if (e.target.matches("[data-bardic]")) { opt.bardicDie = +e.target.value; render(); }
    if (e.target.matches("[data-other]")) opt.other = parseInt(e.target.value, 10) || 0;
  });
}

// ---- the setup window (GM): stat -> DC -> who ----------------------------------------------
let kind = "init";
function renderSetup() {
  const tokens = Object.entries(S.tokens || {});
  // keep ticks across re-renders; a token we haven't listed yet starts ticked if it's a PC
  const listed = new Set([...setupWin.body.querySelectorAll(".rc-tk")].map((c) => c.value)), old = new Set([...setupWin.body.querySelectorAll(".rc-tk:checked")].map((c) => c.value));
  const tick = (tid, t) => (listed.has(tid) ? old.has(tid) : isPcToken(t));
  const keyOpts = kind === "save" || kind === "ability" ? Object.entries(ABIL).map(([k, v]) => `<option value="${k}">${v}</option>`).join("") : kind === "skill" ? SKILLS.map(([k, l, a]) => `<option value="${k}">${l} (${a.toUpperCase()})</option>`).join("") : "";
  const prevKey = setupWin.body.querySelector(".rc-key")?.value, prevTitle = setupWin.body.querySelector(".rc-title")?.value || "", prevDc = setupWin.body.querySelector(".rc-dc")?.value || "";
  const prevShow = setupWin.body.querySelector(".rc-show")?.checked, prevMode = setupWin.body.querySelector(".rc-mode")?.value || "normal";
  setupWin.body.innerHTML = `<div class="rc-sub">1 · What are they rolling?</div>
    <div class="rc-chips">${KINDS.map(([k, l]) => `<button type="button" data-kind="${k}" class="${k === kind ? "on" : ""}">${l}</button>`).join("")}</div>
    ${keyOpts ? `<select class="rc-key" style="width:100%">${keyOpts}</select>` : ""}
    <input class="rc-title" placeholder="${kind === "custom" ? "What is the roll for?" : "Title (optional)"}" style="width:100%;margin-top:5px;box-sizing:border-box" value="${esc(prevTitle)}">
    <div class="rc-sub" style="margin-top:9px">2 · Difficulty</div>
    <div class="rc-fld">DC <input class="rc-dc" type="number" min="1" style="width:4em" ${kind === "init" ? "disabled" : ""} value="${esc(prevDc)}"> <label><input class="rc-show" type="checkbox" ${prevShow ? "checked" : ""}> show DC</label>
      <select class="rc-mode" style="margin-left:auto">${[["normal", "Normal"], ["adv", "Advantage"], ["dis", "Disadvantage"]].map(([m, l]) => `<option value="${m}" ${prevMode === m ? "selected" : ""}>${l}</option>`).join("")}</select></div>
    <div class="rc-sub" style="margin-top:9px">3 · Who rolls? (tokens on the map)</div>
    <div class="rc-chips"><button type="button" data-pick="pcs">All PCs</button><button type="button" data-pick="all">Everyone</button><button type="button" data-pick="none">None</button></div>
    <div class="rc-targets">${tokens.map(([tid, t]) => `<label><input class="rc-tk" type="checkbox" value="${esc(tid)}" ${tick(tid, t) ? "checked" : ""}> ${esc(t.label || tid)}${isPcToken(t) ? "" : ' <span class="rc-sub">(GM rolls)</span>'}</label>`).join("") || '<div class="rc-sub">No tokens on the map.</div>'}</div>
    <div class="rc-act"><button type="button" data-send style="font-weight:bold">Send to the table</button>${current?.open ? '<button type="button" data-showcall>Show current call</button>' : ""}</div>`;
  const key = setupWin.body.querySelector(".rc-key"); if (key && prevKey && [...key.options].some((o) => o.value === prevKey)) key.value = prevKey;
}
function wireSetup() {
  setupWin.body.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.kind) { kind = b.dataset.kind; renderSetup(); }
    else if (b.dataset.pick) { for (const c of setupWin.body.querySelectorAll(".rc-tk")) c.checked = b.dataset.pick === "all" || (b.dataset.pick === "pcs" && isPcToken(S.tokens[c.value] || {})); }
    else if (b.hasAttribute("data-showcall")) callWin.show();
    else if (b.hasAttribute("data-send")) send();
  });
}
// Open a roll call from code (the command console uses this). Same record the setup window writes.
export const callRoll = ({ kind, key = "", title = "", dc = null, showDc = false, mode = "normal", tokenIds }) => put("rollcall/current", {
  id: uid(), kind, key, title: title.trim(), dc: kind !== "init" && dc > 0 ? dc : null, showDc: !!showDc, mode,
  to: Object.fromEntries(tokenIds.map((tid) => [tid, tokenName(tid)])), open: true, t: Date.now(), results: {},
});
async function send() {
  const picked = [...setupWin.body.querySelectorAll(".rc-tk:checked")].map((c) => c.value);
  if (!picked.length) { const t = document.getElementById("toast"); if (t) { t.textContent = "Tick at least one token"; t.style.display = "block"; setTimeout(() => (t.style.display = "none"), 2500); } return; }
  const g = (s) => setupWin.body.querySelector(s), dc = Number(g(".rc-dc")?.value);
  await callRoll({ kind, key: g(".rc-key")?.value || "", title: g(".rc-title")?.value || "", dc, showDc: g(".rc-show")?.checked, mode: g(".rc-mode")?.value || "normal", tokenIds: picked });
  setupWin.hide();
}

export function initRollCall() {
  if (!document.getElementById("rollcall-style")) { const s = document.createElement("style"); s.id = "rollcall-style"; s.textContent = STYLE; document.head.append(s); }
  callWin = floatWindow({ id: "rollcall-call", title: "Roll call", x: 300, y: 150, hidden: true }); wireCallWindow();
  if (S.isGM) { setupWin = floatWindow({ id: "rollcall-setup", title: "Call for a roll", x: 260, y: 110, hidden: true }); wireSetup(); }
  addBarButton({
    id: "rollcall", icon: "📣", label: "Roll Call", title: S.isGM ? "Call for a roll" : "Show the current roll call",
    onClick: () => { if (S.isGM) { if (setupWin.visible()) setupWin.hide(); else { setupWin.body.textContent = ""; renderSetup(); setupWin.show(); } } else if (current?.open) { render(); callWin.show(); } },
  });
  document.addEventListener("tokenschanged", () => { if (current?.open) render(); });
  document.addEventListener("vttvisibilitychange", () => { if (current?.open) render(); });
  watch("rollcall/current", (value) => {
    const first = !ready; ready = true; current = value || null;
    if (!value?.open) { callWin.hide(); return; }
    const fresh = !seen.has(value.id) && (value.t || 0) > pageLoadedAt - 15000 && Date.now() - (value.t || 0) < 60000;
    if (first || fresh) { const wasSeen = seen.has(value.id); seen.add(value.id); if (!fresh && wasSeen) return; }
    render().then(() => { if (!fresh && first && callWin.visible()) return; });
    if (!fresh) callWin.hide();   // an old call found on page load: stays closed until opened from the bar
  });
}
