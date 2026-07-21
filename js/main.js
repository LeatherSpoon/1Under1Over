import { SceneManager } from './scene/SceneManager.js';
import { Environment } from './scene/Environment.js';
import { LootPopups } from './scene/LootPopups.js';
import { Player } from './entities/Player.js';
import { EntityManager } from './entities/EntityManager.js';
import { threatColorFor } from './entities/Enemy.js';
import { PPSystem } from './systems/PPSystem.js';
import { StatsSystem } from './systems/StatsSystem.js';
import { CombatSystem } from './systems/CombatSystem.js';
import { PedometerSystem } from './systems/PedometerSystem.js';
import { InventorySystem } from './systems/InventorySystem.js';
import { CraftingSystem } from './systems/CraftingSystem.js';
import { DroneSystem } from './systems/DroneSystem.js';
import { EquipmentSystem } from './systems/EquipmentSystem.js';
import { HUD } from './ui/HUD.js';
import { CombatUI } from './ui/CombatUI.js';
import { TouchInput } from './input/TouchInput.js';
import { GameStatistics } from './systems/GameStatistics.js';
import { SaveSystem } from './systems/SaveSystem.js';
import { OfflineSystem } from './systems/OfflineSystem.js';
import { AchievementSystem } from './systems/AchievementSystem.js';
import { AutoCombatSystem } from './systems/AutoCombatSystem.js';
import { CombatSimSystem } from './systems/CombatSimSystem.js';
import { MinigameSystem } from './systems/MinigameSystem.js';
import { DrillSystem } from './systems/DrillSystem.js';
import { AscensionSystem } from './systems/AscensionSystem.js';
import { FactorySystem } from './systems/FactorySystem.js';
import { AssemblySystem } from './systems/AssemblySystem.js';
import { ExtractorSystem } from './systems/ExtractorSystem.js';
import { ProcessingNodeSystem } from './systems/ProcessingNodeSystem.js';
import { CONFIG } from './config.js';
import { TelemetrySystem } from './TelemetrySystem.js';
import { SyncClient } from './sync/SyncClient.js';
import { createLocalDefinitions, normalizeRecipesForCrafting } from './systems/ProgressionDefinitions.js';
import { TechTreeSystem } from './systems/TechTreeSystem.js';
import { CraftingMasterySystem } from './systems/CraftingMasterySystem.js';
import { CodexSystem } from './systems/CodexSystem.js';
import * as THREE from 'three';
import { AugmentationSystem } from './systems/AugmentationSystem.js';
import { MathematicianSystem } from './systems/MathematicianSystem.js';
import { TimeWarpSystem } from './systems/TimeWarpSystem.js';
import { ModifiersSystem } from './systems/ModifiersSystem.js';
import { TripartiteSystem } from './systems/TripartiteSystem.js';
import { WorldEffects } from './fx/WorldEffects.js';
import { createSwitchZone } from './zoneManager.js';
import { MINE_BREACH_Z, mineWorldToCell } from './scene/zones/Mine/layout.js';
import { MineDelveSystem } from './systems/MineDelveSystem.js';
import { initMenuController } from './menuController.js';
import { initSaveButtons, applySessionData } from './saveButtons.js';
import { CloudSaveSystem } from './systems/CloudSaveSystem.js';
import { initMissionTracker } from './missionTracker.js';
import { QuestSystem } from './systems/QuestSystem.js';
import { BossSystem } from './systems/BossSystem.js';
import { ChapterSystem } from './systems/ChapterSystem.js';
import { ExpeditionSystem } from './systems/ExpeditionSystem.js';
import { ChallengeSystem } from './systems/ChallengeSystem.js';
import { NeuralImplantSystem } from './systems/NeuralImplantSystem.js';
import { TrainingAreaSystem } from './systems/TrainingAreaSystem.js';
import { ComputeSystem } from './systems/ComputeSystem.js';

// ── Bootstrap ────────────────────────────────────────────────────────────────

// Cave "transparency radius": feed the mine reveal shader the player position so
// rock opens a hole around them. Redundant with Player.js's through-wall ghost;
// left off so tall rock stays solid (no "slipping through cracks"). See the feed
// loop in gameLoop().
const MINE_WALL_REVEAL = false;

const canvas = document.getElementById('game-canvas');

// Pointer position in NDC for tap-to-place construction
const _constructPointer = { x: 0, y: 0, valid: false };
canvas.addEventListener('pointermove', e => {
  const r = canvas.getBoundingClientRect();
  _constructPointer.x = ((e.clientX - r.left) / r.width)  *  2 - 1;
  _constructPointer.y = ((e.clientY - r.top)  / r.height) * -2 + 1;
  _constructPointer.valid = true;
});
canvas.addEventListener('pointerleave', () => { _constructPointer.valid = false; });

// Touch input (no-op on desktop)
const touchInput = new TouchInput();

// Systems
const ppSystem        = new PPSystem();
const statsSystem     = new StatsSystem();
const inventorySystem = new InventorySystem();
const definitions     = createLocalDefinitions();
// API host follows the page host so LAN/phone sessions reach the same server
// (and the same cloud saves) as the desktop.
const syncClient      = new SyncClient({
  playerId: 'local-player',
  baseUrl: `http://${globalThis.location?.hostname || 'localhost'}:3000`,
});
const techTree        = new TechTreeSystem({ nodes: definitions.techNodes, sync: syncClient });
const mastery         = new CraftingMasterySystem({ tracks: definitions.masteryTracks, sync: syncClient });
const combatSystem    = new CombatSystem(statsSystem, ppSystem, inventorySystem);
const pedometer       = new PedometerSystem(ppSystem);
const craftingSystem  = new CraftingSystem(inventorySystem, statsSystem, {
  recipes: normalizeRecipesForCrafting(definitions),
  techTree,
  mastery,
  sync: syncClient,
});
const droneSystem     = new DroneSystem(inventorySystem, ppSystem, { sync: syncClient });
const equipmentSystem = new EquipmentSystem(statsSystem);
// Every pilot starts armed — a blade ground from landing-pod scrap. Loading a
// save replaces it with the save's own equipment in SaveSystem.apply().
equipmentSystem.equip({
  label: 'Scrap Blade',
  slot: 'weapon',
  tier: 'Basic',
  statBonuses: { strength: 1 },
});
const gameStats       = new GameStatistics();
const offlineSystem   = new OfflineSystem(ppSystem, droneSystem, inventorySystem);
const achievements    = new AchievementSystem();
const autoCombat      = new AutoCombatSystem(combatSystem, statsSystem);
const minigame        = new MinigameSystem(ppSystem);
const drillSystem     = new DrillSystem(ppSystem, inventorySystem, statsSystem);
const ascension       = new AscensionSystem(ppSystem);
const factorySystem   = new FactorySystem(inventorySystem, ppSystem, statsSystem, pedometer);
const assemblySystem  = new AssemblySystem(inventorySystem);
const extractorSystem = new ExtractorSystem(inventorySystem);
const processingNodes = new ProcessingNodeSystem(inventorySystem, ppSystem);
const codexSystem     = new CodexSystem();
const augSystem       = new AugmentationSystem();
const mathematician   = new MathematicianSystem(ppSystem);
const timeWarp        = new TimeWarpSystem(ppSystem);
const modifiers       = new ModifiersSystem(ppSystem);
const tripartite      = new TripartiteSystem(ppSystem);
const questSystem     = new QuestSystem();
const bossSystem      = new BossSystem(ppSystem);
const chapterSystem   = new ChapterSystem(bossSystem, ppSystem);
const expedition      = new ExpeditionSystem(ppSystem, statsSystem, inventorySystem);
const challenges      = new ChallengeSystem(ppSystem);
const neuralImplant   = new NeuralImplantSystem(ppSystem, statsSystem);
const combatSim       = new CombatSimSystem(statsSystem);
const trainingAreas   = new TrainingAreaSystem(statsSystem, inventorySystem);
// Power leg = how hard PP works at a sink: it amplifies training throughput.
trainingAreas.getPowerBonus = () => tripartite.powerBonus;

// ── Compute allocation (Phase E) — Al's attention pool ───────────────────────
const computeSystem = new ComputeSystem(ppSystem, inventorySystem);
computeSystem.getPowerBonus = () => tripartite.powerBonus;
computeSystem.getAmpLevel = () => ascension.computeAmpLevel;
computeSystem.getChapterLevel = () => chapterSystem.level;
// Overflow Routing (Al module): PP that clamps at the cap becomes implant XP.
ppSystem.onOverflow = (amount) => computeSystem.routeOverflow(amount, neuralImplant);
// One-time auto-seed probes: which destinations were already in use when the
// board first unlocks (so the stocked gate never silently kills a running system).
computeSystem.probe = {
  ladder: () => expedition.active || expedition.totalKills > 0,
  drones: () => droneSystem.drones.some(d => d.assignedMaterial),
  extractors: () => extractorSystem.slotCount > 0,
  holodeck: () => !!(trainingAreas.activeId || trainingAreas.selectedProgram),
};
// Factory lines are gated per machine; manual clicks stay ungated (attended).
factorySystem.computeGate = (id) => computeSystem.gateMult('factory:' + id);
// Foreman (Al module): hoppers auto-restock from the bags while online.
factorySystem.foremanActive = () => computeSystem.hasModule('foreman');

