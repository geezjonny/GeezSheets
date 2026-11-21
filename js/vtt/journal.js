// Pure journal markdown-lite parsing/filtering plus lazy browser wiring.

const safeUrl = (value) => /^(?:https?:\/\/|mailto:)/i.test(String(value || "").trim()) ? String(value).trim() : null;
const safeImageUrl = (value) => /^https?:\/\//i.test(String(value || "").trim()) ? String(value).trim() : null;

function inline(source) {
  const out = [], text = String(source ?? "");
  let i = 0, plain = "";
  const flush = () => { if (plain) { out.push({ type: "text", value: plain }); plain = ""; } };
  while (i < text.length) {
    if (text.startsWith("**", i)) {
      const end = text.indexOf("**", i + 2);
      if (end > i + 2) { flush(); out.push({ type: "strong", children: inline(text.slice(i + 2, end)) }); i = end + 2; continue; }
    }
    if (text[i] === "*") {
      const end = text.indexOf("*", i + 1);
      if (end > i + 1) { flush(); out.push({ type: "em", children: inline(text.slice(i + 1, end)) }); i = end + 1; continue; }
    }
    if (text[i] === "_") {
      const end = text.indexOf("_", i + 1);
      if (end > i + 1) { flush(); out.push({ type: "em", children: inline(text.slice(i + 1, end)) }); i = end + 1; continue; }
    }
    if (text[i] === "[") {
      const close = text.indexOf("](", i + 1), end = close < 0 ? -1 : text.indexOf(")", close + 2);
      if (close > i + 1 && end > close + 2) {
        const url = safeUrl(text.slice(close + 2, end));
        if (url) { flush(); out.push({ type: "link", href: url, children: inline(text.slice(i + 1, close)) }); i = end + 1; continue; }
      }
    }
    plain += text[i++];
  }
  flush(); return out;
}

// Returns a safe, DOM-independent AST. User text is always data, never markup.
export function parseMarkdownLite(body) {
  const lines = String(body ?? "").replace(/\r\n?/g, "\n").split("\n"), blocks = [];
  for (let i = 0; i < lines.length;) {
    const line = lines[i];
    if (/^\s*$/.test(line)) { if (blocks.length && blocks.at(-1).type !== "br") blocks.push({ type: "br" }); i++; continue; }
    const heading = line.match(/^\s*(#{1,3})\s+(.+?)\s*#*\s*$/);
    if (heading) { blocks.push({ type: "heading", level: heading[1].length, children: inline(heading[2]) }); i++; continue; }
    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) items.push(inline(lines[i++].replace(/^\s*[-*]\s+/, "")));
      blocks.push({ type: "list", items }); continue;
    }
    blocks.push({ type: "line", children: inline(line) }); i++;
  }
  while (blocks.at(-1)?.type === "br") blocks.pop();
  return blocks;
}

export function visibleJournalPages(pages, isGM = false) {
  const entries = Array.isArray(pages) ? pages.map((p, i) => [String(p?.id ?? i), p]) : Object.entries(pages || {});
  return entries.filter(([, p]) => p && (isGM || p.shared === true)).sort((a, b) => (Number(a[1].order) || 0) - (Number(b[1].order) || 0) || (Number(a[1].t) || 0) - (Number(b[1].t) || 0) || a[0].localeCompare(b[0])).map(([id, page]) => ({ id, ...page }));
}

export const journalPagesForViewer = visibleJournalPages;

function appendInline(parent, nodes, doc) {
  for (const node of nodes) {
    if (node.type === "text") parent.append(doc.createTextNode(node.value));
    else if (node.type === "strong" || node.type === "em") { const el = doc.createElement(node.type === "strong" ? "strong" : "em"); appendInline(el, node.children, doc); parent.append(el); }
    else if (node.type === "link") { const el = doc.createElement("a"); el.href = node.href; el.target = "_blank"; el.rel = "noopener noreferrer"; appendInline(el, node.children, doc); parent.append(el); }
  }
}

function renderBody(parent, body, doc) {
  for (const block of parseMarkdownLite(body)) {
    if (block.type === "br") { parent.append(doc.createElement("br")); continue; }
    if (block.type === "line") { appendInline(parent, block.children, doc); parent.append(doc.createElement("br")); continue; }
    if (block.type === "heading") { const el = doc.createElement(`h${block.level}`); appendInline(el, block.children, doc); parent.append(el); continue; }
    const list = doc.createElement("ul"); for (const item of block.items) { const li = doc.createElement("li"); appendInline(li, item, doc); list.append(li); } parent.append(list);
  }
}

