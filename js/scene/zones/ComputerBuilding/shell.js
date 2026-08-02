import { CHUNK, chunkKey, chunkToWorld } from '../../../systems/computerGenerations.js';

/**
 * Plan → shell geometry, pure data (Labyrinth layout.js grammar): exterior
 * edges, merged wall runs with the door gap, and collision circle chains
 * along the wall lines. Rendering (Environment.buildComputerShell) and the
 * interior builder both consume these; tests probe them directly.
 */

export const DOOR_GAP = 2.2;      // walkable door width in the wall run
const DIRS = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };

/** Every chunk edge not shared with a plan neighbor. {cx,cz,side,x,z} — x,z = edge midpoint. */
export function exteriorEdges(plan) {
  const out = [];
  for (const key of plan) {
    const [cx, cz] = key.split(',').map(Number);
    const [wx, wz] = chunkToWorld(cx, cz);
    for (const [side, [dx, dz]] of Object.entries(DIRS)) {
      if (plan.has(chunkKey(cx + dx, cz + dz))) continue;
      out.push({ cx, cz, side, x: wx + dx * (CHUNK / 2), z: wz + dz * (CHUNK / 2) });
    }
  }
  return out;
}

/**
 * Merge collinear exterior edges into runs {x1,z1,x2,z2}, then cut the door
 * gap (DOOR_GAP centered on the door edge midpoint) out of its run.
 */
export function wallRuns(plan, door, gap = DOOR_GAP) {
  const edges = exteriorEdges(plan);
  const segs = [];
  for (const e of edges) {
    const horiz = e.side === 'N' || e.side === 'S';
    segs.push(horiz
      ? { x1: e.x - CHUNK / 2, z1: e.z, x2: e.x + CHUNK / 2, z2: e.z, line: `z${e.z}` }
      : { x1: e.x, z1: e.z - CHUNK / 2, x2: e.x, z2: e.z + CHUNK / 2, line: `x${e.x}` });
  }
  // merge collinear touching segments (Mine merged-run convention, perf)
  const byLine = new Map();
  for (const s of segs) {
    if (!byLine.has(s.line)) byLine.set(s.line, []);
    byLine.get(s.line).push(s);
  }
  const merged = [];
  for (const [line, list] of byLine) {
    const horiz = line[0] === 'z';
    list.sort((a, b) => horiz ? a.x1 - b.x1 : a.z1 - b.z1);
    let cur = { ...list[0] };
    for (const s of list.slice(1)) {
      const touches = horiz ? Math.abs(s.x1 - cur.x2) < 1e-9 : Math.abs(s.z1 - cur.z2) < 1e-9;
      if (touches) { cur.x2 = s.x2; cur.z2 = s.z2; }
      else { merged.push(cur); cur = { ...s }; }
    }
    merged.push(cur);
  }
  if (!door) return merged;
  // cut the door gap out of whichever run contains the door midpoint
  const [dwx, dwz] = doorMid(door);
  const out = [];
  for (const r of merged) {
    const horiz = r.z1 === r.z2;
    const onLine = horiz ? Math.abs(r.z1 - dwz) < 1e-9 : Math.abs(r.x1 - dwx) < 1e-9;
    const t = horiz ? dwx : dwz;
    const lo = horiz ? Math.min(r.x1, r.x2) : Math.min(r.z1, r.z2);
    const hi = horiz ? Math.max(r.x1, r.x2) : Math.max(r.z1, r.z2);
    if (!onLine || t < lo || t > hi) { out.push(r); continue; }
    const g = gap / 2;
    if (t - g > lo) out.push(horiz
      ? { x1: lo, z1: r.z1, x2: t - g, z2: r.z1 }
      : { x1: r.x1, z1: lo, x2: r.x1, z2: t - g });
    if (t + g < hi) out.push(horiz
      ? { x1: t + g, z1: r.z1, x2: hi, z2: r.z1 }
      : { x1: r.x1, z1: t + g, x2: r.x1, z2: hi });
  }
  return out;
}

function doorMid(door) {
  const [wx, wz] = chunkToWorld(door.cx, door.cz);
  const [dx, dz] = DIRS[door.side];
  return [wx + dx * (CHUNK / 2), wz + dz * (CHUNK / 2)];
}

/**
 * Collision — circle chains along the (door-cut) wall runs. r 0.7 at ≤1.5
 * spacing: gap-free for PLAYER_R 0.35 (needs gap > 2·(0.7+0.35) = 2.1), the
 * Labyrinth numbers. The collision cut is widened by the player clearance
 * (r + PLAYER_R per side) so the end circles of the door-cut runs sit clear
 * of the door span — the visual wall runs keep the true DOOR_GAP.
 */
const CIRCLE_R = 0.7;
const PLAYER_R = 0.35;

export function shellCollisionCircles(plan, door) {
  const out = [];
  for (const r of wallRuns(plan, door, DOOR_GAP + 2 * (CIRCLE_R + PLAYER_R))) {
    const horiz = r.z1 === r.z2;
    const len = horiz ? Math.abs(r.x2 - r.x1) : Math.abs(r.z2 - r.z1);
    const n = Math.max(1, Math.ceil(len / 1.4));
    for (let i = 0; i <= n; i++) {
      const t = len === 0 ? 0 : (i / n) * len;
      out.push(horiz
        ? { x: Math.min(r.x1, r.x2) + t, z: r.z1, r: CIRCLE_R }
        : { x: r.x1, z: Math.min(r.z1, r.z2) + t, r: CIRCLE_R });
    }
  }
  return out;
}