// Apply ascension multiplier to PP system (challenge rewards fold in each frame)
ppSystem.globalMultiplier = ascension.ppMultiplier * challenges.ppRateMult * factorySystem.moduleGlobalMult;

// Wire minigame perfect hits to achievements
let _lastMinigamePlay = 0;
minigame.onStateChange = () => {
  const r = minigame.lastResult;
  if (r && r.zone === 'PERFECT' && minigame.plays !== _lastMinigamePlay) {
    _lastMinigamePlay = minigame.plays;
    achievements.recordPerfect();
  }
};

// ── Offline progress on boot ──────────────────────────────────────────────
offlineSystem.setReturnContext({ stats: statsSystem, ascension, timeWarp, expedition, implant: neuralImplant, tripartite, trainingAreas, extractors: extractorSystem, compute: computeSystem, factory: factorySystem, processing: processingNodes });
const offlineSummary = offlineSystem.applyAndSummarize();
offlineSystem.stamp();

// Wire rescue drone — switches zone back to Landing Site after defeat.
// Flavor lines: add new sayings here; one is picked at random per rescue.
const RESCUE_SAYINGS = [
  'Rescue drone deployed — pilot recovered.',
  'Vitals critical. Extraction complete.',
  'Recovered at the edge of shutdown.',
  'The drone always comes back for you.',
];
combatSystem.onRescue = () => {
  setTimeout(() => {
    switchZone('landingSite');
    hud.showAchievementToast({
      icon: '🛟',
      label: RESCUE_SAYINGS[Math.floor(Math.random() * RESCUE_SAYINGS.length)],
      desc: 'Returned to base — HP restored. Nothing was lost.',
      reward: 0,
    });
  }, 1200);
};

// Track player damage dealt for highest hit
const _origFight = combatSystem.fight.bind(combatSystem);
combatSystem.fight = function () {
  const hpBefore = this.enemyCurrentHP;
  _origFight();
  const dealt = hpBefore - this.enemyCurrentHP;
  if (dealt > 0) gameStats.recordHit(dealt);
  else gameStats.recordAction();
};

const _origUseSkill = combatSystem.useSkill.bind(combatSystem);
combatSystem.useSkill = function (skillKey) {
  const hpBefore = this.enemyCurrentHP;
  _origUseSkill(skillKey);
  const dealt = hpBefore - this.enemyCurrentHP;
  if (dealt > 0) gameStats.recordHit(dealt);
  else gameStats.recordAction();
};

const _origUseItem = combatSystem.useItem.bind(combatSystem);
combatSystem.useItem = function (itemKey) {
  _origUseItem(itemKey);
  gameStats.recordAction();
};

const _origTryRun = combatSystem.tryRun.bind(combatSystem);
combatSystem.tryRun = function () {
  _origTryRun();
  gameStats.recordAction();
};

// Wire crafting complete callback
craftingSystem.onCraftComplete = (recipe) => {
  codexSystem.discover(recipe.key);
  questSystem.recordCraftComplete(recipe.key);
  if (recipe.type === 'equipment') {
    const item = {
      label: recipe.label,
      slot: recipe.slot,
      tier: recipe.tier,
      statBonuses: recipe.statBonuses,
    };
    const displaced = equipmentSystem.equip(item);
    if (displaced) inventorySystem.addToEquipmentBag(displaced);
    questSystem.recordEquipItem(recipe.key);
    hud.showAchievementToast({
      icon: '⚙',
      label: `${recipe.label} Equipped`,
      desc: displaced ? `Old ${displaced.label} moved to inventory bag` : `Equipped to ${recipe.slot} slot`,
      reward: 0,
    });
  }
  // Always refresh the crafting panel so it clears the "Crafting..." state
  hud.onCraftingComplete();
};

// Renderer & scene
const sceneManager = new SceneManager(canvas);
const env = new Environment(sceneManager.scene);

// Entities
const player = new Player(sceneManager.scene, statsSystem);
window.__debugPlayer = player;
window.__debugEnv = env;

const entityManager = new EntityManager(sceneManager.scene, (enemy) => {
  player.isInCombat = true;
  combatUI.show(enemy);
  combatSystem.startCombat(enemy);
});

// Defeated zone bosses never respawn
entityManager.spawnFilter = (s) => !s.boss || !bossSystem.isDefeated(s.archetype);

// Spawn entities for current zone
entityManager.spawnForZone(env.getEnemySpawns(), env.getResourceNodeSpawns());

// UI
const hud = new HUD(
  statsSystem, ppSystem, pedometer,
  inventorySystem, craftingSystem, droneSystem, equipmentSystem, gameStats,
  achievements, minigame, ascension, autoCombat, drillSystem,
  techTree, mastery, syncClient, factorySystem, codexSystem, augSystem,
  { mathematician, timeWarp, modifiers }, assemblySystem, tripartite,
  extractorSystem, processingNodes,
  { bosses: bossSystem, expedition, challenges, implant: neuralImplant }
);
hud.trainingAreas = trainingAreas; // training console panel + chamber overlay
const combatUI = new CombatUI(
  combatSystem, statsSystem, entityManager, player, inventorySystem, ppSystem, sceneManager
);

// Augmentations — apply stat bonuses on purchase
augSystem.onPurchase = (id) => {
  if (id === 'reinforcedFrame')   statsSystem.addAugBonus('hp',      50);
  if (id === 'titaniumPlating')   statsSystem.addAugBonus('defense',  3);
  if (id === 'adaptiveShielding') statsSystem.addAugBonus('defense',  6);
  if (id === 'servoLegs')         statsSystem.addAugBonus('speed',   0.3);
  if (id === 'capacitorArray')    statsSystem.addAugBonus('energy',  30);
  if (id === 'combatTargeting')   statsSystem.addAugBonus('damage',  15);
  if (id === 'overclockModule')   statsSystem.stats.craftingSpeed.level += 5;
};

// Drone missions — wire completion toast + quest tracking
droneSystem.onMissionComplete = (result) => {
  hud.showDroneToast(result);
  questSystem.recordDroneMissionComplete();
};

// Boss trophies — permanent bonuses + clearance into the next zone
combatSystem.onBossDefeated = (archetype) => bossSystem.recordDefeat(archetype);
bossSystem.onDefeat = (def) => {
  hud.showAchievementToast({
    icon: '☠', label: `${def.label} Defeated!`,
    desc: `Trophy bonus: ${def.bonus.label}${def.unlocks ? ` · Clearance granted: ${def.unlocks}` : ''}`,
    reward: 0,
  });
  env.refreshPortalAccess((portal) =>
    portal.ppRequired === 0
    || pedometer.isZoneUnlocked(portal.targetZone)
    || bossSystem.hasClearance(portal.targetZone)
  );
};

// Challenge outcomes — toast + (rewards recompute each frame in the game loop)
challenges.onComplete = (def) => {
  hud.showAchievementToast({
    icon: '◆', label: `Trial Complete: ${def.label}`,
    desc: `Permanent reward: ${def.reward.label}`, reward: 0,
  });
};
challenges.onFail = (def, reason) => {
  hud.showAchievementToast({
    icon: '✖', label: `Trial Failed: ${def.label}`,
    desc: `${reason}. Restart it from the TRIALS panel.`, reward: 0,
  });
};

// Combat Simulator — sparring-rig stat levels announce themselves
combatSim.onLevelUp = (statName, newLevel) => {
  hud.showAchievementToast({
    icon: '🥊', label: `Combat Sim: ${statsSystem.getStatLabel(statName)} Lv ${newLevel}`,
    desc: 'Trained in the sparring simulator', reward: 0,
  });
};

// Neural implant — passive stat levels announce themselves
neuralImplant.onLevelUp = (statName, newLevel) => {
  hud.showAchievementToast({
    icon: '🧠', label: `Implant Training: ${statsSystem.getStatLabel(statName)} Lv ${newLevel}`,
    desc: 'Trained passively by the Neural Implant', reward: 0,
  });
  questSystem.recordStatUpgrade(statName, newLevel);
};

// Training pads — sim-trained levels announce themselves, drains too
trainingAreas.onLevelUp = (statName, newLevel) => {
  hud.showAchievementToast({
    icon: '🏋️', label: `Sim Training: ${statsSystem.getStatLabel(statName)} Lv ${newLevel}`,
    desc: 'Trained on a Spaceship sim pad', reward: 0,
  });
  questSystem.recordStatUpgrade(statName, newLevel);
};
trainingAreas.onLevelDown = (statName, newLevel) => {
  hud.showAchievementToast({
    icon: '⚠️', label: `Sim Strain: ${statsSystem.getStatLabel(statName)} Lv ${newLevel}`,
    desc: 'Advanced training drained this stat', reward: 0,
  });
};

