import * as THREE from 'three';
import { createToonMaterial } from './ToonMaterials.js';
import { buildPathStripData } from './pathStrip.js';

export { buildPathStripData } from './pathStrip.js';

/**
 * PathRibbon — the game's path/trail renderer.
 *
 * Replaces the retired circle-patch trails (overlapping translucent
 * CircleGeometry blobs — owner-rejected 2026-07-25): every path is now ONE
 * merged vertex-colored toon mesh following a Catmull-Rom centerline, with
 * smooth width/wobble noise and edge columns that blend to the zone's exact
 * ground color. Fully opaque — no transparency, no depthWrite games, no decal
 * strobing — and it takes zone lighting like the ground does (same toon
 * material family as the Mine's merged floor).
 *
 * Two looks from one builder:
 *   worn   — soft trodden trail (omit stoneColor)
 *   paved  — the ribbon becomes bedding under staggered irregular flagstones
 *            (stoneColor set), for built routes like the Atlantis processional
 *
 * `buildPathStripData` is pure (no three import) so tests run it headlessly;
 * `addPathRibbon` wraps it into a mesh. Colors cross the pure boundary as
 * [r,g,b] arrays in linear space — the wrapper converts hex via THREE.Color.
 */

const _hexCache = new Map();
function hexToLinear(hex) {
  if (!_hexCache.has(hex)) {
    const c = new THREE.Color(hex);
    _hexCache.set(hex, [c.r, c.g, c.b]);
  }
  return _hexCache.get(hex);
}

/**
 * Build a path mesh and add it to the environment.
 * opts colors are hex ints: { color, groundColor, stoneColor? } + the pure
 * builder's tuning knobs.
 */
export function addPathRibbon(env, points, opts) {
  const data = buildPathStripData(points, {
    ...opts,
    color: hexToLinear(opts.color),
    groundColor: hexToLinear(opts.groundColor),
    stoneColor: opts.stoneColor != null ? hexToLinear(opts.stoneColor) : null,
    coreColor: opts.coreColor != null ? hexToLinear(opts.coreColor) : null,
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(data.colors, 3));
  const normals = new Float32Array(data.positions.length);
  for (let i = 0; i < normals.length; i += 3) normals[i + 1] = 1;
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setIndex(data.indices);
  const mesh = new THREE.Mesh(geo, createToonMaterial(0xffffff, { vertexColors: true }));
  mesh.receiveShadow = true;
  env.group.add(mesh);
  return mesh;
}
