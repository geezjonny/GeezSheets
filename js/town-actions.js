// town-actions.js — what a creature can do on its turn. Each action is data plus two functions:
//   canUse(combat, actor, target) -> true, or a string saying why not
//   run(combat, actor, target)    -> spends the cost and does the thing
// cost: 'action' | 'bonus' | 'reaction' | 'free'. Resources live in combat.ts(actor).
(function (G) {
  const spend = (c, e, cost) => { if (cost !== 'free') c.ts(e)[cost]--; };
  const has = (c, e, cost) => cost === 'free' || c.ts(e)[cost] > 0;

  G.actions = {
    attack: {
      label: 'Attack', cost: 'action', needsTarget: 'enemy',
      describe: 'Attack a creature in reach, or shoot one in range and in sight (all your multiattack swings or shots).',
      canUse(c, e, t) {
        if (!has(c, e, this.cost)) return 'No action left';
        if (!t || t.dead) return 'Pick a target';
        if (!c.sim.isEnemy(e, t)) return 'Not an enemy';
        if (!c.canAttack(e, t)) return c.rangedAttack(e) ? (c.distCells(e, t) > c.rangedAttack(e).range.long ? 'Out of range' : 'No clear shot') : 'Out of reach';
        return true;
      },
      run(c, e, t) {
        spend(c, e, this.cost);
        const mode = c.attackMode(e, t) || 'melee';
        const seq = c.attackSequence(e, mode);
        if (!seq.length) return;
        c.attack(e, t, { attack: seq[0] });
        // Remaining swings become queued strikes so they play out one by one.
        const rest = [];
        for (let i = 1; i < seq.length; i++) {
          if (i > 1) rest.push({ type: 'wait', actor: e.id, t: c.sim.turnDelay * 0.6 });
          rest.push({ type: 'strike', actor: e.id, attack: seq[i].name, target: t.id, mode });
        }
        c.queue.unshift(...rest);
      },
    },

    dash: {
      label: 'Dash', cost: 'action',
      describe: 'Gain extra movement equal to your speed this turn.',
      canUse(c, e) { return has(c, e, this.cost) || 'No action left'; },
      run(c, e) { spend(c, e, this.cost); c.ts(e).move += c.speedFt(e); c.emit({ type: 'action', id: e.id, action: 'dash' }); },
    },

    disengage: {
      label: 'Disengage', cost: 'action',
      describe: 'Your movement doesn\'t provoke opportunity attacks this turn.',
      canUse(c, e) { return has(c, e, this.cost) || 'No action left'; },
      run(c, e) { spend(c, e, this.cost); c.addEffect(e, 'disengage', 'endOfTurn'); c.emit({ type: 'action', id: e.id, action: 'disengage' }); },
    },

    dodge: {
      label: 'Dodge', cost: 'action',
      describe: 'Attacks against you have disadvantage until your next turn.',
      canUse(c, e) { return has(c, e, this.cost) || 'No action left'; },
      run(c, e) { spend(c, e, this.cost); c.addEffect(e, 'dodge', 'startOfTurn'); c.emit({ type: 'action', id: e.id, action: 'dodge' }); },
    },
  };

  // Class features. Available when the creature's stats.features lists them (PCs get these from the
  // character sheet's class and level). Limited uses reset each fight for now (rests aren't tracked yet).
  const feature = (name) => (c, e) => (e.stats.features || []).includes(name);
  const usedUp = (c, e, key, max = 1) => (c.ts(e).used ||= {})[key] >= max;
  const use = (c, e, key) => { const u = (c.ts(e).used ||= {}); u[key] = (u[key] || 0) + 1; };
  Object.assign(G.actions, {
    secondWind: {
      label: 'Second Wind', cost: 'bonus', available: feature('second-wind'),
      describe: 'Regain 1d10 + fighter level HP (once per fight here).',
      canUse(c, e) { if (!has(c, e, this.cost)) return 'No bonus action left'; return usedUp(c, e, 'sw') ? 'Already used' : true; },
      run(c, e) {
        spend(c, e, this.cost); use(c, e, 'sw');
        const heal = G.rules.die(10) + (e.stats.level || 1);
        if (G.roleOf(e) !== 'pc') e.stats.hp = Math.min(e.stats.hpMax, e.stats.hp + heal);
        c.emit({ type: 'action', id: e.id, action: 'secondWind', heal });
      },
    },
    actionSurge: {
      label: 'Action Surge', cost: 'free', available: feature('action-surge'),
      describe: 'Take one extra action this turn (once per fight here).',
      canUse(c, e) { return usedUp(c, e, 'as') ? 'Already used' : true; },
      run(c, e) { use(c, e, 'as'); c.ts(e).action += 1; c.emit({ type: 'action', id: e.id, action: 'actionSurge' }); },
    },
    cunningDash: {
      label: 'Cunning Dash', cost: 'bonus', available: feature('cunning-action'),
      describe: 'Dash as a bonus action.',
      canUse(c, e) { return has(c, e, this.cost) || 'No bonus action left'; },
      run(c, e) { spend(c, e, this.cost); c.ts(e).move += c.speedFt(e); c.emit({ type: 'action', id: e.id, action: 'cunningDash' }); },
    },
    cunningDisengage: {
      label: 'Cunning Disengage', cost: 'bonus', available: feature('cunning-action'),
      describe: 'Disengage as a bonus action.',
      canUse(c, e) { return has(c, e, this.cost) || 'No bonus action left'; },
      run(c, e) { spend(c, e, this.cost); c.addEffect(e, 'disengage', 'endOfTurn'); c.emit({ type: 'action', id: e.id, action: 'cunningDisengage' }); },
    },
  });

  // Order shown on the action bar (features only show when available to that creature).
  G.actionBar = ['attack', 'dash', 'disengage', 'dodge', 'secondWind', 'actionSurge', 'cunningDash', 'cunningDisengage'];
  G.barFor = (c, e) => G.actionBar.filter((id) => !G.actions[id].available || G.actions[id].available(c, e));
})(window.GeezTown = window.GeezTown || {});
