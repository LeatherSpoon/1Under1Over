import * as THREE from 'three';
import { createToonMaterial, addOutline, addOutlineToGroup, createRevealToonMaterial } from '../../ToonMaterials.js';
import { CONFIG } from '../../../config.js';
import {
  MINE_MAP, mineCellToWorld, isMineFloorCell,
  MINE_ZONE_PORTALS, MINE_DRILL_POS,
  getMineableWallBlocks, getMineWallRuns, getMineFloorRuns,
} from './layout.js';

function seededRandom(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Solid walls share one immortal "rock" so getCollisionBoxes() keeps them forever.
const SOLID = { alive: true };

// Cell-aligned wall runs and ore blocks are full 3.2m squares, so diagonally
// adjacent cells (e.g. two ore veins touching corner-to-corner) leave zero
// physical gap between them — less than the player's 0.7m diameter, trapping
// the player against both boxes at once. Insetting every grid-block collision
// box by this margin guarantees >= 0.7m of clearance at any diagonal touch
// (cell centers are MINE_CELL*sqrt(2) ≈ 4.53m apart; 2*(1.6-0.3)*sqrt(2) ≈
// 3.68m leaves an ~0.85m diagonal gap) without changing the visible geometry.
const GRID_COLLISION_INSET = 0.3;

/**
 * The Mine — a Shadows-of-Brimstone-style descent.
 *
 * Timbered entrance → lantern-lit main shaft → working cavern (drill rig,
 * ore veins, the shaft down to The Depths) → winding passage → the Breach:
 * an ancient chamber whose stone gates lead to other worlds.
 *
 * ── Connections ───────────────────────────────────────────────────────────────
 *   landingSite  →  entrance adit      always unlocked
 *   depths       →  cavern shaft       CONFIG.ENV_UNLOCK.depths
 *   verdantMaw   →  Breach west gate   CONFIG.ENV_UNLOCK.verdantMaw
 *   frozenTundra →  Breach east gate   CONFIG.ENV_UNLOCK.frozenTundra
 *   lagoonCoast  →  Breach far gate    CONFIG.ENV_UNLOCK.lagoonCoast
 */
export function build(env) {
  env._addGround(0x060504); // void — unbroken mountain rock
  const rng = seededRandom(54321);

  _buildFloors(env);
  _buildWalls(env, rng);
  _buildOreBlocks(env, rng);
  _buildEntrance(env);
  _buildShaftDressing(env);
  _buildDrillRig(env, MINE_DRILL_POS.x, MINE_DRILL_POS.z);
  _buildDepthsShaft(env);
  _buildBreach(env, rng);
  _scatterCaveDetail(env, rng);

  // ── Zone portals ──────────────────────────────────────────────────────────
  const mp = MINE_ZONE_PORTALS;
  env._addPortal(mp.landingSite.x,  mp.landingSite.z,  'landingSite',  0,                              'Landing Site');
  env._addReturnBeacon(mp.landingSite.x, mp.landingSite.z);
  env._addPortal(mp.depths.x,       mp.depths.z,       'depths',       CONFIG.ENV_UNLOCK.depths,       'The Depths');
  env._addPortal(mp.verdantMaw.x,   mp.verdantMaw.z,   'verdantMaw',   CONFIG.ENV_UNLOCK.verdantMaw,   'Verdant Maw');
  env._addPortal(mp.frozenTundra.x, mp.frozenTundra.z, 'frozenTundra', CONFIG.ENV_UNLOCK.frozenTundra, 'Frozen Tundra');
  env._addPortal(mp.lagoonCoast.x,  mp.lagoonCoast.z,  'lagoonCoast',  CONFIG.ENV_UNLOCK.lagoonCoast,  'Lagoon Coast');
}

// ── Floors ───────────────────────────────────────────────────────────────────
const FLOOR_TINT = {
  entrance: 0x1e140b, // packed dirt
  shaft:    0x191009, // dirt + grime
  cavern:   0x151009, // worked stone
  passage:  0x140e15, // rock giving way to something else
  breach:   0x130c1d, // ancient violet-black stone
};

function _buildFloors(env) {
  const mats = {};
  for (const [region, color] of Object.entries(FLOOR_TINT)) {
    mats[region] = createToonMaterial(color);
  }
  for (const run of getMineFloorRuns()) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(run.width, run.depth), mats[run.region]);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(run.cx, 0.015, run.cz);
    mesh.receiveShadow = true;
    env.group.add(mesh);
  }
}

