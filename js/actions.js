// actions.js — what a creature can do on its turn. Each action is data plus two functions:
//   canUse(combat, actor, target) -> true, or a string saying why not
//   run(combat, actor, target)    -> spends the cost and does the thing
// cost: 'action' | 'bonus' | 'reaction' | 'free'. Resources live in combat.ts(actor).
(function (G) {
  const spend = (c, e, cost) => { if (cost !== 'free') c.ts(e)[cost]--; };
  const has = (c, e, cost) => cost === 'free' || c.ts(e)[cost] > 0;

  G.actions = {
    attack: {
      label: 'Attack', cost: 'action', needsTarget: 'enemy',
      describe: 'Melee attack a creature in reach (all your multiattack swings).',
      canUse(c, e, t) {
        if (!has(c, e, this.cost)) return 'No action left';
        if (!t || t.dead) return 'Pick a target';
        if (!c.sim.isEnemy(e, t)) return 'Not an enemy';
        if (!c.inReach(e, t)) return 'Out of reach';
        return true;
      },
      run(c, e, t) {
        spend(c, e, this.cost);
        const seq = c.attackSequence(e);
        if (!seq.length) return;
        c.attack(e, t, { attack: seq[0] });
        // Remaining swings become queued strikes so they play out one by one.
        const rest = [];
        for (let i = 1; i < seq.length; i++) {
          if (i > 1) rest.push({ type: 'wait', actor: e.id, t: c.sim.turnDelay * 0.6 });
          rest.push({ type: 'strike', actor: e.id, attack: seq[i].name, target: t.id });
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

  // Order shown on the action bar.
  G.actionBar = ['attack', 'dash', 'disengage', 'dodge'];
})(window.GeezTown = window.GeezTown || {});
