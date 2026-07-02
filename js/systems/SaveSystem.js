import { CONFIG } from '../config.js';

const SAVE_VERSION = 7;

export class SaveSystem {
  constructor(systems) {
    this.systems = systems;
  }

  /**
   * Build a serializable snapshot of all game state.
   */
  _buildSaveData(currentZone, playerX, playerZ) {
    const {
      pp, stats, inventory, pedometer, drones, equipment, gameStats,
      achievements, minigame, ascension, autoCombat, drill,
      techTree, mastery, sync, factory, codex, augmentations,
      mathematician, timeWarp, modifiers, missionTracker, questSystem, assembly,
      extractor, processingNodes, tripartite,
    } = this.systems;

    const data = {
      version: SAVE_VERSION,
      timestamp: Date.now(),

      zone: currentZone,
      playerX,
      playerZ,

      drill: drill ? drill.serialize() : null,
      pp: {
        ppTotal: pp.ppTotal,
        // Persist the raw (pre-multiplier) cap. Tripartite & other systems re-apply their multipliers on load.
        ppCap: pp._baseCap ?? pp.ppCap,
        prestigeCount: pp.prestigeCount,
        rateModifiers: Object.fromEntries(
          Object.entries(pp._rateModifiers).filter(([k]) => !k.startsWith('_tempBoost_') && !k.startsWith('tripartite_'))
        ),
      },

      stats: {
        levels: {},
        currentHP: stats.currentHP,
        currentFP: stats.currentFP,
        currentEnergy: stats.currentEnergy,
      },

      inventory: {
        materials: { ...inventory.materials },
        consumables: { ...inventory.consumables },
        tools: { ...inventory.tools },
        storageItems: { ...inventory.storageItems },
        equipmentBag: inventory.equipmentBag.map(item => ({ ...item })),
      },

      pedometer: {
        totalSteps: pedometer.totalSteps,
        ppBonusPerStep: pedometer._ppBonusPerStep,
        ppBonusPurchases: pedometer._ppBonusPurchases,
        nextBonusCost: pedometer._nextBonusCost,
        trackCount: pedometer._trackCount,
        nextTrackCost: pedometer._nextTrackCost,
        pendingTracks: pedometer._pendingTracks,
        infiniteTracks: pedometer.infiniteTracks,
        placedTracks: pedometer._placedTracks.map(t => ({ zone: t.zone, x: t.x, z: t.z })),
        statStepPurchases: { ...pedometer._statStepPurchases },
        totalStatPurchases: pedometer._totalStatPurchases,
        nextStatCost: pedometer._nextStatCost,
        unlockedZones: [...pedometer._unlockedZones],
      },

      drones: {
        list: drones.drones.map(d => ({
          id: d.id,
          name: d.name,
          assignedMaterial: d.assignedMaterial,
          efficiency: d.efficiency,
          gatherTimer: d.gatherTimer,
        })),
        upgradeCost: drones.upgradeCost,
        missions: drones.getMissions().filter(m => !m.done).map(m => ({ ...m })),
      },

      equipment: {
        slots: {},
      },

      gameStats: {
        enemiesDefeated: gameStats.enemiesDefeated,
        defeats: gameStats.defeats,
        actionsTaken: gameStats.actionsTaken,
        highestHit: gameStats.highestHit,
        totalStepsTaken: gameStats.totalStepsTaken,
        resourcesGathered: gameStats.resourcesGathered,
        miningActions: gameStats.miningActions,
        visitedZones: [...gameStats._visitedZones],
      },

      achievements: achievements ? achievements.serialize() : null,
      minigame: minigame ? minigame.serialize() : null,
      ascension: ascension ? ascension.serialize() : null,
      autoCombatEnabled: autoCombat ? autoCombat.enabled : false,
      techTree: techTree ? techTree.serialize() : null,
      mastery: mastery ? mastery.serialize() : null,
      factory: factory ? factory.serialize() : null,
      assembly: assembly ? assembly.serialize() : null,
      extractor: extractor ? extractor.serialize() : null,
      processingNodes: processingNodes ? processingNodes.serialize() : null,
      codex: codex ? codex.serialize() : null,
      augmentations: augmentations ? augmentations.serialize() : null,
      sync: sync ? {
        version: sync.version,
        queuedEvents: sync.queue.length,
      } : null,

      mathematician: mathematician ? mathematician.serialize() : null,
      timeWarp:      timeWarp ? timeWarp.serialize() : null,
      modifiers:     modifiers ? modifiers.serialize() : null,
      missionTracker: missionTracker ? missionTracker.serialize() : null,
      questSystem:    questSystem    ? questSystem.serialize()    : null,
      tripartite:    tripartite    ? tripartite.serialize()    : null,
    };

    for (const name of stats.statNames) {
      data.stats.levels[name] = {
        level: stats.stats[name].level,
        exp: stats.stats[name].exp,
      };
    }

    for (const [slot, item] of Object.entries(equipment.slots)) {
      data.equipment.slots[slot] = item ? { ...item } : null;
    }

    return data;
  }

