// PocketRodeo — Firebase connection.
// Same project as GeezSheets. Play state lives under rodeo/; characters are read from characters/pcs and characters/npcs.
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import {
  getDatabase, ref, get, onValue, set, update, remove, push, query, limitToLast, onDisconnect
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-database.js";

export const FIREBASE_CONFIG = window.GEEZ_FIREBASE_CONFIG || {
  apiKey:            "AIzaSyCJrkcYjFjyyx5UNA9FUaCIlCvxxOYabis",
  authDomain:        "geezsheets.firebaseapp.com",
  databaseURL:       "https://geezsheets-default-rtdb.firebaseio.com",
  projectId:         "geezsheets",
  storageBucket:     "geezsheets.firebasestorage.app",
  messagingSenderId: "57811286242",
  appId:             "1:57811286242:web:cd9cac596acdb355a2c6bb",
};

const app = initializeApp(FIREBASE_CONFIG);
export const db = getDatabase(app);
export const ROOT = "rodeo";
export const R = (path) => ref(db, `${ROOT}/${path}`);
export { ref, get, onValue, set, update, remove, push, query, limitToLast, onDisconnect };
