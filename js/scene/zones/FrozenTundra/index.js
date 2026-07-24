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
 * Frozen Tundra zone — arctic snowfield: snow-laden pines, ice crystals, a
 * frozen lake, and an ancient shrine well (all GLB props placed via
 * ZoneAssets). The builder itself lays ground, drifts, the lake, the cave
 * mouth trigger and the trodden path.
 * (An aurora was tried and cut — additive sky ribbons read as painted
 * stripes on the snow at the fixed ortho camera.)
 *
 * The snowfield runs roughly x -30..30, z -24..30. The band below z ~ 17 is
 * the "near" ground closest to the camera and used to be empty flat white —
 * the drift/tree/prop spread deliberately reaches down into it now.
 *
 * ── Connections ───────────────────────────────────────────────────────────────
 *   mine           →  (0, -18)   always unlocked (return to portal hub)
 *   glacialHollow  →  (-15, 15.9) walk-in cave mouth, always unlocked
 */
export function build(env) {
  const rng = seededRandom(88171);

  env._addGround(0xe2ecf5); // fresh snowfield

  // Snow drifts — flat rounded mounds, spread over the full enlarged field
  // (seeded so the layout is stable across zone re-entries)
  const driftMat = createToonMaterial(0xf2f7ff);
  for (let i = 0; i < 22; i++) {
    const w = 2 + rng() * 3.4;
    const d = 1.5 + rng() * 2;
    const drift = new THREE.Mesh(new THREE.CylinderGeometry(w, w * 1.1, 0.4, 10), driftMat);
    drift.position.set((rng() - 0.5) * 58, 0.2, -22 + rng() * 52);
    drift.scale.z = d / w;
    drift.rotation.y = rng() * Math.PI;
    drift.receiveShadow = true;
    env.group.add(drift);
  }

  // ── Frozen lake ────────────────────────────────────────────────────────────
  // Pale ice sheet with a lighter frozen core and a snow-crusted rim.
  const lakeMat = createToonMaterial(0x9fd4ec);
  lakeMat.transparent = true;
  lakeMat.opacity = 0.7;
  const lake = new THREE.Mesh(new THREE.CircleGeometry(6, 28), lakeMat);
  lake.rotation.x = -Math.PI / 2;
  lake.position.set(8, 0.01, 8);
  env.group.add(lake);

  const coreMat = new THREE.MeshBasicMaterial({ color: 0xcfeaf8, transparent: true, opacity: 0.35 });
  const core = new THREE.Mesh(new THREE.CircleGeometry(3.6, 24), coreMat);
  core.rotation.x = -Math.PI / 2;
  core.position.set(8, 0.02, 8);
  env.group.add(core);

  const rimMat = new THREE.MeshBasicMaterial({ color: 0xeaf6ff, transparent: true, opacity: 0.8 });
  const rim = new THREE.Mesh(new THREE.RingGeometry(5.7, 6.08, 40), rimMat);
  rim.rotation.x = -Math.PI / 2;
  rim.position.set(8, 0.015, 8);
  env.group.add(rim);

  // Crack lines across the ice — short, dark, kept well inside the rim
  // (long bright planes read as laser beams at the game camera).
  for (let i = 0; i < 4; i++) {
    const crackMat = new THREE.MeshBasicMaterial({ color: 0x6aa4c0 });
    const crack = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 2 + Math.random() * 1.5), crackMat);
    crack.rotation.x = -Math.PI / 2;
    crack.rotation.z = Math.random() * Math.PI;
    crack.position.set(8 + (Math.random() - 0.5) * 5, 0.025, 8 + (Math.random() - 0.5) * 5);
    env.group.add(crack);
  }

  // ── Connections ───────────────────────────────────────────────────────────
  env._addPortal(0, -18, 'mine', 0, 'Mine Hub');
  env._addReturnBeacon(0, -18);

  // Ice cave on the west ridge — a walk-in mouth, not a world gate.
  //
  // The camera sits at +z (CAMERA_OFFSET.z = 13.5) looking toward -z, so the
  // mouth prop at (-15,14) — exported facing game +z like every other prop —
  // has its opening pointing at the camera, i.e. toward HIGHER z. The trigger
  // therefore belongs on the +z side of the prop; putting it at z < 14 hides it
  // behind the rock and forces the player to walk around the back to enter.
  // Prop collision holds the player at r + PLAYER_R = 2.25 from (-15,14), so
  // z >= 16.25, which is 0.35 from this trigger — comfortably inside the
  // 2.5-unit interact radius, and 4+ units from it on the blind rear side.
  env._addCaveEntrance(-15, 15.9, 'glacialHollow', 'Glacial Hollow');

  // ── Trodden path ──────────────────────────────────────────────────────────
  // Runs east from the cave mouth's apron across the southern flat, so the
  // approach to the cave reads as a route rather than a detour behind a rock.
  const pathMat = new THREE.MeshBasicMaterial({ color: 0xc6d8e8, transparent: true, opacity: 0.45 });
  const PATH = [
    [-15, 17.4], [-11.5, 17.9], [-8, 18.6], [-4.5, 19.0], [-1, 18.8],
    [2.5, 18.2], [6, 18.6], [9.5, 19.4], [13, 19.8], [16.5, 19.4], [20, 18.6],
  ];
  for (let i = 0; i < PATH.length; i++) {
    const [px, pz] = PATH[i];
    const patch = new THREE.Mesh(new THREE.CircleGeometry(1.5 + rng() * 0.5, 12), pathMat);
    patch.rotation.x = -Math.PI / 2;
    patch.rotation.z = rng() * Math.PI;
    patch.position.set(px, 0.02, pz);
    env.group.add(patch);
    // bridge the gap to the next node so the trail is continuous
    if (i < PATH.length - 1) {
      const [nx, nz] = PATH[i + 1];
      const mid = new THREE.Mesh(new THREE.CircleGeometry(1.25, 10), pathMat);
      mid.rotation.x = -Math.PI / 2;
      mid.position.set((px + nx) / 2, 0.02, (pz + nz) / 2);
      env.group.add(mid);
    }
  }
  // Short spur from the path up to the mouth itself
  for (let i = 0; i < 3; i++) {
    const spur = new THREE.Mesh(new THREE.CircleGeometry(1.35 - i * 0.15, 10), pathMat);
    spur.rotation.x = -Math.PI / 2;
    spur.position.set(-15, 0.02, 17.0 - i * 0.65);
    env.group.add(spur);
  }
}
