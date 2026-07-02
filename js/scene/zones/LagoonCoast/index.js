import * as THREE from 'three';
import { createToonMaterial } from '../../ToonMaterials.js';

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
 * Lagoon Coast zone — sandy shore with water pools and palm trees.
 *
 * ── Connections ───────────────────────────────────────────────────────────────
 *   mine  →  (0, -18)  always unlocked (return to portal hub)
 */
export function build(env) {
  env._addGround(0xc2b280); // sand
  const rng = seededRandom(88888);

  // Water pools — positions stored so trees avoid them
  const waterCircles = [];
  for (let i = 0; i < 6; i++) {
    const r = 3 + rng() * 4;
    const wx = (rng() - 0.5) * 30;
    const wz = (rng() - 0.5) * 30;
    waterCircles.push({ x: wx, z: wz, r });
    const mat = createToonMaterial(0x2277aa);
    mat.transparent = true;
    mat.opacity = 0.7;
    const water = new THREE.Mesh(new THREE.CircleGeometry(r, 16), mat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(wx, 0.02, wz);
    env.group.add(water);
  }

  // Palm trees — skip positions inside water
  for (let i = 0; i < 10; i++) {
    const x = (rng() - 0.5) * 30;
    const z = (rng() - 0.5) * 30;
    if (Math.abs(x) < 3 && Math.abs(z) < 3) continue;
    if (Math.hypot(x, z - (-18)) < 3) continue; // keep portal clear
    if (waterCircles.some(w => Math.hypot(x - w.x, z - w.z) < w.r + 1.0)) continue;
    if (env._tooCloseToTree(x, z, 1.0)) continue;
    _addPalmTree(env, x, z);
  }

  // Rocky islands
  for (let i = 0; i < 3; i++) {
    const mat = createToonMaterial(0x887766);
    const island = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2, 0.8, 8), mat);
    island.position.set(8 + (rng() - 0.5) * 10, 0.4, (rng() - 0.5) * 15);
    island.castShadow = true;
    env.group.add(island);
  }

  // ── Connections ───────────────────────────────────────────────────────────
  env._addPortal(0, -18, 'mine', 0, 'Mine Hub');
  env._addReturnBeacon(0, -18);
}

function _addPalmTree(env, x, z) {
  env._treePlacedPositions.push({ x, z });
  const treeGroup = new THREE.Group();
  const h = 2 + Math.random() * 1;

  const trunkMat = createToonMaterial(0x8b6914);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, h, 6), trunkMat);
  trunk.position.y = h / 2;
  trunk.rotation.z = Math.random() * 0.2 - 0.1;
  trunk.castShadow = true;
  treeGroup.add(trunk);

  const leafMat = createToonMaterial(0x228833);
  for (let i = 0; i < 5; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.5, 4), leafMat);
    leaf.position.y = h + 0.2;
    leaf.rotation.z = Math.PI / 4;
    leaf.rotation.y = (i / 5) * Math.PI * 2;
    treeGroup.add(leaf);
  }

  treeGroup.position.set(x, 0, z);
  env.group.add(treeGroup);
  env._collisionCircles.push({ x, z, r: 0.4 });
}