export async function initJournal() {
  const [{ watch }, { put }, { S }, { floatWindow }] = await Promise.all([import("../store.js"), import("./undo.js"), import("./state.js"), import("./ui.js")]);
  const doc = document, button = doc.getElementById("journal-btn"); if (!button) return;
  let pages = {}, current = null, win = null, first = true, previous = {};
  const toast = (message) => { const el = doc.getElementById("toast"); if (!el) return; el.textContent = message; el.style.display = "block"; setTimeout(() => (el.style.display = "none"), 3500); };
  const uid = () => `j${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const renderPage = (page, target) => { target.replaceChildren(); if (!page) { target.textContent = "No shared journal pages yet."; return; } const h = doc.createElement("h2"); h.textContent = page.title || "Untitled page"; target.append(h); if (page.img) { const img = doc.createElement("img"); img.src = page.img; img.alt = page.title || "Journal illustration"; img.className = "journal-img"; target.append(img); } const body = doc.createElement("div"); body.className = "journal-body"; renderBody(body, page.body, doc); target.append(body); };
  const list = () => visibleJournalPages(pages, S.isGM);
  const open = () => {
    if (!win) { win = floatWindow({ id: "journal", title: "Journal", x: 260, y: 100, hidden: true }); win.body.className += " journal-win"; }
    win.body.replaceChildren(); const shown = list();
    if (S.isGM) {
      const controls = doc.createElement("div"); controls.className = "journal-controls";
      const add = doc.createElement("button"); add.textContent = "New page"; add.onclick = () => { current = null; edit(); }; controls.append(add); win.body.append(controls);
    }
    const nav = doc.createElement("div"); nav.className = "journal-list"; const content = doc.createElement("article"); content.className = "journal-content";
    for (const [index, page] of shown.entries()) { const row = doc.createElement("span"); const b = doc.createElement("button"); b.textContent = `${page.title || "Untitled"}${S.isGM && !page.shared ? " (private)" : ""}`; b.onclick = () => { current = page.id; renderPage(page, content); }; row.append(b); if (S.isGM) for (const [label, delta] of [["↑", -1], ["↓", 1]]) { const move = doc.createElement("button"); move.type = "button"; move.textContent = label; move.title = "Move page"; move.disabled = index + delta < 0 || index + delta >= shown.length; move.onclick = () => { const other = shown[index + delta]; put(`journal/${page.id}/order`, other.order ?? index + delta); put(`journal/${other.id}/order`, page.order ?? index); }; row.append(move); } nav.append(row); }
    win.body.append(nav, content); renderPage(shown.find((p) => p.id === current) || shown[0], content); win.show();
  };
  const edit = () => {
    if (!win) { win = floatWindow({ id: "journal", title: "Journal", x: 260, y: 100, hidden: true }); win.body.className += " journal-win"; }
    const page = current && pages[current]; win.body.replaceChildren(); const form = doc.createElement("form"); form.className = "journal-form";
    const field = (label, type, value, name) => { const l = doc.createElement("label"); l.textContent = label; const input = doc.createElement(type === "textarea" ? "textarea" : "input"); input.name = name; input.value = value || ""; if (type !== "textarea") input.type = type; l.append(input); form.append(l); return input; };
    const title = field("Title", "text", page?.title, "title"), body = field("Body (markdown-lite)", "textarea", page?.body, "body"); body.rows = 12; const img = field("Image URL (optional)", "url", page?.img, "img");
    const shared = field("Share with players", "checkbox", "", "shared"); shared.checked = !!page?.shared;
    const actions = doc.createElement("div"); actions.className = "journal-actions"; const save = doc.createElement("button"); save.type = "submit"; save.textContent = page ? "Save page" : "Create page"; actions.append(save);
    if (page) { const del = doc.createElement("button"); del.type = "button"; del.textContent = "Delete"; del.onclick = () => { if (confirm("Delete this journal page?")) { put(`journal/${current}`, null); current = null; open(); } }; actions.append(del); }
    const back = doc.createElement("button"); back.type = "button"; back.textContent = "Back"; back.onclick = open; actions.append(back); form.append(actions); form.onsubmit = (e) => { e.preventDefault(); const id = current || uid(), old = pages[id]; put(`journal/${id}`, { title: title.value.trim() || "Untitled", body: body.value, img: safeImageUrl(img.value), shared: shared.checked, order: old?.order ?? Object.keys(pages).length, t: old?.t || Date.now() }); current = id; open(); }; win.body.append(form); win.show();
  };
  button.onclick = open;
  watch("journal", (value) => { previous = pages; pages = value || {}; if (!first && !S.isGM) for (const [id, page] of Object.entries(pages)) if (page?.shared && !previous[id]?.shared) toast("New journal page"); first = false; if (win && win.visible()) open(); });
}
