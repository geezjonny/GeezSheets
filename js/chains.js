// Token-to-token chains — purely visual link between two tokens
// Sags when close, pulls taut when far apart (up to maxDistance, then stays taut-looking)
// No movement constraint — GM enforces any in-fiction limit manually

import { db } from "./firebase.js";
import { ref, set, remove } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-database.js";
import { TILE } from "./config.js";

// chains: { chainId: { tokenA, tokenB, maxDistance } }  — maxDistance in tiles

export async function saveChain(mapName, chainId, tokenA, tokenB, maxDistance = 6) {
  await set(ref(db, `maps/${mapName}/chains/${chainId}`), { tokenA, tokenB, maxDistance });
}

export async function deleteChain(mapName, chainId, chains) {
  await remove(ref(db, `maps/${mapName}/chains/${chainId}`));
  delete chains[chainId];
}

// Find any chain a token is part of
export function chainsForToken(chains, tokenId) {
  return Object.entries(chains).filter(([, c]) => c.tokenA === tokenId || c.tokenB === tokenId);
}

export function drawChains(ctx, chains, tokens, zoom) {
  for (const [chainId, chain] of Object.entries(chains)) {
    const a = tokens[chain.tokenA];
    const b = tokens[chain.tokenB];
    if (!a || !b) continue;

    const sA = a.size || 1, sB = b.size || 1;
    const ax = a.x * TILE + (sA * TILE) / 2, ay = a.y * TILE + (sA * TILE) / 2;
    const bx = b.x * TILE + (sB * TILE) / 2, by = b.y * TILE + (sB * TILE) / 2;

    const distTiles = Math.hypot(bx - ax, by - ay) / TILE;
    const maxDist = chain.maxDistance || 6;
    const tautness = Math.max(0, Math.min(1, distTiles / maxDist)); // 0 = slack, 1 = taut

    // Sag amount — more sag when slack, straightens out as it nears max distance
    const maxSag = TILE * 1.4;
    const sag = maxSag * (1 - tautness);

    // Midpoint, offset downward by sag amount to create a catenary-like droop
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2 + sag;

    ctx.save();
    const tautness_color = tautness > 0.85;

    // Links drawn below replace the base line

    // Draw chain links as ovals rotated along the curve
    {
      const linkCount = Math.max(3, Math.round(distTiles * 3));
      const lw = 4.5 / zoom;   // link oval width
      const lh = 2.2 / zoom;   // link oval height
      const lineW = 1.2 / zoom;
      // Alternate link orientation every other link (perpendicular pairs)
      for (let i = 0; i <= linkCount; i++) {
        const t = i / linkCount;
        // Quadratic bezier point
        const qx = (1-t)*(1-t)*ax + 2*(1-t)*t*mx + t*t*bx;
        const qy = (1-t)*(1-t)*ay + 2*(1-t)*t*my + t*t*by;
        // Tangent direction along curve
        const dt = Math.max(0.01, Math.min(0.99, t));
        const tx2 = 2*(1-dt)*(mx-ax) + 2*dt*(bx-mx);
        const ty2 = 2*(1-dt)*(my-ay) + 2*dt*(by-my);
        const angle = Math.atan2(ty2, tx2) + (i % 2 === 0 ? 0 : Math.PI/2);
        // Draw oval link
        ctx.save();
        ctx.translate(qx, qy);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.ellipse(0, 0, lw, lh, 0, 0, Math.PI*2);
        // Fill with dark metal
        ctx.fillStyle = tautness_color ? "rgba(160,140,100,0.6)" : "rgba(70,65,55,0.7)";
        ctx.fill();
        ctx.strokeStyle = tautness_color ? "rgba(220,190,130,0.95)" : "rgba(140,130,100,0.85)";
        ctx.lineWidth = lineW;
        ctx.stroke();
        ctx.restore();
      }
    }

    // Taut warning: draw a glowing shadow behind the chain links
    if (tautness >= 1) {
      const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 200);
      ctx.save();
      ctx.shadowColor = `rgba(220,80,60,${0.6 + pulse * 0.4})`;
      ctx.shadowBlur = 8 / zoom;
      ctx.strokeStyle = `rgba(220,80,60,${0.15 + pulse * 0.15})`;
      ctx.lineWidth = 6 / zoom;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.quadraticCurveTo(mx, my, bx, by);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }
}
