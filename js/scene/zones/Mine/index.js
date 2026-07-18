import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createToonMaterial, addOutline, addOutlineToGroup, createRevealToonMaterial, createRevealOutlineMaterial } from '../../ToonMaterials.js';
import { CONFIG } from '../../../config.js';
import {
  mineCellToWorld, mineWorldToCell, isMineFloorCell, mineRegionForRow,
  MINE_ZONE_PORTALS, MINE_DRILL_POS,
  getMineableWallBlocks, getMineableBlockAt, getMineWallRuns, getMineWallCells,
  setActiveMineMap, getActiveMineMap, setMineMapCell,
} from './layout.js';
import { floorColorAt } from './floorColor.js';
import { generateMineMap } from './generator.js';
import { kitReady, getKitPiece, applyWallMaterials, applyOreMaterials, applyDressingMaterials, addRevealOutlines } from './kit.js';
import { pickWallPiece, ORE_PIECES, STAL_PIECES, CRYSTAL_PIECES, RUBBLE_PIECES } from './kitRules.js';

function seededRandom(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Deep Core Drill hero prop — preloaded once, cloned per build. Not rigged or
// animated; falls back to the procedural derrick in _buildDrillRig if the GLB
// hasn't finished loading yet (same convention as ResourceNode._nodeModels).
const _drillModel = {};
new GLTFLoader().load('./models/Drill.glb', (gltf) => { _drillModel.rig = gltf.scene; }, undefined, () => {});

// Solid walls share one immortal "rock" so getCollisionBoxes() keeps them forever.
const SOLID = { alive: true };

// Grid-block collision boxes must tile with NO inset. Any inset > 0 opens a
// 2*inset gap at every shared cell face; because AABB resolution at a seam only
// pushes along the axis toward the nearer box, that gap is a free channel in the
// perpendicular direction — the player threads straight through a visually-solid
// wall (the "slipping through cracks" bug). Inset 0 makes adjacent boxes abut,
// so the wall's z/x face stops the player. The old inset existed to let the
// player squeeze diagonally between corner-touching cells, but the cave's
// reachability is validated with 4-connectivity (generator.js reachableGates),
// so no floor cell ever requires a diagonal move — blocking it traps no one.
const GRID_COLLISION_INSET = 0;

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
  // Re-roll (or restore) the cave for this delve before reading any map data.
  const seed = env._mineDelve?.seed ?? 1;
  setActiveMineMap(generateMineMap(seed));

  // Cells mined earlier in this delve stay open — mutate the map before any
  // getter reads it (floors, walls, and blocks all derive from it).
  if (env._mineDelve) {
    const map = getActiveMineMap();
    for (let r = 0; r < map.length; r++) {
      for (let c = 0; c < map[r].length; c++) {
        if (env._mineDelve.isMined(c, r)) setMineMapCell(c, r, '.');
      }
    }
  }

  env._addGround(0x060504); // void — unbroken mountain rock
  const rng = seededRandom(54321);

  const kitMats = {}; // per-build shader cache for kit clones (reveal/glow/toon)

  // Chunked view (Minecraft-style): rock/wall/dressing VISUALS materialize
  // only in chunks near the player and are torn down behind them, so draw
  // calls stay flat no matter how large the map grows. All gameplay state
  // (map cells, rock logic, collision) stays global — only rendering windows.
  // The pre-kit primitive fallback builds everything up front as before.
  const view = kitReady()
    ? { seed, kitMats, chunks: new Map(), update: null }
    : null;
  env._mineChunks = view;

  _buildFloors(env);
  _buildWalls(env, rng, kitMats, view);
  _buildMineableBlocks(env, rng, kitMats, view);
  _buildEntrance(env);
  _buildShaftDressing(env);
  _buildDrillRig(env, MINE_DRILL_POS.x, MINE_DRILL_POS.z);
  _buildDepthsShaft(env);
  _buildBreach(env, rng);
  _scatterCaveDetail(env, rng, kitMats, view);
  if (view) _wireChunkView(env, view);

  // ── Zone portals ──────────────────────────────────────────────────────────
  const mp = MINE_ZONE_PORTALS;
  env._addPortal(mp.landingSite.x,  mp.landingSite.z,  'landingSite',  0,                              'Landing Site');
  env._addPortal(mp.depths.x,       mp.depths.z,       'depths',       CONFIG.ENV_UNLOCK.depths,       'The Depths');
  env._addPortal(mp.verdantMaw.x,   mp.verdantMaw.z,   'verdantMaw',   CONFIG.ENV_UNLOCK.verdantMaw,   'Verdant Maw');
  env._addPortal(mp.frozenTundra.x, mp.frozenTundra.z, 'frozenTundra', CONFIG.ENV_UNLOCK.frozenTundra, 'Frozen Tundra');
  env._addPortal(mp.lagoonCoast.x,  mp.lagoonCoast.z,  'lagoonCoast',  CONFIG.ENV_UNLOCK.lagoonCoast,  'Lagoon Coast');
}

