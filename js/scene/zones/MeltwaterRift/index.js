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

const ICE_WALL = 0x2e4763;     // cold half — same crust as the Glacial Hollow above
const BASALT_WALL = 0x453733;  // warm half — geothermal rock
const BASALT_COL = 0x50413c;
const GLOW_CYAN = 0x7fe8ff;
const GLOW_AMBER = 0xffb054;
const MELT_GLOW = 0x6fe0d8;

/**
 * Meltwater Rift — beneath the Glacial Hollow's deep end, where the glacier
 * rests on warm rock. Entered by walking through the gap in the Hollow's wall
 * ring past the Rimefather (see GlacialHollow's _addCaveEntrance) — no world
 * gate on the way in, only the return gate north.
 *
 * The zone is a two-temperature cavern: ice walls and cyan light on the entry
 * (north, -z) half, basalt and ember light on the deep (+z) half, with a
 * glowing meltwater channel running from the ice grotto down to the hot-spring
 * terraces. A worn stone path forks mid-cavern toward the two sealed
 * thresholds where future zones will attach:
 *
 *   - The Sunken Door (west)  — replace its _addSealedGate call with
 *     _addCaveEntrance/_addPortal at (-15, 6.5) when that zone ships
 *   - The Ember Chasm (east)  — OPEN since 2026-07-30: the winch at (13, 10.5)
 *     descends into the Cinderforge (walk-in entrance at the apron)
 *
 * Wall ring uses reveal materials (Mine/Hollow trick): fragments open around
 * the player so the fixed 46-degree ortho camera can see into the cavern.
 * Outline shells MUST use createRevealOutlineMaterial.
 *
 * Ice crystals/rubble near the entry are dressed from ZONE_ASSETS.meltwaterRift;
 * everything else here is procedural (columns, vents, terraces, channel, gates).
 *
 * ── Connections ───────────────────────────────────────────────────────────────
 *   glacialHollow  →  (0, -16)  always unlocked (return; lands at the rift
 *                     mouth inside the Hollow via spawnOverride)
 *   cinderforge    →  (10.9, 8.8)  always unlocked (the Ember Chasm winch)
 *   sealed         →  The Sunken Door (west)
 */
