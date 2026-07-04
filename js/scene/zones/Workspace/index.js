import * as THREE from 'three';
import { createToonMaterial } from '../../ToonMaterials.js';

/**
 * Workspace zone — advanced crafting stations inside the ship's back room.
 *
 * ── Connections ───────────────────────────────────────────────────────────────
 *   spaceship  →  (0, 9)  always unlocked (return)
 */
export function build(env) {
  // Floor (slightly different tint from Spaceship)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(22, 22), createToonMaterial(0x16202a));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  env.group.add(floor);

  // Amber construction grid
  const grid = new THREE.GridHelper(22, 11, 0xffaa44, 0xffaa44);
  grid.position.y = 0.01;
  const gridMats = Array.isArray(grid.material) ? grid.material : [grid.material];
  gridMats.forEach(m => { m.transparent = true; m.opacity = 0.12; });
  grid.visible = false;
  env.group.add(grid);
  env._grids.push(grid);

  // Solid perimeter — gap on south wall (z=11) at x=0 for the return hatch
  for (let wx = -11; wx <= 11; wx += 2) {
    env._collisionCircles.push({ x: wx, z: -11, r: 1.2 }); // north wall
    if (wx !== -1 && wx !== 1) env._collisionCircles.push({ x: wx, z: 11, r: 1.2 }); // south (gap)
  }
  for (let wz = -9; wz <= 9; wz += 2) {
    env._collisionCircles.push({ x: -11, z: wz, r: 1.2 });
    env._collisionCircles.push({ x:  11, z: wz, r: 1.2 });
  }

  // Amber accent strips along all 4 floor edges
  const accentMat = new THREE.MeshBasicMaterial({ color: 0xffaa44 });
  for (const { x, z, rx, len } of [
    { x: 0,   z: -10, rx: 0,           len: 20 },
    { x: 0,   z:  10, rx: 0,           len: 20 },
    { x: -10, z:   0, rx: Math.PI / 2, len: 20 },
    { x:  10, z:   0, rx: Math.PI / 2, len: 20 },
  ]) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.15), accentMat);
    strip.rotation.x = -Math.PI / 2;
    strip.rotation.z = rx;
    strip.position.set(x, 0.02, z);
    env.group.add(strip);
  }

  // ── Stations ──────────────────────────────────────────────────────────────
  env._addWorkshopStation(-7, -3);      // Arc Smelter
  env._addConstructorStation(-3, -3);   // Component Assembler
  env._addExtractorStation(3, -3);      // Fabrication Bay (Advanced Fabricator)
  env._addAssemblyMatrixStation(7, -3); // Spatial 5×5 grid
  env._addRefineryStation(0, -6);       // Extractors + processing-node chain

  // ── Connections ───────────────────────────────────────────────────────────
  env._addPortal(0, 9, 'spaceship', 0, 'Exit Workspace');
  env._addReturnBeacon(0, 9);
}
