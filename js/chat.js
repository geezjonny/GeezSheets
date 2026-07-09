// Chat — send and render messages
// All messages live in RTDB chat/

import { db } from "./firebase.js";
import { ref, push } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-database.js";

export async function sendChat(text, sender, type = "chat") {
  if (!text.trim()) return;
  await push(ref(db, "chat"), { sender, text, type, t: Date.now() });
}

export function renderChat(data, containerEl, currentPlayerName) {
  containerEl.innerHTML = "";
  if (!data) return;
  const msgs = Object.entries(data).sort(([, a], [, b]) => a.t - b.t);
  msgs.forEach(([, msg]) => {
    const div = document.createElement("div");
    div.className = "chat-msg" + (msg.sender === currentPlayerName ? " mine" : "");
    div.innerHTML = `<span class="who ${msg.type || "chat"}">${msg.sender}:</span>${msg.text}`;
    containerEl.appendChild(div);
  });
  containerEl.scrollTop = containerEl.scrollHeight;
}
