// town-tactics.js — NPC turn planning. plan() looks at the board once at the start of the turn and
// returns a list of jobs for combat.js to execute. Keep each behaviour a small function so new
// ones (ranged, support, cowardly boss...) slot in by name via role.combat.
(function (G) {
  const FT = () => G.FT;
  const cheb = (a, b) => Math.max(Math.abs(a.cx - b.cx), Math.abs(a.cy - b.cy));
  const move = (e, cells) => ({ type: 'move', actor: e.id, cells });
  const act = (e, action, target) => ({ type: 'action', actor: e.id, action, target: target ? target.id : null });

  function pathFrom(reach, node, W) {
    const cells = [];
    for (let n = node; n && n.prev !== null; n = reach.get(n.prev)) cells.push({ cx: n.cx, cy: n.cy });
    return cells.reverse();
  }

  const behaviors = {
    // Close to melee and attack. If nobody is reachable this turn, Dash toward the nearest enemy.
    fight(c, e) {
      const enemies = c.enemiesOf(e);
      if (!enemies.length) return [];
      const here = c.cell(e), W = c.sim.nav.w;
      const byHp = (a, b) => a.stats.hp - b.stats.hp;

      const reach = c.reachSq(e);
      const adjacent = enemies.filter((o) => cheb(c.cell(o), here) <= reach).sort(byHp);
      if (adjacent.length) return [act(e, 'attack', adjacent[0])];

      // Cheapest square next to an enemy, within normal move then within a Dash.
      const findSpot = (budget) => {
        const area = c.reachable(e, budget);
        let best = null;
        for (const node of area.values()) {
          if (!node.endable || node.cost === 0) continue;
          for (const o of enemies) {
            if (cheb(node, c.cell(o)) > reach) continue;
            if (!best || node.cost < best.node.cost || (node.cost === best.node.cost && o.stats.hp < best.target.stats.hp)) best = { node, target: o };
          }
        }
        return best && { cells: pathFrom(area, best.node, W), target: best.target };
      };

      const st = c.ts(e);
      const spot = findSpot(st.move);
      if (spot) return [move(e, spot.cells), act(e, 'attack', spot.target)];

      // Too far: Dash and get as close as possible.
      const far = c.reachable(e, st.move + c.speedFt(e));
      const nearestTo = (node) => Math.min(...enemies.map((o) => { const oc = c.cell(o); return Math.hypot(node.cx - oc.cx, node.cy - oc.cy); }));
      let best = null, bestD = nearestTo(here);
      for (const node of far.values()) {
        if (!node.endable || node.cost === 0) continue;
        const d = nearestTo(node);
        if (d < bestD - 0.01) { bestD = d; best = node; }
      }
      if (!best) return [];
      const cells = pathFrom(far, best, W);
      return cells.length * FT() > st.move ? [act(e, 'dash'), move(e, cells)] : [move(e, cells)];
    },

    // Get away. Next to an enemy: Disengage then move. Otherwise: Dash then move twice as far.
    // Nowhere better to go: Dodge.
    flee(c, e) {
      const enemies = c.enemiesOf(e);
      if (!enemies.length) return [];
      const here = c.cell(e), W = c.sim.nav.w, nav = c.sim.nav, st = c.ts(e);
      const threatened = enemies.some((o) => c.threatens(o, here));
      const first = threatened ? 'disengage' : 'dash';
      const budget = threatened ? st.move : st.move + c.speedFt(e);

      const score = (node, cells) => {
        const p = nav.center(node.cx, node.cy);
        let minD = Infinity, seen = false;
        for (const o of enemies) {
          minD = Math.min(minD, Math.hypot(o.x - p.x, o.y - p.y));
          if (nav.hasLOS(o.x, o.y, p.x, p.y)) seen = true;
        }
        // Without Disengage, penalise routes that run past enemies.
        const oaPenalty = !threatened && cells ? c.provokes(e, cells, { ignoreDisengage: true }).length * 4 : 0;
        return minD + (seen ? 0 : 3) - oaPenalty - node.cost * 0.01;
      };

      const reach = c.reachable(e, budget);
      const start = reach.get(here.cy * W + here.cx);
      let best = null, bestS = score(start, null);
      const startS = bestS;
      for (const node of reach.values()) {
        if (!node.endable || node.cost === 0) continue;
        const cells = pathFrom(reach, node, W);
        const s = score(node, cells);
        if (s > bestS) { bestS = s; best = { node, cells }; }
      }
      if (!best || bestS - startS < 1) return [act(e, 'dodge')];
      return [act(e, first), move(e, best.cells)];
    },
  };

  // Shooters: stay out of melee and shoot. Falls back to melee if cornered with a melee weapon.
  behaviors.shoot = function (c, e) {
    const enemies = c.enemiesOf(e);
    if (!enemies.length) return [];
    const here = c.cell(e), W = c.sim.nav.w, nav = c.sim.nav, r = c.rangedAttack(e);
    const byHp = (a, b) => a.stats.hp - b.stats.hp;
    const menaced = enemies.some((o) => c.threatens(o, here));
    const targetsFrom = (cell) => enemies.filter((o) => cheb(cell, c.cell(o)) <= r.range.normal && c.canShoot(e, o, cell)).sort(byHp);

    // Already in a good spot: just shoot.
    if (!menaced) { const t = targetsFrom(here)[0]; if (t) return [act(e, 'attack', t)]; }
    if (menaced && c.hasMelee(e)) return behaviors.fight(c, e);

    // Find a square within normal movement that nobody threatens and that has a clear shot; prefer cheap, not too close.
    const reach = c.reachable(e, c.ts(e).move);
    let best = null, bestS = -Infinity;
    for (const node of reach.values()) {
      if (!node.endable || node.cost === 0) continue;
      if (enemies.some((o) => c.threatens(o, node))) continue;
      const ts = targetsFrom(node); if (!ts.length) continue;
      const p = nav.center(node.cx, node.cy);
      const minD = Math.min(...enemies.map((o) => Math.hypot(o.x - p.x, o.y - p.y)));
      const s = Math.min(minD, 5) - node.cost * 0.05;
      if (s > bestS) { bestS = s; best = { node, target: ts[0] }; }
    }
    if (best) return [move(e, pathFrom(reach, best.node, W)), act(e, 'attack', best.target)];
    // Cornered with only a bow: shoot the closest anyway (with disadvantage).
    const close = enemies.filter((o) => c.canShoot(e, o)).sort(byHp)[0];
    if (close) return [act(e, 'attack', close)];
    return behaviors.fight(c, e); // nobody in sight: close the distance like a fighter
  };

  G.tactics = {
    behaviors,
    plan(c, e) {
      let b = c.behavior(e);
      if (b === 'fight' && c.prefersRanged(e)) b = 'shoot'; // bandits with crossbows, archers, etc.
      const fn = behaviors[b];
      return fn ? fn(c, e) : [];
    },
  };
})(window.GeezTown = window.GeezTown || {});
