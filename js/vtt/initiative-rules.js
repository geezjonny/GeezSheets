// Pure initiative rules. No DOM, Firebase, or browser state belongs here.

export const isPcToken = (token) => !!token?.pc || (!token?.npc && token?.hp == null);

const modes = new Set(["all", "npcs", "none"]);
const numberOf = (value) => value == null || value === "" || !Number.isFinite(Number(value)) ? null : Math.trunc(Number(value));
const orderCompare = ([, a], [, b]) => {
  const ai = numberOf(a?.init), bi = numberOf(b?.init);
  if (ai == null && bi != null) return 1;
  if (ai != null && bi == null) return -1;
  return (bi ?? 0) - (ai ?? 0) || (Number(a?.n) || 0) - (Number(b?.n) || 0);
};

export function buildInitiative(tokens = {}, existing = {}, mode = "all", roll = () => 1) {
  const chosenMode = modes.has(mode) ? mode : "all";
  const order = { ...(existing || {}) };
  let n = Object.values(order).reduce((max, item) => Math.max(max, Number(item?.n) || 0), 0);
  for (const [id, token] of Object.entries(tokens || {})) {
    const old = order[id];
    if (!old) order[id] = { init: null, n: ++n };
    if (numberOf(order[id].init) == null && chosenMode !== "none" && (chosenMode === "all" || !isPcToken(token))) {
      order[id] = { ...order[id], init: Math.max(1, Math.min(20, Math.trunc(Number(roll(id, token)) || 1))) };
    }
  }
  const sorted = Object.entries(order).filter(([id]) => tokens?.[id]).sort(orderCompare);
  return { order, first: sorted[0]?.[0] ?? null };
}

