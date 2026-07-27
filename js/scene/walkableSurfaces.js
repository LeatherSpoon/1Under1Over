/**
 * Walkable surfaces — pure height math for multi-level zones (no three.js
 * import, Node-testable). A zone registers surfaces (env.addWalkableSurface);
 * each frame main.js resolves the player's height at their XZ position.
 *
 * The rule: the player stands on ground (y=0) or on a registered surface.
 * A move is legal only if some candidate height is within STEP_UP of the
 * player's current height — so platform edges block like walls (no falling,
 * no jump physics), and ramps/helixes are climbed simply by walking, because
 * their height changes only a little per frame.
 *
 * Surface kinds:
 *   disc  { kind:'disc',  x, z, r, y }
 *   rect  { kind:'rect',  minX, maxX, minZ, maxZ, y }
 *   ramp  { kind:'ramp',  x0, z0, y0, x1, z1, y1, halfW }
 *         — height linear along the segment, walkable within halfW of it
 *   helix { kind:'helix', cx, cz, rMid, halfW, th0, th1, y0, y1 }
 *         — annular band around (cx,cz); a point's angle is unwrapped into
 *           [th0, th1] (which may span multiple turns), height linear in the
 *           unwrapped angle. A multi-turn helix yields SEVERAL candidate
 *           heights at one XZ (one per turn overhead) — the resolver picks
 *           the one nearest the player's current height.
 *
 * First use: the Verdant Maw's Hometree ascent (zones/VerdantMaw/canopy.js).
 */

// Max height change the player can take in one resolve. Sized for the WORST
// legal frame: an endgame-speed player (≈18 u/s) at the headless 30 fps tick
// steps 0.6 u; on the steepest bridge (grade 0.73, Altar↔Bough) that is a
// 0.44 height change, plus rim-crossing slack. Still far below the gap
// between stacked levels (≥ 3) and between helix turns (5.76), so it never
// tunnels between floors. 0.55 shipped first and made fast players bounce
// off descending bridge mouths.
export const STEP_UP = 0.7;

// Endpoint forgiveness so abutting surfaces overlap instead of leaving a
// hairline gap at seams: ramps extend a touch past their ends, helixes a few
// degrees past their angular range.
const RAMP_T_EPS = 0.04;
const HELIX_TH_EPS = 0.07;

/**
 * All heights surface `s` offers at (x, z) — empty array if the point is off
 * the surface. Only 'helix' can return more than one.
 */
export function surfaceHeightsAt(s, x, z) {
  switch (s.kind) {
    case 'disc': {
      const dx = x - s.x, dz = z - s.z;
      return (dx * dx + dz * dz <= s.r * s.r) ? [s.y] : [];
    }
    case 'rect': {
      return (x >= s.minX && x <= s.maxX && z >= s.minZ && z <= s.maxZ) ? [s.y] : [];
    }
    case 'ramp': {
      const ex = s.x1 - s.x0, ez = s.z1 - s.z0;
      const lenSq = ex * ex + ez * ez;
      if (lenSq < 1e-9) return [];
      const t = ((x - s.x0) * ex + (z - s.z0) * ez) / lenSq;
      if (t < -RAMP_T_EPS || t > 1 + RAMP_T_EPS) return [];
      const px = s.x0 + t * ex, pz = s.z0 + t * ez;
      const perp = Math.hypot(x - px, z - pz);
      if (perp > s.halfW) return [];
      const tc = Math.max(0, Math.min(1, t));
      return [s.y0 + tc * (s.y1 - s.y0)];
    }
    case 'helix': {
      const dx = x - s.cx, dz = z - s.cz;
      const rad = Math.hypot(dx, dz);
      if (Math.abs(rad - s.rMid) > s.halfW) return [];
      const base = Math.atan2(dz, dx); // (-π, π]
      const TWO_PI = Math.PI * 2;
      const heights = [];
      // Unwrap: every base + 2πk that lands inside [th0, th1] is a turn of the
      // ramp passing over this point.
      const kMin = Math.ceil((s.th0 - HELIX_TH_EPS - base) / TWO_PI);
      const kMax = Math.floor((s.th1 + HELIX_TH_EPS - base) / TWO_PI);
      for (let k = kMin; k <= kMax; k++) {
        const th = base + k * TWO_PI;
        const t = Math.max(0, Math.min(1, (th - s.th0) / (s.th1 - s.th0)));
        heights.push(s.y0 + t * (s.y1 - s.y0));
      }
      return heights;
    }
    default:
      return [];
  }
}

/**
 * Resolve the height the player stands at after moving to (x, z), given they
 * are currently at height currentY. Ground (y=0) is always a candidate —
 * every zone's base plane is flat at 0. Returns the HIGHEST candidate within
 * `step` of currentY, or null if none is reachable (the move is illegal: a
 * platform edge, or a wall of air).
 *
 * Highest — not nearest — is the load-bearing choice: ground(0) is present
 * everywhere, so "nearest to current" would pin a ground-level player to 0
 * forever (the ramp 1 cm overhead always loses to the floor underfoot) and
 * no climb could ever begin. Highest-within-step walks up anything gentle,
 * and can't tunnel between stacked levels because those sit whole units
 * apart while `step` stays ≪ the level gap.
 */
export function resolveHeight(surfaces, x, z, currentY, step = STEP_UP) {
  let best = null;
  const consider = (h) => {
    if (Math.abs(h - currentY) <= step && (best === null || h > best)) best = h;
  };
  consider(0);
  for (const s of surfaces) {
    const hs = surfaceHeightsAt(s, x, z);
    for (const h of hs) consider(h);
  }
  return best;
}
