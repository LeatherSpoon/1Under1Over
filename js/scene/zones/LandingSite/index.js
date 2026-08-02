import * as THREE from 'three';
import { createToonMaterial, addOutline } from '../../ToonMaterials.js';
import { addPathRibbon } from '../../PathRibbon.js';
import { CONFIG } from '../../../config.js';
import { KNOLL_SURFACES, KNOLL_CIRCLES } from './knoll.js';

// The zone's ground albedo — path edges blend to EXACTLY this so the ribbon is
// opaque with no seam (see PathRibbon.js).
const GROUND_HEX = 0x5a8c3c;

// The mine adit's mouth, set into the mountain's south-east face, and the point
// on the approach where the entrance triggers. Everything about the route to
// the mine derives from these two: the path ribbon, the cave entrance, and the
// nav landmark. The trigger sits ~1.8 units in FRONT of the mouth rather than
// at its centre — collision holds the player off the rock face, and a trigger
// buried in the cliff never comes within its own interact radius (the door-zone
// gotcha in CLAUDE.md).
// Seating (from build_mountain.py's JS| print): the mountain's flattened
// portal face lies 9.6 units out from MOUNTAIN_POS along the 45-degree
// bearing; the facade prop sits at t 9.3 so its rock surround beds 1.0 into
// the pocket and its timber face stands 0.49 proud of the rock.
const ADIT = { x: -11.42, z: -11.42 };
const ADIT_ENTRY = { x: -10.63, z: -10.63 };

// The Starwing v2 (owner concept + correction, 2026-07-30: "a VTOL C130
// mixed with a bullet train... park it on its belly") — a LONG delta:
// 26 nose-to-tail, 16 span, belly on the grass. The GLB is authored nose
// toward +z at true world scale (source build_starwing.py; proportions are
// ENFORCED against the concept, not trusted from Rodin). The cargo bay is a
// C-130-style rear tunnel cut up the CENTER of the upswept aft (local
// x ±1.7, z −3 back past the tail), so with this rotation its mouth opens
// toward the pad and the player walks straight in off the grass — the long
// axis crosses the screen diagonally for the fixed 46° camera.
const SHIP = { x: 9.0, z: -10.5, rotY: 2.45 };

/** Model-local (x, z) → world, using the ship's placement rotation. */
function shipPoint(lx, lz) {
  const c = Math.cos(SHIP.rotY), s = Math.sin(SHIP.rotY);
  return { x: SHIP.x + lx * c + lz * s, z: SHIP.z - lx * s + lz * c };
}

// Just outside the bay mouth, behind the tail — where leaving the ship puts
// you back down (Spaceship/index.js passes it as its exit spawnOverride, so
// stepping out of the bay and stepping back in are the same doorway).
export const SHIP_RAMP_FOOT = shipPoint(0, -14.8);

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
 * Landing Site — the starting zone. Green ground, forest perimeter,
 * mountain with mine portal, and the spaceship landing pad.
 *
 * ── Connections ───────────────────────────────────────────────────────────────
 *   spaceship  →  (4,  -3)   always unlocked
 *   mine       →  (-10, -10) always unlocked
 */
export function build(env) {
  env._addGround(0x5a8c3c);
  _addLandingPad(env);
  _addPathToMountain(env);
  _addForest(env);
  _addOuterWoods(env);
  _addMountain(env);
  _addRocks(env);
  _addArena(env);
  env._addSignpost(-3, -3, Math.PI * 0.75, 'TO MINE');
  _addShip(env);

  // The mine is a walk-in cave mouth, not an Ancient World Gate: the adit cut
  // into the mountain IS the door (owner call — the gate standing on the grass
  // in front of the rock read as two entrances to one place). `noGate: true`
  // keeps the portal record for main.js's proximity prompt without spawning any
  // gate GLB, fallback ring or energy material — the Glacial Hollow's mouth is
  // the reference. The mountain supplies the visual and the collision.
  env._addCaveEntrance(ADIT_ENTRY.x, ADIT_ENTRY.z, 'mine', 'Mine');
  env._addNavLandmark(ADIT.x, 2.2, ADIT.z, 'Mine');

  // Lookout knoll — northern meadow outcrop with a shelf ramp to a copper
  // lode on top (see ./knoll.js; the GLB is a ZoneAssets placement).
  for (const s of KNOLL_SURFACES) env.addWalkableSurface(s);
  for (const c of KNOLL_CIRCLES) env._collisionCircles.push({ ...c });

  // Survivor camp — the first people the player meets. Both face the campfire
  // at (9.6, 8.4) so they read as talking across it rather than staring past
  // each other; rotY = atan2(dx, dz) turns the model's default +z facing.
  env._addNpc('npcMara',  11.0, 9.4, { rotY: Math.atan2(-1.4, -1.0) });
  env._addNpc('npcFinch',  8.2, 7.4, { rotY: Math.atan2(1.4, 1.0) });
}

