// Command-line parser for the GM console. Pure: text in, a plain command object out (or { error }).
//
//   roll <who> <what> [dc15] [adv|dis] [show] [title words]     who: all | pcs | npcs | Name,Name
//        what: init | dex | dex save | stealth        e.g.  roll all dex dc15   roll pcs wis save dc13 adv   roll Aria stealth dc12 show
//   init start | next | end
//   move <token> <col>,<row>         (cells count from 0,0 at the top-left)
//   open|close|toggle <object name>
//   hp <token> -5 | +3 | =10         (tokens with their own HP; PCs use their sheet)
//   help

export const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"];
export const SKILL_KEYS = ["acrobatics", "animal_handling", "arcana", "athletics", "deception", "history", "insight", "intimidation", "investigation", "medicine", "nature", "perception", "performance", "persuasion", "religion", "sleight_of_hand", "stealth", "survival"];
const norm = (s) => String(s).toLowerCase().replace(/[\s-]+/g, "_");
const ALIAS = { animal: "animal_handling", sleight: "sleight_of_hand", soh: "sleight_of_hand", init: "init", initiative: "init", strength: "str", dexterity: "dex", constitution: "con", intelligence: "int", wisdom: "wis", charisma: "cha", adv: "adv", advantage: "adv", dis: "dis", disadvantage: "dis" };

// Split on spaces but keep "quoted phrases" together.
export const tokenize = (text) => [...String(text).trim().matchAll(/"([^"]*)"|(\S+)/g)].map((m) => m[1] ?? m[2]);

export function parse(text) {
  const w = tokenize(text); if (!w.length) return { error: "empty" };
  const verb = w.shift().toLowerCase().replace(/^\//, "");
  if (verb === "help" || verb === "?") return { cmd: "help" };
  if (verb === "roll" || verb === "callroll") {
    const who = w.shift(); if (!who) return { error: "roll <who> <what> [dc15] [adv|dis]  (who: all, pcs, npcs or names)" };
    const out = { cmd: "roll", who: who.split(","), kind: "ability", key: "", dc: null, mode: "normal", showDc: false, title: "" }, title = [];
    let sawKey = false, save = false;
    for (const raw of w) {
      const t = ALIAS[norm(raw)] || norm(raw), dc = /^dc[:=]?(\d+)$/.exec(t);
      if (dc) out.dc = +dc[1];
      else if (t === "adv" || t === "dis") out.mode = t;
      else if (t === "show") out.showDc = true;
      else if (t === "save" || t === "saving") save = true;
      else if (!sawKey && t === "init") { out.kind = "init"; sawKey = true; }
      else if (!sawKey && ABILITIES.includes(t)) { out.key = t; sawKey = true; }
      else if (!sawKey && SKILL_KEYS.includes(t)) { out.kind = "skill"; out.key = t; sawKey = true; }
      else title.push(raw);
    }
    if (!sawKey) return { error: `roll what? init, an ability (${ABILITIES.join(", ")}) or a skill (e.g. stealth)` };
    if (save && out.kind === "ability") out.kind = "save";
    out.title = title.join(" ");
    return out;
  }
  if (verb === "init" || verb === "initiative") {
    const sub = (w[0] || "").toLowerCase();
    return ["start", "next", "end"].includes(sub) ? { cmd: "init", sub } : { error: "init start | next | end" };
  }
  if (verb === "move") {
    const m = /^(\d+)\s*[,x]\s*(\d+)$/.exec(w[w.length - 1] || "");
    return w.length >= 2 && m ? { cmd: "move", target: w.slice(0, -1).join(" "), col: +m[1], row: +m[2] } : { error: "move <token> <col>,<row>" };
  }
  if (["open", "close", "toggle"].includes(verb)) return w.length ? { cmd: "state", op: verb, target: w.join(" ") } : { error: `${verb} <object name>` };
  if (verb === "hp") {
    const m = /^([+\-=])(\d+)$/.exec(w[w.length - 1] || "");
    return w.length >= 2 && m ? { cmd: "hp", target: w.slice(0, -1).join(" "), op: m[1], n: +m[2] } : { error: "hp <token> -5 | +3 | =10" };
  }
  return { error: `unknown command "${verb}" (try help)` };
}

// Match a name against labels/ids: exact first, then prefix, then substring. Returns ids.
export function matchIds(name, entries) {   // entries: [[id, label]]
  const n = String(name).toLowerCase();
  for (const test of [(l) => l === n, (l) => l.startsWith(n), (l) => l.includes(n)]) {
    const hit = entries.filter(([id, l]) => test(String(l || id).toLowerCase()) || test(String(id).toLowerCase()));
    if (hit.length) return hit.map(([id]) => id);
  }
  return [];
}
