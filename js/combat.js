// combat.js — turn-based layer. Each Combat is one local fight (a "bubble"); several can run at once
// while everything outside them keeps moving in real time. Creatures join mid-fight, and fights merge.
//
// Every creature has per-turn resources: action, bonus, reaction, move (feet).
// Things happen through a job queue so they can be animated and interrupted:
//   { type: 'move',   actor, cells:[{cx,cy}...] }   walked square by square, opportunity attacks checked per step
//   { type: 'action', actor, action:'attack', target }
//   { type: 'wait',   actor, t }
// NPCs get their jobs from G.tactics.plan() at the start of their turn and end their turn when the
// queue empties. PCs queue jobs through commandMove / commandAction and end their turn themselves.
(function (G) {
  const FT = 5; // feet per square
  const cheb = (a, b) => Math.max(Math.abs(a.cx - b.cx), Math.abs(a.cy - b.cy));

  class Combat {
    constructor(sim, id, list) {
      this.sim = sim;
      this.id = id;
      this.escapedIds = new Set();
      this.round = 1;
      this.turn = -1;
      this.queue = [];
      this.phase = 'start';      // 'pc' | 'npc' | 'over'
      this.timer = 0;
      this.state = new Map();    // id -> { action, bonus, reaction, move, effects:[{name, until}] }
      this.order = this.rollInitiative(list);
      for (const e of list) { this.state.set(e.id, this._fresh(e)); e.combatId = id; }
    }

    // Bring a creature into this fight. It rolls initiative and slots into the order; if its slot
    // is before the current turn, it first acts next round.
    join(e, { silent = false } = {}) {
      if (e.dead || this.order.some((o) => o.id === e.id && !o.escaped)) return;
      this.order = this.order.filter((o) => o.id !== e.id);
      const entry = { id: e.id, name: e.name, roll: G.rules.die(20) + e.stats.initiative, dex: e.stats.dex, escaped: false };
      let i = this.order.findIndex((o) => entry.roll > o.roll || (entry.roll === o.roll && entry.dex > o.dex));
      if (i < 0) i = this.order.length;
      this.order.splice(i, 0, entry);
      if (this.turn >= 0 && i <= this.turn) this.turn++;
      this.state.set(e.id, this._fresh(e));
      this.escapedIds.delete(e.id);
      e.combatId = this.id; e.ai.path = null; e.status = 'In combat';
      this.sim._snapToGrid([e]);
      if (!silent) this.emit({ type: 'joined', id: e.id, combatId: this.id, roll: entry.roll });
    }

    // Swallow another fight: its creatures keep their rolls and resources; the current turn stays put.
    absorb(other) {
      const cur = this.current();
      for (const o of other.order) {
        if (this.order.some((x) => x.id === o.id)) continue;
        this.order.push({ ...o });
        const e = this.sim.get(o.id);
        if (other.state.has(o.id)) this.state.set(o.id, other.state.get(o.id));
        if (e) { if (!o.escaped) e.combatId = this.id; if (e.dead && e.ai.riseCombat === other.id) e.ai.riseCombat = this.id; }
      }
      for (const id of other.escapedIds) this.escapedIds.add(id);
      this.sim._snapToGrid(other.combatants());
      this.order.sort((a, b) => b.roll - a.roll || b.dex - a.dex);
      if (cur) this.turn = this.order.findIndex((o) => o.id === cur.id);
      other.phase = 'over';
    }

    // ---------- basics ----------
    emit(ev) { this.sim.events.push(ev); }
    _fresh(e) { return { action: 1, bonus: 1, reaction: 1, move: this.speedFt(e), effects: [] }; }
    ts(e) { let s = this.state.get(e.id); if (!s) { s = this._fresh(e); this.state.set(e.id, s); } return s; }
    speedFt(e) { return e.stats.speedFt ?? (this.sim.role(e).moveSquares ?? 6) * FT; }
    // Melee reach in squares (most things 1; whips, polearms, big monsters 2+).
    reachSq(e) { return Math.max(1, ...(e.stats.attacks || []).filter((a) => a.kind !== 'ranged').map((a) => a.reach || 1)); }
    inReach(a, b) { return this.distCells(a, b) <= this.reachSq(a); }

    // The attacks one Attack action makes: the multiattack routine if it has one, else its main melee attack.
    attackSequence(e) {
      const s = e.stats, byName = (n) => (s.attacks || []).find((a) => a.name === n);
      if (s.multiattack) {
        const seq = [];
        for (const m of s.multiattack) { const a = byName(m.name); if (a) for (let i = 0; i < m.count; i++) seq.push(a); }
        if (seq.length) return seq;
      }
      const main = G.rules.primaryAttack(e);
      return main ? [main] : [];
    }

    // Best enemy to hit right now from where e stands: lowest HP in reach.
    targetInReach(e) {
      return this.enemiesOf(e).filter((o) => this.inReach(e, o)).sort((a, b) => a.stats.hp - b.stats.hp)[0] || null;
    }
    cell(e) { return this.sim.nav.cellOf(e.x, e.y); }
    distCells(a, b) { return cheb(this.cell(a), this.cell(b)); }
    behavior(e) { return this.sim.combatBehavior(e); }

    current() { return this.turn >= 0 && this.order[this.turn] ? this.sim.get(this.order[this.turn].id) : null; }
    isActive(e) { return this.order.some((o) => o.id === e.id && !o.escaped) && !e.dead; }
    combatants() { return this.order.filter((o) => !o.escaped).map((o) => this.sim.get(o.id)).filter((e) => e && !e.dead); }
    enemiesOf(e) { return this.combatants().filter((o) => this.sim.isEnemy(e, o)); }

    rollInitiative(list) {
      return list
        .map((e) => ({ id: e.id, name: e.name, roll: G.rules.die(20) + e.stats.initiative, dex: e.stats.dex, escaped: false }))
        .sort((a, b) => b.roll - a.roll || b.dex - a.dex || Math.random() - 0.5);
    }

    // ---------- effects ----------
    hasEffect(e, name) { return this.ts(e).effects.some((x) => x.name === name); }
    addEffect(e, name, until) {
      const st = this.ts(e);
      st.effects = st.effects.filter((x) => x.name !== name);
      st.effects.push({ name, until });
      this.emit({ type: 'effect', id: e.id, name, on: true });
    }
    _expire(e, when) {
      const st = this.ts(e), gone = st.effects.filter((x) => x.until === when);
      st.effects = st.effects.filter((x) => x.until !== when);
      for (const x of gone) this.emit({ type: 'effect', id: e.id, name: x.name, on: false });
    }

    // ---------- space ----------
    occupant(cx, cy, except) {
      for (const o of this.sim.entities) {
        if (o === except || o.dead) continue;
        const c = this.cell(o);
        if (c.cx === cx && c.cy === cy) return o;
      }
      return null;
    }

    // Squares reachable within budget feet. You can pass through non-enemies but not stop on them,
    // and you can't pass through enemies. Returns Map(key -> {cx, cy, cost, prev, endable}).
    reachable(e, budget = this.ts(e).move) {
      const nav = this.sim.nav, W = nav.w, start = this.cell(e);
      const k = (c) => c.cy * W + c.cx;
      const out = new Map([[k(start), { cx: start.cx, cy: start.cy, cost: 0, geo: 0, prev: null, endable: true }]]);
      const occ = new Map();
      for (const o of this.sim.entities) if (o !== e && !o.dead) occ.set(k(this.cell(o)), o);
      const queue = [start];
      while (queue.length) {
        const c = queue.shift(), node = out.get(k(c));
        if (node.cost + FT > budget) continue;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const n = { cx: c.cx + dx, cy: c.cy + dy }, nk = k(n);
          const geo = node.geo + (dx && dy ? 1.414 : 1); // tie-break: straighter-looking paths
          const seen = out.get(nk);
          if (seen) { if (seen.cost === node.cost + FT && geo < seen.geo - 1e-6 && nav.canStep(c.cx, c.cy, n.cx, n.cy)) { seen.geo = geo; seen.prev = k(c); } continue; }
          if (!nav.canStep(c.cx, c.cy, n.cx, n.cy)) continue;
          const who = occ.get(nk);
          if (who && this.sim.isEnemy(e, who)) continue;
          out.set(nk, { cx: n.cx, cy: n.cy, cost: node.cost + FT, geo, prev: k(c), endable: !who });
          queue.push(n);
        }
      }
      return out;
    }

    pathTo(e, cx, cy, budget) {
      const reach = this.reachable(e, budget), W = this.sim.nav.w;
      const node = reach.get(cy * W + cx);
      if (!node || !node.endable || node.cost === 0) return null;
      const cells = [];
      for (let n = node; n && n.prev !== null; n = reach.get(n.prev)) cells.push({ cx: n.cx, cy: n.cy });
      return cells.reverse();
    }

    // Which steps along a path would provoke, and from whom (ignores Disengage if ignoreDisengage).
    provokes(e, cells, { ignoreDisengage = false } = {}) {
      if (!ignoreDisengage && this.hasEffect(e, 'disengage')) return [];
      const enemies = this.enemiesOf(e).filter((o) => this.ts(o).reaction > 0);
      const out = [];
      let from = this.cell(e);
      const spent = new Set(); // each enemy only gets one reaction
      cells.forEach((to, i) => {
        const by = enemies.filter((o) => { const r = this.reachSq(o); return !spent.has(o.id) && cheb(this.cell(o), from) <= r && cheb(this.cell(o), to) > r; });
        if (by.length) { by.forEach((o) => spent.add(o.id)); out.push({ i, by: by.map((o) => o.id) }); }
        from = to;
      });
      return out;
    }

    // Everything the UI needs to draw a move preview to (cx, cy).
    preview(e, cx, cy) {
      const cells = this.pathTo(e, cx, cy);
      if (!cells) return { ok: false };
      return { ok: true, cells, cost: cells.length * FT, provokes: this.provokes(e, cells) };
    }

    // ---------- attacks ----------
    attack(a, d, { source = 'attack', attack = null } = {}) {
      const atk = attack || G.rules.primaryAttack(a);
      // Pack Tactics: advantage if an ally of the attacker stands next to the target.
      const pack = (a.stats.traits || []).includes('pack-tactics') && this.combatants().some((o) =>
        o !== a && !this.sim.isEnemy(o, a) && this.sim.isEnemy(o, d) && cheb(this.cell(o), this.cell(d)) <= 1);
      return this.sim.resolveAttack(a, d, { attack: atk, advantage: pack, disadvantage: this.hasEffect(d, 'dodge'), source });
    }

    // ---------- turn flow ----------
    begin() { this._nextTurn(); }

    _nextTurn() {
      if (this.phase === 'over') return;
      if (this._fightOver()) return this._finish();
      for (let tries = 0; tries <= this.order.length; tries++) {
        this.turn++;
        if (this.turn >= this.order.length) { this.turn = 0; this.round++; this._rise(); }
        const o = this.order[this.turn], e = this.sim.get(o.id);
        if (!e || e.dead || o.escaped) continue;
        return this._beginTurn(e);
      }
      this._finish();
    }

    _beginTurn(e) {
      const st = this.ts(e);
      st.action = 1; st.bonus = 1; st.reaction = 1; st.move = this.speedFt(e);
      this._expire(e, 'startOfTurn');
      this.queue = [];
      this.phase = this.behavior(e) === 'player' ? 'pc' : 'npc';
      this.timer = this.sim.turnDelay;
      this.emit({ type: 'turn', id: e.id, round: this.round, combatId: this.id });
      if (this.phase === 'npc') {
        this.queue.push({ type: 'wait', actor: e.id, t: this.sim.turnDelay });
        this.queue.push(...G.tactics.plan(this, e));
      }
    }

    endTurn() {
      const e = this.current();
      if (e) {
        this._expire(e, 'endOfTurn');
        if (!e.dead && this.behavior(e) === 'flee') this._checkEscape(e);
      }
      this.queue = [];
      this._nextTurn();
    }

    _finish() { if (this.phase !== 'over') { this.sim.endCombat(this); this.phase = 'over'; } }

    // No two remaining combatants are enemies.
    _fightOver() {
      const cs = this.combatants();
      for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) if (this.sim.isEnemy(cs[i], cs[j])) return false;
      return true;
    }

    // A fleeing creature that ends its turn far enough away, or out of sight, leaves the fight.
    _checkEscape(e) {
      const range = this.sim.joinRange + 2;
      const safe = this.enemiesOf(e).every((o) => {
        const d = Math.hypot(o.x - e.x, o.y - e.y);
        return d > range || (d > 4 && !this.sim.nav.hasLOS(o.x, o.y, e.x, e.y));
      });
      if (!safe) return;
      const o = this.order.find((x) => x.id === e.id);
      if (o) o.escaped = true;
      this.escapedIds.add(e.id);
      e.combatId = null;
      this.sim._goIdle(e, 0.2);
      e.status = 'Escaped';
      this.emit({ type: 'escaped', id: e.id, combatId: this.id });
    }

    // Corpses marked to rise get up at the top of the round and roll in as zombies.
    _rise() {
      let changed = false;
      for (const e of this.sim.entities) {
        if (!e.dead || e.ai.reanimateAt == null || e.ai.riseCombat !== this.id) continue;
        if (!this.sim._maybeReanimate(e, true)) continue;
        this.order = this.order.filter((o) => o.id !== e.id);
        this.order.push({ id: e.id, name: e.name, roll: G.rules.die(20) + e.stats.initiative, dex: e.stats.dex, escaped: false });
        this.state.set(e.id, this._fresh(e));
        e.combatId = this.id; e.ai.riseCombat = null;
        e.status = 'In combat'; changed = true;
      }
      if (changed) this.order.sort((a, b) => b.roll - a.roll || b.dex - a.dex);
    }

    // ---------- the loop ----------
    update(dt) {
      if (this.phase === 'over') return;
      if (this.phase === 'start') return this._nextTurn();
      if (this.queue.length) return this._runJob(dt);
      const e = this.current();
      if (!e || e.dead) return this._nextTurn();
      if (this.phase === 'npc' && (this.timer -= dt) <= 0) this.endTurn();
    }

    _runJob(dt) {
      const job = this.queue[0], e = this.sim.get(job.actor);
      if (!e || e.dead) { this.queue = this.queue.filter((j) => j.actor !== job.actor); return; }

      if (job.type === 'wait') { if ((job.t -= dt) <= 0) this.queue.shift(); return; }

      if (job.type === 'action') {
        const a = G.actions[job.action], t = job.target ? this.sim.get(job.target) : null;
        this.queue.shift(); // before run(), so run() can put follow-up strikes at the front
        const ok = a.canUse(this, e, t);
        if (ok === true) { if (t) e.facing = Math.atan2(t.y - e.y, t.x - e.x); a.run(this, e, t); }
        else this.emit({ type: 'actionFailed', id: e.id, action: job.action, reason: ok });
        this.queue.unshift({ type: 'wait', actor: e.id, t: this.sim.turnDelay * 0.6 });
        return;
      }

      // Follow-up attacks of a multiattack. Retargets if the original target dropped or moved off.
      if (job.type === 'strike') {
        this.queue.shift();
        const atk = (e.stats.attacks || []).find((a) => a.name === job.attack);
        let t = this.sim.get(job.target);
        if (!t || t.dead || !this.inReach(e, t) || !this.sim.isEnemy(e, t)) t = this.targetInReach(e);
        if (atk && t) { e.facing = Math.atan2(t.y - e.y, t.x - e.x); this.attack(e, t, { attack: atk }); }
        return;
      }

      if (job.type === 'move') {
        const nav = this.sim.nav;
        if (job.i === undefined) { job.i = 0; job.stepping = false; job.oaChecked = -1; }
        if (!job.stepping) {
          const st = this.ts(e);
          if (job.i >= job.cells.length || st.move < FT) { this.queue.shift(); return; }
          const from = this.cell(e), next = job.cells[job.i];
          const who = this.occupant(next.cx, next.cy, e);
          const last = job.i === job.cells.length - 1;
          if (!nav.canStep(from.cx, from.cy, next.cx, next.cy) || (who && (this.sim.isEnemy(e, who) || last))) { this.queue.shift(); return; }

          // Leaving a square next to an enemy provokes an opportunity attack.
          if (job.oaChecked !== job.i && !this.hasEffect(e, 'disengage')) {
            job.oaChecked = job.i;
            let provoked = false;
            for (const o of this.enemiesOf(e)) {
              if (this.ts(o).reaction <= 0) continue;
              const r = this.reachSq(o);
              if (cheb(this.cell(o), from) <= r && cheb(this.cell(o), next) > r) {
                this.ts(o).reaction--;
                o.facing = Math.atan2(e.y - o.y, e.x - o.x);
                this.emit({ type: 'oa', by: o.id, target: e.id });
                this.attack(o, e, { source: 'opportunity' });
                provoked = true;
                if (e.dead) { this.queue = this.queue.filter((j) => j.actor !== e.id); return; }
              }
            }
            if (provoked) { this.queue.unshift({ type: 'wait', actor: e.id, t: 0.5 }); return; }
          }

          st.move -= FT;
          job.stepping = true;
          job.to = nav.center(next.cx, next.cy);
        }
        // Animate toward the next square.
        let step = 5 * dt;
        const dx = job.to.x - e.x, dy = job.to.y - e.y, d = Math.hypot(dx, dy);
        if (d > 1e-4) e.facing = Math.atan2(dy, dx);
        if (d <= step) { e.x = job.to.x; e.y = job.to.y; job.i++; job.stepping = false; }
        else { e.x += (dx / d) * step; e.y += (dy / d) * step; }
      }
    }

    // ---------- PC commands ----------
    canCommand(e) { return this.phase === 'pc' && this.current() === e && !this.queue.length && !e.dead; }

    commandMove(e, cx, cy) {
      if (!this.canCommand(e)) return false;
      const cells = this.pathTo(e, cx, cy);
      if (!cells) return false;
      this.queue.push({ type: 'move', actor: e.id, cells });
      return true;
    }

    commandStep(e, dx, dy) { const c = this.cell(e); return this.commandMove(e, c.cx + dx, c.cy + dy); }

    // Returns true, or a reason string.
    commandAction(e, actionId, target) {
      if (!this.canCommand(e)) return 'Not your turn';
      const a = G.actions[actionId];
      if (!a) return 'Unknown action';
      const ok = a.canUse(this, e, target);
      if (ok !== true) return ok;
      this.queue.push({ type: 'action', actor: e.id, action: actionId, target: target ? target.id : null });
      return true;
    }

    snapshot() { return { id: this.id, round: this.round, turn: this.turn, order: this.order.map((o) => [o.id, o.roll, o.escaped ? 1 : 0]) }; }
  }

  G.Combat = Combat;
  G.FT = FT;
})(window.GeezTown = window.GeezTown || {});
