// The map picture: the base64 image inside a .dd2vtt is the map. Saved at /mapimg and shown to everyone.
//   /mapimg            { src?, id?, cols, rows, ppg, mime, chunks? }
//   - src: a library file ("battlemap/camp.dd2vtt"); every client fetches it itself, nothing big goes through Firebase.
//   - id/chunks: an uploaded picture, stored in 400 KB pieces at /mapimgs/<id>/<n>.
import { watch, put, read } from "../rodeo-store.js";
import { setRefImage, clearRefImage, setRefOpacity } from "./refimage.js";
import { parseDD2VTT } from "./dd2vtt.js";

const CHUNK = 400 * 1024, MAX_B64 = 6 * 1024 * 1024;
let token = 0;

export const splitChunks = (s, n = CHUNK) => { const out = []; for (let i = 0; i < s.length; i += n) out.push(s.slice(i, i + n)); return out; };

async function shrink(dataUrl) {   // re-encode a huge picture as WebP, longest side <= 4096
  const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = dataUrl; });
  const k = Math.min(1, 4096 / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return { dataUrl: c.toDataURL("image/webp", 0.85), k };
}

// data: parsed dd2vtt ({ imageDataUrl, cols, rows, ppg }); src: library path when it came from battlemap/.
export async function saveMapImage(data, src = null) {
  if (!data?.imageDataUrl) return;
  const meta = { cols: data.cols, rows: data.rows, ppg: data.ppg || 70 };
  if (src) { await put("mapimg", { ...meta, src }); return; }
  let url = data.imageDataUrl;
  if (url.length > MAX_B64) { const r = await shrink(url); url = r.dataUrl; meta.ppg = Math.max(1, Math.round(meta.ppg * r.k)); }
  const mime = /^data:([^;,]+)/.exec(url)?.[1] || "image/png", chunks = splitChunks(url.split(",")[1] || ""), id = Date.now().toString(36);
  await put(`mapimgs/${id}`, Object.fromEntries(chunks.map((c, i) => [`c${i}`, c])));
  await put("mapimg", { ...meta, id, mime, chunks: chunks.length });
}

async function resolve(rec) {
  if (rec.src) { const j = await (await fetch(rec.src)).json(); return parseDD2VTT(j).imageDataUrl; }
  const parts = await read(`mapimgs/${rec.id}`); if (!parts) return null;
  return `data:${rec.mime || "image/png"};base64,` + Array.from({ length: rec.chunks }, (_, i) => parts[`c${i}`] || "").join("");
}

export function initMapImage() {
  watch("mapimg", async (rec) => {
    const mine = ++token;
    if (!rec) { clearRefImage(); return; }
    try { const url = await resolve(rec); if (mine === token && url) { setRefImage(url, rec); setRefOpacity(1); } } catch (e) { console.warn("map picture failed", e); }
  });
}

export async function libraryMaps() { try { return await (await fetch("battlemap/index.json")).json(); } catch { return []; } }
