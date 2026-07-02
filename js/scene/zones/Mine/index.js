import * as THREE from 'three';
import { createToonMaterial, addOutline, createRevealToonMaterial } from '../../ToonMaterials.js';
import { CONFIG } from '../../../config.js';
import { MINE_ZONE_PORTALS, getMineableWallBlocks } from './layout.js';

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
 * The Mine zone — ore wall grid, tunnels, portals, and the central drill rig.
 *
 * ── Connections ───────────────────────────────────────────────────────────────
 *   landingSite  →  south hub gate    always unlocked
 *   depths       →  north-left gate   CONFIG.ENV_UNLOCK.depths
 *   frozenTundra →  north-right gate  CONFIG.ENV_UNLOCK.frozenTundra
 *   verdantMaw   →  east gate         CONFIG.ENV_UNLOCK.verdantMaw
 *   lagoonCoast  →  west gate         CONFIG.ENV_UNLOCK.lagoonCoast
 */
export function build(env) {
  env._addGround(0x120d09); // cavern floor
  _buildPortalHubBackdrop(env);
  const rng = seededRandom(54321);

  // ── Ore wall blocks with reveal shader ──────────────────────────────────
  // One reveal material per ore tier colour — shared across all same-colour blocks.
  const blocks = getMineableWallBlocks();
  const _tierMats = {};
  for (const b of blocks) {
    if (!_tierMats[b.props.color]) {
      const m = createRevealToonMaterial(b.props.color);
      _tierMats[b.props.color] = m;
      env._revealMaterials.push(m);
    }
  }

  for (const b of blocks) {
    const bw = 3.2;
    const bh = 3.5 + rng() * 4.0; // 3.5–7.5m — dramatic height variance
    const bd = 3.2;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), _tierMats[b.props.color]);
    mesh.position.set(b.x, bh / 2, b.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    addOutline(mesh, 0.04);
    env.group.add(mesh);

    const { crack1, crack2 } = env._makeCrackStages(mesh, bw, bh, bd);
    const rock = { mesh, x: b.x, z: b.z, alive: true, props: b.props, richness: 3, maxRichness: 3, crack1, crack2 };
    env._rocks.push(rock);
    env._collisionBoxes.push({
      minX: b.x - bw / 2, maxX: b.x + bw / 2,
      minZ: b.z - bd / 2, maxZ: b.z + bd / 2,
      rock,
    });
  }

  _buildMineTunnels(env);

  // ── Zone portals ──────────────────────────────────────────────────────────
  const mp = MINE_ZONE_PORTALS;
  env._addPortal(mp.landingSite.x,  mp.landingSite.z,  'landingSite',  0,                              'Landing Site');
  env._addReturnBeacon(mp.landingSite.x, mp.landingSite.z);
  env._addPortal(mp.depths.x,       mp.depths.z,       'depths',       CONFIG.ENV_UNLOCK.depths,       'The Depths');
  env._addPortal(mp.frozenTundra.x, mp.frozenTundra.z, 'frozenTundra', CONFIG.ENV_UNLOCK.frozenTundra, 'Frozen Tundra');
  env._addPortal(mp.verdantMaw.x,   mp.verdantMaw.z,   'verdantMaw',   CONFIG.ENV_UNLOCK.verdantMaw,   'Verdant Maw');
  env._addPortal(mp.lagoonCoast.x,  mp.lagoonCoast.z,  'lagoonCoast',  CONFIG.ENV_UNLOCK.lagoonCoast,  'Lagoon Coast');

  _buildDrillRig(env, 0, 0);
}

