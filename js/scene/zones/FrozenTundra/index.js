import * as THREE from 'three';
import { createToonMaterial } from '../../ToonMaterials.js';
import { addPathRibbon } from '../../PathRibbon.js';
import { addAurora } from './aurora.js';
import {
  SURFACES, GLACIER_COLLIDERS, ICE_ARCH, ICE_ARCH_LEGS, OVERLOOK_MOUTH, GALLERY_MOUTH,
  RIFT_MAIN, RIFT_WEST, Y_SHELF_1, Y_SHELF_2, Y_SHELF_3,
  Z_SHELF_1, Z_SHELF_2, Z_SHELF_3,
  SHELF_1, SHELF_2, SHELF_3, RAMPS_1, RAMPS_2, RAMPS_3, RIFT_DESCENT,
} from './glacier.js';

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
 * Frozen Tundra zone — a stepped glacier, not an ice desert.
 *
 * The southern half is the original snowfield (lake, shrine, pines, the
 * Glacial Hollow mouth, the Mine Hub portal) and every one of its props keeps
 * its old coordinates. North of z −21.5 the ground CLIMBS: three shelves at
 * y 3.0 / 5.5 / 8.0 joined by straight frontal ramps, cut by two crevasses
 * whose floors are the base ground plane, and crowned by a great ice arch.
 *
 * All of the geometry — surfaces, riser placements, rift flanks, spans, the
 * dune field — comes from `glacier.js`, which also documents why the glacier
 * is raised rather than the crevasses dug, and how elevation is kept legible
 * at the fixed 46° ortho camera without a wrap-around ramp.
 *
 * What this replaced: a flat plane at y 0 with 22 CylinderGeometry drifts.
 * Measured before the change, 55.7% of the frame sat inside a single 8-level
 * luminance band and the whole field crossed in 3.4 s at endgame move speed.
 *
 * (An aurora was tried and cut in the first round — additive sky ribbons read
 * as painted stripes on the snow at this camera. The one here is a curtain
 * standing on the northern horizon instead; see `aurora.js`.)
 *
 * ── Connections ───────────────────────────────────────────────────────────────
 *   mine            →  (0, -18)     always unlocked (return to portal hub)
 *   glacialHollow   →  (-15, 15.9)  walk-in cave mouth, always unlocked
 */
