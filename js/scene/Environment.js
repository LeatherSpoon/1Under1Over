import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createToonMaterial, addOutline, addOutlineToGroup } from './ToonMaterials.js';
import { CONFIG } from '../config.js';
import { ZONE_ASSETS } from './ZoneAssets.js';
import {
  buildLandingSite, buildMine,         buildDepths,    buildVerdantMaw,
  buildLagoonCoast, buildFrozenTundra, buildSpaceship, buildWorkspace,
  buildGlacialHollow,
  buildHomeSylva, buildHomeBram, buildHomeSprig,
} from './zones/index.js';
import { mineWorldToCell, mineCellToWorld, isMineFloorCell } from './zones/Mine/layout.js';
import { cloneSkinned } from '../entities/Enemy.js';

// Shared GLB model cache — loads each model once then reuses cloned scenes.
// The cached promise also caches failures for the lifetime of the page (no
// retry loops), but deliberately NOT across reloads: a transient failure
// (server not up yet, file mid-write) must self-heal on the next refresh.
// A sessionStorage failure cache here once made portals invisible forever in
// a tab after one hiccup — don't reintroduce one.
const _modelCache = {};
const _loader = new GLTFLoader();
function loadModel(path) {
  if (!_modelCache[path]) {
    _modelCache[path] = new Promise((resolve, reject) => {
      _loader.load(path, gltf => {
        // Keep animation clips reachable for rigged NPCs — resolving with just
        // gltf.scene would otherwise drop gltf.animations on the floor.
        gltf.scene.userData._clips = gltf.animations;
        resolve(gltf.scene);
      }, undefined, err => {
        console.warn(`[Environment] ${path} failed to load — using fallback (reload retries).`);
        reject(err);
      });
    });
  }
  return _modelCache[path];
}
// Texture-baked GLBs (Rodin exports) arrive as MeshStandardMaterial, which
// picks up specular shine and reads glossy next to the toon-shaded world.
// Re-shade them with the game's toon material, keeping the baked diffuse map
// (same pattern Player.js uses for its rig). Emissive-baked GLBs (black base
// colour + art in the emissive channel) are already flat — leave them alone,
// as are plain-colour materials (hand-built models, portal energy).
const _toonConverted = new WeakMap();
function _toToonMaterial(m) {
  if (!m || m.emissiveMap || !m.map || m.isMeshToonMaterial) return m;
  let t = _toonConverted.get(m);
  if (!t) {
    t = createToonMaterial(0xffffff, { map: m.map });
    _toonConverted.set(m, t);
  }
  return t;
}
function cloneModel(gltfScene, scale = 1) {
  const clone = gltfScene.clone(true);
  clone.scale.setScalar(scale);
  clone.traverse(n => {
    if (n.isMesh) {
      n.castShadow = true;
      n.receiveShadow = true;
      n.material = Array.isArray(n.material) ? n.material.map(_toToonMaterial) : _toToonMaterial(n.material);
    }
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
    this._stationAttaches = []; // { group, modelKey, opts, hasModel } — GLB station bodies
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

    // Continuously rotating meshes (Breach ring, etc.) — { mesh, axis, speed }
    this._spinners = [];

    // Ambient rigged NPCs in the current zone — { group, glbKey, scale, mixer, hasModel }
    this._npcs = [];

    // Growing trees (planted from seeds)
    this._growingTrees = []; // { group, targetScale, currentScale, x, z }

    // Pre-load all GLB models in parallel so they're ready when zones build
    this._modelsReady = Promise.all([
      loadModel('./models/Ghibli_Tree_H.glb').catch(() => null),
      loadModel('./models/Ghibli_Tree_I.glb').catch(() => null),
      loadModel('./models/Ghibli_Tree_J.glb').catch(() => null),
      loadModel('./models/Rock_Cluster.glb').catch(() => null),
      loadModel('./models/Fuel_Barrel.glb').catch(() => null),
      loadModel('./models/Supply_Crate.glb').catch(() => null),
      loadModel('./models/Watchtower.glb').catch(() => null),
      loadModel('./models/Cyborg_PC.glb').catch(() => null),
      loadModel('./models/Scrapper.glb').catch(() => null),
      loadModel('./models/Boulder.glb').catch(() => null),
      loadModel('./models/Blue_Boulder.glb').catch(() => null),
      loadModel('./models/Red_Rock.glb').catch(() => null),
      loadModel('./models/Fire_Plant.glb').catch(() => null),
      loadModel('./models/Portal.glb').catch(() => null),
      loadModel('./models/Landing_Ship.glb').catch(() => null),
      loadModel('./models/Mossy_Boulder.glb').catch(() => null),
      loadModel('./models/Ghibli_Tree_D.glb').catch(() => null),
      loadModel('./models/Ghibli_Tree_H2.glb').catch(() => null),
      loadModel('./models/SpaceshipShell.glb').catch(() => null),
      loadModel('./models/Station_Fabricator.glb').catch(() => null),
      loadModel('./models/Station_Offload.glb').catch(() => null),
      loadModel('./models/Station_Charging.glb').catch(() => null),
      loadModel('./models/Station_DroneMonitor.glb').catch(() => null),
      loadModel('./models/Station_Ascension.glb').catch(() => null),
      loadModel('./models/Station_Mastery.glb').catch(() => null),
      loadModel('./models/Station_CombatRig.glb').catch(() => null),
      loadModel('./models/Station_TrainingConsole.glb').catch(() => null),
      loadModel('./models/Station_HoloPylon.glb').catch(() => null),
      loadModel('./models/Prop_ShipPlant.glb').catch(() => null),
      loadModel('./models/Prop_CrateStack.glb').catch(() => null),
      loadModel('./models/Prop_PipeManifold.glb').catch(() => null),
      loadModel('./models/Tundra_SnowPine.glb').catch(() => null),
      loadModel('./models/Tundra_SnowPineSquat.glb').catch(() => null),
      loadModel('./models/Tundra_DeadTree.glb').catch(() => null),
      loadModel('./models/Tundra_IceCrystal.glb').catch(() => null),
      loadModel('./models/Tundra_SnowBoulder.glb').catch(() => null),
      loadModel('./models/Tundra_FrozenShrine.glb').catch(() => null),
      loadModel('./models/Hollow_CaveMouth.glb').catch(() => null),
      loadModel('./models/Hollow_Stalagmites.glb').catch(() => null),
      loadModel('./models/Hollow_IceCrystal.glb').catch(() => null),
      loadModel('./models/Hollow_FrostShroom.glb').catch(() => null),
      loadModel('./models/Hollow_IceRubble.glb').catch(() => null),
      loadModel('./models/Hollow_MammothSkull.glb').catch(() => null),
      loadModel('./models/Hollow_BoneArch.glb').catch(() => null),
      loadModel('./models/Jungle_CanopyTree.glb').catch(() => null),
      loadModel('./models/Jungle_BanyanTree.glb').catch(() => null),
      loadModel('./models/Jungle_FernCluster.glb').catch(() => null),
      loadModel('./models/Jungle_MawPlant.glb').catch(() => null),
      loadModel('./models/Jungle_MossIdol.glb').catch(() => null),
      loadModel('./models/Jungle_MossBoulder.glb').catch(() => null),
      loadModel('./models/Jungle_GlowShroom.glb').catch(() => null),
      loadModel('./models/Home_Sylva.glb').catch(() => null),
      loadModel('./models/Home_Bram.glb').catch(() => null),
      loadModel('./models/Home_Sprig.glb').catch(() => null),
      loadModel('./models/Npc_Sylva.glb').catch(() => null),
      loadModel('./models/Npc_Bram.glb').catch(() => null),
      loadModel('./models/Npc_Sprig.glb').catch(() => null),
      loadModel('./models/Furn_SylvaCot.glb').catch(() => null),
      loadModel('./models/Furn_SylvaRack.glb').catch(() => null),
      loadModel('./models/Furn_SylvaTable.glb').catch(() => null),
      loadModel('./models/Furn_BramBench.glb').catch(() => null),
      loadModel('./models/Furn_BramBed.glb').catch(() => null),
      loadModel('./models/Furn_BramRack.glb').catch(() => null),
      loadModel('./models/Furn_SprigBench.glb').catch(() => null),
      loadModel('./models/Furn_SprigHammock.glb').catch(() => null),
      loadModel('./models/Furn_SprigPots.glb').catch(() => null),
    ]).then(([treeH, treeI, treeJ, rock, barrel, crate, tower, pc, scrapper, boulder, blueBoulder, redRock, firePlant, portal, ship, mossyBoulder, treeD, treeH2, shipShell, stFabricator, stOffload, stCharging, stDroneMonitor, stAscension, stMastery, stCombatRig, stTrainingConsole, stHoloPylon, shipPlant, crateStack, pipeManifold, snowPine, snowPineSquat, tundraDeadTree, iceCrystal, snowBoulder, frozenShrine, hollowCaveMouth, hollowStalagmites, hollowIceCrystal, hollowFrostShroom, hollowIceRubble, hollowMammothSkull, hollowBoneArch, mawCanopyTree, mawBanyanTree, mawFernCluster, mawPlant, mawMossIdol, mawMossBoulder, mawGlowShroom, homeSylva, homeBram, homeSprig, npcSylva, npcBram, npcSprig, furnSylvaCot, furnSylvaRack, furnSylvaTable, furnBramBench, furnBramBed, furnBramRack, furnSprigBench, furnSprigHammock, furnSprigPots]) => {
      this._glb = { treeH, treeI, treeJ, rock, barrel, crate, tower, pc, scrapper, boulder, blueBoulder, redRock, firePlant, portal, ship, mossyBoulder, treeD, treeH2, shipShell, stFabricator, stOffload, stCharging, stDroneMonitor, stAscension, stMastery, stCombatRig, stTrainingConsole, stHoloPylon, shipPlant, crateStack, pipeManifold, snowPine, snowPineSquat, tundraDeadTree, iceCrystal, snowBoulder, frozenShrine, hollowCaveMouth, hollowStalagmites, hollowIceCrystal, hollowFrostShroom, hollowIceRubble, hollowMammothSkull, hollowBoneArch, mawCanopyTree, mawBanyanTree, mawFernCluster, mawPlant, mawMossIdol, mawMossBoulder, mawGlowShroom, homeSylva, homeBram, homeSprig, npcSylva, npcBram, npcSprig, furnSylvaCot, furnSylvaRack, furnSylvaTable, furnBramBench, furnBramBed, furnBramRack, furnSprigBench, furnSprigHammock, furnSprigPots };
      // Place GLB props for the initial zone (already built procedurally)
      this._placeGLBProps(this.currentZone);
      // Trees built before the GLBs resolved (fresh-load race) get re-skinned
      this._upgradeProceduralTrees();
      // Attach portal models built before the GLB finished loading (first zone)
      for (const p of this._zonePortals) this._attachPortalModel(p);
      // Same late-attach for station bodies built before their GLBs resolved
      for (const s of this._stationAttaches) this._attachStationModel(s);
      // And for NPCs placed by a zone builder before the models resolved
      for (const n of this._npcs) this._attachNpcModel(n);
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
    this._stationAttaches = [];
    this._collisionCircles = [];
    this._collisionBoxes = [];
    this._trees = [];
    this._rocks = [];
    this._mineChunks = null; // Mine-only chunked view — stale after a switch
    this._mineDig = null;
    this._growingTrees = [];
    this._treePlacedPositions = [];
    this._revealMaterials = [];
    this._spinners = [];
    this._npcs = [];
    // Reset per-zone interactable station positions
    this._offloadStationPos = null;
    this._fabricatorPos = null;
    this._chargingStationPos = null;
    this._combatSimPos = null;
    this._craftTerminalPos = null;
    this._droneMonitorPos = null;
    this._ascensionTerminalPos = null;
    this._masteryTerminalPos = null;
    this._workshopStationPos = null;
    this._constructorStationPos = null;
    this._extractorStationPos = null;
    this._assemblyMatrixStationPos = null;
    this._trainingChamber = null;
    this._trainingConsolePos = null;
    this.currentZone = zoneName;

    switch (zoneName) {
      case 'landingSite':  buildLandingSite(this);  break;
      case 'mine':         buildMine(this);         break;
      case 'depths':       buildDepths(this);       break;
      case 'verdantMaw':   buildVerdantMaw(this);   break;
      case 'lagoonCoast':  buildLagoonCoast(this);  break;
      case 'frozenTundra': buildFrozenTundra(this); break;
      case 'glacialHollow': buildGlacialHollow(this); break;
      case 'spaceship':    buildSpaceship(this);    break;
      case 'workspace':    buildWorkspace(this);    break;
      case 'homeSylva':    buildHomeSylva(this);    break;
      case 'homeBram':     buildHomeBram(this);     break;
      case 'homeSprig':    buildHomeSprig(this);    break;
      default: buildLandingSite(this);
    }

    // Place GLB props once models are ready (no-op if still loading)
    if (this._glb) {
      this._placeGLBProps(zoneName);
    }
  }

  // ── Per-frame environment update (growing trees, harvest cooldowns) ────────
  update(delta) {
    for (const s of this._spinners) {
      s.mesh.rotation[s.axis] += s.speed * delta;
    }
    for (const n of this._npcs) {
      if (n.mixer) n.mixer.update(delta);
    }
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
    treeGroup.position.set(x, 0, z);
    treeGroup.rotation.y = Math.random() * Math.PI * 2;
    treeGroup.scale.setScalar(0.1);
    this.group.add(treeGroup);

    const entry = {
      group: treeGroup, x, z, alive: true,
      collision: { x, z, r: 0.55 },
      _harvestReady: true, _harvestTimer: 0,
      _variantR: Math.random(), _sizeR: Math.random(), _modeled: false,
    };
    this._buildTreeVisual(entry);
    this._collisionCircles.push(entry.collision);
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
      rock.oreDropped = true;
    }
    // Pity: an ore vein always pays out at least once — force the drop on the
    // depletion hit if every roll missed.
    if (props && props.ore && rock.richness <= 0 && !rock.oreDropped) {
      loot[props.ore] = (loot[props.ore] || 0) + 1;
      rock.oreDropped = true;
    }
    // Ferrous ore drops from any mine block alongside the regular ore
    if (Math.random() < 0.15 * oreChanceMult) {
      loot.ferrous_ore = (loot.ferrous_ore || 0) + 1;
    }

    if (rock.richness <= 0) {
      // Depleted — remove block (mesh may be chunked out while far away)
      rock.alive = false;
      if (rock.mesh) rock.mesh.visible = false;
      const idx = this._collisionCircles.indexOf(rock.collision);
      if (idx !== -1) this._collisionCircles.splice(idx, 1);
      if (this.onRockDepleted) this.onRockDepleted(rock);
      // Dig-anywhere (Mine only — only Mine rocks carry grid cells): open the
      // cell and spawn the newly-exposed rock behind it.
      if (this._mineDig && rock.cellC !== undefined) this._mineDig.onDepleted(rock);
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

    for (const { model, x, z, scale, rotY = 0, r, tint } of entries) {
      const src = g[model];
      if (!src) continue; // model file not loaded yet (graceful skip)
      const m = cloneModel(src, scale);
      if (tint !== undefined) {
        // Per-placement recolor (e.g. bright surface rocks darkened for the
        // mine). Clones share materials, so clone before tinting. Baked-shade
        // GLBs (Rodin-style) carry their art in the emissive channel with a
        // black base color, so the tint must multiply both.
        const t = new THREE.Color(tint);
        m.traverse((n) => {
          if (!n.isMesh || n.material?.side === THREE.BackSide) return;
          const apply = (mat) => {
            const c = mat.clone();
            c.color.multiply(t);
            if (c.emissive) c.emissive.multiply(t);
            return c;
          };
          n.material = Array.isArray(n.material) ? n.material.map(apply) : apply(n.material);
        });
      }
      m.position.set(x, 0, z);
      m.rotation.y = rotY;
      // Cartoon ink line on placed props. GLBs that bake their own shell (the
      // trees' flipped-normal `*_OutlineHull` meshes) must not get another.
      let hasBakedHull = false;
      m.traverse(n => {
        if (n.isMesh && (n.material?.side === THREE.BackSide || /outline|hull/i.test(n.name))) hasBakedHull = true;
      });
      if (!hasBakedHull) addOutlineToGroup(m, 0.03);
      this.group.add(m);
      if (r !== undefined) {
        this._collisionCircles.push({ x, z, r });
      }
    }
  }

  getPortals() { return this._zonePortals; }

  // ── Ambient NPCs ───────────────────────────────────────────────────────────
  // Rigged characters that stand in the world playing their Idle clip (ticked
  // in update()). Same fallback contract as portals/stations: placing one
  // before the GLB resolves registers it for the late attach in _modelsReady.
  _addNpc(glbKey, x, z, { scale = 1, rotY = 0, r = 0.45 } = {}) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = rotY;
    this.group.add(group);
    const npc = { group, glbKey, scale, mixer: null, hasModel: false };
    this._npcs.push(npc);
    this._collisionCircles.push({ x, z, r });
    this._attachNpcModel(npc);
    return npc;
  }

  _attachNpcModel(npc) {
    if (npc.hasModel || !this._glb) return;
    const src = this._glb[npc.glbKey];
    if (!src) return;
    npc.hasModel = true;
    let hasSkinned = false;
    src.traverse(n => { if (n.isSkinnedMesh) hasSkinned = true; });
    const model = hasSkinned ? cloneSkinned(src) : src.clone(true);
    model.scale.setScalar(npc.scale);
    model.traverse(n => {
      if (n.isMesh) {
        n.castShadow = true;
        n.material = Array.isArray(n.material) ? n.material.map(_toToonMaterial) : _toToonMaterial(n.material);
      }
    });
    npc.group.add(model);
    const clips = src.userData._clips;
    const idle = clips && clips.find(c => /idle/i.test(c.name));
    if (idle) {
      npc.mixer = new THREE.AnimationMixer(model);
      npc.mixer.clipAction(idle).play();
    }
  }

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
      glacialHollow: 'Glacial Hollow',
      spaceship: 'Spaceship Interior',
      workspace: 'Workspace',
      depths: 'The Depths',
      homeSylva: "Sylva's Den",
      homeBram: "Bram's Lodge",
      homeSprig: "Sprig's Burrow",
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
        // Near ground (z 20+) — keeps the enlarged southern field worth crossing
        { x: -19, z: 22, type: 'silver' },
        { x: 12, z: 25, type: 'iron' },
      ];
      // Cave seams — the same tundra ores, but the hollow is where the deep
      // tungsten sits. Cryo-Pick gated exactly like the surface tundra.
      case 'glacialHollow': return [
        { x: 6, z: -2, type: 'tungsten', requiredTool: 'cryoPick' },
        { x: -6, z: -3, type: 'tungsten', requiredTool: 'cryoPick' },
        { x: 9, z: 4, type: 'titanium', requiredTool: 'cryoPick' },
        { x: -10, z: 1, type: 'titanium', requiredTool: 'cryoPick' },
        { x: 3, z: 9, type: 'silver' },
        { x: -3, z: -9, type: 'silver' },
        { x: 14, z: -2, type: 'quartz' },
        { x: -14, z: 12, type: 'quartz' },
      ];
      case 'spaceship': return []; // no gatherables inside the ship
      case 'workspace': return []; // no gatherables in the workspace
      case 'depths': return [];   // pure mining zone — no resource nodes
      case 'homeSylva': case 'homeBram': case 'homeSprig': return []; // furnished rooms only
      default: return [];
    }
  }

  // The mine cave is re-rolled per delve, so a fixed spawn point can land
  // inside un-mined rock — an enemy stuck there is invisible and (for the
  // stationary boss) unreachable. Snap to the nearest carved floor cell.
  _snapToMineFloor(spawn) {
    const { c, r } = mineWorldToCell(spawn.x, spawn.z);
    if (isMineFloorCell(c, r)) return spawn;
    for (let radius = 1; radius <= 6; radius++) {
      for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          if (Math.max(Math.abs(dc), Math.abs(dr)) !== radius) continue; // ring only
          if (isMineFloorCell(c + dc, r + dr)) {
            const w = mineCellToWorld(c + dc, r + dr);
            return { ...spawn, x: w.x, z: w.z };
          }
        }
      }
    }
    return spawn; // no floor nearby — leave as authored
  }

  // ── Enemy spawn positions per zone (with archetype for variety) ───────────
  getEnemySpawns() {
    // Boss spawns carry `boss: true`; main.js filters out already-defeated
    // bosses before spawning, and EntityManager excludes them from timed respawn.
    switch (this.currentZone) {
      // T1 — Serpendrills only (safe starter zone) + the Scrap Tyrant in the far corner
      case 'landingSite': return [
        { x: 14, z: 10,  archetype: 'serpendrill' },
        { x: -12, z: 16, archetype: 'serpendrill' },
        { x: 18, z: 18,  archetype: 'boss_landing', boss: true },
      ];
      // T2 — native Mine pack, graded by depth: Serpendrill/Scalerunner skirmishers
      // near the adit, Duneplate tanks and the rage-ramping Bramblemaw in the deep
      // cuts, Dunkraza posted at the Depths shaft (the toughest regular enemy in the
      // early game), and the Forge Warden at the mouth of the passage to the Breach.
      case 'mine': return [
        { x: -12.8, z: -3.2, archetype: 'serpendrill' },
        { x: 12.8,  z: 3.2,  archetype: 'scalerunner' },
        { x: 6.4,   z: 9.6,  archetype: 'reptlar' },
        { x: -6.4,  z: 6.4,  archetype: 'scalerunner' },
        { x: 6.4,   z: 19.2, archetype: 'duneplate' },
        { x: 16,    z: 3.2,  archetype: 'dunkraza' },
        { x: -9.6,  z: 16,   archetype: 'bramblemaw' },
        { x: -3.2,  z: 12.8, archetype: 'boss_mine', boss: true },
      ].map(s => this._snapToMineFloor(s));
      // T3 — native Maw pack: Vineclaw stalkers, Sporeback fungal tanks,
      // Bloomfang lurers + the Maw Sovereign in the deep growth.
      case 'verdantMaw': return [
        { x: 10,  z: 8,  archetype: 'vineclaw' },
        { x: -4,  z: -6, archetype: 'sporeback' }, // was (-8,10) — moved out of the hamlet clearing

        { x: 12,  z: -6, archetype: 'sporeback' },
        { x: -10, z: -8, archetype: 'vineclaw' },
        { x: 6,   z: -9, archetype: 'vineclaw' },
        { x: -12, z: -4, archetype: 'bloomfang' },
        { x: 3,   z: 12, archetype: 'bloomfang' },
        { x: 0,   z: -12, archetype: 'boss_verdant', boss: true },
      ];
      // T4 — Reptlar/Dunkraza pressure, shore-digging Spoonvarks + the Tide Oracle
      case 'lagoonCoast': return [
        { x: 12, z: 6,  archetype: 'reptlar' },
        { x: -10, z: 8, archetype: 'dunkraza' },
        { x: 8, z: -10, archetype: 'reptlar' },
        { x: -6, z: -8, archetype: 'dunkraza' },
        { x: 5, z: 12,  archetype: 'spoonvark' },
        { x: -12, z: -10, archetype: 'spoonvark' },
        { x: -14, z: 0, archetype: 'boss_lagoon', boss: true },
      ];
      // T5 — native tundra pack: Frostfang skirmishers, Glacierback tanks,
      // Blubberfins by the lake, and the Cryo Monarch out on the ice itself.
      case 'frozenTundra': return [
        { x: 10, z: 6,  archetype: 'frostfang' },
        { x: -10, z: 6, archetype: 'glacierback' },
        { x: 8, z: -10, archetype: 'frostfang' },
        { x: -8, z: -8, archetype: 'frostfang' },
        { x: 5, z: 10,  archetype: 'blubberfin' },
        { x: 13, z: 3,  archetype: 'blubberfin' },
        { x: -13, z: -12, archetype: 'glacierback' },
        // Enlarged southern field — two posts so the new ground isn't dead space
        { x: -20, z: 24, archetype: 'frostfang' },
        { x: 15, z: 22, archetype: 'glacierback' },
        { x: 12, z: 12, archetype: 'boss_tundra', boss: true },
      ];
      // T5.5 — the native cave pack plus the Rimefather, chapter rung S6
      // (between the Cryo Monarch and The Unmaker). The boss guards the deep
      // end of the cavern, past the bone arch.
      case 'glacialHollow': return [
        { x: 8, z: 2,    archetype: 'rimeburrow' },
        { x: -7, z: 4,   archetype: 'rimeburrow' },
        { x: 11, z: -8,  archetype: 'shardback' },
        { x: -11, z: -6, archetype: 'shardback' },
        { x: 4, z: 12,   archetype: 'cryolisk' },
        { x: -5, z: -12, archetype: 'cryolisk' },
        { x: 14, z: 6,   archetype: 'chillwing' },
        { x: -13, z: 9,  archetype: 'chillwing' },
        // Deep end, past the mammoth skull landmark at (0,8) — walking by its
        // dead kin before meeting the living one. Kept clear of the bone arch
        // at (-1,-6.5), which sat right on top of an earlier spawn point and
        // hid the boss (and its aggro ring) behind the arch legs.
        { x: -2, z: 14,  archetype: 'boss_hollow', boss: true },
      ];
      case 'spaceship': return []; // no enemies in the ship
      case 'workspace': return []; // no enemies in the workspace
      // T6 — Hard Lizzy + Cave Crab escalation + The Unmaker at the heart of the grid
      case 'depths': return [
        { x: 5,  z: 3,  archetype: 'hardlizzy' },
        { x: -5, z: 3,  archetype: 'cavecrab' },
        { x: 0,  z: -6, archetype: 'hardlizzy' },
        { x: 7,  z: -7, archetype: 'cavecrab' },
        { x: -8, z: -3, archetype: 'cavecrab' },
        { x: 0,  z: 0,  archetype: 'boss_depths', boss: true },
      ];
      case 'homeSylva': case 'homeBram': case 'homeSprig': return []; // safe rooms
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
    treeGroup.position.set(x, 0, z);
    // Exactly three draws on every path so the seeded forest layout is
    // identical whether or not the tree GLBs have finished loading yet.
    const entry = {
      group: treeGroup, x, z, alive: true,
      collision: { x, z, r: 0.55 },
      _harvestReady: true, _harvestTimer: 0,
      _variantR: rand(), _sizeR: rand(), _modeled: false,
    };
    treeGroup.rotation.y = rand() * Math.PI * 2;
    this._buildTreeVisual(entry);
    this.group.add(treeGroup);
    this._collisionCircles.push(entry.collision);
    this._trees.push(entry);
  }

  // Weighted mix of the reference-matched Rodin trees: broadleaf backbone,
  // oak second, spruce accents, rare windswept statement tree. baseScale
  // normalises each native height (1.36-1.89 units) to the game's 2.2-3.6
  // world-unit forest. All carry a baked `*_OutlineHull` shell — never add a
  // runtime hull on top (it speckles on organic meshes).
  _treeModel(r) {
    const g = this._glb;
    if (!g) return null;
    const pick = r < 0.40 ? { src: g.treeH, baseScale: 1.6 }
               : r < 0.65 ? { src: g.treeD, baseScale: 1.6 }
               : r < 0.85 ? { src: g.treeJ, baseScale: 1.9 }
               :            { src: g.treeI, baseScale: 1.7 };
    if (pick.src) return pick;
    const fallback = [g.treeH, g.treeD, g.treeJ, g.treeI].find(Boolean);
    return fallback ? { src: fallback, baseScale: 1.7 } : null;
  }

  _buildTreeVisual(entry) {
    const model = this._treeModel(entry._variantR);
    if (model) {
      entry.group.add(cloneModel(model.src, model.baseScale * (0.85 + entry._sizeR * 0.3)));
      entry._modeled = true;
      return;
    }
    // Procedural cone fallback — only the first frames of a fresh load, before
    // the GLBs resolve; _upgradeProceduralTrees() re-skins these in place.
    const h = 1.4 + entry._sizeR * 0.8;
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.22, h, 6),
      createToonMaterial(0x6b4226)
    );
    trunk.position.y = h / 2;
    trunk.castShadow = true;
    entry.group.add(trunk);

    const crownColors = [0x2d6a2d, 0x3a8c3a, 0x245224];
    const crownMat = createToonMaterial(crownColors[Math.floor(entry._variantR * crownColors.length)]);
    const crownH = 1.8 + entry._sizeR * 0.6;
    const crown1 = new THREE.Mesh(new THREE.ConeGeometry(0.9, crownH, 7), crownMat);
    crown1.position.y = h + crownH * 0.4;
    crown1.castShadow = true;
    entry.group.add(crown1);

    const crown2 = new THREE.Mesh(new THREE.ConeGeometry(0.65, crownH * 0.7, 7), crownMat);
    crown2.position.y = h + crownH * 0.85;
    entry.group.add(crown2);
    addOutlineToGroup(entry.group, 0.035);
  }

  // Re-skin procedural fallback trees once the GLBs arrive (only relevant for
  // the very first zone build on a fresh page load).
  _upgradeProceduralTrees() {
    for (const t of this._trees) {
      if (t._modeled) continue;
      while (t.group.children.length) t.group.remove(t.group.children[0]);
      this._buildTreeVisual(t);
    }
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
    group.position.set(x, 0, z);
    this.group.add(group);

    const portal = {
      position: new THREE.Vector3(x, 0, z),
      targetZone,
      ppRequired,
      label,
      mesh: group,
      energyMat: null,   // baked "PortalEnergy" material, tinted by refreshPortalAccess()
      hasModel: false,
    };
    // Attaches the Ancient World Gate GLB. On the very first zone the models are
    // still loading, so this no-ops here and _attachPortalModel runs again once
    // _modelsReady resolves (see constructor).
    this._attachPortalModel(portal);

    // Until the GLB attaches (first-zone load race, or a failed download) show a
    // glowing floor ring so a gate is never invisible; removed on attach.
    if (!portal.hasModel) {
      const fb = new THREE.Group();
      const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.8, 32), ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.05;
      fb.add(ring);
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(0.55, 32),
        new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.25 })
      );
      disc.rotation.x = -Math.PI / 2;
      disc.position.y = 0.04;
      fb.add(disc);
      portal.fallbackMesh = fb;
      portal.energyMat = ringMat; // refreshPortalAccess tints the fallback too
      group.add(fb);
    }

    // Block player from walking into the portal hole
    this._collisionCircles.push({ x, z, r: 0.9 });

    this._zonePortals.push(portal);
  }

  /**
   * Clone the portal GLB onto an existing portal group. Idempotent — safe to call
   * again after models finish loading. Clones the glowing energy material per
   * portal so each gate can show its own accessible/locked colour.
   */
  /**
   * A walk-in cave mouth instead of an Ancient World Gate: same portal record
   * (so main.js's proximity prompt, getPortals() and switchZone all work
   * unchanged) but no gate GLB, no fallback ring, and no collision circle —
   * the cave-mouth prop placed at the same spot from ZONE_ASSETS supplies the
   * collision, which stops the player at the threshold just inside the 2.5-unit
   * interact radius.
   */
  _addCaveEntrance(x, z, targetZone, label) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    this.group.add(group);
    this._zonePortals.push({
      position: new THREE.Vector3(x, 0, z),
      targetZone,
      ppRequired: 0,
      label,
      mesh: group,
      energyMat: null,
      hasModel: true,   // nothing to late-attach
      noGate: true,
    });
  }

  /**
   * A home-door zone transition: same portal record as _addCaveEntrance (the
   * proximity prompt, getPortals() and switchZone all work unchanged), plus a
   * soft glowing door-mat so the hotspot reads, and an optional [x, z] spawn
   * override so the return trip lands on this doorstep instead of the target
   * zone's default spawn.
   */
  _addDoorway(x, z, targetZone, label, spawnOverride = null) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    this.group.add(group);
    const mat = new THREE.Mesh(
      new THREE.CircleGeometry(0.45, 24),
      new THREE.MeshBasicMaterial({ color: 0x9fe8c8, transparent: true, opacity: 0.35 })
    );
    mat.rotation.x = -Math.PI / 2;
    mat.position.y = 0.03;
    group.add(mat);
    this._zonePortals.push({
      position: new THREE.Vector3(x, 0, z),
      targetZone,
      ppRequired: 0,
      label,
      mesh: group,
      energyMat: null,
      hasModel: true,
      noGate: true,
      spawnOverride,
    });
  }

  _attachPortalModel(portal) {
    if (portal.noGate || portal.hasModel || !this._glb || !this._glb.portal) return;
    const model = cloneModel(this._glb.portal, 1.0);
    model.position.y = 0;
    model.traverse(n => {
      if (n.isMesh && n.material && /PortalEnergy/i.test(n.material.name)) {
        n.material = n.material.clone();
        portal.energyMat = n.material;
      }
    });
    addOutlineToGroup(model, 0.04);
    portal.mesh.add(model);
    portal.hasModel = true;
    if (portal.fallbackMesh) {
      portal.mesh.remove(portal.fallbackMesh);
      portal.fallbackMesh = null;
    }
  }

  /**
   * Tint each gate's energy field by accessibility: teal when the destination is
   * reachable, warm orange when it is still locked. Free portals are always teal.
   * isAccessibleFn(portal) → boolean.
   */
  refreshPortalAccess(isAccessibleFn) {
    for (const portal of this._zonePortals) {
      const accessible = portal.ppRequired === 0 || isAccessibleFn(portal);
      const col = accessible ? 0x00ffcc : 0xff7a1a;
      const mat = portal.energyMat;
      if (mat) {
        mat.color.setHex(col);
        if (mat.emissive) mat.emissive.setHex(col);
      }
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

  /**
   * Swap a station's procedural body for a GLB model (same late-attach idea as
   * _attachPortalModel): register at build time, attach immediately if the GLB
   * is loaded, else again when _modelsReady resolves. Children flagged
   * userData.isIndicator (the floating interaction gem) survive the swap and
   * are re-floated just above the model's bounding box.
   */
  _registerStationModel(group, modelKey, opts = {}) {
    const entry = { group, modelKey, opts, hasModel: false };
    this._stationAttaches.push(entry);
    this._attachStationModel(entry);
  }

  _attachStationModel(entry) {
    if (entry.hasModel || !this._glb) return;
    const src = this._glb[entry.modelKey];
    if (!src) return;
    const m = cloneModel(src, entry.opts.scale ?? 1);
    if (entry.opts.rotY) m.rotation.y = entry.opts.rotY;
    addOutlineToGroup(m, 0.03);
    for (const child of [...entry.group.children]) {
      if (!child.userData.isIndicator) entry.group.remove(child);
    }
    const ind = entry.group.children.find(c => c.userData.isIndicator);
    if (ind) {
      const h = new THREE.Box3().setFromObject(m).max.y;
      ind.position.y = h + 0.45;
    }
    entry.group.add(m);
    entry.hasModel = true;
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
    ind.userData.isIndicator = true;
    g.add(ind);

    g.position.set(x, 0, z);
    this.group.add(g);
    this._registerStationModel(g, 'stOffload');
    this._collisionCircles.push({ x, z, r: 1.0 });

    // Register as interactable station
    this._offloadStationPos = { x, z };
  }

  /**
   * Holodeck-style training chamber: one walk-in trigger zone (r) plus a
   * program console placed just outside it. The chamber floor is walkable —
   * only the emitter pillars collide.
   */
  _addTrainingChamber(x, z, r = 2.0) {
    const g = new THREE.Group();

    // Chamber floor disc + holo ring
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 0.15, 0.1, 40), createToonMaterial(0x1c2440));
    disc.position.y = 0.05;
    g.add(disc);

    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.06, 8, 48), new THREE.MeshBasicMaterial({ color: 0x66ddff }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.12;
    g.add(ring);

    // Inner grid circle (holodeck lines)
    const grid = new THREE.Mesh(
      new THREE.TorusGeometry(r * 0.55, 0.03, 6, 40),
      new THREE.MeshBasicMaterial({ color: 0x2a6699, transparent: true, opacity: 0.7 })
    );
    grid.rotation.x = -Math.PI / 2;
    grid.position.y = 0.11;
    g.add(grid);

    // Four emitter pylons around the rim (the only collision). Each is its own
    // sub-group so the GLB pylon can swap in (fallback: box pillar + emitter).
    for (let i = 0; i < 4; i++) {
      const a = (Math.PI / 4) + i * (Math.PI / 2); // diagonals, keeping N/S/E/W open
      const ex = Math.cos(a) * (r + 0.4), ez = Math.sin(a) * (r + 0.4);
      const pg = new THREE.Group();
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.0, 0.3), createToonMaterial(0x223355));
      pillar.position.y = 1.0;
      addOutline(pillar, 0.04);
      pg.add(pillar);

      const emitter = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), new THREE.MeshBasicMaterial({ color: 0x66ddff }));
      emitter.position.y = 2.25;
      pg.add(emitter);

      pg.position.set(ex, 0, ez);
      g.add(pg);
      this._registerStationModel(pg, 'stHoloPylon');
      this._collisionCircles.push({ x: x + ex, z: z + ez, r: 0.4 });
    }

    g.position.set(x, 0, z);
    this.group.add(g);
    this._trainingChamber = { x, z, r };

    // Program console just outside the chamber, toward the ship interior
    const cz = z - r - 1.4;
    const cg = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.0, 0.6), createToonMaterial(0x223344));
    body.position.y = 0.5;
    addOutline(body, 0.05);
    cg.add(body);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), new THREE.MeshBasicMaterial({ color: 0x66ddff }));
    screen.position.set(0, 0.75, 0.31);
    cg.add(screen);
    cg.position.set(x, 0, cz);
    this.group.add(cg);
    this._registerStationModel(cg, 'stTrainingConsole');
    this._collisionCircles.push({ x, z: cz, r: 0.7 });
    this._trainingConsolePos = { x, z: cz };
  }

  getTrainingChamber() { return this._trainingChamber || null; }
  getTrainingConsolePos() { return this._trainingConsolePos || null; }

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
    ind.userData.isIndicator = true;
    g.add(ind);

    g.position.set(x, 0, z);
    this.group.add(g);
    this._registerStationModel(g, 'stFabricator');
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
    ind.userData.isIndicator = true;
    g.add(ind);

    g.position.set(x, 0, z);
    this.group.add(g);
    this._registerStationModel(g, 'stDroneMonitor');
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
    ind.userData.isIndicator = true;
    g.add(ind);

    g.position.set(x, 0, z);
    this.group.add(g);
    this._registerStationModel(g, 'stAscension');
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
    ind.userData.isIndicator = true;
    g.add(ind);

    g.position.set(x, 0, z);
    this.group.add(g);
    this._registerStationModel(g, 'stMastery');
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
    ind.userData.isIndicator = true;
    g.add(ind);

    g.position.set(x, 0, z);
    this.group.add(g);
    this._registerStationModel(g, 'stCharging');
    this._collisionCircles.push({ x, z, r: 1.0 });

    this._chargingStationPos = { x, z };
  }

  // Sparring rig — simulated combat trains STR/DEF passively (no drops)
  _addCombatSimRig(x, z) {
    const g = new THREE.Group();

    // Base mat (sparring pad)
    const baseGeo = new THREE.CylinderGeometry(0.85, 0.95, 0.12, 10);
    const base = new THREE.Mesh(baseGeo, createToonMaterial(0x3a2a3a));
    base.position.y = 0.06;
    base.castShadow = true;
    g.add(base);

    // Holo-opponent silhouette (translucent orange sparring dummy)
    const holoMat = new THREE.MeshBasicMaterial({ color: 0xff8844, transparent: true, opacity: 0.45 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.6, 0.3), holoMat);
    torso.position.y = 0.95;
    g.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), holoMat);
    head.position.y = 1.45;
    g.add(head);

    // Emitter pylon behind the dummy
    const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 1.7, 8), createToonMaterial(0x2a3a4a));
    pylon.position.set(0, 0.85, -0.55);
    pylon.castShadow = true;
    addOutline(pylon, 0.04);
    g.add(pylon);

    // Projection ring (orange glow)
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.65, 0.05, 8, 20),
      new THREE.MeshBasicMaterial({ color: 0xff8844 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.16;
    g.add(ring);

    g.position.set(x, 0, z);
    this.group.add(g);
    this._registerStationModel(g, 'stCombatRig');
    this._collisionCircles.push({ x, z, r: 1.0 });

    this._combatSimPos = { x, z };
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
  getCombatSimPos() { return this._combatSimPos || null; }
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