// Expedition kills feed the Remote War trial
expedition.onKills = (count) => challenges.recordExpeditionKills(count);
ascension.expedition = expedition; // the ladder is the Recompile run layer (peak tier, wardens, fragments)
chapterSystem.expedition = expedition; // warden rungs read the lifetime tier watermark
chapterSystem.ascension = ascension;

// Award Quantum Crystals on achievement unlock + ascension (premium currency drip)
achievements.onUnlock = (ach) => {
  // Every 5th achievement awards a crystal
  if (achievements.totalUnlocked % 5 === 0) {
    timeWarp.award(1, 'achievement-milestone');
    hud.showAchievementToast({
      icon: '◈', label: '+1 Quantum Crystal',
      desc: 'Awarded for achievement milestone', reward: 0,
    });
  }
};

const _origAscend = ascension.ascend.bind(ascension);
ascension.ascend = function () {
  const r = _origAscend();
  if (r) {
    timeWarp.award(2, 'ascension');
    modifiers.load(modifiers.serialize());
    questSystem.recordAscension();
  }
  return r;
};

// Push trade-off multipliers into the systems that honor them, and refresh the
// ROI table so values stay current. gatherMult/energyCostMult are read inline
// (this module scope); damageMult/droneMult are pushed into their systems.
modifiers.onChange = () => {
  combatSystem.damageMult = modifiers.damageMult;
  droneSystem.efficiencyMult = modifiers.droneMult * ascension.droneMultiplier;
  statsSystem.costMult = modifiers.statCostMult;
  const panel = document.getElementById('optimization-panel');
  if (panel && !panel.hidden) hud._refreshOptimization();
};

// Refresh the Refinery + inventory panels when a processing job finishes/queues.
processingNodes.onNodeUpdate = () => {
  const rp = document.getElementById('refinery-panel');
  if (rp && !rp.hidden) hud._refreshRefinery();
  const ip = document.getElementById('inventory-panel');
  if (ip && !ip.hidden) hud._refreshInventory();
};

// Research Tree — wire purchase effects
techTree.onPurchase = (id) => {
  if (id === 'combatChip')   statsSystem.stats.strength.level += 5;
  if (id === 'armorCoating') statsSystem.stats.defense.level  += 5;
  questSystem.recordTechPurchase(id, techTree.owned.size);
};

// Codex — wire discovery toast and hooks
codexSystem.onDiscover = (key, entry) => {
  hud.showAchievementToast({ icon: '📖', label: `Codex: ${entry.label}`, desc: entry.flavor, reward: 0 });
};

// First-time material discovery + quest system tracking
const _origAddMaterial = inventorySystem.addMaterial.bind(inventorySystem);
inventorySystem.addMaterial = function(name, qty) {
  const wasZero = !this.materials[name];
  _origAddMaterial(name, qty);
  if (wasZero && this.materials[name] > 0) codexSystem.discover(name);
  questSystem.recordMaterialAdded(this.materials);
  challenges.recordMaterialCount(this.materials[name] || 0);
};

// Stat upgrades — notify quest system after successful level-up
const _origLevelUp = statsSystem.levelUp.bind(statsSystem);
statsSystem.levelUp = function(statName, pp) {
  const ok = _origLevelUp(statName, pp);
  if (ok) {
    questSystem.recordStatUpgrade(statName, this.stats[statName]?.level || 1);
    challenges.recordStatUpgrade();
  }
  return ok;
};

// Chain combat end callback to track statistics (CombatUI already wired its own)
const _origOnCombatEnd = combatSystem.onCombatEnd;
combatSystem.onCombatEnd = (won, fled) => {
  if (won && combatSystem.enemy) codexSystem.discover(combatSystem.enemy.archetype);
  if (_origOnCombatEnd) _origOnCombatEnd(won, fled);
  if (won) {
    gameStats.recordEnemyDefeated(env.currentZone);
    questSystem.recordEnemyDefeated(gameStats.enemiesDefeated);
    challenges.recordEnemyDefeated();
    expedition.recordFieldKill(combatSystem.enemy?.archetype); // Override Keys for the sim ladder
  } else if (!fled) {
    gameStats.recordDefeat();
  }
};

// Pedometer track placement/removal/purchase — notify quest system
const _origPlaceTrack = pedometer.placeTrack.bind(pedometer);
pedometer.placeTrack = function(zone, x, z, stats) {
  const ok = _origPlaceTrack(zone, x, z, stats);
  if (ok) questSystem.recordTrackPlaced(this._placedTracks.length);
  return ok;
};

const _origBuyTrack = pedometer.buyTrack.bind(pedometer);
pedometer.buyTrack = function() {
  const ok = _origBuyTrack();
  if (ok) questSystem.recordTrackPurchased(this._trackCount);
  return ok;
};

const _origRemoveTrack = pedometer.removeTrack.bind(pedometer);
pedometer.removeTrack = function(zone, x, z) {
  const ok = _origRemoveTrack(zone, x, z);
  if (ok) questSystem.recordTrackRemoved(this._placedTracks.length);
  return ok;
};

// Drone assign/dispatch/unlock — notify quest system
const _origAssignDrone = droneSystem.assignDrone.bind(droneSystem);
droneSystem.assignDrone = function(droneId, materialType) {
  const ok = _origAssignDrone(droneId, materialType);
  if (ok) questSystem.recordDroneAssigned();
  return ok;
};

const _origSendOnMission = droneSystem.sendOnMission.bind(droneSystem);
droneSystem.sendOnMission = function(droneId, zoneName) {
  const ok = _origSendOnMission(droneId, zoneName);
  if (ok) questSystem.recordDroneDispatched();
  return ok;
};

if (typeof droneSystem.unlockDrone === 'function') {
  const _origUnlockDrone = droneSystem.unlockDrone.bind(droneSystem);
  droneSystem.unlockDrone = function() {
    const ok = _origUnlockDrone();
    if (ok) questSystem.recordDroneCount(this.drones.length);
    return ok;
  };
}

// Telemetry — attach AFTER all other callback wiring so it wraps the full chain
const telemetry = new TelemetrySystem();
telemetry.attach({
  combat:    combatSystem,
  stats:     statsSystem,
  pp:        ppSystem,
  pedometer: pedometer,
  crafting:  craftingSystem,
  inventory: inventorySystem,
  drones:    droneSystem,
  player:    player,
});
syncClient.telemetry = telemetry;
syncClient.onStatus = status => hud.setSyncStatus(status);
syncClient.onReconciled = (playerState, serverDefinitions) => {
  if (serverDefinitions) {
    techTree.setDefinitions(serverDefinitions.techNodes);
    mastery.setDefinitions(serverDefinitions.masteryTracks);
    craftingSystem.setRecipes(normalizeRecipesForCrafting(serverDefinitions));
  }
  if (playerState) {
    techTree.applyOwned(playerState.techUnlocks);
    mastery.applyProgress(playerState.mastery);
    inventorySystem.applyServerInventory(playerState.inventory);
  }
};
syncClient.bootstrap();

hud.prog.chapters = chapterSystem; // chapter chain drives tab gates + identity display
hud.compute = computeSystem; // allocation board section in the ALLOC panel
hud.setZoneLabel(env.getZoneLabel());
gameStats.recordZoneVisit('landingSite'); // starting zone
// questSystem.recordZoneVisit fires on switchZone; record start zone explicitly after wiring

// Codex lore entry discovered on first visit to each zone (start zone below,
// zone switches via onAfterSwitch in switchZone)
const ZONE_LORE = {
  landingSite: 'theLanding', mine: 'theMine', depths: 'theDepths',
  verdantMaw: 'theMaw', lagoonCoast: 'theCoast', frozenTundra: 'theTundra',
  spaceship: 'theShip',
};
codexSystem.discover(ZONE_LORE.landingSite);


// Show offline progress banner if applicable
if (offlineSummary) {
  hud.showOfflineBanner(offlineSummary);
}

// ── Save System ──────────────────────────────────────────────────────────────

const missionTracker = initMissionTracker({ codexSystem });

const mineDelve = new MineDelveSystem();

const saveSystem = new SaveSystem({
  pp: ppSystem,
  stats: statsSystem,
  inventory: inventorySystem,
  pedometer,
  drones: droneSystem,
  equipment: equipmentSystem,
  crafting: craftingSystem,
  chapters: chapterSystem,
  gameStats,
  achievements,
  minigame,
  ascension,
  autoCombat,
  drill: drillSystem,
  techTree,
  mastery,
  sync: syncClient,
  factory: factorySystem,
  assembly: assemblySystem,
  extractor: extractorSystem,
  processingNodes,
  codex: codexSystem,
  augmentations: augSystem,
  mathematician,
  timeWarp,
  modifiers,
  missionTracker,
  questSystem,
  tripartite,
  bosses: bossSystem,
  expedition,
  challenges,
  neuralImplant,
  combatSim,
  mineDelve,
  trainingAreas,
  compute: computeSystem,
});