export function build(env) {
  const rng = seededRandom(88171);

  // Ground is vertex-coloured: a cold blue basin warming toward the sunlit
  // shelves in the north. The single flat 0xe2ecf5 plane was the largest
  // contributor to the zone's collapsed value range.
  env._addGround(0xe2ecf5, { colorAt: groundColorAt });

  // ── The glacier ────────────────────────────────────────────────────────────
  // Visual sections are placed from ZoneAssets (GLACIER_PROPS); this registers
  // what the player can actually stand on.
  for (const s of SURFACES) env.addWalkableSurface(s);

  // …and this gives every one of them a TOP. The risers and rift flanks are
  // only the vertical faces; without decks the shelves are invisible and the
  // player appears to walk on the y=0 ground plane far below, which — because
  // that plane is also white — very nearly looks correct until the arch is in
  // frame and nothing casts onto anything.
  addGlacierDecks(env);

  // Ground-level chains that make the glacier SOLID. Without these the shelves
  // block nothing at y 0 — resolveHeight always offers the ground plane, which
  // spans the whole zone — so you could walk due north from the portal through
  // the riser and on under the entire glacier. See glacier.js GLACIER_COLLIDERS.
  for (const c of GLACIER_COLLIDERS) env._collisionCircles.push(c);

  // The arch is walked THROUGH, so it gets a circle per leg rather than one at
  // its centre. Both are height-banded to the plaza so they don't wall off the
  // rift floor 8 units below.
  for (const leg of ICE_ARCH_LEGS) env._collisionCircles.push(leg);

  // Off-screen nav aid — the arch is the thing worth pointing at from anywhere
  // in the zone, and the reason the climb has a destination.
  env._addNavLandmark(ICE_ARCH.x, ICE_ARCH.y + 6, ICE_ARCH.z, 'The Ice Arch');

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
    const crack = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 2 + rng() * 1.5), crackMat);
    crack.rotation.x = -Math.PI / 2;
    crack.rotation.z = rng() * Math.PI;
    crack.position.set(8 + (rng() - 0.5) * 5, 0.025, 8 + (rng() - 0.5) * 5);
    env.group.add(crack);
  }

  // ── Connections ───────────────────────────────────────────────────────────
  env._addPortal(0, -18, 'mine', 0, 'Mine Hub');

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

  // ── The residents ─────────────────────────────────────────────────────────
  // Tusker — a burly fur-trapper — camps on the open snow south-west of the
  // frozen lake ((8,8) r6), facing it; Snowl, an owl-folk stargazer, keeps
  // the frozen shrine. Both south of the glacier climb, clear of the trodden
  // path (z 18-20), the portal corridor (0,-18) — and ≥3.8 from every
  // resource node: the gather hint outranks the talk prompt, so an NPC
  // parked next to a node can never be spoken to (Tusker shipped 1.6 from
  // the titanium seam at (4,3) before this was caught live).
  env._addNpc('npcTusker', 0.5, 1.5, { rotY: 0.86, r: 0.55,
    name: 'Tusker',
    greeting: "Cold's honest, at least. Warm your hands before you go." });
  env._addNpc('npcSnowl', 3.8, 12.9, { rotY: -0.84, r: 0.4,
    name: 'Snowl',
    greeting: 'The lights in the sky were here long before any of us.' });

  // ── Routes ────────────────────────────────────────────────────────────────
  // PathRibbon worn mode — trodden snow, darker than the field.
  //
  // EVERY ribbon below gets its own y in a fixed stack. PathRibbons are OPAQUE,
  // so two of them lying at the same height with any overlap have no stable
  // depth winner and strobe as the camera moves — the owner-reported flicker
  // "by the portal", and the same defect the Emberglade's ember web had
  // (VerdantMaw/index.js WEB_Y_*). The three approach trails all converge on
  // the portal apron at (0,−14), which is exactly where it showed.
  // Steps are 5e-4: four orders above ortho depth resolution over this
  // frustum, invisible at the 46° pitch.
  const SNOW_TRAIL = { width: 3.0, color: 0xa9c0d8, groundColor: 0xe2ecf5, strength: 1.5 };
  const Y_MAIN = 0.016, Y_SPUR = 0.0205, Y_APPROACH = 0.025;

  // The original east-west trail across the southern flat, from the cave
  // mouth's apron. Unchanged but for its place in the stack.
  addPathRibbon(env, [
    [-15, 17.4], [-11.5, 17.9], [-8, 18.6], [-4.5, 19.0], [-1, 18.8],
    [2.5, 18.2], [6, 18.6], [9.5, 19.4], [13, 19.8], [16.5, 19.4], [20, 18.6],
  ], { ...SNOW_TRAIL, seed: 7841, y: Y_MAIN });
  // Short spur from the path up to the mouth itself
  addPathRibbon(env, [[-15, 17.8], [-15, 16.6], [-15, 15.4]],
    { ...SNOW_TRAIL, width: 2.2, seed: 7842, y: Y_SPUR });

  // Approach trails from the portal apron to each ramp mouth, so the climb
  // reads as an invitation rather than something you find by bumping into it.
  // They stop at the mouth — the ramps themselves are the route above. Each
  // gets its own rung of the stack because all three share the apron.
  for (const [i, r] of RAMPS_1.entries()) {
    addPathRibbon(env, [
      [0, -14], [r.x0 * 0.5, -15.5], [r.x0, -17], [r.x0, r.z0 + 0.5],
    ], { ...SNOW_TRAIL, width: 2.4, seed: 7850 + i, y: Y_APPROACH + i * 0.0005 });
  }

  // Shelf-top trails, lifted onto their own levels — a worn line across each
  // shelf from the ramp it arrives on toward the next one up.
  const shelfTrail = (pts, y, seed, width = 2.4) => {
    const m = addPathRibbon(env, pts, { ...SNOW_TRAIL, width, seed, y: Y_MAIN });
    if (m) m.position.y = y;
    return m;
  };
  shelfTrail([[-6, -22], [-9, -22.6], [-14, -23], [-20, -23.2], [-24, -23.6], [-24, -25]],
    Y_SHELF_1, 7860);
  shelfTrail([[-24, -34.5], [-22, -36], [-20, -37.5]], Y_SHELF_2, 7861);
  shelfTrail([[-20, -47.5], [-16, -50], [-10, -52], [-4, -53], [0, -53.4]], Y_SHELF_3, 7862);

  // ── Wind-blown spindrift ──────────────────────────────────────────────────
  // The zone had zero moving elements (env._spinners was empty). These are
  // low, fast streaks of driven snow that skim the shelves — cheap, and they
  // do more for "this place is cold" than any static prop.
  addSpindrift(env, rng);

  // ── The aurora ────────────────────────────────────────────────────────────
  // Live curtains standing on the northern horizon, behind the arch. See
  // aurora.js for why they are vertical and far away rather than overhead —
  // the version that was cut failed on exactly that point.
  addAurora(env);
}

