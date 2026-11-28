// Dice tossed up over a character's head, tumbling and landing on the real roll, shown to everyone in the same campaign.
// The motion comes from the GeezVTT minigames (drawRollDie in the removed horde and walking pages).
import { diePoints } from './geez/die-shapes.js';
import { live } from './geez/live.js';

// The latest roll per character. The Owlbear extension reads the same records for its token labels.
const ROLLS = 'https://geezsheets-default-rtdb.firebaseio.com/gmroll/gaia';
const ROLL = { toss: 0.33, tumble: 1.2, hold: 4.6, end: 5.5 }; // seconds since the roll
const R = 22, HEIGHT = 190, HEAD = 138;
const device = crypto.randomUUID(), actors = new Map();
let stage;

function table() {
  if (stage) return stage;
  stage = document.createElement('div');
  stage.className = 'dice-stage'; stage.setAttribute('popover', 'manual'); stage.setAttribute('aria-hidden', 'true');
  document.body.append(stage);
  return stage;
}
// Random faces shown while tumbling; they change more slowly as the die loses speed.
export const tumblingFace = (elapsed, sides, seed) => {
  const ticks = elapsed * 30, step = Math.floor(ticks / (1 + Math.floor(ticks / 9)));
  return ((Math.imul(step + seed, 2654435761) >>> 0) % sides) + 1;
};
function words(ctx, text, x, y, size, fill = '#ffffff') {
  ctx.font = `700 ${size}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.lineJoin = 'round';
  ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.fillStyle = fill; ctx.strokeText(text, x, y); ctx.fillText(text, x, y);
}
function outline(ctx, sides, radius) {
  const points = sides === 20 ? Array.from({ length: 6 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 3; return [Math.cos(a) * radius, Math.sin(a) * radius]; })
    : diePoints(sides).split(' ').map((p) => p.split(',').map((v) => ((Number(v) - 50) / 46) * radius));
  ctx.beginPath(); points.forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](x, y)); ctx.closePath();
}
function drawDie(ctx, die, x, elapsed, calm, color, seed) {
  const settled = calm || elapsed >= ROLL.tumble, rise = calm ? 1 : Math.min(1, elapsed / ROLL.toss), home = HEAD - 74, start = HEAD - 16;
  const bounce = settled && !calm && elapsed < ROLL.tumble + 0.4 ? Math.abs(Math.sin((elapsed - ROLL.tumble) * 15)) * 5 * (1 - (elapsed - ROLL.tumble) / 0.4) : 0;
  const cy = start + (home - start) * (1 - (1 - rise) ** 2) - (settled ? 0 : Math.sin(rise * Math.PI) * 14) - bounce;
  const shown = settled ? die.v : tumblingFace(elapsed, die.s, seed), d20 = die.s === 20 && !die.drop;
  const fill = settled && d20 && die.v === 20 ? '#e6b422' : settled && d20 && die.v === 1 ? '#b8343a' : color;
  const spin = settled ? 0 : elapsed * 30 * 0.5 * (1 - (elapsed * 30) / 36);
  ctx.save(); if (settled && die.drop) ctx.globalAlpha *= 0.35; ctx.translate(x, cy); ctx.rotate(spin);
  outline(ctx, die.s, R); ctx.fillStyle = fill; ctx.fill(); ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.65)'; ctx.stroke();
  outline(ctx, die.s, R * 0.72); ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.stroke(); ctx.restore();
  ctx.save(); if (settled && die.drop) ctx.globalAlpha *= 0.5; words(ctx, String(shown), x, cy + 6, shown > 9 ? 17 : 19); ctx.restore();
  return cy;
}
// Only portraits this site ships, or ones already stored as web addresses.
const safePortrait = (src) => (/^(tokens\/[\w .'-]+\.(png|webp|jpe?g)|https:\/\/)/i.test(src || '') ? src : '');

// Resolves once the dice have landed. A backgrounded phone skips the show so a result is never held up.
export function showDice({ name = '', label = '', total, dice, color, portrait }) {
  if (document.hidden || !dice?.length) return Promise.resolve();
  const box = table(), thrown = dice.slice(0, 6), width = Math.max(130, thrown.length * 50 + 24);
  actors.get(name)?.();
  const canvas = document.createElement('canvas'), scale = Math.min(3, window.devicePixelRatio || 1);
  canvas.width = width * scale; canvas.height = HEIGHT * scale; canvas.style.width = `${width}px`; canvas.style.height = `${HEIGHT}px`;
  while (box.children.length > 2) box.firstElementChild.remove();
  box.append(canvas);
  // Re-open so the dice sit above any panel that is already open.
  try { if (box.matches(':popover-open')) box.hidePopover(); box.showPopover(); } catch { box.classList.add('fallback'); }
  const ctx = canvas.getContext('2d'), calm = matchMedia('(prefers-reduced-motion: reduce)').matches, began = performance.now();
  const face = new Image(), body = /^#[0-9a-f]{6}$/i.test(color || '') ? color : '#8b1e2b';
  if (safePortrait(portrait)) face.src = portrait;
  let timer = 0;
  const leave = () => {
    clearTimeout(timer); canvas.remove(); if (actors.get(name) === leave) actors.delete(name);
    if (!box.children.length) { try { box.hidePopover(); } catch { box.classList.remove('fallback'); } }
  };
  actors.set(name, leave);
  const frame = () => {
    if (!canvas.isConnected) return;
    const elapsed = (performance.now() - began) / 1000;
    if (elapsed > ROLL.end) return leave();
    ctx.setTransform(scale, 0, 0, scale, 0, 0); ctx.clearRect(0, 0, width, HEIGHT);
    ctx.globalAlpha = elapsed > ROLL.hold ? Math.max(0, 1 - (elapsed - ROLL.hold) / (ROLL.end - ROLL.hold)) : 1;
    const mid = width / 2;
    ctx.save(); ctx.beginPath(); ctx.arc(mid, HEAD, 28, 0, Math.PI * 2); ctx.fillStyle = body; ctx.fill(); ctx.clip();
    if (face.complete && face.naturalWidth) ctx.drawImage(face, mid - 28, HEAD - 28, 56, 56); else words(ctx, name.slice(0, 1).toUpperCase(), mid, HEAD + 9, 26);
    ctx.restore(); ctx.beginPath(); ctx.arc(mid, HEAD, 28, 0, Math.PI * 2); ctx.lineWidth = 3; ctx.strokeStyle = '#c9a24b'; ctx.stroke();
    let top = HEAD;
    thrown.forEach((die, i) => { top = Math.min(top, drawDie(ctx, die, mid + (i - (thrown.length - 1) / 2) * 50, elapsed, calm, body, i * 7 + name.length)); });
    words(ctx, name, mid, HEAD + 44, 13);
    if (calm || elapsed >= ROLL.tumble) {
      words(ctx, `= ${total}`, mid, HEAD - 38, 18);
      const d20 = thrown.find((die) => die.s === 20 && !die.drop);
      if (d20?.v === 20 || d20?.v === 1) words(ctx, d20.v === 20 ? 'CRIT!' : 'Fumble', mid, top - R - 8, 15, d20.v === 20 ? '#ffd84a' : '#ff8f8f');
      if (label) words(ctx, label.slice(0, 28), mid, HEIGHT - 2, 11, '#d8c9a8');
    }
    // A timer rather than animation frames, so the die also finishes when the browser throttles drawing.
    timer = setTimeout(frame, 33);
  };
  frame();
  return new Promise((resolve) => setTimeout(resolve, calm ? 0 : ROLL.tumble * 1000));
}

// Rejects when the roll did not get through, so the page can say so.
export async function shareRoll(charId, record) {
  if (!charId) return;
  const res = await fetch(`${ROLLS}/${encodeURIComponent(charId)}.json`, { method: 'PUT',
    body: JSON.stringify({ ...record, from: device, id: crypto.randomUUID(), ts: Date.now() }) });
  if (!res.ok) throw Error(`roll not shared (${res.status})`);
}

// Which incoming records to animate: someone else's new roll in this campaign.
export function incoming(event, campaign, seen) {
  // The whole-list message sent on connect (path "/") is history, so only single-character updates count.
  if (!event || !/^\/[^/]+$/.test(event.path || '')) return null;
  const roll = event.data;
  if (!roll?.id || !Array.isArray(roll.dice) || roll.from === device || !campaign || roll.campaign !== campaign || seen.has(roll.id)) return null;
  seen.add(roll.id);
  return roll;
}

export function watchRolls(campaign, subscribe = live) {
  const seen = new Set();
  let history = true; // the first list is what was already there when the page opened
  return subscribe('gmroll/gaia', (all) => {
    for (const [id, data] of Object.entries(all || {})) {
      if (history) { seen.add(data?.id); continue; }
      const roll = incoming({ path: `/${id}`, data }, campaign(), seen);
      if (roll) showDice(roll);
    }
    history = false;
  });
}
