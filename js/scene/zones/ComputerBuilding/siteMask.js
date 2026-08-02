import { CHUNK, chunkToWorld } from '../../../systems/computerGenerations.js';
import { LANDING_KEEPOUT, LANDING_KEEPOUT_SEGS } from '../../ZoneAssets.js';

/**
 * Landing-Site validity mask for chunk placement. A chunk cell is valid when
 * its 6×6 square (plus MARGIN) clears: the static keep-out circles (pad,
 * gates, mountain, camp, arena, knoll, nodes — the scatter's own list), the
 * Starwing exclusion, the pad→adit corridor segment, live collision circles
 * (trees, rocks, props — passed in), and the zone-edge margin.
 */

const MARGIN = 0.5;
const HALF = CHUNK / 2 + MARGIN;
// Starwing planform + boss arena + knoll from LandingSite/index.js outer-woods
// keepClear (not all of those are in LANDING_KEEPOUT at full radius).
// MUST stay in sync with _addOuterWoods keepClear in zones/LandingSite/index.js —
// if a feature there moves or resizes, update this list too:
const EXTRA = [
  { x: 9.0, z: -10.5, r: 15 },   // the Starwing, 26-unit dart planform
  { x: 18, z: 18, r: 7 },        // Scrap Tyrant arena
  { x: 14, z: -24, r: 6.5 },     // lookout knoll + shelf ramp
  { x: -18, z: -18, r: 12 },     // mountain
  { x: 9.4, z: 8.6, r: 5 },      // survivor camp
];
const BOUND = 40 - HALF;         // landingSite ground is ±40

function circleHitsSquare(c, wx, wz) {
  const dx = Math.max(Math.abs(c.x - wx) - HALF, 0);
  const dz = Math.max(Math.abs(c.z - wz) - HALF, 0);
  return Math.hypot(dx, dz) < c.r;
}

function segDist(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz)));
  return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
}

export function isChunkCellValid(cx, cz, liveCircles = []) {
  const [wx, wz] = chunkToWorld(cx, cz);
  if (Math.abs(wx) > BOUND || Math.abs(wz) > BOUND) return false;
  // pad→adit corridor (and any future segs) — shared with the scatter keep-outs
  for (const s of LANDING_KEEPOUT_SEGS) {
    if (segDist(wx, wz, s.ax, s.az, s.bx, s.bz) < s.r + HALF) return false;
  }
  for (const c of [...LANDING_KEEPOUT, ...EXTRA]) if (circleHitsSquare(c, wx, wz)) return false;
  // Circles flagged `computer: true` are the building's own shell — they sit ON
  // the boundary of every adjacent candidate chunk and must not veto growth.
  // Flag-skip instead of pre-filtering keeps the per-frame add-mode check
  // allocation-free (phone perf budget).
  for (const c of liveCircles) if (!c.computer && circleHitsSquare(c, wx, wz)) return false;
  return true;
}