// ── Landing pad ──────────────────────────────────────────────────────────────
function _addLandingPad(env) {
  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(CONFIG.LANDING_PAD_RADIUS, CONFIG.LANDING_PAD_RADIUS, 0.12, 24),
    createToonMaterial(0x8899aa)
  );
  pad.position.set(0, 0.06, 0);
  pad.receiveShadow = true;
  pad.castShadow = true;
  env.group.add(pad);

  const mark = new THREE.Mesh(
    new THREE.CylinderGeometry(0.4, 0.4, 0.14, 16),
    createToonMaterial(0xccddee)
  );
  mark.position.set(0, 0.07, 0);
  env.group.add(mark);
}

// ── Dirt path to the mine ─────────────────────────────────────────────────────
// This is the tutorial route — the first thing the game asks the player to walk
// — and it used to be the retired trail pattern: a flat PlaneGeometry strip
// with eight scattered stepping-stone boxes floating on it, ending short of the
// mountain at the old gate's feet. It is now one worn PathRibbon (the game's
// path renderer since 2026-07-25) running from the landing pad's edge all the
// way to the adit mouth, so the route reads as trodden ground and visibly ends
// AT the door rather than trailing off near it.
//
// The centerline bows slightly north of the straight pad→adit diagonal so the
// path curves past the signpost at (-3,-3) instead of running dead straight;
// ZoneAssets keeps a 1.6-unit ground-cover corridor along this line.
function _addPathToMountain(env) {
  addPathRibbon(env, [
    [-1.5,  -1.5],
    [-3.9,  -3.1],
    [-6.4,  -5.6],
    [-8.6,  -8.4],
    [ADIT_ENTRY.x, ADIT_ENTRY.z],
    [ADIT.x + 0.5, ADIT.z + 0.5],
  ], {
    width: 2.0,
    color: 0x8a7d6b,
    groundColor: GROUND_HEX,
    strength: 1.1,
    seed: 4207,
  });
}

