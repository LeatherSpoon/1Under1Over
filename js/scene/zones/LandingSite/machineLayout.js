// The Machine — plot geometry, pure data + math. NO three.js import, so the
// numbers are Node-testable (knoll.js/canopy.js discipline). The THREE-touching
// builder lives in ./machine.js; the Blender kit must mirror these footprints
// when it ships in the asset-pass plan.
// Spec: docs/superpowers/specs/2026-07-27-physical-computer-design.md §3.
//
// Review pass 2: collision moved to pure machineCircles() (per-rack circles
// replaced the over-blocking disc), console trigger tracks the pedestal per
// gen, rack draw cap keeps the field in-bounds, length-keyed cache
// invalidated on rebuild.

export const MACHINE_PLOT = { x: 26, z: 0 };   // plot centre — growth extends east
export const MACHINE_CORE = { x: 20, z: 0 };   // Gen 0 core / console anchor (west edge)
export const MACHINE_KEEPOUT = { x: 26, z: 0, r: 9 }; // forest-scatter rejection circle

// Per-generation core silhouette (world units). Gens past the table clamp to
// its last row until the matching plan ships their stage.
export const GEN_CORE = [
  { h: 1.5, w: 1.6, d: 1.2 },   // gen0 Field Core — crate + antenna
  { h: 2.5, w: 2.2, d: 1.6 },   // gen1 Calibration Bank — adds a cabinet tier
  { h: 4.0, w: 3.0, d: 2.2 },   // gen2 Fabrication Co-processor — first tower
];

function clampedCore(gen) {
  return GEN_CORE[Math.max(0, Math.min(gen, GEN_CORE.length - 1))];
}

// Core silhouette only. `minors` used to also drive an `eastReach` field for
// a single blocking disc over the whole rack field, but that disc was the
// invisible-wall defect this pass fixes (machineCircles() below replaced it
// with per-rack circles); nothing else read eastReach, so it — and the
// now-unused second parameter — are gone.
export function machineFootprint(gen) {
  const core = clampedCore(gen);
  return { coreH: core.h, coreW: core.w, coreD: core.d };
}

// Console pedestal / interact-trigger position (CLAUDE.md's interact-radius
// gotcha: the console must sit close to where collision actually stops the
// player, or the prompt never fires). gen<0 (pre-build) keeps the salvage
// heap's prompt exactly where it sits today, MACHINE_CORE.x - 1.6 — which
// happens to equal the gen>=0 formula evaluated at GEN_CORE[0] (w=1.6:
// 1.6/2 + 0.8 = 1.6), but the two are conceptually independent (the heap's
// boxes are positioned by their own fixed offsets, unrelated to GEN_CORE[0].w)
// so the pre-build case is spelled out rather than leaned on as a coincidence.
export function consolePos(gen) {
  if (gen < 0) return { x: MACHINE_CORE.x - 1.6, z: MACHINE_CORE.z };
  const core = clampedCore(gen);
  return { x: MACHINE_CORE.x - core.w / 2 - 0.8, z: MACHINE_CORE.z };
}

// Expansion racks march east of the core in seeded 3-row columns. Anchored to
// the WIDEST core (gen2, the last GEN_CORE row) rather than whichever gen is
// current, so a rack placed while the core is still small (gen0/gen1) can
// never end up swallowed once a later upgrade grows the core body — the
// anchor is fixed at the largest size the core will ever reach.
const RACK_ANCHOR_W = GEN_CORE[GEN_CORE.length - 1].w;
const RACK_COL_PITCH = 0.9;
const RACK_ROW_PITCH = 1.4;

export function rackSlot(i) {
  const col = Math.floor(i / 3);
  const row = i % 3;
  return {
    x: MACHINE_CORE.x + RACK_ANCHOR_W / 2 + 1.2 + col * RACK_COL_PITCH,
    z: MACHINE_CORE.z - 1.4 + row * RACK_ROW_PITCH,
  };
}

// Highest rack index still drawn as an individual mesh + collision circle.
// Derivation: a rack is a 0.5-wide box (half-width 0.25); allow a further
// 0.25 for its +-0.075 visual jitter (rounded up generously). At the widest
// core (gen2, w=3.0) the rack column anchor is MACHINE_CORE.x + 3.0/2 + 1.2
// = MACHINE_CORE.x + 2.7, so column c's east edge sits at
// MACHINE_CORE.x + 2.7 + 0.9c + 0.5. Requiring that stay <= 34 (5 units of
// margin inside the true 39-unit playable edge, so the rack field never
// brushes the world boundary) gives:
//   MACHINE_CORE.x(20) + 2.7 + 0.9c + 0.5 <= 34  =>  0.9c <= 10.8  =>  c <= 12
// Column 12 is last reached by rack index 38 (floor(38/3) = 12), so the cap
// is 39 racks (indices 0..38). Excess racks beyond the cap densify rather
// than sprawl further east — the kit pass owns that visual.
export const RACK_DRAW_CAP = 39;

export function drawnRacks(minors) {
  return Math.min(minors, RACK_DRAW_CAP);
}

// Full machine-tagged collision set for the current build state — the single
// source of truth for both the builder's pushCircles() and these tests.
// Replaces the old single "shallow circle over the whole rack field" disc,
// which blocked long before any geometry did (the invisible-wall defect),
// with one small circle per DRAWN rack instead.
export function machineCircles(gen, minors) {
  if (gen < 0) {
    return [{ x: MACHINE_CORE.x, z: MACHINE_CORE.z, r: 1.0, machine: true }];
  }
  const core = clampedCore(gen);
  const circles = [{
    x: MACHINE_CORE.x, z: MACHINE_CORE.z,
    r: Math.hypot(core.w, core.d) / 2 + 0.1, machine: true,
  }];
  const n = drawnRacks(minors);
  for (let i = 0; i < n; i++) {
    const slot = rackSlot(i);
    circles.push({ x: slot.x, z: slot.z, r: 0.45, machine: true });
  }
  return circles;
}
