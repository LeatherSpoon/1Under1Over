import * as THREE from 'three';
import { createToonMaterial, addOutline } from '../../ToonMaterials.js';

/**
 * Spaceship Interior zone — all stations and interactive terminals.
 * Station builders (_addFabricator, etc.) live in Environment.js and are
 * accessed via env.
 *
 * ── Connections ───────────────────────────────────────────────────────────────
 *   workspace    →  (0, -9)  always unlocked
 *   landingSite  →  (0,  6)  always unlocked (exit ship)
 */
export function build(env) {
  // Floor
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(22, 22), createToonMaterial(0x1a1a2e));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  env.group.add(floor);

  // Construction grid
  const grid = new THREE.GridHelper(22, 11, 0x00ffcc, 0x00ffcc);
  grid.position.y = 0.01;
  const gridMats = Array.isArray(grid.material) ? grid.material : [grid.material];
  gridMats.forEach(m => { m.transparent = true; m.opacity = 0.12; });
  grid.visible = false;
  env.group.add(grid);
  env._grids.push(grid);

  // Solid perimeter collision — north wall has a 4-unit gap at x=0 for the Workspace hatch
  for (let wx = -11; wx <= 11; wx += 2) {
    if (wx !== -1 && wx !== 1) env._collisionCircles.push({ x: wx, z: -11, r: 1.2 }); // north (gap)
    env._collisionCircles.push({ x: wx, z: 11, r: 1.2 });                              // south
  }
  for (let wz = -9; wz <= 9; wz += 2) {
    env._collisionCircles.push({ x: -11, z: wz, r: 1.2 }); // west
    env._collisionCircles.push({ x:  11, z: wz, r: 1.2 }); // east
  }

  // Cyan accent strips along floor edges
  const accentMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc });
  for (const { x, z, len } of [{ x: 0, z: -10, len: 20 }, { x: 0, z: 10, len: 20 }]) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.15), accentMat);
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(x, 0.02, z);
    env.group.add(strip);
  }

  // ── Stations ──────────────────────────────────────────────────────────────
  env._addFabricator(5, -3);
  env._addOffloadStation(-8, 0);

  // Holographic wall panels (decorative)
  for (const [px, pz, ry] of [[-9, -5, 0.3], [9, -5, -0.3]]) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.8, 0.1), createToonMaterial(0x0a2233));
    panel.position.set(px, 1.5, pz);
    panel.rotation.y = ry;
    addOutline(panel, 0.04);
    env.group.add(panel);

    const screenMat = new THREE.MeshBasicMaterial({ color: 0x003322, transparent: true, opacity: 0.8 });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.4), screenMat);
    screen.position.set(px, 1.5, pz + (ry > 0 ? -0.1 : 0.1));
    screen.rotation.y = ry;
    env.group.add(screen);
  }

  env._addChargingStation(-5, 3);
  env._addDroneMonitor(5, 3);
  env._addAscensionTerminal(0, -6);
  env._addMasteryTerminal(6, -6);

  // ── Connections ───────────────────────────────────────────────────────────
  env._addPortal(0, -9, 'workspace',   0, 'Workspace');
  env._addPortal(0,  6, 'landingSite', 0, 'Exit Ship');
  env._addReturnBeacon(0, 6);
}
