// town-roles.js — behaviour is data. An entity's role is the first of its tags that appears here.
//
//   zoneTags   an entity roams a zone that shares one of these tags (empty = anywhere)
//   routeTags  it walks route edges that share one of these tags
//   routeBias  0..1 chance of choosing the route over a free wander at each decision
//   leash      if set, wanders only this many squares from its home point (shopkeepers)
//   hostileTo  tags it will chase and attack
//   fleeFrom   tags it runs from
//   sight      how far (squares) it notices things, cone of ±60° plus 1.5 squares all round
//   speed      squares per second while roaming
//   fov        half-angle of the sight cone in degrees (default 60)
//   hearing    notices things all round within this many squares (default 1.5)
//   scent      when idle, drifts toward the nearest prey within this range, no sight needed
//   chaseSpeed / fleeSpeed  multipliers while chasing / fleeing
//   stamina    seconds of full-speed fleeing before tiring to 0.8x
//   combat     what it does on its initiative turns: 'fight' or 'flee' (default: fight if hostileTo, else flee)
//   monster    SRD stat block index from data/monsters.json (e.g. 'guard', 'zombie', 'bandit').
//              An entity tag 'srd:<index>' overrides it per creature, e.g. tags 'zombie, srd:ogre'.
//   moveSquares  squares per turn, only used when there's no stat block speed (6 = 30 ft)
//   talk       chance (0..1) an NPC of this role talks at all. Only shopkeepers talk for now (they pass on the
//              session's rumors); tags 'chatty' / 'silent' override per NPC.
//   shopper    chance per roaming decision to go buy something from a nearby shopkeeper
(function (G) {
  G.roles = {
    guard: {
      label: 'Guard', color: '#3b82f6', monster: 'guard',
      zoneTags: ['guard'], routeTags: ['guard'], routeBias: 0.8,
      idle: [1, 3], speed: 1.3, sight: 6, talk: 0,
      hostileTo: ['zombie', 'bandit', 'hostile'], combat: 'fight',
    },
    citizen: {
      label: 'Citizen', color: '#a78bfa', monster: 'commoner',
      zoneTags: ['city', 'citizen'], routeTags: ['city', 'street', 'citizen'], routeBias: 0.5,
      idle: [2, 6], speed: 1.0, sight: 5, talk: 0, shopper: 0.15,
      fleeFrom: ['zombie', 'bandit', 'hostile'], fleeSpeed: 1.5, stamina: 3, combat: 'flee',
    },
    shopkeeper: {
      label: 'Shopkeeper', color: '#f59e0b', monster: 'commoner',
      zoneTags: ['shop'], routeTags: [], routeBias: 0, leash: 1.5,
      idle: [3, 8], speed: 0.7, sight: 4, talk: 1, // shopkeepers always talk, and they're the rumor mill
      fleeFrom: ['zombie', 'bandit', 'hostile'], fleeSpeed: 1.5, stamina: 2, combat: 'fight', // professionals stand and fight
    },
    bandit: {
      label: 'Bandit', color: '#dc2626', monster: 'bandit',
      zoneTags: ['bandit'], routeTags: ['bandit', 'street'], routeBias: 0.4,
      idle: [1, 4], speed: 1.1, sight: 6, talk: 0,
      hostileTo: ['guard', 'citizen', 'shopkeeper', 'pc'], combat: 'fight',
    },
    zombie: {
      label: 'Zombie', color: '#22c55e', monster: 'zombie',
      zoneTags: [], routeTags: [], routeBias: 0,
      idle: [0.5, 2], speed: 0.6, sight: 6, talk: 0, fov: 90, hearing: 3, scent: 12, chaseSpeed: 1.6,
      hostileTo: ['guard', 'citizen', 'shopkeeper', 'pc'], combat: 'fight',
      reanimateChance: 1, // chance a non-zombie it kills rises as a zombie (0..1)
    },
    pc: {
      label: 'Player', color: '#ef4444', monster: null, fallback: 'adventurer', playerControlled: true,
      zoneTags: [], routeTags: [], routeBias: 0, idle: [0, 0], speed: 4, sight: 8, moveSquares: 6,
    },
  };

  G.roleOf = (entity) => {
    for (const t of entity.tags) if (G.roles[t]) return t;
    return 'citizen';
  };

  // Which SRD stat block an entity uses: an 'srd:<index>' tag wins, then the role's monster.
  G.monsterFor = (roleKey, tags = []) => {
    const t = tags.find((x) => x.startsWith('srd:'));
    if (t) return t.slice(4);
    const role = G.roles[roleKey] || G.roles.citizen;
    return role.monster || null;
  };

  // --- fallback stat blocks, used when the SRD isn't loaded or has no such monster ---
  const mod = (s) => Math.floor((s - 10) / 2);
  const block = (o) => {
    const hp = Math.max(1, o.hp);
    return {
      monster: null, name: o.name, cr: o.cr, level: o.level, str: o.str, dex: o.dex, con: o.con, int: o.int, wis: o.wis, cha: o.cha,
      hpMax: hp, hp, ac: o.ac, initiative: mod(o.dex), speedFt: o.speedFt,
      attacks: [{ name: o.weapon, kind: 'melee', bonus: o.bonus, reach: 1, range: null, dmg: [{ dice: o.dice, type: o.type }] }],
      multiattack: null, saves: o.saves || {}, resist: [], immune: [], vuln: [], traits: o.traits || [], traitNames: o.traitNames || [],
    };
  };
  const fallbacks = {
    commoner: () => block({ name: 'Commoner', cr: 0, level: 0, str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, hp: 4, ac: 10, speedFt: 30, weapon: 'Club', bonus: 2, dice: '1d4', type: 'bludgeoning' }),
    guard: () => block({ name: 'Guard', cr: 0.125, level: 0, str: 13, dex: 12, con: 12, int: 10, wis: 11, cha: 10, hp: 11, ac: 16, speedFt: 30, weapon: 'Spear', bonus: 3, dice: '1d6+1', type: 'piercing' }),
    bandit: () => block({ name: 'Bandit', cr: 0.125, level: 0, str: 11, dex: 12, con: 12, int: 10, wis: 10, cha: 10, hp: 11, ac: 12, speedFt: 30, weapon: 'Scimitar', bonus: 3, dice: '1d6+1', type: 'slashing' }),
    zombie: () => block({ name: 'Zombie', cr: 0.25, level: 0, str: 13, dex: 6, con: 16, int: 3, wis: 6, cha: 5, hp: 22, ac: 8, speedFt: 20, weapon: 'Slam', bonus: 3, dice: '1d6+1', type: 'bludgeoning', saves: { wis: 0 }, traits: ['undead-fortitude'], traitNames: ['Undead Fortitude'] }),
    // Placeholder PC until character sheets are wired in: a level-2-ish fighter with a longsword.
    adventurer: () => block({ name: 'Adventurer', cr: 1, level: 2, str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 10, hp: 20, ac: 16, speedFt: 30, weapon: 'Longsword', bonus: 5, dice: '1d8+3', type: 'slashing', saves: { str: 5, con: 4 } }),
  };

  G.makeStats = (roleKey, tags = []) => {
    const role = G.roles[roleKey] || G.roles.citizen;
    const index = G.monsterFor(roleKey, tags);
    if (index && G.srd && G.srd.ready) {
      const s = G.srd.statsFor(index);
      if (s) return s;
      console.warn(`[roles] no SRD monster "${index}", using fallback`);
    }
    const fb = fallbacks[index] || fallbacks[role.fallback] || fallbacks.commoner;
    return fb();
  };
  G.statMod = mod;
})(window.GeezTown = window.GeezTown || {});
