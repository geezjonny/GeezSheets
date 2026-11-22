// Firebase wrapper. Everything lives under /test so campaigns stay safe.
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getDatabase, ref, onValue, set, update, get, runTransaction } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-database.js";

// Config comes from js/firebase-config.js (loaded by index.html before this module) so there is one place to change it.
const app = initializeApp(window.GEEZ_FIREBASE_CONFIG, "puzzle-proto");
const db = getDatabase(app);
const ROOT = (new URLSearchParams(location.search).get("root") || "test") + "/";   // default: same data as the old VTT (tokens, HP, maps, scenes); ?root=scratch for a sandbox

export const watch = (path, cb) => onValue(ref(db, ROOT + path), (s) => cb(s.val()));
// Read-only look at the main app data (outside /test), e.g. "characters/npcs".
export const readAt = async (path) => (await get(ref(db, path))).val();
export const read = async (path) => (await get(ref(db, ROOT + path))).val();
export const put = (path, value) => set(ref(db, ROOT + path), value);
// Multi-path update: keys are paths under /test, written atomically.
export const patch = (changes) => update(ref(db, ROOT), changes);

// ---- GeezSheets write-back (outside /test) -----------------------------------
// Same shape the sheet itself writes: characters/pcs/<id>/combat. Callers must be GM-only.
export const watchAt = (path, cb) => onValue(ref(db, path), (s) => cb(s.val()));

// Transaction under /test: fn(current) returns the new value, or undefined to abort. Resolves true if committed.
export const txn = async (path, fn) => (await runTransaction(ref(db, ROOT + path), fn)).committed;
export const txnAt =(path, fn) => runTransaction(ref(db, path), fn);
