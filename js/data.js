// data.js — central lazy-loading cache for all /data JSONs
// Every other module imports from here instead of fetching independently
// Files are loaded once on first request, then served from memory

const BASE = "./data/";
const _cache = {};

async function load(file) {
  if (_cache[file]) return _cache[file];
  try {
    const res = await fetch(BASE + file);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    _cache[file] = await res.json();
  } catch (e) {
    console.warn(`[data.js] Could not load ${file}:`, e.message);
    _cache[file] = [];
  }
  return _cache[file];
}

// ── Accessors ─────────────────────────────────────────────────────────────────
export const getAbilityScores      = () => load("ability_scores.json");
export const getAlignments         = () => load("alignments.json");
export const getBackgrounds        = () => load("backgrounds.json");
export const getClassLevels        = () => load("class_levels.json");
export const getClasses            = () => load("classes.json");
export const getConditions         = () => load("conditions.json");
export const getDamageTypes        = () => load("damage_types.json");
export const getEquipment          = () => load("equipment.json");
export const getEquipmentCategories= () => load("equipment_categories.json");
export const getFeats              = () => load("feats.json");
export const getFeatures           = () => load("features.json");
export const getLanguages          = () => load("languages.json");
export const getMagicItems         = () => load("magic_items.json");
export const getMagicSchools       = () => load("magic_schools.json");
export const getMonsters           = () => load("monsters.json");
export const getRaces              = () => load("races.json");
export const getResources          = () => load("resources.json");
export const getRuleSections       = () => load("rule_sections.json");
export const getRules              = () => load("rules.json");
export const getSkills             = () => load("skills.json");
export const getSpells             = () => load("spells.json");
export const getTraits             = () => load("traits.json");
export const getWeaponProperties   = () => load("weapon_properties.json");

// ── Preload a subset (call on app init for fast first access) ─────────────────
export async function preloadCore() {
  await Promise.all([
    getSpells(),
    getConditions(),
    getEquipment(),
    getMagicItems(),
    getSkills(),
    getMonsters(),
    getWeaponProperties(),
    getDamageTypes(),
  ]);
}

// ── Lookup helpers ────────────────────────────────────────────────────────────

// Find by name (case-insensitive)
export async function findSpell(name) {
  const data = await getSpells();
  return data.find(s => s.name.toLowerCase() === name.toLowerCase()) || null;
}

export async function findCondition(name) {
  const data = await getConditions();
  return data.find(c => c.name.toLowerCase() === name.toLowerCase()) || null;
}

export async function findMonster(name) {
  const data = await getMonsters();
  return data.find(m => m.name.toLowerCase() === name.toLowerCase()) || null;
}

export async function findEquipment(name) {
  const data = await getEquipment();
  return data.find(e => e.name.toLowerCase() === name.toLowerCase()) || null;
}

export async function findMagicItem(name) {
  const data = await getMagicItems();
  return data.find(m => m.name.toLowerCase() === name.toLowerCase()) || null;
}

export async function findFeat(name) {
  const data = await getFeats();
  return data.find(f => f.name.toLowerCase() === name.toLowerCase()) || null;
}

export async function findWeaponProperty(name) {
  const data = await getWeaponProperties();
  return data.find(p => p.name.toLowerCase() === name.toLowerCase()) || null;
}

export async function findDamageType(name) {
  const data = await getDamageTypes();
  return data.find(d => d.name.toLowerCase() === name.toLowerCase()) || null;
}

export async function findRace(name) {
  const data = await getRaces();
  return data.find(r => r.name.toLowerCase() === name.toLowerCase()) || null;
}

export async function findBackground(name) {
  const data = await getBackgrounds();
  return data.find(b => b.name.toLowerCase() === name.toLowerCase()) || null;
}

export async function findClass(name) {
  const data = await getClasses();
  return data.find(c => c.name.toLowerCase() === name.toLowerCase()) || null;
}

// ── Magic items by rarity ─────────────────────────────────────────────────────
export async function getMagicItemsByRarity(rarity) {
  const data = await getMagicItems();
  return data.filter(m => {
    const r = (m.rarity?.name || "").toLowerCase().replace(/\s+/g, "_");
    return r === rarity.toLowerCase().replace(/\s+/g, "_");
  });
}

// ── Equipment by category ─────────────────────────────────────────────────────
export async function getEquipmentByCategory(category) {
  const data = await getEquipment();
  return data.filter(e =>
    e.equipment_category?.name?.toLowerCase() === category.toLowerCase()
  );
}

// ── Full-text search across all data ─────────────────────────────────────────
// Returns { type, item } objects, up to `limit` results
export async function searchAll(query, limit = 10) {
  const q = query.toLowerCase().trim();
  if (!q) return [];

  const sources = [
    { type: "Spell",           data: await getSpells()           },
    { type: "Condition",       data: await getConditions()       },
    { type: "Monster",         data: await getMonsters()         },
    { type: "Equipment",       data: await getEquipment()        },
    { type: "Magic Item",      data: await getMagicItems()       },
    { type: "Feat",            data: await getFeats()            },
    { type: "Feature",         data: await getFeatures()         },
    { type: "Race",            data: await getRaces()            },
    { type: "Background",      data: await getBackgrounds()      },
    { type: "Class",           data: await getClasses()          },
    { type: "Weapon Property", data: await getWeaponProperties() },
    { type: "Damage Type",     data: await getDamageTypes()      },
    { type: "Rule",            data: await getRules()            },
    { type: "Trait",           data: await getTraits()           },
    { type: "Language",        data: await getLanguages()        },
  ];

  const results = [];
  for (const { type, data } of sources) {
    if (!Array.isArray(data)) continue;
    for (const item of data) {
      if (!item.name) continue;
      if (item.name.toLowerCase().includes(q)) {
        results.push({ type, item });
        if (results.length >= limit) return results;
      }
    }
  }
  return results;
}
