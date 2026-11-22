// Status conditions on tokens: stored at tokens/<id>/conditions {name: true}, drawn as coloured rings around the token.
export const CONDITIONS = {
  blinded: ["Blinded", "#6b6b6b"], charmed: ["Charmed", "#e87bc0"], deafened: ["Deafened", "#a89878"], frightened: ["Frightened", "#a46be0"],
  grappled: ["Grappled", "#c8871c"], incapacitated: ["Incapacitated", "#8a7a5a"], invisible: ["Invisible", "#9fd8e8"], paralyzed: ["Paralyzed", "#e0d040"],
  petrified: ["Petrified", "#b0b0b0"], poisoned: ["Poisoned", "#58c46a"], prone: ["Prone", "#8a5a2c"], restrained: ["Restrained", "#d06a3c"],
  stunned: ["Stunned", "#4aa3e8"], unconscious: ["Unconscious", "#3a3a8a"], concentrating: ["Concentrating", "#40d0d0"], bleeding: ["Bleeding", "#c0392b"],
};
export const conditionsOf = (t) => Object.keys(t.conditions || {}).filter((k) => CONDITIONS[k]);
