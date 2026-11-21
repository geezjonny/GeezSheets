// Pure token effects. Effects live on tokens/<id>/effects and are deliberately
// independent of Firebase and the DOM so combat rules can use the same data.
const n = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const list = (value) => Array.isArray(value) ? value : value && typeof value === "object" ? Object.values(value) : [];

export const EFFECT_PRESETS = {
  bless: { name: "Bless", attack: 1, save: 1, note: "+1d4 to attacks and saves (use the roll-call bonus for the die)." },
  bane: { name: "Bane", attack: -1, save: -1, note: "−1d4 to attacks and saves (use the roll-call bonus for the die)." },
  shield_of_faith: { name: "Shield of Faith", ac: 2 },
  haste: { name: "Haste", ac: 2, note: "Haste: extra action and doubled speed are tracked in the note." },
  slow: { name: "Slow", ac: -2, attack: -2, note: "Slow: speed and reactions are tracked in the note." },
  hunters_mark: { name: "Hunter's Mark", note: "+1d6 damage to the marked target." },
  resist_fire: { name: "Resist Fire", damageResist: ["fire"] },
  vulnerability_fire: { name: "Vulnerability: Fire", damageVuln: ["fire"] },
  custom: { name: "Custom", note: "" },
};

export function effectsOf(tokenOrEffects) {
  const value = tokenOrEffects?.effects ?? tokenOrEffects;
  return list(value).filter((e) => e && typeof e === "object").map((e) => ({
    id: String(e.id || "effect"), name: String(e.name || "Effect"), rounds: e.rounds == null || e.rounds === "" ? null : Math.max(0, Math.trunc(n(e.rounds))),
    startRound: Math.trunc(n(e.startRound, 1)), ac: n(e.ac), attack: n(e.attack), save: n(e.save),
    damageResist: list(e.damageResist).map((x) => String(x).toLowerCase()), damageVuln: list(e.damageVuln).map((x) => String(x).toLowerCase()),
    damageImmune: list(e.damageImmune).map((x) => String(x).toLowerCase()), note: String(e.note || ""),
  }));
}

export function effectRemaining(effect, round) {
  if (effect.rounds == null) return null;
  return Math.max(0, effect.rounds - Math.max(0, Math.trunc(n(round, effect.startRound)) - effect.startRound));
}

export function activeEffects(tokenOrEffects, round = null) {
  return effectsOf(tokenOrEffects).filter((e) => round == null || e.rounds == null || effectRemaining(e, round) > 0);
}

export function effectBonuses(tokenOrEffects, round = null) {
  return activeEffects(tokenOrEffects, round).reduce((out, e) => {
    out.ac += e.ac; out.attack += e.attack; out.save += e.save; return out;
  }, { ac: 0, attack: 0, save: 0 });
}

export function damageAdjustment(tokenOrEffects, type, amount) {
  const kind = String(type || "").trim().toLowerCase(), effects = activeEffects(tokenOrEffects);
  if (effects.some((e) => e.damageImmune.includes(kind))) return { amount: 0, reason: "immune" };
  if (effects.some((e) => e.damageVuln.includes(kind))) return { amount: Math.max(0, Math.floor(n(amount) * 2)), reason: "vulnerable" };
  if (effects.some((e) => e.damageResist.includes(kind))) return { amount: Math.floor(Math.max(0, n(amount)) / 2), reason: "resistant" };
  return { amount: Math.max(0, n(amount)), reason: "normal" };
}

// Called only by the GM when the initiative round changes. Returned changes are
// tokenId -> new effects, and expired contains the names for a shared toast.
export function tickEffects(tokens, newRound) {
  const changes = {}, expired = [];
  for (const [tokenId, token] of Object.entries(tokens || {})) {
    const old = effectsOf(token), kept = old.filter((e) => e.rounds == null || effectRemaining(e, newRound) > 0);
    if (kept.length !== old.length) { changes[tokenId] = kept; old.filter((e) => !kept.includes(e)).forEach((e) => expired.push({ tokenId, name: e.name })); }
  }
  return { changes, expired };
}

export function makeEffect(preset, rounds, startRound, custom = {}) {
  const base = typeof preset === "string" ? (EFFECT_PRESETS[preset] || EFFECT_PRESETS.custom) : (preset || EFFECT_PRESETS.custom);
  return { id: `${String(base.name || "effect").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now().toString(36)}`, ...base,
    ...custom, rounds: rounds == null || rounds === "" ? null : Math.max(0, Math.trunc(n(rounds))), startRound: Math.trunc(n(startRound, 1)) };
}
