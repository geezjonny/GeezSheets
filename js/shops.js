// shops.js — randomized shops stocked from the SRD (equipment.json, magic_items.json) plus
// custom goods, driven by data/shops.json.
//
// One currency: coin. SRD prices (gp/sp/cp) are converted once using "coinValue" in shops.json
// (default: 1 coin = 1 sp, so a 15 gp longsword costs 150 coin). Everything else in shops.json —
// shop gold, custom goods, magic item prices — is written directly in coin.
//
//   await G.shops.load('data/');
//   const shop = G.shops.ensure(shopkeeper, { day, zone });   // rolls / restocks e.shop
//   G.shops.buyPrice(shop, item, buyerId)  /  G.shops.sellPrice(shop, item, sellerId)
//   G.shops.buy(shop, key, pc) / G.shops.sell(shop, key, pc)  -> { ok, msg }
//   G.shops.haggle(shop, pc)                                  -> { success, msg } (once per shop per day)
//   G.shops.npcPurchase(shop, budget)                          -> item bought by a townsperson, or null
(function (G) {
  const CP = { cp: 1, sp: 10, ep: 50, gp: 100, pp: 1000 };
  const hash = (s) => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
  const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const between = (R, [a, b]) => a + Math.floor(R() * (b - a + 1));
  const toCp = (cost) => { // SRD cost -> copper, only used to convert into coin
    if (cost == null) return 0;
    if (typeof cost === 'object') return Math.round((cost.quantity || 0) * (CP[cost.unit] || 1));
    const m = String(cost).trim().match(/^([\d.]+)\s*(cp|sp|ep|gp|pp)?$/i);
    return m ? Math.round(parseFloat(m[1]) * (CP[(m[2] || 'gp').toLowerCase()] || 100)) : 0;
  };
  const money = (n) => `${Math.max(0, Math.round(n)).toLocaleString()} coin`;
  let coinCp = 10; // copper per coin, set from shops.json coinValue
  const toCoins = (cost) => Math.max(1, Math.round(toCp(cost) / coinCp)); // nothing costs less than 1 coin

  const shops = {
    ready: false,
    equipment: [], magic: [], types: null, defaultType: 'general',
    money, toCp, toCoins,

    async load(base = 'data/') {
      const get = async (f) => { const r = await fetch(base + f); if (!r.ok) throw new Error(`${f}: HTTP ${r.status}`); return r.json(); };
      const [eq, mi, cfg] = await Promise.all([
        get('equipment.json').catch(() => []),
        get('magic_items.json').catch(() => []),
        get('shops.json').catch((e) => { console.warn('[shops] data/shops.json missing, using built-in shop types:', e.message); return BUILTIN; }),
      ]);
      this.equipment = eq.filter((e) => toCp(e.cost) > 0 && e.equipment_category.index !== 'mounts-and-vehicles');
      this.magic = mi.filter((m) => !m.variants || !m.variants.length); // variant parents ("Armor, +1") have no single price
      this.types = cfg.types; this.rarityPrice = cfg.rarityPrice || BUILTIN.rarityPrice; this.defaultType = cfg.default || 'general';
      coinCp = toCp(cfg.coinValue || BUILTIN.coinValue) || 10;
      this.ready = true;
      return this;
    },

    // Which shop type fits: an explicit 'shop:<type>' tag, else words in the shopkeeper's zone name/tags.
    typeFor(e, zone) {
      const tag = (e.tags || []).find((t) => t.startsWith('shop:'));
      if (tag && this.types[tag.slice(5)]) return tag.slice(5);
      // Zone name first ("Smithy", "The Rusty Anchor Inn"), then zone tags; the default type is only a fallback.
      const specific = Object.entries(this.types).filter(([k]) => k !== this.defaultType);
      for (const text of [zone ? zone.name : '', zone ? (zone.tags || []).join(' ') : '']) {
        const words = String(text).toLowerCase();
        for (const [k, t] of specific) if ((t.match || []).some((w) => words.includes(w))) return k;
      }
      return this.defaultType;
    },

    // Create the shop on first use and restock it each new day. Stock is seeded by shopkeeper + day.
    ensure(e, { day = 1, zone = null } = {}) {
      if (!this.ready) return null;
      if (e.shop && e.shop.day === day) return e.shop;
      const type = e.shop ? e.shop.type : this.typeFor(e, zone);
      const T = this.types[type] || this.types[this.defaultType];
      const R = rng(hash(`${e.id}|${day}`));
      const inventory = [];
      const addItem = (it, qtyRange) => {
        const found = inventory.find((x) => x.name === it.name);
        if (found) { found.qty += 1; return; }
        inventory.push({ ...it, key: `${it.kind}:${it.index || it.name}`, qty: between(R, qtyRange || [1, 1]) });
      };
      const eqItem = (x) => ({ kind: 'equipment', index: x.index, name: x.name, category: x.equipment_category.index, gear: x.gear_category ? x.gear_category.index : null, base: toCoins(x.cost) });

      for (const rule of T.stock || []) {
        let pool = this.equipment;
        if (rule.names) pool = pool.filter((x) => rule.names.includes(x.name));
        if (rule.category) pool = pool.filter((x) => x.equipment_category.index === rule.category);
        if (rule.gear) pool = pool.filter((x) => x.gear_category && x.gear_category.index === rule.gear);
        if (rule.maxPrice) pool = pool.filter((x) => toCoins(x.cost) <= rule.maxPrice);
        const n = between(R, rule.count || [1, 1]);
        for (let i = 0; i < n && pool.length; i++) addItem(eqItem(pool[Math.floor(R() * pool.length)]), rule.qty);
      }
      for (const x of T.extras || []) if (R() < (x.chance ?? 1)) addItem({ kind: 'extra', index: null, name: x.name, category: x.category || 'goods', base: Math.max(1, Math.round(+x.cost || 1)) }, x.qty);
      if (T.magic && R() < (T.magic.chance ?? 0)) {
        const pool = this.magic.filter((m) => (!T.magic.categories || T.magic.categories.includes(m.equipment_category.index)) && (!T.magic.rarity || T.magic.rarity.includes(m.rarity.name)));
        const n = between(R, T.magic.count || [1, 1]);
        for (let i = 0; i < n && pool.length; i++) {
          const m = pool[Math.floor(R() * pool.length)];
          const range = this.rarityPrice[m.rarity.name] || [100, 500];
          addItem({ kind: 'magic', index: m.index, name: m.name, category: m.equipment_category.index, rarity: m.rarity.name, base: between(R, range) }, [1, 1]);
        }
      }
      e.shop = {
        type, label: T.label || type, owner: e.id, ownerName: e.name, day,
        markup: T.markup ? T.markup[0] + R() * (T.markup[1] - T.markup[0]) : 1,
        buyRate: T.buyRate ?? 0.5, buys: T.buys || ['*'],
        gold: between(R, T.gold || [500, 2000]),
        inventory, haggled: {}, // buyerId -> price factor for today
        ledger: [],             // today's sales to townsfolk, newest first
      };
      return e.shop;
    },

    willBuy(shop, item) { return shop.buys.includes('*') || shop.buys.includes(item.category) || (item.gear && shop.buys.includes(item.gear)); },
    buyPrice(shop, item, buyerId) { return Math.max(1, Math.round(item.base * shop.markup * (shop.haggled[buyerId] ?? 1))); },
    sellPrice(shop, item, sellerId) {
      if (!this.willBuy(shop, item)) return 0;
      const h = shop.haggled[sellerId] ?? 1; // a good haggle also gets you more when selling
      return Math.max(1, Math.round(item.base * shop.buyRate * (2 - h)));
    },

    buy(shop, key, pc) {
      const item = shop.inventory.find((x) => x.key === key);
      if (!item || item.qty <= 0) return { ok: false, msg: 'Sold out.' };
      const price = this.buyPrice(shop, item, pc.id);
      if ((pc.purse || 0) < price) return { ok: false, msg: `You need ${money(price)}.` };
      pc.purse -= price; shop.gold += price; item.qty--;
      if (item.qty <= 0) shop.inventory = shop.inventory.filter((x) => x !== item);
      const mine = (pc.items ||= []).find((x) => x.key === key);
      if (mine) mine.qty++; else pc.items.push({ ...item, qty: 1 });
      return { ok: true, msg: `Bought ${item.name} for ${money(price)}.`, price, item };
    },

    sell(shop, key, pc) {
      const mine = (pc.items || []).find((x) => x.key === key);
      if (!mine) return { ok: false, msg: 'You don\'t have that.' };
      const price = this.sellPrice(shop, mine, pc.id);
      if (!price) return { ok: false, msg: `${shop.ownerName} doesn't deal in that.` };
      if (shop.gold < price) return { ok: false, msg: `${shop.ownerName} can't afford it (${money(shop.gold)} on hand).` };
      pc.purse = (pc.purse || 0) + price; shop.gold -= price; mine.qty--;
      if (mine.qty <= 0) pc.items = pc.items.filter((x) => x !== mine);
      const there = shop.inventory.find((x) => x.key === key);
      if (there) there.qty++; else shop.inventory.push({ ...mine, qty: 1 });
      return { ok: true, msg: `Sold ${mine.name} for ${money(price)}.`, price, item: mine };
    },

    // Persuasion vs the shopkeeper: d20 + CHA mod + 2 against DC 12. Win: 10–25% off today.
    // Blow it by 5+: they're annoyed and charge 10% more today.
    haggle(shop, pc) {
      if (shop.haggled[pc.id] != null) return { success: null, msg: `${shop.ownerName} has already settled on a price with you today.` };
      const roll = G.rules.die(20), total = roll + G.rules.mod(pc.stats.cha || 10) + 2, dc = 12;
      if (total >= dc) {
        const off = Math.min(0.25, 0.1 + (total - dc) * 0.015);
        shop.haggled[pc.id] = 1 - off;
        return { success: true, roll, total, dc, msg: `Persuasion ${total} vs ${dc}: ${shop.ownerName} knocks ${Math.round(off * 100)}% off for you today.` };
      }
      if (total <= dc - 5) { shop.haggled[pc.id] = 1.1; return { success: false, roll, total, dc, msg: `Persuasion ${total} vs ${dc}: ${shop.ownerName} is offended. Prices are 10% higher for you today.` }; }
      shop.haggled[pc.id] = 1;
      return { success: false, roll, total, dc, msg: `Persuasion ${total} vs ${dc}: ${shop.ownerName} won't budge.` };
    },

    // A townsperson buys something they can afford (budget in coin), favouring cheap everyday goods.
    npcPurchase(shop, budget) {
      const affordable = shop.inventory.filter((x) => x.qty > 0 && x.kind !== 'magic' && this.buyPrice(shop, x, 'npc') <= budget);
      if (!affordable.length) return null;
      affordable.sort((a, b) => a.base - b.base);
      const item = affordable[Math.floor(Math.pow(Math.random(), 2) * affordable.length)]; // skew toward the cheap end
      const price = this.buyPrice(shop, item, 'npc');
      item.qty--; shop.gold += price;
      if (item.qty <= 0) shop.inventory = shop.inventory.filter((x) => x !== item);
      return { item, price };
    },
  };

  // Used when data/shops.json is missing. Same shape as the file.
  const BUILTIN = {
    default: 'general',
    coinValue: '1 sp', // what one coin is worth in SRD money; SRD item prices are converted with this
    // Everything below is in coin.
    rarityPrice: { Common: [500, 1000], Uncommon: [1000, 5000], Rare: [5000, 50000], 'Very Rare': [50000, 500000], Legendary: [500000, 2000000] },
    types: {
      blacksmith: {
        label: 'Blacksmith', match: ['smith', 'forge', 'armor', 'armour', 'weapon'],
        stock: [{ category: 'weapon', count: [5, 9], qty: [1, 3] }, { category: 'armor', count: [2, 4], qty: [1, 2] }, { gear: 'ammunition', count: [1, 2], qty: [2, 5] }],
        magic: { chance: 0.15, categories: ['weapon', 'armor'], rarity: ['Uncommon'], count: [1, 1] },
        markup: [1.0, 1.25], buyRate: 0.5, buys: ['weapon', 'armor', 'ammunition'], gold: [1500, 5000],
      },
      general: {
        label: 'General Store', match: ['general', 'store', 'market', 'trader'],
        stock: [{ gear: 'standard-gear', count: [8, 14], qty: [1, 6], maxPrice: 500 }, { gear: 'kits', count: [1, 2], qty: [1, 2] }, { category: 'tools', count: [1, 3], qty: [1, 1] }, { gear: 'equipment-packs', count: [0, 2], qty: [1, 2] }],
        markup: [0.95, 1.2], buyRate: 0.5, buys: ['*'], gold: [800, 3000],
      },
      apothecary: {
        label: 'Apothecary', match: ['apothecary', 'alchemist', 'herb', 'potion', 'temple', 'healer'],
        stock: [{ names: ['Antitoxin (vial)', "Healer's Kit", 'Herbalism Kit', 'Acid (vial)', "Alchemist's fire (flask)", 'Perfume (vial)', 'Oil (flask)'], count: [3, 5], qty: [1, 4] }],
        magic: { chance: 1, categories: ['potion'], rarity: ['Common', 'Uncommon'], count: [1, 3] },
        markup: [1.05, 1.3], buyRate: 0.45, buys: ['potion', 'adventuring-gear'], gold: [1000, 4000],
      },
      tavern: {
        label: 'Tavern', match: ['tavern', 'inn', 'pub', 'alehouse'],
        stock: [{ names: ['Rations (1 day)'], count: [1, 1], qty: [5, 12] }],
        extras: [
          { name: 'Ale (mug)', cost: 1, qty: [20, 40] }, { name: 'Wine (pitcher)', cost: 2, qty: [5, 12] },
          { name: 'Hot meal', cost: 3, qty: [10, 20] }, { name: 'Room for the night', cost: 5, qty: [2, 6] },
          { name: 'Local gossip over a drink', cost: 1, qty: [3, 6], chance: 0.6 },
        ],
        markup: [1.0, 1.15], buyRate: 0.3, buys: [], gold: [300, 1200],
      },
      arcane: {
        label: 'Arcane Curios', match: ['arcane', 'magic', 'wizard', 'curio', 'library'],
        stock: [{ gear: 'arcane-foci', count: [1, 3], qty: [1, 2] }, { names: ['Component pouch', 'Spellbook', 'Ink (1 ounce bottle)', 'Ink pen', 'Paper (one sheet)', 'Parchment (one sheet)'], count: [2, 4], qty: [1, 5] }],
        magic: { chance: 0.9, categories: ['scroll', 'potion', 'wondrous-items', 'ring', 'wand'], rarity: ['Common', 'Uncommon'], count: [1, 3] },
        markup: [1.1, 1.4], buyRate: 0.5, buys: ['scroll', 'potion', 'wondrous-items', 'ring', 'wand', 'staff', 'rod'], gold: [3000, 12000],
      },
    },
  };
  shops.BUILTIN = BUILTIN;
  G.shops = shops;
})(window.GeezTown = window.GeezTown || {});
