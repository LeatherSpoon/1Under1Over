// Phase A "trust the chain" — every previously-dead emitter now has a real effect.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../../js/config.js';
import { PPSystem } from '../../js/systems/PPSystem.js';
import { StatsSystem } from '../../js/systems/StatsSystem.js';
import { InventorySystem } from '../../js/systems/InventorySystem.js';
import { PedometerSystem } from '../../js/systems/PedometerSystem.js';
import { ModifiersSystem } from '../../js/systems/ModifiersSystem.js';
import { FactorySystem } from '../../js/systems/FactorySystem.js';
import { GameStatistics } from '../../js/systems/GameStatistics.js';
import { CombatSystem } from '../../js/systems/CombatSystem.js';
import { CraftingSystem } from '../../js/systems/CraftingSystem.js';
import { CraftingMasterySystem } from '../../js/systems/CraftingMasterySystem.js';
import { createLocalDefinitions, normalizeRecipesForCrafting } from '../../js/systems/ProgressionDefinitions.js';

test('pedometer PP-per-step purchases raise the step grant', () => {
  const pp = new PPSystem();
  const ped = new PedometerSystem(pp);
  ped.totalSteps = 1000;
  assert.ok(ped.buyPPBonus(), 'bonus purchase should succeed with banked steps');
  const before = pp.ppTotal;
  ped.update(4);
  const expected = 4 * (CONFIG.PP_PER_STEP + CONFIG.PEDOMETER_PP_BONUS_AMOUNT);
  assert.ok(Math.abs((pp.ppTotal - before) - expected) < 1e-9,
    `step grant should include purchased bonus: got ${pp.ppTotal - before}, want ${expected}`);
});

test('Minimalist modifier raises stat upgrade costs by 10%', () => {
  const pp = new PPSystem();
  const stats = new StatsSystem();
  const mods = new ModifiersSystem(pp);
  mods.onChange = () => { stats.costMult = mods.statCostMult; };
  const base = stats.upgradeCost('strength');
  mods.toggle('minimalist');
  assert.equal(stats.upgradeCost('strength'), Math.ceil(base * 1.10));
  mods.toggle('minimalist');
  assert.equal(stats.upgradeCost('strength'), base);
});

test('crafting mastery levels shorten craft time', () => {
  const defs = createLocalDefinitions();
  const mastery = new CraftingMasterySystem({ tracks: defs.masteryTracks });
  const crafting = new CraftingSystem(new InventorySystem(), new StatsSystem(), {
    recipes: normalizeRecipesForCrafting(defs), mastery,
  });
  const t1 = crafting._calcCraftTime(10, 'survival');
  mastery.award('survival', 100); // level 2 → ×0.96
  const t2 = crafting._calcCraftTime(10, 'survival');
  assert.ok(t2 < t1, `mastery should shorten craft time (${t1} -> ${t2})`);
  assert.ok(Math.abs(t2 / t1 - 0.96) < 1e-6);
});

test('every archetype drop table (incl. dunkraza) uses known materials', () => {
  const inv = new InventorySystem();
  const tables = CombatSystem.DROP_TABLES;
  assert.ok(tables.dunkraza && tables.dunkraza.length > 0, 'dunkraza needs a drop table');
  for (const [archetype, rows] of Object.entries(tables)) {
    for (const { mat } of rows) {
      assert.ok(mat in inv.materials, `${archetype} drops unknown material ${mat}`);
    }
  }
});

test('craft queue and active job survive serialize/load', () => {
  const recipes = normalizeRecipesForCrafting(createLocalDefinitions());
  const inv = new InventorySystem();
  const a = new CraftingSystem(inv, new StatsSystem(), { recipes });
  inv.addMaterial('timber', 20);
  inv.addMaterial('fiber', 20);
  assert.ok(a.queueCraft('ration'));
  assert.ok(a.queueCraft('ration'));
  assert.ok(a.isCrafting);
  assert.equal(a.queueLength, 1);

  const b = new CraftingSystem(new InventorySystem(), new StatsSystem(), { recipes });
  b.load(a.serialize());
  assert.ok(b.isCrafting, 'active craft should resume after load');
  assert.equal(b.queueLength, 1);
  assert.equal(b.craftingRecipeName, a.craftingRecipeName);
});

test('zone-kill set and energy-depletion counter record and expose', () => {
  const gs = new GameStatistics();
  gs.recordEnemyDefeated('mine');
  gs.recordEnemyDefeated('mine');
  gs.recordEnemyDefeated('depths');
  assert.equal(gs.zonesWithKills.size, 2);
  assert.equal(gs.enemiesDefeated, 3);
  assert.equal(gs.energyDepleted, 0);
});

test('quantum ring buff exposes a multiplier instead of mutating globalMultiplier', () => {
  const pp = new PPSystem();
  const f = new FactorySystem(new InventorySystem(), pp, new StatsSystem(), null);
  f.giveOutput('quantum_processor_ring', 1);
  assert.equal(f.moduleGlobalMult, 1.20);
  assert.equal(pp.globalMultiplier, 1, 'globalMultiplier is owned by the main-loop recompute');

  const g = new FactorySystem(new InventorySystem(), new PPSystem(), new StatsSystem(), null);
  g.deserialize(f.serialize());
  assert.equal(g.moduleGlobalMult, 1.20, 'ring multiplier survives save round-trip');
});
