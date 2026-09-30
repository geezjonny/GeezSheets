// tactics.js — NPC turn planning. plan() looks at the board once at the start of the turn and
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
      const threatened = enemies.some((o) => cheb(c.cell(o), here) <= c.reachSq(o));
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

  G.tactics = {
    behaviors,
    plan(c, e) {
      const fn = behaviors[c.behavior(e)];
      return fn ? fn(c, e) : [];
    },
  };
})(window.GeezTown = window.GeezTown || {});
