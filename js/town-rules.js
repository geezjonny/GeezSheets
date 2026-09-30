// town-rules.js — dice, attacks, saves. No state; everything returns plain results.
(function (G) {
  const die = (n) => 1 + Math.floor(Math.random() * n);
  const mod = (s) => Math.floor((s - 10) / 2);

  // "2d6+3" -> { n:2, d:6, b:3 };  "5" -> { n:0, d:0, b:5 }
  function parseDice(expr) {
    const m = String(expr).replace(/\s+/g, '').match(/^(\d*)d(\d+)([+-]\d+)?$/i);
    if (!m) return { n: 0, d: 0, b: parseInt(expr, 10) || 0 };
    return { n: m[1] === '' ? 1 : +m[1], d: +m[2], b: m[3] ? +m[3] : 0 };
  }

  // d20 with advantage/disadvantage (they cancel out, as in 5e).
  function d20({ advantage = false, disadvantage = false } = {}) {
    const a = die(20);
    if (advantage === disadvantage) return { roll: a, rolls: [a], mode: 'normal' };
    const b = die(20);
    return { roll: advantage ? Math.max(a, b) : Math.min(a, b), rolls: [a, b], mode: advantage ? 'advantage' : 'disadvantage' };
  }

  // Roll every damage part; a crit doubles the dice, not the flat bonus.
  function rollDamage(parts, crit) {
    return parts.map((p) => {
      const d = parseDice(p.dice);
      let amt = d.b;
      for (let i = 0; i < d.n * (crit ? 2 : 1); i++) amt += die(d.d);
      return { amount: Math.max(0, amt), type: p.type };
    });
  }

  // Resistance halves, immunity zeroes, vulnerability doubles — per damage type.
  function applyDefenses(defender, parts) {
    const s = defender.stats;
    return parts.map((p) => {
      let a = p.amount;
      if ((s.immune || []).includes(p.type)) a = 0;
      else {
        if ((s.resist || []).includes(p.type)) a = Math.floor(a / 2);
        if ((s.vuln || []).includes(p.type)) a *= 2;
      }
      return { ...p, amount: a, raw: p.amount };
    });
  }

  function primaryAttack(e, kind = 'melee') {
    const list = e.stats.attacks || [];
    return list.find((a) => a.kind === kind || a.kind === 'both') || list[0] || null;
  }

  // One weapon attack. Does not apply damage — the caller does.
  function attackRoll(attacker, defender, opts = {}) {
    const atk = opts.attack || primaryAttack(attacker);
    const r = d20(opts);
    const total = r.roll + atk.bonus;
    const crit = r.roll === 20;
    const hit = crit || (r.roll !== 1 && total >= defender.stats.ac);
    let parts = [], damage = 0;
    if (hit) {
      parts = applyDefenses(defender, rollDamage(atk.dmg, crit));
      damage = parts.reduce((n, p) => n + p.amount, 0);
    }
    return { attack: atk.name, roll: r.roll, rolls: r.rolls, mode: r.mode, total, ac: defender.stats.ac, hit, crit, damage, parts };
  }

  function saveBonus(e, ability) {
    const s = e.stats;
    return s.saves && s.saves[ability] != null ? s.saves[ability] : mod(s[ability]);
  }

  function savingThrow(e, ability, dc, opts = {}) {
    const r = d20(opts), total = r.roll + saveBonus(e, ability);
    return { ability, dc, roll: r.roll, total, success: total >= dc };
  }

  G.rules = { die, mod, parseDice, d20, rollDamage, applyDefenses, primaryAttack, attackRoll, saveBonus, savingThrow };
})(window.GeezTown = window.GeezTown || {});
