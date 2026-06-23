import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-database.js";

const firebaseConfig = {
  apiKey:      "AIzaSyAI3Itfvj4kZ0j0wxUhdrlVK6W76h260ZY",
  authDomain:  "sheets-e5838.firebaseapp.com",
  databaseURL: "https://sheets-e5838-default-rtdb.firebaseio.com",
  projectId:   "sheets-e5838",
  storageBucket: "sheets-e5838.firebasestorage.app",
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
