/**
 * The Landing Site's lookout knoll — the second use of walkable surfaces, and
 * the proof the pattern is ordinary zone work: a rocky outcrop in the northern
 * meadow with a shelf ramp winding 3/4 of a turn to a grassy ledge, where a
 * rich copper lode sits with a view back over the whole camp.
 *
 * Same one-source-of-truth discipline as the Verdant Maw canopy: these numbers
 * feed the zone builder, the seam test in walkableSurfaces.test.js, and the
 * Blender export (Assets/3D/LandingSite/build_knoll.py).
 */

export const KNOLL = { x: 14, z: -24, coreR: 2.6, topY: 3.0 };

// Shelf ramp: starts on the south face (camera side), 3/4 turn CCW up the
// flank, exiting on the east face just below the ledge.
export const KNOLL_HELIX = {
  kind: 'helix',
  cx: KNOLL.x, cz: KNOLL.z,
  rMid: 3.55, halfW: 0.9, // a touch narrower than the visual shelf (2.6..4.5)
  th0: Math.PI / 2,               // south face
  th1: Math.PI / 2 + 1.5 * Math.PI, // east face, 3/4 turn later
  y0: 0, y1: 2.9,
};

// Grassy summit ledge, and the short step from the shelf exit onto it.
export const KNOLL_LEDGE = { kind: 'disc', x: KNOLL.x, z: KNOLL.z, r: 2.2, y: 3.0 };
export const KNOLL_STEP = {
  kind: 'ramp',
  x0: KNOLL.x + 3.55, z0: KNOLL.z, y0: 2.9,  // helix exit (east face)
  x1: KNOLL.x + 1.2, z1: KNOLL.z, y1: 3.0,   // onto the ledge
  halfW: 0.75,
};

export const KNOLL_SURFACES = [KNOLL_HELIX, KNOLL_STEP, KNOLL_LEDGE];

// Ground-level collision: the rock core. Deliberately smaller than the shelf
// band's inner edge (2.75) so climbers are never pushed off the ramp.
export const KNOLL_CIRCLES = [
  { x: KNOLL.x, z: KNOLL.z, r: KNOLL.coreR },
];
