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
 * The Depths zone — ultra-deep mining grid with tier-5/6 ore blocks.
 *
 * ── Connections ───────────────────────────────────────────────────────────────
 *   mine  →  (0, -6)  always unlocked (return)
 */
export function build(env) {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(24, 24),
    createToonMaterial(0x0a0a0f)
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  env.group.add(floor);

  // Glowing crystal clusters (decorative)
  const crystalMat = new THREE.MeshBasicMaterial({ color: 0x3333cc });
  for (const [cx, cz] of [[-8,-8],[-8,8],[8,-8],[8,8],[0,-10],[0,10],[-10,0],[10,0]]) {
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), crystalMat);
    m.position.set(cx, 0.5, cz);
    env.group.add(m);
  }

  const rng = seededRandom(99999);
  const spacing = 3, half = 3;
  const depthProps = [
    { tier: 5, ore: 'titanium', chance: 0.35, cost: 20, duration: 8.0,  color: 0x1a1a2a },
    { tier: 6, ore: 'tungsten', chance: 0.40, cost: 30, duration: 12.0, color: 0x0f0f1a },
  ];

  for (let gi = -half; gi <= half; gi++) {
    for (let gj = -half; gj <= half; gj++) {
      const bx = gi * spacing;
      const bz = gj * spacing;

      if (bz < -4 && Math.abs(bx) < 4) continue; // south portal corridor
      if (gi === 0 && gj === 0) continue;          // keep centre open

      const isBorder = (Math.abs(gi) === half || Math.abs(gj) === half);
      if (!isBorder && rng() > 0.60) continue;

      const props = isBorder ? depthProps[1] : depthProps[0];
      const bw = 3.0;
      const bh = 5.0 + rng() * 2.0;
      const bd = 3.0;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), createToonMaterial(props.color));
      mesh.position.set(bx, bh / 2, bz);
      mesh.castShadow = true;
      env.group.add(mesh);

      const { crack1, crack2 } = env._makeCrackStages(mesh, bw, bh, bd);
      const rock = { mesh, x: bx, z: bz, alive: true, props, richness: 3, maxRichness: 3, crack1, crack2 };
      env._rocks.push(rock);
      env._collisionBoxes.push({
        minX: bx - bw / 2, maxX: bx + bw / 2,
        minZ: bz - bd / 2, maxZ: bz + bd / 2,
        rock,
      });
    }
  }

  // ── Connections ───────────────────────────────────────────────────────────
  env._addPortal(0, -6, 'mine', 0, 'Return to Mine');
  env._addReturnBeacon(0, -6);
}