// ── Solid cave walls (non-mineable) ─────────────────────────────────────────
function _buildWalls(env, rng) {
  const rockMat  = createRevealToonMaterial(0x191410, { revealR: 2.4 });
  const alienMat = createRevealToonMaterial(0x171126, { revealR: 2.4 });
  env._revealMaterials.push(rockMat, alienMat);

  for (const run of getMineWallRuns()) {
    const alien = run.kind === 'alien';
    const h = alien ? 5.2 + rng() * 1.6 : 3.8 + rng() * 1.9;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(run.width, h, run.depth),
      alien ? alienMat : rockMat
    );
    mesh.position.set(run.cx, h / 2, run.cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    addOutline(mesh, 0.03);
    env.group.add(mesh);

    env._collisionBoxes.push({
      minX: run.cx - run.width / 2 + GRID_COLLISION_INSET, maxX: run.cx + run.width / 2 - GRID_COLLISION_INSET,
      minZ: run.cz - run.depth / 2 + GRID_COLLISION_INSET, maxZ: run.cz + run.depth / 2 - GRID_COLLISION_INSET,
      rock: SOLID,
    });
  }
}

// ── Mineable ore blocks with glowing veins ──────────────────────────────────
function _buildOreBlocks(env, rng) {
  const blocks = getMineableWallBlocks();
  const tierMats = {};
  const veinMats = {};
  for (const b of blocks) {
    if (!tierMats[b.props.color]) {
      const m = createRevealToonMaterial(b.props.color, { revealR: 1.8 });
      tierMats[b.props.color] = m;
      env._revealMaterials.push(m);
    }
    if (!veinMats[b.props.veinColor]) {
      veinMats[b.props.veinColor] = new THREE.MeshBasicMaterial({ color: b.props.veinColor });
    }
  }

  for (const b of blocks) {
    const bw = 3.2;
    const bh = 3.2 + rng() * 1.6; // shorter than the cave walls — reads as a workable seam
    const bd = 3.2;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), tierMats[b.props.color]);
    mesh.position.set(b.x, bh / 2, b.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    addOutline(mesh, 0.04);
    env.group.add(mesh);

    // Glowing vein studs — the "there's ore in that rock" sparkle
    const veinMat = veinMats[b.props.veinColor];
    const studCount = 2 + Math.floor(rng() * 2);
    for (let i = 0; i < studCount; i++) {
      const stud = new THREE.Mesh(new THREE.OctahedronGeometry(0.14 + rng() * 0.1, 0), veinMat);
      const face = Math.floor(rng() * 4);
      const along = (rng() - 0.5) * (bw * 0.7);
      const up = 0.5 + rng() * (bh * 0.55) - bh / 2;
      if (face === 0)      stud.position.set(along, up,  bd / 2 + 0.02);
      else if (face === 1) stud.position.set(along, up, -bd / 2 - 0.02);
      else if (face === 2) stud.position.set( bw / 2 + 0.02, up, along);
      else                 stud.position.set(-bw / 2 - 0.02, up, along);
      mesh.add(stud);
    }

    const { crack1, crack2 } = env._makeCrackStages(mesh, bw, bh, bd);
    const rock = { mesh, x: b.x, z: b.z, alive: true, props: b.props, richness: 3, maxRichness: 3, crack1, crack2 };
    env._rocks.push(rock);
    env._collisionBoxes.push({
      minX: b.x - bw / 2 + GRID_COLLISION_INSET, maxX: b.x + bw / 2 - GRID_COLLISION_INSET,
      minZ: b.z - bd / 2 + GRID_COLLISION_INSET, maxZ: b.z + bd / 2 - GRID_COLLISION_INSET,
      rock,
    });
  }
}

// ── Entrance: adit frame, rails, cart ────────────────────────────────────────
const WOOD = 0x4a3524;
const WOOD_DARK = 0x3a2a1c;

function _addLantern(env, x, z, { color = 0xffa94d, intensity = 3.2, distance = 13, post = true } = {}) {
  const g = new THREE.Group();
  if (post) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.7, 6), createToonMaterial(WOOD_DARK));
    pole.position.y = 0.85;
    g.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.07, 0.07), createToonMaterial(WOOD_DARK));
    arm.position.set(0.2, 1.66, 0);
    g.add(arm);
  }
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 8, 6),
    new THREE.MeshBasicMaterial({ color })
  );
  bulb.position.set(post ? 0.42 : 0, post ? 1.5 : 2.4, 0);
  g.add(bulb);

  const light = new THREE.PointLight(color, intensity, distance, 1);
  light.position.copy(bulb.position);
  g.add(light);

  g.position.set(x, 0, z);
  env.group.add(g);
  if (post) env._collisionCircles.push({ x, z, r: 0.28 });
  return g;
}

