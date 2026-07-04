import * as THREE from 'three';
import { createToonMaterial, addOutline, addOutlineToGroup } from '../../ToonMaterials.js';
import { CONFIG } from '../../../config.js';

function seededRandom(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Landing Site — the starting zone. Green ground, forest perimeter,
 * mountain with mine portal, and the spaceship landing pad.
 *
 * ── Connections ───────────────────────────────────────────────────────────────
 *   spaceship  →  (4,  -3)   always unlocked
 *   mine       →  (-10, -10) always unlocked
 */
export function build(env) {
  env._addGround(0x5a8c3c);
  _addLandingPad(env);
  _addPathToMountain(env);
  _addForest(env);
  _addMountain(env);
  _addRocks(env);
  env._addSignpost(-3, -3, Math.PI * 0.75, 'TO MINE');
  env._addPortal(4,    -3,  'spaceship', 0, 'Spaceship');
  env._addPortal(-10, -10,  'mine',      0, 'Mine');
}

// ── Landing pad ──────────────────────────────────────────────────────────────
function _addLandingPad(env) {
  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(CONFIG.LANDING_PAD_RADIUS, CONFIG.LANDING_PAD_RADIUS, 0.12, 24),
    createToonMaterial(0x8899aa)
  );
  pad.position.set(0, 0.06, 0);
  pad.receiveShadow = true;
  pad.castShadow = true;
  env.group.add(pad);

  const mark = new THREE.Mesh(
    new THREE.CylinderGeometry(0.4, 0.4, 0.14, 16),
    createToonMaterial(0xccddee)
  );
  mark.position.set(0, 0.07, 0);
  env.group.add(mark);
}

// ── Dirt path to the mountain ─────────────────────────────────────────────────
function _addPathToMountain(env) {
  const endX = -10, endZ = -10;
  const len   = Math.hypot(endX, endZ);
  const angle = Math.atan2(endX, endZ);

  // Main dirt strip
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(1.6, len), createToonMaterial(0x8a7d6b));
  strip.rotation.x = -Math.PI / 2;
  strip.rotation.z = -angle;
  strip.position.set(endX / 2, 0.02, endZ / 2);
  strip.receiveShadow = true;
  env.group.add(strip);

  // Stepping stones
  const tileMat = createToonMaterial(0x9a9a9a);
  for (let i = 1; i <= 8; i++) {
    const t  = i / 9;
    const jx = Math.sin(i * 2.7) * 0.22;
    const jz = Math.cos(i * 1.9) * 0.22;
    const tile = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.08, 0.45), tileMat);
    tile.position.set(endX * t + jx, 0.05, endZ * t + jz);
    tile.rotation.y = i * 0.4;
    tile.receiveShadow = true;
    tile.castShadow = true;
    env.group.add(tile);
  }
}

// ── Procedural forest ring ────────────────────────────────────────────────────
function _addForest(env) {
  const rng   = seededRandom(12345);
  const r     = CONFIG.FOREST_RADIUS;
  const count = CONFIG.TREE_COUNT;

  const pathAngle    = -3 * Math.PI / 4;
  const gapHalfWidth = Math.PI * 0.12;

  // Keep trees away from portals
  const portalPositions = [
    { x:   4, z:  -3 },   // Spaceship
    { x: -10, z: -10 },   // Mine
    { x:   0, z:  20 },   // Verdant Maw
    { x:  20, z:   0 },   // Lagoon Coast
    { x:   0, z: -20 },   // Frozen Tundra
  ];
  const _tooCloseToPortal = (tx, tz) =>
    portalPositions.some(p => Math.hypot(tx - p.x, tz - p.z) < 3.5);

  // Outer ring
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 - Math.PI;
    let d = Math.abs(angle - pathAngle);
    if (d > Math.PI) d = Math.PI * 2 - d;
    if (d < gapHalfWidth) continue;

    const x = Math.cos(angle) * (r + rng() * 3 - 1.5);
    const z = Math.sin(angle) * (r + rng() * 3 - 1.5);
    if (_tooCloseToPortal(x, z)) continue;
    if (env._tooCloseToTree(x, z)) continue;
    env._addTree(x, z, rng);
  }

  // Inner scatter
  const pathDX = -10, pathDZ = -10;
  const pathLenSq = pathDX ** 2 + pathDZ ** 2;
  for (let i = 0; i < 14; i++) {
    const x = -8 + rng() * 16;
    const z = -8 + rng() * 16;
    if (Math.hypot(x, z) < CONFIG.LANDING_PAD_RADIUS + 1.2) continue;
    if (_tooCloseToPortal(x, z)) continue;
    const t  = Math.max(0, Math.min(1, (x * pathDX + z * pathDZ) / pathLenSq));
    const px = pathDX * t, pz = pathDZ * t;
    if (Math.hypot(x - px, z - pz) < 1.3) continue;
    if (env._tooCloseToTree(x, z)) continue;
    env._addTree(x, z, rng);
  }
}

// ── Mountain ──────────────────────────────────────────────────────────────────
function _addMountain(env) {
  const { x, z } = CONFIG.MOUNTAIN_POS;
  const group = new THREE.Group();

  const peak = new THREE.Mesh(new THREE.ConeGeometry(7, 14, 8), createToonMaterial(0x8899aa));
  peak.position.y = 7;
  peak.castShadow = true;
  group.add(peak);

  const snow = new THREE.Mesh(new THREE.ConeGeometry(2.2, 3.5, 8), createToonMaterial(0xeeeeff));
  snow.position.y = 13.5;
  group.add(snow);

  const hill = new THREE.Mesh(new THREE.ConeGeometry(9, 5, 8), createToonMaterial(0x6d7d88));
  hill.position.y = 2.5;
  group.add(hill);

  group.position.set(x, 0, z);
  addOutlineToGroup(group, 0.03);
  env.group.add(group);
  env._collisionCircles.push({ x, z, r: 9 });
}

// ── Drillable rocks scattered around the zone ─────────────────────────────────
function _addRocks(env) {
  const rng = seededRandom(67890);
  const positions = [[5, 7], [-4, 9], [8, -3], [-9, 4], [3, -8]];
  for (const [x, z] of positions) {
    const rock = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.4 + rng() * 0.3, 0),
      createToonMaterial(0x888888)
    );
    rock.position.set(x, 0.3, z);
    rock.rotation.y = rng() * Math.PI;
    rock.castShadow = true;
    addOutline(rock, 0.08);
    env.group.add(rock);
    const collision = { x, z, r: 0.7 };
    env._collisionCircles.push(collision);
    env._rocks.push({ mesh: rock, x, z, alive: true, collision, richness: 3, maxRichness: 3 });
  }
}
