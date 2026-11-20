// Hand-inked SVG icons for puzzle objects.
import { el } from "./draw.js";

const line = (g, a, cls = "detail") => el("line", { ...a, class: cls }, g);
const path = (g, d, cls = "detail", extra = {}) => el("path", { d, class: cls, ...extra }, g);
const label = (g, x, y, value, cls = "icon-text") => { el("text", { x, y, class: cls }, g).textContent = value; };
const hit = (g, x, y, w = 34, h = 34) => el("rect", { x: x - w / 2, y: y - h / 2, width: w, height: h, fill: "transparent" }, g);

function plate(o, g) {
  const down = o.state === "down";
  el("rect", { x: o.x - 16, y: o.y - (down ? 12 : 16), width: 32, height: down ? 25 : 29, rx: 3, class: "body" }, g);
  el("rect", { x: o.x - 10, y: o.y - (down ? 6 : 10), width: 20, height: 14, rx: 2, class: "plate-inset" }, g);
  line(g, { x1: o.x - 7, y1: o.y + (down ? 8 : 12), x2: o.x + 7, y2: o.y + (down ? 8 : 12) }); hit(g, o.x, o.y);
}
function tripwire(o, g) {
  const n = o.len || 3, v = o.dir === "v", x1 = o.x + (v ? 0 : -20), y1 = o.y + (v ? -20 : 0), x2 = o.x + (v ? 0 : (n - 1) * 40 + 20), y2 = o.y + (v ? (n - 1) * 40 + 20 : 0);
  line(g, { x1, y1, x2, y2, "stroke-dasharray": "4 4" }, "body");
  for (const [x, y] of [[x1, y1], [x2, y2]]) { el("line", { x1: x, y1: y - (v ? 7 : 0), x2: x, y2: y + (v ? 7 : 0), class: "tripwire-post" }, g); el("circle", { cx: x, cy: y, r: 4, class: "tripwire-post" }, g); }
  hit(g, (x1 + x2) / 2, (y1 + y2) / 2, v ? 24 : n * 40, v ? n * 40 : 24);
}
function gauge(o, g) {
  path(g, `M${o.x} ${o.y + 14} C${o.x - 22} ${o.y - 1} ${o.x - 12} ${o.y - 15} ${o.x} ${o.y - 7} C${o.x + 12} ${o.y - 15} ${o.x + 22} ${o.y - 1} ${o.x} ${o.y + 14} Z`, "body gauge-heart");
  if (o.state === "dead") { el("circle", { cx: o.x - 6, cy: o.y - 1, r: 3, class: "skull-mark" }, g); el("circle", { cx: o.x + 6, cy: o.y - 1, r: 3, class: "skull-mark" }, g); line(g, { x1: o.x - 7, y1: o.y + 8, x2: o.x + 7, y2: o.y + 8 }, "skull-mark"); }
  else { el("rect", { x: o.x - 11, y: o.y - 2, width: 22, height: 6, rx: 1, class: "gauge-bar" }, g); el("rect", { x: o.x - 10, y: o.y - 1, width: o.state === "bloodied" ? 10 : 20, height: 4, class: "gauge-fill" }, g); }
  hit(g, o.x, o.y);
}
function switcho(o, g) {
  el("rect", { x: o.x - 15, y: o.y - 11, width: 30, height: 22, rx: 4, class: "body" }, g); const on = o.state === "on";
  line(g, { x1: o.x, y1: o.y + 7, x2: o.x + (on ? 9 : -9), y2: o.y - 8 }, "switch-lever"); el("circle", { cx: o.x + (on ? 9 : -9), cy: o.y - 8, r: 3, class: "switch-knob" }, g); hit(g, o.x, o.y);
}
function dial(o, g) {
  el("circle", { cx: o.x, cy: o.y, r: 16, class: "body" }, g);
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; line(g, { x1: o.x + Math.cos(a) * 12, y1: o.y + Math.sin(a) * 12, x2: o.x + Math.cos(a) * (i % 2 ? 14 : 15), y2: o.y + Math.sin(a) * (i % 2 ? 14 : 15) }, "dial-tick"); }
  const values = o.values || ["N", "E", "S", "W"], i = Math.max(0, values.indexOf(o.state)), a = values.length === 4 ? [-Math.PI / 2, 0, Math.PI / 2, Math.PI][i] : -Math.PI / 2 + i * Math.PI * 2 / values.length;
  line(g, { x1: o.x, y1: o.y, x2: o.x + Math.cos(a) * 11, y2: o.y + Math.sin(a) * 11 }, "dial-pointer"); el("circle", { cx: o.x, cy: o.y, r: 2.5, class: "dial-hub" }, g); label(g, o.x, o.y + 25, o.state, "dial-value"); hit(g, o.x, o.y, 38, 38);
}
function light(o, g) {
  path(g, `M${o.x - 8} ${o.y - 8} H${o.x + 8} L${o.x + 6} ${o.y + 11} H${o.x - 6} Z`, "body lantern"); line(g, { x1: o.x - 9, y1: o.y - 8, x2: o.x + 9, y2: o.y - 8 }, "lantern-cap"); line(g, { x1: o.x - 5, y1: o.y + 11, x2: o.x + 5, y2: o.y + 11 }, "lantern-cap"); path(g, `M${o.x} ${o.y + 5} C${o.x - 5} ${o.y} ${o.x + 1} ${o.y - 1} ${o.x} ${o.y - 7} C${o.x + 7} ${o.y - 1} ${o.x + 5} ${o.y + 5} ${o.x} ${o.y + 5} Z`, "flame"); hit(g, o.x, o.y);
}
function floor(o, g) {
  el("rect", { x: o.x - 16, y: o.y - 16, width: 32, height: 32, rx: 2, class: "body" }, g);
  if (o.state === "open") { el("rect", { x: o.x - 11, y: o.y - 10, width: 22, height: 20, class: "floor-hole" }, g); path(g, `M${o.x - 11} ${o.y - 10} L${o.x + 11} ${o.y + 10} M${o.x + 11} ${o.y - 10} L${o.x - 11} ${o.y + 10}`, "floor-hatch"); }
  else path(g, `M${o.x - 11} ${o.y - 6} H${o.x + 11} M${o.x - 11} ${o.y + 5} H${o.x + 11} M${o.x - 6} ${o.y - 11} V${o.y + 11} M${o.x + 6} ${o.y - 11} V${o.y + 11}`, "floor-hatch"); hit(g, o.x, o.y);
}
function spawn(o, g) { el("circle", { cx: o.x, cy: o.y, r: 15, class: "body" }, g); el("circle", { cx: o.x, cy: o.y, r: 10, class: "rune-ring" }, g); path(g, `M${o.x} ${o.y - 8} L${o.x + 7} ${o.y + 6} H${o.x - 7} Z`, "rune-mark"); line(g, { x1: o.x - 12, y1: o.y, x2: o.x + 12, y2: o.y }, "rune-mark"); hit(g, o.x, o.y); }
function stone(o, g) { path(g, `M${o.x - 14} ${o.y + 7} L${o.x - 10} ${o.y - 8} L${o.x + 2} ${o.y - 14} L${o.x + 14} ${o.y - 5} L${o.x + 12} ${o.y + 9} L${o.x} ${o.y + 14} Z`, "body boulder"); path(g, `M${o.x - 5} ${o.y - 8} L${o.x - 1} ${o.y - 2} L${o.x - 6} ${o.y + 5} M${o.x - 1} ${o.y - 2} L${o.x + 7} ${o.y - 6} M${o.x - 1} ${o.y - 2} L${o.x + 4} ${o.y + 7}`, "stone-crack"); hit(g, o.x, o.y); }
function catapult(o, g) { path(g, `M${o.x - 13} ${o.y + 12} L${o.x - 5} ${o.y - 8} L${o.x + 5} ${o.y - 8} L${o.x + 13} ${o.y + 12} Z`, "body catapult-frame"); const fired = o.state === "fired"; line(g, { x1: o.x, y1: o.y + 3, x2: o.x + (fired ? 11 : -7), y2: o.y + (fired ? -10 : -12) }, "catapult-arm"); el("circle", { cx: o.x + (fired ? 11 : -7), cy: o.y + (fired ? -10 : -12), r: 3, class: "catapult-cup" }, g); hit(g, o.x, o.y); }

function sight(o, g) {
  const on = o.state === "sees";
  path(g, `M${o.x - 15} ${o.y} Q${o.x} ${o.y - 13} ${o.x + 15} ${o.y} Q${o.x} ${o.y + 13} ${o.x - 15} ${o.y} Z`, "body");
  el("circle", { cx: o.x, cy: o.y, r: 5, class: on ? "rune-ring" : "dial-hub" }, g); hit(g, o.x, o.y);
}
function initiative(o, g) { el("circle", { cx: o.x, cy: o.y, r: 15, class: "body" }, g); path(g, `M${o.x - 8} ${o.y - 8} L${o.x + 8} ${o.y + 8} M${o.x + 8} ${o.y - 8} L${o.x - 8} ${o.y + 8} M${o.x - 9} ${o.y - 3} L${o.x - 3} ${o.y - 9} M${o.x + 9} ${o.y - 3} L${o.x + 3} ${o.y - 9}`, "rune-mark"); hit(g, o.x, o.y); }

export function drawIcon(o, g) { ({ sight, initiative, plate, tripwire, gauge, switch: switcho, dial, light, floor, spawn, stone, catapult }[o.kind] || (() => hit(g, o.x, o.y)))(o, g); }