function _buildEntrance(env) {
  const portal = MINE_ZONE_PORTALS.landingSite;

  // Adit frame — chunky timber portal around the surface lift
  const frame = new THREE.Group();
  const postMat = createToonMaterial(WOOD);
  for (const px of [-2.4, 2.4]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.55, 3.6, 0.55), postMat);
    post.position.set(px, 1.8, 0);
    post.castShadow = true;
    frame.add(post);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(5.9, 0.55, 0.65), postMat);
  lintel.position.set(0, 3.6, 0);
  lintel.castShadow = true;
  frame.add(lintel);
  const lintel2 = new THREE.Mesh(new THREE.BoxGeometry(5.3, 0.35, 0.5), createToonMaterial(WOOD_DARK));
  lintel2.position.set(0, 2.95, 0.1);
  frame.add(lintel2);
  addOutlineToGroup(frame, 0.03);
  frame.position.set(portal.x, 0, portal.z);
  env.group.add(frame);
  env._collisionCircles.push({ x: portal.x - 2.4, z: portal.z, r: 0.45 });
  env._collisionCircles.push({ x: portal.x + 2.4, z: portal.z, r: 0.45 });

  // Hanging lamp under the lintel — the warm "you are safe here" glow
  _addLantern(env, portal.x, portal.z + 1.1, { post: false, intensity: 3.6, distance: 15 });

  // Rails from the entrance down the main shaft
  const railMat = createToonMaterial(0x3c3c40);
  const tieMat  = createToonMaterial(WOOD_DARK);
  const railLen = 18;
  const railCz  = -22; // spans z=-31 … -13
  for (const rx of [-0.55, 0.55]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.07, railLen), railMat);
    rail.position.set(rx, 0.07, railCz);
    env.group.add(rail);
  }
  for (let i = 0; i < 13; i++) {
    const tie = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.06, 0.32), tieMat);
    tie.position.set(0, 0.035, -30.5 + i * 1.4);
    env.group.add(tie);
  }

  // Abandoned ore cart beside the rails
  const cart = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.75, 0.95), createToonMaterial(0x51555e));
  body.position.y = 0.75;
  body.castShadow = true;
  cart.add(body);
  const mound = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.5, 7), createToonMaterial(0x2a1a08));
  mound.position.y = 1.3;
  cart.add(mound);
  for (const [wx, wz] of [[-0.45, 0.5], [0.45, 0.5], [-0.45, -0.5], [0.45, -0.5]]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.1, 10), createToonMaterial(0x26262a));
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(wx, 0.2, wz);
    cart.add(wheel);
  }
  addOutlineToGroup(cart, 0.035);
  cart.position.set(1.6, 0, -17.5);
  cart.rotation.y = 0.12;
  env.group.add(cart);
  env._collisionCircles.push({ x: 1.6, z: -17.5, r: 0.6 });
}

// ── Shaft + cavern dressing: timber supports and lanterns ───────────────────
function _buildShaftDressing(env) {
  const postMat = createToonMaterial(WOOD);
  // Support frames across the main shaft
  for (const fz of [-25.6, -19.2]) {
    const set = new THREE.Group();
    for (const px of [-4.4, 4.4]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.32, 3.1, 0.32), postMat);
      post.position.set(px, 1.55, 0);
      post.castShadow = true;
      set.add(post);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(9.3, 0.32, 0.4), postMat);
    beam.position.set(0, 3.05, 0);
    set.add(beam);
    addOutlineToGroup(set, 0.03);
    set.position.set(0, 0, fz);
    env.group.add(set);
  }

  // Lanterns marking the route: shaft → cavern → passage
  _addLantern(env, -3.6, -22.6);
  _addLantern(env, -12.8, -1.8);                                 // beside the drill rig
  _addLantern(env,  9.6, -3.2);                                  // mid-cavern
  _addLantern(env,  5.6, 16.0, { intensity: 2.4, distance: 10 }); // passage mouth — the light thins out
}

