import assert from 'node:assert/strict';
import { test } from 'node:test';
import { StatsSystem } from '../../js/systems/StatsSystem.js';
import { InventorySystem } from '../../js/systems/InventorySystem.js';
import { TrainingAreaSystem } from '../../js/systems/TrainingAreaSystem.js';

function makeTraining() {
  const stats = new StatsSystem();
  const inventory = new InventorySystem();
  return { stats, inventory, training: new TrainingAreaSystem(stats, inventory) };
}

// ── Basic training ─────────────────────────────────────────────────────────────

test('parked on a basic pad banks XP and auto-levels the stat', () => {
  const { stats, training } = makeTraining();
  const startLevel = stats.stats.strength.level;
  const cost = stats.upgradeCost('strength');

  training.setActive('strength_sim');
  // base 0.5 XP/s at station Lv1, no power bonus — train just past one level
  training.update(cost / 0.5 + 1);

  assert.equal(stats.stats.strength.level, startLevel + 1, 'strength leveled once');
  assert.ok(training.bank.strength >= 0 && training.bank.strength < stats.upgradeCost('strength'));
});

test('no training happens off-pad', () => {
  const { stats, training } = makeTraining();
  const startLevel = stats.stats.strength.level;
  training.setActive(null);
  training.update(1000);
  assert.equal(stats.stats.strength.level, startLevel);
});

// ── Advanced pad trade-off (the NGU-style real cost) ───────────────────────────

test('advanced pad trains two stats at 2x and de-levels the drained stat', () => {
  const { stats, training } = makeTraining();
  stats.stats.defense.level = 5;
  const str0 = stats.stats.strength.level;
  const dex0 = stats.stats.dexterity.level;

  training.setActive('overdrive_arena'); // STR x2, DEX x2, DEF -1
  training.update(600);

  assert.ok(stats.stats.strength.level > str0, 'strength trained');
  assert.ok(stats.stats.dexterity.level > dex0, 'dexterity trained');
  assert.ok(stats.stats.defense.level < 5, 'defense paid the cost');
});

test('the drain floors at stat level 1 and never goes below', () => {
  const { stats, training } = makeTraining();
  stats.stats.defense.level = 2;
  training.setActive('overdrive_arena');
  training.update(100000);
  assert.equal(stats.stats.defense.level, 1, 'drain floored at Lv 1');
  assert.ok(training.bank.defense >= 0, 'no negative bank left behind');
});

// ── Power hookup ───────────────────────────────────────────────────────────────

test('tripartite power bonus multiplies training throughput', () => {
  const { training } = makeTraining();
  const flat = training.effectiveRate('strength_sim');
  training.getPowerBonus = () => 1; // +100%
  assert.equal(training.effectiveRate('strength_sim'), flat * 2);
});

// ── Upgrades (material recipes) ────────────────────────────────────────────────

test('station upgrade consumes the component recipe and raises the rate', () => {
  const { inventory, training } = makeTraining();
  assert.equal(training.upgrade('strength_sim'), false, 'no components — no upgrade');

  inventory.addMaterial('iron', 15);
  inventory.addMaterial('stone', 10);
  const rateBefore = training.effectiveRate('strength_sim');

  assert.equal(training.upgrade('strength_sim'), true);
  assert.equal(training.stationLevel('strength_sim'), 2);
  assert.equal(inventory.materials.iron, 0, 'iron consumed');
  assert.equal(inventory.materials.stone, 0, 'stone consumed');
  assert.ok(training.effectiveRate('strength_sim') > rateBefore, 'upgraded pad trains faster');
});

test('stations cap at the top of their recipe table', () => {
  const { training } = makeTraining();
  training.levels.strength_sim = 5;
  assert.equal(training.upgradeCost('strength_sim'), null);
  assert.equal(training.canUpgrade('strength_sim'), false);
});

// ── Offline parked training ────────────────────────────────────────────────────

test('a parked player keeps training offline at reduced efficiency', () => {
  const { stats, training } = makeTraining();
  const cost = stats.upgradeCost('strength');
  training.setActive('strength_sim');

  // 50% efficiency: needs twice the wall-clock for the same XP
  const summary = training.simulateOffline(2 * (cost / 0.5) + 4, 0.5);
  assert.ok(summary, 'summary produced');
  assert.equal(summary.station, 'Strength Sim');
  assert.equal(summary.deltas.strength, 1, 'one level gained while away');
});

test('no offline training without a parked pad', () => {
  const { training } = makeTraining();
  training.setActive(null);
  assert.equal(training.simulateOffline(86400, 0.5), null);
});

// ── Program selection + stint (chamber flow) ───────────────────────────────────

test('selectProgram validates ids and stores the console choice', () => {
  const { training } = makeTraining();
  assert.equal(training.selectProgram('overdrive_arena'), true);
  assert.equal(training.selectedProgram, 'overdrive_arena');
  assert.equal(training.selectProgram('not_a_program'), false);
  assert.equal(training.selectedProgram, 'overdrive_arena', 'invalid id leaves choice untouched');
  assert.equal(training.selectProgram(null), true, 'unloading is allowed');
});

test('entering the chamber resets the stint clock and tallies gains', () => {
  const { stats, training } = makeTraining();
  const cost = stats.upgradeCost('strength');

  training.setActive('strength_sim');
  training.update(cost / 0.5 + 1);
  assert.ok(training.stint.seconds > 0, 'stint clock runs while active');
  assert.equal(training.stint.levels.strength, 1, 'stint tallies the level gained');

  training.setActive(null);              // walk out
  training.setActive('strength_sim');    // walk back in
  assert.equal(training.stint.seconds, 0, 'new visit starts a fresh stint');
  assert.deepEqual(training.stint.levels, {});
});

// ── Persistence ────────────────────────────────────────────────────────────────

test('serialize/deserialize round-trips levels, banks, program, and active sim', () => {
  const { training } = makeTraining();
  training.levels.overdrive_arena = 3;
  training.bank.strength = 12.5;
  training.selectProgram('overdrive_arena');
  training.setActive('overdrive_arena');
  training.totalTrained = 7;

  const { stats: stats2, inventory: inv2 } = { stats: new StatsSystem(), inventory: new InventorySystem() };
  const fresh = new TrainingAreaSystem(stats2, inv2);
  fresh.deserialize(JSON.parse(JSON.stringify(training.serialize())));

  assert.equal(fresh.stationLevel('overdrive_arena'), 3);
  assert.equal(fresh.bank.strength, 12.5);
  assert.equal(fresh.selectedProgram, 'overdrive_arena');
  assert.equal(fresh.activeId, 'overdrive_arena');
  assert.equal(fresh.totalTrained, 7);
});
