import * as THREE from 'three';
import {
  createToonMaterial, addOutline, createRevealToonMaterial, createRevealOutlineMaterial,
} from '../../ToonMaterials.js';

function seededRandom(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ICE_WALL = 0x2e4763;
const ICE_PALE = 0x8fc7e8;
const GLOW_CYAN = 0x7fe8ff;

/**
 * Glacial Hollow — the ice cave under the Frozen Tundra. Entered by walking
 * into the cave mouth on the tundra's north-west ridge (see FrozenTundra's
 * _addCaveEntrance), not through a world gate, so there is no Portal.glb here
 * on the way in — only the return gate south.
 *
 * The enclosing wall ring uses reveal materials (same trick as the Mine): tall
 * cave walls would otherwise block the fixed 46-degree ortho camera, so their
 * fragments open in a circle around the player. Outline shells MUST use
 * createRevealOutlineMaterial or the hole exposes solid black shell interiors.
 *
 * Dressing (stalagmites, crystals, frost shrooms, mammoth skull, bone arch)
 * is placed from ZONE_ASSETS.glacialHollow; this builder lays the floor, the
 * wall ring, the frozen pool, the ice pillars and the lights.
 *
 * ── Connections ───────────────────────────────────────────────────────────────
 *   frozenTundra   →  (0, -16)  always unlocked (return)
 *   meltwaterRift  →  (0, 19)   walk-in rift passage through the wall-ring gap
 *                     at +z, past the Rimefather; framed by the crystal/rubble
 *                     props in ZONE_ASSETS. Warm light spills up from below.
 */
export function build(env) {
  const rng = seededRandom(70424);

  env._addGround(0x3a5878); // deep blue cave ice

  // ── Cave wall ring ─────────────────────────────────────────────────────────
  // A crust of ice-rock around the perimeter. Reveal materials are shared
  // across the ring (one material, many meshes) so the per-frame player-position
  // update in main.js stays cheap.
  //
  // Kept deliberately LOW and tapered: at the fixed 46-degree ortho camera,
  // tall flat-shaded boxes with heavy outline shells read as a skyline of dark
  // monoliths rather than as cave wall. Cones/tapered blocks at ~3-5 units tall
  // read as rock; anything much taller fills a third of the frame.
  const wallMat = createRevealToonMaterial(ICE_WALL, { revealR: 2.0 });
  const wallOutlineMat = createRevealOutlineMaterial({ revealR: 2.0 });
  env._revealMaterials.push(wallMat, wallOutlineMat);

  const RING_R = 20.5;
  const SEGMENTS = 52;
  for (let i = 0; i < SEGMENTS; i++) {
    const a = (i / SEGMENTS) * Math.PI * 2;
    // Leave the south arc open for the return gate corridor
    if (Math.cos(a - Math.PI / 2) > 0.955) continue;

    const r = RING_R + (rng() - 0.5) * 1.8;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const h = 3.0 + rng() * 2.2;
    const w = 2.6 + rng() * 1.8;

    // Tapered chunk (wide foot, narrower crown) — a rock silhouette, not a slab
    const geo = new THREE.CylinderGeometry(w * 0.42, w * 0.72, h, 6);
    const block = new THREE.Mesh(geo, wallMat);
    block.position.set(x, h / 2 - 0.3, z);
    block.rotation.set((rng() - 0.5) * 0.16, a + rng() * 1.2, (rng() - 0.5) * 0.16);
    block.castShadow = true;
    env.group.add(block);

    const shell = new THREE.Mesh(geo, wallOutlineMat);
    shell.position.copy(block.position);
    shell.rotation.copy(block.rotation);
    shell.scale.setScalar(1.02);
    env.group.add(shell);

    env._collisionCircles.push({ x, z, r: w * 0.6 });
  }

  // ── Frozen pool ────────────────────────────────────────────────────────────
  // Off-centre so the middle of the cavern stays walkable. Kept dim on
  // purpose: MeshBasicMaterial is unlit, so a bright ice blue that reads
  // correctly on the sunlit tundra blows out to a flat white disc down here.
  const poolMat = new THREE.MeshBasicMaterial({ color: 0x49809f, transparent: true, opacity: 0.5 });
  const pool = new THREE.Mesh(new THREE.CircleGeometry(4.6, 30), poolMat);
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(-8.5, 0.02, 7.5);
  env.group.add(pool);

  const poolRim = new THREE.Mesh(
    new THREE.RingGeometry(4.4, 4.75, 34),
    new THREE.MeshBasicMaterial({ color: 0x7fb4cf, transparent: true, opacity: 0.55 })
  );
  poolRim.rotation.x = -Math.PI / 2;
  poolRim.position.set(-8.5, 0.03, 7.5);
  env.group.add(poolRim);

  // ── Ice pillars ────────────────────────────────────────────────────────────
  // Floor-to-ceiling columns. These are procedural on purpose: two Rodin rolls
  // of a "tall narrow frozen waterfall" both came back as squat slabs, and a
  // tapered cylinder reads correctly in this art style anyway.
  const pillarMat = createToonMaterial(ICE_PALE);
  pillarMat.transparent = true;
  pillarMat.opacity = 0.88;
  for (const [px, pz, ph, pr] of [
    [11, -6, 7.5, 0.85], [-12.5, -8.5, 6.4, 0.7], [13.5, 9, 8.2, 0.95],
    [-4.5, 13.5, 6.8, 0.75], [5.5, 16, 7.0, 0.8],
  ]) {
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(pr * 0.62, pr, ph, 9), pillarMat);
    pillar.position.set(px, ph / 2, pz);
    pillar.rotation.y = rng() * Math.PI;
    pillar.castShadow = true;
    env.group.add(pillar);
    addOutline(pillar, 0.02);

    // Flared foot so the column does not read as a floating tube
    const foot = new THREE.Mesh(new THREE.ConeGeometry(pr * 1.8, ph * 0.16, 9), pillarMat);
    foot.position.set(px, ph * 0.08, pz);
    env.group.add(foot);

    env._collisionCircles.push({ x: px, z: pz, r: pr * 1.5 });
  }

  // ── Lights ─────────────────────────────────────────────────────────────────
  // The glacialHollow ambience preset is dark (see SceneManager); these glowing
  // pools of light are what actually make the cavern readable.
  for (const [lx, lz, intensity, dist] of [
    [0, 0, 3.0, 26], [-8.5, 7.5, 2.4, 18], [11, -6, 2.0, 16],
    [-12, -9, 1.8, 15], [12, 10, 2.0, 16], [0, -14, 2.2, 14],
  ]) {
    const light = new THREE.PointLight(GLOW_CYAN, intensity, dist, 1);
    light.position.set(lx, 3.2, lz);
    env.group.add(light);
  }

  // Ice glints scattered on the floor. These sit ON the ground on purpose:
  // unlit basic-material shards floating at chest height read as flat 2D
  // sparkle sprites at this camera, not as glowing ice.
  const moteMat = new THREE.MeshBasicMaterial({ color: GLOW_CYAN });
  for (let i = 0; i < 14; i++) {
    const a = rng() * Math.PI * 2;
    const r = 5 + rng() * 12;
    const mote = new THREE.Mesh(new THREE.OctahedronGeometry(0.07 + rng() * 0.05, 0), moteMat);
    mote.position.set(Math.cos(a) * r, 0.06, Math.sin(a) * r);
    mote.rotation.set(rng(), rng(), rng());
    env.group.add(mote);
  }

  // ── Connections ───────────────────────────────────────────────────────────
  env._addPortal(0, -16, 'frozenTundra', 0, 'Frozen Tundra');
  env._addReturnBeacon(0, -16);

  // The Meltwater Rift — down through the wall-ring gap the Rimefather
  // guards. No mouth GLB: the gap IS the opening; the crystal/rubble frame in
  // ZONE_ASSETS narrows it onto the trigger and seals the back. The warm glow
  // is the tell that something lives below the ice.
  env._addCaveEntrance(0, 19, 'meltwaterRift', 'Meltwater Rift');
  const spillMat = new THREE.MeshBasicMaterial({ color: 0xffb054, transparent: true, opacity: 0.28 });
  const spill = new THREE.Mesh(new THREE.CircleGeometry(1.9, 18), spillMat);
  spill.rotation.x = -Math.PI / 2;
  spill.position.set(0, 0.025, 19.6);
  env.group.add(spill);
  const spillCore = new THREE.Mesh(new THREE.CircleGeometry(0.85, 14),
    new THREE.MeshBasicMaterial({ color: 0xffd394, transparent: true, opacity: 0.4 }));
  spillCore.rotation.x = -Math.PI / 2;
  spillCore.position.set(0, 0.03, 20.1);
  env.group.add(spillCore);
  const spillLight = new THREE.PointLight(0xffb054, 1.7, 11, 1);
  spillLight.position.set(0, 1.6, 20);
  env.group.add(spillLight);
}
