// Roll results are independent of how the dice are animated.
export function randomDie(sides) {
  const limit = Math.floor(0x100000000 / sides) * sides;
  const value = new Uint32Array(1);
  do { globalThis.crypto.getRandomValues(value); } while (value[0] >= limit);
  return value[0] % sides + 1;
}

export function buildRoll({ sides, count, modifier, mode }, random = randomDie) {
  if (![4, 6, 8, 10, 12, 20, 100].includes(sides) ||
      !Number.isInteger(count) || count < 1 || count > (sides === 100 ? 6 : 12) ||
      !Number.isInteger(modifier) || Math.abs(modifier) > 999 ||
      !['normal', 'advantage', 'disadvantage'].includes(mode) ||
      (mode !== 'normal' && (sides !== 20 || count !== 1))) {
    throw new Error('Choose up to 12 dice (6 for d100). Advantage and disadvantage use one d20.');
  }
  const dice = Array.from({ length: mode === 'normal' ? count : 2 }, () => ({ s: sides, v: random(sides) }));
  if (mode !== 'normal') {
    const keepFirst = mode === 'advantage' ? dice[0].v >= dice[1].v : dice[0].v <= dice[1].v;
    dice[keepFirst ? 1 : 0].drop = true;
  }
  const kept = dice.filter(d => !d.drop);
  const total = kept.reduce((sum, d) => sum + d.v, modifier);
  const suffix = modifier ? ` ${modifier > 0 ? '+' : '-'} ${Math.abs(modifier)}` : '';
  const label = `${count}d${sides}${suffix}${mode === 'normal' ? '' : ` (${mode})`}`;
  const sub = dice.map(d => `${d.v}${d.drop ? ' dropped' : ''}`).join(', ');
  const natural = sides === 20 && count === 1 ? kept[0].v : null;
  return { dice, total, label, sub, cls: natural === 20 ? 'crit' : natural === 1 ? 'bad' : '', color: '#8b1e2b' };
}

export function buildExpressionRoll(expression, mode = 'normal', random = randomDie) {
  const value = String(expression).toLowerCase().replace(/\s+(?:acid|bludgeoning|cold|fire|force|lightning|necrotic|piercing|poison|psychic|radiant|slashing|thunder)(?:\s+damage)?\s*$/, '').replace(/\s+/g, '').replace(/−/g, '-');
  if (value.length > 200 || !/^[+]?(?:\d*d\d+|-?\d+)(?:[+-](?:\d*d\d+|\d+))*$/.test(value)) {
    throw new Error('Use a dice formula such as 1d20+4 or 1d8+1d6+3.');
  }
  const groups = [], dice = [];
  let modifier = 0;
  for (const term of value.match(/[+-]?[^+-]+/g)) {
    if (!term.includes('d')) { modifier += Number(term); continue; }
    const [count, sides] = term.replace(/^\+/, '').split('d');
    if (term.startsWith('-')) throw new Error('Dice counts must be positive.');
    groups.push({ count: count === '' ? 1 : Number(count), sides: Number(sides), modifier: 0, mode: 'normal' });
  }
  if (!Number.isSafeInteger(modifier) || Math.abs(modifier) > 999 || groups.reduce((sum, group) => sum + group.count, 0) > 12 ||
      groups.filter(group => group.sides === 100).reduce((sum, group) => sum + group.count, 0) > 6) {
    throw new Error('Choose up to 12 dice and a modifier from -999 to 999.');
  }
  if (groups.length === 1) return buildRoll({ ...groups[0], modifier, mode }, random);
  if (mode !== 'normal') throw new Error('Advantage and disadvantage use one d20.');
  // Validate every group before generating any result.
  for (const group of groups) buildRoll(group, () => 1);
  for (const group of groups) dice.push(...buildRoll(group, random).dice);
  return { dice, total: dice.reduce((sum, die) => sum + die.v, modifier), label: value,
    sub: dice.map(die => die.v).join(', '), cls: '', color: '#8b1e2b' };
}