// World-space effects (offload burst, etc.)
const worldEffects = new WorldEffects(sceneManager.scene);
const lootPopups = new LootPopups(sceneManager.scene);
// TODO: SECRET_UNLOCKS — deferred. When designed, fire `worldEffects.triggerSecretUnlock(player.position)`
// from the achievement check loop and skip the toast for those entries.

// Wire quest system → mission tracker + HUD
questSystem.onGrantPP = (amount) => {
  ppSystem.ppTotal = Math.min(ppSystem.ppCap, ppSystem.ppTotal + amount);
};
questSystem.onQuestComplete = ({ title, reward }) => {
  hud.showAchievementToast({
    icon: '📋',
    label: `Quest Complete: ${title}`,
    desc: reward?.special ? reward.label : (reward?.pp > 0 ? `+${reward.pp} PP` : 'Completed!'),
    reward: reward?.pp || 0,
  });
};
questSystem.onUpdate = () => {
  const { label, steps } = questSystem.currentSequenceForDisplay();
  if (label) {
    missionTracker.setSequence(label, steps);
  } else {
    missionTracker.setMain('All quests complete. You are legend.');
  }
  // Sync side quest slot in mission tracker
  const trackedSide = questSystem.getTrackedSideQuest();
  if (trackedSide && trackedSide._status !== 'done') {
    missionTracker.setSide({ id: trackedSide.id, text: `${trackedSide.icon} ${trackedSide.title}: ${trackedSide.steps[0]?.desc || ''}` });
  } else {
    missionTracker.setSide(null);
  }
};
questSystem.onUpdate(); // initial render
hud.setQuestSystem(questSystem);

// The Mine builder reads the delve seed and mined cells; record depletions back.
env._mineDelve = mineDelve;
env.onRockDepleted = (rock) => {
  if (env.currentZone !== 'mine') return;
  const cell = mineWorldToCell(rock.x, rock.z);
  mineDelve.recordMined(cell.c, cell.r);
};

const switchZone = createSwitchZone({
  gameStats, sceneManager, env, player, entityManager, hud, pedometer, ppSystem,
  bossSystem, mineDelve,
  onAfterSwitch: () => {
    _portalRefreshTimer = 0.5;
    _nearestTree = null;
    _nearestRock = null;
    _gatherTarget = null;
    _gatherTimer = 0;
    _gatherType = null;
    questSystem.recordZoneVisit(env.currentZone);
    if (ZONE_LORE[env.currentZone]) codexSystem.discover(ZONE_LORE[env.currentZone]);

    // Presence rotation: being in a zone cross-amplifies a different tripartite leg.
    // Reset all multipliers, then apply the configured zone bonus (if any). No UI exposure.
    tripartite.presenceMultiplier = { capacity: 1.0, power: 1.0, rate: 1.0 };
    const zb = CONFIG.TRIPARTITE_ZONE_BONUS?.[env.currentZone];
    if (zb) tripartite.presenceMultiplier[zb.leg] = zb.mult;
  },
});

// ── Cloud saves — autosave to the optional server + boot restore ────────────
const cloudSaves = new CloudSaveSystem({
  sync: syncClient,
  saveSystem,
  getZone: () => env.currentZone,
  getPlayerPos: () => ({ x: player.position.x, z: player.position.z }),
});
cloudSaves.start();
cloudSaves.fetchLatest().then(snap => {
  if (!snap) return;
  const result = applySessionData(snap, { saveSystem, player, hud, switchZone });
  if (!result) return;
  // Credit offline gains for the time since the snapshot was taken, now that
  // the restored state (PP rate, drones, expedition) is live.
  offlineSystem.rewindTo(snap.timestamp);
  const summary = offlineSystem.applyAndSummarize();
  offlineSystem.stamp();
  if (summary) hud.showOfflineBanner(summary);
  const info = SaveSystem.getSaveInfo(snap);
  hud.showAchievementToast({
    icon: '☁',
    label: 'Cloud save restored',
    desc: `${info.sessionName} — ${info.zone}, ${info.pp} PP`,
    reward: 0,
  });
});

initSaveButtons({ saveSystem, env, player, hud, switchZone, cloudSaves });
window.__debugSwitchZone = switchZone;

let _pendingZone = null;

// ── Input ──────────────────────────────────────────────────────────────────────

const keysDown = new Set();

document.addEventListener('keydown', e => {
  keysDown.add(e.code);
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) {
    e.preventDefault();
  }

  // Panel toggles
  if (e.code === 'KeyI') togglePanel('inventory-panel');
  if (e.code === 'KeyR' && !player.isInCombat) togglePanel('drone-panel');
  if (e.code === 'KeyL') togglePanel('equipment-panel');
  if (e.code === 'KeyP') togglePanel('pedometer-panel');
  if (e.code === 'KeyB' && !player.isInCombat && env.currentZone !== 'landingSite') {
    _pendingZone = 'landingSite';
  }
  if (e.code === 'KeyT' && !player.isInCombat && (pedometer.infiniteTracks || pedometer.pendingTracks > 0)) {
    const snappedX = Math.round(player.position.x / 2) * 2;
    const snappedZ = Math.round(player.position.z / 2) * 2;
    pedometer.placeTrack(env.currentZone, snappedX, snappedZ, statsSystem);
    env.refreshTrackMarkers(pedometer);
    hud._refreshPanel('pedometer-panel');
  }
  // [G] — remove nearest track
  if (e.code === 'KeyG' && !player.isInCombat) {
    const nearTrack = pedometer.getPlacedTracksForZone(env.currentZone)
      .find(t => Math.hypot(player.position.x - t.x, player.position.z - t.z) < 1.0);
    if (nearTrack) {
      pedometer.removeTrack(env.currentZone, nearTrack.x, nearTrack.z);
      env.refreshTrackMarkers(pedometer);
      hud._refreshPanel('pedometer-panel');
    }
  }
  // [F] key — plant seed
  if (e.code === 'KeyF' && !player.isInCombat && !player.isGathering) {
    _tryPlantSeed();
  }
});

document.addEventListener('keyup', e => {
  keysDown.delete(e.code);
});

window.addEventListener('blur', () => keysDown.clear());

const { togglePanel } = initMenuController({ hud, telemetry, env });

function _tryPlantSeed() {
  if (inventorySystem.materials.seed <= 0) return;
  if (!statsSystem.spendEnergy(_energyCost(CONFIG.ENERGY_COST_PLANT))) {
    hud.showInteractHint('Not enough energy to plant!');
    return;
  }
  // Check no collision nearby (don't plant on top of obstacles)
  const px = player.position.x, pz = player.position.z;
  const tooClose = env.getCollisionCircles().some(c =>
    Math.hypot(px - c.x, pz - c.z) < c.r + 1.5
  );
  if (tooClose) {
    statsSystem.currentEnergy += CONFIG.ENERGY_COST_PLANT; // refund
    hud.showInteractHint('No room to plant here!');
    return;
  }
  inventorySystem.removeMaterial('seed', 1);
  env.plantTree(px, pz);
  hud.showInteractHint('Seed planted!');
}

// ── Extended gathering: trees & rocks ────────────────────────────────────────

let _nearestTree = null;
let _nearestRock = null;
let _gatherTarget = null;  // currently being gathered (tree or rock)
let _gatherTimer  = 0;
let _gatherDuration = 0;
let _gatherType   = null;  // 'tree' | 'rock'
let _gatherHintCooldown = 0;  // suppresses gather hints briefly after completion

function _energyCost(base) {
  const afterTech = techTree?.owned.has('energyEfficiency') ? base - 1 : base;
  // Frugal Circuits & other modifiers fold their energyCostMult in here.
  return Math.max(1, Math.round(afterTech * modifiers.energyCostMult));
}

const SPECIALTY_TOOL_NAMES = {
  rockDrill:    'Rock Drill',
  harvestBlade: 'Harvest Blade',
  diveTool:     'Dive Tool',
  cryoPick:     'Cryo-Pick',
};