// ── Central drill rig (unchanged silhouette, relocated) ──────────────────────
function _buildDrillRig(env, x, z) {
  env._drillPos = { x, z };
  const rigGroup = new THREE.Group();
  rigGroup.position.set(x, 0, z);

  // Octagonal base platform
  const base = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.6, 0.5, 8), createToonMaterial(0x252525));
  base.position.y = 0.25;
  addOutline(base, 0.04);
  rigGroup.add(base);

  // Hazard stripe ring
  const hazard = new THREE.Mesh(new THREE.TorusGeometry(2.45, 0.09, 6, 8), createToonMaterial(0xffcc00));
  hazard.rotation.x = Math.PI / 2;
  hazard.position.y = 0.52;
  rigGroup.add(hazard);

  // 4 structural pillars at 45° offset
  const pillarMat = createToonMaterial(0x1e1e1e);
  const pillarAngles = [Math.PI / 4, 3 * Math.PI / 4, 5 * Math.PI / 4, 7 * Math.PI / 4];
  for (const angle of pillarAngles) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.26, 5.2, 0.26), pillarMat);
    pillar.position.set(Math.cos(angle) * 1.9, 2.85, Math.sin(angle) * 1.9);
    addOutline(pillar, 0.03);
    rigGroup.add(pillar);
  }

  // Cross-beams at two heights
  const beamMat = createToonMaterial(0x303030);
  for (const beamY of [1.5, 3.6]) {
    const bx = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.18, 0.18), beamMat);
    const bz = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 3.8), beamMat);
    bx.position.y = beamY;
    bz.position.y = beamY;
    rigGroup.add(bx);
    rigGroup.add(bz);
  }

  // Crown frame — four box beams forming a square
  const crownY   = 5.2;
  const crownMat = createToonMaterial(0x2a2a2a);
  for (let i = 0; i < 4; i++) {
    const cGeo = i % 2 === 0
      ? new THREE.BoxGeometry(3.8, 0.22, 0.22)
      : new THREE.BoxGeometry(0.22, 0.22, 3.8);
    const cBeam = new THREE.Mesh(cGeo, crownMat);
    cBeam.position.y = crownY;
    addOutline(cBeam, 0.025);
    rigGroup.add(cBeam);
  }

  // Machinery housing on crown
  const house = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.75, 1.7), createToonMaterial(0x363636));
  house.position.y = crownY + 0.475;
  addOutline(house, 0.04);
  rigGroup.add(house);

  // Drill shaft
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 3.5, 8), createToonMaterial(0x4a4a4a));
  shaft.position.y = 3.25;
  addOutline(shaft, 0.03);
  rigGroup.add(shaft);

  // Drill bit — wide cone + narrow tip
  const bitMat = createToonMaterial(0xddbb44);
  const bit1 = new THREE.Mesh(new THREE.ConeGeometry(0.48, 1.2, 8), bitMat);
  bit1.rotation.x = Math.PI;
  bit1.position.y = 0.9;
  addOutline(bit1, 0.04);
  rigGroup.add(bit1);

  const bit2 = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.55, 8), bitMat);
  bit2.rotation.x = Math.PI;
  bit2.position.y = 0.025;
  rigGroup.add(bit2);

  // Warning lights on pillars
  const warnMat = new THREE.MeshBasicMaterial({ color: 0xff2200 });
  for (const angle of pillarAngles) {
    const warn = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 6), warnMat);
    warn.position.set(Math.cos(angle) * 1.9, 4.0, Math.sin(angle) * 1.9);
    rigGroup.add(warn);
  }

  // Interaction indicator — glowing orb above crown
  const indicator = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xffaa00 })
  );
  indicator.position.y = crownY + 1.3;
  rigGroup.add(indicator);

  env.group.add(rigGroup);
  env._collisionCircles.push({ x, z, r: 1.2 });
}

