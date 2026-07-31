/**
 * modelKeys.js — the set of GLB keys a layout may reference.
 *
 * These are the keys of `Environment._glb`, which is assembled positionally
 * from the `loadModel()` list in the Environment constructor. Keeping a named
 * copy here lets the layout validator reject unknown model keys at `npm test`
 * time instead of in the browser.
 *
 * This list is checked against Environment.js's actual `this._glb = { … }`
 * literal by tests/systems/biomeLayout.test.js, so adding a model without
 * adding it here fails the suite rather than drifting silently.
 */
export const MODEL_KEYS = Object.freeze([
  // Landing Site / shared props
  'treeH', 'treeI', 'treeJ', 'treeD', 'treeH2',
  'rock', 'barrel', 'crate', 'tower', 'pc', 'scrapper',
  'boulder', 'blueBoulder', 'redRock', 'firePlant', 'mossyBoulder',
  'portal', 'ship',

  // Spaceship interior — hull, stations, dressing
  'shipShell',
  'stFabricator', 'stOffload', 'stCharging', 'stDroneMonitor', 'stAscension',
  'stMastery', 'stCombatRig', 'stTrainingConsole', 'stHoloPylon',
  'shipPlant', 'crateStack', 'pipeManifold',

  // Frozen Tundra
  'snowPine', 'snowPineSquat', 'tundraDeadTree', 'iceCrystal', 'snowBoulder',
  'frozenShrine',
  // …the glacier round: stepped terraces, crevasse walls, spans, the arch
  'tundraSastrugi', 'tundraSastrugiLong', 'tundraShelfWall', 'tundraRiftWall',
  'tundraIceBridge', 'tundraIceArch',

  // The Starwing at the Landing Site — boarded through its open cargo bay
  // rather than a portal — and the ridge with the mine adit cut into it.
  'starwing', 'landMountain',

  // Glacial Hollow
  'hollowCaveMouth', 'hollowStalagmites', 'hollowIceCrystal', 'hollowFrostShroom',
  'hollowIceRubble', 'hollowMammothSkull', 'hollowBoneArch',

  // Verdant Maw
  'mawCanopyTree', 'mawBanyanTree', 'mawFernCluster', 'mawPlant',
  'mawMossIdol', 'mawMossBoulder', 'mawGlowShroom',

  // Maw-tender hamlet — homes, NPCs, interior furniture
  'homeSylva', 'homeBram', 'homeSprig',
  'npcSylva', 'npcBram', 'npcSprig',
  'furnSylvaCot', 'furnSylvaRack', 'furnSylvaTable',
  'furnBramBench', 'furnBramBed', 'furnBramRack',
  'furnSprigBench', 'furnSprigHammock', 'furnSprigPots',

  // Landing Site native pack — ground cover, camp, mine adit, survivor NPCs
  'landGrass', 'landFlowers', 'landBush', 'landLog',
  'landAdit', 'landOutcrop', 'landTent', 'landCampfire',
  'npcMara', 'npcFinch',

  // The Labyrinth — ancient-stone-maze kit (walls generated from the cell map)
  'labWallStraight', 'labArchGate', 'labMinotaur', 'labShrine', 'labFountain',
  'labWell', 'labBrazier', 'labColumn', 'labBrokenColumn', 'labRuneStele',
  'labGargoyle', 'labPedestal', 'labTombChest', 'labBullSkull', 'labSpikeTrap',
  'labRubble', 'labBones', 'npcWarden', 'npcDelver',

  // The Cinderforge — volcanic forge-maze kit (walls generated from the cell map)
  'forgeWallStraight', 'forgeArchGate', 'forgeGolem', 'forgeAnvil',
  'forgeCrucible', 'forgeVent', 'forgeBrazier', 'forgeColumn',
  'forgeBrokenColumn', 'forgeRuneStele', 'forgeGargoyle', 'forgeIngotStack',
  'forgeRubble',

  // Atlantis — drowned-city ruins, guardians, water flora
  'atlGuardianHead', 'atlTempleDome', 'atlColumn', 'atlColumnBroken',
  'atlArchway', 'atlCrystalHeart', 'atlKelp', 'atlCoral',
  'atlShipwreck', 'atlStele', 'atlBrazier', 'atlAmphora',
  'atlStoneFish', 'atlRuinWall',

  // Verdant Maw canopy (Pandora ascent) — Hometree, pads, bridges, Spirit Tree
  'pandoraHometree', 'pandoraCanopyPad', 'pandoraBranchBridge', 'pandoraSpiritTree',

  // Pandora flora (Rodin) + long loop bridge + pad variant B + canopy
  // enclosure dressing + lookout knoll
  'pandoraHelicoradian', 'pandoraPuffball', 'pandoraBranchBridgeLong',
  'pandoraCanopyPad2', 'jungleCanopyMass', 'pandoraVineCurtain', 'landKnoll',
  'pandoraRootGate', 'pandoraGreatTree', 'pandoraRootSpire',

  // The Emberglade (beyond Riversend)
  'emberLanternTree', 'emberGladeArch', 'pandoraSkyIsle',

  // Transitional-phase flora (Raya/Kumandra palette, northern bands)
  'jungleBambooGrove', 'jungleGoldTree',
]);
