// vtt-firebase.js — connection to the GeezSheets Firebase project, plus the two small
// writers every client uses: pings and dice. Replaces the old firebase.js / pings.js / dice.js.
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getDatabase, ref, set, remove } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyAI3Itfvj4kZ0j0wxUhdrlVK6W76h260ZY",
  authDomain: "sheets-e5838.firebaseapp.com",
  databaseURL: "https://sheets-e5838-default-rtdb.firebaseio.com",
  projectId: "sheets-e5838",
  storageBucket: "sheets-e5838.firebasestorage.app",
};
export const db = getDatabase(initializeApp(firebaseConfig));
export const DB_URL = firebaseConfig.databaseURL;

const rnd = (n) => { const a = new Uint32Array(1); crypto.getRandomValues(a); return (a[0] % n) + 1; };

// pings/<id> = { x, y, name, t }   (x, y = grid square). Each ping cleans itself up.
export function sendPing(x, y, name) {
  const id = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const r = ref(db, `pings/${id}`);
  set(r, { x, y, name, t: Date.now() });
  setTimeout(() => remove(r).catch(() => {}), 6000);
}

// dice/last = { sides, roller, result, t }   (label / mod are added by the roller afterwards)
export function rollDie(sides, roller) {
  const result = rnd(sides);
  set(ref(db, "dice/last"), { sides, roller, result, t: Date.now() });
  return result;
}