// ── The Depths shaft: headframe over a hole that keeps going down ───────────
function _buildDepthsShaft(env) {
  const p = MINE_ZONE_PORTALS.depths;
  const g = new THREE.Group();

  // Dark pit under the portal ring
  const pit = new THREE.Mesh(
    new THREE.CircleGeometry(1.7, 20),
    new THREE.MeshBasicMaterial({ color: 0x000000 })
  );
  pit.rotation.x = -Math.PI / 2;
  pit.position.y = 0.03;
  g.add(pit);

  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.09, 6, 20), createToonMaterial(0x3a3a3e));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.1;
  g.add(rim);

  // A-frame headframe legs meeting above the pit
  const legMat = createToonMaterial(WOOD);
  const up = new THREE.Vector3(0, 1, 0);
  for (const [lx, lz] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.28, 4.9, 0.28), legMat);
    const dir = new THREE.Vector3(-lx, 4.4, -lz).normalize();
    leg.quaternion.setFromUnitVectors(up, dir);
    leg.position.set(lx / 2, 2.2, lz / 2); // midpoint of base (lx,0,lz) → apex (0,4.4,0)
    leg.castShadow = true;
    g.add(leg);
    env._collisionCircles.push({ x: p.x + lx, z: p.z + lz, r: 0.3 });
  }
  const apex = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.7), createToonMaterial(WOOD_DARK));
  apex.position.y = 4.45;
  g.add(apex);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.08, 6, 14), createToonMaterial(0x2c2c30));
  wheel.position.y = 5.05;
  g.add(wheel);
  addOutlineToGroup(g, 0.03);

  g.position.set(p.x, 0, p.z);
  env.group.add(g);
}

// ── The Breach — ancient portal chamber ──────────────────────────────────────
const ALIEN_STONE = 0x241a38;
const RUNE_VIOLET = 0x8a5cff;

function _buildBreach(env, rng) {
  const cx = 0, cz = 28.8; // chamber centre / ancient ring

  // Dais with a glowing rune ring
  const dais = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 3.0, 0.35, 12), createToonMaterial(ALIEN_STONE));
  dais.position.set(cx, 0.175, cz);
  dais.receiveShadow = true;
  addOutline(dais, 0.03);
  env.group.add(dais);

  const daisRing = new THREE.Mesh(
    new THREE.TorusGeometry(2.75, 0.07, 6, 40),
    new THREE.MeshBasicMaterial({ color: RUNE_VIOLET })
  );
  daisRing.rotation.x = Math.PI / 2;
  daisRing.position.set(cx, 0.4, cz);
  env.group.add(daisRing);

  // The Great Ring — a standing gate the miners uncovered, slowly turning
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.0, 0.22, 10, 36), createToonMaterial(0x35284f));
  ring.position.set(cx, 2.45, cz);
  addOutline(ring, 0.03);
  env.group.add(ring);
  env._spinners.push({ mesh: ring, axis: 'z', speed: 0.22 });

  const rift = new THREE.Mesh(
    new THREE.CircleGeometry(1.72, 28),
    new THREE.MeshBasicMaterial({ color: 0x7733cc, transparent: true, opacity: 0.38, side: THREE.DoubleSide })
  );
  rift.position.set(cx, 2.45, cz);
  env.group.add(rift);

  const shard = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.3, 0),
    new THREE.MeshBasicMaterial({ color: 0xbb88ff })
  );
  shard.position.set(cx, 5.3, cz);
  env.group.add(shard);
  env._spinners.push({ mesh: shard, axis: 'y', speed: 0.9 });

  // Block the whole dais — the player walks at y=0 and would clip into it
  env._collisionCircles.push({ x: cx, z: cz, r: 2.9 });

  // Chamber light — cold violet, nothing like the lanterns behind you
  const glow = new THREE.PointLight(RUNE_VIOLET, 4.2, 22, 1);
  glow.position.set(cx, 4.2, cz);
  env.group.add(glow);
  const gateGlow = new THREE.PointLight(0x33ccbb, 2.0, 11, 1);
  gateGlow.position.set(0, 3, 34.4);
  env.group.add(gateGlow);

  // Standing stones around the chamber
  const stoneMat = createToonMaterial(ALIEN_STONE);
  const glyphMat = new THREE.MeshBasicMaterial({ color: RUNE_VIOLET });
  const stones = [
    [-11.5, 24.5], [11.5, 24.5],
    [-13.5, 29.5], [13.5, 29.5],
    [-6.0, 34.2],  [6.0, 34.2],
  ];
  for (const [sx, sz] of stones) {
    const h = 3.0 + rng() * 1.3;
    const stone = new THREE.Mesh(new THREE.BoxGeometry(0.95, h, 0.7), stoneMat);
    stone.position.set(sx, h / 2, sz);
    stone.rotation.y = rng() * Math.PI * 2;
    stone.rotation.z = (rng() - 0.5) * 0.1;
    stone.castShadow = true;
    addOutline(stone, 0.035);
    env.group.add(stone);
    const glyph = new THREE.Mesh(new THREE.OctahedronGeometry(0.12, 0), glyphMat);
    glyph.position.set(sx, h * 0.72, sz);
    env.group.add(glyph);
    env._collisionCircles.push({ x: sx, z: sz, r: 0.55 });
  }

  // Rune decals circling the dais
  const runeMat = new THREE.MeshBasicMaterial({ color: RUNE_VIOLET, transparent: true, opacity: 0.45 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const rune = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), runeMat);
    rune.rotation.x = -Math.PI / 2;
    rune.rotation.z = a + rng();
    rune.position.set(cx + Math.cos(a) * 4.3, 0.025, cz + Math.sin(a) * 4.3);
    env.group.add(rune);
  }

  // World gates — stone arches facing the Great Ring
  _buildWorldGate(env, MINE_ZONE_PORTALS.verdantMaw,   Math.PI / 2);  // west gate faces +x
  _buildWorldGate(env, MINE_ZONE_PORTALS.frozenTundra, -Math.PI / 2); // east gate faces -x
  _buildWorldGate(env, MINE_ZONE_PORTALS.lagoonCoast,  0);            // far gate faces -z
}