function handleExtendedGather(delta) {
  if (player.isInCombat) return false;
  if (player.isGathering) {
    // Clear stale interaction targets so hints don't linger
    _nearestRock = null;
    _nearestTree = null;
    return false;
  }

  // Tick down hint cooldown
  if (_gatherHintCooldown > 0) _gatherHintCooldown -= delta;

  // If mid-gather (tree or rock)
  if (_gatherType) {
    // Tree/rock clearing runs automatically once started — E only initiates it

    _gatherTimer += delta;
    hud.showGatherProgress(_gatherTimer, _gatherDuration);

    if (_gatherTimer >= _gatherDuration) {
      // Complete the action
      if (_gatherType === 'timber_harvest') {
        const result = env.harvestTimber(_gatherTarget);
        if (result) {
          inventorySystem.addMaterial('timber', result.timber);
          hud.showInteractHint(`+${result.timber} timber`);
          gameStats.recordGather(result.timber);
          questSystem.recordGather(env.currentZone, inventorySystem.materials);
        }
      } else if (_gatherType === 'tree') {
        const result = env.clearTree(_gatherTarget);
        if (result) {
          inventorySystem.addMaterial('timber', result.timber);
          if (result.seed > 0) inventorySystem.addMaterial('seed', result.seed);
          hud.showInteractHint(`+${result.timber} timber${result.seed > 0 ? ' +1 seed' : ''}`);
          gameStats.recordGather(result.timber);
          inventorySystem.degradeTool('terrainCutter');
          questSystem.recordGather(env.currentZone, inventorySystem.materials);
        }
      } else if (_gatherType === 'rock') {
        const rock = _gatherTarget;
        const result = env.drillRock(rock, techTree?.owned.has('deepVeins') ? 1.5 : 1.0);
        _nearestRock = null;
        if (result) {
          const pretty = (key) => key.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
          let line = 0;
          inventorySystem.addMaterial('stone', result.stone);
          lootPopups.spawn(rock.x, rock.z, `+${result.stone} Stone`, 0xd8cfc0, line++);
          let extraLoot = '';
          for (let key in result) {
            if (key !== 'stone') {
              inventorySystem.addMaterial(key, result[key]);
              extraLoot += ` +${result[key]} ${key}`;
              const color = rock.props && key === rock.props.ore ? rock.props.veinColor : 0xffcc66;
              lootPopups.spawn(rock.x, rock.z, `+${result[key]} ${pretty(key)}`, color, line++);
            }
          }
          hud.showInteractHint(`+${result.stone} stone${extraLoot}`);
          gameStats.recordGather(result.stone);
          gameStats.recordMine();
          questSystem.recordDrill(env.currentZone);
          questSystem.recordGather(env.currentZone, inventorySystem.materials);
        }
      }
      _gatherHintCooldown = augSystem.has('neuralLink') ? 0.15 : 0.5;
      _gatherTimer = 0;
      _gatherType = null;
      _gatherTarget = null;
      hud.hideGatherProgress();
    }
    return true; // consuming interaction
  }

  // Trees — always interactable; cutter clears permanently, otherwise harvests timber
  const hasCutter = inventorySystem.hasTool('terrainCutter');
  _nearestTree = env.findNearestTree(player.position); // any alive tree
  _nearestRock = env.findNearestRock(player.position);

  // Resource nodes take priority over rocks/trees when in range, but only
  // if the node is unlocked (tool available) — locked nodes don't block rock/tree access.
  const _nearestNode = entityManager.findNearestNode(player.position);
  if (_nearestNode && (!_nearestNode.requiredTool || inventorySystem.hasTool(_nearestNode.requiredTool))) {
    const nodeDist = _nearestNode.position.distanceTo(player.position);
    const rockDist = _nearestRock ? Math.hypot(player.position.x - _nearestRock.x, player.position.z - _nearestRock.z) : Infinity;
    if (nodeDist <= rockDist) {
      _nearestRock = null;
      _nearestTree = null;
      return false; // let handleGathering take it
    }
  }

  // Priority: tree > rock
  if (_nearestTree && _gatherHintCooldown <= 0) {
    if (hasCutter) {
      // Terrain Cutter: clear tree permanently for 1-2 timber + seed
      if (statsSystem.currentEnergy >= _energyCost(CONFIG.ENERGY_COST_TREE)) {
        hud.showInteractHint('[E/ACT] Clear Tree (Terrain Cutter)');
        if (keysDown.has('KeyE') || touchInput.actionPressed) {
          statsSystem.spendEnergy(_energyCost(CONFIG.ENERGY_COST_TREE));
          _gatherTarget = _nearestTree;
          _gatherTimer = 0;
          _gatherDuration = 2.5 * (techTree?.owned.has('swiftHarvest') ? 0.8 : 1) / (statsSystem.gatherSpeedMult * modifiers.gatherMult * ascension.gatherMultiplier);
          _gatherType = 'tree';
        }
      } else {
        hud.showInteractHint(`Clear Tree – need ${_energyCost(CONFIG.ENERGY_COST_TREE)} energy`);
      }
    } else {
      hud.showInteractHint('Need Terrain Cutter to clear trees');
    }
    return true;
  }

  if (_nearestRock && _gatherHintCooldown <= 0) {
    const isSurfaceRock = !_nearestRock.props;
    if (isSurfaceRock && !inventorySystem.hasTool('rockDrill')) {
      hud.showInteractHint('Need Rock Drill to drill boulders');
      return true;
    }

    const energyCost = _energyCost(_nearestRock.props ? _nearestRock.props.cost : CONFIG.ENERGY_COST_ROCK);
    const duration = _nearestRock.props ? _nearestRock.props.duration : 3.0;
    const richnessLabel = _nearestRock.maxRichness === 1 ? '' : _nearestRock.richness === 3 ? ' (Rich)' : _nearestRock.richness === 2 ? ' (Cracked)' : ' (Depleted)';
    const label = _nearestRock.props && _nearestRock.props.tier > 0
                  ? `Mine T${_nearestRock.props.tier} Rock${richnessLabel}`
                  : `Drill Rock${richnessLabel}`;

    if (statsSystem.currentEnergy >= energyCost) {
      hud.showInteractHint(`[E/ACT] ${label}`);
      if (keysDown.has('KeyE') || touchInput.actionPressed) {
        statsSystem.spendEnergy(energyCost);
        _gatherTarget = _nearestRock;
        _gatherTimer = 0;
        _gatherDuration = duration * (techTree?.owned.has('efficientMining') ? 0.75 : 1) / (statsSystem.gatherSpeedMult * modifiers.gatherMult * ascension.gatherMultiplier);
        _gatherType = 'rock';
      }
    } else {
      hud.showInteractHint(`${label} – need ${energyCost} energy`);
    }
    return true;
  }

  return false;
}

// ── Construction Mode Interaction ─────────────────────────────────────────────

// Raycast _constructPointer NDC onto the y=0 world plane.
// Returns { x, z } snapped to the 2-unit grid, or null if not computable.
function _constructGroundSnap() {
  if (!_constructPointer.valid) return null;
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(_constructPointer, sceneManager.camera);
  const { origin, direction } = raycaster.ray;
  if (Math.abs(direction.y) < 1e-6) return null;
  const t = -origin.y / direction.y;
  return {
    x: Math.round((origin.x + direction.x * t) / 2) * 2,
    z: Math.round((origin.z + direction.z * t) / 2) * 2,
  };
}

function _refreshConstruct() {
  env.refreshTrackMarkers(pedometer);
  hud._refreshConstructPanel();
}

// Core place/remove — no cooldown; called by both tap and [E].
function _applyConstructAt(snap) {
  if (!snap) return;
  if (hud._constructAddMode) {
    if (pedometer.pendingTracks <= 0) return;
    pedometer.placeTrack(env.currentZone, snap.x, snap.z, statsSystem);
  } else {
    const track = pedometer.getPlacedTracksForZone(env.currentZone)
      .find(t => t.x === snap.x && t.z === snap.z);
    if (!track) return;
    pedometer.removeTrack(env.currentZone, snap.x, snap.z);
  }
  _refreshConstruct();
}

// [E] key path — cooldown prevents key-repeat spam.
function _doConstructAction() {
  if (player.isInCombat || _actionCooldown > 0) return;
  const panel = document.getElementById('construct-panel');
  if (!panel || panel.hidden) return;
  _applyConstructAt(_constructGroundSnap());
  _actionCooldown = 0.3;
}
window.doConstructAction = _doConstructAction;

// Tap/click on canvas — immediate, no cooldown.
canvas.addEventListener('pointerdown', e => {
  const panel = document.getElementById('construct-panel');
  if (!panel || panel.hidden) return;
  if (typeof hud === 'undefined' || typeof pedometer === 'undefined') return;
  const r = canvas.getBoundingClientRect();
  _constructPointer.x = ((e.clientX - r.left) / r.width)  *  2 - 1;
  _constructPointer.y = ((e.clientY - r.top)  / r.height) * -2 + 1;
  _constructPointer.valid = true;
  _applyConstructAt(_constructGroundSnap());
});

function handleConstructMode(delta) {
  const panel = document.getElementById('construct-panel');
  if (!panel || panel.hidden) {
    env.hideConstructCursor();
    return false;
  }
  if (player.isInCombat) { env.hideConstructCursor(); return false; }

  const addMode = hud._constructAddMode;
  const px = player.position.x, pz = player.position.z;

  // Cursor follows the pointer; fallback to tile under player
  const snap = _constructGroundSnap();
  const cursorX = snap ? snap.x : Math.round(px / 2) * 2;
  const cursorZ = snap ? snap.z : Math.round(pz / 2) * 2;
  env.updateConstructCursor(cursorX, cursorZ, addMode, delta);

  if (addMode) {
    if (pedometer.infiniteTracks || pedometer.pendingTracks > 0) {
      const readyLabel = pedometer.infiniteTracks ? '∞' : pedometer.pendingTracks;
      hud.showInteractHint(`Click / [E] to place  (${readyLabel} ready)`);
      if (keysDown.has('KeyE') && _actionCooldown <= 0) _doConstructAction();
    } else {
      hud.showInteractHint('No tracks pending — buy one in the panel');
    }
  } else {
    const hasTrackHere = snap && pedometer.getPlacedTracksForZone(env.currentZone)
      .some(t => t.x === snap.x && t.z === snap.z);
    if (hasTrackHere) {
      hud.showInteractHint('Click / [E] to remove');
      if (keysDown.has('KeyE') && _actionCooldown <= 0) _doConstructAction();
    } else {
      hud.showInteractHint('Hover a placed track to remove it');
    }
  }
  return true;
}

