// GM command console: type short commands instead of clicking through windows. Also exposed as window.vtt.run("...") in the browser console.
import { put, patch } from "../store.js";
import { S } from "./state.js";
import { floatWindow, addBarButton } from "./ui.js";
import { isPcToken } from "./draw.js";
import { parse, matchIds } from "./cmdparse.js";
import { callRoll } from "./rollcall.js";
import { startInitiative, nextTurn, endInitiative } from "./initiative.js";

const HELP = `roll <who> <what> [dc15] [adv|dis] [show] [title]   who: all | pcs | npcs | Name,Name
   e.g. roll all dex dc15 · roll pcs wis save dc13 adv · roll Aria stealth dc12 · roll all init
init start | next | end
move <token> <col>,<row>
open | close | toggle <object name>
hp <token> -5 | +3 | =10`;
const tokenEntries = () => Object.entries(S.tokens || {}).map(([id, t]) => [id, t.label || id]);

function resolveWho(names) {
  const ids = new Set();
  for (const n of names) {
    const k = n.toLowerCase();
    if (k === "all" || k === "everyone") Object.keys(S.tokens).forEach((i) => ids.add(i));
    else if (k === "pcs" || k === "players") Object.entries(S.tokens).forEach(([i, t]) => isPcToken(t) && ids.add(i));
    else if (k === "npcs" || k === "enemies") Object.entries(S.tokens).forEach(([i, t]) => !isPcToken(t) && ids.add(i));
    else matchIds(n, tokenEntries()).forEach((i) => ids.add(i));
  }
  return [...ids];
}
const oneToken = (name) => { const m = matchIds(name, tokenEntries()); return m.length === 1 ? m[0] : m.length ? `${m.length} tokens match "${name}"` : `no token "${name}"`; };

export async function run(text) {
  const c = parse(text);
  if (c.error) return "✗ " + c.error;
  if (c.cmd === "help") return HELP;
  if (c.cmd === "roll") {
    const ids = resolveWho(c.who); if (!ids.length) return `✗ no tokens match ${c.who.join(", ")}`;
    await callRoll({ kind: c.kind, key: c.key, title: c.title, dc: c.dc, showDc: c.showDc, mode: c.mode, tokenIds: ids });
    return `✓ roll call sent to ${ids.length} token${ids.length > 1 ? "s" : ""}: ${c.kind === "init" ? "initiative" : c.key.toUpperCase() + (c.kind === "save" ? " save" : c.kind === "skill" ? " skill" : " check")}${c.dc ? " DC " + c.dc : ""}${c.mode !== "normal" ? " (" + c.mode + ")" : ""}`;
  }
  if (c.cmd === "init") { await ({ start: startInitiative, next: nextTurn, end: endInitiative }[c.sub])(); return `✓ initiative ${c.sub}`; }
  if (c.cmd === "move") {
    const id = oneToken(c.target); if (!S.tokens[id]) return "✗ " + id;
    await patch({ [`tokens/${id}/x`]: c.col * 40 + 20, [`tokens/${id}/y`]: c.row * 40 + 20 }); return `✓ moved ${S.tokens[id].label || id} to ${c.col},${c.row}`;
  }
  if (c.cmd === "state") {
    const ids = matchIds(c.target, Object.entries(S.objects || {}).map(([id, o]) => [id, o.label]));
    if (!ids.length) return `✗ no object "${c.target}"`;
    for (const id of ids) {
      const o = S.objects[id], states = o.kind === "door" ? ["open", "closed"] : ["on", "off"], want = c.op === "toggle" ? (o.state === states[0] ? states[1] : states[0]) : c.op === "close" ? (states.includes("closed") ? "closed" : "off") : (states.includes("open") ? "open" : "on");
      await put(`objects/${id}/state`, want);
    }
    return `✓ ${c.op} ${ids.map((i) => S.objects[i].label || i).join(", ")}`;
  }
  if (c.cmd === "hp") {
    const id = oneToken(c.target), t = S.tokens[id]; if (!t) return "✗ " + id;
    if (t.hp == null) return `✗ ${t.label || id} has no HP on the map (PC hit points live on their sheet)`;
    const hp = Math.max(0, Math.min(t.max ?? Infinity, c.op === "=" ? c.n : t.hp + (c.op === "-" ? -c.n : c.n)));
    await put(`tokens/${id}/hp`, hp); return `✓ ${t.label || id} HP ${hp}${t.max ? "/" + t.max : ""}`;
  }
}

export function initCmd() {
  if (!S.isGM) return;
  const win = floatWindow({ id: "cmd", title: "Command", x: 60, y: 420, hidden: true });
  win.body.innerHTML = `<pre class="cmd-log" style="margin:0 0 6px;max-height:180px;overflow:auto;white-space:pre-wrap;font:13px/1.35 monospace"></pre><input class="cmd-in" placeholder="roll all dex dc15   (help for more)" style="width:100%;box-sizing:border-box;font:14px monospace" autocomplete="off" spellcheck="false">`;
  const log = win.body.querySelector(".cmd-log"), input = win.body.querySelector(".cmd-in"), hist = []; let hi = 0;
  const say = (s) => { log.textContent += s + "\n"; log.scrollTop = log.scrollHeight; };
  say("Type help for commands.");
  input.addEventListener("keydown", async (e) => {
    e.stopPropagation();
    if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); hi = Math.max(0, Math.min(hist.length, hi + (e.key === "ArrowUp" ? -1 : 1))); input.value = hist[hi] || ""; }
    if (e.key === "Escape") win.hide();
    if (e.key !== "Enter" || !input.value.trim()) return;
    const text = input.value.trim(); hist.push(text); hi = hist.length; input.value = ""; say("> " + text);
    try { say(await run(text)); } catch (err) { say("✗ " + (err?.message || err)); }
  });
  const toggle = () => { if (win.visible()) win.hide(); else { win.show(); input.focus(); } };
  addBarButton({ id: "cmd", icon: "⌨", label: "Command", title: "Command line (press / to open)", gmOnly: true, onClick: toggle });
  document.addEventListener("keydown", (e) => { if (e.key === "/" && !e.ctrlKey && !e.metaKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && !e.target.isContentEditable) { e.preventDefault(); if (!win.visible()) win.show(); input.focus(); } });
  window.vtt = { run };
}
