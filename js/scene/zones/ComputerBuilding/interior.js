import * as THREE from 'three';
import { createToonMaterial } from '../../ToonMaterials.js';
import { CHUNK, chunkToWorld } from '../../../systems/computerGenerations.js';
import { wallRuns } from './shell.js';

/**
 * Inside the computer's building — one room whose footprint IS the player's
 * plan (same world coordinates, so door in/out lines up without any mapping).
 * Machine props derive from the generation table's interiorSet/fillFraction.
 * HomeInteriors is the template: camera looks from +z, so walls on the camera
 * side render as low rims; far walls go full height.
 */

const INTERIOR_SETS = {
  fieldTerminal:   { color: 0x9aa4b0, glow: 0x8fe8cc, w: 1.2, d: 0.9, h: 1.1 },
  missionServers:  { color: 0x6a7480, glow: 0x8fe8cc, w: 0.9, d: 0.9, h: 1.8 },
  integrationBench:{ color: 0x7a6f5a, glow: 0xffcf7a, w: 1.6, d: 0.9, h: 1.0 },
  expeditionRack:  { color: 0x525a66, glow: 0x8fe8cc, w: 1.0, d: 0.9, h: 2.6 },
};

/** mulberry32 — module-local copy (Environment's is not exported). */
function seededRandom(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildComputerCore(env, computer) {
  const H = computer.row().storyHeight;
  const floorMat = createToonMaterial(0x3a4048);
  const wallMat = createToonMaterial(0x565e6a);
  wallMat.side = THREE.DoubleSide;

  for (const key of computer.plan) {
    const [cx, cz] = key.split(',').map(Number);
    const [wx, wz] = chunkToWorld(cx, cz);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(CHUNK, 0.06, CHUNK), floorMat);
    floor.position.set(wx, 0.03, wz);
    env.group.add(floor);
  }
  for (const r of wallRuns(computer.plan, computer.door)) {
    const horiz = r.z1 === r.z2;
    const len = horiz ? Math.abs(r.x2 - r.x1) : Math.abs(r.z2 - r.z1);
    // Camera-side (max-z horizontal) walls become low rims so the room reads
    const isCameraSide = horiz && r.z1 >= maxPlanZ(computer.plan) - 0.1;
    const h = isCameraSide ? 0.5 : H;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(horiz ? len : 0.25, h, horiz ? 0.25 : len), wallMat);
    wall.position.set((r.x1 + r.x2) / 2, h / 2, (r.z1 + r.z2) / 2);
    env.group.add(wall);
  }
  // collision mirrors the exterior exactly (same chains, same door gap)
  const { shellCollisionCircles } = computer._shellFns;
  for (const c of shellCollisionCircles(computer.plan, computer.door)) {
    env._collisionCircles.push({ ...c });
  }

  // ── The machine — fill fillFraction of the plan's floor area ─────────────
  const setDef = INTERIOR_SETS[computer.row().interiorSet];
  const area = computer.plan.size * CHUNK * CHUNK;
  const perProp = setDef.w * setDef.d * 2.2;       // footprint + working clearance
  const count = Math.max(1, Math.round(computer.row().fillFraction * area / perProp));
  const rng = seededRandom(90815 + computer.generation);
  const [dix, diz] = computer.doorInside();
  const placed = [];
  const chunks = [...computer.plan].sort();
  let attempts = 0;
  while (placed.length < count && attempts++ < count * 40) {
    const key = chunks[Math.floor(rng() * chunks.length)];
    const [cx, cz] = key.split(',').map(Number);
    const [wx, wz] = chunkToWorld(cx, cz);
    const x = wx + (rng() - 0.5) * (CHUNK - 1.8);
    const z = wz + (rng() - 0.5) * (CHUNK - 1.8);
    if (Math.hypot(x - dix, z - diz) < 2.0) continue;                 // door approach clear
    if (placed.some(p => Math.hypot(x - p.x, z - p.z) < 1.5)) continue;
    placed.push({ x, z });
    const body = new THREE.Mesh(new THREE.BoxGeometry(setDef.w, setDef.h, setDef.d), createToonMaterial(setDef.color));
    body.position.set(x, setDef.h / 2, z);
    body.rotation.y = Math.floor(rng() * 4) * (Math.PI / 2);
    env.group.add(body);
    const light = new THREE.Mesh(new THREE.BoxGeometry(setDef.w * 0.7, 0.08, 0.05),
      new THREE.MeshBasicMaterial({ color: setDef.glow }));
    light.position.set(x, setDef.h * 0.8, z + setDef.d / 2 + 0.03);
    light.rotation.copy(body.rotation);
    env.group.add(light);
    env._collisionCircles.push({ x, z, r: Math.max(setDef.w, setDef.d) * 0.62 });
  }

  // Lamp — mine-lantern scale (this three build uses physical light units)
  const [lx, lz] = centerOfPlan(computer.plan);
  const lamp = new THREE.PointLight(0x8fe8cc, 4.5, 20, 1);
  lamp.position.set(lx, H - 0.4, lz);
  env.group.add(lamp);

  // Exit — walk back out to the doorstep (spawnOverride = just outside the door)
  const [dox, doz] = computer.doorOutside();
  const [dwx, dwz] = computer.doorWorld();
  env._addDoorway(dwx, dwz, 'landingSite', 'Landing Site', [dox, doz]);
}

function maxPlanZ(plan) {
  let m = -Infinity;
  for (const key of plan) {
    const cz = Number(key.split(',')[1]);
    m = Math.max(m, chunkToWorld(0, cz)[1] + CHUNK / 2);
  }
  return m;
}
function centerOfPlan(plan) {
  let sx = 0, sz = 0;
  for (const key of plan) {
    const [cx, cz] = key.split(',').map(Number);
    const [wx, wz] = chunkToWorld(cx, cz);
    sx += wx; sz += wz;
  }
  return [sx / plan.size, sz / plan.size];
}
