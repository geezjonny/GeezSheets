// routegraph.js — turns tagged route polylines into a node graph. Where routes cross,
// they're split into a shared junction node. Every edge keeps the tags of its route.
(function (G) {
  const { segIntersectPoint, shareTag } = G.geom;
  const MERGE = 0.2; // grid units — points closer than this become one node

  class RouteGraph {
    constructor(routes) { this.rebuild(routes || []); }

    rebuild(routes) {
      this.nodes = [];
      this.byId = new Map();
      let n = 0;
      const nodeAt = (x, y) => {
        for (const nd of this.nodes) if (Math.hypot(nd.x - x, nd.y - y) < MERGE) return nd;
        const nd = { id: `n${n++}`, x, y, edges: [] };
        this.nodes.push(nd); this.byId.set(nd.id, nd);
        return nd;
      };
      const link = (a, b, route) => {
        if (a === b) return;
        const e = a.edges.find((x) => x.to === b.id);
        if (e) { for (const t of route.tags) if (!e.tags.includes(t)) e.tags.push(t); e.routes.push(route.id); }
        else {
          a.edges.push({ to: b.id, tags: route.tags.slice(), routes: [route.id] });
          b.edges.push({ to: a.id, tags: route.tags.slice(), routes: [route.id] });
        }
      };

      for (const r of routes) {
        for (let i = 0; i < r.points.length - 1; i++) {
          const a = r.points[i], b = r.points[i + 1];
          const cuts = [{ x: a.x, y: a.y, t: 0 }, { x: b.x, y: b.y, t: 1 }];
          for (const o of routes) {
            for (let j = 0; j < o.points.length - 1; j++) {
              if (o === r && Math.abs(i - j) <= 1) continue; // own neighbouring segments share endpoints
              const c = o.points[j], d = o.points[j + 1];
              const hit = segIntersectPoint(a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y);
              if (hit && hit.t > 0.001 && hit.t < 0.999) cuts.push(hit);
            }
          }
          cuts.sort((p, q) => p.t - q.t);
          for (let k = 0; k < cuts.length - 1; k++) link(nodeAt(cuts[k].x, cuts[k].y), nodeAt(cuts[k + 1].x, cuts[k + 1].y), r);
        }
      }
    }

    node(id) { return this.byId.get(id); }

    // Edges out of a node that a role may use. filter(node) optionally restricts destinations.
    usableEdges(node, routeTags, filter) {
      return node.edges.filter((e) => shareTag(e.tags, routeTags) && (!filter || filter(this.byId.get(e.to))));
    }

    // Nearest node that has at least one usable edge.
    nearestNode(x, y, routeTags, filter) {
      let best = null, bd = Infinity;
      for (const nd of this.nodes) {
        if (filter && !filter(nd)) continue;
        if (!this.usableEdges(nd, routeTags, filter).length) continue;
        const d = Math.hypot(nd.x - x, nd.y - y);
        if (d < bd) { bd = d; best = nd; }
      }
      return best;
    }
  }

  G.RouteGraph = RouteGraph;
})(window.GeezTown = window.GeezTown || {});