export function build(env) {
  const rng = seededRandom(72447);

  env._addGround(0x46403d); // warm dark rift stone

  // Cold overlay — the entry half still wears the glacier's floor. A broad
  // translucent ice sheet plus a ragged melt line where the two halves meet.
  // Floor-decal rule: translucent decal families here overlap at exactly
  // coplanar y (this sheet + its melt-line patches, the path circles, the
  // channel's bed/core segments), so with depth writes on, whether the later
  // draw passes rides on sub-ULP rasterization noise that shifts with every
  // subpixel camera move — overlap regions strobe between single- and
  // double-blend while walking. depthWrite: false makes every layer blend
  // deterministically (depth TEST stays on, so props still occlude decals).
  const iceSheetMat = new THREE.MeshBasicMaterial({ color: 0x9fd4ec, transparent: true, opacity: 0.2, depthWrite: false });
  const iceSheet = new THREE.Mesh(new THREE.PlaneGeometry(42, 16), iceSheetMat);
  iceSheet.rotation.x = -Math.PI / 2;
  iceSheet.position.set(0, 0.012, -13);
  env.group.add(iceSheet);
  for (let i = 0; i < 7; i++) {
    const patch = new THREE.Mesh(new THREE.CircleGeometry(1.2 + rng() * 1.6, 10), iceSheetMat);
    patch.rotation.x = -Math.PI / 2;
    patch.rotation.z = rng() * Math.PI;
    patch.position.set(-18 + i * 6 + (rng() - 0.5) * 3, 0.012, -4.6 + (rng() - 0.5) * 2.4);
    env.group.add(patch);
  }

  // ── Cave wall ring ─────────────────────────────────────────────────────────
  // Same low tapered silhouette as the Hollow's ring (tall slabs read as
  // monoliths at the ortho camera). Ice crust on the -z half under the
  // glacier, basalt on the +z half over the warm rock.
  const iceMat = createRevealToonMaterial(ICE_WALL, { revealR: 2.0 });
  const basaltMat = createRevealToonMaterial(BASALT_WALL, { revealR: 2.0 });
  const wallOutlineMat = createRevealOutlineMaterial({ revealR: 2.0 });
  env._revealMaterials.push(iceMat, basaltMat, wallOutlineMat);

  const RING_R = 21;
  const SEGMENTS = 54;
  for (let i = 0; i < SEGMENTS; i++) {
    const a = (i / SEGMENTS) * Math.PI * 2;
    const r = RING_R + (rng() - 0.5) * 1.8;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const h = 3.0 + rng() * 2.2;
    const w = 2.6 + rng() * 1.8;
    // Blend band near z≈0: alternate crusts so the seam looks geological
    const mat = z < -1.5 ? iceMat : z > 1.5 ? basaltMat : (i % 2 ? iceMat : basaltMat);

    const geo = new THREE.CylinderGeometry(w * 0.42, w * 0.72, h, 6);
    const block = new THREE.Mesh(geo, mat);
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

  // ── Meltwater channel ──────────────────────────────────────────────────────
  // Emerges glowing from an ice grotto in the north-east crust and runs down
  // to the hot-spring terraces. Flat and walkable — it is a stream, not a wall.
  const CHANNEL = [
    [11, -14], [9, -10], [7, -6], [4.5, -2], [1.5, 2], [-2, 5], [-5, 7.5], [-7.5, 10],
  ];
  const bedMat = new THREE.MeshBasicMaterial({ color: 0x1a2430, transparent: true, opacity: 0.6, depthWrite: false });
  const coreMat = new THREE.MeshBasicMaterial({ color: MELT_GLOW, transparent: true, opacity: 0.7, depthWrite: false });
  for (let i = 0; i < CHANNEL.length - 1; i++) {
    const [x1, z1] = CHANNEL[i];
    const [x2, z2] = CHANNEL[i + 1];
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.hypot(dx, dz) + 0.7; // overlap joints so the ribbon is continuous
    const bed = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.95), bedMat);
    bed.rotation.x = -Math.PI / 2;
    bed.rotation.z = -Math.atan2(dz, dx);
    bed.position.set((x1 + x2) / 2, 0.016, (z1 + z2) / 2);
    env.group.add(bed);
    const core = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.34), coreMat);
    core.rotation.x = -Math.PI / 2;
    core.rotation.z = bed.rotation.z;
    core.position.set((x1 + x2) / 2, 0.02, (z1 + z2) / 2);
    env.group.add(core);
  }

  // Ice grotto — the channel's source, a leaning pair of ice slabs the water
  // slides out of. Small collision so the player walks around, not through.
  const grottoMat = createToonMaterial(0x8fc7e8);
  grottoMat.transparent = true;
  grottoMat.opacity = 0.88;
  for (const [ox, tilt] of [[-0.85, 0.32], [0.85, -0.32]]) {
    const slab = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.62, 2.6, 7), grottoMat);
    slab.position.set(11 + ox, 1.15, -14.6);
    slab.rotation.z = tilt;
    env.group.add(slab);
    addOutline(slab, 0.03);
  }
  const grottoGlow = new THREE.Mesh(new THREE.CircleGeometry(0.75, 12), coreMat);
  grottoGlow.rotation.x = -Math.PI / 2;
  grottoGlow.position.set(11, 0.022, -14.1);
  env.group.add(grottoGlow);
  env._collisionCircles.push({ x: 11, z: -14.8, r: 1.0 });

  // ── Hot-spring terraces ────────────────────────────────────────────────────
  // Stacked steaming basins in the warm south-west — where the meltwater ends
  // up. Raised, so one collision circle keeps the player off the rims.
  const terraceMat = createToonMaterial(0x57453e);
  const springMat = new THREE.MeshBasicMaterial({ color: 0xf0a95a, transparent: true, opacity: 0.5 });
  const springHotMat = new THREE.MeshBasicMaterial({ color: 0xffc98a, transparent: true, opacity: 0.65 });
  const TERRACE = [
    { r: 4.2, h: 0.2, water: 3.7, mat: springMat },
    { r: 2.9, h: 0.5, water: 2.4, mat: springMat },
    { r: 1.8, h: 0.8, water: 1.35, mat: springHotMat },
  ];
  for (const t of TERRACE) {
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(t.r, t.r * 1.08, t.h, 22), terraceMat);
    basin.position.set(-7.5, t.h / 2, 10);
    env.group.add(basin);
    addOutline(basin, 0.02);
    const water = new THREE.Mesh(new THREE.CircleGeometry(t.water, 22), t.mat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(-7.5, t.h + 0.012, 10);
    env.group.add(water);
  }
  env._collisionCircles.push({ x: -7.5, z: 10, r: 4.3 });

  // ── Basalt column clusters ─────────────────────────────────────────────────
  // Hexagonal jointing — the rift's signature geology. Staggered heights,
  // slight lean, one collision circle per cluster.
  const colMat = createToonMaterial(BASALT_COL);
  const CLUSTERS = [
    [15.5, 2.5], [17, 7], [-13.5, -4], [-16, 1], [6, 14.5], [-2, 16.5], [12, -5],
  ];
  for (const [cx, cz] of CLUSTERS) {
    const n = 3 + Math.floor(rng() * 3);
    for (let i = 0; i < n; i++) {
      const pr = 0.42 + rng() * 0.4;
      const ph = 1.1 + rng() * 2.3;
      const ox = (rng() - 0.5) * 1.6;
      const oz = (rng() - 0.5) * 1.6;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(pr * 0.92, pr, ph, 6), colMat);
      col.position.set(cx + ox, ph / 2, cz + oz);
      col.rotation.set((rng() - 0.5) * 0.1, rng() * Math.PI, (rng() - 0.5) * 0.1);
      col.castShadow = true;
      env.group.add(col);
      addOutline(col, 0.03);
    }
    env._collisionCircles.push({ x: cx, z: cz, r: 1.3 });
  }

  // ── Steam vents ────────────────────────────────────────────────────────────
  // Cracked cones breathing translucent wisps. Two carry warm point lights;
  // the rest glow at the mouth only (light budget).
  const ventRockMat = createToonMaterial(0x3e332f);
  const ventGlowMat = new THREE.MeshBasicMaterial({ color: 0xff8a3d, transparent: true, opacity: 0.85 });
  const wispMat = new THREE.MeshBasicMaterial({ color: 0xfff0e0, transparent: true, opacity: 0.14, depthWrite: false });
  const VENTS = [
    { x: 5, z: 9, light: true }, { x: -11, z: 13, light: true },
    { x: 14.5, z: 5.5, light: false }, { x: 9, z: -8, light: false },
  ];
  for (const v of VENTS) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.55, 9), ventRockMat);
    cone.position.set(v.x, 0.26, v.z);
    env.group.add(cone);
    addOutline(cone, 0.04);
    const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.2, 10), ventGlowMat);
    mouth.rotation.x = -Math.PI / 2;
    mouth.position.set(v.x, 0.55, v.z);
    env.group.add(mouth);
    const wisp1 = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.3, 8), wispMat);
    wisp1.position.set(v.x, 1.15, v.z);
    env.group.add(wisp1);
    const wisp2 = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.0, 8), wispMat);
    wisp2.position.set(v.x + 0.12, 1.95, v.z);
    env.group.add(wisp2);
    if (v.light) {
      const l = new THREE.PointLight(GLOW_AMBER, 1.1, 7, 1);
      l.position.set(v.x, 1.4, v.z);
      env.group.add(l);
    }
    env._collisionCircles.push({ x: v.x, z: v.z, r: 0.5 });
  }

  // Embermoss glow patches — warm counterpart of the Hollow's floor glints,
  // clustered where the heat is. Decor only; the gatherable nodes are separate.
  const mossMat = new THREE.MeshBasicMaterial({ color: 0xd96b2a, transparent: true, opacity: 0.45, depthWrite: false });
  for (let i = 0; i < 9; i++) {
    const a = rng() * Math.PI;          // +z half only
    const r = 4 + rng() * 12;
    const patch = new THREE.Mesh(new THREE.CircleGeometry(0.4 + rng() * 0.5, 9), mossMat);
    patch.rotation.x = -Math.PI / 2;
    patch.position.set(Math.cos(a) * r, 0.014, Math.abs(Math.sin(a)) * r + 1);
    env.group.add(patch);
  }

  // ── The Sunken Door (west) — sealed threshold, future zone ────────────────
  {
    const g = new THREE.Group();
    g.position.set(-15, 0, 6.5);
    // Face south-east — split between the approaching player (east apron) and
    // the +z camera. Facing the cavern centre puts the glowing seam edge-on to
    // the camera and the whole door reads as more wall.
    g.rotation.y = 0.71;
    env.group.add(g);

    const doorMat = createToonMaterial(0x4a4f61);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(2.6, 3.4, 0.5), doorMat);
    slab.position.y = 1.7;
    g.add(slab);
    addOutline(slab, 0.03);
    const crown = new THREE.Mesh(
      new THREE.CylinderGeometry(1.3, 1.3, 0.5, 18, 1, false, 0, Math.PI),
      doorMat
    );
    crown.rotation.z = Math.PI / 2;
    crown.rotation.y = Math.PI / 2;
    crown.position.y = 3.4;
    g.add(crown);

    const pillarMat = createToonMaterial(BASALT_COL);
    for (const px of [-1.75, 1.75]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.48, 3.6, 6), pillarMat);
      p.position.set(px, 1.8, 0.1);
      g.add(p);
      addOutline(p, 0.03);
    }

    // Dormant glowing seam — a thin split and an arc, barely alive
    const seamMat = new THREE.MeshBasicMaterial({ color: 0x2fd8c8, transparent: true, opacity: 0.95 });
    const seam = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 2.5), seamMat);
    seam.position.set(0, 1.35, 0.27);
    g.add(seam);
    const arc = new THREE.Mesh(new THREE.TorusGeometry(1.02, 0.06, 6, 24, Math.PI), seamMat);
    arc.position.set(0, 2.6, 0.27);
    g.add(arc);

    // Spill of dormant light at the foot — marks the door from every angle
    const doorSpill = new THREE.Mesh(new THREE.CircleGeometry(1.25, 16),
      new THREE.MeshBasicMaterial({ color: 0x2fd8c8, transparent: true, opacity: 0.2 }));
    doorSpill.rotation.x = -Math.PI / 2;
    doorSpill.position.set(0, 0.028, 1.6);
    g.add(doorSpill);

    // Frost creep at the foot — the ice is trying to reclaim it
    const frostMat = new THREE.MeshBasicMaterial({ color: 0xdff0fa, transparent: true, opacity: 0.35 });
    for (const [fx, fy, fr] of [[-0.8, 0.35, 0.4], [0.6, 0.2, 0.3], [0.1, 0.55, 0.25]]) {
      const f = new THREE.Mesh(new THREE.CircleGeometry(fr, 8), frostMat);
      f.position.set(fx, fy, 0.28);
      g.add(f);
    }

    const doorLight = new THREE.PointLight(0x2fd8c8, 1.8, 9, 1);
    doorLight.position.set(0, 2.6, 1);
    g.add(doorLight);

    env._collisionCircles.push({ x: -15, z: 6.5, r: 2.0 });
    env._addSealedGate(-12.6, 5.5, 'The Sunken Door',
      'Sealed: The Sunken Door — the seam still glows, but nothing you carry can wake it');
  }

  // ── The Ember Chasm (east) — sealed threshold, future zone ────────────────
  {
    // The pit itself — layered discs, black over ember
    const pit = new THREE.Mesh(new THREE.CircleGeometry(1.9, 26),
      new THREE.MeshBasicMaterial({ color: 0x050505 }));
    pit.rotation.x = -Math.PI / 2;
    pit.position.set(13, 0.02, 10.5);
    pit.scale.x = 1.25;
    env.group.add(pit);
    const emberDeep = new THREE.Mesh(new THREE.CircleGeometry(1.35, 22),
      new THREE.MeshBasicMaterial({ color: 0x3a1608 }));
    emberDeep.rotation.x = -Math.PI / 2;
    emberDeep.position.set(13, 0.026, 10.5);
    emberDeep.scale.x = 1.25;
    env.group.add(emberDeep);
    const emberRim = new THREE.Mesh(new THREE.RingGeometry(1.55, 1.9, 26),
      new THREE.MeshBasicMaterial({ color: 0xff8a3d, transparent: true, opacity: 0.75 }));
    emberRim.rotation.x = -Math.PI / 2;
    emberRim.position.set(13, 0.032, 10.5);
    emberRim.scale.x = 1.25;
    env.group.add(emberRim);

    // Heat shimmer over the mouth + the warm updraft light
    const shimmer = new THREE.Mesh(new THREE.ConeGeometry(1.2, 2.4, 12),
      new THREE.MeshBasicMaterial({ color: 0xffc9a0, transparent: true, opacity: 0.07, depthWrite: false }));
    shimmer.position.set(13, 1.2, 10.5);
    env.group.add(shimmer);
    const chasmLight = new THREE.PointLight(GLOW_AMBER, 2.2, 12, 1);
    chasmLight.position.set(13, 1.2, 10.5);
    env.group.add(chasmLight);

    // Rope posts ringing the drop
    const postMat = createToonMaterial(0x6b4a2e);
    const ropeMat = createToonMaterial(0x8a6a45);
    const posts = [];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.5;
      const px = 13 + Math.cos(a) * 2.6 * 1.15;
      const pz = 10.5 + Math.sin(a) * 2.6;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.8, 7), postMat);
      post.position.set(px, 0.4, pz);
      post.rotation.set((rng() - 0.5) * 0.2, 0, (rng() - 0.5) * 0.2);
      env.group.add(post);
      posts.push([px, pz]);
    }
    for (let i = 0; i < posts.length - 1; i++) {
      const [x1, z1] = posts[i];
      const [x2, z2] = posts[i + 1];
      const len = Math.hypot(x2 - x1, z2 - z1);
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, len, 5), ropeMat);
      rope.position.set((x1 + x2) / 2, 0.68, (z1 + z2) / 2);
      rope.rotation.z = Math.PI / 2;
      rope.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
      env.group.add(rope);
    }

    // Winch frame — rigged for a descent nobody has made yet
    const wg = new THREE.Group();
    wg.position.set(11.1, 0, 12.6);
    wg.rotation.y = Math.atan2(13 - 11.1, 10.5 - 12.6); // spool faces the pit
    env.group.add(wg);
    for (const px of [-0.55, 0.55]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 1.9, 7), postMat);
      leg.position.set(px, 0.95, 0);
      wg.add(leg);
      addOutline(leg, 0.05);
    }
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.5, 7), postMat);
    beam.rotation.z = Math.PI / 2;
    beam.position.y = 1.85;
    wg.add(beam);
    const spool = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.5, 10), ropeMat);
    spool.rotation.z = Math.PI / 2;
    spool.position.y = 1.5;
    wg.add(spool);
    addOutline(spool, 0.05);
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.09, 7, 14), ropeMat);
    coil.rotation.x = -Math.PI / 2;
    coil.position.set(0.9, 0.09, 0.5);
    wg.add(coil);

    env._collisionCircles.push({ x: 13, z: 10.5, r: 2.1 });
    env._collisionCircles.push({ x: 11.1, z: 12.6, r: 0.5 });
    // The descent is rigged at last — the winch lowers into the Cinderforge.
    // Walk-in record only (the pit + winch above supply all the visuals);
    // the Cinderforge's return gate lands back on this apron via spawnOverride.
    env._addCaveEntrance(10.9, 8.8, 'cinderforge', 'The Ember Chasm');
  }

  // ── Worn stone path ────────────────────────────────────────────────────────
  // From the return gate through the hub, forking to the two sealed
  // thresholds — the route grammar that says "this way leads somewhere".
  // PathRibbon worn mode (the circle-patch trails are retired game-wide).
  const WORN = { width: 2.4, color: 0x746358, groundColor: 0x46403d };
  const TRAILS = [
    // North entry corridor → hub
    [[0, -12.2], [0, -10], [-0.3, -7.8], [0.2, -5.6], [0, -3.4], [0, -1.2]],
    // Hub → the Sunken Door apron
    [[-1.5, 0.2], [-3.5, 1.4], [-5.8, 2.6], [-8, 3.7], [-10.3, 4.7], [-12.4, 5.4]],
    // Hub → the Ember Chasm apron
    [[1.6, 0.4], [3.8, 1.6], [6, 3], [7.8, 4.6], [9.3, 6.6], [10.4, 8.4]],
  ];
  TRAILS.forEach((trail, i) => addPathRibbon(env, trail, { ...WORN, seed: 5211 + i * 97 }));

  // ── Lights ─────────────────────────────────────────────────────────────────
  // Cold cyan at the entry shading to ember amber in the deep half — the
  // two-temperature read is the zone's identity. The ambience preset is dark;
  // these are what make the rift legible.
  for (const [lx, lz, col, intensity, dist] of [
    [0, -12, GLOW_CYAN, 2.2, 16],
    [11, -14, GLOW_CYAN, 1.8, 12],       // grotto
    [0, 0, 0xd8ecff, 2.6, 24],           // hub
    [-7.5, 10, 0x8fe8d8, 2.2, 16],       // hot springs (teal-over-amber water)
  ]) {
    const light = new THREE.PointLight(col, intensity, dist, 1);
    light.position.set(lx, 3.2, lz);
    env.group.add(light);
  }

  // Floor glints — cyan motes on the cold half, ember motes on the warm half
  const coldMote = new THREE.MeshBasicMaterial({ color: GLOW_CYAN });
  const warmMote = new THREE.MeshBasicMaterial({ color: 0xffa04d });
  for (let i = 0; i < 14; i++) {
    const a = rng() * Math.PI * 2;
    const r = 4 + rng() * 12;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const mote = new THREE.Mesh(new THREE.OctahedronGeometry(0.06 + rng() * 0.05, 0), z < 0 ? coldMote : warmMote);
    mote.position.set(x, 0.06, z);
    mote.rotation.set(rng(), rng(), rng());
    env.group.add(mote);
  }

  // ── Connections ───────────────────────────────────────────────────────────
  env._addPortal(0, -16, 'glacialHollow', 0, 'Glacial Hollow');
  // Land back at the rift mouth inside the Hollow, not the Hollow's default
  // spawn by the tundra gate (home-door "doorstep" convention).
  env._zonePortals[env._zonePortals.length - 1].spawnOverride = [1, 16.5];
}
