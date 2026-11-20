// Token inventory window (right-click a token > Inventory). A PC's items live on their sheet (characters/pcs/<id>/inventory,
// the same list the GeezSheets sheet shows live); any other token keeps its own under tokens/<id>/inventory. The GM adds items
// Coins (pp gp ep sp cp) sit beside it at .../coin_purse, the sheet's own coin purse. The GM adds items
// from the SRD (data/equipment.json + magic_items.json) or types any name, with an optional description shown as a tooltip.
import { watch, watchAt, txn, txnAt } from "../store.js";
import { floatWindow } from "./ui.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const entries = (raw) => Object.entries(raw && typeof raw === "object" ? raw : {}).filter(([, it]) => it && typeof it === "object" && it.name);

let srd = null, srdLoading = null;   // lowercase name -> { name, category, rarity, desc }
function loadSrd() {
  return (srdLoading ||= Promise.all(["data/equipment.json", "data/magic_items.json"].map((f) => fetch(f).then((r) => r.json()).catch(() => [])))
    .then(([equip, magic]) => {
      srd = new Map();
      for (const e of [...magic, ...equip]) if (e.name && !srd.has(e.name.toLowerCase()))
        srd.set(e.name.toLowerCase(), { name: e.name, category: e.equipment_category?.name || e.gear_category?.name || "", rarity: e.rarity?.name || "",
          desc: [...(e.desc || []), ...(e.special || [])].join("\n").slice(0, 700) });
      return srd;
    }));
}

