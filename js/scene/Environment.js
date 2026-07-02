import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createToonMaterial, addOutline, addOutlineToGroup } from './ToonMaterials.js';
import { CONFIG } from '../config.js';
import { ZONE_ASSETS } from './ZoneAssets.js';
import {
  buildLandingSite, buildMine,         buildDepths,    buildVerdantMaw,
  buildLagoonCoast, buildFrozenTundra, buildSpaceship, buildWorkspace,
} from './zones/index.js';

// Shared GLB model cache — loads each model once then reuses cloned scenes
const _modelCache = {};
const _loader = new GLTFLoader();
function loadModel(path) {
  if (!_modelCache[path]) {
    _modelCache[path] = new Promise((resolve, reject) => {
      _loader.load(path, gltf => resolve(gltf.scene), undefined, reject);
    });
  }
  return _modelCache[path];
}
function cloneModel(gltfScene, scale = 1) {
  const clone = gltfScene.clone(true);
  clone.scale.setScalar(scale);
  clone.traverse(n => {
    if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; }
  });
  return clone;
}


export class Environment {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.currentZone = 'landingSite';
    this._zonePortals = []; // { position, targetZone, ppRequired, mesh }
    this._collisionCircles = []; // { x, z, r }
    this._trackGroup = new THREE.Group(); // track markers live here, separate from env
    scene.add(this._trackGroup);

