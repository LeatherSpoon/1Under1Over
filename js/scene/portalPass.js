// Pass-through detection for the vertical Ancient World Gates.
//
// Every gate GLB faces the z axis (portal groups are never rotated), so a
// traversal is a z-plane crossing inside the aperture band. A naive "crossed
// the plane this frame" test would false-fire on players strolling ALONG a
// gate row (the Breach gallery runs east-west straight through five gates),
// so firing takes a committed traversal instead:
//
//   arm:  reach |dz| >= ARM_DIST on one side while inside the aperture band
//   fire: reach |dz| >= ARM_DIST on the OTHER side, having stayed inside the
//         band the whole way (leaving the band disarms)
//
// A gallery stroller hugging z ~ gate.z never gets ARM_DIST deep on both
// sides inside the 2.3-unit-wide band; a real walk-through always does. The
// player also visibly passes the energy membrane before the fade starts,
// which is the point of a walk-through gate.
//
// State lives on the portal record (`_armSide`: 0 | 1 | -1), reset when the
// player leaves the band and implicitly on zone switch (records are rebuilt).

export const APERTURE_HALF_W = 1.15; // ring inner edge 1.55 at scale 1, minus margin
export const ARM_DIST = 0.5;
const TELEPORT_JUMP = 1.5; // a frame displacement this large is a teleport, not a step

/**
 * Advance one portal's pass-through state for this frame's movement.
 * Returns true exactly once per committed traversal.
 */
export function updatePortalPass(portal, x, z, prevX, prevZ) {
  const s = portal.scale || 1;
  const dx = x - portal.position.x;
  const dz = z - portal.position.z;

  // Teleports (rescue drone, doorstep spawns) are not walks — disarm.
  if (Math.hypot(x - prevX, z - prevZ) > TELEPORT_JUMP) {
    portal._armSide = 0;
    return false;
  }
  if (Math.abs(dx) > APERTURE_HALF_W * s) {
    portal._armSide = 0;
    return false;
  }
  if (Math.abs(dz) >= ARM_DIST) {
    const side = dz > 0 ? 1 : -1;
    if (portal._armSide && portal._armSide !== side) {
      portal._armSide = 0;
      return true;
    }
    portal._armSide = side;
  }
  return false;
}
