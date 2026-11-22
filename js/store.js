// Firebase wrapper. Everything lives under /test so campaigns stay safe.
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getDatabase, ref, onValue, set, update, get, runTransaction } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-database.js";

// Config comes from js/firebase-config.js (loaded by index.html before this module) so there is one place to change it.
const app = initializeApp(window.GEEZ_FIREBASE_CONFIG, "puzzle-proto");
const db = getDatabase(app);
const ROOT = "test/";

export const watch = (path, cb) => onValue(ref(db, ROOT + path), (s) => cb(s.val()));
// Read-only look at the main app data (outside /test), e.g. "characters/npcs".
// Characters live in Gaia (/v2); the companion and sheet write there. The old /characters tree is no longer what they edit,
// so character paths go through the Gaia projection, which keeps the old shape (characters/pcs/<id>/combat ...) for the VTT.
let gaiaP = null;
const isChar = (path) => /^characters\//.test(path);
const gaiaDb = () => gaiaP ||= import("./gaia-db.js").then(() => {
  let pc = null; try { pc = JSON.parse(localStorage.getItem("vtt-me"))?.id || null; } catch { /* none */ }
  return window.GeezGaiaDb("firebase", { gm: new URLSearchParams(location.search).has("gm"), pc });
});
export const readAt = async (path) => isChar(path) ? (await (await gaiaDb()).ref(path).once("value")).val() : (await get(ref(db, path))).val();
export const read = async (path) => (await get(ref(db, ROOT + path))).val();
export const put = (path, value) => set(ref(db, ROOT + path), value);
// Multi-path update: keys are paths under /test, written atomically.
export const patch = (changes) => update(ref(db, ROOT), changes);

// ---- GeezSheets write-back (outside /test) -----------------------------------
// Same shape the sheet itself writes: characters/pcs/<id>/combat. Callers must be GM-only.
export const watchAt = (path, cb) => {
  if (!isChar(path)) return onValue(ref(db, path), (s) => cb(s.val()));
  let off = null, dead = false;
  gaiaDb().then((g) => { if (dead) return; const r = g.ref(path), fn = (s) => cb(s.val()); r.on("value", fn); off = () => r.off("value", fn); });
  return () => { dead = true; off?.(); };
};

// Transaction under /test: fn(current) returns the new value, or undefined to abort. Resolves true if committed.
export const txn = async (path, fn) => (await runTransaction(ref(db, ROOT + path), fn)).committed;
export const txnAt = (path, fn) => isChar(path) ? gaiaDb().then((g) => g.ref(path).transaction(fn)) : runTransaction(ref(db, path), fn);
