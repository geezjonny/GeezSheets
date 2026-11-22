// Token picture picker. The art lives in the GeezSheets site (hosted, ~420 portraits), so nothing is copied here.
import { S } from "./state.js";
import { put } from "./undo.js";
import { floatWindow } from "./ui.js";

export const TOKEN_BASE = "https://geezjonny.github.io/GeezSheets/tokens/";
let win = null, names = null, grid, filter, target = null;
const nice = (f) => f.replace(/\.png$/, "").replace(/[_-]+/g, " ");

async function load() {
  if (names) return names;
  try { names = await (await fetch(TOKEN_BASE + "index.json")).json(); } catch (err) { console.warn("Could not load token list", err); names = []; }
  return names;
}
function render() {
  const q = filter.value.trim().toLowerCase(); grid.textContent = "";
  for (const f of (names || []).filter((n) => !q || n.toLowerCase().includes(q.replace(/\s+/g, "_"))).slice(0, 120)) {
    const b = document.createElement("button"), im = new Image(); im.loading = "lazy"; im.src = TOKEN_BASE + encodeURIComponent(f); im.alt = ""; im.width = im.height = 48;
    b.title = nice(f); b.className = "tp"; b.append(im);
    b.addEventListener("click", () => { if (target && S.tokens[target]) put(`tokens/${target}/img`, TOKEN_BASE + encodeURIComponent(f)); win.hide(); });
    grid.append(b);
  }
  if (!grid.children.length) grid.textContent = names?.length ? "No match." : "Token list unavailable (offline?).";
}
export async function openTokenPicker(tokenId) {
  target = tokenId;
  if (!win) {
    win = floatWindow({ id: "tokpic", title: "Token picture", x: 120, y: 120 });
    const st = document.createElement("style"); st.textContent = ".tp-grid{display:grid;grid-template-columns:repeat(6,52px);gap:4px;max-height:18rem;overflow:auto;margin-top:.4rem}.tp{padding:2px!important;line-height:0}.tp img{border-radius:50%;background:#0003}#win-tokpic input{width:100%}"; document.head.append(st);
    filter = document.createElement("input"); filter.placeholder = "Search (goblin, dragon, wolf…)"; filter.addEventListener("input", render);
    const clear = document.createElement("button"); clear.textContent = "Remove picture"; clear.addEventListener("click", () => { if (target) put(`tokens/${target}/img`, null); win.hide(); });
    grid = document.createElement("div"); grid.className = "tp-grid"; win.body.append(filter, clear, grid);
  }
  win.show(); filter.value = ""; grid.textContent = "Loading…"; await load(); render(); filter.focus();
}
