import * as THREE from 'three';
import { createToonMaterial } from '../../ToonMaterials.js';

/**
 * Maw-tender home interiors — three tiny lamplit rooms behind the hamlet's
 * doors in the Verdant Maw. Shared shell: a round wood floor, a tall wall arc
 * on the far side (the camera looks from +z, so the south face stays a low rim
 * with a door gap), a hanging lamp, and an exit doorway whose spawn override
 * returns the player to that home's doorstep. Furnishings are ZoneAssets
 * entries per zone (furn* GLBs, source Assets/3D/VerdantMaw).
 *
 * ── Connections ───────────────────────────────────────────────────────────────
 *   verdantMaw  →  exit doorway at (0, 3.55), spawns on the owner's doorstep
 */

const ROOM_R = 4.3;
const WALL_R = 4.15;

const OWNERS = {
  sylva: {
    floor: 0x6b5a40, rug: 0x3f7d5c, wall: 0x7a6648,
    lamp: 0x8fe8cc, lampY: 2.3,
    doorstep: [-9.8, 9.1],
  },
  bram: {
    floor: 0x71583a, rug: 0x8a5a30, wall: 0x84643c,
    lamp: 0xffc070, lampY: 2.2,
    doorstep: [-6.9, 10.7],
  },
  sprig: {
    floor: 0x66513a, rug: 0x9a8a4a, wall: 0x76603e,
    lamp: 0xffe9a0, lampY: 1.9,
    doorstep: [-13.6, 12.1],
  },
};

function buildInterior(env, ownerKey) {
  const o = OWNERS[ownerKey];

  // Floor disc + rug
  const floor = new THREE.Mesh(
    new THREE.CylinderGeometry(ROOM_R, ROOM_R, 0.12, 28),
    createToonMaterial(o.floor)
  );
  floor.position.y = -0.06;
  floor.receiveShadow = true;
  env.group.add(floor);
  const rug = new THREE.Mesh(
    new THREE.CylinderGeometry(1.7, 1.7, 0.02, 22),
    createToonMaterial(o.rug)
  );
  rug.position.set(0, 0.02, -0.4);
  rug.receiveShadow = true;
  env.group.add(rug);

  // Walls. CylinderGeometry theta 0 faces +z (toward the camera): the door gap
  // spans ±0.42 rad there, two low rims flank it, and the tall arc covers the
  // rest so the room never occludes itself at the fixed south camera.
  const wallMat = createToonMaterial(o.wall);
  wallMat.side = THREE.DoubleSide;
  const tall = new THREE.Mesh(
    new THREE.CylinderGeometry(WALL_R + 0.15, WALL_R + 0.15, 2.6, 30, 1, true, 1.14, Math.PI * 2 - 2.28),
    wallMat
  );
  tall.position.y = 1.3;
  env.group.add(tall);
  for (const start of [0.42, Math.PI * 2 - 1.14]) {
    const rim = new THREE.Mesh(
      new THREE.CylinderGeometry(WALL_R + 0.15, WALL_R + 0.15, 0.5, 10, 1, true, start, 0.72),
      wallMat
    );
    rim.position.y = 0.25;
    env.group.add(rim);
  }

  // Wall collision — a ring of overlapping circles with a gap at the door
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 9) {
    if (Math.abs(wrap(a)) < 0.58) continue; // door gap
    env._collisionCircles.push({ x: Math.sin(a) * WALL_R, z: Math.cos(a) * WALL_R, r: 0.55 });
  }

  // Hanging lamp — the room's key light (ambience preset keeps the sun low)
  const lamp = new THREE.PointLight(o.lamp, 4.5, 14, 1); // mine-lantern scale (decay 1)
  lamp.position.set(0, o.lampY, -0.6);
  env.group.add(lamp);
  const shade = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 10, 10),
    new THREE.MeshBasicMaterial({ color: o.lamp })
  );
  shade.position.copy(lamp.position);
  env.group.add(shade);
  const cord = new THREE.Mesh(
    new THREE.CylinderGeometry(0.015, 0.015, 3.4 - o.lampY, 5),
    createToonMaterial(0x3a3228)
  );
  cord.position.set(0, o.lampY + (3.4 - o.lampY) / 2, -0.6);
  env.group.add(cord);

  // Exit — back out to this home's doorstep in the hamlet
  env._addDoorway(0, 3.55, 'verdantMaw', 'Verdant Maw', o.doorstep);
}

export function buildHomeSylva(env) { buildInterior(env, 'sylva'); }
export function buildHomeBram(env)  { buildInterior(env, 'bram'); }
export function buildHomeSprig(env) { buildInterior(env, 'sprig'); }