  /**
   * Download session as a JSON file. Returns the filename used.
   */
  saveToFile(currentZone, playerX, playerZ, sessionName) {
    const data = this._buildSaveData(currentZone, playerX, playerZ);
    data.sessionName = sessionName;

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const safeName = sessionName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `${safeName}.json`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return filename;
  }

  /**
   * Load session data from a File object (from file input).
   * Returns a Promise that resolves to parsed data or null.
   */
  loadFromFile(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          resolve(data);
        } catch (e) {
          console.error('Failed to parse session file:', e);
          resolve(null);
        }
      };
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    });
  }

  /**
   * Apply loaded data to all systems. Returns { zone, playerX, playerZ } for
   * the caller to handle zone switching and player teleport.
   */
  apply(data) {
    if (!data || !data.version) return null;

    const {
      pp, stats, inventory, pedometer, drones, equipment, gameStats,
      achievements, minigame, ascension, autoCombat, drill,
      techTree, mastery, sync, factory, codex, augmentations,
      mathematician, timeWarp, modifiers, missionTracker, questSystem, assembly,
      extractor, processingNodes, tripartite,
    } = this.systems;

    // Drill System
    if (drill && data.drill) drill.deserialize(data.drill);

    // PP System
    pp.ppTotal = data.pp.ppTotal;
    pp.setBaseCap(data.pp.ppCap || CONFIG.INITIAL_PP_CAP);
    pp.prestigeCount = data.pp.prestigeCount || 0;
    pp.ppRate = CONFIG.INITIAL_PP_RATE;
    pp._rateModifiers = {};
    pp._capMultipliers = {};
    pp._recomputeCap();
    for (const [key, val] of Object.entries(data.pp.rateModifiers)) {
      pp.setModifier(key, val);
    }

    // Stats System — remove equipment bonuses first so we set raw levels
    for (const slot of Object.keys(equipment.slots)) {
      equipment.unequip(slot);
    }
    for (const [name, { level, exp }] of Object.entries(data.stats.levels)) {
      if (stats.stats[name]) {
        stats.stats[name].level = level;
        stats.stats[name].exp = exp;
      }
    }
    stats.currentHP = data.stats.currentHP;
    stats.currentFP = data.stats.currentFP;
    stats.currentEnergy = data.stats.currentEnergy ?? stats.maxEnergy;

    // Inventory
    for (const [mat, qty] of Object.entries(data.inventory.materials)) {
      if (mat in inventory.materials) inventory.materials[mat] = qty;
    }
    for (const [key, qty] of Object.entries(data.inventory.consumables)) {
      if (key in inventory.consumables) inventory.consumables[key] = qty;
    }
    inventory.tools = { ...data.inventory.tools };
    // Migrate old boolean tool values to durability numbers
    for (const [key, val] of Object.entries(inventory.tools)) {
      if (val === true && inventory.constructor.TOOL_MAX_DURABILITY?.[key]) {
        inventory.tools[key] = inventory.constructor.TOOL_MAX_DURABILITY[key];
      }
    }
    // Storage container pool (v3+)
    if (data.inventory.storageItems) {
      for (const [mat, qty] of Object.entries(data.inventory.storageItems)) {
        if (mat in inventory.storageItems) inventory.storageItems[mat] = qty;
      }
    }
    // Equipment bag (v3+)
    inventory.equipmentBag = (data.inventory.equipmentBag || []).map(item => ({ ...item }));

    // Pedometer
    pedometer.totalSteps = data.pedometer.totalSteps;
    pedometer._ppBonusPerStep = data.pedometer.ppBonusPerStep;
    pedometer._ppBonusPurchases = data.pedometer.ppBonusPurchases;
    pedometer._nextBonusCost = data.pedometer.nextBonusCost;
    pedometer._trackCount = data.pedometer.trackCount;
    pedometer._nextTrackCost = data.pedometer.nextTrackCost;
    pedometer._pendingTracks = data.pedometer.pendingTracks;
    pedometer.infiniteTracks = data.pedometer.infiniteTracks ?? false;
    pedometer._placedTracks = data.pedometer.placedTracks.map(t => ({ zone: t.zone, x: t.x, z: t.z }));
    pedometer._statStepPurchases = { ...data.pedometer.statStepPurchases };
    pedometer._totalStatPurchases = data.pedometer.totalStatPurchases;
    pedometer._nextStatCost = data.pedometer.nextStatCost;
    pedometer._unlockedZones = new Set(data.pedometer.unlockedZones);

    // Drones
    drones.drones = data.drones.list.map(d => ({
      id: d.id,
      name: d.name,
      assignedMaterial: d.assignedMaterial,
      efficiency: d.efficiency,
      gatherTimer: d.gatherTimer,
    }));
    drones.upgradeCost = data.drones.upgradeCost;
    if (data.drones.missions) drones._missions = data.drones.missions.map(m => ({ ...m }));

    // Equipment — re-equip after stats are set to raw levels (slots cleared above, no displacement)
    for (const [slot, item] of Object.entries(data.equipment.slots)) {
      if (item) equipment.equip({ ...item });
    }

    // Game Statistics
    if (data.gameStats) {
      gameStats.enemiesDefeated = data.gameStats.enemiesDefeated || 0;
      gameStats.defeats = data.gameStats.defeats || 0;
      gameStats.actionsTaken = data.gameStats.actionsTaken || 0;
      gameStats.highestHit = data.gameStats.highestHit || 0;
      gameStats.totalStepsTaken = data.gameStats.totalStepsTaken || 0;
      gameStats.resourcesGathered = data.gameStats.resourcesGathered || 0;
      gameStats.miningActions = data.gameStats.miningActions || 0;
      gameStats._visitedZones = new Set(data.gameStats.visitedZones || []);
    }

    // New systems
    if (achievements && data.achievements) achievements.deserialize(data.achievements);
    if (minigame && data.minigame) minigame.deserialize(data.minigame);
    if (ascension && data.ascension) ascension.deserialize(data.ascension);
    if (autoCombat && data.autoCombatEnabled !== undefined) autoCombat.enabled = data.autoCombatEnabled;
    if (techTree && data.techTree) techTree.deserialize(data.techTree);
    if (mastery && data.mastery) mastery.deserialize(data.mastery);
    if (factory && data.factory) factory.deserialize(data.factory);
    if (assembly && data.assembly) assembly.deserialize(data.assembly);
    if (extractor && data.extractor) extractor.deserialize(data.extractor);
    if (processingNodes && data.processingNodes) processingNodes.deserialize(data.processingNodes);
    if (codex && data.codex) codex.load(data.codex);
    if (augmentations && data.augmentations) {
      augmentations.load(data.augmentations);
      augmentations.applyBonuses(stats);
    }
    if (sync && data.sync?.version !== undefined) sync.version = data.sync.version;

    if (mathematician && data.mathematician) mathematician.load(data.mathematician);
    if (timeWarp && data.timeWarp) timeWarp.load(data.timeWarp);
    if (modifiers && data.modifiers) modifiers.load(data.modifiers);
    if (missionTracker && data.missionTracker) missionTracker.load(data.missionTracker);
    if (questSystem    && data.questSystem)    questSystem.load(data.questSystem);
    if (tripartite     && data.tripartite)     tripartite.deserialize(data.tripartite);
    // Legacy: migrate old taskSystem saves (no-op if not present)


    // Sync ascension multiplier
    if (ascension) pp.globalMultiplier = ascension.ppMultiplier;

    // Clamp HP and energy to max after everything is applied
    stats.currentHP = Math.min(stats.currentHP, stats.maxHP);
    stats.currentEnergy = Math.min(stats.currentEnergy, stats.maxEnergy);

    return {
      zone: data.zone,
      playerX: data.playerX,
      playerZ: data.playerZ,
    };
  }

  /**
   * Extract display info from a save data object.
   */
  static getSaveInfo(data) {
    if (!data) return null;
    const date = new Date(data.timestamp);
    const zoneLabels = {
      landingSite: 'Landing Site', mine: 'The Mine', verdantMaw: 'Verdant Maw',
      lagoonCoast: 'Lagoon Coast', frozenTundra: 'Frozen Tundra', spaceship: 'Spaceship',
      workspace: 'Workspace',
    };
    return {
      sessionName: data.sessionName || 'Unnamed',
      timestamp: date.toLocaleString(),
      zone: zoneLabels[data.zone] || data.zone,
      pp: Math.floor(data.pp.ppTotal),
      steps: data.pedometer?.totalSteps || 0,
      ascensionCount: data.ascension?.ascensionCount || 0,
    };
  }
}
