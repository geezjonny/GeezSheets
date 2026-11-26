// Small shared pieces of the companion's interface: escaping, rows, bottom sheets, help and messages.
import { HELP, ask } from './companion-help.js';
export { ask };
export const $ = (s, root = document) => root.querySelector(s);
export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const MOJIBAKE = [['â€”', '—'], ['â€™', '’'], ['â€œ', '“'], ['â€\u009d', '”'], ['â€“', '–'], ['�', '—']];
export const T = (s) => esc(MOJIBAKE.reduce((text, [bad, good]) => text.replaceAll(bad, good), String(s ?? '')));
export const bon = (n) => (Number(n) >= 0 ? '+' : '') + Number(n || 0);
export const rules = (t) => (Array.isArray(t) ? t : [t]).filter(Boolean).map((x) => `<p class="rule">${T(x)}</p>`).join('');

// Which folded rows are open. Kept outside the page so a live update never snaps them shut.
export const opened = new Set();
document.addEventListener('toggle', (e) => { const key = e.target.dataset?.k; if (key) opened[e.target.open ? 'add' : 'delete'](key); }, true);
export const fold = (key, summary, body, cls = '') => `<details class="${cls}" data-k="${esc(key)}" ${opened.has(key) ? 'open' : ''}><summary>${summary}</summary>${body}</details>`;

// One row: name and a short line, tap for the full text, with at most one button on the right.
export function item({ key, title, sub = '', body = '', side = '', search = '' }) {
  const label = `<span class="item-text"><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</span>`;
  return `<div class="item" ${search ? `data-search="${esc(search.toLowerCase())}"` : ''}>${body ? fold(key, label, body) : label}${side ? `<div class="item-side">${side}</div>` : ''}</div>`;
}
export const card = (title, body, extra = '', help = '') => (body ? `<section class="card">${title ? `<h2><b>${title}${ask(help)}</b>${extra ? `<span>${extra}</span>` : ''}</h2>` : ''}${body}</section>` : '');
document.addEventListener('click', (e) => {
  const key = e.target.closest?.('[data-help]')?.dataset.help;
  if (key && HELP[key]) sheet(HELP[key][0], `<p class="answer">${HELP[key][1]}</p>`);
});

// A bottom sheet on the native dialog, so Escape, the phone's Back gesture and focus handling come free.
export function sheet(title, html, { locked = false, className = '' } = {}) {
  const dialog = document.createElement('dialog');
  dialog.className = `sheet ${className}`;
  // Focus starts on Close unless the sheet asks for a field, so a "?" in the title is not highlighted on opening.
  const close = `<button class="icon" data-close aria-label="Close" ${/\sautofocus/.test(html) ? '' : 'autofocus'}>✕</button>`;
  dialog.innerHTML = `<div class="sheet-head"><h2>${title}</h2>${locked ? '' : close}</div><div class="sheet-body">${html}</div>`;
  dialog.addEventListener('click', (e) => { if (!locked && (e.target === dialog || e.target.closest('[data-close]'))) dialog.close(); });
  if (locked) dialog.addEventListener('cancel', (e) => e.preventDefault());
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}

// A short message, optionally with Undo.
export function toast(html, undo) {
  const el = document.createElement('div'); el.className = 'toast'; el.innerHTML = `<span>${html}</span>`;
  if (undo) {
    const button = document.createElement('button'); button.textContent = 'Undo';
    button.onclick = async () => { el.remove(); try { await undo(); toast('Undone.'); } catch (e) { toast('Could not undo: ' + esc(e.message)); } };
    el.append(button);
  }
  // Open sheets sit above the page, so a message raised from one has to live inside it.
  ([...document.querySelectorAll('dialog[open]')].pop() || $('#toasts')).append(el);
  setTimeout(() => el.remove(), undo ? 8000 : 4500);
}
