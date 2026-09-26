// Swatch Bar -- a reusable "pick one of several small preview tiles"
// widget. Extracted from mapeditor-layers.html, which had three
// near-identical copies of this (terrain, prop, stamp swatch bars) before
// this file existed. No DOM ids, CSS class names beyond one caller-supplied
// override, or global state are assumed -- every dependency is an explicit
// parameter, so this drops into a different editor (2D or 3D) without
// modification. Vanilla DOM only; no framework, no THREE dependency.

/**
 * Creates a swatch-bar widget: a row of clickable preview tiles inside a
 * container element, with one active at a time. Call render() once to draw
 * it, and again any time the underlying item list or active selection
 * changes.
 * @param {Object} opts
 * @param {HTMLElement} opts.container - cleared and repopulated on every render() call.
 * @param {() => Array<any>} opts.getItems - returns the current list of items to show.
 * @param {(item: any) => boolean} opts.isActive - whether this item is the currently-selected one.
 * @param {(item: any) => string} opts.renderItem - the swatch element's full innerHTML for this item. Structure is entirely up to the caller -- a preview+label pair (mapeditor-layers.html's terrain/prop convention: `<div class="pd-item-inner" style="...">...</div><div class="pd-item-label">${label}</div>`), or just plain text (its stamp bar: no preview split at all, just the emoji).
 * @param {(item: any) => string} [opts.itemClass] - CSS class(es) for each swatch element, given the item (so e.g. a stamp can get an extra class a terrain swatch doesn't). Defaults to always returning 'pd-item', mapeditor-layers.html's own convention -- pass your own if you're not reusing that stylesheet.
 * @param {(item: any) => void} opts.onSelect - called when a swatch is clicked.
 * @returns {{render: () => void}}
 */
export function createSwatchBar({ container, getItems, isActive, renderItem, itemClass = () => 'pd-item', onSelect }) {
  function render() {
    container.innerHTML = '';
    for (const item of getItems()) {
      const el = document.createElement('div');
      el.className = itemClass(item) + (isActive(item) ? ' active' : '');
      el.innerHTML = renderItem(item);
      el.onclick = () => onSelect(item);
      container.appendChild(el);
    }
  }
  return { render };
}

/**
 * A small localStorage-backed list of user-added custom swatch entries --
 * e.g. a custom terrain or prop name typed in via an "add" prompt, on top
 * of whatever fixed/base list already exists. Not every swatch bar needs
 * this (mapeditor-layers.html's stamp bar is a fixed list with no add
 * flow at all) -- only wire this up where "add a custom one" is wanted.
 * @param {string} storageKey
 * @param {string[]} [defaults] - starting list if nothing is saved under storageKey yet.
 * @returns {{items: string[], add: (id: string) => boolean, save: () => void}}
 */
export function createCustomSwatchList(storageKey, defaults = []) {
  let items;
  try { items = JSON.parse(localStorage.getItem(storageKey)) || defaults.slice(); }
  catch { items = defaults.slice(); }

  function save() { localStorage.setItem(storageKey, JSON.stringify(items)); }
  /** Adds id if not already present. Returns true if it was actually added. */
  function add(id) {
    if (items.includes(id)) return false;
    items.push(id);
    save();
    return true;
  }
  return { items, add, save };
}

/**
 * Sanitizes free-typed swatch-name input the same way mapeditor-layers.html
 * always has: lowercase, spaces to underscores, strip anything outside
 * a-z0-9_-. Used for both terrain and prop "add a custom one" prompts,
 * since both resolve to a filename (./textures/<name>.png,
 * ./props/<name>.png) where stray characters would break the lookup.
 * @param {string} raw
 * @returns {string}
 */
export function sanitizeSwatchName(raw) {
  return (raw || '').trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_-]/g, '');
}