/**
 * Shelf and ramp top surfaces.
 *
 * The walkable rects in glacier.js already describe every deck exactly — and
 * they are split around the rifts, which is precisely the shape the geometry
 * needs — so each rect becomes one plane and each ramp one sloped quad. Decks
 * brighten as they climb, so the stack reads as rising toward the low sun even
 * where no riser edge is in frame.
 */
function addGlacierDecks(env) {
  const DECK = [
    [SHELF_1, Y_SHELF_1, 0xd6e4f4],
    [SHELF_2, Y_SHELF_2, 0xe1ecfa],
    [SHELF_3, Y_SHELF_3, 0xecf4ff],
  ];
  for (const [rects, y, color] of DECK) {
    const mat = createToonMaterial(color);
    for (const r of rects) {
      const w = r.maxX - r.minX, d = r.maxZ - r.minZ;
      const deck = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
      deck.rotation.x = -Math.PI / 2;
      deck.position.set((r.minX + r.maxX) / 2, y, (r.minZ + r.maxZ) / 2);
      deck.receiveShadow = true;
      env.group.add(deck);
    }
  }

  // Ramps: a quad from the low end to the high end, a touch wider than the
  // walkable band so the player never sees their own feet leave the surface.
  const RAMPS = [
    [RAMPS_1, 0xd6e4f4], [RAMPS_2, 0xe1ecfa], [RAMPS_3, 0xecf4ff],
    [[RIFT_DESCENT], 0xc3d6ea],
  ];
  for (const [list, color] of RAMPS) {
    const mat = createToonMaterial(color);
    for (const r of list) {
      const hw = r.halfW + 0.15;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute([
        r.x0 - hw, r.y0, r.z0, r.x0 + hw, r.y0, r.z0,
        r.x1 + hw, r.y1, r.z1, r.x1 - hw, r.y1, r.z1,
      ], 3));
      geo.setIndex([0, 2, 1, 0, 3, 2]);
      geo.computeVertexNormals();
      const ramp = new THREE.Mesh(geo, mat);
      ramp.receiveShadow = true;
      env.group.add(ramp);
      // Close the wedge's open flanks so the ramp reads as a solid snow bank
      // rather than a floating strip of paper seen edge-on.
      for (const s of [-1, 1]) {
        const side = new THREE.BufferGeometry();
        side.setAttribute('position', new THREE.Float32BufferAttribute([
          r.x0 + s * hw, r.y0, r.z0, r.x1 + s * hw, r.y1, r.z1,
          r.x1 + s * hw, 0, r.z1, r.x0 + s * hw, 0, r.z0,
        ], 3));
        side.setIndex(s > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]);
        side.computeVertexNormals();
        env.group.add(new THREE.Mesh(side, mat));
      }
    }
  }
}

/**
 * Ground colour ramp. Snow is a mirror: it takes deep blue from the sky in
 * shadow and warm light where the sun catches it. A single mid-grey plane
 * gives it neither, which is most of why the field read as an ice desert.
 *
 * South (camera side, low ground) runs cold and blue; the northern shelves
 * warm toward the low winter sun behind the arch. Returns LINEAR rgb, matching
 * Environment._addGround's colorAt contract.
 */