// ── The ship: hull footprint + the boarding threshold ─────────────────────────
// Boarding is a walk-in through the open rear cargo bay, not a gate standing
// on the grass (owner call). `_addCaveEntrance` is the right helper despite
// the name — it registers the portal record main.js's proximity prompt needs
// while setting `noGate: true`, so the ship itself is the door. The trigger
// sits INSIDE the bay tunnel, so the prompt fires as the player walks in.
//
// Collision is laid here rather than via the ZoneAssets `r` field because a
// single circle cannot describe this shape: a 26-unit dart with one open
// corridor up the center of its tail. The chains mirror the measured
// planform (build_starwing.py WIDTH probes): needle nose, hull widening to
// the wing band, swept wings, twin tail booms, and the bay's two side
// walls, leaving the center tunnel deliberately open.
function _addShip(env) {
  // Fuselage: nose (+z 13) back to the bay bulkhead, radii tracking the
  // measured widths (±0.7 at the tip → ±3.3 at the wing root).
  for (const [lz, r] of [
    [12.4, 0.6], [11.2, 0.9], [9.7, 1.2], [8.1, 1.5], [6.5, 1.7],
    [4.9, 2.0], [3.3, 2.0], [1.7, 2.0], [0.1, 2.0], [-1.5, 2.0],
  ]) {
    const p = shipPoint(0, lz);
    env._collisionCircles.push({ x: p.x, z: p.z, r });
  }
  // Wings (widest ±8 at lz −2.6) and their trailing sweep to the booms
  for (const [lx, lz, r] of [
    [-3.6, 0, 1.5], [-5.5, -1.4, 1.5], [-7.3, -2.6, 1.2],
    [3.6, 0, 1.5], [5.5, -1.4, 1.5], [7.3, -2.6, 1.2],
    [-4.5, -6, 1.4], [-6.5, -4.5, 1.3],
    [4.5, -6, 1.4], [6.5, -4.5, 1.3],
    [-3.0, -10.5, 0.9], [-3.1, -12, 0.8],
    [3.0, -10.5, 0.9], [3.1, -12, 0.8],
  ]) {
    const p = shipPoint(lx, lz);
    env._collisionCircles.push({ x: p.x, z: p.z, r });
  }
  // Bay tunnel side walls (local x ±1.8) — hold the player on the lit deck
  for (const sx of [-1.85, 1.85]) {
    for (let lz = -12.5; lz <= -3.2; lz += 1.0) {
      const p = shipPoint(sx, lz);
      env._collisionCircles.push({ x: p.x, z: p.z, r: 0.5 });
    }
  }
  // Inner bulkhead behind the boarding door pad
  const bh = shipPoint(0, -2.7);
  env._collisionCircles.push({ x: bh.x, z: bh.z, r: 1.4 });
  // Boarding is walk-activated (owner call): crossing into triggerR of the
  // door point fires the switch itself — no [E]. The radius is tuned so the
  // switch lands about where the hull has swallowed half the walking player
  // at the fixed camera (verified against rig screenshots up the bay axis).
  const door = shipPoint(0, -4.2);
  env._addCaveEntrance(door.x, door.z, 'spaceship', 'the Starwing', { walkIn: true, triggerR: 4.0 });
  env._addNavLandmark(SHIP.x, 4.2, SHIP.z, 'Ship');
}

// ── Procedural forest ring ────────────────────────────────────────────────────
function _addForest(env) {
  const rng   = seededRandom(12345);
  const r     = CONFIG.FOREST_RADIUS;
  const count = CONFIG.TREE_COUNT;

  const pathAngle    = -3 * Math.PI / 4;
  const gapHalfWidth = Math.PI * 0.12;

  // Keep trees away from portals and large landmarks
  // The Starwing is a 26-unit dart: the keep-outs run the full spine, the
  // wing band, the tail booms, and the bay's approach corridor behind the
  // tail, rather than the single short run the old lifter used.
  const portalPositions = [
    { x: -10, z: -10 },   // Mine
    { x:   0, z:  20 },   // Verdant Maw
    { x:  20, z:   0 },   // Lagoon Coast
    { x:   0, z: -20 },   // Frozen Tundra
    ...[-13, -10, -7, -4, -1, 2, 5, 8, 11, 13].map(lz => shipPoint(0, lz)),
    ...[[-4, -1], [4, -1], [-7, -2.5], [7, -2.5], [-3, -11], [3, -11],
        [0, -15], [0, -17.5]].map(([lx, lz]) => shipPoint(lx, lz)),
  ];
  const _tooCloseToPortal = (tx, tz) =>
    portalPositions.some(p => Math.hypot(tx - p.x, tz - p.z) < 3.5);

  // Outer ring
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 - Math.PI;
    let d = Math.abs(angle - pathAngle);
    if (d > Math.PI) d = Math.PI * 2 - d;
    if (d < gapHalfWidth) continue;

    const x = Math.cos(angle) * (r + rng() * 3 - 1.5);
    const z = Math.sin(angle) * (r + rng() * 3 - 1.5);
    if (_tooCloseToPortal(x, z)) continue;
    if (env._tooCloseToTree(x, z)) continue;
    env._addTree(x, z, rng);
  }

  // Inner scatter
  const pathDX = -10, pathDZ = -10;
  const pathLenSq = pathDX ** 2 + pathDZ ** 2;
  for (let i = 0; i < 14; i++) {
    const x = -8 + rng() * 16;
    const z = -8 + rng() * 16;
    if (Math.hypot(x, z) < CONFIG.LANDING_PAD_RADIUS + 1.2) continue;
    if (_tooCloseToPortal(x, z)) continue;
    const t  = Math.max(0, Math.min(1, (x * pathDX + z * pathDZ) / pathLenSq));
    const px = pathDX * t, pz = pathDZ * t;
    if (Math.hypot(x - px, z - pz) < 1.3) continue;
    if (env._tooCloseToTree(x, z)) continue;
    env._addTree(x, z, rng);
  }
}

