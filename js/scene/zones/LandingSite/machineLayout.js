// The Machine — plot geometry, pure data + math. NO three.js import, so the
// numbers are Node-testable (knoll.js/canopy.js discipline). The THREE-touching
// builder lives in ./machine.js; the Blender kit must mirror these footprints
// when it ships in the asset-pass plan.
// Spec: docs/superpowers/specs/2026-07-27-physical-computer-design.md §3.

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

export function machineFootprint(gen, minors) {
  const core = GEN_CORE[Math.max(0, Math.min(gen, GEN_CORE.length - 1))];
  // Racks march east of the core in seeded rows; ~0.55 units of reach per
  // rack, capped so even absurd rack counts stay inside the playable field.
  const eastReach = core.w / 2 + Math.min(11, 2 + minors * 0.55);
  return { coreH: core.h, coreW: core.w, coreD: core.d, eastReach };
}
