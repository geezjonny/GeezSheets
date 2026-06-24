// glossary.js — hover tooltip system for D&D terms
// Import this in any page to get instant inline definitions
// Usage:
//   import { registerTerms, showGlossaryTooltip } from "./js/glossary.js";
//   registerTerms(document.getElementById("sheet-view")); // auto-tags known terms
//   showGlossaryTooltip("Fireball", anchorEl);            // manual trigger

import {
  findSpell, findCondition, findMonster, findEquipment,
  findMagicItem, findFeat, findWeaponProperty, findDamageType,
  findRace, findBackground, findClass, searchAll,
} from "./data.js";

// ── Tooltip element (singleton) ───────────────────────────────────────────────
let _tooltipEl = null;
let _hideTimer  = null;

function getTooltip() {
  if (_tooltipEl) return _tooltipEl;
  _tooltipEl = document.createElement("div");
  _tooltipEl.id = "glossary-tooltip";
  _tooltipEl.style.cssText = [
    "position:fixed", "z-index:9999", "pointer-events:none",
    "max-width:280px", "min-width:180px",
    "background:var(--panel,#1a1510)",
    "border:1px solid var(--gold,#c8a84b)",
    "border-radius:6px", "padding:10px 12px",
    "box-shadow:0 8px 32px rgba(0,0,0,.7)",
    "opacity:0", "transition:opacity .15s",
    "font-family:'IM Fell English',serif",
  ].join(";");
  document.body.appendChild(_tooltipEl);
  return _tooltipEl;
}

function showTooltip(el, content) {
  clearTimeout(_hideTimer);
  const tt = getTooltip();
  tt.innerHTML = content;
  tt.style.opacity = "0";
  tt.style.display = "block";

  // Position near anchor
  const r = el.getBoundingClientRect();
  const ttW = 280, ttH = 160;
  let left = r.left + r.width / 2 - ttW / 2;
  let top  = r.top - ttH - 8;
  if (top < 8) top = r.bottom + 8;
  if (left < 8) left = 8;
  if (left + ttW > window.innerWidth - 8) left = window.innerWidth - ttW - 8;
  tt.style.left = left + "px";
  tt.style.top  = top  + "px";

  requestAnimationFrame(() => { tt.style.opacity = "1"; });
}

function hideTooltip(delay = 120) {
  _hideTimer = setTimeout(() => {
    const tt = getTooltip();
    tt.style.opacity = "0";
    setTimeout(() => { tt.style.display = "none"; }, 150);
  }, delay);
}

// ── Content builders ──────────────────────────────────────────────────────────
const CSS = {
  type:  "font-family:'Cinzel',serif;font-size:.58rem;letter-spacing:.1em;text-transform:uppercase;color:var(--gold,#c8a84b);margin-bottom:4px",
  name:  "font-family:'Cinzel',serif;font-size:.85rem;font-weight:700;color:var(--text,#d4c49a);margin-bottom:5px",
  meta:  "font-size:.65rem;color:var(--dim,#6b5a38);font-family:'JetBrains Mono',monospace;margin-bottom:5px",
  desc:  "font-size:.75rem;color:var(--text,#d4c49a);line-height:1.5;font-style:italic",
  tag:   "display:inline-block;font-family:'Cinzel',serif;font-size:.55rem;padding:1px 6px;border-radius:999px;border:1px solid;margin-right:4px;margin-bottom:4px",
};

function descSnippet(desc, max = 140) {
  const text = Array.isArray(desc) ? desc[0] : (desc || "");
  return text.length > max ? text.slice(0, max).trimEnd() + "…" : text;
}

function buildSpellContent(s) {
  const school  = s.school?.name || "";
  const level   = s.level === 0 ? "Cantrip" : `Level ${s.level}`;
  const castTime = s.casting_time || "";
  const range   = s.range || "";
  const conc    = s.concentration ? " · Concentration" : "";
  const ritual  = s.ritual        ? " · Ritual"        : "";
  return `
    <div style="${CSS.type}">✨ Spell</div>
    <div style="${CSS.name}">${s.name}</div>
    <div style="${CSS.meta}">${level} ${school}${conc}${ritual}</div>
    <div style="${CSS.meta}">Cast: ${castTime} · Range: ${range}</div>
    <div style="${CSS.desc}">${descSnippet(s.desc)}</div>`;
}

function buildConditionContent(c) {
  return `
    <div style="${CSS.type}">⚠ Condition</div>
    <div style="${CSS.name}">${c.name}</div>
    <div style="${CSS.desc}">${descSnippet(c.desc)}</div>`;
}

function buildMonsterContent(m) {
  const cr   = m.challenge_rating ?? "?";
  const type = m.type || "";
  const size = m.size || "";
  const hp   = m.hit_points ?? "?";
  const ac   = m.armor_class ?? "?";
  return `
    <div style="${CSS.type}">👹 Monster</div>
    <div style="${CSS.name}">${m.name}</div>
    <div style="${CSS.meta}">${size} ${type} · CR ${cr}</div>
    <div style="${CSS.meta}">HP ${hp} · AC ${ac}</div>`;
}

