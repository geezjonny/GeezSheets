// Talking tokens: the video dock (videochat.html) posts who is speaking; the token labelled with that name shakes.
// A player's call name is their VTT "Me" character (see index.html), and canMove() in vtt.js matches tokens by the same label rule.
import { S } from "./state.js";

addEventListener("message", (e) => {
  if (e.origin !== location.origin || e.data?.geezChat !== "speaking") return;
  const names = new Set((e.data.names || []).map((n) => String(n).trim().toLowerCase()));
  S.talking = new Set(Object.entries(S.tokens).filter(([, t]) => names.has(String(t.label || "").trim().toLowerCase())).map(([id]) => id));
  document.querySelectorAll("#tokens .token").forEach((g) => g.classList.toggle("talking", S.talking.has(g.dataset.id)));   // redraws re-apply this from S.talking
});