    // Construct cursor — shows selected tile in construction mode
    this._cursorGroup = new THREE.Group();
    this._cursorGroup.visible = false;
    scene.add(this._cursorGroup);
    const cursorTileMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.45, depthWrite: false });
    const cursorTile = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.9), cursorTileMat);
    cursorTile.rotation.x = -Math.PI / 2;
    cursorTile.position.y = 0.08;
    this._cursorGroup.add(cursorTile);
    this._cursorTileMat = cursorTileMat;
    const cursorEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(1.9, 1.9)),
      new THREE.LineBasicMaterial({ color: 0x00ffcc })
    );
    cursorEdges.rotation.x = -Math.PI / 2;
    cursorEdges.position.y = 0.09;
    this._cursorGroup.add(cursorEdges);
    this._cursorEdgeMat = cursorEdges.material;
    this._cursorPulseT = 0;

    // All placed tree positions — checked before each new tree to prevent overlap
    this._treePlacedPositions = []; // { x, z }

    // Trees in current zone — tracked for Terrain Cutter clearing
    this._trees = []; // { group, x, z, alive, collisionIdx }

    // Rocks in current zone — tracked for drilling
    this._rocks = []; // { mesh, x, z, alive, collisionIdx }

    // AABB collision boxes for grid blocks (mine/depths) — parented to rock entries
    this._collisionBoxes = [];

    // All GridHelper instances — toggled visible only in construction mode
    this._grids = [];

    // Reveal materials (mine blocks) — updated with player position each frame
    this._revealMaterials = [];

    // Growing trees (planted from seeds)
    this._growingTrees = []; // { group, targetScale, currentScale, x, z }

    // Pre-load all GLB models in parallel so they're ready when zones build
    this._modelsReady = Promise.all([
      loadModel('./models/Ghibli_Tree.glb').catch(() => null),
      loadModel('./models/Rock_Cluster.glb').catch(() => null),
      loadModel('./models/Fuel_Barrel.glb').catch(() => null),
      loadModel('./models/Supply_Crate.glb').catch(() => null),
      loadModel('./models/Watchtower.glb').catch(() => null),
      loadModel('./models/Cyborg_PC.glb').catch(() => null),
      loadModel('./models/Scrapper.glb').catch(() => null),
      loadModel('./models/Boulder.glb').catch(() => null),
    ]).then(([tree, rock, barrel, crate, tower, pc, scrapper, boulder]) => {
      this._glb = { tree, rock, barrel, crate, tower, pc, scrapper, boulder };
      // Place GLB props for the initial zone (already built procedurally)
      this._placeGLBProps(this.currentZone);
    });

    buildLandingSite(this);
  }

  // ── Zone switching ─────────────────────────────────────────────────────────
  switchZone(zoneName) {
    // Clear current environment
    while (this.group.children.length > 0) {
      this.group.remove(this.group.children[0]);
    }
    this._zonePortals = [];
    this._collisionCircles = [];
    this._collisionBoxes = [];
    this._trees = [];
    this._rocks = [];
    this._growingTrees = [];
    this._treePlacedPositions = [];
    this._revealMaterials = [];
    // Reset per-zone interactable station positions
    this._offloadStationPos = null;
    this._fabricatorPos = null;
    this._chargingStationPos = null;
    this._craftTerminalPos = null;
    this._droneMonitorPos = null;
    this._ascensionTerminalPos = null;
    this._masteryTerminalPos = null;
    this._workshopStationPos = null;
    this._constructorStationPos = null;
    this._extractorStationPos = null;
    this._assemblyMatrixStationPos = null;
    this.currentZone = zoneName;

    switch (zoneName) {
      case 'landingSite':  buildLandingSite(this);  break;
      case 'mine':         buildMine(this);         break;
      case 'depths':       buildDepths(this);       break;
      case 'verdantMaw':   buildVerdantMaw(this);   break;
      case 'lagoonCoast':  buildLagoonCoast(this);  break;
      case 'frozenTundra': buildFrozenTundra(this); break;
      case 'spaceship':    buildSpaceship(this);    break;
      case 'workspace':    buildWorkspace(this);    break;
      default: buildLandingSite(this);
    }

    // Place GLB props once models are ready (no-op if still loading)
    if (this._glb) {
      this._placeGLBProps(zoneName);
    }
  }

  // ── Per-frame environment update (growing trees, harvest cooldowns) ────────
  update(delta) {
    for (const t of this._growingTrees) {
      if (t.currentScale < t.targetScale) {
        t.currentScale = Math.min(t.targetScale, t.currentScale + delta * (t.targetScale / 60));
        t.group.scale.setScalar(t.currentScale);
      }
    }
    // Tick tree harvest cooldowns (30s before same tree can be harvested again)
    for (const t of this._trees) {
      if (t.alive && !t._harvestReady) {
        t._harvestTimer += delta;
        if (t._harvestTimer >= 30) {
          t._harvestReady = true;
          t._harvestTimer = 0;
        }
      }
    }
  }

  // ── Terrain Cutter interactions ────────────────────────────────────────────
  // requireHarvestReady: if true, only returns trees with harvest cooldown ready
  findNearestTree(playerPos, requireHarvestReady = false) {
    let best = null, bestDist = Infinity;
    for (const t of this._trees) {
      if (!t.alive) continue;
      if (requireHarvestReady && !t._harvestReady) continue;
      const d = Math.hypot(playerPos.x - t.x, playerPos.z - t.z);
      if (d < 1.8 && d < bestDist) { best = t; bestDist = d; }
    }
    return best;
  }

  // Harvest timber without removing the tree (30s cooldown per tree)
  harvestTimber(tree) {
    if (!tree || !tree.alive || !tree._harvestReady) return null;
    tree._harvestReady = false;
    tree._harvestTimer = 0;
    return { timber: 1 };
  }

  clearTree(tree) {
    if (!tree || !tree.alive) return null;
    tree.alive = false;
    tree.group.visible = false;
    // Remove collision circle for this tree
    const idx = this._collisionCircles.indexOf(tree.collision);
    if (idx !== -1) this._collisionCircles.splice(idx, 1);

    const timber = 1 + Math.floor(Math.random() * 2); // 1–2 timber
    return { timber, seed: 1 };                        // always yields a seed
  }

  plantTree(x, z) {
    // Spawn a tiny tree that grows to full size over 60s
    this._treePlacedPositions.push({ x, z });
    const treeGroup = new THREE.Group();
    const h = 1.4 + Math.random() * 0.8;
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.22, h, 6);
    const trunkMat = createToonMaterial(0x6b4226);
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = h / 2;
    treeGroup.add(trunk);

    const crownColors = [0x2d6a2d, 0x3a8c3a, 0x245224];
    const crownMat = createToonMaterial(crownColors[Math.floor(Math.random() * crownColors.length)]);
    const crownH = 1.8 + Math.random() * 0.6;
    const crown = new THREE.Mesh(new THREE.ConeGeometry(0.9, crownH, 7), crownMat);
    crown.position.y = h + crownH * 0.4;
    treeGroup.add(crown);

    treeGroup.position.set(x, 0, z);
    treeGroup.scale.setScalar(0.1);
    this.group.add(treeGroup);

    const collision = { x, z, r: 0.55 };
    this._collisionCircles.push(collision);

    const entry = { group: treeGroup, x, z, alive: true, collision, _harvestReady: true, _harvestTimer: 0 };
    this._trees.push(entry);
    this._growingTrees.push({ group: treeGroup, currentScale: 0.1, targetScale: 1.0, x, z });
  }

  // ── Rock drilling interactions ─────────────────────────────────────────────
  findNearestRock(playerPos) {
    let best = null, bestDist = Infinity;
    for (const r of this._rocks) {
      if (!r.alive) continue;
      const d = Math.hypot(playerPos.x - r.x, playerPos.z - r.z);
      if (d < 2.5 && d < bestDist) { best = r; bestDist = d; }
    }
    return best;
  }

  drillRock(rock, techOreBoost = 1.0) {
    if (!rock || !rock.alive) return null;
    rock.richness--;
    const stage = rock.maxRichness - rock.richness; // 1, 2, or 3

    // Loot scales with stage: more stone and ore chance on deeper hits
    const props = rock.props;
    let loot = { stone: stage + Math.floor(Math.random() * 2) };
    const oreChanceMult = ([0, 0.4, 0.7, 1.0][stage] || 1.0) * techOreBoost;
    if (props && props.ore && Math.random() < props.chance * oreChanceMult) {
      loot[props.ore] = 1 + (stage === 3 ? 1 : 0);
    }
    // Ferrous ore drops from any mine block alongside the regular ore
    if (Math.random() < 0.15 * oreChanceMult) {
      loot.ferrous_ore = (loot.ferrous_ore || 0) + 1;
    }

    if (rock.richness <= 0) {
      // Depleted — remove block
      rock.alive = false;
      rock.mesh.visible = false;
      const idx = this._collisionCircles.indexOf(rock.collision);
      if (idx !== -1) this._collisionCircles.splice(idx, 1);
    } else {
      // Show crack overlays per hit stage
      if (stage >= 1 && rock.crack1) rock.crack1.visible = true;
      if (stage >= 2 && rock.crack2) rock.crack2.visible = true;
    }

    return loot;
  }

  // ── GLB model placement ────────────────────────────────────────────────────
  // Reads placements from ZoneAssets.js — edit that file to add/move props.
  // Entries with an `r` field also register a collision circle so the player
  // cannot walk through solid props (boulders, trees, crates, etc.).
  _placeGLBProps(zoneName) {
    const g = this._glb;
    if (!g) return;

    const entries = ZONE_ASSETS[zoneName];
    if (!entries) return;

    for (const { model, x, z, scale, rotY = 0, r } of entries) {
      const src = g[model];
      if (!src) continue; // model file not loaded yet (graceful skip)
      const m = cloneModel(src, scale);
      m.position.set(x, 0, z);
      m.rotation.y = rotY;
      this.group.add(m);
      if (r !== undefined) {
        this._collisionCircles.push({ x, z, r });
      }
    }
  }

  getPortals() { return this._zonePortals; }

  getCollisionCircles() { return this._collisionCircles; }

  /** Show or hide all floor grid helpers (called when construction panel opens/closes). */
  setGridVisible(v) {
    for (const g of this._grids) g.visible = v;
  }

  // Returns AABB boxes for alive (not yet mined) grid blocks
  getCollisionBoxes() { return this._collisionBoxes.filter(b => b.rock.alive); }

  /**
   * Rebuild track marker meshes for the current zone from pedometer data.
   * Call after zone switch or after placing a new track.
   */
  refreshTrackMarkers(pedometer) {
    // Clear previous markers
    while (this._trackGroup.children.length > 0) {
      this._trackGroup.remove(this._trackGroup.children[0]);
    }
    const tracks = pedometer.getPlacedTracksForZone(this.currentZone);
    for (const t of tracks) {
      this._addTrackMarker(t.x, t.z);
    }
  }

  _addTrackMarker(x, z) {
    // Single tile matching one background grid cell (GridHelper: GROUND_SIZE / (GROUND_SIZE/2) = 2 units per cell)
    const tileMat = createToonMaterial(0x00ddaa);
    tileMat.transparent = true;
    tileMat.opacity = 0.55;

    const tileGeo = new THREE.PlaneGeometry(2.0, 2.0);
    const tile = new THREE.Mesh(tileGeo, tileMat);
    tile.rotation.x = -Math.PI / 2;
    tile.position.set(x, 0.03, z);
    this._trackGroup.add(tile);

    const borderGeo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(2.0, 2.0));
    const borderMat = new THREE.LineBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.9 });
    const border = new THREE.LineSegments(borderGeo, borderMat);
    border.rotation.x = -Math.PI / 2;
    border.position.set(x, 0.04, z);
    this._trackGroup.add(border);
  }

  getZoneLabel() {
    const labels = {
      landingSite: 'Landing Site',
      mine: 'The Mine',
      verdantMaw: 'Verdant Maw',
      lagoonCoast: 'Lagoon Coast',
      frozenTundra: 'Frozen Tundra',
      spaceship: 'Spaceship Interior',
      workspace: 'Workspace',
      depths: 'The Depths',
    };
    return labels[this.currentZone] || 'Unknown';
  }

  // ── Resource node spawn positions per zone ─────────────────────────────────
  getResourceNodeSpawns() {
    switch (this.currentZone) {
      case 'landingSite': return [
        { x: -6, z: -3, type: 'copper' },
        { x: 10, z: -8, type: 'copper' },  // was (4,-5) — moved away from spaceship portal (4,-3)
        { x: -8, z: 5, type: 'timber' },
        { x: -10, z: 2, type: 'timber' },
        { x: 7, z: 6, type: 'timber' },
        // Stone nodes kept clear of the Mine portal at (-10,-10)
        { x: -16, z: -9, type: 'stone' },
        { x: -9, z: -16, type: 'stone' },
        { x: 3, z: 8, type: 'fiber' },
        { x: -3, z: 10, type: 'fiber' },
        { x: 14, z: -4, type: 'fiber' },  // was (9,-6) — moved away from spaceship portal
      ];
      case 'mine': return [];
      case 'verdantMaw': return [
        { x: 3, z: 4, type: 'timber' },
        { x: -5, z: 6, type: 'timber' },
        { x: 7, z: -3, type: 'fiber' },
        { x: -8, z: 3, type: 'fiber' },
        { x: 4, z: -7, type: 'resin',  requiredTool: 'harvestBlade' },
        { x: -4, z: -5, type: 'silica', requiredTool: 'harvestBlade' },
        { x: 9, z: 6, type: 'quartz',  requiredTool: 'harvestBlade' },
        { x: -10, z: -6, type: 'carbon_biomass', requiredTool: 'harvestBlade' },
        { x: 11, z: -4, type: 'carbon_biomass',  requiredTool: 'harvestBlade' },
      ];
      case 'lagoonCoast': return [
        { x: 5, z: 5, type: 'silica', requiredTool: 'diveTool' },
        { x: -6, z: 4, type: 'silica', requiredTool: 'diveTool' },
        { x: 3, z: -6, type: 'copper' },
        { x: -5, z: -3, type: 'quartz', requiredTool: 'diveTool' },
        { x: 8, z: -2, type: 'iron' },
        { x: -9, z: -5, type: 'silica_sand' },
        { x: 10, z: 7, type: 'silica_sand' },
      ];
      case 'frozenTundra': return [
        { x: 4, z: 3, type: 'titanium', requiredTool: 'cryoPick' },
        { x: -5, z: 5, type: 'titanium', requiredTool: 'cryoPick' },
        { x: 7, z: -4, type: 'tungsten', requiredTool: 'cryoPick' },
        { x: -8, z: -3, type: 'tungsten', requiredTool: 'cryoPick' },
        { x: 2, z: -7, type: 'silver' },
        { x: -3, z: 7, type: 'silver' },
        { x: 9, z: 5, type: 'iron' },
        { x: -6, z: -6, type: 'quartz' },
      ];
      case 'spaceship': return []; // no gatherables inside the ship
      case 'workspace': return []; // no gatherables in the workspace
      case 'depths': return [];   // pure mining zone — no resource nodes
      default: return [];
    }
  }

  // ── Enemy spawn positions per zone (with archetype for variety) ───────────
  getEnemySpawns() {
    switch (this.currentZone) {
      // T1 — Rushers only (safe starter zone)
      case 'landingSite': return [
        { x: 14, z: 10,  archetype: 'rusher' },
        { x: -12, z: 16, archetype: 'rusher' },
      ];
      // T2 — 2 Rushers + 1 Swinger
      case 'mine': return [
        { x: 8,  z: 8,  archetype: 'rusher' },
        { x: -8, z: 6,  archetype: 'rusher' },
        { x: 6,  z: -8, archetype: 'swinger' },
      ];
      // T3 — 2 Rushers + 1 Swinger + 1 Burst
      case 'verdantMaw': return [
        { x: 10,  z: 8,  archetype: 'rusher' },
        { x: -8,  z: 10, archetype: 'rusher' },
        { x: 12,  z: -6, archetype: 'swinger' },
        { x: -10, z: -8, archetype: 'burst' },
      ];
      // T4 — 1 Swinger + 2 Burst (synergy pressure)
      case 'lagoonCoast': return [
        { x: 12, z: 6,  archetype: 'swinger' },
        { x: -10, z: 8, archetype: 'burst' },
        { x: 8, z: -10, archetype: 'burst' },
      ];
      // T5 — 2 Swingers + 2 Bursts
      case 'frozenTundra': return [
        { x: 10, z: 6,  archetype: 'swinger' },
        { x: -10, z: 6, archetype: 'burst' },
        { x: 8, z: -10, archetype: 'burst' },
        { x: -8, z: -8, archetype: 'swinger' },
      ];
      case 'spaceship': return []; // no enemies in the ship
      case 'workspace': return []; // no enemies in the workspace
      case 'depths': return [
        { x: 5,  z: 3,  archetype: 'swinger' },
        { x: -5, z: 3,  archetype: 'swinger' },
        { x: 0,  z: -6, archetype: 'burst'   },
      ];
      default: return [];
    }
  }

  // ── Landing Site ─────────────── see js/scene/zones/LandingSite.js ──────────

  _addGround(color) {
    const geo = new THREE.PlaneGeometry(CONFIG.GROUND_SIZE, CONFIG.GROUND_SIZE);
    const mat = createToonMaterial(color);
    const ground = new THREE.Mesh(geo, mat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.group.add(ground);

    // Subtle grid overlay so players can read distances and plan movement
    const grid = new THREE.GridHelper(CONFIG.GROUND_SIZE, CONFIG.GROUND_SIZE / 2, 0x000000, 0x000000);
    // Offset grid by 1 unit so grid lines sit at odd coords (±1, ±3, …)
    // and 2×2 track tiles centred on even coords fill cells exactly.
    grid.position.set(1, 0.01, 1);
    const mats = Array.isArray(grid.material) ? grid.material : [grid.material];
    mats.forEach(m => { m.transparent = true; m.opacity = 0.08; });
    grid.visible = false;
    this.group.add(grid);
    this._grids.push(grid);
  }

  // Returns true if (x,z) is too close to any already-placed tree
  _tooCloseToTree(x, z, minSpacing = 1.3) {
    return this._treePlacedPositions.some(p => Math.hypot(x - p.x, z - p.z) < minSpacing);
  }

  _addTree(x, z, rng) {
    const rand = rng || Math.random;
    this._treePlacedPositions.push({ x, z });
    const treeGroup = new THREE.Group();
    const h = 1.4 + rand() * 0.8;
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.22, h, 6);
    const trunkMat = createToonMaterial(0x6b4226);
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = h / 2;
    trunk.castShadow = true;
    treeGroup.add(trunk);

    const crownColors = [0x2d6a2d, 0x3a8c3a, 0x245224];
    const crownColor = crownColors[Math.floor(rand() * crownColors.length)];
    const crownMat = createToonMaterial(crownColor);
    const crownH = 1.8 + rand() * 0.6;
    const crown1Geo = new THREE.ConeGeometry(0.9, crownH, 7);
    const crown1 = new THREE.Mesh(crown1Geo, crownMat);
    crown1.position.y = h + crownH * 0.4;
    crown1.castShadow = true;
    treeGroup.add(crown1);

    const crown2Geo = new THREE.ConeGeometry(0.65, crownH * 0.7, 7);
    const crown2 = new THREE.Mesh(crown2Geo, crownMat);
    crown2.position.y = h + crownH * 0.85;
    treeGroup.add(crown2);

    treeGroup.position.set(x, 0, z);
    treeGroup.rotation.y = rand() * Math.PI * 2;
    addOutlineToGroup(treeGroup, 0.035);
    this.group.add(treeGroup);
    const collision = { x, z, r: 0.55 };
    this._collisionCircles.push(collision);
    this._trees.push({ group: treeGroup, x, z, alive: true, collision, _harvestReady: true, _harvestTimer: 0 });
  }

  _addSignpost(x, z, rotY, label) {
    const group = new THREE.Group();
    
    // Post
    const postGeo = new THREE.CylinderGeometry(0.08, 0.08, 1.2, 6);
    const postMat = createToonMaterial(0x5a4a3a);
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.y = 0.6;
    group.add(post);

    // Board
    const boardGeo = new THREE.BoxGeometry(0.8, 0.4, 0.1);
    const boardMat = createToonMaterial(0x6b5a4a);
    const board = new THREE.Mesh(boardGeo, boardMat);
    board.position.y = 1.0;
    group.add(board);

    group.position.set(x, 0, z);
    group.rotation.y = rotY;
    addOutlineToGroup(group, 0.03);
    this.group.add(group);
  }

  _addPortal(x, z, targetZone, ppRequired, label) {
    const group = new THREE.Group();

    // Glowing ring — color set dynamically via refreshPortalAccess()
    const ringGeo = new THREE.TorusGeometry(1.2, 0.15, 8, 16);
    const ringMat = createToonMaterial(0xff8800);
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 1.5;
    group.add(ring);

    // Inner glow
    const innerGeo = new THREE.CircleGeometry(1.0, 16);
    const innerMat = new THREE.MeshBasicMaterial({
      color: 0x332200,
      transparent: true,
      opacity: 0.6,
    });
    const inner = new THREE.Mesh(innerGeo, innerMat);
    inner.rotation.x = Math.PI / 2;
    inner.position.y = 1.5;
    group.add(inner);

    // Base pillar
    const pillarGeo = new THREE.CylinderGeometry(0.2, 0.3, 0.5, 8);
    const pillarMat = createToonMaterial(0x556666);
    const pillar = new THREE.Mesh(pillarGeo, pillarMat);
    pillar.position.y = 0.25;
    group.add(pillar);

    group.position.set(x, 0, z);
    addOutlineToGroup(group, 0.04);
    this.group.add(group);

    // Block player from walking into the portal hole
    this._collisionCircles.push({ x, z, r: 0.9 });

    this._zonePortals.push({
      position: new THREE.Vector3(x, 0, z),
      targetZone,
      ppRequired,
      label,
      mesh: group,
      ringMat,
      innerMat,
    });
  }

  /**
   * Update each portal's ring color based on whether it's currently accessible.
   * isAccessibleFn(portal) → boolean. Free portals (ppRequired===0) are always green.
   */
  refreshPortalAccess(isAccessibleFn) {
    for (const portal of this._zonePortals) {
      const accessible = portal.ppRequired === 0 || isAccessibleFn(portal);
      if (portal.ringMat) portal.ringMat.color.setHex(accessible ? 0x00ffcc : 0xff8800);
      if (portal.innerMat) portal.innerMat.color.setHex(accessible ? 0x004433 : 0x332200);
    }
  }

  // ── Crack overlay helper ───────────────────────────────────────────────────
  // Returns { crack1, crack2 } Groups added as children of mesh.
  // crack1 = horizontal crack (stage 1), crack2 = vertical crack (stage 2).
  _makeCrackStages(mesh, bw, bh, bd) {
    const mat = new THREE.MeshBasicMaterial({ color: 0x080808 });
    const T = 0.07; // crack thickness

    const crack1 = new THREE.Group();
    const y1 = bh * 0.12;
    for (const [zs, xs] of [[0,1],[0,-1],[1,0],[-1,0]]) {
      const isZ = zs !== 0;
      const g = isZ
        ? new THREE.BoxGeometry(bw * 0.85, T, T)
        : new THREE.BoxGeometry(T, T, bd * 0.85);
      const m = new THREE.Mesh(g, mat);
      m.position.set(xs * (bw / 2 + 0.02), y1, zs * (bd / 2 + 0.02));
      crack1.add(m);
    }
    crack1.visible = false;
    mesh.add(crack1);

    const crack2 = new THREE.Group();
    const y2 = -bh * 0.1;
    const xOff = bw * 0.18;
    for (const [zs, xs] of [[0,1],[0,-1],[1,0],[-1,0]]) {
      const isZ = zs !== 0;
      const g = isZ
        ? new THREE.BoxGeometry(T, bh * 0.65, T)
        : new THREE.BoxGeometry(T, bh * 0.65, T);
      const m = new THREE.Mesh(g, mat);
      m.position.set(
        isZ ? xOff : xs * (bw / 2 + 0.02),
        y2,
        isZ ? zs * (bd / 2 + 0.02) : xOff
      );
      crack2.add(m);
    }
    crack2.visible = false;
    mesh.add(crack2);

    return { crack1, crack2 };
  }

  // ── Mine, Depths, Verdant Maw, Lagoon Coast, Frozen Tundra, Spaceship, Workspace
  // (all built by their respective files in js/scene/zones/)

  _addWorkshopStation(x, z) {
    const g = new THREE.Group();
    const baseGeo = new THREE.CylinderGeometry(0.85, 0.95, 0.18, 8);
    const baseMat = createToonMaterial(0x2a1800);
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.09;
    base.castShadow = true;
    g.add(base);

    const bodyGeo = new THREE.BoxGeometry(1.3, 1.1, 0.7);
    const bodyMat = createToonMaterial(0x221400);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.65;
    body.castShadow = true;
    addOutline(body, 0.05);
    g.add(body);

    const screenGeo = new THREE.PlaneGeometry(1.0, 0.65);
    const screenMat = new THREE.MeshBasicMaterial({ color: 0x3a1400 });
    const screen = new THREE.Mesh(screenGeo, screenMat);
    screen.position.set(0, 0.75, 0.36);
    g.add(screen);

    const topGeo = new THREE.BoxGeometry(1.1, 0.07, 0.5);
    const topMat = createToonMaterial(0xff6622);
    const top = new THREE.Mesh(topGeo, topMat);
    top.position.y = 1.27;
    g.add(top);

    const indGeo = new THREE.OctahedronGeometry(0.14, 0);
    const indMat = createToonMaterial(0xff6622);
    const ind = new THREE.Mesh(indGeo, indMat);
    ind.position.y = 1.9;
    g.add(ind);

    g.position.set(x, 0, z);
    this.group.add(g);
    this._collisionCircles.push({ x, z, r: 1.0 });
    this._workshopStationPos = { x, z };
  }

  _addConstructorStation(x, z) {
    const g = new THREE.Group();
    const baseGeo = new THREE.CylinderGeometry(0.85, 0.95, 0.18, 8);
    const baseMat = createToonMaterial(0x002a1a);
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.09;
    base.castShadow = true;
    g.add(base);

    const bodyGeo = new THREE.BoxGeometry(1.3, 1.1, 0.7);
    const bodyMat = createToonMaterial(0x001a14);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.65;
    body.castShadow = true;
    addOutline(body, 0.05);
    g.add(body);

    const screenGeo = new THREE.PlaneGeometry(1.0, 0.65);
    const screenMat = new THREE.MeshBasicMaterial({ color: 0x003322 });
    const screen = new THREE.Mesh(screenGeo, screenMat);
    screen.position.set(0, 0.75, 0.36);
    g.add(screen);

    const topGeo = new THREE.BoxGeometry(1.1, 0.07, 0.5);
    const topMat = createToonMaterial(0x00cc88);
    const top = new THREE.Mesh(topGeo, topMat);
    top.position.y = 1.27;
    g.add(top);

    const ringGeo = new THREE.TorusGeometry(0.3, 0.05, 8, 16);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00cc88 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.75;
    g.add(ring);

    const indGeo = new THREE.OctahedronGeometry(0.14, 0);
    const indMat = createToonMaterial(0x00cc88);
    const ind = new THREE.Mesh(indGeo, indMat);
    ind.position.y = 1.9;
    g.add(ind);

    g.position.set(x, 0, z);
    this.group.add(g);
    this._collisionCircles.push({ x, z, r: 1.0 });
    this._constructorStationPos = { x, z };
  }

  _addRefineryStation(x, z) {
    const g = new THREE.Group();
    const baseGeo = new THREE.CylinderGeometry(1.0, 1.1, 0.18, 8);
    const baseMat = createToonMaterial(0x0a2218);
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.09;
    base.castShadow = true;
    g.add(base);

    const bodyGeo = new THREE.BoxGeometry(1.5, 1.1, 0.9);
    const bodyMat = createToonMaterial(0x0a2a1c);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.65;
    body.castShadow = true;
    addOutline(body, 0.05);
    g.add(body);

    // Twin refinery stacks
    for (const sx of [-0.45, 0.45]) {
      const stackGeo = new THREE.CylinderGeometry(0.18, 0.22, 1.0, 8);
      const stackMat = createToonMaterial(0x115533);
      const stack = new THREE.Mesh(stackGeo, stackMat);
      stack.position.set(sx, 1.6, -0.1);
      addOutline(stack, 0.04);
      g.add(stack);
    }

    const indGeo = new THREE.OctahedronGeometry(0.16, 0);
    const indMat = createToonMaterial(0x33dd88);
    const ind = new THREE.Mesh(indGeo, indMat);
    ind.position.y = 2.3;
    g.add(ind);

    g.position.set(x, 0, z);
    this.group.add(g);
    this._collisionCircles.push({ x, z, r: 1.0 });
    this._refineryStationPos = { x, z };
  }

  _addExtractorStation(x, z) {
    const g = new THREE.Group();
    const baseGeo = new THREE.CylinderGeometry(0.95, 1.05, 0.18, 8);
    const baseMat = createToonMaterial(0x1a0a2a);
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.09;
    base.castShadow = true;
    g.add(base);

    const bodyGeo = new THREE.BoxGeometry(1.4, 1.2, 0.8);
    const bodyMat = createToonMaterial(0x150a22);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.7;
    body.castShadow = true;
    addOutline(body, 0.05);
    g.add(body);

    const screenGeo = new THREE.PlaneGeometry(1.05, 0.7);
    const screenMat = new THREE.MeshBasicMaterial({ color: 0x2a0044 });
    const screen = new THREE.Mesh(screenGeo, screenMat);
    screen.position.set(0, 0.8, 0.41);
    g.add(screen);

    const topGeo = new THREE.BoxGeometry(1.2, 0.08, 0.6);
    const topMat = createToonMaterial(0xcc44ff);
    const top = new THREE.Mesh(topGeo, topMat);
    top.position.y = 1.34;
    g.add(top);

    // Twin spires
    for (const sx of [-0.5, 0.5]) {
      const spireGeo = new THREE.CylinderGeometry(0.06, 0.1, 0.7, 6);
      const spireMat = createToonMaterial(0x553377);
      const spire = new THREE.Mesh(spireGeo, spireMat);
      spire.position.set(sx, 1.7, 0);
      g.add(spire);
    }

    const indGeo = new THREE.OctahedronGeometry(0.15, 0);
    const indMat = createToonMaterial(0xcc44ff);
    const ind = new THREE.Mesh(indGeo, indMat);
    ind.position.y = 2.2;
    g.add(ind);

    g.position.set(x, 0, z);
    this.group.add(g);
    this._collisionCircles.push({ x, z, r: 1.0 });
    this._extractorStationPos = { x, z };
  }

  _addAssemblyMatrixStation(x, z) {
    const g = new THREE.Group();
    const baseGeo = new THREE.CylinderGeometry(0.9, 1.0, 0.18, 8);
    const baseMat = createToonMaterial(0x002233);
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.09;
    base.castShadow = true;
    g.add(base);

    const bodyGeo = new THREE.BoxGeometry(1.4, 0.8, 1.4);
    const bodyMat = createToonMaterial(0x001a28);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.55;
    body.castShadow = true;
    addOutline(body, 0.05);
    g.add(body);

    // 5x5 grid of small cyan tiles on top to suggest a matrix bench
    const tileMat = createToonMaterial(0x00aacc);
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        const tileGeo = new THREE.BoxGeometry(0.18, 0.04, 0.18);
        const tile = new THREE.Mesh(tileGeo, tileMat);
        tile.position.set(-0.5 + c * 0.25, 0.97, -0.5 + r * 0.25);
        g.add(tile);
      }
    }

    const indGeo = new THREE.OctahedronGeometry(0.14, 0);
    const indMat = createToonMaterial(0x00ddff);
    const ind = new THREE.Mesh(indGeo, indMat);
    ind.position.y = 1.7;
    g.add(ind);

    g.position.set(x, 0, z);
    this.group.add(g);
    this._collisionCircles.push({ x, z, r: 1.0 });
    this._assemblyMatrixStationPos = { x, z };
  }

  // Partition wall + accent strip that visually carves an Offload Chamber out of the ship's back.
  _buildOffloadChamberPartition() {
    const PZ = -7.5;       // partition z-line
    const GAP_HALF = 1.0;  // 2-unit doorway centered on x=0
    const HEIGHT = 2.2;
    const THICK = 0.25;

    // Two wall segments flanking the doorway
    const segs = [
      { from: -10.5, to: -GAP_HALF },
      { from: GAP_HALF, to: 10.5 },
    ];
    for (const s of segs) {
      const len = s.to - s.from;
      const cx = (s.from + s.to) / 2;
      const wallGeo = new THREE.BoxGeometry(len, HEIGHT, THICK);
      const wallMat = createToonMaterial(0x162028);
      const wall = new THREE.Mesh(wallGeo, wallMat);
      wall.position.set(cx, HEIGHT / 2, PZ);
      wall.castShadow = true;
      addOutline(wall, 0.04);
      this.group.add(wall);

      // Collision circles along the segment
      for (let x = s.from + 0.5; x <= s.to - 0.5; x += 1.5) {
        this._collisionCircles.push({ x, z: PZ, r: 0.9 });
      }
    }

    // Cyan accent strip along the partition base, with the doorway gap
    const accentMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc });
    for (const s of segs) {
      const len = s.to - s.from;
      const cx = (s.from + s.to) / 2;
      const stripGeo = new THREE.PlaneGeometry(len, 0.12);
      const strip = new THREE.Mesh(stripGeo, accentMat);
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(cx, 0.02, PZ);
      this.group.add(strip);
    }

    // Doorway frame (thin verticals on either side of the gap)
    for (const fx of [-GAP_HALF, GAP_HALF]) {
      const frameGeo = new THREE.BoxGeometry(0.12, HEIGHT, 0.4);
      const frameMat = createToonMaterial(0x00aa88);
      const frame = new THREE.Mesh(frameGeo, frameMat);
      frame.position.set(fx, HEIGHT / 2, PZ);
      this.group.add(frame);
    }
  }

  _addOffloadStation(x, z) {
    const g = new THREE.Group();

    // Main console body
    const bodyGeo = new THREE.BoxGeometry(1.4, 1.2, 0.8);
    const bodyMat = createToonMaterial(0x223344);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.6;
    body.castShadow = true;
    addOutline(body, 0.05);
    g.add(body);

    // Glowing top panel
    const topGeo = new THREE.BoxGeometry(1.2, 0.08, 0.6);
    const topMat = createToonMaterial(0x00ffcc);
    const top = new THREE.Mesh(topGeo, topMat);
    top.position.y = 1.24;
    g.add(top);

    // Screen
    const screenGeo = new THREE.PlaneGeometry(0.9, 0.6);
    const screenMat = new THREE.MeshBasicMaterial({ color: 0x004433 });
    const screen = new THREE.Mesh(screenGeo, screenMat);
    screen.position.set(0, 0.85, 0.41);
    g.add(screen);

    // Label above
    const labelGeo = new THREE.BoxGeometry(1.2, 0.25, 0.05);
    const labelMat = createToonMaterial(0x005544);
    const label = new THREE.Mesh(labelGeo, labelMat);
    label.position.set(0, 1.6, 0.3);
    g.add(label);

    // Floating indicator
    const indGeo = new THREE.OctahedronGeometry(0.12, 0);
    const indMat = createToonMaterial(0x00ffcc);
    const ind = new THREE.Mesh(indGeo, indMat);
    ind.position.y = 2.0;
    g.add(ind);

    g.position.set(x, 0, z);
    this.group.add(g);
    this._collisionCircles.push({ x, z, r: 1.0 });

    // Register as interactable station
    this._offloadStationPos = { x, z };
  }

  _addFabricator(x, z) {
    const g = new THREE.Group();

    // Base platform
    const baseGeo = new THREE.CylinderGeometry(0.9, 1.0, 0.2, 10);
    const baseMat = createToonMaterial(0x334455);
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.1;
    base.castShadow = true;
    g.add(base);

    // Main body — wider workbench shape
    const bodyGeo = new THREE.BoxGeometry(1.6, 1.0, 1.0);
    const bodyMat = createToonMaterial(0x334455);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.7;
    body.castShadow = true;
    addOutline(body, 0.05);
    g.add(body);

    // Glowing work surface
    const surfaceGeo = new THREE.BoxGeometry(1.4, 0.06, 0.8);
    const surfaceMat = createToonMaterial(0x4488ff);
    const surface = new THREE.Mesh(surfaceGeo, surfaceMat);
    surface.position.y = 1.23;
    g.add(surface);

    // Arm / crane element
    const armGeo = new THREE.CylinderGeometry(0.05, 0.05, 1.5, 6);
    const armMat = createToonMaterial(0x445566);
    const arm = new THREE.Mesh(armGeo, armMat);
    arm.position.set(0.5, 1.95, 0);
    arm.rotation.z = Math.PI / 8;
    g.add(arm);

    // End effector glow
    const effGeo = new THREE.SphereGeometry(0.12, 6, 4);
    const effMat = createToonMaterial(0x4488ff);
    const eff = new THREE.Mesh(effGeo, effMat);
    eff.position.set(0.9, 2.5, 0);
    g.add(eff);

    // Label indicator
    const indGeo = new THREE.OctahedronGeometry(0.12, 0);
    const indMat = createToonMaterial(0x4488ff);
    const ind = new THREE.Mesh(indGeo, indMat);
    ind.position.y = 2.8;
    g.add(ind);

    g.position.set(x, 0, z);
    this.group.add(g);
    this._collisionCircles.push({ x, z, r: 1.0 });

    // Register as interactable fabricator
    this._fabricatorPos = { x, z };
  }

  _addDroneMonitor(x, z) {
    const g = new THREE.Group();

    const bodyGeo = new THREE.BoxGeometry(1.2, 1.0, 0.7);
    const bodyMat = createToonMaterial(0x1a2a1a);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.6;
    body.castShadow = true;
    addOutline(body, 0.05);
    g.add(body);

    const screenGeo = new THREE.PlaneGeometry(0.8, 0.5);
    const screenMat = new THREE.MeshBasicMaterial({ color: 0x003322 });
    const screen = new THREE.Mesh(screenGeo, screenMat);
    screen.position.set(0, 0.7, 0.36);
    g.add(screen);

    const topGeo = new THREE.BoxGeometry(1.0, 0.06, 0.5);
    const topMat = createToonMaterial(0x00cc88);
    const top = new THREE.Mesh(topGeo, topMat);
    top.position.y = 1.13;
    g.add(top);

    const standGeo = new THREE.CylinderGeometry(0.12, 0.18, 0.5, 6);
    const standMat = createToonMaterial(0x223322);
    const stand = new THREE.Mesh(standGeo, standMat);
    stand.position.y = 0.25;
    g.add(stand);

    const indGeo = new THREE.OctahedronGeometry(0.11, 0);
    const indMat = createToonMaterial(0x00cc88);
    const ind = new THREE.Mesh(indGeo, indMat);
    ind.position.y = 1.7;
    g.add(ind);

    g.position.set(x, 0, z);
    this.group.add(g);
    this._collisionCircles.push({ x, z, r: 1.0 });
    this._droneMonitorPos = { x, z };
  }

  _addAscensionTerminal(x, z) {
    const g = new THREE.Group();

    const baseGeo = new THREE.CylinderGeometry(0.6, 0.7, 0.15, 8);
    const baseMat = createToonMaterial(0x1a0a2a);
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.075;
    base.castShadow = true;
    g.add(base);

    const bodyGeo = new THREE.BoxGeometry(1.1, 1.1, 0.6);
    const bodyMat = createToonMaterial(0x1a0a2a);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.65;
    body.castShadow = true;
    addOutline(body, 0.05);
    g.add(body);

    const screenGeo = new THREE.PlaneGeometry(0.8, 0.6);
    const screenMat = new THREE.MeshBasicMaterial({ color: 0x1a003a });
    const screen = new THREE.Mesh(screenGeo, screenMat);
    screen.position.set(0, 0.72, 0.31);
    g.add(screen);

    const topGeo = new THREE.BoxGeometry(0.9, 0.06, 0.45);
    const topMat = createToonMaterial(0xcc88ff);
    const top = new THREE.Mesh(topGeo, topMat);
    top.position.y = 1.23;
    g.add(top);

    const ringGeo = new THREE.TorusGeometry(0.35, 0.04, 8, 20);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xcc88ff });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.8;
    g.add(ring);

    const indGeo = new THREE.OctahedronGeometry(0.13, 0);
    const indMat = createToonMaterial(0xcc88ff);
    const ind = new THREE.Mesh(indGeo, indMat);
    ind.position.y = 1.85;
    g.add(ind);

    g.position.set(x, 0, z);
    this.group.add(g);
    this._collisionCircles.push({ x, z, r: 1.0 });
    this._ascensionTerminalPos = { x, z };
  }

  _addMasteryTerminal(x, z) {
    const g = new THREE.Group();

    const baseGeo = new THREE.CylinderGeometry(0.7, 0.8, 0.2, 8);
    const baseMat = createToonMaterial(0x2a1a0a);
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.1;
    base.castShadow = true;
    g.add(base);

    const bodyGeo = new THREE.BoxGeometry(1.2, 1.2, 0.7);
    const bodyMat = createToonMaterial(0x2a1a0a);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.7;
    body.castShadow = true;
    addOutline(body, 0.05);
    g.add(body);

    const screenGeo = new THREE.PlaneGeometry(0.9, 0.7);
    const screenMat = new THREE.MeshBasicMaterial({ color: 0x3a1a00 });
    const screen = new THREE.Mesh(screenGeo, screenMat);
    screen.position.set(0, 0.8, 0.36);
    g.add(screen);

    const topGeo = new THREE.BoxGeometry(1.0, 0.08, 0.5);
    const topMat = createToonMaterial(0xffaa44);
    const top = new THREE.Mesh(topGeo, topMat);
    top.position.y = 1.34;
    g.add(top);

    const ringGeo = new THREE.TorusGeometry(0.4, 0.05, 8, 20);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffaa44 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.9;
    g.add(ring);

    const indGeo = new THREE.OctahedronGeometry(0.15, 0);
    const indMat = createToonMaterial(0xffaa44);
    const ind = new THREE.Mesh(indGeo, indMat);
    ind.position.y = 2.0;
    g.add(ind);

    g.position.set(x, 0, z);
    this.group.add(g);
    this._collisionCircles.push({ x, z, r: 1.0 });
    this._masteryTerminalPos = { x, z };
  }

  _addChargingStation(x, z) {
    const g = new THREE.Group();

    // Base platform
    const baseGeo = new THREE.CylinderGeometry(0.8, 0.9, 0.15, 10);
    const baseMat = createToonMaterial(0x223344);
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.075;
    base.castShadow = true;
    g.add(base);

    // Main pod body
    const bodyGeo = new THREE.CylinderGeometry(0.55, 0.65, 1.4, 10);
    const bodyMat = createToonMaterial(0x2a3a4a);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.85;
    body.castShadow = true;
    addOutline(body, 0.05);
    g.add(body);

    // Energy ring (green glow)
    const ringGeo = new THREE.TorusGeometry(0.6, 0.06, 8, 20);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x44ff88 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 1.1;
    g.add(ring);

    // Top dome
    const domeGeo = new THREE.SphereGeometry(0.45, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const domeMat = createToonMaterial(0x44ff88);
    const dome = new THREE.Mesh(domeGeo, domeMat);
    dome.position.y = 1.55;
    g.add(dome);

    // Floating energy indicator
    const indGeo = new THREE.OctahedronGeometry(0.14, 0);
    const indMat = createToonMaterial(0x44ff88);
    const ind = new THREE.Mesh(indGeo, indMat);
    ind.position.y = 2.2;
    g.add(ind);

    g.position.set(x, 0, z);
    this.group.add(g);
    this._collisionCircles.push({ x, z, r: 1.0 });

    this._chargingStationPos = { x, z };
  }

  _addCraftTerminal(x, z) {
    const g = new THREE.Group();

    const baseGeo = new THREE.CylinderGeometry(0.75, 0.85, 0.18, 8);
    const baseMat = createToonMaterial(0x2a1800);
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.09;
    base.castShadow = true;
    g.add(base);

    const bodyGeo = new THREE.BoxGeometry(1.3, 1.1, 0.65);
    const bodyMat = createToonMaterial(0x221400);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.64;
    body.castShadow = true;
    addOutline(body, 0.05);
    g.add(body);

    // Main screen
    const screenGeo = new THREE.PlaneGeometry(1.0, 0.65);
    const screenMat = new THREE.MeshBasicMaterial({ color: 0x3a1400 });
    const screen = new THREE.Mesh(screenGeo, screenMat);
    screen.position.set(0, 0.75, 0.33);
    g.add(screen);

    // Orange accent strip on top
    const topGeo = new THREE.BoxGeometry(1.1, 0.07, 0.48);
    const topMat = createToonMaterial(0xff6622);
    const top = new THREE.Mesh(topGeo, topMat);
    top.position.y = 1.26;
    g.add(top);

    // Side panel — industrial look
    const sideGeo = new THREE.BoxGeometry(0.18, 0.7, 0.55);
    const sideMat = createToonMaterial(0x331a00);
    const side = new THREE.Mesh(sideGeo, sideMat);
    side.position.set(0.74, 0.64, 0);
    addOutline(side, 0.03);
    g.add(side);

    // Gear-like ring
    const ringGeo = new THREE.TorusGeometry(0.3, 0.05, 8, 16);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xff6622 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.72;
    g.add(ring);

    const indGeo = new THREE.OctahedronGeometry(0.14, 0);
    const indMat = createToonMaterial(0xff6622);
    const ind = new THREE.Mesh(indGeo, indMat);
    ind.position.y = 1.9;
    g.add(ind);

    g.position.set(x, 0, z);
    this.group.add(g);
    this._collisionCircles.push({ x, z, r: 1.0 });
    this._craftTerminalPos = { x, z };
  }

  updateConstructCursor(x, z, addMode, delta) {
    this._cursorGroup.visible = true;
    this._cursorGroup.position.set(x, 0, z);
    const color = addMode ? 0x00ffcc : 0xff4422;
    this._cursorTileMat.color.setHex(color);
    this._cursorEdgeMat.color.setHex(color);
    this._cursorPulseT = (this._cursorPulseT + delta * 3.0) % (Math.PI * 2);
    this._cursorTileMat.opacity = 0.28 + 0.22 * Math.sin(this._cursorPulseT);
  }

  hideConstructCursor() {
    this._cursorGroup.visible = false;
  }

  getOffloadStationPos() { return this._offloadStationPos || null; }
  getFabricatorPos() { return this._fabricatorPos || null; }
  getChargingStationPos() { return this._chargingStationPos || null; }
  getCraftTerminalPos() { return this._craftTerminalPos || null; }
  getDroneMonitorPos() { return this._droneMonitorPos || null; }
  getAscensionTerminalPos() { return this._ascensionTerminalPos || null; }
  getMasteryTerminalPos() { return this._masteryTerminalPos || null; }
  getWorkshopStationPos() { return this._workshopStationPos || null; }
  getConstructorStationPos() { return this._constructorStationPos || null; }
  getExtractorStationPos() { return this._extractorStationPos || null; }
  getAssemblyMatrixStationPos() { return this._assemblyMatrixStationPos || null; }
  getRefineryStationPos() { return this._refineryStationPos || null; }
  getDrillPos() { return this._drillPos || null; }

  /**
   * Tall glowing cyan beacon placed above the return portal so mobile players
   * can spot it from the spawn point at (0, 0).
   */
  _addReturnBeacon(x, z) {
    const group = new THREE.Group();

    // Tall thin pillar
    const pillarGeo = new THREE.CylinderGeometry(0.12, 0.18, 5, 8);
    const pillarMat = createToonMaterial(0x00ffcc);
    const pillar = new THREE.Mesh(pillarGeo, pillarMat);
    pillar.position.y = 2.5 + 1.5; // sit above portal ring (which is at y=1.5)
    group.add(pillar);
    addOutline(pillar, 0.04);

    // Arrowhead cone pointing upward
    const arrowGeo = new THREE.ConeGeometry(0.35, 0.7, 8);
    const arrowMat = createToonMaterial(0x00ffcc);
    const arrow = new THREE.Mesh(arrowGeo, arrowMat);
    arrow.position.y = 2.5 + 1.5 + 2.5 + 0.35; // on top of pillar
    group.add(arrow);
    addOutline(arrow, 0.04);

    // Floor ring to draw attention
    const ringGeo = new THREE.TorusGeometry(1.6, 0.1, 6, 20);
    const ringMat = createToonMaterial(0x00ffcc);
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.12;
    group.add(ring);

    group.position.set(x, 0, z);
    this.group.add(group);
  }
}