// ── Outer woods ───────────────────────────────────────────────────────────────
// The zone is 80×80 (±39) but content stopped at the r=14 treeline, so every
// direction past it was blank green — the Scrap Tyrant fought on an empty
// field. This belt runs r≈18→33 and thins outward, so the meadow opens up
// rather than ending at a wall, and leaves deliberate gaps: the boss arena,
// the mountain footprint, and the enemy posts stay clear.
function _addOuterWoods(env) {
  const rng = seededRandom(770425);

  // NOTE: the chunk-placement mask (zones/ComputerBuilding/siteMask.js EXTRA)
  // mirrors several of these radii — keep the two lists in sync.
  const keepClear = [
    { x: -18, z: -18, r: 12 },   // mountain
    { x: 18, z: 18, r: 7 },      // Scrap Tyrant arena
    { x: 14, z: 10, r: 3 },      // enemy posts
    { x: -12, z: 16, r: 3 },
    { x: 24, z: -12, r: 3 },
    { x: -22, z: 6, r: 3 },
    { x: 9.4, z: 8.6, r: 5 },    // survivor camp
    { x: SHIP.x, z: SHIP.z, r: 15 },  // the Starwing — 26-unit dart planform
    { x: -19, z: 9, r: 2 },      // outer resource nodes
    { x: 21, z: -14, r: 2 },
    { x: 24, z: 6, r: 2 },
    { x: 14, z: -24, r: 6.5 },   // lookout knoll + its shelf ramp
  ];

  for (let i = 0; i < 120; i++) {
    const ang = rng() * Math.PI * 2;
    const rad = 18 + Math.sqrt(rng()) * 15;
    // Thin with distance so the far edge feathers out instead of ending flat.
    if (rng() > 1.05 - (rad - 18) / 26) continue;
    const x = Math.cos(ang) * rad;
    const z = Math.sin(ang) * rad;
    if (Math.abs(x) > 34 || Math.abs(z) > 34) continue;
    if (keepClear.some(c => Math.hypot(x - c.x, z - c.z) < c.r)) continue;
    if (env._tooCloseToTree(x, z)) continue;
    env._addTree(x, z, rng);
  }
}

// ── Mountain ──────────────────────────────────────────────────────────────────
// The rock itself is now `Landing_Mountain.glb`, placed from ZoneAssets — an
// authored ridge with the mine adit boolean-cut into its south-east face. All
// that lives here is the collision footprint, because the one thing a prop's
// `r` field cannot express is a landform with a doorway in it.
//
// A perimeter RING blocks the mass, with an arc left open on the adit bearing
// so the player can walk off the path into the mouth. Inside that gap the
// tunnel is boxed by two flank circles and a back-stop at its far end, so the
// alcove is enclosed — you can enter the adit and not walk through the
// mountain. The old single `{ r: 9 }` circle could only do one or the other.
const MOUNTAIN_ADIT_DIR = Math.PI / 4;   // south-east — matches build_mountain.py
const MOUNTAIN_GAP = 0.42;               // half-width of the open arc, radians
const MOUNTAIN_RING_R = 7.6;             // ring radius from the mountain centre

