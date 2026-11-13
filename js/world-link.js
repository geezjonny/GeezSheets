// World sim ↔ your campaign. Reads the pin board live from Firebase through js/rodeo-firebase.js,
// the same connection the VTT and pinboard use, and can write the world's state to geezvtt/world/<campaign>.
// Nothing here writes to geezvtt/campaign: your cards are only ever read.
import { db, ref, onValue, get, set } from "./rodeo-firebase.js";

const listeners = new Set();
let campaign = null, npcs = {}, status = "Connecting to Firebase…", ok = false;
const snapshot = () => ({ geezvtt: { campaign }, characters: { npcs } });
const emit = () => { for (const f of listeners) { try { f(snapshot(), status); } catch (e) { console.warn("[world-link]", e); } } };

get(ref(db, "characters/npcs")).then((s) => { npcs = s.val() || {}; if (campaign) emit(); }).catch(() => {});
onValue(ref(db, "geezvtt/campaign"), (s) => {
  campaign = s.val() || {}; ok = true;
  status = `Live from Firebase · ${Object.keys(campaign.things || {}).length} cards`;
  emit();
}, (err) => { ok = false; status = `Couldn't read the campaign (${err?.code || err?.message || "no access"}). Check the database rules.`; emit(); });

window.WorldLink = {
  get ready() { return ok; },
  get status() { return status; },
  source: "Firebase (geezsheets)",
  on(f) { listeners.add(f); if (campaign) f(snapshot(), status); return () => listeners.delete(f); },
  write(campaignId, data) { return set(ref(db, `geezvtt/world/${String(campaignId || "default").replace(/[.#$\[\]\/]/g, "_")}`), data); },
};
window.dispatchEvent(new Event("worldlink"));
