// Dice — roll, animate, sync via RTDB
// Last roll lives in RTDB dice/last

import { db } from "./firebase.js";
import { ref, set } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-database.js";

export async function rollDie(sides, rollerName) {
  const result = Math.ceil(Math.random() * sides);
  await set(ref(db, "dice/last"), { sides, result, roller: rollerName, t: Date.now() });
  return result;
}

// Animate a shuffle then show result in an element
export function animateDiceResult(data, resultEl, onDone) {
  resultEl.classList.add("rolling");
  let ticks = 0;
  const timer = setInterval(() => {
    ticks++;
    resultEl.textContent = Math.ceil(Math.random() * data.sides);
    if (ticks >= 18) {
      clearInterval(timer);
      resultEl.textContent = data.result;
      resultEl.classList.remove("rolling");
      if (onDone) onDone(data);
    }
  }, 60);
  return timer;
}
