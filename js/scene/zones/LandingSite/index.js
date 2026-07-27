import * as THREE from 'three';
import { createToonMaterial, addOutline, addOutlineToGroup } from '../../ToonMaterials.js';
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
const ADIT = { x: -11.9, z: -11.9 };
const ADIT_ENTRY = { x: -10.63, z: -10.63 };

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
  env._addPortal(4,    -3,  'spaceship', 0, 'Spaceship');

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

// ── Procedural forest ring ────────────────────────────────────────────────────
function _addForest(env) {
  const rng   = seededRandom(12345);
  const r     = CONFIG.FOREST_RADIUS;
  const count = CONFIG.TREE_COUNT;

  const pathAngle    = -3 * Math.PI / 4;
  const gapHalfWidth = Math.PI * 0.12;

  // Keep trees away from portals and large landmarks
  const portalPositions = [
    { x:   4, z:  -3 },   // Spaceship
    { x: -10, z: -10 },   // Mine
    { x:   0, z:  20 },   // Verdant Maw
    { x:  20, z:   0 },   // Lagoon Coast
    { x:   0, z: -20 },   // Frozen Tundra
    { x: 6.8, z: -6.2 },  // grounded scout ship (ZoneAssets)
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

  const keepClear = [
    { x: -18, z: -18, r: 12 },   // mountain
    { x: 18, z: 18, r: 7 },      // Scrap Tyrant arena
    { x: 14, z: 10, r: 3 },      // enemy posts
    { x: -12, z: 16, r: 3 },
    { x: 24, z: -12, r: 3 },
    { x: -22, z: 6, r: 3 },
    { x: 9.4, z: 8.6, r: 5 },    // survivor camp
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
// Was a single 8-sided ConeGeometry(7,14) with a snow cap and a skirt hill —
// from the camera's 46° pitch that reads as one enormous flat grey triangle,
// and it is the landmark the tutorial path walks you toward. A ridge of
// offset masses at different heights and rotations breaks the silhouette, and
// the east flank is deliberately kept low so the mine adit placed at
// (-12.8,-12.8) sits against rock rather than floating off a sheer face.
function _addMountain(env) {
  const { x, z } = CONFIG.MOUNTAIN_POS;
  const rng = seededRandom(20260725);
  const group = new THREE.Group();

  const stone = createToonMaterial(0x8899aa);
  const stoneDark = createToonMaterial(0x6d7d88);
  const snowMat = createToonMaterial(0xeeeeff);

  // [dx, dz, radius, height, material, snowCap]
  const masses = [
    [0,     0,    6.4, 13.5, stone,     2.0],   // main peak
    [4.2,   2.6,  4.4,  8.6, stone,     1.3],   // south-east shoulder
    [-3.4,  3.8,  3.8,  6.4, stoneDark, 0  ],   // low spur toward the meadow
    [-2.8, -4.0,  4.6,  9.8, stone,     1.4],   // north-west sister peak
    [3.0,  -3.4,  3.2,  5.2, stoneDark, 0  ],
  ];

  for (const [dx, dz, r, h, mat, cap] of masses) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), mat);
    cone.position.set(dx, h / 2, dz);
    cone.rotation.y = rng() * Math.PI * 2;
    cone.castShadow = true;
    group.add(cone);
    if (cap > 0) {
      const snow = new THREE.Mesh(new THREE.ConeGeometry(cap, cap * 1.6, 7), snowMat);
      snow.position.set(dx, h - cap * 0.8, dz);
      snow.rotation.y = cone.rotation.y;
      group.add(snow);
    }
  }

  // Broad skirt tying the masses into one hill so they don't read as separate
  // cones standing in a field. Radius 8.8 (not 9.6) so the mine adit placed at
  // (-11.9,-11.9) meets rock at its foot instead of being swallowed mid-slope.
  const skirt = new THREE.Mesh(new THREE.ConeGeometry(8.8, 4.4, 9), stoneDark);
  skirt.position.y = 2.2;
  skirt.rotation.y = rng() * Math.PI * 2;
  group.add(skirt);

  group.position.set(x, 0, z);
  addOutlineToGroup(group, 0.03);
  env.group.add(group);
  env._collisionCircles.push({ x, z, r: 9 });
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
