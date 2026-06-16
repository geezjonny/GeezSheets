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
    // Color shifts subtly toward a tighter/brighter look as it goes taut
    const slackColor = `rgba(120,110,90,0.55)`;
    const tautColor   = `rgba(200,180,140,0.95)`;
    ctx.strokeStyle = tautness > 0.85 ? tautColor : slackColor;
    ctx.lineWidth = (tautness > 0.85 ? 3 : 2.2) / zoom;
    ctx.lineCap = "round";

    // Draw as a quadratic curve through the sagged midpoint
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.quadraticCurveTo(mx, my, bx, by);
    ctx.stroke();

    // Small link "rivets" along the chain for texture, only when reasonably zoomed in
    if (zoom > 0.5) {
      const rivets = 6;
      for (let i = 1; i < rivets; i++) {
        const t = i / rivets;
        // Quadratic bezier point
        const qx = (1 - t) * (1 - t) * ax + 2 * (1 - t) * t * mx + t * t * bx;
        const qy = (1 - t) * (1 - t) * ay + 2 * (1 - t) * t * my + t * t * by;
        ctx.beginPath();
        ctx.arc(qx, qy, 1.6 / zoom, 0, Math.PI * 2);
        ctx.fillStyle = ctx.strokeStyle;
        ctx.fill();
      }
    }

    // Taut warning flash — if tautness is at max, pulse briefly to draw the eye
    if (tautness >= 1) {
      const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 200);
      ctx.strokeStyle = `rgba(220,80,60,${0.3 + pulse * 0.4})`;
      ctx.lineWidth = 4 / zoom;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.quadraticCurveTo(mx, my, bx, by);
      ctx.stroke();
    }

    ctx.restore();
  }
}
