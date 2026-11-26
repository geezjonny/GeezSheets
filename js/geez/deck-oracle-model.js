import { CREATOR_KINDS } from './character-creator-model.js';
import { EFFECT_TARGETS } from './effects-model.js';

export const ORACLE_FIELDS = ['level', 'prepared', 'concentration', 'cast_time', 'range', 'duration', 'damage', 'healing', 'save_stat', 'save_dc', 'to_hit',
  'damage_type', 'ability', 'category', 'qty', 'weight', 'max', 'recharge', 'duration_minutes', 'mode', 'operation', 'target', 'value', 'consumable_kind', 'consumable_dice', 'item_ac'];
export const ORACLE_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['kind', 'name', 'description', 'scaling', 'fields', 'modifiers'],
  properties: {
    kind: { type: 'string', enum: CREATOR_KINDS }, name: { type: 'string', maxLength: 100 },
    description: { type: 'string', maxLength: 12000 }, scaling: { type: 'string', maxLength: 2000 },
    fields: { type: 'array', maxItems: 32, items: { type: 'object', additionalProperties: false, required: ['name', 'value'],
      properties: { name: { type: 'string', enum: ORACLE_FIELDS }, value: { type: 'string', maxLength: 200 } } } },
    modifiers: { type: 'array', maxItems: 10, items: { type: 'object', additionalProperties: false, required: ['target', 'operation', 'value'],
      properties: { target: { type: 'string', enum: EFFECT_TARGETS }, operation: { type: 'string', enum: ['add', 'multiply', 'set'] }, value: { type: 'number', minimum: -999, maximum: 999999 } } } }
  }
};

export function oracleRequest(bargain, draw, model) {
  if (!bargain?.words || bargain.words.length !== 3 || !Number.isSafeInteger(draw) || draw < 1 || draw > 999) throw new Error('Roll three words and choose a draw number from 1 to 999.');
  if (typeof model !== 'string' || !model.trim() || model.length > 100) throw new Error('Enter an Ollama model name.');
  return {
    model: model.trim(), stream: false, think: false, format: ORACLE_SCHEMA,
    options: { temperature: .8, num_predict: 2048 },
    system: `You are the GM's oracle for a homebrew D&D Deck of Chance. Return JSON matching the supplied schema. Interpret ALL THREE words together imaginatively, from silly to serious. Do not simply repeat definitions. Give ONE definite playable creation: Spell, Weapon, Item, Effect, Feat, or Stat. Describe exact targets, amounts, timing, limits, saves and failure consequences. Do not claim you have changed a character.
The draw number is the multiplier. Scale ONE appropriate quantity (duration, amount, creature count or daily uses). Apply that multiplier once, already reflected in the output. Do not multiply save DCs or size categories. A permanent ability stays on the sheet even if each activation lasts only a minute. Conditional rules are described for the GM; only numeric stat modifiers and tracked uses are automated by the sheet.
Example: Invisible Bones Giggles grants permanent invisibility for one minute, draw-number uses per day, refreshed at dawn. At the start of each invisible turn make a DC 12 Wisdom save; failure causes loud laughter and immediately ends invisibility. Attacking or casting a spell ends it too. The bones briefly show through the fading body. Use Feat, max=draw number, recharge=daily, duration_minutes=1, mode=activated, modifiers=[]. Do not invent a numeric modifier to represent invisibility.
Creator fields are strings in the fields array, e.g. {"name":"max","value":"3"}. Always supply the relevant type's fields. For Feat/Effect use mode=activated or passive, max (0=unlimited, at most 999), recharge=none/daily/short_rest/long_rest/short_or_long_rest, duration_minutes (0=until ended, at most 525600). For Stat use target from the supplied modifier target list, operation=add/multiply/set and value. For Weapon use damage like 1d6+2, to_hit as base bonus, damage_type and ability=str/dex/etc. For Spell use level=0..9, prepared=true, cast_time, range, duration, damage or healing dice, save_stat=str/dex/con/int/wis/cha, save_dc, optional to_hit; blank attack/DC uses the sheet. For Item use category=Adventuring Gear/Consumable/Weapon/Armor, qty, weight, item_ac, optional consumable_kind=healing/damage and consumable_dice. Dice expressions must use at most 12 dice of d4/d6/d8/d10/d12/d20 (6 for d100), with a flat modifier. Feat/Effect/Stat modifiers use only the targets and operations in the schema. When adding multiple consequences, keep them consistent with the main creation. The description must include every consequence and exact scaling. Choose sensible small base values; leave story effects in the description.`,
    prompt: JSON.stringify({ omen: bargain.name, words: bargain.words.map(word => word[0]), drawNumber: draw,
      instruction: 'Interpret this omen. Write the full mechanical description, already scaled to this draw number, and fields for an editable creator draft.' })
  };
}

export function parseOracleDraft(value) {
  if (!value || !CREATOR_KINDS.includes(value.kind)) throw new Error('Oracle returned an unknown creation type.');
  for (const [key, limit] of [['name', 100], ['description', 12000], ['scaling', 2000]]) {
    if (typeof value[key] !== 'string' || !value[key].trim() || value[key].length > limit) throw new Error(`Oracle returned invalid ${key}.`);
  }
  if (!Array.isArray(value.fields) || value.fields.length > 32 || !Array.isArray(value.modifiers) || value.modifiers.length > 10) throw new Error('Oracle returned too many fields or modifiers.');
  const fields = value.fields.map(field => {
    if (!field || !ORACLE_FIELDS.includes(field.name) || typeof field.value !== 'string' || field.value.length > 200) throw new Error('Oracle returned an invalid creator field.');
    return { name: field.name, value: field.value };
  });
  if (new Set(fields.map(field => field.name)).size !== fields.length) throw new Error('Oracle returned duplicate creator fields.');
  const required = { Spell: ['level'], Weapon: ['damage', 'to_hit'], Item: ['category', 'qty'],
    Feat: ['mode', 'max', 'recharge', 'duration_minutes'], Effect: ['mode', 'duration_minutes'], Stat: ['target', 'operation', 'value'] }[value.kind];
  if (required.some(name => !fields.some(field => field.name === name && field.value.trim()))) throw new Error('Oracle omitted required creation fields. Ask again.');
  const modifiers = value.modifiers.map(modifier => {
    if (!modifier || !EFFECT_TARGETS.includes(modifier.target) || !['add', 'multiply', 'set'].includes(modifier.operation) ||
      !Number.isFinite(modifier.value) || modifier.value < (modifier.operation === 'add' ? -999 : 0) || modifier.value > (modifier.operation === 'multiply' ? 10 : 999999)) throw new Error('Oracle returned an invalid modifier.');
    return { target: modifier.target, operation: modifier.operation, value: modifier.value };
  });
  return { kind: value.kind, name: value.name, description: value.description, scaling: value.scaling, fields, modifiers };
}

export function ollamaURL(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Use a local Ollama URL, such as http://localhost:11434.');
  return new URL('/api/generate', url).href;
}
