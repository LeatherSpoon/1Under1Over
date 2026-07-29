// Pure screen math for the off-screen landmark indicators. The three.js side
// (js/ui/NavAid.js) does nothing but project world positions to NDC and hand
// them here — same split as PathRibbon.js / pathStrip.js, so the load-bearing
// logic is unit-testable headlessly.

export const MAX_INDICATORS = 6;
// Inset from the true clip-space edge (±1) so a chip sits inside the viewport.
// This is an NDC inset and therefore size-blind — HUD._layoutNavChips does the
// final clamp against the chip's measured pixel box.
export const EDGE_MARGIN = 0.90;

/**
 * Turn projected landmarks into edge-pinned indicators, nearest first.
 *
 * Only NDC x/y are consulted. There is deliberately **no near/far (ndc z)
 * reject**: the game camera is orthographic, so projection has no w divide and
 * x/y stay correct at any depth — including behind the near plane, where
 * distant targets routinely land (the camera sits 14 units up and 13.5 back, so
 * anything past ~25 units ahead of the player in +z projects to z < -1 while
 * still having a perfectly good bearing). An earlier version clipped on z and
 * so went blind at long range, the exact range the aid exists for.
 *
 * @param {{id:string, label:string, kind:string, locked?:boolean, distance:number,
 *          ndcX:number, ndcY:number}[]} projected
 * @param {number} viewportW
 * @param {number} viewportH
 * @returns {{id:string, label:string, kind:string, locked:boolean, edge:'x'|'y',
 *            x:number, y:number, angleDeg:number, distance:number}[]}
 */
export function layoutIndicators(projected, viewportW, viewportH) {
  const out = [];
  for (const t of projected) {
    const { ndcX, ndcY } = t;
    if (Math.abs(ndcX) <= 1 && Math.abs(ndcY) <= 1) continue; // on screen — no chip

    const ax = Math.abs(ndcX), ay = Math.abs(ndcY);
    const kx = ax > 1e-6 ? EDGE_MARGIN / ax : Infinity;
    const ky = ay > 1e-6 ? EDGE_MARGIN / ay : Infinity;
    const k = Math.min(kx, ky);
    // Which edge the chip pins to: 'x' = left/right (free to slide vertically),
    // 'y' = top/bottom (free horizontally). The renderer stacks overlapping
    // chips along the *other* axis so the one carrying the bearing stays exact.
    const edge = kx <= ky ? 'x' : 'y';
    const ex = ndcX * k, ey = ndcY * k;

    out.push({
      id: t.id,
      label: t.label,
      kind: t.kind,
      locked: !!t.locked,
      edge,
      x: (ex * 0.5 + 0.5) * viewportW,
      y: (1 - (ey * 0.5 + 0.5)) * viewportH, // NDC is y-up, screen is y-down
      angleDeg: Math.atan2(-ndcY, ndcX) * (180 / Math.PI), // pre-clamp bearing
      distance: t.distance,
    });
  }
  out.sort((a, b) => a.distance - b.distance);
  return out.slice(0, MAX_INDICATORS);
}
