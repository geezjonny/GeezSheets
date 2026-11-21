import { watch, put } from "../store.js";
import { S } from "./state.js";
import { addBarButton } from "./ui.js";

let status, banner;
const turnName = (initiative, tokens) => initiative?.turn == null ? "—" : tokens?.[initiative.turn]?.label || initiative.turn;
function render() {
  if (status) status.textContent = `${S.sceneName || "Current scene"} · Round ${S.round || 1} · Turn: ${S.turnName || "—"}`;
  if (banner) banner.hidden = S.isGM || !S.paused;
  document.body.classList.toggle("table-paused", !!S.paused && !S.isGM);
}
export function initTable() {
  status = document.createElement("span"); status.id = "table-status"; status.setAttribute("aria-live", "polite"); document.querySelector("header")?.append(status);
  banner = document.createElement("div"); banner.id = "paused-banner"; banner.textContent = "Paused by the GM"; banner.hidden = true; document.body.append(banner);
  if (S.isGM) addBarButton({ id: "pause", icon: "Ⅱ", label: "Pause", title: "Pause player actions", gmOnly: true, toggle: true, onClick: () => put("paused", !S.paused) });
  watch("paused", (v) => { S.paused = !!v; document.getElementById("bar-pause")?.classList.toggle("on", S.paused); render(); });
  watch("scene", (v) => { S.sceneName = v?.name || "Current scene"; render(); });
  watch("initiative", (v) => { S.initiative = v || null; S.round = v?.round || 1; S.turnName = turnName(v, S.tokens); render(); });
  document.addEventListener("tokenschanged", () => { S.turnName = turnName(S.initiative, S.tokens); render(); }); render();
}
