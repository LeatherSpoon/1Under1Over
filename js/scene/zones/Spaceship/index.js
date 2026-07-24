import * as THREE from 'three';
import { createToonMaterial } from '../../ToonMaterials.js';

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
  // Floor — warm under-layer; the SpaceshipShell GLB lays its plank deck on top
  // (ZoneAssets entry), so this plane only shows pre-load or if the GLB fails.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(22, 22), createToonMaterial(0x2a2119));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  env.group.add(floor);

  // Construction grid — above the shell deck (plank tops ~0.02, inlay ~0.045)
  const grid = new THREE.GridHelper(22, 11, 0x00ffcc, 0x00ffcc);
  grid.position.y = 0.05;
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

  // ── Stations ──────────────────────────────────────────────────────────────
  // (Old cyan floor strips + floating holo wall panels retired — the shell GLB
  // bakes glow lines into the walls and frames real wall screens at z=-5.)
  env._addFabricator(5, -3);
  env._addOffloadStation(-8, 0);
  env._addChargingStation(-5, 3);
  env._addDroneMonitor(5, 3);

  // Training chamber — holodeck sim room; program chosen at its console
  // (TrainingAreaSystem). Walk in to train, walk out to stop.
  env._addTrainingChamber(-7.4, 6.4, 2.0);
  env._addCombatSimRig(8, 0); // sparring rig — simulated combat trains STR/DEF
  env._addAscensionTerminal(0, -6);
  env._addMasteryTerminal(6, -6);

  // ── Connections ───────────────────────────────────────────────────────────
  env._addPortal(0, -9, 'workspace',   0, 'Workspace');
  env._addPortal(0,  6, 'landingSite', 0, 'Exit Ship');
  env._addReturnBeacon(0, 6);
}
