import * as THREE from 'three';
import {
  createToonMaterial, addOutline, createRevealToonMaterial, createRevealOutlineMaterial,
} from '../../ToonMaterials.js';
import { addPathRibbon } from '../../PathRibbon.js';

function seededRandom(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GROTTO_WALL = 0x24485a;   // teal-slate drowned rock
const PLAZA_STONE = 0x475d68;   // weathered blue-grey pavement
const DAIS_STONE  = 0x52707c;
const GLOW_CYAN   = 0x3fe8ff;   // Atlantean glyph light
const WATER_GLOW  = 0x55e8d8;   // luminous shallows
const WATER_TEAL  = 0x2a8a92;
const BED_DARK    = 0x0e2430;
const SAND_WARM   = 0x8a7658;

/**
 * ATLANTIS — the drowned world beyond the Breach.
 *
 * A city that chose the deep: a vast air-pocket grotto where the sea stands in
 * glowing canals and pools between weathered blue-grey ruins. Palette is
 * ATLA/Ghibli softness over Disney-Atlantis color logic — dark teal depths,
 * cyan glyph-light on old stone, warm sand and coral accents.
 *
 * Composition: the world gate opens onto a processional way running south to
 * the Great Plaza, a paved circle inside a glowing ring-canal crossed by four
 * bridges. The Crystal Heart — the light the city left burning — stands on a
 * dais at its center. West lies a drowned pool where a colossal guardian head
 * stares out of the water; east its upright twin watches over the approach.
 * North-east a wrecked hull rests in a warm sand shallow; south-west a ruined
 * temple dome marks the old sanctum; the south path leaves the plaza under a
 * crumbling archway toward steles and kelp gardens.
 *
 * All GLB dressing (heads, dome, columns, wreck, kelp, coral, braziers…)
 * comes from ZONE_ASSETS.atlantis; this builder makes the grotto itself:
 * ground, wall ring (reveal materials), water, plaza, dais, paths, lights.
 *
 * The grotto ring is broken at its southern point: a mouth opens on a walled
 * corridor running out to a small drowned end chamber — the city's back door.
 * An Ancient World Gate stands half-drowned in the chamber's pool: the way
 * into the Labyrinth. (The Meltwater Rift's Sunken Door could still join the
 * corridor from the side if that link is ever built.)
 *
 * ── Connections ───────────────────────────────────────────────────────────────
 *   mine      →  (0, -16)   always unlocked (return gate into the Breach chamber)
 *   labyrinth →  (0, 30.5)  always unlocked (the end-chamber gate)
 */
export function build(env) {
  const rng = seededRandom(84213);

  env._addGround(0x16303c); // drowned stone — dark, blue-leaning

  // ── Grotto wall ring ───────────────────────────────────────────────────────
  // Same enclosure grammar as the Hollow/Rift rings; reveal materials open the
  // rock around the player so the fixed 46° ortho camera can always see in.
  const wallMat = createRevealToonMaterial(GROTTO_WALL, { revealR: 2.0 });
  const wallDeepMat = createRevealToonMaterial(0x1c3a4c, { revealR: 2.0 });
  const wallOutlineMat = createRevealOutlineMaterial({ revealR: 2.0 });
  env._revealMaterials.push(wallMat, wallDeepMat, wallOutlineMat);

  // One grotto block: the ring, the south corridor and its end chamber are all
  // built from these so the new passage reads as the same drowned rock.
  const grottoBlock = (x, z, facing) => {
    const h = 3.2 + rng() * 2.4;
    const w = 2.7 + rng() * 1.8;
    const geo = new THREE.CylinderGeometry(w * 0.4, w * 0.74, h, 6);
    const block = new THREE.Mesh(geo, rng() < 0.34 ? wallDeepMat : wallMat);
    block.position.set(x, h / 2 - 0.3, z);
    block.rotation.set((rng() - 0.5) * 0.14, facing + rng() * 1.2, (rng() - 0.5) * 0.14);
    block.castShadow = true;
    env.group.add(block);

    const shell = new THREE.Mesh(geo, wallOutlineMat);
    shell.position.copy(block.position);
    shell.rotation.copy(block.rotation);
    shell.scale.setScalar(1.02);
    env.group.add(shell);

    env._collisionCircles.push({ x, z, r: w * 0.6 });
  };

  // The ring is broken at its southern point: the city's back door, opening on
  // the corridor built below. MOUTH_HALF is wide enough that the widest possible
  // pair of flanking blocks still leaves a walkable gap (asserted in tests).
  const RING_R = 23;
  const SEGMENTS = 56;
  const MOUTH_A = Math.PI / 2;   // +z is south
  const MOUTH_HALF = 0.26;       // radians either side of it
  for (let i = 0; i < SEGMENTS; i++) {
    const a = (i / SEGMENTS) * Math.PI * 2;
    let da = Math.abs(a - MOUTH_A);
    if (da > Math.PI) da = Math.PI * 2 - da;
    if (da < MOUTH_HALF) continue; // leave the mouth open
    const r = RING_R + (rng() - 0.5) * 1.9;
    grottoBlock(Math.cos(a) * r, Math.sin(a) * r, a);
  }

  // ── The south corridor ─────────────────────────────────────────────────────
  // Out through the mouth, down a walled passage, into a small drowned end
  // chamber. Ground and bounds already reach here (the zone uses the default
  // 80×80 footprint), so this only needs walls, a route and light.
  const CORRIDOR_HALF_W = 4.2;
  for (const cz of [21.5, 24, 26.5, 29]) {
    grottoBlock(-CORRIDOR_HALF_W, cz, Math.PI / 2);
    grottoBlock(CORRIDOR_HALF_W, cz, -Math.PI / 2);
  }
  const END = { x: 0, z: 32.5, r: 4.8 };
  for (let i = 0; i <= 9; i++) {
    const t = -0.12 * Math.PI + (i / 9) * 1.24 * Math.PI;
    grottoBlock(Math.cos(t) * END.r, END.z + Math.sin(t) * END.r, t);
  }

  // Still water pooled in the end chamber — the sea creeping back in.
  const endBed = new THREE.Mesh(
    new THREE.CircleGeometry(2.7, 22),
    new THREE.MeshBasicMaterial({ color: 0x0e2028, transparent: true, opacity: 0.8, depthWrite: false })
  );
  endBed.rotation.x = -Math.PI / 2;
  endBed.position.set(END.x, 0.014, END.z);
  env.group.add(endBed);
  const endWater = new THREE.Mesh(
    new THREE.CircleGeometry(2.45, 22),
    new THREE.MeshBasicMaterial({ color: WATER_TEAL, transparent: true, opacity: 0.38, depthWrite: false })
  );
  endWater.rotation.x = -Math.PI / 2;
  endWater.position.set(END.x, 0.018, END.z);
  env.group.add(endWater);
  const endRim = new THREE.Mesh(
    new THREE.RingGeometry(2.1, 2.55, 22),
    new THREE.MeshBasicMaterial({ color: WATER_GLOW, transparent: true, opacity: 0.26, depthWrite: false })
  );
  endRim.rotation.x = -Math.PI / 2;
  endRim.position.set(END.x, 0.021, END.z);
  env.group.add(endRim);

  // ── The Great Plaza ────────────────────────────────────────────────────────
  // Paved circle at (0,2) inside a glowing ring-canal. The canal is water, not
  // wall — walkable, ankle-deep — but the four bridges say "cross here".
  const PLAZA = { x: 0, z: 2 };
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(6.6, 36), createToonMaterial(PLAZA_STONE));
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(PLAZA.x, 0.013, PLAZA.z);
  plaza.receiveShadow = true;
  env.group.add(plaza);

  // Glyph ring worked into the pavement
  const glyphRing = new THREE.Mesh(
    new THREE.RingGeometry(5.2, 5.5, 48),
    new THREE.MeshBasicMaterial({ color: GLOW_CYAN, transparent: true, opacity: 0.32, depthWrite: false })
  );
  glyphRing.rotation.x = -Math.PI / 2;
  glyphRing.position.set(PLAZA.x, 0.022, PLAZA.z);
  env.group.add(glyphRing);
  const runeMat = new THREE.MeshBasicMaterial({ color: GLOW_CYAN, transparent: true, opacity: 0.4, depthWrite: false });
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const rune = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.55), runeMat);
    rune.rotation.x = -Math.PI / 2;
    rune.rotation.z = a + rng();
    rune.position.set(PLAZA.x + Math.cos(a) * 4.3, 0.024, PLAZA.z + Math.sin(a) * 4.3);
    env.group.add(rune);
  }

  // Ring-canal: dark bed, luminous water, bright centerline
  const mkRing = (rIn, rOut, color, opacity, y) => {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(rIn, rOut, 56),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(PLAZA.x, y, PLAZA.z);
    env.group.add(m);
  };
  mkRing(7.4, 9.2, BED_DARK, 0.78, 0.015);
  mkRing(7.7, 8.9, WATER_TEAL, 0.4, 0.018);
  mkRing(8.05, 8.55, WATER_GLOW, 0.5, 0.021);

  // Bridge curbs — low stone rails where the paved routes cross the canal.
  // The routes themselves run continuously over the water (PathRibbon
  // flagstones below); the curbs give each crossing its "built" read.
  const curbMat = createToonMaterial(0x5e7a88);
  const BRIDGES = [
    { cx: 0,    cz: -6.3, dx: 0,     dz: 1 },
    { cx: 0.15, cz: 10.3, dx: 0.08,  dz: 1 },
    { cx: 8.3,  cz: 1.6,  dx: 0.98,  dz: -0.18 },
    { cx: -8.3, cz: 2.4,  dx: -0.97, dz: 0.26 },
  ];
  for (const b of BRIDGES) {
    const dl = Math.hypot(b.dx, b.dz);
    const dx = b.dx / dl, dz = b.dz / dl;
    for (const side of [-1.35, 1.35]) {
      const curb = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.13, 2.9), curbMat);
      curb.position.set(b.cx + (-dz) * side, 0.065, b.cz + dx * side);
      curb.rotation.y = Math.atan2(dx, dz);
      curb.castShadow = true;
      env.group.add(curb);
    }
  }

  // ── The Crystal Heart dais ─────────────────────────────────────────────────
  // Low stepped stone circle; the crystal GLB (ZONE_ASSETS) grows out of its
  // center and the hub light below sells the glow. Collision rides the GLB row.
  const dais = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.95, 0.22, 22), createToonMaterial(DAIS_STONE));
  dais.position.set(PLAZA.x, 0.11, PLAZA.z);
  dais.castShadow = true;
  addOutline(dais, 0.03);
  env.group.add(dais);
  const daisGlow = new THREE.Mesh(
    new THREE.RingGeometry(2.0, 2.35, 30),
    new THREE.MeshBasicMaterial({ color: WATER_GLOW, transparent: true, opacity: 0.3, depthWrite: false })
  );
  daisGlow.rotation.x = -Math.PI / 2;
  daisGlow.position.set(PLAZA.x, 0.025, PLAZA.z);
  env.group.add(daisGlow);

  // ── The drowned pool (west) ────────────────────────────────────────────────
  // Standing water with the half-sunken guardian head (GLB) rising from it.
  const poolBed = new THREE.Mesh(new THREE.CircleGeometry(5.2, 26), new THREE.MeshBasicMaterial({ color: 0x0e2028, transparent: true, opacity: 0.8, depthWrite: false }));
  poolBed.rotation.x = -Math.PI / 2;
  poolBed.position.set(-14, 0.014, 6);
  env.group.add(poolBed);
  const poolWater = new THREE.Mesh(new THREE.CircleGeometry(4.9, 26), new THREE.MeshBasicMaterial({ color: WATER_TEAL, transparent: true, opacity: 0.38, depthWrite: false }));
  poolWater.rotation.x = -Math.PI / 2;
  poolWater.position.set(-14, 0.018, 6);
  env.group.add(poolWater);
  const poolRim = new THREE.Mesh(new THREE.RingGeometry(4.3, 4.8, 26), new THREE.MeshBasicMaterial({ color: WATER_GLOW, transparent: true, opacity: 0.28, depthWrite: false }));
  poolRim.rotation.x = -Math.PI / 2;
  poolRim.position.set(-14, 0.021, 6);
  env.group.add(poolRim);

  // ── The wreck shallow (north-east) ─────────────────────────────────────────
  // Warm sand under the broken hull — the one warm-toned pocket in the zone.
  const sand = new THREE.Mesh(new THREE.CircleGeometry(4.6, 24), new THREE.MeshBasicMaterial({ color: SAND_WARM, transparent: true, opacity: 0.9, depthWrite: false }));
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(12, 0.014, -11);
  env.group.add(sand);
  const sandEdge = new THREE.Mesh(new THREE.RingGeometry(4.2, 4.6, 24), new THREE.MeshBasicMaterial({ color: WATER_GLOW, transparent: true, opacity: 0.18, depthWrite: false }));
  sandEdge.rotation.x = -Math.PI / 2;
  sandEdge.position.set(12, 0.017, -11);
  env.group.add(sandEdge);

  // Scattered still puddles — the sea never quite left
  for (let i = 0; i < 7; i++) {
    const a = rng() * Math.PI * 2;
    const r = 11 + rng() * 9;
    const px = Math.cos(a) * r;
    const pz = Math.sin(a) * r;
    if (Math.hypot(px + 14, pz - 6) < 6 || Math.hypot(px - 12, pz + 11) < 5.5) continue;
    const puddle = new THREE.Mesh(
      new THREE.CircleGeometry(0.6 + rng() * 0.9, 10),
      new THREE.MeshBasicMaterial({ color: WATER_TEAL, transparent: true, opacity: 0.3, depthWrite: false })
    );
    puddle.rotation.x = -Math.PI / 2;
    puddle.rotation.z = rng() * Math.PI;
    puddle.position.set(px, 0.014, pz);
    env.group.add(puddle);
  }

  // ── Paved processional routes ──────────────────────────────────────────────
  // Gate → plaza, plaza → temple (SW), plaza → wreck (NE), plaza → south path.
  // PathRibbon flagstones over a bedding strip; each route runs continuously
  // from the plaza rim across the canal (the curbs above mark the crossings).
  const PAVED = { width: 2.3, color: 0x3e5a68, groundColor: 0x16303c, stoneColor: 0x54707e };
  const ROUTES = [
    [[0, -12.8], [0, -10.6], [0, -8.4], [0, -6.2], [0, -4.3]],
    [[-6.2, 2], [-8.8, 2.7], [-10.4, 5.2], [-11.3, 8], [-11.8, 11], [-12.2, 13.8]],
    [[6.2, 2], [8.9, 1.5], [10.1, -1.3], [10.9, -4.3], [11.5, -7], [12, -9.6]],
    // South path — now runs the whole way out through the mouth to the end chamber
    [[0, 8.5], [0.2, 11], [0.5, 13.4], [0.9, 15.9], [1.2, 17.8], [1, 20.4],
     [0.5, 23], [0.2, 25.8], [0, 28.6], [0, 30.6]],
  ];
  ROUTES.forEach((route, i) => addPathRibbon(env, route, { ...PAVED, seed: 9421 + i * 131 }));

  // ── Lights ─────────────────────────────────────────────────────────────────
  // The ambience preset is a dark drowned teal; these carry the legibility.
  // Cyan glyph-light at the landmarks, one warm pocket at the wreck sand.
  for (const [lx, ly, lz, col, intensity, dist] of [
    [0, 3.4, 2, 0x66e8e0, 2.8, 22],       // plaza + Crystal Heart hub
    [0, 3.0, -13, 0x7fe8ff, 1.8, 12],     // gate apron
    [-14, 2.6, 6, 0x5fd8e8, 2.0, 15],     // drowned pool
    [12, 2.6, -11, 0xe8d0a0, 1.6, 12],    // wreck sand — warm pocket
    [-12, 3.0, 14, 0x66e8e0, 1.8, 13],    // temple quarter
    [13, 3.0, -6, 0x7fe8ff, 1.5, 11],     // east guardian head
    [0, 2.8, 13, 0x66e8e0, 1.4, 10],      // south archway
    [0, 2.6, 23, 0x7fe8ff, 1.6, 11],      // the mouth
    [0, 2.6, 32.5, 0x5fd8e8, 2.0, 13],    // end chamber pool
  ]) {
    const light = new THREE.PointLight(col, intensity, dist, 1);
    light.position.set(lx, ly, lz);
    env.group.add(light);
  }

  // Drifting motes — pale bubbles and glyph sparks
  const bubbleMat = new THREE.MeshBasicMaterial({ color: 0xbfeef2, transparent: true, opacity: 0.5, depthWrite: false });
  const sparkMat = new THREE.MeshBasicMaterial({ color: GLOW_CYAN });
  for (let i = 0; i < 16; i++) {
    const a = rng() * Math.PI * 2;
    const r = 4 + rng() * 14;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (rng() < 0.45) {
      const spark = new THREE.Mesh(new THREE.OctahedronGeometry(0.05 + rng() * 0.05, 0), sparkMat);
      spark.position.set(x, 0.06, z);
      spark.rotation.set(rng(), rng(), rng());
      env.group.add(spark);
    } else {
      // Short bubble column — three tiny spheres rising
      for (let b = 0; b < 3; b++) {
        const bub = new THREE.Mesh(new THREE.SphereGeometry(0.05 + rng() * 0.04, 6, 5), bubbleMat);
        bub.position.set(x + (rng() - 0.5) * 0.3, 0.3 + b * (0.5 + rng() * 0.3), z + (rng() - 0.5) * 0.3);
        env.group.add(bub);
      }
    }
  }

  // ── Connections ───────────────────────────────────────────────────────────
  env._addPortal(0, -16, 'mine', 0, 'Mine Hub');
  // The back door was never a dead end: an Ancient World Gate stands
  // half-drowned in the end chamber's pool, opening on the Labyrinth. The
  // labyrinth-side return gate carries the spawn override that lands the
  // traveller back here, so the pair reads as one doorway.
  env._addPortal(0, 30.5, 'labyrinth', 0, 'The Labyrinth');
}