const COINS = [["pp", "◈"], ["gp", "◉"], ["ep", "◈"], ["sp", "◎"], ["cp", "○"]];
const wins = {};   // token id -> { w, off }
/** Open the inventory window for a token. pcId = the PC's sheet id (sheet-backed list), else the token keeps its own. */
export function openInventory({ tokenId, name, pcId, isGM, x = 140, y = 100 }) {
  let rec = wins[tokenId];
  if (!rec) {
    const w = floatWindow({ id: "inv-" + tokenId, title: "Inventory", x, y });
    w.body.classList.add("tokwin", "invwin");
    rec = wins[tokenId] = { w, off: null };
    w.el.addEventListener("fwin-close", () => { rec.off?.(); rec.off = null; });
  }
  const { w } = rec;
  w.el.querySelector(".fwin-title").textContent = `${name || "Token"} · Inventory`;
  const path = pcId ? `characters/pcs/${pcId}/inventory` : `tokens/${tokenId}/inventory`;
  const run = (fn) => (pcId ? txnAt(path, fn) : txn(path, fn));
  const keyOf = () => "i" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const asObj = (cur) => Object.fromEntries(entries(cur));   // the sheet may hold an array; keys stay as they are
  const coinPath = pcId ? `characters/pcs/${pcId}/coin_purse` : `tokens/${tokenId}/coin_purse`;
  const runCoin = (k, fn) => (pcId ? txnAt(`${coinPath}/${k}`, fn) : txn(`${coinPath}/${k}`, fn));
  let data = null, coins = null;

  const draw = () => {
    if (w.el.hidden) return;
    const keep = w.body.contains(document.activeElement) ? document.activeElement.id : "";
    const draft = Object.fromEntries(["name", "qty", "desc"].map((k) => [k, w.body.querySelector("#inv-" + k)?.value]));
    const rows = entries(data).map(([key, it]) => {
      const s = srd?.get(String(it.name).toLowerCase()), qty = Number(it.qty ?? 1) || 1;
      const desc = it.desc || s?.desc || "", cat = it.category || s?.category || "", rar = s?.rarity || "";
      return `<div class="inv-item${rar ? " r-" + rar.toLowerCase().replace(/[^a-z]+/g, "-") : ""}" data-k="${esc(key)}" title="${esc(desc)}">
        <span class="inv-name">${esc(it.name)}</span>${cat || rar ? `<span class="inv-cat">${esc(rar || cat)}</span>` : ""}
        ${isGM ? `<span class="inv-q"><button data-a="dec" title="One less">−</button><b>×${qty}</b><button data-a="inc" title="One more">+</button></span><button data-a="del" title="Remove">✕</button>` : qty > 1 ? `<b class="inv-q">×${qty}</b>` : ""}
        ${it.notes ? `<div class="inv-note">${esc(it.notes)}</div>` : ""}</div>`;
    }).join("");
    const coinRow = `<div class="inv-coins">${COINS.map(([k, i]) => `<div class="coin ${k}">${isGM ? `<button data-c="${k}" data-d="-1" title="Spend ${k} (Shift: 10)">−</button>` : ""}${i} ${Number(coins?.[k] || 0)}${k}${isGM ? `<button data-c="${k}" data-d="1" title="Add ${k} (Shift: 10)">+</button>` : ""}</div>`).join("")}</div>`;
    w.body.innerHTML = coinRow + `<div class="inv-list">${rows || '<div class="inv-empty">Nothing carried.</div>'}</div>` + (isGM
      ? `<div class="inv-add"><input id="inv-name" list="inv-names" placeholder="Add item: SRD name or anything" autocomplete="off" maxlength="80">
         <input id="inv-qty" type="number" min="1" value="1" title="Quantity" style="width:3.4rem"><button data-a="add">Add</button>
         <textarea id="inv-desc" rows="2" maxlength="700" placeholder="Description (optional): shows as a tooltip"></textarea>
         <datalist id="inv-names">${srd ? [...srd.values()].map((i) => `<option value="${esc(i.name)}">`).join("") : ""}</datalist></div>` : "");
    for (const [k, v] of Object.entries(draft)) if (v != null) w.body.querySelector("#inv-" + k).value = v;
    if (keep) w.body.querySelector("#" + keep)?.focus();
  };
  const add = async () => {
    const nameEl = w.body.querySelector("#inv-name"), nm = nameEl.value.trim().slice(0, 80);
    const qty = Math.max(1, Math.min(9999, parseInt(w.body.querySelector("#inv-qty").value, 10) || 1)), desc = w.body.querySelector("#inv-desc").value.trim().slice(0, 700);
    if (!nm) return;
    nameEl.value = ""; w.body.querySelector("#inv-qty").value = 1; w.body.querySelector("#inv-desc").value = "";
    const canon = srd?.get(nm.toLowerCase())?.name || nm;
    try {
      await run((cur) => {
        const o = asObj(cur), hit = Object.entries(o).find(([, it]) => String(it.name).toLowerCase() === canon.toLowerCase());
        if (hit) { hit[1].qty = (Number(hit[1].qty ?? 1) || 1) + qty; if (desc && !hit[1].desc) hit[1].desc = desc; }
        else o[keyOf()] = { name: canon, qty, ...(desc ? { desc } : {}), given_by: "GM", given_at: Date.now() };
        return o;
      });
    } catch (err) { console.warn("Inventory not saved", err); }
  };
  w.body.onclick = async (e) => {
    const c = e.target.closest("[data-c]");
    if (c) {   // coins: − / + one at a time, Shift = 10, never below 0
      const d = +c.dataset.d * (e.shiftKey ? 10 : 1);
      try { await runCoin(c.dataset.c, (cur) => Math.max(0, (Number(cur) || 0) + d)); } catch (err) { console.warn("Coins not saved", err); }
      return;
    }
    const b = e.target.closest("[data-a]"); if (!b) return;
    if (b.dataset.a === "add") return add();
    const key = b.closest(".inv-item")?.dataset.k; if (!key) return;
    const d = { inc: 1, dec: -1, del: -Infinity }[b.dataset.a];
    try {
      await run((cur) => {
        const o = asObj(cur); if (!o[key]) return o;
        const q = (Number(o[key].qty ?? 1) || 1) + d;
        if (q <= 0) delete o[key]; else o[key].qty = q;
        return Object.keys(o).length ? o : null;
      });
    } catch (err) { console.warn("Inventory not saved", err); }
  };
  w.body.onkeydown = (e) => { e.stopPropagation(); if (e.key === "Enter" && e.target.id === "inv-name") { e.preventDefault(); add(); } };

  w.show();
  rec.off?.();
  draw();
  const sub = pcId ? watchAt : watch, offItems = sub(path, (v) => { data = v; draw(); }), offCoins = sub(coinPath, (v) => { coins = v; draw(); });
  rec.off = () => { offItems(); offCoins(); };
  loadSrd().then(draw);
}
