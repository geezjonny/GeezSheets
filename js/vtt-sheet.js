// vtt-sheet.js — compact character sheet drawn from characters/pcs/<id> (GeezSheets schema).
// Every stat, skill, initiative and attack is a roll button; HP buttons write combat/hp_current.
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const modOf = (score) => Math.floor((Number(score) - 10) / 2);
const fmt = (n) => (n >= 0 ? "+" : "") + n;

export function renderSheet(body, c, { onRoll, onHp }) {
  const cb = c.combat || {}, st = c.stats || {};
  const hp = Number(cb.hp_current ?? 0), max = Number(cb.hp_max ?? 1) || 1, pct = clamp(hp / max, 0, 1);
  const sc = c.spellcasting;
  const sub = [c.species, c.class && `${c.class} ${c.level || ""}`.trim(), c.subclass].filter(Boolean).join(", ");
  body.innerHTML = `
    ${sub ? `<div class="muted">${esc(sub)}</div>` : ""}
    <div class="item">
      <div class="flex-row"><span class="muted">Hit points</span><b style="font-size:15px">${hp} / ${max}${cb.temp_hp ? ` <span class="muted">+${esc(cb.temp_hp)}</span>` : ""}</b></div>
      <div class="hpbar" style="margin:6px 0"><div style="width:${pct * 100}%;background:${pct > .5 ? "#16a34a" : pct > .25 ? "#ca8a04" : "#dc2626"}"></div></div>
      <div class="row"><input type="number" data-hp-amt value="1" min="1" style="width:64px"><button data-hp="-1" style="flex:1;color:#fca5a5">Damage</button><button data-hp="1" style="flex:1;color:#86efac">Heal</button></div>
    </div>
    <div class="grid-3">
      <div class="stat"><small>AC</small><b>${esc(cb.ac ?? "–")}</b></div>
      <div class="stat"><small>Speed</small><b>${esc(cb.speed ?? "–")}</b></div>
      <div class="stat" data-roll="20" data-mod="${Number(cb.initiative_bonus) || 0}" data-label="Initiative" title="Roll initiative"><small>Init</small><b>${fmt(Number(cb.initiative_bonus) || 0)}</b></div>
    </div>
    <div class="grid-3">${["str", "dex", "con", "int", "wis", "cha"].map(k => `<div class="stat" data-roll="20" data-mod="${modOf(st[k] ?? 10)}" data-label="${k.toUpperCase()}"><small>${k}</small><b>${esc(st[k] ?? "–")}</b><span>${fmt(modOf(st[k] ?? 10))}</span></div>`).join("")}</div>
    ${(c.attacks || []).length ? `<h3>Attacks</h3>${c.attacks.map(a => `<div class="item flex-row"><span><b>${esc(a.name)}</b><br><span class="muted">${esc(a.damage || "")} ${esc(a.damage_type || "")}</span></span>${a.to_hit ? `<button class="primary" data-roll="20" data-mod="${parseInt(a.to_hit) || 0}" data-label="${esc(a.name)}">${esc(a.to_hit)}</button>` : ""}</div>`).join("")}` : ""}
    ${Object.keys(c.skills || {}).length ? `<details><summary class="muted" style="cursor:pointer">Skills</summary><div class="grid-2" style="margin-top:6px">${Object.entries(c.skills).sort((a, b) => (b[1].proficient - a[1].proficient) || a[0].localeCompare(b[0])).map(([k, v]) => `<div class="stat" style="text-align:left;padding:4px 7px" data-roll="20" data-mod="${v.bonus || 0}" data-label="${esc(k.replace(/_/g, " "))}"><span style="color:${v.proficient ? "#fff" : "#8b8b94"}">${v.proficient ? "●" : "○"} ${esc(k.replace(/_/g, " "))}</span> <span style="float:right">${fmt(v.bonus || 0)}</span></div>`).join("")}</div></details>` : ""}
    ${sc?.spells?.length ? `<details><summary class="muted" style="cursor:pointer">Spells${sc.spell_save_dc ? `, save DC ${esc(sc.spell_save_dc)}` : ""}</summary>
      <div class="row" style="flex-wrap:wrap;margin:6px 0">${(sc.slots || []).map((n, i) => n ? `<span class="val-badge">L${i}: ${n - (sc.slots_used?.[i] || 0)}/${n}</span>` : "").join("")}</div>
      ${sc.spells.map(s => `<div class="item" style="margin-bottom:4px"><b>${esc(s.name)}</b> <span class="muted">${s.level ? "L" + s.level : "cantrip"}${s.concentration ? ", conc." : ""}</span>${s.cast_time ? `<br><span class="muted">${esc(s.cast_time)}${s.damage ? ", " + esc(s.damage) : ""}</span>` : ""}</div>`).join("")}</details>` : ""}`;
  const amt = body.querySelector("[data-hp-amt]");
  body.querySelectorAll("[data-hp]").forEach(b => b.onclick = () => onHp(clamp(hp + Number(b.dataset.hp) * (+amt.value || 0), 0, max)));
  body.querySelectorAll("[data-roll]").forEach(b => b.onclick = () => onRoll(+b.dataset.roll, +b.dataset.mod || 0, b.dataset.label || ""));
}