// ── Drill Interaction ─────────────────────────────────────────────────────────

function handleDrillInteraction() {
  if (env.currentZone !== 'mine') return false;
  if (player.isInCombat || player.isGathering) return false;
  if (_actionCooldown > 0) return false;

  const drillPos = env.getDrillPos();
  if (!drillPos) return false;

  const dist = Math.hypot(player.position.x - drillPos.x, player.position.z - drillPos.z);
  if (dist < 4.0) {
    hud.showInteractHint('[E/ACT] Deep Core Drill');
    if (keysDown.has('KeyE') || touchInput.actionPressed) {
      hud.toggleDrillPanel();
      _actionCooldown = 0.5; // Debounce interaction
    }
    return true;
  }
  return false;
}

// ── Spaceship station interactions ────────────────────────────────────────────

function handleSpaceshipInteractions() {
  if (env.currentZone !== 'spaceship') return false;
  if (player.isInCombat || player.isGathering) return false;

  const px = player.position.x, pz = player.position.z;
  const RANGE = 2.2;
  const candidates = [];

  function reg(pos, hint, act) {
    if (!pos) return;
    const dist = Math.hypot(px - pos.x, pz - pos.z);
    if (dist < RANGE) candidates.push({ dist, hint, act });
  }

  // Offload Chamber — convert PP into permanent capacity (rate multiplier from tripartite)
  const offloadPos = env.getOffloadStationPos();
  if (offloadPos) {
    const dist = Math.hypot(px - offloadPos.x, pz - offloadPos.z);
    if (dist < RANGE) {
      const ppAvail = Math.floor(ppSystem.ppTotal);
      if (ppAvail >= 1) {
        const rateMult = tripartite.currentRateMultiplier;
        const previewGain = ppSystem.previewOffloadGain(rateMult);
        const rateLabel = rateMult > 1.005 ? ` ×${rateMult.toFixed(2)}` : '';
        if (previewGain >= 1) {
          candidates.push({
            dist,
            hint: `[E/ACT] Offload: −${ppAvail} PP → +${previewGain} cap${rateLabel}`,
            act: () => {
              const result = ppSystem.offload(tripartite.currentRateMultiplier);
              if (result) {
                hud.showInteractHint(`Offloaded! −${result.taken} PP → +${result.capGain} cap (now ${Math.floor(result.newCap)})`);
                questSystem.recordOffload(ppSystem.prestigeCount);
                challenges.recordOffload(result.taken);
                worldEffects.triggerOffload(player.position);
              }
            },
          });
        } else {
          // Gain scales with cap fill — too little banked to convert yet.
          candidates.push({
            dist,
            hint: `Offload: gain scales with cap fill — bank more PP`,
            act: () => {},
          });
        }
      }
    }
  }

  // Combat Simulator — simulated sparring trains STR/DEF passively (no drops)
  const simPos = env.getCombatSimPos();
  if (simPos) {
    const dist = Math.hypot(px - simPos.x, pz - simPos.z);
    if (dist < RANGE) {
      candidates.push({
        dist,
        hint: combatSim.enabled
          ? '[E/ACT] Combat Sim: TRAINING STR/DEF — stop'
          : '[E/ACT] Combat Sim: start sparring (trains STR/DEF)',
        act: () => {
          if (_actionCooldown > 0) return;
          _actionCooldown = 0.5;
          const on = combatSim.toggle();
          hud.showInteractHint(on ? 'Combat Sim engaged — STR/DEF training online' : 'Combat Sim stopped');
        },
      });
    }
  }

  reg(env.getFabricatorPos(), '[E/ACT] Open Fabricator', () => {
    const panel = document.getElementById('crafting-panel');
    if (panel && panel.hidden) togglePanel('crafting-panel');
  });

  // Charging Station — only when not at full HP/Energy
  const chargePos = env.getChargingStationPos();
  if (chargePos) {
    const dist = Math.hypot(px - chargePos.x, pz - chargePos.z);
    if (dist < RANGE && (statsSystem.currentHP < statsSystem.maxHP || statsSystem.currentEnergy < statsSystem.maxEnergy)) {
      candidates.push({
        dist,
        hint: '[E/ACT] Recharge — Restore HP & Energy',
        act: () => {
          const hpBefore = statsSystem.currentHP;
          const enBefore = statsSystem.currentEnergy;
          statsSystem.currentHP = statsSystem.maxHP;
          statsSystem.restoreEnergy();
          hud.showInteractHint(`Recharged! +${Math.ceil(statsSystem.maxHP - hpBefore)} HP, +${Math.ceil(statsSystem.maxEnergy - enBefore)} Energy`);
          gameStats.recordAction();
        },
      });
    }
  }

  reg(env.getDroneMonitorPos(), '[E/ACT] Drone Control', () => {
    if (_actionCooldown <= 0) { togglePanel('drone-panel'); _actionCooldown = 0.5; }
  });

  reg(env.getAscensionTerminalPos(), '[E/ACT] Recompile Terminal', () => {
    if (_actionCooldown <= 0) {
      togglePanel('ascension-panel');
      _actionCooldown = 0.5;
      questSystem.recordZoneAction('spaceship', 'ascensionTerminal');
    }
  });

  reg(env.getMasteryTerminalPos(), '[E/ACT] Mastery Terminal', () => {
    if (_actionCooldown <= 0) { togglePanel('mastery-panel'); _actionCooldown = 0.5; }
  });

  // Training chamber console — load a sim program before stepping in
  reg(env.getTrainingConsolePos(), '[E/ACT] Training Console — choose a sim program', () => {
    if (_actionCooldown <= 0) { togglePanel('training-panel'); _actionCooldown = 0.5; }
  });

  // Standing in an idle chamber: point the player at the console
  const trainChamber = env.getTrainingChamber();
  if (trainChamber && !trainingAreas.selectedProgram) {
    const dist = Math.hypot(px - trainChamber.x, pz - trainChamber.z);
    if (dist < trainChamber.r) {
      candidates.push({ dist: 0, hint: 'Sim chamber idle — load a program at the console', act: () => {} });
    }
  }

  if (candidates.length === 0) return false;

  candidates.sort((a, b) => a.dist - b.dist);
  const nearest = candidates[0];
  hud.showInteractHint(nearest.hint);
  if (keysDown.has('KeyE') || touchInput.actionPressed) nearest.act();
  return true;
}

// ── Workspace station interactions ───────────────────────────────────────────

function handleWorkspaceInteractions() {
  if (env.currentZone !== 'workspace') return false;
  if (player.isInCombat || player.isGathering) return false;

  const px = player.position.x, pz = player.position.z;
  const RANGE = 2.2;
  const candidates = [];

  function reg(pos, hint, act) {
    if (!pos) return;
    const dist = Math.hypot(px - pos.x, pz - pos.z);
    if (dist < RANGE) candidates.push({ dist, hint, act });
  }

  reg(env.getWorkshopStationPos(), '[E/ACT] Workshop', () => {
    if (_actionCooldown <= 0) { togglePanel('workshop-panel'); _actionCooldown = 0.5; }
  });
  reg(env.getConstructorStationPos(), '[E/ACT] Constructor', () => {
    if (_actionCooldown <= 0) { togglePanel('constructor-panel'); _actionCooldown = 0.5; }
  });
  reg(env.getExtractorStationPos(), '[E/ACT] Fabrication Bay', () => {
    if (_actionCooldown <= 0) { togglePanel('fabrication-panel'); _actionCooldown = 0.5; }
  });
  reg(env.getAssemblyMatrixStationPos(), '[E/ACT] Assembly Matrix', () => {
    if (_actionCooldown <= 0) { togglePanel('assembly-matrix-panel'); _actionCooldown = 0.5; }
  });
  reg(env.getRefineryStationPos(), '[E/ACT] Refinery', () => {
    if (_actionCooldown <= 0) { togglePanel('refinery-panel'); _actionCooldown = 0.5; }
  });

  if (candidates.length === 0) return false;

  candidates.sort((a, b) => a.dist - b.dist);
  const nearest = candidates[0];
  hud.showInteractHint(nearest.hint);
  if (keysDown.has('KeyE') || touchInput.actionPressed) nearest.act();
  return true;
}

// ── Gathering logic ───────────────────────────────────────────────────────────

let nearestNode = null;

