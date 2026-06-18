// AFK PC Oracle — manual entry, no character lookup
// GM types a name + picks a class, then rolls weighted tables for combat/exploration decisions
// Results post to chat and roll live via the shared dice roller

import { db } from "./firebase.js";
import { ref, set, push } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-database.js";

const MELEE_CLASSES  = ["fighter","barbarian","rogue","monk","paladin","ranger"];
const CASTER_CLASSES = ["wizard","sorcerer","warlock","druid","cleric","bard"];

const STYLE_BASE = ["Aggressive","Defensive","Strategic","Reckless","Hesitant","Aggressive","Strategic","Defensive"];
const MAIN_BASE   = ["Attack","Attack","Spell","Cantrip","Dash","Help","Attack","Spell"];
const BONUS_BASE  = ["Cantrip","Item","None","Dodge stance","Taunt","None","Cantrip","Item"];

export const EXPLORE_TABLE = [
  "Hide","Cast a Cantrip","Cast a Spell","Yell something dramatic","Whisper to the party",
  "Talk about a PC","Talk about a nearby NPC","Wander off","Snack break","Sharpen weapon / fidget with gear",
  "Stare blankly","Pet an animal","Trip over something","Compliment someone","Hum or sing",
  "Check the map / get oriented","Practice a combat stance","Stretch / yawn","Mutter to themselves","Strike a heroic pose"
];

export function classBucket(cls) {
  const c = (cls || "").toLowerCase();
  if (MELEE_CLASSES.includes(c)) return "melee";
  if (CASTER_CLASSES.includes(c)) return "caster";
  return "flat";
}

function weightedTable(base, bucket, favorMelee, favorCaster) {
  if (bucket === "melee")  return base.concat(favorMelee, favorMelee);
  if (bucket === "caster") return base.concat(favorCaster, favorCaster);
  return base;
}

export async function afkRollDie(sides) {
  const result = Math.ceil(Math.random() * sides);
  await set(ref(db, "dice/last"), { sides, result, roller: "AFK Oracle", t: Date.now() });
  return result;
}

// kind: "style" | "mainAction" | "bonusAction" | "explore"
export async function rollAfkDecision(kind, pcName, pcClass, targetName) {
  const bucket = classBucket(pcClass);
  let table, label, die;

  if (kind === "style") { table = weightedTable(STYLE_BASE, bucket, "Aggressive", "Strategic"); label = "Style"; die = 8; }
  else if (kind === "mainAction") { table = weightedTable(MAIN_BASE, bucket, "Attack", "Spell"); label = "Main Action"; die = 8; }
  else if (kind === "bonusAction") { table = weightedTable(BONUS_BASE, bucket, "Item", "Cantrip"); label = "Bonus Action"; die = 8; }
  else if (kind === "explore") { table = EXPLORE_TABLE; label = "Idle Behavior"; die = 20; }
  else return null;

  const roll = await afkRollDie(die);
  const idx = Math.min(table.length - 1, Math.floor((roll - 1) / die * table.length));
  const choice = table[idx % table.length];

  let line;
  if (kind === "explore") {
    line = `🎲 ${pcName} rolls for idle behavior... **${choice}**`;
  } else if (kind === "mainAction" && targetName && ["Attack","Spell","Cantrip"].includes(choice)) {
    line = `⚔ ${pcName} rolls Main Action: **${choice}** — targeting ${targetName}`;
  } else {
    line = `🎭 ${pcName} rolls ${label}: **${choice}**`;
  }

  await push(ref(db, "chat"), { sender: "AFK Oracle", text: line, type: "system", t: Date.now() });
  return { roll, choice, label, line };
}
