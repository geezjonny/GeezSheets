// PocketRodeo — Firebase connection.
// Same project as GeezSheets. Play state lives under rodeo/; characters are read from characters/pcs and characters/npcs.
// ?db=local (or ?db=http://host:port): GeezTabletop's local database instead (godot-vtt/tools/localdb), for testing.

export const FIREBASE_CONFIG = window.GEEZ_FIREBASE_CONFIG || {
  apiKey:            "AIzaSyCJrkcYjFjyyx5UNA9FUaCIlCvxxOYabis",
  authDomain:        "geezsheets.firebaseapp.com",
  databaseURL:       "https://geezsheets-default-rtdb.firebaseio.com",
  projectId:         "geezsheets",
  storageBucket:     "geezsheets.firebasestorage.app",
  messagingSenderId: "57811286242",
  appId:             "1:57811286242:web:cd9cac596acdb355a2c6bb",
};

const dbParam = new URLSearchParams(location.search).get("db");
let api;
if (dbParam) {
  await import(dbParam === "gaia" ? "./gaia-db.js" : "./local-db.js");
  const local = dbParam === "gaia" ? window.GeezGaiaDb(new URLSearchParams(location.search).get("gaia") || undefined) : window.GeezLocalDb(dbParam === "local" ? location.origin : dbParam);
  api = {
    db: local,
    ref: (db, path = "") => db.ref(path),
    get: r => r.once("value"),
    onValue: (r, cb, err) => { r.on("value", cb, err); return () => r.off("value", cb); },
    set: (r, v) => r.set(v),
    update: (r, v) => r.update(v),
    remove: r => r.remove(),
    push: (r, v) => r.push(v),
    query: r => r,
    limitToLast: () => null,
    onDisconnect: () => ({ set: async () => {}, remove: async () => {}, update: async () => {}, cancel: async () => {} }),
    runTransaction: (r, fn) => r.transaction(fn),
  };
} else {
  const { initializeApp } = await import("https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js");
  const fb = await import("https://www.gstatic.com/firebasejs/11.1.0/firebase-database.js");
  api = { ...fb, db: fb.getDatabase(initializeApp(FIREBASE_CONFIG)) };
}

export const db = api.db;
export const ROOT = "rodeo";
export const { ref, get, onValue, set, update, remove, push, query, limitToLast, onDisconnect, runTransaction } = api;
export const R = (path) => ref(db, `${ROOT}/${path}`);