function handleGathering(delta) {
  if (player.isInCombat) return;

  // Check resource nodes first
  nearestNode = entityManager.findNearestNode(player.position);

  if (player.isGathering) {
    hud.showGatherProgress(player.gatherProgress, player.gatherDuration);
    const result = player.getGatherResult();
    if (result) {
      const focusBonus = techTree?.owned.has('materialFocus') ? 1 : 0;
      inventorySystem.addMaterial(result.material, result.amount + focusBonus);
      hud.hideGatherProgress();
      hud.showInteractHint(`+${result.amount + focusBonus} ${result.material}`);
      _gatherHintCooldown = 1.5;
      gameStats.recordGather(result.amount);
      telemetry.trackGather('complete', result.material);
      questSystem.recordGather(env.currentZone, inventorySystem.materials);
    }
    return;
  }

  if (nearestNode) {
    if (nearestNode.requiredTool && !inventorySystem.hasTool(nearestNode.requiredTool)) {
      hud.showInteractHint(`Need ${SPECIALTY_TOOL_NAMES[nearestNode.requiredTool] ?? nearestNode.requiredTool} to gather ${nearestNode.materialType}`);
      return;
    }
    const gatherCost = _energyCost(CONFIG.ENERGY_COST_GATHER);
    if (statsSystem.currentEnergy >= gatherCost) {
      hud.showInteractHint(`[E/ACT] Gather ${nearestNode.materialType}`);
      if (keysDown.has('KeyE') || touchInput.actionPressed) {
        statsSystem.spendEnergy(gatherCost);
        player.startGathering(nearestNode);
        telemetry.trackGather('start');
      }
    } else {
      hud.showInteractHint(`Gather ${nearestNode.materialType} – need ${gatherCost} energy`);
    }
    return;
  }

  // No resource node — try tree/rock extended gather
  if (_gatherType) {
    // Already doing extended gather — handled above
    return;
  }
}

// ── Game loop ──────────────────────────────────────────────────────────────────

let lastTime = performance.now();
let _actionCooldown = 0; // prevents instant re-trigger of [E] across interaction types
let _energyWasEmpty = false; // latch for the energy_empty achievement counter
let _farmDirectorAt = 0;     // Farm Director module's 5s advance timer
let _portalRefreshTimer = 0;
window.__debugSystems = { inventorySystem, codexSystem, questSystem, hud, ppSystem, combatSim, trainingAreas, tripartite, statsSystem, modifiers, ascension, factorySystem, gameStats, pedometer, craftingSystem, chapters: chapterSystem, bossSystem, compute: computeSystem, offlineSystem, expedition, droneSystem, extractorSystem };
window.__debugSnapshot = () => {
  const hint = document.getElementById('interact-hint');
  const nearestNode = entityManager.findNearestNode(player.position);
  const nearestRock = env.findNearestRock(player.position);
  const nearestTree = env.findNearestTree(player.position);
  return {
    zone: env.currentZone,
    pos: { x: player.position.x, z: player.position.z },
    hint: { text: hint?.textContent, hidden: hint?.hidden },
    state: {
      _gatherType, _pendingZone, _actionCooldown,
      isInCombat: player.isInCombat, isGathering: player.isGathering,
      keysDown: [...keysDown],
    },
    nearestNode: nearestNode && { x: nearestNode.position.x, z: nearestNode.position.z, dist: nearestNode.position.distanceTo(player.position) },
    nearestRock: nearestRock && { x: nearestRock.x, z: nearestRock.z, props: nearestRock.props, dist: Math.hypot(player.position.x - nearestRock.x, player.position.z - nearestRock.z) },
    nearestTree: nearestTree && { x: nearestTree.x, z: nearestTree.z, dist: Math.hypot(player.position.x - nearestTree.x, player.position.z - nearestTree.z) },
    portals: env.getPortals().map(pt => ({ label: pt.label, targetZone: pt.targetZone, ppRequired: pt.ppRequired, dist: player.position.distanceTo(pt.position) })),
  };
};



