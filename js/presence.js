// Presence — who has the map open right now
// Writes to RTDB presence/{safeKey} with name, page, timestamp
// Subscribes to show colored pills in HUD

import { db } from "./firebase.js";
import { ref, set, onValue } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-database.js";

let _playerName = "";
let _page       = "map"; // "map" | "editor"

// Page colors
const PAGE_COLOR = {
  editor: "#c8a84b",
  map:    "#4a9a4a",
};

// Call once on login / name confirm
export function writePresence(playerName, page = "map") {
  _playerName = playerName;
  _page       = page;
  if (!playerName) return;
  const k = playerName.replace(/\./g, "_");
  set(ref(db, `presence/${k}`), { name: playerName, page, t: Date.now() });
}

// Heartbeat — call periodically to keep presence alive (every 20s is fine)
export function startPresenceHeartbeat(playerName, page = "map") {
  _playerName = playerName;
  _page       = page;
  writePresence(playerName, page);
  const id = setInterval(() => {
    if (_playerName) writePresence(_playerName, _page);
  }, 20000);
  return id; // caller can clearInterval if needed
}

// Remove presence on page close
export function clearPresence(playerName) {
  const name = playerName || _playerName;
  if (!name) return;
  set(ref(db, `presence/${name.replace(/\./g, "_")}`), null);
}

// Subscribe and render pills into a container element
// containerEl: the DOM element to fill with pills
export function subscribePresence(containerEl) {
  if (!containerEl) return;
  const STALE_MS = 30000;

  onValue(ref(db, "presence"), snap => {
    const data  = snap.val() || {};
    const now   = Date.now();
    containerEl.innerHTML = "";

    for (const [, p] of Object.entries(data)) {
      if (!p || p.t < now - STALE_MS) continue;
      const isMe     = p.name === _playerName;
      const color    = PAGE_COLOR[p.page] || "#4a8aaa";

      const pill = document.createElement("div");
      pill.title = `${p.name} — ${p.page}`;
      pill.style.cssText = [
        "display:flex", "align-items:center", "gap:3px",
        "padding:2px 7px", "border-radius:999px",
        `border:1px solid ${color}40`,
        `background:${color}12`,
        "font-family:'Cinzel',serif", "font-size:9px",
        `color:${isMe ? "#fff" : color}`,
        "white-space:nowrap",
        `opacity:${isMe ? 1 : 0.8}`,
      ].join(";");

      const dot = document.createElement("div");
      dot.style.cssText = `width:5px;height:5px;border-radius:50%;background:${color};flex-shrink:0`;

      pill.appendChild(dot);
      pill.appendChild(document.createTextNode(p.name));
      containerEl.appendChild(pill);
    }
  });
}

// Wire up beforeunload cleanup automatically
window.addEventListener("beforeunload", () => clearPresence(_playerName));