function buildEquipmentContent(e) {
  const cat  = e.equipment_category?.name || e.gear_category?.name || "";
  const cost = e.cost ? `${e.cost.quantity} ${e.cost.unit}` : "";
  const wt   = e.weight ? `${e.weight} lb` : "";
  const dmg  = e.damage ? `${e.damage.damage_dice} ${e.damage.damage_type?.name || ""}` : "";
  return `
    <div style="${CSS.type}">⚔ Equipment</div>
    <div style="${CSS.name}">${e.name}</div>
    <div style="${CSS.meta}">${cat}${cost ? " · " + cost : ""}${wt ? " · " + wt : ""}</div>
    ${dmg ? `<div style="${CSS.meta}">Damage: ${dmg}</div>` : ""}
    ${e.desc?.length ? `<div style="${CSS.desc}">${descSnippet(e.desc)}</div>` : ""}`;
}

function buildMagicItemContent(m) {
  const rarity = m.rarity?.name || "";
  return `
    <div style="${CSS.type}">✦ Magic Item</div>
    <div style="${CSS.name}">${m.name}</div>
    <div style="${CSS.meta}">${rarity}</div>
    <div style="${CSS.desc}">${descSnippet(m.desc)}</div>`;
}

function buildFeatContent(f) {
  return `
    <div style="${CSS.type}">★ Feat</div>
    <div style="${CSS.name}">${f.name}</div>
    <div style="${CSS.desc}">${descSnippet(f.desc)}</div>`;
}

function buildWeaponPropertyContent(p) {
  return `
    <div style="${CSS.type}">⚙ Weapon Property</div>
    <div style="${CSS.name}">${p.name}</div>
    <div style="${CSS.desc}">${descSnippet(p.desc)}</div>`;
}

function buildDamageTypeContent(d) {
  return `
    <div style="${CSS.type}">💥 Damage Type</div>
    <div style="${CSS.name}">${d.name}</div>
    <div style="${CSS.desc}">${descSnippet(d.desc)}</div>`;
}

function buildRaceContent(r) {
  const speed = r.speed ? `Speed ${r.speed} ft` : "";
  const asi   = (r.ability_bonuses || []).map(a => `+${a.bonus} ${a.ability_score?.name}`).join(", ");
  return `
    <div style="${CSS.type}">🧝 Race</div>
    <div style="${CSS.name}">${r.name}</div>
    ${speed ? `<div style="${CSS.meta}">${speed}</div>` : ""}
    ${asi ? `<div style="${CSS.meta}">Ability bonuses: ${asi}</div>` : ""}`;
}

function buildClassContent(c) {
  const hd  = c.hit_die ? `d${c.hit_die}` : "";
  return `
    <div style="${CSS.type}">⚔ Class</div>
    <div style="${CSS.name}">${c.name}</div>
    ${hd ? `<div style="${CSS.meta}">Hit Die: ${hd}</div>` : ""}`;
}

// ── Lookup a term and return tooltip HTML ─────────────────────────────────────
const LOOKUP_CHAIN = [
  { fn: findSpell,          build: buildSpellContent          },
  { fn: findCondition,      build: buildConditionContent      },
  { fn: findEquipment,      build: buildEquipmentContent      },
  { fn: findMagicItem,      build: buildMagicItemContent      },
  { fn: findFeat,           build: buildFeatContent           },
  { fn: findWeaponProperty, build: buildWeaponPropertyContent },
  { fn: findDamageType,     build: buildDamageTypeContent     },
  { fn: findMonster,        build: buildMonsterContent        },
  { fn: findRace,           build: buildRaceContent           },
  { fn: findClass,          build: buildClassContent          },
];

const _termCache = {};

async function lookupTerm(term) {
  if (_termCache[term] !== undefined) return _termCache[term];
  for (const { fn, build } of LOOKUP_CHAIN) {
    const result = await fn(term);
    if (result) {
      const html = build(result);
      _termCache[term] = html;
      return html;
    }
  }
  _termCache[term] = null;
  return null;
}

// ── Public API ────────────────────────────────────────────────────────────────

// Show tooltip for a specific term at an anchor element
export async function showGlossaryTooltip(term, anchorEl) {
  const content = await lookupTerm(term);
  if (!content) return;
  showTooltip(anchorEl, content);
}

// Manually hide
export function hideGlossaryTooltip() {
  hideTooltip(0);
}

