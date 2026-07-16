/**
 * view-vtt.js — VTT view wrapper
 * Embeds mapeditor.html in an iframe. mapeditor stays as-is.
 */

import { ref, set } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-database.js";
import { db } from "./firebase.js";

export function initVtt(container, { campaignId = 'default', mapKey = null, onBack = null } = {}) {
  if (mapKey) set(ref(db, 'session/currentMap'), mapKey);

  container.innerHTML = `
    <div style="position:relative;width:100%;height:100%">
      <iframe 
        src="mapeditor.html?campaign=${encodeURIComponent(campaignId)}"
        style="width:100%;height:100%;border:none;display:block"
      ></iframe>
      ${onBack ? `<button id="vtt-back" style="
        position:absolute;top:52px;left:8px;z-index:100;
        height:26px;padding:0 10px;font-size:10px;
        border:1px solid #3a3228;border-radius:4px;
        background:rgba(13,11,8,.85);color:#a89e8c;
        font-family:'Cinzel',serif;cursor:pointer;
        backdrop-filter:blur(4px)
      ">← Board</button>` : ''}
    </div>`;

  const backBtn = container.querySelector('#vtt-back');
  if (backBtn) backBtn.onclick = () => onBack?.();

  return function destroy() {
    container.innerHTML = '';
  };
}
