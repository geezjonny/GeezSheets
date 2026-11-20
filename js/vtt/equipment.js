// PC equipment window (right-click a PC token > Equipment): Helmet, Armor, Shield, Weapon, each with a tooltip saying what it does.
// Lives on the sheet at characters/pcs/<id>/equipped { helmet, armor, shield, main_hand }, the same object the sheet's badges read.
// Roll Call reads it (rollrules.js) to apply things like Chain Mail's Stealth disadvantage. The GM equips; players can look.
import { watchAt, txnAt } from "../store.js";
import { floatWindow } from "./ui.js";
import { loadRulesData, srdItem, describeGear, equippedOf } from "./rollrules.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const entries = (raw) => Object.values(raw && typeof raw === "object" ? raw : {}).filter((it) => it && typeof it === "object" && it.name);
const HEAD = /\b(helm|helmet|hat|cap|crown|circlet|hood|mask|headband|coif|diadem)\b/i;

// slot -> [icon, label, which inventory items may go there]
const SLOTS = {
  helmet: ["⛑", "Helmet", (it, g) => !g?.armor_category && !g?.weapon_category && HEAD.test(it.name)],
  armor: ["🛡", "Armor", (it, g) => g?.armor_category && g.armor_category !== "Shield" || /\barmor\b/i.test(it.name)],
  shield: ["🔰", "Shield", (it, g) => g?.armor_category === "Shield" || /\bshield\b/i.test(it.name)],
  main_hand: ["⚔", "Weapon", (it, g) => !!g?.weapon_category],
};
const wins = {};

export function openEquipment({ tokenId, name, pcId, isGM, x = 140, y = 100 }) {
  let rec = wins[tokenId];
  if (!rec) {
    const w = floatWindow({ id: "equip-" + tokenId, title: "Equipment", x, y });
    w.body.classList.add("tokwin", "eqwin");
    rec = wins[tokenId] = { w, offs: [] };
    w.el.addEventListener("fwin-close", () => { rec.offs.forEach((f) => f()); rec.offs = []; });
  }
  const { w } = rec;
  w.el.querySelector(".fwin-title").textContent = `${name || "PC"} · Equipment`;
  const base = `characters/pcs/${pcId}`;
  let sheet = {}, inv = null;

  const draw = () => {
    if (w.el.hidden) return;
    const eq = equippedOf(sheet), items = entries(inv);
    const rows = Object.entries(SLOTS).map(([slot, [icon, label, fits]]) => {
      const cur = slot === "shield" ? (eq.shield ? "Shield" : "") : eq[slot];
      const tip = describeGear(slot, cur, sheet, srdItem).join("\n");
      const opts = items.filter((it) => fits(it, srdItem(it.name))), has = opts.some((it) => it.name === cur);
      const pick = isGM
        ? `<select data-slot="${slot}"><option value="">— empty —</option>${cur && !has ? `<option value="${esc(cur)}" selected>${esc(cur)}</option>` : ""}${opts.map((it) => `<option value="${esc(it.name)}" ${it.name === cur ? "selected" : ""}>${esc(it.name)}</option>`).join("")}</select>`
        : `<span class="eq-name">${esc(cur || "—")}</span>`;
      return `<div class="eq-slot" title="${esc(tip)}"><span class="eq-ico">${icon}</span><span class="eq-lbl">${label}</span>${pick}<span class="eq-tip">${esc(describeGear(slot, cur, sheet, srdItem)[0] || "")}</span></div>`;
    }).join("");
    w.body.innerHTML = rows + `<div class="eq-hint">Hover a slot for details. Roll Call uses this: for example Chain Mail gives disadvantage on Stealth.</div>`;
  };
  w.body.onchange = async (e) => {
    const sel = e.target.closest("select[data-slot]"); if (!sel || !isGM) return;
    const slot = sel.dataset.slot, val = sel.value;
    try {
      await txnAt(`${base}/equipped`, (cur) => {
        const o = { ...(cur && typeof cur === "object" ? cur : {}) };
        if (slot === "shield") o.shield = !!val; else if (val) o[slot] = val; else delete o[slot];
        return Object.keys(o).length ? o : null;
      });
    } catch (err) { console.warn("Equipment not saved", err); }
  };

  w.show();
  rec.offs.forEach((f) => f());
  rec.offs = [watchAt(base, (v) => { sheet = v || {}; draw(); }), watchAt(`${base}/inventory`, (v) => { inv = v; draw(); })];
  loadRulesData().then(draw);
}
