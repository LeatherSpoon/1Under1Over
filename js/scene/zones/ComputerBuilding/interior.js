import * as THREE from 'three';
import { createToonMaterial } from '../../ToonMaterials.js';
import { CHUNK, chunkToWorld } from '../../../systems/computerGenerations.js';
import { wallRuns, shellCollisionCircles } from './shell.js';
import { getKitPiece } from './kit.js';

/**
 * Inside the computer's building — one room whose footprint IS the player's
 * plan (same world coordinates, so door in/out lines up without any mapping).
 * Machine props derive from the generation table's interiorSet/fillFraction.
 * HomeInteriors is the template: camera looks from +z, so walls on the camera
 * side render as low rims; far walls go full height.
 */

// Dims are the CK1 GLBs' real measured w×d×h (base-center origin, front +z);
// the pre-kit fallback boxes reuse them. `yaw` is the uniform facing for the
// set (racks aim their teal LED face at the +z camera). MissionServer is a
// 4-tower cluster kept at TRUE scale — a centered centerpiece, one per chunk
// max, never scattered.
const INTERIOR_SETS = {
  fieldTerminal:   { kit: 'FieldTerminal',    color: 0x9aa4b0, glow: 0x8fe8cc, w: 1.06, d: 0.94, h: 1.10 },
  missionServers:  { kit: 'MissionServer',    color: 0x6a7480, glow: 0x8fe8cc, w: 3.64, d: 4.54, h: 1.80, centerpiece: true },
  integrationBench:{ kit: 'IntegrationBench', color: 0x7a6f5a, glow: 0xffcf7a, w: 1.52, d: 0.91, h: 1.00 },
  expeditionRack:  { kit: 'ExpeditionRack',   color: 0x525a66, glow: 0x8fe8cc, w: 1.32, d: 0.90, h: 2.60, yaw: 0 },
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
    // Horizontal walls on the plan's southmost line (max z = camera side) become
    // low rims so the room reads at the fixed +z camera; −0.1 absorbs FP error.
    // An L-plan can have two such runs — both rim, which is the right read.
    const isCameraSide = horiz && r.z1 >= maxPlanZ(computer.plan) - 0.1;
    const h = isCameraSide ? 0.5 : H;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(horiz ? len : 0.25, h, horiz ? 0.25 : len), wallMat);
    wall.position.set((r.x1 + r.x2) / 2, h / 2, (r.z1 + r.z2) / 2);
    env.group.add(wall);
  }
  // collision mirrors the exterior exactly (same chains, same door gap —
  // NB the collision cut is wider than the visual gap, see shell.js)
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
  const chunks = [...computer.plan].sort();
  const yaw = setDef.yaw || 0;

  // One unit of the machine — kit clone when loaded, toon box + glow strip
  // fallback otherwise (boot with a cold cache must never show nothing).
  const addProp = (x, z) => {
    const piece = getKitPiece(setDef.kit);
    if (piece) {
      piece.position.set(x, 0, z);
      piece.rotation.y = yaw;
      env.group.add(piece);
    } else {
      const body = new THREE.Mesh(new THREE.BoxGeometry(setDef.w, setDef.h, setDef.d), createToonMaterial(setDef.color));
      body.position.set(x, setDef.h / 2, z);
      body.rotation.y = yaw;
      env.group.add(body);
      const light = new THREE.Mesh(new THREE.BoxGeometry(setDef.w * 0.7, 0.08, 0.05),
        new THREE.MeshBasicMaterial({ color: setDef.glow }));
      light.position.set(x, setDef.h * 0.8, z + setDef.d / 2 + 0.03);
      light.rotation.copy(body.rotation);
      env.group.add(light);
    }
    if (setDef.centerpiece) {
      // The 3.64×4.54 cluster as one circle either seals its chunk (r ≥ 1.6
      // parks the player outside the walkable ring) or lets the player clip
      // deep into the towers — two capsule circles along the deep axis hug
      // the true footprint instead (sides tangent at r 1.45 + PLAYER_R).
      env._collisionCircles.push({ x, z: z - 1.1, r: 1.45 });
      env._collisionCircles.push({ x, z: z + 1.1, r: 1.45 });
    } else {
      env._collisionCircles.push({ x, z, r: Math.max(setDef.w, setDef.d) * 0.62 });
    }
  };

  if (setDef.centerpiece) {
    // Farthest-from-the-door chunks first; the door chunk is used only when
    // it is the whole plan, and then the cluster slides away from the door.
    const ranked = chunks.map((key) => {
      const [cx, cz] = key.split(',').map(Number);
      const [wx, wz] = chunkToWorld(cx, cz);
      return { wx, wz, doorDist: Math.hypot(wx - dix, wz - diz) };
    }).sort((a, b) => b.doorDist - a.doorDist);
    for (const spot of ranked.slice(0, Math.min(count, ranked.length))) {
      let { wx, wz } = spot;
      if (spot.doorDist < 3.4) {
        const len = Math.hypot(wx - dix, wz - diz) || 1;
        wx += ((wx - dix) / len) * 1.2;
        wz += ((wz - diz) / len) * 1.2;
      }
      addProp(wx, wz);
    }
  } else {
    // Organization pass — data-centers are ORGANIZED: props snap to per-chunk
    // row/column grids (seeded aisle spacing, uniform facing) with ≤0.15
    // seeded jitter so it's not robotic. Steps are floored at 2r+0.9 so every
    // aisle and row gap stays player-passable (needs 2·(r+PLAYER_R) clear).
    const r = Math.max(setDef.w, setDef.d) * 0.62;
    const candidates = [];
    for (const key of chunks) {
      const [cx, cz] = key.split(',').map(Number);
      const [wx, wz] = chunkToWorld(cx, cz);
      const stepX = Math.max(setDef.w + 0.55, 2 * r + 0.9);
      const stepZ = Math.max(setDef.d + 1.0 + rng() * 0.5, 2 * r + 0.9);
      const usable = CHUNK - 2.0;                       // 1.0 margin off the walls
      const cols = Math.max(1, Math.floor(usable / stepX) + 1);
      const rows = Math.max(1, Math.floor(usable / stepZ) + 1);
      for (let rr = 0; rr < rows; rr++) {
        for (let cc = 0; cc < cols; cc++) {
          candidates.push({
            x: wx - ((cols - 1) * stepX) / 2 + cc * stepX + (rng() - 0.5) * 0.3,
            z: wz - ((rows - 1) * stepZ) / 2 + rr * stepZ + (rng() - 0.5) * 0.3,
          });
        }
      }
    }
    // Grid capacity caps the count on tight plans — at gen-4 density the room
    // is MEANT to read crowded, so under-packing is acceptable (same stance as
    // the old rejection-sampling cap).
    let placedCount = 0;
    for (const p of candidates) {
      if (placedCount >= count) break;
      if (Math.hypot(p.x - dix, p.z - diz) < 2.0) continue;   // door approach clear
      addProp(p.x, p.z);
      placedCount++;
    }
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