// ── Floors ───────────────────────────────────────────────────────────────────
// One merged mesh, colors sampled per vertex from the continuous floorColorAt
// field — tones flow across cell boundaries instead of stepping per tile, and
// ~300 tile draw calls collapse into one.
function _buildFloors(env) {
  const SUB = 3; // 3×3 quads per cell — ~1.07 m color resolution
  const step = 3.2 / SUB;
  const positions = [], normals = [], colors = [];
  const col = new THREE.Color();
  const map = getActiveMineMap();
  for (let r = 0; r < map.length; r++) {
    for (let c = 0; c < map[r].length; c++) {
      const ch = map[r][c];
      const carved = ch === '.' || (ch >= '0' && ch <= '5'); // floor pre-built under every mineable cell
      if (!carved) continue;
      const { x, z } = mineCellToWorld(c, r);
      const x0 = x - 1.6, z0 = z - 1.6;
      for (let i = 0; i < SUB; i++) {
        for (let j = 0; j < SUB; j++) {
          const xa = x0 + i * step, xb = xa + step;
          const za = z0 + j * step, zb = za + step;
          for (const [vx, vz] of [[xa, za], [xa, zb], [xb, za], [xb, za], [xa, zb], [xb, zb]]) {
            positions.push(vx, 0, vz);
            normals.push(0, 1, 0);
            const [cr, cg, cb] = floorColorAt(vx, vz);
            col.setRGB(cr, cg, cb, THREE.SRGBColorSpace);
            colors.push(col.r, col.g, col.b);
          }
        }
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(geo, createToonMaterial(0xffffff, { vertexColors: true }));
  mesh.position.y = 0.015;
  mesh.receiveShadow = true;
  env.group.add(mesh);
}

// ── Chunked view ─────────────────────────────────────────────────────────────
// The grid partitions into CHUNK_CELLS² chunks. A chunk materializes its
// visuals when the player comes within CHUNK_ACTIVATE_R of its bounds and
// tears them down beyond CHUNK_DEACTIVATE_R (hysteresis avoids thrash at the
// border). Rock *logic* objects live in env._rocks permanently; only their
// meshes come and go — partial drill damage survives a round trip because
// richness lives on the logic object and crack visibility is re-derived.
const CHUNK_CELLS = 8;
const CHUNK_ACTIVATE_R = 36;
const CHUNK_DEACTIVATE_R = 44;

// Per-cell deterministic rolls: same cell → same variant/rotation within a
// delve, no matter in which order (or how many times) chunks materialize.
function cellRng(seed, c, r) {
  return seededRandom((seed ^ Math.imul(c + 1, 73856093) ^ Math.imul(r + 1, 19349663)) | 0);
}

function _chunkFor(view, c, r) {
  const cx = Math.floor(c / CHUNK_CELLS), cz = Math.floor(r / CHUNK_CELLS);
  const key = `${cx},${cz}`;
  let ch = view.chunks.get(key);
  if (!ch) {
    const a = mineCellToWorld(cx * CHUNK_CELLS, cz * CHUNK_CELLS);
    const b = mineCellToWorld(cx * CHUNK_CELLS + CHUNK_CELLS - 1, cz * CHUNK_CELLS + CHUNK_CELLS - 1);
    ch = {
      key, active: false,
      minX: a.x - 1.6, maxX: b.x + 1.6, minZ: a.z - 1.6, maxZ: b.z + 1.6,
      wallCells: [], rocks: [], dressCells: [], objects: [],
    };
    view.chunks.set(key, ch);
  }
  return ch;
}

function _wireChunkView(env, view) {
  view.update = (pos) => {
    for (const ch of view.chunks.values()) {
      const dx = Math.max(ch.minX - pos.x, 0, pos.x - ch.maxX);
      const dz = Math.max(ch.minZ - pos.z, 0, pos.z - ch.maxZ);
      const d = Math.hypot(dx, dz);
      if (!ch.active && d < CHUNK_ACTIVATE_R) _activateChunk(env, view, ch);
      else if (ch.active && d > CHUNK_DEACTIVATE_R) _deactivateChunk(env, view, ch);
    }
  };
}

function _activateChunk(env, view, ch) {
  ch.active = true;
  for (const cell of ch.wallCells) {
    const p = _materializeWallCell(env, view, cell);
    if (p) ch.objects.push(p);
  }
  for (const rock of ch.rocks) {
    if (rock.alive) _materializeRock(env, view, rock);
  }
  for (const cell of ch.dressCells) {
    const p = _materializeDressing(env, view, cell);
    if (p) ch.objects.push(p);
  }
}

function _deactivateChunk(env, view, ch) {
  ch.active = false;
  for (const o of ch.objects) env.group.remove(o);
  ch.objects.length = 0;
  for (const rock of ch.rocks) _dematerializeRock(env, rock);
}

// ── Solid cave walls (non-mineable) ─────────────────────────────────────────
function _buildWalls(env, rng, kitMats, view) {
  // Collision always comes from the merged runs — identical to the pre-kit
  // behavior and independent of which visual path builds below.
  for (const run of getMineWallRuns()) {
    env._collisionBoxes.push({
      minX: run.cx - run.width / 2 + GRID_COLLISION_INSET, maxX: run.cx + run.width / 2 - GRID_COLLISION_INSET,
      minZ: run.cz - run.depth / 2 + GRID_COLLISION_INSET, maxZ: run.cz + run.depth / 2 - GRID_COLLISION_INSET,
      rock: SOLID,
    });
  }

  if (!view) {
    _buildWallsPrimitive(env, rng);
    return;
  }

  for (const cell of getMineWallCells()) {
    _chunkFor(view, cell.c, cell.r).wallCells.push(cell);
  }
}

function _materializeWallCell(env, view, cell) {
  const roll = cellRng(view.seed, cell.c, cell.r);
  const piece = getKitPiece(pickWallPiece(cell.region, roll()));
  if (!piece) return null;
  applyWallMaterials(piece, env, view.kitMats);
  piece.position.set(cell.x, 0, cell.z);
  piece.rotation.y = Math.floor(roll() * 4) * (Math.PI / 2); // quarter turns keep the footprint
  piece.scale.y = 0.92 + roll() * 0.2;                       // per-cell crest variation
  addRevealOutlines(piece, env, view.kitMats, 0.03, 1.7);
  env.group.add(piece);
  return piece;
}

// Pre-kit visual path — kept as the fallback while MineKit.glb loads.
function _buildWallsPrimitive(env, rng) {
  const rockMat  = createRevealToonMaterial(0x191410, { revealR: 1.7 });
  const alienMat = createRevealToonMaterial(0x171126, { revealR: 1.7 });
  const outlineMat = createRevealOutlineMaterial({ revealR: 1.7 });
  env._revealMaterials.push(rockMat, alienMat, outlineMat);

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
    const outline = new THREE.Mesh(mesh.geometry, outlineMat);
    outline.scale.setScalar(1.03);
    outline.renderOrder = -1;
    mesh.add(outline);
    env.group.add(mesh);
  }
}

// ── Mineable blocks: ore seams + dig-anywhere plain rock ─────────────────────
// Only exposed blocks get logic objects. Mining one out opens its cell and
// spawns the newly-exposed rock behind it (env._mineDig, called by drillRock).
// Logic (rock entry + collision box) is global; the mesh belongs to the
// chunked view and may not exist while the player is far away.
function _buildMineableBlocks(env, rng, kitMats, view) {
  const ctx = { kitMats, rng, view, live: new Set(), tierMats: {}, veinMats: {} };

  for (const b of getMineableWallBlocks()) _spawnMineableBlock(env, ctx, b);

  env._mineDig = {
    onDepleted: (rock) => {
      setMineMapCell(rock.cellC, rock.cellR, '.');
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const nc = rock.cellC + dc, nr = rock.cellR + dr;
          if (ctx.live.has(`${nc},${nr}`)) continue;
          const nb = getMineableBlockAt(nc, nr);
          if (nb) _spawnMineableBlock(env, ctx, nb);
        }
      }
    },
  };
}

