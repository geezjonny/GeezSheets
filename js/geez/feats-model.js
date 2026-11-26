import { changeEffects } from './effects-model.js';
import { itemEquipped } from './inventory-model.js';

export function featEntries(pc) {
  return ['abilities', 'feats'].flatMap(group => Object.entries(pc[group] || {}).flatMap(([key, value]) => {
    const feat = typeof value === 'string' ? { name: value } : value;
    const name = feat?.label || feat?.name;
    // Feats granted by a card only show while that card is equipped.
    const card = feat?.cardKey && Object.hasOwn(pc.inventory || {}, feat.cardKey) ? pc.inventory[feat.cardKey] : null;
    return name && (!feat.cardKey || card && itemEquipped(pc, card)) ? [{ ...feat, name, id: `${group}:${key}` }] : [];
  }));
}

export function featUses(feat) {
  const max = feat.max, current = feat.current ?? max;
  return Number.isSafeInteger(max) && max > 0 && max <= 999 && Number.isSafeInteger(current) && current >= 0 && current <= max
    ? { max, current } : null;
}

export function changeFeat(pc, action) {
  const feat = featEntries(pc).find(feat => feat.id === action.id);
  if (!feat) throw new Error('Feat is unavailable.');
  if (action.type === 'use' && Array.isArray(feat.modifiers)) {
    changeEffects(pc, { type: 'activate', id: feat.id });
    return;
  }
  const uses = featUses(feat);
  if (!uses) throw new Error('This feat has no tracked uses.');
  let current;
  if (action.type === 'use') {
    if (uses.current <= 0) throw new Error('No uses remaining.');
    current = uses.current - 1;
  } else if (action.type === 'pip' && Number.isSafeInteger(action.pip) && action.pip >= 0 && action.pip < uses.max) {
    current = uses.current + (action.pip < uses.max - uses.current ? 1 : -1);
  } else throw new Error('Invalid feat action.');
  const separator = action.id.indexOf(':');
  pc[action.id.slice(0, separator)][action.id.slice(separator + 1)].current = current;
}
