// town-sim.js — the free-roam loop. Pure data + logic, no drawing.
// Run it on the GM's browser: call step(dt) every frame, push snapshot() to Firebase a few
// times a second, and have players applySnapshot() and interpolate.
(function (G) {
  const { inRect, rectArea, shareTag, uid } = G.geom;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const NAMES = ['Eldrin', 'Lyra', 'Garrick', 'Mirena', 'Balthazar', 'Tess', 'Kaelen', 'Vond', 'Zep', 'Aurelia', 'Isolda', 'Corin'];

  class TownSim {
    constructor(world) {
      this.world = world;          // { origin, width, height, walls, doors, lights, zones, routes }
      this.entities = [];
      this.time = 0;
      this.speedScale = 1;
      this.events = [];            // drained by the host: hit, miss, death, reanimated, turn, joined, ...
      this.nameSource = () => pick(NAMES); // swap for a dnd_lists generator
      // All fighting is turn-based. A fight is a local "combat bubble"; the rest of the world keeps
      // running in real time, and several bubbles can run at once.
      this.engageRange = 4;        // squares: a hostile that sees an enemy this close starts (or joins) a fight
      this.joinRange = 6;          // squares: creatures this close to an enemy in a fight get pulled in
      this.pcDamage = 'auto';      // 'auto' = attacks on PCs apply damage; 'report' = rolled and reported, HP untouched
      this.turnDelay = 0.45;       // seconds between NPC turn phases, so the table can follow along
      this.combats = [];
      this._combatSeq = 0;
      this._bubbleT = 0;
      this.rebuild();
    }

    // Call after walls/doors/zones/routes change.
    rebuild() {
      this.nav = new G.NavGrid(this.world);
      this.graph = new G.RouteGraph(this.world.routes);
      for (const e of this.entities) { this._resetAI(e); e.ai.zoneId = this._pickHomeZone(e); }
    }
    rebuildNav() { this.nav.rebuild(); for (const e of this.entities) e.ai.path = null; }

    toggleDoor(id) {
      const d = this.world.doors.find((x) => x.id === id);
      if (!d) return;
      d.closed = !d.closed;
      this.rebuildNav();
      this.events.push({ type: 'door', id, closed: d.closed });
    }

    get(id) { return this.entities.find((e) => e.id === id); }
    role(e) { return G.roles[G.roleOf(e)]; }

    // ---------- entities ----------
    spawn({ tags = ['citizen'], x, y, name, id } = {}) {
      const roleKey = G.roleOf({ tags });
      const stats = G.makeStats(roleKey, tags);
      // Monsters go by their stat block name ("Zombie", "Ogre"); people get a generated name.
      const monstrous = roleKey === 'zombie' || tags.some((t) => t.startsWith('srd:'));
      const e = {
        id: id || uid('npc'),
        name: name || (monstrous ? stats.name : this.nameSource()),
        tags: tags.slice(), x, y,
        facing: Math.random() * Math.PI * 2,
        radius: 0.3,
        stats,
        // Not everyone talks: 'chatty' / 'silent' tags decide, else roll against the role's talk chance.
        chatty: tags.includes('silent') ? false : tags.includes('chatty') ? true : Math.random() < (G.roles[roleKey].talk ?? 0.5),
        dead: false,
        status: 'Idle',
        ai: null,
      };
      this._resetAI(e);
      e.ai.home = { x, y };
      e.ai.zoneId = this._pickHomeZone(e);
      this.entities.push(e);
      return e;
    }

    remove(id) { this.entities = this.entities.filter((e) => e.id !== id); }

    // Change tags later (e.g. from the inspector): role, zone and stats follow.
    setTags(e, tags, { rerollStats = false } = {}) {
      const before = G.roleOf(e);
      e.tags = tags.slice();
      if (rerollStats || G.roleOf(e) !== before || tags.some((t) => t.startsWith('srd:'))) e.stats = G.makeStats(G.roleOf(e), e.tags);
      this._resetAI(e);
      e.ai.zoneId = this._pickHomeZone(e);
    }

    _resetAI(e) {
      const home = e.ai ? e.ai.home : { x: e.x, y: e.y };
      const pendingRise = e.ai ? e.ai.reanimateAt : null;
      e.ai = {
        state: 'idle', wait: rand(0, 1.5), path: null,
        nodeId: null, nextNodeId: null, prevNodeId: null,
        home, zoneId: e.ai ? e.ai.zoneId : null,
        targetId: null, cooldown: 0, repath: 0, sense: Math.random() * 0.25,
        lostSight: 0, seenPC: {}, reanimateAt: e.dead ? pendingRise : null, riseCombat: e.dead && e.ai ? e.ai.riseCombat : null,
      };
    }

    // Home zone: a zone sharing a tag with the role's zoneTags. Prefer the smallest one
    // containing the entity; otherwise any match. null = no constraint.
    _pickHomeZone(e) {
      const role = this.role(e);
      if (!role.zoneTags.length) return null;
      const matches = this.world.zones.filter((z) => shareTag(z.tags, role.zoneTags));
      if (!matches.length) return null;
      const containing = matches.filter((z) => inRect(e.x, e.y, z)).sort((a, b) => rectArea(a) - rectArea(b));
      return (containing[0] || pick(matches)).id;
    }
    homeZone(e) { return e.ai.zoneId ? this.world.zones.find((z) => z.id === e.ai.zoneId) || null : null; }

    // ---------- loop ----------
    step(dt) {
      dt = Math.min(dt, 0.1) * this.speedScale;
      this.time += dt;
      for (const e of this.entities) {
        if (e.combatId) continue; // in a fight: its combat drives it
        if (e.dead) { if (!this._riseHeld(e)) this._maybeReanimate(e); continue; }
        const role = this.role(e);
        if (role.playerControlled) continue;
        e.ai.cooldown = Math.max(0, e.ai.cooldown - dt);
        this._think(e, role, dt);
        if (!e.combatId) this._move(e, role, dt);
      }
      for (const c of this.combats.slice()) c.update(dt);
      if ((this._bubbleT -= dt) <= 0) { this._bubbleT = 0.25; this._bubbleCheck(); }
    }

    // A corpse waiting to rise inside an active fight rises on that fight's round, not on a timer.
    _riseHeld(e) { return !!(e.ai.riseCombat && this.combats.some((c) => c.id === e.ai.riseCombat)); }

    _think(e, role, dt) {
      const ai = e.ai;
      ai.sense -= dt;
      if (ai.sense <= 0) {
        ai.sense = 0.25;
        this._perceive(e, role);
      }

      if (ai.state === 'chase') {
        const t = this.get(ai.targetId);
        if (!t || t.dead) return this._goIdle(e, rand(0.5, 1.5));
        const d = Math.hypot(t.x - e.x, t.y - e.y);
        if (d <= this.engageRange && this.sees(e, t, this.engageRange)) { ai.path = null; this._face(e, t.x, t.y); this.engage(e, t); return; }
        if (t.combatId && d <= this.joinRange) { ai.path = null; this.engage(e, t); return; } // walk into an ongoing fight
        ai.repath -= dt;
        const goal = ai.lostSight > 0 && ai.lastSeen ? ai.lastSeen : t;
        if (ai.repath <= 0 || !ai.path) { ai.repath = 0.5; ai.path = this.nav.findPath(e.x, e.y, goal.x, goal.y); }
        return;
      }

      if (ai.state === 'flee') {
        if (!ai.path || !ai.path.length) {
          const threat = this.get(ai.targetId);
          if (!threat || threat.dead || ai.lostSight > 3) return this._goIdle(e, rand(1, 3));
          this._fleeFrom(e, threat);
        }
        return;
      }

      // roaming
      if (ai.path && ai.path.length) return;
      if (ai.state === 'walking') this._arrive(e);
      ai.wait -= dt;
      if (ai.wait > 0) return;
      this._decide(e, role);
    }

    _perceive(e, role) {
      const ai = e.ai;
      if (role.hostileTo) {
        const t = this._nearestSeen(e, role, role.hostileTo);
        if (t) {
          ai.lostSight = 0;
          // Close enough: the fight starts (or it joins the fight its target is already in).
          const d = Math.hypot(t.x - e.x, t.y - e.y);
          if (d <= this.engageRange || (t.combatId && d <= this.joinRange)) { this.engage(e, t); return; }
          ai.lastSeen = { x: t.x, y: t.y };
          if (ai.state !== 'chase' || ai.targetId !== t.id) { ai.state = 'chase'; ai.targetId = t.id; ai.path = null; ai.repath = 0; }
          e.status = `Attacking ${t.name}`;
          return;
        }
        if (ai.state === 'chase') ai.lostSight += 0.25;
        if (ai.state === 'chase' && ai.lostSight > 4) {
          // Lost them: walk to where they were last seen, then resume roaming (scent may pick them up again).
          const ls = ai.lastSeen; this._goIdle(e, 0.3);
          if (ls) this._walk(e, ls, null);
        }
      }
      if (role.fleeFrom) {
        const t = this._nearestSeen(e, role, role.fleeFrom);
        if (t) {
          ai.lostSight = 0;
          if (ai.state !== 'flee') { ai.state = 'flee'; ai.fleeStart = this.time; ai.targetId = t.id; ai.path = null; e.status = `Fleeing ${t.name}`; this.events.push({ type: 'flee', id: e.id, threat: t.id }); }
        } else if (ai.state === 'flee') ai.lostSight += 0.25;
      }
    }

    sees(e, o, range) {
      const role = this.role(e), fov = ((role.fov ?? 60) * Math.PI) / 180;
      const dx = o.x - e.x, dy = o.y - e.y, d = Math.hypot(dx, dy);
      if (d > range) return false;
      if (d > (role.hearing ?? 1.5)) {
        let diff = Math.atan2(dy, dx) - e.facing;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        if (Math.abs(diff) > fov) return false;
      }
      return this.nav.hasLOS(e.x, e.y, o.x, o.y);
    }

    _nearestSeen(e, role, tags) {
      let best = null, bd = Infinity;
      for (const o of this.entities) {
        if (o === e || o.dead || !shareTag(o.tags, tags)) continue;
        const d = Math.hypot(o.x - e.x, o.y - e.y);
        if (d < bd && this.sees(e, o, role.sight)) { bd = d; best = o; }
      }
      return best;
    }

    // Roam decision: follow the route (routeBias) or wander freely inside the home zone.
    _decide(e, role) {
      const ai = e.ai, zone = this.homeZone(e);
      const inZone = zone ? (p) => inRect(p.x, p.y, zone) : null;

      if (role.leash) {
        const p = this._randomReachable(e, () => ({ x: ai.home.x + rand(-role.leash, role.leash), y: ai.home.y + rand(-role.leash, role.leash) }));
        if (p) { e.status = 'Tending'; return this._walk(e, p, null); }
        return this._goIdle(e, rand(...role.idle));
      }

      if (role.routeTags.length && Math.random() < role.routeBias) {
        const here = ai.nodeId && this.graph.node(ai.nodeId);
        if (here) {
          let edges = this.graph.usableEdges(here, role.routeTags, inZone);
          if (edges.length > 1) edges = edges.filter((x) => x.to !== ai.prevNodeId); // don't turn straight back
          if (edges.length) {
            const next = this.graph.node(pick(edges).to);
            e.status = 'On route';
            if (this._walk(e, next, next.id)) { ai.prevNodeId = here.id; return; }
          }
        } else {
          const nd = this.graph.nearestNode(e.x, e.y, role.routeTags, inZone);
          if (nd) { e.status = 'Heading to route'; if (this._walk(e, nd, nd.id)) return; }
        }
      }

      // Scent: hunters with no target drift toward the nearest prey in range, no sight needed.
      if (role.scent && role.hostileTo && Math.random() < 0.7) {
        let prey = null, pd = role.scent;
        for (const o of this.entities) {
          if (o === e || o.dead || G.roleOf(o) === 'pc' || !shareTag(o.tags, role.hostileTo)) continue;
          const d = Math.hypot(o.x - e.x, o.y - e.y); if (d < pd) { pd = d; prey = o; }
        }
        if (prey) {
          const p = { x: prey.x + rand(-1.5, 1.5), y: prey.y + rand(-1.5, 1.5) };
          ai.nodeId = null; ai.prevNodeId = null;
          if (this._walk(e, p, null) || this._walk(e, prey, null)) { e.status = 'Following a scent'; return; }
        }
      }

      // Shopping trip: walk up to a nearby shopkeeper; the host handles the sale on 'shopVisit'.
      if (role.shopper && Math.random() < role.shopper) {
        const shop = this._nearestShop(e, 25);
        if (shop) {
          const p = this._randomReachable(e, () => ({ x: shop.x + rand(-1.3, 1.3), y: shop.y + rand(-1.3, 1.3) }), 8);
          if (p && this._walk(e, p, null)) { ai.visitShop = shop.id; ai.nodeId = null; e.status = `Going to ${shop.name}'s shop`; return; }
        }
      }

      // Free wander: inside the home zone, or near where it stands.
      const p = this._randomReachable(e, zone
        ? () => ({ x: rand(zone.minX + 0.5, zone.maxX - 0.5), y: rand(zone.minY + 0.5, zone.maxY - 0.5) })
        : () => ({ x: e.x + rand(-5, 5), y: e.y + rand(-5, 5) }));
      ai.nodeId = null; ai.prevNodeId = null;
      if (p) { e.status = 'Wandering'; return this._walk(e, p, null); }
      this._goIdle(e, rand(...role.idle));
    }

    _walk(e, p, nodeId) {
      const path = this.nav.findPath(e.x, e.y, p.x, p.y);
      if (!path) return false;
      e.ai.path = path; e.ai.state = 'walking'; e.ai.nextNodeId = nodeId;
      return true;
    }

    _arrive(e) {
      const ai = e.ai, role = this.role(e);
      if (ai.visitShop) {
        const shop = this.get(ai.visitShop);
        ai.visitShop = null;
        if (shop && !shop.dead && !shop.combatId && Math.hypot(shop.x - e.x, shop.y - e.y) < 2.5) {
          this._face(e, shop.x, shop.y);
          this.events.push({ type: 'shopVisit', id: e.id, shop: shop.id });
          ai.state = 'idle'; ai.nodeId = null; ai.wait = rand(2, 4); e.status = 'Shopping';
          return;
        }
      }
      const onRoute = !!ai.nextNodeId;
      ai.nodeId = ai.nextNodeId; ai.nextNodeId = null;
      ai.state = 'idle';
      // Walking a route: only occasionally pause at a junction.
      ai.wait = onRoute && Math.random() < 0.8 ? rand(0, 0.4) : rand(...role.idle);
      e.status = onRoute ? 'On route' : 'Idle';
    }

    _nearestShop(e, range) {
      let best = null, bd = range;
      for (const o of this.entities) {
        if (o === e || o.dead || o.combatId || G.roleOf(o) !== 'shopkeeper') continue;
        const d = Math.hypot(o.x - e.x, o.y - e.y);
        if (d < bd) { bd = d; best = o; }
      }
      return best;
    }

    _goIdle(e, wait) {
      const ai = e.ai; ai.visitShop = null;
      ai.state = 'idle'; ai.path = null; ai.targetId = null; ai.lostSight = 0;
      ai.nodeId = null; ai.nextNodeId = null; ai.wait = wait; e.status = 'Idle';
    }

    _randomReachable(e, sampler, tries = 10) {
      for (let i = 0; i < tries; i++) {
        const p = sampler(), c = this.nav.cellOf(p.x, p.y);
        const fx = Math.floor(p.x - this.nav.ox), fy = Math.floor(p.y - this.nav.oy);
        if (fx !== c.cx || fy !== c.cy) continue; // out of bounds
        const path = this.nav.findPath(e.x, e.y, p.x, p.y, 1500);
        if (path && path.length < 60) return p;
      }
      return null;
    }

    _fleeFrom(e, threat) {
      let best = null, bd = -1;
      for (let i = 0; i < 8; i++) {
        const a = Math.atan2(e.y - threat.y, e.x - threat.x) + rand(-1.2, 1.2), r = rand(3, 6);
        const p = { x: e.x + Math.cos(a) * r, y: e.y + Math.sin(a) * r };
        const path = this.nav.findPath(e.x, e.y, p.x, p.y, 800);
        const d = Math.hypot(p.x - threat.x, p.y - threat.y);
        if (path && d > bd) { bd = d; best = path; }
      }
      e.ai.path = best;
      if (!best) e.ai.wait = 0.5;
    }

    _move(e, role, dt) {
      const ai = e.ai;
      if (!ai.path || !ai.path.length) return;
      let mult = 1;
      if (ai.state === 'chase') mult = role.chaseSpeed ?? 1.25;
      else if (ai.state === 'flee') mult = this.time - (ai.fleeStart ?? this.time) < (role.stamina ?? 3) ? role.fleeSpeed ?? 1.5 : 0.8;
      let step = role.speed * dt * mult;
      while (step > 0 && ai.path.length) {
        const wp = ai.path[0], dx = wp.x - e.x, dy = wp.y - e.y, d = Math.hypot(dx, dy);
        if (d < 1e-4) { ai.path.shift(); continue; }
        e.facing = Math.atan2(dy, dx);
        if (d <= step) { e.x = wp.x; e.y = wp.y; ai.path.shift(); step -= d; }
        else { e.x += (dx / d) * step; e.y += (dy / d) * step; step = 0; }
      }
    }

    _face(e, x, y) { e.facing = Math.atan2(y - e.y, x - e.x); }

    // ---------- attacks ----------
    // Roll, apply, and report one attack. opts: advantage, disadvantage, source ('attack'|'opportunity').
    resolveAttack(a, d, opts = {}) {
      const r = G.rules.attackRoll(a, d, opts);
      const ev = { by: a.id, target: d.id, id: d.id, x: d.x, y: d.y, attack: r.attack, roll: r.roll, rolls: r.rolls, mode: r.mode, total: r.total, ac: r.ac, crit: r.crit, parts: r.parts, source: opts.source || 'attack', ranged: !!opts.ranged, penalty: opts.penalty || null };
      if (G.roleOf(d) === 'pc' && this.pcDamage === 'report') {
        this.events.push({ ...ev, type: 'attackPC', hit: r.hit, damage: r.damage, miss: !r.hit });
        return r;
      }
      if (!r.hit) { this.events.push({ ...ev, type: 'miss' }); return r; }
      // Undead Fortitude: dropped to 0 by anything but radiant damage or a crit -> CON save (DC 5 + damage) to stay at 1.
      if (d.stats.hp - r.damage <= 0 && r.damage > 0 && (d.stats.traits || []).includes('undead-fortitude')
          && !r.crit && !r.parts.some((p) => p.type === 'radiant' && p.amount > 0)) {
        const sv = G.rules.savingThrow(d, 'con', 5 + r.damage);
        this.events.push({ type: 'save', id: d.id, x: d.x, y: d.y, trait: 'Undead Fortitude', ...sv });
        if (sv.success) {
          d.stats.hp = 1;
          this.events.push({ ...ev, type: 'hit', amount: r.damage, fortitude: true });
          return r;
        }
      }
      d.stats.hp = Math.max(0, d.stats.hp - r.damage);
      this.events.push({ ...ev, type: 'hit', amount: r.damage });
      if (d.stats.hp === 0) this._kill(d, a);
      return r;
    }

    _kill(d, killer) {
      d.dead = true; d.ai.path = null; d.ai.state = 'dead';
      d.status = G.roleOf(d) === 'zombie' ? 'Destroyed' : 'Slain';
      this.events.push({ type: 'death', id: d.id, x: d.x, y: d.y, by: killer && killer.id });
      const kr = killer && this.role(killer);
      if (G.roleOf(d) === 'pc') { d.status = 'Down'; return; } // PCs never rise (death saves are the table's business)
      if (kr && kr.reanimateChance && G.roleOf(d) !== 'zombie' && Math.random() < kr.reanimateChance) {
        d.ai.reanimateAt = this.time + 3;
        d.ai.riseCombat = d.combatId || null;
      }
    }

    _maybeReanimate(e, force = false) {
      if (e.ai.reanimateAt == null || (!force && this.time < e.ai.reanimateAt)) return false;
      // Same entity (same id → same pin-board card), new role.
      const roleTag = G.roleOf(e);
      e.tags = ['zombie', ...e.tags.filter((t) => t !== roleTag && !G.roles[t] && !t.startsWith('srd:'))];
      e.stats = G.makeStats('zombie', e.tags);
      e.dead = false; e.status = 'Risen';
      this._resetAI(e); e.ai.zoneId = null;
      this.events.push({ type: 'reanimated', id: e.id, x: e.x, y: e.y });
      return true;
    }

    drainEvents() { const ev = this.events; this.events = []; return ev; }

    // ---------- player movement (WASD) ----------
    // dx,dy already scaled by dt. Slides along walls.
    tryMove(e, dx, dy) {
      if (e.combatId || e.dead) return false;
      const r = e.radius;
      if (dx || dy) e.facing = Math.atan2(dy, dx);
      if (!this.nav.moveBlocked(e.x, e.y, e.x + dx, e.y + dy, r)) { e.x += dx; e.y += dy; return true; }
      if (dx && !this.nav.moveBlocked(e.x, e.y, e.x + dx, e.y, r)) { e.x += dx; return true; }
      if (dy && !this.nav.moveBlocked(e.x, e.y, e.x, e.y + dy, r)) { e.y += dy; return true; }
      return false;
    }

    // Nearest door within reach (for an "E to open" key).
    doorNear(x, y, reach = 1.2) {
      let best = null, bd = reach;
      for (const d of this.world.doors) {
        const dist = G.geom.distToSegment(x, y, d.x1, d.y1, d.x2, d.y2);
        if (dist < bd) { bd = dist; best = d; }
      }
      return best;
    }

    // ---------- fights (combat bubbles) ----------
    combatOf(e) { return e && e.combatId ? this.combats.find((c) => c.id === e.combatId) || null : null; }

    // Hostile either way round: a hates b's tags, or b hates a's.
    isEnemy(a, b) {
      if (a === b) return false;
      const ra = this.role(a), rb = this.role(b);
      return shareTag(b.tags, ra.hostileTo || []) || shareTag(a.tags, rb.hostileTo || []);
    }

    combatBehavior(e) {
      const role = this.role(e);
      if (role.playerControlled) return 'player';
      return role.combat || (role.hostileTo ? 'fight' : 'flee');
    }

    // a and b come to blows: start a fight, join the one already running, or merge two fights.
    engage(a, b) {
      const ca = this.combatOf(a), cb = this.combatOf(b);
      if (ca && cb) { if (ca !== cb) this._merge(ca, cb); return ca; }
      if (ca) { ca.join(b); return ca; }
      if (cb) { cb.join(a); return cb; }
      return this._startCombat([a, b]);
    }

    // Could e be pulled into combat c right now?
    _joinable(e, c) {
      if (e.dead || e.combatId) return false;
      // Only enemies pull you in — being near a friendly fighter doesn't, so bubbles can't chain
      // across the whole town.
      const foes = c.combatants().filter((o) => this.isEnemy(e, o));
      if (!foes.length) return false;
      if (c.escapedIds.has(e.id)) return foes.some((o) => Math.hypot(o.x - e.x, o.y - e.y) <= 2);
      return foes.some((o) => {
        const d = Math.hypot(o.x - e.x, o.y - e.y);
        return d <= this.joinRange && (d <= 3 || this.nav.hasLOS(o.x, o.y, e.x, e.y));
      });
    }

    _startCombat(seeds) {
      const c = new G.Combat(this, `c${++this._combatSeq}`, []);
      this.combats.push(c);
      for (const e of seeds) c.join(e, { silent: true });
      // Everyone near the seeds who's involved comes along.
      for (const e of this.entities) if (this._joinable(e, c)) c.join(e, { silent: true });
      this.events.push({ type: 'combatStart', combatId: c.id, order: c.order.slice() });
      c.begin();
      return c;
    }

    // GM tool: start a fight around a point (or the first PC).
    startCombatAt(center) {
      const pc = this.entities.find((e) => !e.dead && G.roleOf(e) === 'pc');
      if (!center) center = pc ? { x: pc.x, y: pc.y } : { x: this.world.origin.x + this.world.width / 2, y: this.world.origin.y + this.world.height / 2 };
      const seeds = this.entities.filter((e) => !e.dead && !e.combatId && Math.hypot(e.x - center.x, e.y - center.y) <= this.joinRange);
      return seeds.length ? this._startCombat(seeds) : null;
    }

    _merge(a, b) {
      const [keep, gone] = a.order.length >= b.order.length ? [a, b] : [b, a];
      keep.absorb(gone);
      this.combats = this.combats.filter((c) => c !== gone);
      this.events.push({ type: 'combatMerged', into: keep.id, from: gone.id });
    }

    endCombat(c) {
      if (!c || !this.combats.includes(c)) return;
      c.phase = 'over';
      this.combats = this.combats.filter((x) => x !== c);
      for (const e of this.entities) {
        if (e.combatId !== c.id) continue;
        e.combatId = null;
        if (e.dead) { if (e.ai.riseCombat === c.id) { e.ai.riseCombat = null; e.ai.reanimateAt = this.time + 1; } continue; }
        this._goIdle(e, rand(0.3, 1.5));
      }
      this.events.push({ type: 'combatEnd', combatId: c.id });
    }

    // Periodically: pull nearby involved creatures into fights, and merge fights that touch.
    _bubbleCheck() {
      for (const c of this.combats) for (const e of this.entities) if (this._joinable(e, c)) c.join(e);
      for (let i = 0; i < this.combats.length; i++) for (let j = i + 1; j < this.combats.length; j++) {
        const A = this.combats[i], B = this.combats[j];
        const touch = A.combatants().some((a) => B.combatants().some((b) =>
          this.isEnemy(a, b) && Math.hypot(a.x - b.x, a.y - b.y) <= this.joinRange && this.nav.hasLOS(a.x, a.y, b.x, b.y)));
        if (touch) { this._merge(A, B); return; } // one merge per check keeps indices simple
      }
    }

    currentTurnIn(c) { return c ? c.current() : null; }

    // Snap creatures to free cell centres, reachable from where they stand, avoiding everyone else.
    _snapToGrid(list) {
      const nav = this.nav, key = (c) => c.cy * nav.w + c.cx;
      const moving = new Set(list), taken = new Set();
      for (const o of this.entities) if (!o.dead && !moving.has(o)) taken.add(key(nav.cellOf(o.x, o.y)));
      for (const e of list) {
        if (e.dead) continue;
        const s = nav.cellOf(e.x, e.y);
        const seen = new Set([key(s)]), queue = [s];
        let found = null;
        while (queue.length) {
          const c = queue.shift();
          if (!taken.has(key(c))) { found = c; break; }
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const n = { cx: c.cx + dx, cy: c.cy + dy };
            if (!nav.canStep(c.cx, c.cy, n.cx, n.cy) || seen.has(key(n))) continue;
            seen.add(key(n)); queue.push(n);
          }
        }
        if (!found) continue;
        taken.add(key(found));
        const p = nav.center(found.cx, found.cy); e.x = p.x; e.y = p.y;
      }
    }

    // ---------- sync & save ----------
    // Small, frequent: positions + visible state. Push ~5x/sec from the GM.
    snapshot() {
      const r2 = (v) => Math.round(v * 100) / 100;
      return {
        t: r2(this.time),
        combats: this.combats.map((c) => c.snapshot()),
        e: this.entities.map((e) => ({ id: e.id, x: r2(e.x), y: r2(e.y), f: r2(e.facing), hp: e.stats.hp, d: e.dead ? 1 : 0, st: e.status })),
      };
    }

    // Player side: apply a GM snapshot. Positions are written to tx/ty so the renderer can lerp.
    applySnapshot(s) {
      for (const p of s.e) {
        const e = this.get(p.id); if (!e) continue;
        e.tx = p.x; e.ty = p.y; e.facing = p.f; e.stats.hp = p.hp; e.dead = !!p.d; e.status = p.st;
      }
    }

    // Full save: everything a pin-board card needs, no runtime AI.
    serializeEntities() {
      return this.entities.map((e) => ({
        id: e.id, name: e.name, tags: e.tags, x: e.x, y: e.y, facing: e.facing,
        stats: e.stats, dead: e.dead, chatty: e.chatty, cardId: e.cardId || null, shop: e.shop || null, purse: e.purse, items: e.items, home: e.ai.home, zoneId: e.ai.zoneId,
      }));
    }
    loadEntities(list) {
      this.entities = list.map((s) => {
        const e = { ...s, radius: 0.3, status: s.dead ? 'Dead' : 'Idle', ai: null };
        delete e.home; delete e.zoneId;
        this._resetAI(e);
        e.ai.home = s.home || { x: s.x, y: s.y };
        e.ai.zoneId = s.zoneId || this._pickHomeZone(e);
        return e;
      });
    }
  }

  G.TownSim = TownSim;
})(window.GeezTown = window.GeezTown || {});
