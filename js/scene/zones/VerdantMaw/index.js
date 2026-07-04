import * as THREE from 'three';
import { createToonMaterial } from '../../ToonMaterials.js';

/**
 * Verdant Maw zone — dense alien jungle.
 *
 * ── Connections ───────────────────────────────────────────────────────────────
 *   mine  →  (0, 17)  always unlocked (return to portal hub)
 */
export function build(env) {
  env._addGround(0x2a5a1a);

  // Dense jungle canopy
  for (let i = 0; i < 30; i++) {
    const x = (Math.random() - 0.5) * 35;
    const z = (Math.random() - 0.5) * 35;
    if (Math.abs(x) < 4 && Math.abs(z) < 4) continue; // keep centre clear
    if (Math.hypot(x, z - 17) < 3) continue;           // keep south portal clear
    if (env._tooCloseToTree(x, z, 1.4)) continue;
    _addJungleTree(env, x, z);
  }

  // Hanging vines (decorative, no collision)
  for (let i = 0; i < 8; i++) {
    const geo = new THREE.CylinderGeometry(0.03, 0.03, 3, 4);
    const mat = createToonMaterial(0x336633);
    const vine = new THREE.Mesh(geo, mat);
    vine.position.set(
      (Math.random() - 0.5) * 20,
      1.5,
      (Math.random() - 0.5) * 20
    );
    vine.rotation.z = Math.random() * 0.3 - 0.15;
    env.group.add(vine);
  }

  // ── Connections ───────────────────────────────────────────────────────────
  env._addPortal(0, 17, 'mine', 0, 'Mine Hub');
  env._addReturnBeacon(0, 17);
}

function _addJungleTree(env, x, z) {
  env._treePlacedPositions.push({ x, z });
  const treeGroup = new THREE.Group();
  const h = 2.5 + Math.random() * 1.5;

  const trunkMat = createToonMaterial(0x4a3520);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.25, h, 6), trunkMat);
  trunk.position.y = h / 2;
  trunk.castShadow = true;
  treeGroup.add(trunk);

  const crownMat = createToonMaterial(0x1a4a1a);
  const crown = new THREE.Mesh(new THREE.SphereGeometry(1.2 + Math.random() * 0.5, 8, 6), crownMat);
  crown.position.y = h + 0.5;
  crown.castShadow = true;
  treeGroup.add(crown);

  treeGroup.position.set(x, 0, z);
  env.group.add(treeGroup);
  env._collisionCircles.push({ x, z, r: 0.6 });
}