function groundColorAt(x, z) {
  // 0 at the southern edge → 1 at the far north
  const t = Math.min(1, Math.max(0, (32 - z) / 92));
  // Snow stays SNOW all the way up. An earlier ramp ended on a warm neutral
  // (0xf0eee6) to suggest low sun on the plaza; against the blue sky it read
  // as sand, which is the one thing this zone must never look like. The warmth
  // belongs in the light (ZONE_AMBIENCE sun 0xffdfae), not in the ground.
  const stops = [
    [0.00, 0x9fb6d2],   // deep cold basin nearest the camera
    [0.35, 0xc2d4e8],   // the open snowfield
    [0.62, 0xdae6f4],   // shelf country
    [1.00, 0xe8f1fb],   // the plaza — brightest, but still cold
  ];
  let a = stops[0], b = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i][0] && t <= stops[i + 1][0]) { a = stops[i]; b = stops[i + 1]; break; }
  }
  const span = Math.max(1e-6, b[0] - a[0]);
  const k = Math.min(1, Math.max(0, (t - a[0]) / span));
  const mix = (ca, cb) => Math.round(ca + (cb - ca) * k);
  const r = mix(a[1] >> 16 & 255, b[1] >> 16 & 255);
  const g = mix(a[1] >> 8 & 255, b[1] >> 8 & 255);
  const bl = mix(a[1] & 255, b[1] & 255);
  // A faint lateral drift so the plane never reads as a flat gradient sweep
  const w = 1 + 0.018 * Math.sin(x * 0.09) * Math.cos(z * 0.07);
  const srgb = v => {
    const c = Math.min(1, (v / 255) * w);
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return [srgb(r), srgb(g), srgb(bl)];
}

/**
 * Driven snow. Each streak is a short bright quad that runs downwind across a
 * band and wraps; they live on env._spinners, which Environment.update ticks.
 * Deliberately low-contrast and fast — legible as motion, never as confetti.
 */
function addSpindrift(env, rng) {
  const WIND = -0.42;                       // matches the sastrugi bearing
  const dirX = Math.cos(WIND), dirZ = Math.sin(WIND);
  const bands = [
    { y: 0.16, z0: -20, z1: 30, n: 22 },
    { y: Y_SHELF_1 + 0.16, z0: Z_SHELF_1.n, z1: Z_SHELF_1.s, n: 10 },
    { y: Y_SHELF_2 + 0.16, z0: Z_SHELF_2.n, z1: Z_SHELF_2.s, n: 9 },
    { y: Y_SHELF_3 + 0.16, z0: Z_SHELF_3.n, z1: Z_SHELF_3.s, n: 8 },
  ];
  // Faint and short on purpose — at 0.5 opacity and up to 4.4 units long these
  // read as hard white scratches ruled across the snow, not as blowing powder.
  const mat = new THREE.MeshBasicMaterial({
    color: 0xf2f8ff, transparent: true, opacity: 0.26, depthWrite: false,
  });
  for (const band of bands) {
    for (let i = 0; i < band.n; i++) {
      const len = 0.9 + rng() * 1.4;
      const streak = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.055), mat);
      streak.rotation.x = -Math.PI / 2;
      streak.rotation.z = -WIND;
      const start = { x: -34 + rng() * 68, z: band.z0 + rng() * (band.z1 - band.z0) };
      streak.position.set(start.x, band.y, start.z);
      env.group.add(streak);
      // env._spinners entries are ticked with (delta); give each its own speed
      // and a wrap so the field never empties out.
      const speed = 7 + rng() * 6;
      let travelled = rng() * 60;
      env._spinners.push({
        mesh: streak,
        update: (delta) => {
          travelled += speed * delta;
          if (travelled > 68) { travelled -= 68; }
          streak.position.x = start.x + dirX * travelled;
          streak.position.z = start.z + dirZ * travelled;
          if (streak.position.x > 34) streak.position.x -= 68;
        },
      });
    }
  }
}