// ── Mine tunnel corridors ────────────────────────────────────────────────────
function _buildPortalHubBackdrop(env) {
  const hubMat = createToonMaterial(0x24180f);
  const laneMat = createToonMaterial(0x1b130d);
  const padMat = createToonMaterial(0x2b1d13);
  const trimMat = new THREE.MeshBasicMaterial({ color: 0xaa7733, transparent: true, opacity: 0.75 });

  const addPlane = (w, d, x, z, mat, y = 0.018) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    env.group.add(mesh);
    return mesh;
  };

  const addTrim = (w, d, x, z) => {
    addPlane(w, d, x, z, trimMat, 0.026);
  };

  const hub = new THREE.Mesh(new THREE.CircleGeometry(12.5, 48), hubMat);
  hub.rotation.x = -Math.PI / 2;
  hub.position.y = 0.02;
  hub.receiveShadow = true;
  env.group.add(hub);

  const hubRing = new THREE.Mesh(new THREE.TorusGeometry(12.5, 0.08, 8, 48), trimMat);
  hubRing.rotation.x = Math.PI / 2;
  hubRing.position.y = 0.04;
  env.group.add(hubRing);

  addPlane(8.0, 14.0, 0, -11.0, laneMat);
  addPlane(16.0, 14.0, 0, 11.0, laneMat);
  addPlane(14.0, 8.0, 11.0, 0, laneMat);
  addPlane(14.0, 8.0, -11.0, 0, laneMat);

  addTrim(0.22, 16.0, -4.2, -10.0);
  addTrim(0.22, 16.0, 4.2, -10.0);
  addTrim(0.22, 16.0, -8.2, 10.0);
  addTrim(0.22, 16.0, 8.2, 10.0);
  addTrim(16.0, 0.22, 10.0, -4.2);
  addTrim(16.0, 0.22, 10.0, 4.2);
  addTrim(16.0, 0.22, -10.0, -4.2);
  addTrim(16.0, 0.22, -10.0, 4.2);

  for (const pos of Object.values(MINE_ZONE_PORTALS)) {
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(2.25, 2.55, 0.12, 12), padMat);
    pad.position.set(pos.x, 0.06, pos.z);
    pad.receiveShadow = true;
    env.group.add(pad);

    const padRing = new THREE.Mesh(new THREE.TorusGeometry(2.35, 0.08, 8, 24), trimMat);
    padRing.rotation.x = Math.PI / 2;
    padRing.position.set(pos.x, 0.14, pos.z);
    env.group.add(padRing);
  }
}

function _buildMineTunnels(env) {
  const S         = 3.2;
  const EDGE      = 16;
  const STEPS     = 7;
  const FLOOR_LEN = STEPS * S + 14;

  const wallMat  = createToonMaterial(0x181410);
  const floorMat = createToonMaterial(0x0d0b09);
  const rng      = seededRandom(77777);

  // Four tunnels: south (→ Landing Site), north (→ Depths + Frozen Tundra),
  // east (→ Verdant Maw), west (→ Lagoon Coast).
  const tunnels = [
    { axis: 'z', sign: -1, halfW: 6.4 },
    { axis: 'z', sign: +1, halfW: 9.6 },
    { axis: 'x', sign: +1, halfW: 6.4 },
    { axis: 'x', sign: -1, halfW: 6.4 },
  ];

  for (const { axis, sign, halfW } of tunnels) {
    const isZ     = axis === 'z';
    const floorW  = halfW * 2 + S;
    const floorCx = isZ ? 0                         : sign * (EDGE + FLOOR_LEN / 2);
    const floorCz = isZ ? sign * (EDGE + FLOOR_LEN / 2) : 0;

    const floorGeo = isZ
      ? new THREE.PlaneGeometry(floorW, FLOOR_LEN)
      : new THREE.PlaneGeometry(FLOOR_LEN, floorW);
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.set(floorCx, 0.01, floorCz);
    env.group.add(floorMesh);

    // Wall blocks flanking the corridor
    for (let i = 1; i <= STEPS; i++) {
      const mainCoord = sign * (EDGE + i * S);
      for (const side of [-halfW, +halfW]) {
        const h  = 3.5 + rng() * 4.0;
        const bx = isZ ? side      : mainCoord;
        const bz = isZ ? mainCoord : side;
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(3.2, h, 3.2), wallMat);
        mesh.position.set(bx, h / 2, bz);
        addOutline(mesh, 0.04);
        env.group.add(mesh);
        env._collisionCircles.push({ x: bx, z: bz, r: 2.0 });
      }
    }
  }
}

// ── Central drill rig ────────────────────────────────────────────────────────
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
