import * as THREE from 'three';
import { createToonMaterial, addOutline } from '../../ToonMaterials.js';

/**
 * Frozen Tundra zone — icy wastes with dead trees, snow drifts, and a frozen lake.
 *
 * ── Connections ───────────────────────────────────────────────────────────────
 *   mine  →  (0, -18)  always unlocked (return to portal hub)
 */
export function build(env) {
  env._addGround(0xdce8f0); // pale icy blue-white

  // Snow drifts — flat rounded mounds
  for (let i = 0; i < 12; i++) {
    const w = 2 + Math.random() * 3;
    const d = 1.5 + Math.random() * 2;
    const mat = createToonMaterial(0xeef4ff);
    const drift = new THREE.Mesh(new THREE.CylinderGeometry(w, w * 1.1, 0.4, 10), mat);
    drift.position.set((Math.random() - 0.5) * 35, 0.2, (Math.random() - 0.5) * 35);
    drift.scale.z = d / w;
    drift.rotation.y = Math.random() * Math.PI;
    drift.receiveShadow = true;
    env.group.add(drift);
  }

  // Dead bare trees (skeletal, no leaves)
  for (let i = 0; i < 14; i++) {
    const x = (Math.random() - 0.5) * 32;
    const z = (Math.random() - 0.5) * 32;
    if (Math.abs(x) < 4 && Math.abs(z) < 4) continue;
    if (Math.hypot(x, z - (-18)) < 3) continue; // keep portal clear
    if (env._tooCloseToTree(x, z, 0.9)) continue;
    _addDeadTree(env, x, z);
  }

  // Ice formations — jagged vertical spikes
  for (let i = 0; i < 8; i++) {
    const spikeGroup = new THREE.Group();
    const count = 2 + Math.floor(Math.random() * 3);
    for (let j = 0; j < count; j++) {
      const h = 0.8 + Math.random() * 1.4;
      const mat = createToonMaterial(0xa8d8f0);
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.18, h, 5), mat);
      spike.position.set((j - count / 2) * 0.35, h / 2, 0);
      spike.rotation.z = (Math.random() - 0.5) * 0.3;
      spike.castShadow = true;
      addOutline(spike, 0.04);
      spikeGroup.add(spike);
    }
    spikeGroup.position.set((Math.random() - 0.5) * 30, 0, (Math.random() - 0.5) * 30);
    spikeGroup.rotation.y = Math.random() * Math.PI;
    env.group.add(spikeGroup);
  }

  // Frozen lake — flat transparent disc
  const lakeMat = createToonMaterial(0x7ab8d4);
  lakeMat.transparent = true;
  lakeMat.opacity = 0.6;
  const lake = new THREE.Mesh(new THREE.CircleGeometry(6, 20), lakeMat);
  lake.rotation.x = -Math.PI / 2;
  lake.position.set(8, 0.01, 8);
  env.group.add(lake);

  // Crack lines on the lake
  for (let i = 0; i < 4; i++) {
    const crackMat = new THREE.MeshBasicMaterial({ color: 0x4488aa });
    const crack = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 4 + Math.random() * 3), crackMat);
    crack.rotation.x = -Math.PI / 2;
    crack.rotation.z = Math.random() * Math.PI;
    crack.position.set(8 + (Math.random() - 0.5) * 8, 0.02, 8 + (Math.random() - 0.5) * 8);
    env.group.add(crack);
  }

  // ── Connections ───────────────────────────────────────────────────────────
  env._addPortal(0, -18, 'mine', 0, 'Mine Hub');
  env._addReturnBeacon(0, -18);
}

function _addDeadTree(env, x, z) {
  env._treePlacedPositions.push({ x, z });
  const treeGroup = new THREE.Group();
  const h = 2 + Math.random() * 1.5;

  const trunkMat = createToonMaterial(0x4a3830);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, h, 6), trunkMat);
  trunk.position.y = h / 2;
  trunk.castShadow = true;
  addOutline(trunk, 0.04);
  treeGroup.add(trunk);

  // Two bare branches
  const branchMat = createToonMaterial(0x4a3830);
  for (const s of [-1, 1]) {
    const bh = 0.6 + Math.random() * 0.5;
    const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, bh, 5), branchMat);
    branch.position.set(s * 0.4, h * 0.75, 0);
    branch.rotation.z = s * (Math.PI / 4 + Math.random() * 0.2);
    branch.castShadow = true;
    treeGroup.add(branch);
  }

  // Snow cap on trunk top
  const snowCapMat = createToonMaterial(0xeef4ff);
  const snowCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2),
    snowCapMat
  );
  snowCap.position.y = h;
  treeGroup.add(snowCap);

  treeGroup.position.set(x, 0, z);
  treeGroup.rotation.y = Math.random() * Math.PI * 2;
  env.group.add(treeGroup);
  env._collisionCircles.push({ x, z, r: 0.35 });
}