// A rough-hewn arch around a world portal. rotY orients the opening.
function _buildWorldGate(env, pos, rotY) {
  const g = new THREE.Group();
  const stoneMat = createToonMaterial(ALIEN_STONE);

  for (const px of [-1.7, 1.7]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 3.5, 0.8), stoneMat);
    pillar.position.set(px, 1.75, 0);
    pillar.castShadow = true;
    g.add(pillar);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.4, 1.0), stoneMat);
    cap.position.set(px, 3.65, 0);
    g.add(cap);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.65, 0.9), stoneMat);
  lintel.position.set(0, 4.1, 0);
  lintel.castShadow = true;
  g.add(lintel);
  const keyGlyph = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.16, 0),
    new THREE.MeshBasicMaterial({ color: RUNE_VIOLET })
  );
  keyGlyph.position.set(0, 4.75, 0);
  g.add(keyGlyph);
  addOutlineToGroup(g, 0.035);

  g.position.set(pos.x, 0, pos.z);
  g.rotation.y = rotY;
  env.group.add(g);

  // Pillar collision (rotate the offsets with the arch)
  const cos = Math.cos(rotY), sin = Math.sin(rotY);
  for (const px of [-1.7, 1.7]) {
    env._collisionCircles.push({ x: pos.x + px * cos, z: pos.z - px * sin, r: 0.55 });
  }
}

// ── Scattered stalagmites and glow crystals ──────────────────────────────────
function _scatterCaveDetail(env, rng) {
  const stalMat = { rock: createToonMaterial(0x201812), breach: createToonMaterial(0x2a2040) };
  const crysMat = { rock: new THREE.MeshBasicMaterial({ color: 0x55e0c8 }), breach: new THREE.MeshBasicMaterial({ color: 0xbb88ff }) };
  const portals = Object.values(MINE_ZONE_PORTALS);

  for (let r = 0; r < MINE_MAP.length; r++) {
    for (let c = 0; c < MINE_MAP[r].length; c++) {
      if (!isMineFloorCell(c, r)) continue;
      const { x, z } = mineCellToWorld(c, r);

      // Keep the travelled routes and POIs clean
      if (Math.abs(x) < 4.5 && z < -8) continue;                                  // entrance + shaft spine
      if (portals.some(p => Math.hypot(x - p.x, z - p.z) < 4.2)) continue;
      if (Math.hypot(x - MINE_DRILL_POS.x, z - MINE_DRILL_POS.z) < 4.2) continue;
      if (Math.hypot(x, z - 28.8) < 5.5) continue;                                // dais clearing

      const roll = rng();
      const breachy = r >= 17;
      const ox = (rng() - 0.5) * 2.0;
      const oz = (rng() - 0.5) * 2.0;
      if (roll < 0.30) {
        const h = 0.5 + rng() * 0.9;
        const stal = new THREE.Mesh(
          new THREE.ConeGeometry(0.16 + rng() * 0.22, h, 6),
          stalMat[breachy ? 'breach' : 'rock']
        );
        stal.position.set(x + ox, h / 2, z + oz);
        stal.castShadow = true;
        addOutline(stal, 0.03);
        env.group.add(stal);
      } else if (roll < 0.42) {
        const crys = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.16 + rng() * 0.14, 0),
          crysMat[breachy ? 'breach' : 'rock']
        );
        crys.position.set(x + ox, 0.22, z + oz);
        crys.rotation.y = rng() * Math.PI;
        env.group.add(crys);
      }
    }
  }
}
