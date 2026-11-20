import { $, dragSource } from '../core.js';
import { CONDITIONS } from '../../vtt/conditions.js';

export default { id: 'conditions', title: 'Conditions', pos: { x: 40, y: 390, w: 280 }, build({ body }) {
  const chips = $('div', { className: 'chips' });
  for (const [key, [label, color]] of Object.entries(CONDITIONS)) { const b = $('button', { textContent: label, title: key }); b.style.borderColor = color; dragSource(b, { type: 'condition', name: label }); chips.append(b); }
  body.append(chips);
} };