function gameLoop(now) {
  if (_pendingZone) {
    switchZone(_pendingZone);
    _pendingZone = null;
  }

  const rawDelta = (now - lastTime) / 1000;
  lastTime = now;
  const delta = Math.min(rawDelta, 0.1);
  if (_actionCooldown > 0) _actionCooldown -= delta;

  // Update player
  player.update(keysDown, delta, touchInput);

  // Telemetry per-frame tracking
  telemetry.trackMovement(keysDown, player, touchInput);
  telemetry.trackPosition(player._totalDist || 0, pedometer.totalSteps);
  telemetry.trackPP(ppSystem.ppTotal, ppSystem.ppRate);

  // Collision resolution
  if (!player.isInCombat) {
    const PLAYER_R = 0.35;

    // Circle collision (trees, portals, boulders, spaceship walls, etc.)
    for (const c of env.getCollisionCircles()) {
      const cdx = player.position.x - c.x;
      const cdz = player.position.z - c.z;
      const dist = Math.hypot(cdx, cdz);
      if (dist < c.r + PLAYER_R && dist > 0.001) {
        const nx = cdx / dist, nz = cdz / dist;
        player.position.x = c.x + nx * (c.r + PLAYER_R);
        player.position.z = c.z + nz * (c.r + PLAYER_R);
        player.group.position.copy(player.position);
      }
    }

    // Resource node collision
    for (const c of entityManager.getNodeCollisionCircles()) {
      const cdx = player.position.x - c.x;
      const cdz = player.position.z - c.z;
      const dist = Math.hypot(cdx, cdz);
      if (dist < c.r + PLAYER_R && dist > 0.001) {
        const nx = cdx / dist, nz = cdz / dist;
        player.position.x = c.x + nx * (c.r + PLAYER_R);
        player.position.z = c.z + nz * (c.r + PLAYER_R);
        player.group.position.copy(player.position);
      }
    }

    // AABB collision (mine/depths grid blocks — exact box shape, parented to block)
    for (const box of env.getCollisionBoxes()) {
      const px = player.position.x, pz = player.position.z;
      const clampX = Math.max(box.minX, Math.min(px, box.maxX));
      const clampZ = Math.max(box.minZ, Math.min(pz, box.maxZ));
      const dx = px - clampX, dz = pz - clampZ;
      const dist = Math.hypot(dx, dz);
      if (dist < PLAYER_R) {
        if (dist < 0.001) {
          // Player center inside box — push out via shortest face exit
          const exits = [
            { gap: px - box.minX, nx: -1, nz: 0 },
            { gap: box.maxX - px, nx:  1, nz: 0 },
            { gap: pz - box.minZ, nx: 0, nz: -1 },
            { gap: box.maxZ - pz, nx: 0, nz:  1 },
          ];
          const e = exits.reduce((a, b) => a.gap < b.gap ? a : b);
          player.position.x += e.nx * (e.gap + PLAYER_R);
          player.position.z += e.nz * (e.gap + PLAYER_R);
        } else {
          const nx = dx / dist, nz = dz / dist;
          player.position.x = clampX + nx * PLAYER_R;
          player.position.z = clampZ + nz * PLAYER_R;
        }
        player.group.position.copy(player.position);
      }
    }
  }

  // Track proximity — speed boost
  const nearTracks = pedometer.getPlacedTracksForZone(env.currentZone)
    .filter(t => Math.hypot(player.position.x - t.x, player.position.z - t.z) < 1.0).length;
  statsSystem.setTrackBonus(nearTracks * CONFIG.PEDOMETER_TRACK_SPEED_BONUS);

  // Energy only replenishes via consumables or Charging Station (no passive regen)

  // Update PP, then route a slice of progression flow through the tripartite legs
  ppSystem.update(delta);
  tripartite.update(delta);

  // Training chamber: standing inside runs the pre-loaded program; the HUD
  // swaps to the sim-feed overlay while it runs and drops it on walk-out.
  if (env.currentZone === 'spaceship') {
    const chamber = env.getTrainingChamber();
    const inside = chamber &&
      Math.hypot(player.position.x - chamber.x, player.position.z - chamber.z) < chamber.r;
    trainingAreas.setActive(inside ? trainingAreas.selectedProgram : null);
  } else {
    trainingAreas.setActive(null);
  }
  trainingAreas.update(delta);
  hud.updateTrainingOverlay(trainingAreas);
  worldEffects.update(delta);

  // Update pedometer
  const steps = player.consumeSteps();
  pedometer.update(steps);
  if (steps > 0) {
    gameStats.recordSteps(steps);
    if (!document.getElementById('construct-panel')?.hidden) hud._refreshConstructPanel();
    questSystem.recordSteps(pedometer.totalSteps);
    challenges.recordSteps(steps);
  }

  // Periodically notify quest system of PP total (every ~2 seconds via HUD throttle)
  if (Math.floor(ppSystem.ppTotal) !== questSystem._counters.pp ||
      Math.floor(ppSystem.ppCap) !== questSystem._counters.ppCap) {
    questSystem.recordPP(Math.floor(ppSystem.ppTotal), Math.floor(ppSystem.ppCap));
  }

  // Update entities (pass collision circles AND boxes so enemies respect walls)
  entityManager.update(delta, player.position, env.getCollisionCircles(), env.getCollisionBoxes());

  // Update drone gathering
  droneSystem.update(delta);

  // Update factory + passive extraction/processing
  factorySystem.update(delta);
  extractorSystem.update(delta);
  processingNodes.update(delta);
  // Update progress bars for any open station panels
  const stationPanels = ['workshop-panel', 'constructor-panel', 'fabrication-panel'];
  for (const panelId of stationPanels) {
    const panel = document.getElementById(panelId);
    if (!panel || panel.hidden) continue;
    for (const [id, machine] of Object.entries(factorySystem.machines)) {
      if (!machine.unlocked) continue;
      const fill = document.getElementById('fill-' + id);
      if (fill) fill.style.width = `${machine.progress * 100}%`;
    }
  }
  // Live progress for the Refinery processing nodes (no DOM rebuild)
  const refineryPanel = document.getElementById('refinery-panel');
  if (refineryPanel && !refineryPanel.hidden) hud._tickRefinery();

  // Update crafting progress
  craftingSystem.update(delta);

  // Update environment (growing trees, etc.)
  env.update(delta);
  lootPopups.update(delta);

  // Mine chunked view — materialize rock visuals near the player, tear down far ones
  if (env._mineChunks) env._mineChunks.update(player.position);

  // Cave reveal ("transparency radius") — walls open a hole around the player.
  // Now redundant with the always-on through-wall ghost silhouette (Player.js),
  // which keeps the player visible behind rock WITHOUT cutting holes — the cut
  // is what read as the player "slipping through cracks" between rocks. Left off
  // by default; flip MINE_WALL_REVEAL to true to feed the shader and compare.
  if (MINE_WALL_REVEAL) {
    for (const m of env._revealMaterials) {
      const sh = m.userData.shader;
      if (sh) sh.uniforms.uPlayerPos.value.copy(player.position);
    }
  }

  // Lore discovery — the first time the player breaks through into the Breach
  if (env.currentZone === 'mine' && player.position.z > MINE_BREACH_Z) {
    codexSystem.discover('theBreach');
  }

  // Portal accessibility recolor — every 0.5s is plenty
  _portalRefreshTimer -= delta;
  if (_portalRefreshTimer <= 0) {
    _portalRefreshTimer = 0.5;
    // Threat indicators track player power on the same cadence; bosses keep red
    for (const e of entityManager.enemies) {
      if (!e.boss) e.setThreatColor(threatColorFor(e, statsSystem));
    }
    env.refreshPortalAccess((portal) =>
      portal.ppRequired === 0
      || pedometer.isZoneUnlocked(portal.targetZone)
      || bossSystem.hasClearance(portal.targetZone)
    );
  }

  // ── New busy-box systems ────────────────────────────────────────────────────
  offlineSystem.tick();
  // Field auto-combat retired — combat automation lives in the Spaceship
  // sparring rig (CombatSimSystem); real fights stay manual.
  combatSim.update(delta);
  minigame.update(delta);
  mathematician.update(delta);
  expedition.update(delta);
  ascension.update(delta); // online run-time for the Recompile momentum knee
  neuralImplant.update(delta);
  challenges.tick();
  // Auto-refresh OPT panel while mathematician is active so countdown ticks
  if (mathematician.isActive) {
    const optPanel = document.getElementById('optimization-panel');
    if (optPanel && !optPanel.hidden) {
      // throttle: only re-render every ~1s
      if ((now | 0) % 1000 < 16) hud._refreshOptimization();
    }
  }

  // Keep permanent multipliers synced: ascension × challenge rewards on PP,
  // boss trophies × challenge rewards on damage (also feeds the expedition sim)
  ppSystem.globalMultiplier = ascension.ppMultiplier * challenges.ppRateMult * factorySystem.moduleGlobalMult;
  combatSystem.permDamageMult = bossSystem.damageMult * challenges.damageMult * ascension.combatMultiplier;
  expedition.damageMult = combatSystem.damageMult * combatSystem.permDamageMult;

  // Compute gates (Phase E): once the board is unlocked, a destination with 0
  // units is paused (gateMult 0) and extra units boost it; while locked every
  // gate reads 1 (pre-S2 behavior). Factory lines pull their gate via callback.
  computeSystem.maybeSeed();
  droneSystem.efficiencyMult = modifiers.droneMult * ascension.droneMultiplier * computeSystem.gateMult('drones');
  expedition.computeMult = computeSystem.gateMult('ladder');
  extractorSystem.computeMult = computeSystem.gateMult('extractors');
  processingNodes.computeMult = computeSystem.gateMult('processing');
  trainingAreas.computeMult = computeSystem.unlocked ? computeSystem.gateMult('holodeck') : 0;

  // Farm Director (Al module): every 5s, walk the stocked ladder up to the
  // highest safe tier.
  if (now > _farmDirectorAt && computeSystem.hasModule('farmDirector') && expedition.computeMult > 0) {
    _farmDirectorAt = now + 5000;
    expedition.autoAdvanceFarm();
  }

  // Latch the energy-empty achievement counter on 0-crossings only
  if (statsSystem.currentEnergy <= 0) {
    if (!_energyWasEmpty) { gameStats.energyDepleted++; _energyWasEmpty = true; }
  } else {
    _energyWasEmpty = false;
  }

  // Achievement checks
  achievements.update(delta, {
    pp: ppSystem,
    statsSystem,
    gameStats,
    inventory: inventorySystem,
    drones: droneSystem,
    ascension,
    drill: drillSystem,
  });

  // Achievement toast display
  const newAch = achievements.popPending();
  if (newAch) hud.showAchievementToast(newAch);

  // ── Interaction priority chain ──────────────────────────────────────────────
  let showingHint = false;

  // Construction mode — overrides all other E interactions when panel is open
  if (!showingHint && !player.isInCombat) {
    if (handleConstructMode(delta)) showingHint = true;
  }

  // Extended gather (tree clear / rock drill) — takes priority over portals
  // Always call handleExtendedGather so the gather timer advances when active.
  if (!player.isInCombat) {
    if (handleExtendedGather(delta) || _gatherType) {
      showingHint = true;
    }
  }

  // Drill interaction
  if (!showingHint && !player.isInCombat && !player.isGathering) {
    if (handleDrillInteraction()) showingHint = true;
  }

  // Spaceship station interactions
  if (!showingHint && !player.isInCombat) {
    if (handleSpaceshipInteractions()) showingHint = true;
  }

  // Workspace station interactions
  if (!showingHint && !player.isInCombat) {
    if (handleWorkspaceInteractions()) showingHint = true;
  }

  // Resource node gathering
  // We handle gathering completion even if showingHint is true from elsewhere,
  // otherwise completing a gather while standing near a tree or rock causes a soft-lock.
  if (!player.isInCombat && (player.isGathering || !showingHint)) {
    nearestNode = entityManager.findNearestNode(player.position);
    if (nearestNode || player.isGathering) {
      handleGathering(delta);
      showingHint = true;
    }
  }

  // Zone portals
  let showingPortalHint = false;
  if (!player.isInCombat && !player.isGathering && !_gatherType && !showingHint) {
    const portals = env.getPortals();
    for (const portal of portals) {
      const dist = player.position.distanceTo(portal.position);
      if (dist < 2.5) {
        showingHint = true;
        showingPortalHint = true;
        const zoneUnlocked = portal.ppRequired === 0
          || pedometer.isZoneUnlocked(portal.targetZone)
          || bossSystem.hasClearance(portal.targetZone);
        
        if (zoneUnlocked) {
          hud.showInteractHint(`[E/ACT] Enter ${portal.label}`);
          if ((keysDown.has('KeyE') || touchInput.actionPressed) && _actionCooldown <= 0) {
            _pendingZone = portal.targetZone;
            _actionCooldown = 0.8; // Prevent accidental double-jump
          }
        } else {
          // Show why it's locked without prompting an action — chapters gate zones now
          const gateBoss = BossSystem.BOSS_DEFS.find(d => d.unlocks === portal.targetZone);
          const stepCost = CONFIG.PEDOMETER_ENV_UNLOCK[portal.targetZone];
          hud.showInteractHint(`Locked: ${portal.label} — defeat ${gateBoss ? gateBoss.label : 'the previous chapter boss'}${stepCost ? ` (or spend ${stepCost.toLocaleString()} steps)` : ''}`);
        }
        break;
      }
    }
  }

  // Seed planting hint — only when standing still, not on every frame
  // (prevents the hint from dominating the HUD on session load)

  // Track placement/removal hints removed — track UX lives in BUILD panel
  // (mobile-first: no keyboard-only [G]/[T] hints in the world).

  if (!showingHint) hud.hideInteractHint();
  if (!player.isGathering && !_gatherType) hud.hideGatherProgress();
  touchInput.consumeActionPulse?.();

  // Camera follows player
  sceneManager.update(player.position);

  // HUD update
  hud.update(now);

  sceneManager.render();
}

sceneManager.renderer.setAnimationLoop(gameLoop);