function _spawnMineableBlock(env, ctx, b) {
  ctx.live.add(`${b.cellC},${b.cellR}`);
  const richness = b.plain ? 1 : 3;
  const rock = {
    mesh: null, x: b.x, z: b.z, alive: true, props: b.props, plain: b.plain,
    richness, maxRichness: richness, crack1: null, crack2: null,
    cellC: b.cellC, cellR: b.cellR,
  };
  env._rocks.push(rock);
  const bw = 3.2, bd = 3.2;
  env._collisionBoxes.push({
    minX: b.x - bw / 2 + GRID_COLLISION_INSET, maxX: b.x + bw / 2 - GRID_COLLISION_INSET,
    minZ: b.z - bd / 2 + GRID_COLLISION_INSET, maxZ: b.z + bd / 2 - GRID_COLLISION_INSET,
    rock,
  });

  if (ctx.view) {
    const ch = _chunkFor(ctx.view, b.cellC, b.cellR);
    ch.rocks.push(rock);
    if (ch.active) _materializeRock(env, ctx.view, rock); // dug open mid-visit
  } else {
    _materializeRockPrimitive(env, ctx, rock);
  }
}

function _materializeRock(env, view, rock) {
  const roll = cellRng(view.seed, rock.cellC, rock.cellR);
  const kitMats = view.kitMats;
  const bw = 3.2, bh = 3.4, bd = 3.2;
  let mesh, crack1 = null, crack2 = null;

  if (rock.plain) {
    // Plain rock looks like cave wall — mineable, one hit, stone-only loot.
    mesh = getKitPiece(pickWallPiece(mineRegionForRow(rock.cellR), roll()));
    if (!mesh) return;
    applyWallMaterials(mesh, env, kitMats);
    mesh.rotation.y = Math.floor(roll() * 4) * (Math.PI / 2);
    mesh.scale.y = 0.92 + roll() * 0.2;
    addRevealOutlines(mesh, env, kitMats, 0.03, 1.7);
  } else {
    const oreName = ORE_PIECES[Math.floor(roll() * ORE_PIECES.length)];
    mesh = getKitPiece(oreName);
    if (!mesh) return;
    applyOreMaterials(mesh, env, kitMats, rock.props);
    mesh.rotation.y = Math.floor(roll() * 4) * (Math.PI / 2);
    addRevealOutlines(mesh, env, kitMats, 0.04, 1.5);

    // Blender-authored fissure overlays (fall through to box cracks if the
    // loaded GLB predates them).
    const c1 = getKitPiece(`${oreName}_crack1`);
    const c2 = getKitPiece(`${oreName}_crack2`);
    if (c1 && c2) {
      if (!kitMats.crack) kitMats.crack = new THREE.MeshBasicMaterial({ color: 0x0a0806, side: THREE.DoubleSide });
      for (const g of [c1, c2]) {
        g.traverse((n) => { if (n.isMesh) n.material = kitMats.crack; });
        mesh.add(g);
      }
      crack1 = c1;
      crack2 = c2;
    } else {
      ({ crack1, crack2 } = env._makeCrackStages(mesh, bw, bh, bd));
      // Crack overlays assume a center origin; the kit chunk's origin is at its base.
      crack1.position.y += bh / 2;
      crack2.position.y += bh / 2;
    }
    // Re-derive crack visibility — partial damage survives chunk round trips.
    const stage = rock.maxRichness - rock.richness;
    crack1.visible = stage >= 1;
    crack2.visible = stage >= 2;
  }

  mesh.position.set(rock.x, 0, rock.z);
  env.group.add(mesh);
  rock.mesh = mesh;
  rock.crack1 = crack1;
  rock.crack2 = crack2;
}

