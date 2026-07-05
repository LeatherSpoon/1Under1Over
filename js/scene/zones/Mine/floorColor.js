/**
 * Continuous seeded color field for the Mine floor. Pure math, no Three.js —
 * unit-testable in Node. index.js samples floorColorAt(x, z) per vertex when
 * building the merged floor mesh, so tone changes flow across cell boundaries
 * instead of stepping per tile.
 *
 * Region palettes ramp dark → mid → light; value noise picks the position on
 * the ramp, and region transitions blend over ~2 rows with a noise-wobbled
 * boundary so no straight grid line survives.
 */

// Ramps ordered dark → mid → light (same tones the per-cell floor used).
export const FLOOR_RAMPS = {
  entrance: [0x40301f, 0x4a3623, 0x54402b], // packed dirt, lantern-warm
  shaft:    [0x3a2a1a, 0x44311f, 0x4e3a26],
  cavern:   [0x3f382f, 0x4a4238, 0x544b3f], // worked grey-brown stone
  passage:  [0x3a3140, 0x453b4a, 0x4f4456], // rock going violet
  breach:   [0x302545, 0x3a2d52, 0x443666], // ancient stone
};

const REGIONS = ['entrance', 'shaft', 'cavern', 'passage', 'breach'];
// Region boundaries in continuous row space (row = z / 3.2 + 12); these match
// mineRegionForRow's bands (…4 | 5…7 | 8…16 | 17…19 | 20…).
const BOUNDS = [4.5, 7.5, 16.5, 19.5];
const BLEND_W = 1.1; // half-width of the cross-region blend, in rows

const RAMP_RGB = {};
for (const [region, ramp] of Object.entries(FLOOR_RAMPS)) {
  RAMP_RGB[region] = ramp.map((hex) => [
    ((hex >> 16) & 255) / 255,
    ((hex >> 8) & 255) / 255,
    (hex & 255) / 255,
  ]);
}

function hash2(ix, iz) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

// Value noise: smoothed bilinear interpolation of lattice hashes, in [0,1).
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = smooth(x - ix), fz = smooth(z - iz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

// Two octaves, stretched so the full dark→light ramp gets used.
function toneNoise(x, z) {
  const n = 0.62 * vnoise(x * 0.16, z * 0.16) + 0.38 * vnoise(x * 0.45 + 13.7, z * 0.45 + 71.3);
  return Math.min(1, Math.max(0, (n - 0.5) * 1.6 + 0.5));
}

function rampColor(region, n) {
  const [dark, mid, light] = RAMP_RGB[region];
  const [from, to, t] = n < 0.5 ? [dark, mid, n * 2] : [mid, light, (n - 0.5) * 2];
  return [
    from[0] + (to[0] - from[0]) * t,
    from[1] + (to[1] - from[1]) * t,
    from[2] + (to[2] - from[2]) * t,
  ];
}

/** sRGB [r, g, b] floats (0..1) for a world-space floor point. */
export function floorColorAt(x, z) {
  // Continuous region coordinate in [0, 4], wobbled along x so region
  // transitions never form a straight line across the cave.
  const row = z / 3.2 + 12 + (vnoise(x * 0.22, 40.7) - 0.5) * 2.2;
  let g = 0;
  for (const b of BOUNDS) {
    const t = (row - (b - BLEND_W)) / (2 * BLEND_W);
    g += smooth(Math.min(1, Math.max(0, t)));
  }
  const a = Math.min(REGIONS.length - 1, Math.floor(g));
  const b = Math.min(REGIONS.length - 1, a + 1);
  const t = g - a;

  const n = toneNoise(x, z);
  const ca = rampColor(REGIONS[a], n);
  const cb = t > 0 ? rampColor(REGIONS[b], n) : ca;

  // Fine grain: subtle per-point brightness jitter on top of the broad patches.
  const grain = 1 + (vnoise(x * 1.9 + 5.1, z * 1.9 + 2.7) - 0.5) * 0.12;
  return [
    Math.min(1, (ca[0] + (cb[0] - ca[0]) * t) * grain),
    Math.min(1, (ca[1] + (cb[1] - ca[1]) * t) * grain),
    Math.min(1, (ca[2] + (cb[2] - ca[2]) * t) * grain),
  ];
}