// Register a 🔍 icon next to known terms in a container
// Known terms are wrapped in <span class="glossary-term"> with hover behaviour
export async function registerTerms(containerEl) {
  if (!containerEl) return;

  // Find all text nodes
  const walker = document.createTreeWalker(containerEl, NodeFilter.SHOW_TEXT);
  const nodes  = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  // Simple term patterns to look for
  const termPattern = /\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)\b/g;

  for (const node of nodes) {
    const text = node.nodeValue;
    if (!text.trim() || node.parentElement.closest(".glossary-term")) continue;

    // Quick pre-check — avoid expensive lookups on obviously non-term text
    if (!termPattern.test(text)) continue;
    termPattern.lastIndex = 0;

    let match;
    const fragments = [];
    let lastIdx = 0;

    while ((match = termPattern.exec(text)) !== null) {
      const term    = match[1];
      const content = await lookupTerm(term);
      if (!content) continue;

      // Text before match
      if (match.index > lastIdx) {
        fragments.push(document.createTextNode(text.slice(lastIdx, match.index)));
      }

      // Wrapped term span
      const span = document.createElement("span");
      span.className = "glossary-term";
      span.style.cssText = "border-bottom:1px dotted var(--gold,#c8a84b);cursor:help;";
      span.textContent = term;
      span.addEventListener("mouseenter", () => showTooltip(span, content));
      span.addEventListener("mouseleave", () => hideTooltip());
      fragments.push(span);

      lastIdx = match.index + match[0].length;
    }

    if (!fragments.length) continue;

    // Remaining text
    if (lastIdx < text.length) {
      fragments.push(document.createTextNode(text.slice(lastIdx)));
    }

    // Replace text node with fragments
    const parent = node.parentNode;
    for (const frag of fragments) parent.insertBefore(frag, node);
    parent.removeChild(node);
  }
}

// ── Search widget ─────────────────────────────────────────────────────────────
// Creates a floating search box (🔍 button in HUD)
let _searchEl = null;

export function toggleGlossarySearch() {
  if (_searchEl) { _searchEl.remove(); _searchEl = null; return; }

  _searchEl = document.createElement("div");
  _searchEl.style.cssText = [
    "position:fixed", "top:52px", "right:16px", "z-index:500",
    "width:320px", "background:var(--panel,#1a1510)",
    "border:1px solid var(--gold,#c8a84b)", "border-radius:8px",
    "padding:12px", "box-shadow:0 8px 32px rgba(0,0,0,.7)",
  ].join(";");

  _searchEl.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <span style="font-family:'Cinzel',serif;font-size:.7rem;color:var(--gold,#c8a84b);letter-spacing:.1em">📖 ALMANAC</span>
      <button id="gls-close" style="margin-left:auto;border:none;background:transparent;color:var(--dim,#6b5a38);font-size:14px;cursor:pointer">✕</button>
    </div>
    <input id="gls-input" type="text" placeholder="Search spells, monsters, items…"
      style="width:100%;background:rgba(255,255,255,.04);border:1px solid var(--border,#3d2e1a);border-radius:4px;color:var(--text,#d4c49a);font-family:'IM Fell English',serif;font-size:13px;padding:7px 10px;outline:none">
    <div id="gls-results" style="margin-top:8px;display:flex;flex-direction:column;gap:4px;max-height:320px;overflow-y:auto"></div>`;

  document.body.appendChild(_searchEl);

  document.getElementById("gls-close").onclick = () => { _searchEl.remove(); _searchEl = null; };

  const input   = document.getElementById("gls-input");
  const results = document.getElementById("gls-results");
  let searchTimer;

  input.focus();
  input.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      const q = input.value.trim();
      if (!q) { results.innerHTML = ""; return; }
      results.innerHTML = `<div style="font-family:'Cinzel',serif;font-size:.65rem;color:var(--dim,#6b5a38)">Searching…</div>`;
      const hits = await searchAll(q, 12);
      if (!hits.length) { results.innerHTML = `<div style="font-family:'Cinzel',serif;font-size:.65rem;color:var(--dim,#6b5a38);font-style:italic">No results</div>`; return; }
      results.innerHTML = "";
      for (const { type, item } of hits) {
        const el = document.createElement("div");
        el.style.cssText = "padding:8px 10px;border-radius:4px;border:1px solid var(--border,#3d2e1a);background:rgba(255,255,255,.02);cursor:pointer;transition:background .1s";
        el.innerHTML = `
          <div style="font-family:'Cinzel',serif;font-size:.55rem;color:var(--gold,#c8a84b);letter-spacing:.08em;text-transform:uppercase">${type}</div>
          <div style="font-family:'Cinzel',serif;font-size:.78rem;color:var(--text,#d4c49a)">${item.name}</div>
          ${item.desc ? `<div style="font-size:.68rem;color:var(--dim,#6b5a38);margin-top:2px;font-style:italic">${descSnippet(Array.isArray(item.desc)?item.desc[0]:item.desc, 80)}</div>` : ""}`;
        el.onmouseenter = () => el.style.background = "rgba(200,168,75,.07)";
        el.onmouseleave = () => el.style.background = "rgba(255,255,255,.02)";
        el.onclick = async () => {
          const content = await lookupTerm(item.name);
          if (content) { showTooltip(el, content); }
        };
        results.appendChild(el);
      }
    }, 280);
  });
}