function _dematerializeRock(env, rock) {
  if (!rock.mesh) return;
  env.group.remove(rock.mesh);
  rock.mesh = null;
  rock.crack1 = null;
  rock.crack2 = null;
}

// Pre-kit fallback: builds the mesh immediately and permanently (no chunking).
function _materializeRockPrimitive(env, ctx, rock) {
  const { rng } = ctx;
  const bw = 3.2, bd = 3.2;
  let mesh, bh;
  let crack1, crack2;

  if (rock.plain) {
    // Same silhouette the old solid walls had.
    bh = 3.8 + rng() * 1.4;
    if (!ctx.plainMat) {
      ctx.plainMat = createRevealToonMaterial(0x191410, { revealR: 1.7 });
      ctx.plainOutlineMat = createRevealOutlineMaterial({ revealR: 1.7 });
      env._revealMaterials.push(ctx.plainMat, ctx.plainOutlineMat);
    }
    mesh = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), ctx.plainMat);
    mesh.position.set(rock.x, bh / 2, rock.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const outline = new THREE.Mesh(mesh.geometry, ctx.plainOutlineMat);
    outline.scale.setScalar(1.03);
    outline.renderOrder = -1;
    mesh.add(outline);
    env.group.add(mesh);
    rock.mesh = mesh;
    return;
  }

  bh = 3.2 + rng() * 1.6; // shorter than the cave walls — reads as a workable seam
  if (!ctx.tierMats[rock.props.color]) {
    ctx.tierMats[rock.props.color] = createRevealToonMaterial(rock.props.color, { revealR: 1.5 });
    env._revealMaterials.push(ctx.tierMats[rock.props.color]);
  }
  if (!ctx.veinMats[rock.props.veinColor]) {
    ctx.veinMats[rock.props.veinColor] = new THREE.MeshBasicMaterial({ color: rock.props.veinColor });
  }
  mesh = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), ctx.tierMats[rock.props.color]);
  mesh.position.set(rock.x, bh / 2, rock.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  addOutline(mesh, 0.04);
  env.group.add(mesh);

  // Glowing vein studs — the "there's ore in that rock" sparkle
  const veinMat = ctx.veinMats[rock.props.veinColor];
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

  ({ crack1, crack2 } = env._makeCrackStages(mesh, bw, bh, bd));
  rock.mesh = mesh;
  rock.crack1 = crack1;
  rock.crack2 = crack2;
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

  // Abandoned ore cart beside the rails (skipped if its cell rolled as rock)
  if (!_onOpenFloor(1.6, -17.5)) return;
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
// The cave re-rolls per delve, so dressing only stands on open floor — a
// lantern revealed by mining out a rock reads as nonsense.
function _onOpenFloor(x, z) {
  const { c, r } = mineWorldToCell(x, z);
  return isMineFloorCell(c, r);
}

function _buildShaftDressing(env) {
  const postMat = createToonMaterial(WOOD);
  // Support frames across the main shaft (skipped when a post lands in rock)
  for (const fz of [-25.6, -19.2]) {
    if (!_onOpenFloor(-4.4, fz) || !_onOpenFloor(4.4, fz)) continue;
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
  const lanternSpots = [
    [-3.6, -22.6, undefined],
    [-12.8, -1.8, undefined],                        // beside the drill rig
    [9.6, -3.2, undefined],                          // mid-cavern
    [5.6, 16.0, { intensity: 2.4, distance: 10 }],   // passage mouth — the light thins out
  ];
  for (const [lx, lz, opts] of lanternSpots) {
    if (_onOpenFloor(lx, lz)) _addLantern(env, lx, lz, opts);
  }
}

// ── Central drill rig (Deep Core Drill hero prop, procedural fallback) ──────
function _buildDrillRig(env, x, z) {
  env._drillPos = { x, z };
  const rigGroup = new THREE.Group();
  rigGroup.position.set(x, 0, z);

  if (_drillModel.rig) {
    // Native bbox ~1.85m footprint × 0.92m tall; baked-shade material (black
    // base color + emissive map) carries all the art, same as the boulder/rock.
    const DRILL_SCALE = 1.6;
    const model = _drillModel.rig.clone(true);
    model.scale.setScalar(DRILL_SCALE);
    model.traverse((n) => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
    rigGroup.add(model);

    const indicator = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffaa00 })
    );
    indicator.position.y = 0.92 * DRILL_SCALE + 0.5;
    rigGroup.add(indicator);

    env.group.add(rigGroup);
    env._collisionCircles.push({ x, z, r: 1.4 });
    return;
  }

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
  const cx = 0, cz = 28.8; // chamber centre — the rune circle marks the site
  // (The chamber centerpiece is a user-authored hero prop, integrated via the
  // asset pipeline when it lands in Assets/3D/ — nothing procedural here.)

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
const DRESS_PALETTES = {
  rock:   { rock: 0x55493d, crystal: 0x55e0c8 },
  breach: { rock: 0x3a2d5e, crystal: 0xbb88ff },
};

function _scatterCaveDetail(env, rng, kitMats, view) {
  const portals = Object.values(MINE_ZONE_PORTALS);
  const stalMat = view ? null : { rock: createToonMaterial(0x201812), breach: createToonMaterial(0x2a2040) };
  const crysMat = view ? null : { rock: new THREE.MeshBasicMaterial({ color: 0x55e0c8 }), breach: new THREE.MeshBasicMaterial({ color: 0xbb88ff }) };

  const map = getActiveMineMap();
  for (let r = 0; r < map.length; r++) {
    for (let c = 0; c < map[r].length; c++) {
      if (!isMineFloorCell(c, r)) continue;
      const { x, z } = mineCellToWorld(c, r);

      // Keep the travelled routes and POIs clean
      if (Math.abs(x) < 4.5 && z < -8) continue;                                  // entrance + shaft spine
      if (portals.some(p => Math.hypot(x - p.x, z - p.z) < 4.2)) continue;
      if (Math.hypot(x - MINE_DRILL_POS.x, z - MINE_DRILL_POS.z) < 4.2) continue;
      if (Math.hypot(x, z - 28.8) < 5.5) continue;                                // chamber-centre clearing

      if (view) {
        _chunkFor(view, c, r).dressCells.push({ c, r, x, z });
        continue;
      }

      // Pre-kit primitive fallback — built up front, never chunked.
      const roll = rng();
      const key = r >= 17 ? 'breach' : 'rock';
      const ox = (rng() - 0.5) * 2.0;
      const oz = (rng() - 0.5) * 2.0;
      if (roll < 0.30) {
        const h = 0.5 + rng() * 0.9;
        const stal = new THREE.Mesh(
          new THREE.ConeGeometry(0.16 + rng() * 0.22, h, 6),
          stalMat[key]
        );
        stal.position.set(x + ox, h / 2, z + oz);
        stal.castShadow = true;
        addOutline(stal, 0.03);
        env.group.add(stal);
      } else if (roll < 0.42) {
        const crys = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.16 + rng() * 0.14, 0),
          crysMat[key]
        );
        crys.position.set(x + ox, 0.22, z + oz);
        crys.rotation.y = rng() * Math.PI;
        env.group.add(crys);
      }
    }
  }
}

function _materializeDressing(env, view, cell) {
  const roll = cellRng(view.seed ^ 0x9e37, cell.c, cell.r);
  const spawn = roll();
  let name = null;
  if (spawn < 0.30)      name = STAL_PIECES[Math.floor(roll() * STAL_PIECES.length)];
  else if (spawn < 0.42) name = CRYSTAL_PIECES[Math.floor(roll() * CRYSTAL_PIECES.length)];
  else if (spawn < 0.50) name = RUBBLE_PIECES[0];
  if (!name) return null;
  const piece = getKitPiece(name);
  if (!piece) return null;
  applyDressingMaterials(piece, view.kitMats, DRESS_PALETTES[cell.r >= 17 ? 'breach' : 'rock']);
  piece.position.set(cell.x + (roll() - 0.5) * 2.0, 0, cell.z + (roll() - 0.5) * 2.0);
  piece.rotation.y = roll() * Math.PI * 2; // free rotation — dressing is off-grid
  const s = 0.8 + roll() * 0.6;
  piece.scale.set(s, s, s);
  addOutlineToGroup(piece, 0.03);
  env.group.add(piece);
  return piece;
}