function _addMountain(env) {
  const { x, z } = CONFIG.MOUNTAIN_POS;
  const at = (lx, lz) => ({ x: x + lx, z: z + lz });

  // Perimeter. 14 circles at r 2.7 sit 3.4 apart along the ring — comfortably
  // under the 2r + 2·PLAYER_R the player would need to squeeze between them.
  const N = 14;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    let d = Math.abs(a - MOUNTAIN_ADIT_DIR);
    if (d > Math.PI) d = Math.PI * 2 - d;
    if (d < MOUNTAIN_GAP) continue;                       // the doorway
    const p = at(Math.cos(a) * MOUNTAIN_RING_R, Math.sin(a) * MOUNTAIN_RING_R);
    env._collisionCircles.push({ x: p.x, z: p.z, r: 2.7 });
  }

  // The mouth: flank walls either side of the pocket, and a stop just inside
  // the timber line (t 9.7 against the face plane at 9.6) — the adit prop is a
  // facade with its own dark panel at mid-depth, so the player steps into the
  // doorway but never clips through the painted backdrop. The zone-switch
  // prompt (ADIT_ENTRY, radius 2.5) is live well before the stop.
  const ux = Math.cos(MOUNTAIN_ADIT_DIR), uz = Math.sin(MOUNTAIN_ADIT_DIR);
  for (const side of [-1, 1]) {
    const p = at(ux * 9.0 - uz * 2.5 * side, uz * 9.0 + ux * 2.5 * side);
    env._collisionCircles.push({ x: p.x, z: p.z, r: 1.35 });
    // Jamb guards: without these a player shoving diagonally at the face
    // BESIDE the mouth wedges between the ring-gap edge and the flank to
    // ~1.6 units inside the flattened rock face (caught by the walk sim).
    const j = at(ux * 8.2 - uz * 3.6 * side, uz * 8.2 + ux * 3.6 * side);
    env._collisionCircles.push({ x: j.x, z: j.z, r: 1.6 });
  }
  const back = at(ux * 6.75, uz * 6.75);
  env._collisionCircles.push({ x: back.x, z: back.z, r: 2.6 });
}

// ── Boss arena ────────────────────────────────────────────────────────────────
// The Scrap Tyrant's post at (18,18) was bare grass, so the fight read as
// happening nowhere. A trampled-earth floor plus a scatter of kicked-up stones
// gives it a place — the ground cover scatter keeps clear of the same circle.
function _addArena(env) {
  const cx = 18, cz = 18;
  const rng = seededRandom(55031);

  const floor = new THREE.Mesh(new THREE.CircleGeometry(5.4, 26), createToonMaterial(0x7a6a52));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, 0.015, cz);
  floor.receiveShadow = true;
  env.group.add(floor);

  // Scuffed inner ring — two tones stop the disc reading as a flat decal.
  const scuff = new THREE.Mesh(new THREE.CircleGeometry(3.1, 22), createToonMaterial(0x8a795e));
  scuff.rotation.x = -Math.PI / 2;
  scuff.position.set(cx + 0.4, 0.02, cz - 0.3);
  env.group.add(scuff);

  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rng() * 0.5;
    const d = 4.4 + rng() * 1.6;
    const s = 0.22 + rng() * 0.3;
    const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), createToonMaterial(0x7d7d76));
    stone.position.set(cx + Math.cos(a) * d, s * 0.6, cz + Math.sin(a) * d);
    stone.rotation.set(rng(), rng() * Math.PI, rng());
    stone.castShadow = true;
    addOutline(stone, 0.08);
    env.group.add(stone);
  }
}

// ── Drillable rocks scattered around the zone ─────────────────────────────────
function _addRocks(env) {
  const rng = seededRandom(67890);
  const positions = [[5, 7], [-4, 9], [8, -3], [-9, 4], [3, -8]];
  for (const [x, z] of positions) {
    const rock = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.4 + rng() * 0.3, 0),
      createToonMaterial(0x888888)
    );
    rock.position.set(x, 0.3, z);
    rock.rotation.y = rng() * Math.PI;
    rock.castShadow = true;
    addOutline(rock, 0.08);
    env.group.add(rock);
    const collision = { x, z, r: 0.7 };
    env._collisionCircles.push(collision);
    env._rocks.push({ mesh: rock, x, z, alive: true, collision, richness: 3, maxRichness: 3 });
  }
}
