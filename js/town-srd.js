// town-srd.js — loads the 5e SRD data from /data and turns monster entries into sim stat blocks.
//
//   await G.srd.load('data/');           // fetches monsters.json (more files later)
//   G.srd.statsFor('zombie')             // -> stats object, or null if unknown
//
// A stat block looks like:
//   { monster, name, cr, level, str..cha, hpMax, hp, ac, initiative, speedFt,
//     attacks: [{ name, kind:'melee'|'ranged'|'both', bonus, reach, range, dmg:[{dice, type}] }],
//     multiattack: [{ name, count }] | null,
//     saves: { con: 3, ... }, resist:[types], immune:[types], vuln:[types], traits:[slugs], traitNames:[names] }
(function (G) {
  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const mod = (s) => Math.floor((s - 10) / 2);
  const PHYS = ['bludgeoning', 'piercing', 'slashing'];

  // Traits the sim actually implements (others are shown as text).
  const IMPLEMENTED = new Set(['undead-fortitude', 'pack-tactics']);

  const srd = {
    ready: false,
    monsters: new Map(),
    rollHP: true, // roll hit dice for variety; false = use the SRD average
    implementedTraits: IMPLEMENTED,

    async load(base = 'data/') {
      const res = await fetch(base + 'monsters.json');
      if (!res.ok) throw new Error(`monsters.json: HTTP ${res.status}`);
      const list = await res.json();
      this.monsters = new Map(list.map((m) => [m.index, m]));
      this.ready = true;
      return this;
    },

    has(index) { return this.monsters.has(index); },
    monster(index) { return this.monsters.get(index) || null; },

    statsFor(index) {
      const m = this.monster(index);
      return m ? fromMonster(m, this.rollHP) : null;
    },
  };

  function rollDice(expr) {
    const p = G.rules.parseDice(expr);
    let t = p.b;
    for (let i = 0; i < p.n; i++) t += G.rules.die(p.d);
    return t;
  }

  // "bludgeoning, piercing, and slashing from nonmagical weapons" -> the three physical types.
  // Our attacks are all nonmagical and unsilvered for now, so those clauses apply.
  function damageTypes(list) {
    const out = new Set();
    for (const raw of list || []) {
      const s = String(raw).toLowerCase();
      if (/nonmagical|non-magical/.test(s)) { PHYS.forEach((t) => out.add(t)); continue; }
      for (const t of ['acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning', 'necrotic', 'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder'])
        if (s.includes(t)) out.add(t);
    }
    return [...out];
  }

  function parseAttack(a) {
    const d = a.desc || '';
    const k = d.match(/^(Melee or Ranged|Melee|Ranged) (Weapon|Spell) Attack/);
    if (!k || a.attack_bonus == null) return null;
    const kind = k[1] === 'Melee' ? 'melee' : k[1] === 'Ranged' ? 'ranged' : 'both';
    const reachFt = +(d.match(/reach (\d+) ft/) || [])[1] || 5;
    const range = d.match(/range (\d+)\/(\d+) ft/);
    const dmg = [];
    for (const part of a.damage || []) {
      if (part.damage_dice) dmg.push({ dice: part.damage_dice, type: part.damage_type ? part.damage_type.index : 'bludgeoning' });
      else if (part.from && part.from.options && part.from.options[0]) {
        const o = part.from.options[0]; // e.g. versatile: take the first (one-handed) option
        if (o.damage_dice) dmg.push({ dice: o.damage_dice, type: o.damage_type ? o.damage_type.index : 'bludgeoning' });
      }
    }
    if (!dmg.length) return null;
    return {
      name: a.name, kind, spell: k[2] === 'Spell', bonus: a.attack_bonus,
      reach: Math.max(1, Math.round(reachFt / 5)),
      range: range ? { normal: +range[1] / 5, long: +range[2] / 5 } : null,
      dmg,
    };
  }

  function parseMultiattack(m, attacks, type = 'melee') {
    const ma = (m.actions || []).find((a) => a.name === 'Multiattack');
    if (!ma) return null;
    // Two encodings: a fixed list ("actions"), or a choice ("action_options": two melee OR two ranged).
    let entries = ma.actions || [];
    if (!entries.length && ma.action_options && ma.action_options.from) {
      for (const o of ma.action_options.from.options || []) {
        const items = o.option_type === 'multiple' ? (o.items || []) : [o];
        if (items.length && items.every((x) => x.type === type)) { entries = items; break; }
      }
    }
    if (!entries.length) return null;
    let seq = entries.filter((x) => x.type === type && attacks.some((a) => a.name === x.action_name))
      .map((x) => ({ name: x.action_name, count: +x.count || 1 }));
    // Alternatives are listed like "2 longsword, 2 shortsword" (same count) — keep the first.
    if (seq.length > 1 && seq.every((x) => x.count === seq[0].count && x.count > 1)) seq = [seq[0]];
    return seq.length ? seq : null;
  }

  function fromMonster(m, roll) {
    const attacks = (m.actions || []).map(parseAttack).filter(Boolean);
    const saves = {};
    for (const p of m.proficiencies || []) {
      const s = p.proficiency && p.proficiency.index.match(/^saving-throw-(\w+)$/);
      if (s) saves[s[1]] = p.value;
    }
    const hpMax = roll && m.hit_points_roll ? Math.max(1, rollDice(m.hit_points_roll)) : m.hit_points;
    const walk = +(String((m.speed && m.speed.walk) || '30').match(/\d+/) || [30])[0];
    const traitNames = (m.special_abilities || []).map((s) => s.name);
    return {
      monster: m.index, name: m.name, cr: m.challenge_rating, level: m.challenge_rating >= 1 ? Math.floor(m.challenge_rating) : 0,
      str: m.strength, dex: m.dexterity, con: m.constitution, int: m.intelligence, wis: m.wisdom, cha: m.charisma,
      hpMax, hp: hpMax,
      ac: (m.armor_class && m.armor_class[0] && m.armor_class[0].value) || 10,
      initiative: mod(m.dexterity),
      speedFt: walk,
      attacks,
      multiattack: parseMultiattack(m, attacks),
      multiattackRanged: parseMultiattack(m, attacks, 'ranged'), // e.g. "two longbow attacks"
      saves,
      resist: damageTypes(m.damage_resistances),
      immune: damageTypes(m.damage_immunities),
      vuln: damageTypes(m.damage_vulnerabilities),
      traits: traitNames.map(slug),
      traitNames,
    };
  }

  srd.slug = slug;
  G.srd = srd;
})(window.GeezTown = window.GeezTown || {});
