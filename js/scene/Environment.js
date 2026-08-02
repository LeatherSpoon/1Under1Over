import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createToonMaterial, createRevealToonMaterial, addOutline, addOutlineToGroup, createPortalEnergyMaterial } from './ToonMaterials.js';
import { CONFIG, getZoneBounds } from '../config.js';
import { ZONE_ASSETS } from './ZoneAssets.js';
import {
  buildLandingSite, buildMine,         buildDepths,    buildVerdantMaw,
  buildLagoonCoast, buildFrozenTundra, buildSpaceship, buildWorkspace,
  buildGlacialHollow, buildMeltwaterRift, buildAtlantis, buildLabyrinth,
  buildCinderforge,
  buildHomeSylva, buildHomeBram, buildHomeSprig,
} from './zones/index.js';
import { mineWorldToCell, mineCellToWorld, isMineFloorCell } from './zones/Mine/layout.js';
import { buildComputerCore } from './zones/ComputerBuilding/interior.js';
import { addPathRibbon } from './PathRibbon.js';
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
    // Ground extent of the current zone — read by _addGround and any system
    // that needs the world's edges (sectors, layout validation).
    this.bounds = getZoneBounds('landingSite');
    // Spatial streaming for large zones — a builder assigns a SectorView here;
    // main.js ticks it with the player position. Null in small zones.
    this._sectors = null;
    this._collisionCache = null;
    this._collisionCacheVersion = -1;
    this._collisionCacheStatic = -1;
    this._zonePortals = []; // { position, targetZone, ppRequired, mesh }
    this._stationAttaches = []; // { group, modelKey, opts, hasModel } — GLB station bodies
    this._collisionCircles = []; // { x, z, r, y? } — y'd circles only bite near that height
    // Walkable surfaces for multi-level zones (see js/scene/walkableSurfaces.js).
    // Empty in flat zones — main.js skips height resolution entirely then.
    this._surfaces = [];
    // Zone landmarks for the off-screen nav aid ({ x, y, z, label }) — things
    // worth pointing at that aren't portals or bosses (e.g. the canopy ascent).
    this._navLandmarks = [];
    this._trackGroup = new THREE.Group(); // track markers live here, separate from env
    scene.add(this._trackGroup);

    this._computerGroup = new THREE.Group(); // Generation Engine shell, rebuilt per plan edit
    scene.add(this._computerGroup);
    this._computerCircles = [];              // our collision refs, spliced out on rebuild

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
      loadModel('./models/Landing_GrassTuft.glb').catch(() => null),
      loadModel('./models/Landing_Wildflowers.glb').catch(() => null),
      loadModel('./models/Landing_Bush.glb').catch(() => null),
      loadModel('./models/Landing_FallenLog.glb').catch(() => null),
      loadModel('./models/Landing_MineAdit.glb').catch(() => null),
      loadModel('./models/Landing_RockOutcrop.glb').catch(() => null),
      loadModel('./models/Landing_Tent.glb').catch(() => null),
      loadModel('./models/Landing_Campfire.glb').catch(() => null),
      loadModel('./models/Npc_Mara.glb').catch(() => null),
      loadModel('./models/Npc_Finch.glb').catch(() => null),
      loadModel('./models/Atlantis_GuardianHead.glb').catch(() => null),
      loadModel('./models/Atlantis_TempleDome.glb').catch(() => null),
      loadModel('./models/Atlantis_ColumnIntact.glb').catch(() => null),
      loadModel('./models/Atlantis_ColumnBroken.glb').catch(() => null),
      loadModel('./models/Atlantis_Archway.glb').catch(() => null),
      loadModel('./models/Atlantis_CrystalHeart.glb').catch(() => null),
      loadModel('./models/Atlantis_KelpTuft.glb').catch(() => null),
      loadModel('./models/Atlantis_CoralCluster.glb').catch(() => null),
      loadModel('./models/Atlantis_Shipwreck.glb').catch(() => null),
      loadModel('./models/Atlantis_GlyphStele.glb').catch(() => null),
      loadModel('./models/Atlantis_Brazier.glb').catch(() => null),
      loadModel('./models/Atlantis_AmphoraCluster.glb').catch(() => null),
      loadModel('./models/Atlantis_StoneFish.glb').catch(() => null),
      loadModel('./models/Atlantis_RuinWall.glb').catch(() => null),
      loadModel('./models/Pandora_Hometree.glb').catch(() => null),
      loadModel('./models/Pandora_CanopyPad.glb').catch(() => null),
      loadModel('./models/Pandora_BranchBridge.glb').catch(() => null),
      loadModel('./models/Pandora_SpiritTree.glb').catch(() => null),
      loadModel('./models/Pandora_Helicoradian.glb').catch(() => null),
      loadModel('./models/Pandora_PuffballTree.glb').catch(() => null),
      loadModel('./models/Pandora_BranchBridgeLong.glb').catch(() => null),
      loadModel('./models/Pandora_CanopyPad2.glb').catch(() => null),
      loadModel('./models/Jungle_CanopyMass.glb').catch(() => null),
      loadModel('./models/Pandora_VineCurtain.glb').catch(() => null),
      loadModel('./models/Landing_LookoutKnoll.glb').catch(() => null),
      loadModel('./models/Canopy_RootGate.glb').catch(() => null),
      loadModel('./models/Pandora_GreatTree.glb').catch(() => null),
      loadModel('./models/Pandora_RootSpire.glb').catch(() => null),
      loadModel('./models/Ember_LanternTree.glb').catch(() => null),
      loadModel('./models/Ember_GladeArch.glb').catch(() => null),
      loadModel('./models/Pandora_SkyIsle.glb').catch(() => null),
      loadModel('./models/Jungle_BambooGrove.glb').catch(() => null),
      loadModel('./models/Jungle_GoldTree.glb').catch(() => null),
      // Frozen Tundra glacier round (Assets/3D/FrozenTundra/build_glacierkit.py
      // + build_icearch.py)
      loadModel('./models/Tundra_Sastrugi.glb').catch(() => null),
      loadModel('./models/Tundra_SastrugiLong.glb').catch(() => null),
      loadModel('./models/Tundra_ShelfWall.glb').catch(() => null),
      loadModel('./models/Tundra_RiftWall.glb').catch(() => null),
      loadModel('./models/Tundra_IceBridge.glb').catch(() => null),
      loadModel('./models/Tundra_IceArch.glb').catch(() => null),
      loadModel('./models/Landing_Starwing.glb').catch(() => null),
      loadModel('./models/Landing_Mountain.glb').catch(() => null),
      loadModel('./models/Lab_WallStraight.glb').catch(() => null),
      loadModel('./models/Lab_ArchGate.glb').catch(() => null),
      loadModel('./models/Lab_Minotaur.glb').catch(() => null),
      loadModel('./models/Lab_Shrine.glb').catch(() => null),
      loadModel('./models/Lab_Fountain.glb').catch(() => null),
      loadModel('./models/Lab_Well.glb').catch(() => null),
      loadModel('./models/Lab_Brazier.glb').catch(() => null),
      loadModel('./models/Lab_Column.glb').catch(() => null),
      loadModel('./models/Lab_BrokenColumn.glb').catch(() => null),
      loadModel('./models/Lab_RuneStele.glb').catch(() => null),
      loadModel('./models/Lab_Gargoyle.glb').catch(() => null),
      loadModel('./models/Lab_Pedestal.glb').catch(() => null),
      loadModel('./models/Lab_TombChest.glb').catch(() => null),
      loadModel('./models/Lab_BullSkull.glb').catch(() => null),
      loadModel('./models/Lab_SpikeTrap.glb').catch(() => null),
      loadModel('./models/Lab_Rubble.glb').catch(() => null),
      loadModel('./models/Lab_Bones.glb').catch(() => null),
      loadModel('./models/Npc_Warden.glb').catch(() => null),
      loadModel('./models/Npc_Delver.glb').catch(() => null),
      loadModel('./models/Forge_WallStraight.glb').catch(() => null),
      loadModel('./models/Forge_ArchGate.glb').catch(() => null),
      loadModel('./models/Forge_Golem.glb').catch(() => null),
      loadModel('./models/Forge_Anvil.glb').catch(() => null),
      loadModel('./models/Forge_Crucible.glb').catch(() => null),
      loadModel('./models/Forge_Vent.glb').catch(() => null),
      loadModel('./models/Forge_Brazier.glb').catch(() => null),
      loadModel('./models/Forge_Column.glb').catch(() => null),
      loadModel('./models/Forge_BrokenColumn.glb').catch(() => null),
      loadModel('./models/Forge_RuneStele.glb').catch(() => null),
      loadModel('./models/Forge_Gargoyle.glb').catch(() => null),
      loadModel('./models/Forge_IngotStack.glb').catch(() => null),
      loadModel('./models/Forge_Rubble.glb').catch(() => null),
    ]).then(([treeH, treeI, treeJ, rock, barrel, crate, tower, pc, scrapper, boulder, blueBoulder, redRock, firePlant, portal, ship, mossyBoulder, treeD, treeH2, shipShell, stFabricator, stOffload, stCharging, stDroneMonitor, stAscension, stMastery, stCombatRig, stTrainingConsole, stHoloPylon, shipPlant, crateStack, pipeManifold, snowPine, snowPineSquat, tundraDeadTree, iceCrystal, snowBoulder, frozenShrine, hollowCaveMouth, hollowStalagmites, hollowIceCrystal, hollowFrostShroom, hollowIceRubble, hollowMammothSkull, hollowBoneArch, mawCanopyTree, mawBanyanTree, mawFernCluster, mawPlant, mawMossIdol, mawMossBoulder, mawGlowShroom, homeSylva, homeBram, homeSprig, npcSylva, npcBram, npcSprig, furnSylvaCot, furnSylvaRack, furnSylvaTable, furnBramBench, furnBramBed, furnBramRack, furnSprigBench, furnSprigHammock, furnSprigPots, landGrass, landFlowers, landBush, landLog, landAdit, landOutcrop, landTent, landCampfire, npcMara, npcFinch, atlGuardianHead, atlTempleDome, atlColumn, atlColumnBroken, atlArchway, atlCrystalHeart, atlKelp, atlCoral, atlShipwreck, atlStele, atlBrazier, atlAmphora, atlStoneFish, atlRuinWall, pandoraHometree, pandoraCanopyPad, pandoraBranchBridge, pandoraSpiritTree, pandoraHelicoradian, pandoraPuffball, pandoraBranchBridgeLong, pandoraCanopyPad2, jungleCanopyMass, pandoraVineCurtain, landKnoll, pandoraRootGate, pandoraGreatTree, pandoraRootSpire, emberLanternTree, emberGladeArch, pandoraSkyIsle, jungleBambooGrove, jungleGoldTree, tundraSastrugi, tundraSastrugiLong, tundraShelfWall, tundraRiftWall, tundraIceBridge, tundraIceArch, starwing, landMountain, labWallStraight, labArchGate, labMinotaur, labShrine, labFountain, labWell, labBrazier, labColumn, labBrokenColumn, labRuneStele, labGargoyle, labPedestal, labTombChest, labBullSkull, labSpikeTrap, labRubble, labBones, npcWarden, npcDelver, forgeWallStraight, forgeArchGate, forgeGolem, forgeAnvil, forgeCrucible, forgeVent, forgeBrazier, forgeColumn, forgeBrokenColumn, forgeRuneStele, forgeGargoyle, forgeIngotStack, forgeRubble]) => {
      this._glb = { treeH, treeI, treeJ, rock, barrel, crate, tower, pc, scrapper, boulder, blueBoulder, redRock, firePlant, portal, ship, mossyBoulder, treeD, treeH2, shipShell, stFabricator, stOffload, stCharging, stDroneMonitor, stAscension, stMastery, stCombatRig, stTrainingConsole, stHoloPylon, shipPlant, crateStack, pipeManifold, snowPine, snowPineSquat, tundraDeadTree, iceCrystal, snowBoulder, frozenShrine, hollowCaveMouth, hollowStalagmites, hollowIceCrystal, hollowFrostShroom, hollowIceRubble, hollowMammothSkull, hollowBoneArch, mawCanopyTree, mawBanyanTree, mawFernCluster, mawPlant, mawMossIdol, mawMossBoulder, mawGlowShroom, homeSylva, homeBram, homeSprig, npcSylva, npcBram, npcSprig, furnSylvaCot, furnSylvaRack, furnSylvaTable, furnBramBench, furnBramBed, furnBramRack, furnSprigBench, furnSprigHammock, furnSprigPots, landGrass, landFlowers, landBush, landLog, landAdit, landOutcrop, landTent, landCampfire, npcMara, npcFinch, atlGuardianHead, atlTempleDome, atlColumn, atlColumnBroken, atlArchway, atlCrystalHeart, atlKelp, atlCoral, atlShipwreck, atlStele, atlBrazier, atlAmphora, atlStoneFish, atlRuinWall, pandoraHometree, pandoraCanopyPad, pandoraBranchBridge, pandoraSpiritTree, pandoraHelicoradian, pandoraPuffball, pandoraBranchBridgeLong, pandoraCanopyPad2, jungleCanopyMass, pandoraVineCurtain, landKnoll, pandoraRootGate, pandoraGreatTree, pandoraRootSpire, emberLanternTree, emberGladeArch, pandoraSkyIsle, jungleBambooGrove, jungleGoldTree, tundraSastrugi, tundraSastrugiLong, tundraShelfWall, tundraRiftWall, tundraIceBridge, tundraIceArch, starwing, landMountain, labWallStraight, labArchGate, labMinotaur, labShrine, labFountain, labWell, labBrazier, labColumn, labBrokenColumn, labRuneStele, labGargoyle, labPedestal, labTombChest, labBullSkull, labSpikeTrap, labRubble, labBones, npcWarden, npcDelver, forgeWallStraight, forgeArchGate, forgeGolem, forgeAnvil, forgeCrucible, forgeVent, forgeBrazier, forgeColumn, forgeBrokenColumn, forgeRuneStele, forgeGargoyle, forgeIngotStack, forgeRubble };
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
    this._surfaces = [];
    this._navLandmarks = [];
    this._trees = [];
    this._rocks = [];
    this._mineChunks = null; // Mine-only chunked view — stale after a switch
    if (this._sectors) this._sectors.clear();
    this._sectors = null;    // SectorView for large zones — rebuilt by the builder
    this._collisionCache = null;
    this._collisionCacheVersion = -1;
    this._collisionCacheStatic = -1;
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
    this.bounds = getZoneBounds(zoneName);

    switch (zoneName) {
      case 'landingSite':  buildLandingSite(this);  break;
      case 'mine':         buildMine(this);         break;
      case 'depths':       buildDepths(this);       break;
      case 'verdantMaw':   buildVerdantMaw(this);   break;
      case 'lagoonCoast':  buildLagoonCoast(this);  break;
      case 'frozenTundra': buildFrozenTundra(this); break;
      case 'glacialHollow': buildGlacialHollow(this); break;
      case 'meltwaterRift': buildMeltwaterRift(this); break;
      case 'atlantis': buildAtlantis(this); break;
      case 'labyrinth': buildLabyrinth(this); break;
      case 'cinderforge': buildCinderforge(this); break;
      case 'spaceship':    buildSpaceship(this);    break;
      case 'workspace':    buildWorkspace(this);    break;
      case 'homeSylva':    buildHomeSylva(this);    break;
      case 'homeBram':     buildHomeBram(this);     break;
      case 'homeSprig':    buildHomeSprig(this);    break;
      case 'computerCore':
        // Ref is injected by main.js (Task 7); unfounded/missing ⇒ bare room skip
        // (only reachable pre-founding via debug teleport).
        if (this._computerSystemRef && this._computerSystemRef.hasFounded()) {
          buildComputerCore(this, this._computerSystemRef);
        }
        break;
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
      // A spinner is normally { mesh, axis, speed } — a constant rotation.
      // An entry may instead carry its own `update(delta)` for motion that
      // isn't a spin (the tundra's wind-driven spindrift translates and wraps).
      if (s.update) s.update(delta);
      else s.mesh.rotation[s.axis] += s.speed * delta;
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

    for (const { model, x, z, y = 0, scale, rotY = 0, r, tint, noOutline, reveal, aim, scaleXYZ, groundCover } of entries) {
      // Reveal-shaded props must not get the plain black auto-hull — the
      // reveal hole would expose the hull interior as a solid black blob.
      const m = this.buildPropMesh({ model, x: x ?? 0, z: z ?? 0, scale, rotY, tint, scaleXYZ,
        noOutline: noOutline || !!reveal });
      if (!m) continue; // model file not loaded yet (graceful skip)
      if (y) m.position.y = y;
      // `aim` places a prop along a 3D segment (canopy branch bridges): the
      // GLB's local +x axis is yawed/pitched onto start→end and its x-scale
      // stretched from the authored nativeLen to the segment length.
      if (aim) {
        const dx = aim.x1 - aim.x0, dy = aim.y1 - aim.y0, dz = aim.z1 - aim.z0;
        const hLen = Math.hypot(dx, dz);
        m.position.set((aim.x0 + aim.x1) / 2, (aim.y0 + aim.y1) / 2, (aim.z0 + aim.z1) / 2);
        // Yaw about Y, then pitch about the yawed local z — roll-free.
        m.rotation.set(0, Math.atan2(-dz, dx), Math.atan2(dy, hLen), 'YZX');
        if (aim.nativeLen) m.scale.x *= Math.hypot(dx, dy, dz) / aim.nativeLen;
      }
      // Canopy platforms/trunks re-shade to reveal materials so the cutout
      // opens around a player walking beneath them (mine-wall convention).
      if (reveal) this._applyRevealShading(m);
      // Collisionless scatter marks itself so clearGroundCoverIn can find it.
      if (groundCover) m.userData.isGroundCover = true;
      this.group.add(m);
      if (r !== undefined) {
        this._collisionCircles.push(y ? { x, z, r, y } : { x, z, r });
      }
    }
  }

  /**
   * Re-shade a placed prop's materials with the player-position reveal cut
   * (registers them in _revealMaterials, which main.js feeds each frame).
   * Glow-named materials (emissive accents baked in Blender) and BackSide
   * hulls keep their originals.
   */
  _applyRevealShading(obj, revealR = 3.0) {
    const conv = (mat) => {
      if (!mat || mat.side === THREE.BackSide || /glow|spirit|energy|vein/i.test(mat.name || '')) return mat;
      // Carry the diffuse map through — a textured prop (Rodin branch
      // bridges) must not collapse to a flat color when it goes reveal.
      const rm = createRevealToonMaterial(mat.color ? mat.color.getHex() : 0x6a8a6a, {
        revealR,
        ...(mat.map ? { map: mat.map } : {}),
        ...(mat.vertexColors ? { vertexColors: true } : {}),
      });
      this._revealMaterials.push(rm);
      return rm;
    };
    obj.traverse(n => {
      if (!n.isMesh) return;
      n.material = Array.isArray(n.material) ? n.material.map(conv) : conv(n.material);
    });
  }

  /**
   * Build one placed GLB prop — clone, tint, position, ink outline. Returns
   * null when the model has not loaded yet, which every caller treats as a
   * graceful skip. Shared by ZoneAssets placement and generated layouts
   * (LayoutBuilder), so both get identical art treatment.
   *
   * The caller adds it to a group and registers collision; a sector-streamed
   * prop is built and discarded many times, so this must stay side-effect free.
   */
  buildPropMesh({ model, x, z, scale, rotY = 0, tint, noOutline = false, scaleXYZ }) {
    const g = this._glb;
    if (!g) return null;
    const src = g[model];
    if (!src) return null;
    const m = cloneModel(src, scale);
    // Non-uniform stretch, applied on top of the uniform `scale`. Terrain
    // sections need it: a riser is authored 8 wide × 3 tall, and a 2.5-tall
    // shelf must keep its width and its detail scale rather than shrinking to
    // 6.67 wide. Ordinary props should keep using `scale` alone.
    if (scaleXYZ) m.scale.multiply(new THREE.Vector3(...scaleXYZ));
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
    //
    // `noOutline` opts a placement out entirely. The scale-based inverted hull
    // assumes a solid body: it inflates the mesh and draws its backfaces, which
    // for a closed volume leaves a rim at the silhouette. On a THIN OPEN SHELL
    // — a tent's canvas, a banner, anything one surface thick — the inflated
    // shell's backfaces land *in front of* the real surface and paint the whole
    // prop flat black. That is what the survivor camp's tent did until it was
    // flagged here.
    let hasBakedHull = false;
    m.traverse(n => {
      if (n.isMesh && (n.material?.side === THREE.BackSide || /outline|hull/i.test(n.name))) hasBakedHull = true;
    });
    if (!hasBakedHull && !noOutline) addOutlineToGroup(m, 0.03);
    return m;
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

  /**
   * Static (authored) blockers plus any live sector-streamed ones. The merged
   * array is cached and only rebuilt when a sector activates/deactivates, so
   * the per-frame collision sweep in main.js stays allocation-free.
   */
  getCollisionCircles() {
    const sv = this._sectors;
    if (!sv || sv.collisionCircles.length === 0) return this._collisionCircles;
    if (this._collisionCacheVersion !== sv.version
        || this._collisionCacheStatic !== this._collisionCircles.length) {
      this._collisionCache = this._collisionCircles.concat(sv.collisionCircles);
      this._collisionCacheVersion = sv.version;
      this._collisionCacheStatic = this._collisionCircles.length;
    }
    return this._collisionCache;
  }

  /** Register a walkable surface (disc/rect/ramp/helix — see walkableSurfaces.js). */
  addWalkableSurface(s) { this._surfaces.push(s); }

  /** All walkable surfaces in the current zone (empty in flat zones). */
  getWalkableSurfaces() { return this._surfaces; }

  /** Register a nav-aid landmark for this zone (cleared on zone switch). */
  _addNavLandmark(x, y, z, label) { this._navLandmarks.push({ x, y, z, label }); }

  getNavLandmarks() { return this._navLandmarks; }

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

  /**
   * Rebuild the computer building's exterior from the player's plan. Called on
   * zone entry (landingSite) and once per plan edit — never per frame. All
   * visuals live in _computerGroup; collision circles are tracked so a rebuild
   * can splice exactly ours out of _collisionCircles.
   */
  buildComputerShell(computer) {
    while (this._computerGroup.children.length > 0) {
      this._computerGroup.remove(this._computerGroup.children[0]);
    }
    for (const c of this._computerCircles) {
      const i = this._collisionCircles.indexOf(c);
      if (i !== -1) this._collisionCircles.splice(i, 1);
    }
    this._computerCircles = [];
    // getCollisionCircles()'s merged sector cache keys on _collisionCircles
    // LENGTH — a splice-then-push rebuild can land on the same count, so
    // invalidate explicitly (the zone-switch way).
    this._collisionCacheStatic = -1;
    if (this.currentZone !== 'landingSite' || !computer.hasFounded()) return;

    const { wallRuns, shellCollisionCircles } = computer._shellFns; // injected in main.js (see Task 7)
    const { chunkToWorld, CHUNK } = computer._gridFns;
    const H = computer.row().storyHeight;
    const wallMat = createToonMaterial(0x8a94a0);   // expedition-alloy grey (placeholder kit)
    const floorMat = createToonMaterial(0x4a5058);
    const roofMat = createToonMaterial(0x39404a);

    for (const r of wallRuns(computer.plan, computer.door)) {
      const horiz = r.z1 === r.z2;
      const len = horiz ? Math.abs(r.x2 - r.x1) : Math.abs(r.z2 - r.z1);
      const wall = new THREE.Mesh(new THREE.BoxGeometry(horiz ? len : 0.3, H, horiz ? 0.3 : len), wallMat);
      wall.position.set((r.x1 + r.x2) / 2, H / 2, (r.z1 + r.z2) / 2);
      this._computerGroup.add(wall);
    }
    for (const key of computer.plan) {
      const [cx, cz] = key.split(',').map(Number);
      const [wx, wz] = chunkToWorld(cx, cz);
      const floor = new THREE.Mesh(new THREE.BoxGeometry(CHUNK, 0.08, CHUNK), floorMat);
      floor.position.set(wx, 0.04, wz);
      this._computerGroup.add(floor);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(CHUNK + 0.4, 0.25, CHUNK + 0.4), roofMat);
      roof.position.set(wx, H + 0.12, wz);
      this._computerGroup.add(roof);
    }
    // Lit window strips — one per generation reached (exterior tell)
    // (skip on gen 1: the shed is dark until the machine grows)
    for (let g = 2; g <= computer.generation; g++) {
      const [dwx, dwz] = computer.doorWorld();
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.5, 0.06),
        new THREE.MeshBasicMaterial({ color: 0x8fe8cc })
      );
      // spread strips along the door face, left of the door
      strip.position.set(dwx - 1.6 - (g - 2) * 1.2, H * 0.6, dwz + (computer.door.side === 'S' ? 0.18 : -0.18));
      if (computer.door.side === 'E' || computer.door.side === 'W') {
        strip.rotation.y = Math.PI / 2;
        strip.position.set(dwx + (computer.door.side === 'E' ? 0.18 : -0.18), H * 0.6, dwz - 1.6 - (g - 2) * 1.2);
      }
      this._computerGroup.add(strip);
    }
    for (const c of shellCollisionCircles(computer.plan, computer.door)) {
      const circle = { ...c };
      this._collisionCircles.push(circle);
      this._computerCircles.push(circle);
    }
    this.clearGroundCoverIn(computer.plan, computer._gridFns);
  }

  /** Remove collisionless scatter (grass/flowers/bushes) whose position falls
   *  inside the plan's chunks — trees and collision-bearing props instead veto
   *  placement via the validity mask. */
  clearGroundCoverIn(plan, { worldToChunk, chunkKey }) {
    const doomed = [];
    this.group.traverse(o => {
      if (!o.userData?.isGroundCover) return;
      const p = o.getWorldPosition(new THREE.Vector3());
      const [cx, cz] = worldToChunk(p.x, p.z);
      if (plan.has(chunkKey(cx, cz))) doomed.push(o);
    });
    for (const o of doomed) o.parent?.remove(o);
  }

  /**
   * Worn trail from the landing pad to the computer's door. Lives in its own
   * scene-level group (not env.group) so a plan edit can rebuild it without a
   * zone rebuild; cleared/rebuilt alongside buildComputerShell.
   */
  buildComputerPath(computer) {
    if (!this._computerPathGroup) {
      this._computerPathGroup = new THREE.Group();
      this.scene.add(this._computerPathGroup);
    }
    while (this._computerPathGroup.children.length > 0) {
      this._computerPathGroup.remove(this._computerPathGroup.children[0]);
    }
    if (this.currentZone !== 'landingSite' || !computer.hasFounded()) return;
    const [dx, dz] = computer.doorOutside();
    addPathRibbon(this, [[1.5, 1.5], [(1.5 + dx) / 2, (1.5 + dz) / 2], [dx, dz]], {
      width: 1.6, color: 0x8a7d6b, groundColor: 0x5a8c3c, strength: 1.0, // 0x5a8c3c = GROUND_HEX (LandingSite/index.js)
      seed: 90815, parent: this._computerPathGroup,
    });
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
      meltwaterRift: 'Meltwater Rift',
      atlantis: 'Atlantis',
      labyrinth: 'The Labyrinth',
      cinderforge: 'The Cinderforge',
      spaceship: 'Spaceship Interior',
      workspace: 'Workspace',
      depths: 'The Depths',
      homeSylva: "Sylva's Den",
      homeBram: "Bram's Lodge",
      homeSprig: "Sprig's Burrow",
      computerCore: 'The Computer',
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
        // Outer meadow — gives the newly dressed ring past the treeline a
        // reason to walk out to it rather than just something to look at.
        { x: -19, z: 9, type: 'timber' },
        { x: 21, z: -14, type: 'stone' },
        { x: 24, z: 6, type: 'copper' },
        // On the lookout knoll's summit ledge — the climb's payoff.
        { x: 14, z: -24, type: 'copper', y: 3.0, richness: 2 },
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
        // Canopy layer — richer than their floor cousins: the climb should pay.
        // Gathering Bough (6.6), then one node per few pads along the grand loop.
        { x: 2.8, z: -15.9, type: 'resin', requiredTool: 'harvestBlade', y: 6.6, richness: 2 },
        { x: 0.4, z: -18.4, type: 'fiber', y: 6.6, richness: 2 },
        { x: -13.8, z: -13.2, type: 'timber', y: 7.4, richness: 2 },                              // West Bough
        { x: -17.3, z: -1.2, type: 'carbon_biomass', requiredTool: 'harvestBlade', y: 6.8, richness: 2 }, // Hamlet Overlook
        { x: 6.8, z: 4.1, type: 'silica', requiredTool: 'harvestBlade', y: 6.9, richness: 2 },    // Idol Watch
        { x: -5.1, z: -31.5, type: 'resin', requiredTool: 'harvestBlade', y: 6.8, richness: 2 },  // North Reach apex
        // River Expanse — one node per band, two on Riversend Crown (the
        // expanse's reward; a bloomfang stands guard)
        { x: 6.6, z: -47.4, type: 'fiber', y: 6.7, richness: 2 },                                 // band 1
        { x: 0.4, z: -64.6, type: 'timber', y: 6.8, richness: 2 },                                // band 2
        { x: -11.6, z: -79.9, type: 'carbon_biomass', requiredTool: 'harvestBlade', y: 6.9, richness: 2 }, // band 3
        { x: -0.9, z: -96.4, type: 'quartz', requiredTool: 'harvestBlade', y: 7.5, richness: 2 }, // Riversend
        { x: 1.1, z: -97.6, type: 'resin', requiredTool: 'harvestBlade', y: 7.5, richness: 2 },   // Riversend
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
      // Rift-native gatherables: obsidian in the cooled melt seams (the
      // Cryo-Pick's thermal edge is what cuts volcanic glass), embermoss by
      // the vents, one silver seam tying it to the hollow economy above.
      case 'meltwaterRift': return [
        { x: 6.5, z: 11, type: 'obsidian', requiredTool: 'cryoPick' },
        { x: -12, z: 2.5, type: 'obsidian', requiredTool: 'cryoPick' },
        { x: 2.5, z: 7.5, type: 'embermoss' },
        { x: -10.5, z: 14.5, type: 'embermoss' },
        { x: 0, z: 5, type: 'silver' },
      ];
      // Drowned-city economy: dive-gated glass sands and quartz in the pools,
      // silver from the old treasuries. Same gatherables the Lagoon taught, one
      // world deeper — no new material types, the depth is in the surroundings.
      case 'atlantis': return [
        { x: 10, z: 6.5, type: 'silica', requiredTool: 'diveTool' },
        { x: -10, z: -5, type: 'silica', requiredTool: 'diveTool' },
        { x: 14, z: -9, type: 'silica_sand' },
        { x: -16.5, z: 10.5, type: 'silica_sand' },
        { x: 5, z: 15.5, type: 'quartz', requiredTool: 'diveTool' },
        { x: -5.5, z: 17, type: 'silver' },
        { x: 17.5, z: 4.5, type: 'silver' },
      ];
      // The Labyrinth — deep-vein stone: every node sits in a pocket the maze
      // makes you earn. Coordinates are floor cells of zones/Labyrinth/layout.js.
      case 'labyrinth': return [
        { x: -30, z: -5, type: 'quartz', requiredTool: 'harvestBlade' },        // west run
        { x: 25, z: -25, type: 'quartz', requiredTool: 'harvestBlade' },        // well yard
        { x: -27, z: -18, type: 'silica', requiredTool: 'harvestBlade' },       // fountain court
        { x: -25, z: 31.6, type: 'silver' },                                    // past the spike pit
        { x: 30, z: -28.5, type: 'silver', richness: 2 },                       // NE tomb alcove
        { x: 4, z: -30.5, type: 'obsidian', requiredTool: 'cryoPick', richness: 2 }, // the sanctum
        { x: -40, z: -40, type: 'quartz', requiredTool: 'harvestBlade', richness: 2 }, // NW corner of the outer walk
        { x: 40, z: -15, type: 'silica', requiredTool: 'harvestBlade' },        // east arc of the outer walk
      ];
      // The Cinderforge — forge-vein ore: the maze's pockets pay out in metal
      // and volcanic glass. Coordinates are floor cells of
      // zones/Cinderforge/layout.js (mirrored in cinderforgeLayout.test.js).
      case 'cinderforge': return [
        { x: -25, z: -30, type: 'obsidian', requiredTool: 'cryoPick', richness: 2 }, // the anvil sanctum
        { x: 25, z: 5, type: 'obsidian', requiredTool: 'cryoPick' },            // east loop
        { x: -15, z: 30, type: 'embermoss' },                                   // south pocket
        { x: 15, z: -30, type: 'tungsten', requiredTool: 'cryoPick' },          // slag vault
        { x: -25, z: 25, type: 'copper' },                                      // west loop
        { x: 20, z: 30, type: 'quartz', requiredTool: 'harvestBlade' },         // SE pocket
      ];
      case 'spaceship': return []; // no gatherables inside the ship
      case 'workspace': return []; // no gatherables in the workspace
      case 'depths': return [];   // pure mining zone — no resource nodes
      case 'homeSylva': case 'homeBram': case 'homeSprig': return []; // furnished rooms only
      case 'computerCore': return []; // machine room — no resource nodes
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
      // T1 — native Landing Site pack. Grazers close in where a new player
      // first wanders, the quicker Burrfangs sit further out, and the Scrap
      // Tyrant holds the trampled arena in the far east corner.
      case 'landingSite': return [
        { x: 14, z: 10,  archetype: 'mossback' },
        { x: -12, z: 16, archetype: 'mossback' },
        { x: 24, z: -12, archetype: 'burrfang' },
        { x: -22, z: 6,  archetype: 'burrfang' },
        { x: 8,  z: 24,  archetype: 'stiltbeak' },
        { x: -26, z: -6, archetype: 'stiltbeak' },
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
        // Canopy level — short leashes so nothing patrols off a pad rim
        // (enemies don't height-resolve). Duskdarts prowl the gathering pads,
        // the Bloomfang guards the Sky Altar, a Vineclaw hunts the East Rise.
        { x: 3.2, z: -14.2, archetype: 'duskdart', y: 6.6, patrolR: 0.8 },
        { x: -5.4, z: 1.6, archetype: 'duskdart', y: 6.2, patrolR: 1.0 },   // Mid-Jungle Bough
        { x: 13.6, z: 0.8, archetype: 'vineclaw', y: 7.6, patrolR: 1.0 },   // East Rise
        { x: -6.1, z: -20.5, archetype: 'bloomfang', y: 7.8, patrolR: 0.8 },
        { x: 4.3, z: -28.1, archetype: 'duskdart', y: 7.4, patrolR: 0.8 },  // Kapok Rise
        // River Expanse — a duskdart per crossing pad, the Riversend guard
        { x: -0.6, z: -42.6, archetype: 'duskdart', y: 7.2, patrolR: 0.8 },
        { x: 9.9, z: -59.1, archetype: 'duskdart', y: 7.3, patrolR: 0.8 },
        { x: -2.6, z: -75.6, archetype: 'duskdart', y: 7.4, patrolR: 0.8 },
        { x: 0.8, z: -96.2, archetype: 'bloomfang', y: 7.5, patrolR: 0.9 },
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
      // Sparse hollow fauna drifts down the rift — salamanders to the warmth,
      // a bat over the chasm updraft. Deliberately no boss: the rift is a
      // junction zone; its two sealed thresholds are the destinations.
      case 'meltwaterRift': return [
        { x: 8, z: -3,    archetype: 'cryolisk' },
        { x: -7, z: 1,    archetype: 'cryolisk' },
        { x: 8.5, z: 13.8, archetype: 'chillwing' },
      ];
      // What the sea left behind: armored crabs deep in the ruin quarters,
      // shore-diggers on the wreck sand, blubberfins hauled out by the pools.
      // Deliberately no boss yet — the Unmaker's clearance is the price of
      // entry, and the city itself is the destination this round.
      case 'atlantis': return [
        { x: 11, z: 11,     archetype: 'cavecrab' },
        { x: -12, z: -9,    archetype: 'cavecrab' },
        { x: 14, z: -13.5,  archetype: 'spoonvark' },
        { x: -15, z: 13,    archetype: 'spoonvark' },
        { x: 6, z: 18,      archetype: 'blubberfin' },
        { x: -6.5, z: -13.5, archetype: 'blubberfin' },
      ];
      // The Labyrinth — stone-dwellers prowling the corridors. Tight leashes:
      // corridors are 5 units wide, so a default patrol would clip the walls.
      // No resident boss this round — the Minotaur is a statue. For now.
      case 'labyrinth': return [
        { x: -20, z: 10,  archetype: 'cavecrab',    patrolR: 1.6 },
        { x: 20, z: -5,   archetype: 'cavecrab',    patrolR: 1.6 },
        { x: -5, z: 15,   archetype: 'scalerunner', patrolR: 1.8 },
        { x: 25, z: 0,    archetype: 'scalerunner', patrolR: 1.6 },
        { x: -10, z: -30, archetype: 'duneplate',   patrolR: 1.4 }, // the sanctum's warden
        { x: -40, z: 0,   archetype: 'cavecrab',    patrolR: 1.6 }, // the long dark, west arc
        { x: 40, z: 10,   archetype: 'scalerunner', patrolR: 1.6 }, // east arc of the outer walk
      ];
      // The Cinderforge — heat-hardened stone-dwellers. Tight leashes:
      // corridors are 5 units wide, so a default patrol would clip the walls.
      // No resident boss — the Forgemaster is a statue. For now.
      case 'cinderforge': return [
        { x: -15, z: 15,  archetype: 'cavecrab',    patrolR: 1.6 },
        { x: 25, z: 0,    archetype: 'cavecrab',    patrolR: 1.6 },
        { x: 0, z: 15,    archetype: 'scalerunner', patrolR: 1.8 },
        { x: -30, z: -5,  archetype: 'scalerunner', patrolR: 1.6 },
        { x: 10, z: -10,  archetype: 'duneplate',   patrolR: 1.6 }, // the crucible road
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
      case 'computerCore': return []; // machine room — no enemies
      default: return [];
    }
  }

  // ── Landing Site ─────────────── see js/scene/zones/LandingSite.js ──────────

  _addGround(color, opts = {}) {
    // Ground covers the zone's declared bounds (CONFIG.ZONE_BOUNDS), which for
    // an undeclared zone is the GROUND_SIZE square it always was.
    // opts.colorAt(x, z) → [r,g,b] linear: build a subdivided vertex-colored
    // plane instead of a flat one (zone-wide palette gradients — the Maw's
    // teal→warm-green north; same convention as the Mine's merged floor).
    const b = this.bounds;
    const w = b.maxX - b.minX, d = b.maxZ - b.minZ;
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    let geo, mat;
    if (opts.colorAt) {
      geo = new THREE.PlaneGeometry(w, d, Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(d / 2)));
      const pos = geo.getAttribute('position');
      const cols = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        // plane-local (x, y) → world (x + cx, cz − y) after the −π/2 X-rotation
        const [r, g, bl] = opts.colorAt(pos.getX(i) + cx, cz - pos.getY(i));
        cols[i * 3] = r; cols[i * 3 + 1] = g; cols[i * 3 + 2] = bl;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      mat = createToonMaterial(0xffffff, { vertexColors: true });
    } else {
      geo = new THREE.PlaneGeometry(w, d);
      mat = createToonMaterial(color);
    }
    const ground = new THREE.Mesh(geo, mat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(cx, 0, cz);
    ground.receiveShadow = true;
    this.group.add(ground);

    // Subtle grid overlay so players can read distances and plan movement.
    // Kept square and centred on the world origin whatever the zone footprint,
    // so grid lines stay at odd world coords for any bounds.
    const reach = Math.max(Math.abs(b.minX), Math.abs(b.maxX), Math.abs(b.minZ), Math.abs(b.maxZ));
    const gridSize = Math.ceil(reach) * 2; // always even → 2 units per cell
    const grid = new THREE.GridHelper(gridSize, gridSize / 2, 0x000000, 0x000000);
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

  // The Ancient World Gate is a VERTICAL walk-through ring (v2, 2026-07-28):
  // the player physically passes through the energy membrane to change zones
  // (main.js runs the crossing test in js/scene/portalPass.js). `scale`
  // shrinks the whole gate for indoor placements (spaceship/workspace).
  // `spawnOverride` ([x, z], optional) lands the traveller at a specific
  // point in the TARGET zone instead of its default spawn — for gate pairs
  // that are one doorway (Labyrinth ↔ Atlantis' end chamber), same
  // convention as _addDoorway.
  _addPortal(x, z, targetZone, ppRequired, label, scale = 1, spawnOverride = null) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    this.group.add(group);

    const portal = {
      position: new THREE.Vector3(x, 0, z),
      targetZone,
      ppRequired,
      label,
      scale,
      spawnOverride,
      mesh: group,
      energyMat: null,   // membrane material (swirl shader), tinted by refreshPortalAccess()
      hasModel: false,
      // Kept in sync by refreshPortalAccess() so UI (the nav-aid chips) can show
      // a gate's locked state without re-deriving the unlock rules.
      accessible: ppRequired === 0,
      // Aperture blocker while the gate is locked. refreshPortalAccess() opens
      // it by setting r negative (never collides); the cached collision array
      // holds this same object, so the in-place mutation propagates.
      lockCircle: { x, z, r: ppRequired === 0 ? -1 : 1.35 * scale },
    };
    // Attaches the Ancient World Gate GLB. On the very first zone the models are
    // still loading, so this no-ops here and _attachPortalModel runs again once
    // _modelsReady resolves (see constructor).
    this._attachPortalModel(portal);

    // Until the GLB attaches (first-zone load race, or a failed download) show a
    // glowing upright ring so a gate is never invisible; removed on attach.
    if (!portal.hasModel) {
      const fb = new THREE.Group();
      const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.15 * scale, 1.4 * scale, 40), ringMat);
      ring.position.y = 1.5 * scale;
      fb.add(ring);
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(1.15 * scale, 40),
        new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.25, side: THREE.DoubleSide })
      );
      disc.position.y = 1.5 * scale;
      fb.add(disc);
      portal.fallbackMesh = fb;
      portal.energyMat = ringMat; // refreshPortalAccess tints the fallback too
      group.add(fb);
    }

    // The ring's footings are solid; the aperture between them is open so the
    // player can pass through (the lockCircle above seals it while locked).
    this._collisionCircles.push({ x: x - 1.62 * scale, z, r: 0.55 * scale });
    this._collisionCircles.push({ x: x + 1.62 * scale, z, r: 0.55 * scale });
    this._collisionCircles.push(portal.lockCircle);

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
  _addCaveEntrance(x, z, targetZone, label, opts = {}) {
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
      // Walk-activated doors (the Starwing's bay) fire the switch on entering
      // triggerR — no key press. main.js arms the crossing once the player is
      // seen outside the radius, so a spawn inside it can never insta-fire.
      walkIn: !!opts.walkIn,
      triggerR: opts.triggerR || 2.5,
      // Optional [x, z] landing point in the TARGET zone (the computer's door
      // uses it so entering lands just inside the doorway).
      spawnOverride: opts.spawnOverride || null,
    });
  }

  /**
   * A sealed future-zone threshold. Same record shape as _addCaveEntrance so
   * the main.js proximity loop picks it up, but flagged `sealed`: walking up
   * shows the hint text instead of an enter action, and switchZone can never
   * fire (no target zone exists yet). The builder supplies all visuals and
   * collision. When the zone behind it ships, replace the builder's
   * _addSealedGate call with _addCaveEntrance/_addPortal at the same spot.
   */
  _addSealedGate(x, z, label, hint) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    this.group.add(group);
    this._zonePortals.push({
      position: new THREE.Vector3(x, 0, z),
      targetZone: null,
      ppRequired: 0,
      label,
      hint,
      mesh: group,
      energyMat: null,
      hasModel: true,   // nothing to late-attach
      noGate: true,
      sealed: true,
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
    const model = cloneModel(this._glb.portal, portal.scale || 1);
    model.position.y = 0;
    model.traverse(n => {
      if (!n.isMesh) return;
      // The membrane gets the animated swirl shader (per-portal instance so
      // each gate tints its own locked/unlocked colour). uTime advances via a
      // spinner entry — cleared on zone switch alongside the portal itself.
      if (/PortalEnergy/i.test(n.material?.name) || /PortalMembrane/i.test(n.name)) {
        const mat = createPortalEnergyMaterial(1.5);
        n.material = mat;
        portal.energyMat = mat;
        this._spinners.push({ update: (d) => { mat.uniforms.uTime.value += d; } });
        return;
      }
      // The floating glyph ring spins in the gate plane (its local z axis).
      if (/RuneRing/i.test(n.name)) {
        this._spinners.push({ mesh: n, axis: 'z', speed: 0.3 });
        return;
      }
      // Stone parts: re-shade to toon (the GLB's plain-color PBR materials
      // render ~3x darker than the toon-tuned zone lights intend — the 1/π
      // energy-conserving diffuse), then ink. A hull on the membrane disc
      // would paint it solid black (thin-shell tent lesson), and glow parts
      // never get hulls.
      if (/^Stone/i.test(n.material?.name)) {
        n.material = createToonMaterial(n.material.color.getHex());
        addOutline(n, 0.04);
      }
    });
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
      portal.accessible = accessible;
      const col = accessible ? 0x00ffcc : 0xff7a1a;
      const mat = portal.energyMat;
      if (mat) {
        if (mat.uniforms && mat.uniforms.uColor) {
          mat.uniforms.uColor.value.setHex(col); // membrane swirl shader
        } else {
          mat.color.setHex(col);                 // pre-model fallback ring
          if (mat.emissive) mat.emissive.setHex(col);
        }
      }
      // Open/seal the walk-through aperture (r < 0 never collides).
      if (portal.lockCircle) {
        portal.lockCircle.r = accessible ? -1 : 1.35 * (portal.scale || 1);
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

  /** 6×6 chunk-placement cursor for the computer build mode (construct-cursor
   *  pattern at chunk scale). Teal = valid, red = invalid. */
  updateChunkCursor(x, z, ok, delta) {
    if (!this._chunkCursor) {
      const mat = createToonMaterial(0x00ffcc);
      mat.transparent = true; mat.opacity = 0.3;
      const tile = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), mat);
      tile.rotation.x = -Math.PI / 2; tile.position.y = 0.05;
      this._chunkCursor = new THREE.Group();
      this._chunkCursor.add(tile);
      this._chunkCursorMat = mat;
      this.scene.add(this._chunkCursor);
    }
    this._chunkCursor.visible = true;
    this._chunkCursor.position.set(x, 0, z);
    this._chunkCursorMat.color.setHex(ok ? 0x00ffcc : 0xff4422);
    this._chunkCursorPulseT = ((this._chunkCursorPulseT || 0) + delta * 3.0) % (Math.PI * 2);
    this._chunkCursorMat.opacity = 0.28 + 0.22 * Math.sin(this._chunkCursorPulseT);
  }

  hideChunkCursor() { if (this._chunkCursor) this._chunkCursor.visible = false; }

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

  // (_addReturnBeacon removed 2026-07-28 — the old-model-era cyan wayfinding
  // spike impaled the new 3-unit vertical gates; the gate itself plus the
  // off-screen nav-aid chips now carry that job.)
}
