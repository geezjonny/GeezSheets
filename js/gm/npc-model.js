// A random NPC from the Character Forge roller tables, with a stat block borrowed from the SRD monsters.
export const STAT_BLOCKS = { Guard: 'Guard', Thief: 'Bandit', Hunter: 'Scout', Messenger: 'Scout', Apothecary: 'Acolyte', Herbalist: 'Acolyte' };
const CHILD_JOBS = 'Child';

export function rollNpc(tables, { race = '', profession = '' } = {}, random = Math.random) {
  const pick = (list) => list[Math.floor(random() * list.length)];
  const weighted = (list) => {
    let roll = random() * list.reduce((sum, [, weight]) => sum + weight, 0);
    return (list.find(([, weight]) => (roll -= weight) < 0) || list[list.length - 1])[0];
  };
  const t = tables.tables;
  const ancestry = race || pick(t.Race), age = pick(t.Age), child = age === CHILD_JOBS;
  const job = profession || pick(t.Profession);
  const names = tables.names[ancestry] || tables.names.Human;
  const first = random() < 0.5 ? pick(names.first) : pick(names.begin) + pick(names.end);
  return {
    first_name: first, surname: pick(names.sur), ancestry, age, height: child ? 'Small' : pick(t.Height),
    profession: child ? CHILD_JOBS : job, demeanor: pick(t.Demeanor), secret: pick(t.Secret),
    appearance: {
      skin: pick(tables.skins[ancestry] || tables.skins.Human), hair: pick(t['Hair color']), facial_features: pick(t['Facial features']),
      facial_hair: child ? 'None' : pick(t['Facial hair']), distinctive_feature: pick(t['Discernible feature'])
    },
    gear: { weapon: child ? 'None' : tables.weapons[job] ? weighted(tables.weapons[job]) : 'None', armor: job === 'Guard' && !child ? 'Chain shirt' : 'None' }
  };
}
export const npcName = (npc) => `${npc.first_name} ${npc.surname}`.trim();

const modifier = (score) => Math.floor((score - 10) / 2);
// The database record, in the same shape as the NPCs already in Gaia.
export function npcEntity(id, npc, monster, campaign, now = new Date().toISOString()) {
  const stats = { str: monster.strength, dex: monster.dexterity, con: monster.constitution, int: monster.intelligence, wis: monster.wisdom, cha: monster.charisma };
  return {
    id, kind: 'npc', name: npcName(npc), world: 'gaia', campaign, tags: [],
    source: { system: 'gm-companion', id: `characters/npcs/${id}` },
    meta: { schema: 1, created_at: now, updated_at: now, updated_by: 'gm-companion' },
    data: {
      profile: npc, disposition: 'neutral', status: 'alive',
      statblock: {
        alignment: monster.alignment || '', creature_type: monster.type || '', size: String(monster.size || 'medium').toLowerCase(),
        cr: String(monster.challenge_rating ?? ''), stats,
        combat: {
          ac: monster.armor_class?.[0]?.value ?? 10, hp_current: monster.hit_points, hp_max: monster.hit_points, temp_hp: 0,
          initiative_bonus: modifier(stats.dex), proficiency_bonus: monster.proficiency_bonus ?? 2, speed: String(parseInt(monster.speed?.walk, 10) || 30)
        }
      },
      stat_block_name: monster.name
    }
  };
}
