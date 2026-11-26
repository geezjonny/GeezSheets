// Outline of each die in a 100×100 box (from GeezVTT dice2d.js).
const SHAPES = {
  4: '50,8 94,86 6,86',
  6: '14,14 86,14 86,86 14,86',
  8: '50,4 94,50 50,96 6,50',
  10: '50,4 92,40 50,96 8,40',
  12: '50,5 95,38 78,92 22,92 5,38',
  20: '50,4 92,27 92,73 50,96 8,73 8,27',
  100: '50,4 92,40 50,96 8,40'
};
export function diePoints(sides) { return SHAPES[sides] || SHAPES[6]; }
