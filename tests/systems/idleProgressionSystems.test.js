import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PPSystem } from '../../js/systems/PPSystem.js';
import { StatsSystem } from '../../js/systems/StatsSystem.js';
import { InventorySystem } from '../../js/systems/InventorySystem.js';
import { BossSystem } from '../../js/systems/BossSystem.js';
import { ExpeditionSystem } from '../../js/systems/ExpeditionSystem.js';
import { ChallengeSystem } from '../../js/systems/ChallengeSystem.js';
import { NeuralImplantSystem } from '../../js/systems/NeuralImplantSystem.js';

function makeWorld() {
  const pp = new PPSystem();
  const stats = new StatsSystem();
  const inventory = new InventorySystem();
  return { pp, stats, inventory };
}

// ── Expedition (idle adventure) ────────────────────────────────────────────────

test('expedition tier 0 is fightable with starting stats', () => {
  const { pp, stats, inventory } = makeWorld();
  const exp = new ExpeditionSystem(pp, stats, inventory);
  assert.equal(exp.tierUnlocked(0), true);
  assert.equal(exp.tierUnlocked(1), false, 'tier 1 locked until tier 0 cleared');
  assert.equal(exp.tierTooDangerous(0), false, 'starter frame survives tier 0');
  assert.ok(exp.killRate(0) > 0);
});

test('expedition accumulates kills, PP and drops while active', () => {
  const { pp, stats, inventory } = makeWorld();
  stats.stats.strength.level = 20; // 40 dmg → 50 dps → fast kills
  const exp = new ExpeditionSystem(pp, stats, inventory);
  assert.equal(exp.start(), true);

  const ppBefore = pp.ppTotal;
  exp.update(30); // 30 simulated seconds
  assert.ok(exp.totalKills > 0, 'kills accumulated');
  assert.ok(pp.ppTotal > ppBefore, 'PP awarded');
});

test('clearing 50 kills defeats the warden and unlocks the next tier', () => {
  const { pp, stats, inventory } = makeWorld();
  stats.stats.strength.level = 100;
  const exp = new ExpeditionSystem(pp, stats, inventory);
  exp.start();
  // Enough simulated time for 50+ kills at this DPS
  for (let i = 0; i < 100; i++) exp.update(10);
  assert.ok(exp.killsIn(0) >= 50);
  assert.equal(exp.tierCleared(0), true);
  assert.equal(exp.tierUnlocked(1), true);
});

test('expedition offline simulation awards kills at reduced efficiency', () => {
  const { pp, stats, inventory } = makeWorld();
  stats.stats.strength.level = 20;
  const exp = new ExpeditionSystem(pp, stats, inventory);
  exp.start();
  const summary = exp.simulateOffline(3600, 0.5);
  assert.ok(summary, 'offline summary produced');
  assert.ok(summary.kills > 0);
  assert.ok(summary.pp > 0);
});

test('expedition serialize/deserialize round-trip', () => {
  const { pp, stats, inventory } = makeWorld();
  const exp = new ExpeditionSystem(pp, stats, inventory);
  exp.active = true;
  exp.tier = 2;
  exp.highestCleared = 1;
  exp.kills = { 0: 55, 1: 60, 2: 10 };
  exp.totalKills = 125;

  const exp2 = new ExpeditionSystem(pp, stats, inventory);
  exp2.deserialize(JSON.parse(JSON.stringify(exp.serialize())));
  assert.equal(exp2.active, true);
  assert.equal(exp2.tier, 2);
  assert.equal(exp2.highestCleared, 1);
  assert.equal(exp2.killsIn(1), 60);
  assert.equal(exp2.totalKills, 125);
});

// ── Boss system ────────────────────────────────────────────────────────────────

test('boss defeat applies permanent PP bonuses and clearance', () => {
  const { pp } = makeWorld();
  const bosses = new BossSystem(pp);
  const rateBefore = pp.ppRate;
  const capBefore = pp.ppCap;

  bosses.recordDefeat('boss_landing'); // +0.5 PP/s, unlocks verdantMaw
  assert.equal(pp.ppRate, rateBefore + 0.5);
  assert.equal(bosses.hasClearance('verdantMaw'), true);
  assert.equal(bosses.hasClearance('depths'), false);

  bosses.recordDefeat('boss_mine'); // ×1.10 cap, unlocks depths
  assert.ok(Math.abs(pp.ppCap - capBefore * 1.10) < 1e-6);
  assert.equal(bosses.hasClearance('depths'), true);
});

test('boss damage bonuses multiply and defeats do not double-apply', () => {
  const { pp } = makeWorld();
  const bosses = new BossSystem(pp);
  bosses.recordDefeat('boss_verdant'); // ×1.10 damage
  bosses.recordDefeat('boss_verdant'); // duplicate — ignored
  bosses.recordDefeat('boss_depths');  // ×1.25 damage
  assert.ok(Math.abs(bosses.damageMult - 1.10 * 1.25) < 1e-9);
});

test('boss serialize round-trip re-applies bonuses', () => {
  const { pp } = makeWorld();
  const bosses = new BossSystem(pp);
  bosses.recordDefeat('boss_landing');

  const pp2 = new PPSystem();
  const bosses2 = new BossSystem(pp2);
  bosses2.deserialize(JSON.parse(JSON.stringify(bosses.serialize())));
  bosses2.applyBonuses();
  assert.equal(bosses2.isDefeated('boss_landing'), true);
  assert.equal(pp2.ppRate, new PPSystem().ppRate + 0.5);
});

// ── Challenges ─────────────────────────────────────────────────────────────────

test('silentGrowth fails on stat upgrade, completes on qualifying offload', () => {
  const { pp } = makeWorld();
  const ch = new ChallengeSystem(pp);
  let failed = null, completed = null;
  ch.onFail = (def) => { failed = def.id; };
  ch.onComplete = (def) => { completed = def.id; };

  ch.start('silentGrowth');
  ch.recordStatUpgrade();
  assert.equal(failed, 'silentGrowth');
  assert.equal(ch.activeId, null);

  ch.start('silentGrowth');
  ch.recordOffload(150); // below the 200 threshold — still running
  assert.equal(ch.activeId, 'silentGrowth');
  ch.recordOffload(250);
  assert.equal(completed, 'silentGrowth');
  assert.equal(ch.isCompleted('silentGrowth'), true);
  assert.ok(Math.abs(ch.ppRateMult - 1.05) < 1e-9);
});

test('completed challenge cannot restart; only one active at a time', () => {
  const { pp } = makeWorld();
  const ch = new ChallengeSystem(pp);
  ch.start('silentGrowth');
  assert.equal(ch.start('pacifistCore'), false, 'second concurrent start rejected');
  ch.recordOffload(500);
  assert.equal(ch.start('silentGrowth'), false, 'completed challenge cannot restart');
});

test('pacifistCore completes via tick and applies cap bonus', () => {
  const { pp } = makeWorld();
  const ch = new ChallengeSystem(pp);
  const capBefore = pp.ppCap;
  ch.start('pacifistCore');
  pp.ppTotal = 600;
  ch.tick();
  assert.equal(ch.isCompleted('pacifistCore'), true);
  assert.ok(Math.abs(pp.ppCap - capBefore * 1.05) < 1e-6);
});

test('challenge serialize round-trip preserves completion and active run', () => {
  const { pp } = makeWorld();
  const ch = new ChallengeSystem(pp);
  ch.start('ironPilgrimage');
  ch.recordSteps(500);

  const ch2 = new ChallengeSystem(pp);
  ch2.deserialize(JSON.parse(JSON.stringify(ch.serialize())));
  assert.equal(ch2.activeId, 'ironPilgrimage');
  ch2.recordSteps(1500);
  assert.equal(ch2.isCompleted('ironPilgrimage'), true, 'steps carry across save/load');
});

// ── Neural Implant ─────────────────────────────────────────────────────────────

test('implant siphons PP into training and auto-levels the target stat', () => {
  const { pp, stats } = makeWorld();
  const imp = new NeuralImplantSystem(pp, stats);
  pp.ppTotal = 100;
  imp.setTarget('strength');
  assert.equal(stats.stats.strength.level, 1);

  // drain = 1.0 PP/s × 0.25 = 0.25/s; level 1 cost = 10 → 40s levels once, then
  // banks toward the level-2 cost. 60s → 15 PP banked → level 2 + 5 leftover-ish.
  imp.update(60);
  assert.equal(stats.stats.strength.level, 2);
  assert.ok(pp.ppTotal < 100, 'PP pool was drained');
  assert.equal(imp.totalTrained, 1);
});

test('implant stalls when the PP pool is empty', () => {
  const { pp, stats } = makeWorld();
  const imp = new NeuralImplantSystem(pp, stats);
  pp.ppTotal = 0;
  imp.setTarget('strength');
  imp.update(120);
  assert.equal(stats.stats.strength.level, 1, 'no PP, no training');
});

test('implant offline training levels stats without touching the pool', () => {
  const { pp, stats } = makeWorld();
  const imp = new NeuralImplantSystem(pp, stats);
  pp.ppTotal = 50;
  imp.setTarget('strength');
  const levels = imp.simulateOffline(3600, 0.5); // 450 banked XP at defaults
  assert.ok(levels > 0);
  assert.equal(pp.ppTotal, 50, 'offline training does not drain the pool');
});

test('implant switching targets forfeits banked progress', () => {
  const { pp, stats } = makeWorld();
  const imp = new NeuralImplantSystem(pp, stats);
  pp.ppTotal = 100;
  imp.setTarget('strength');
  imp.update(20); // 5 banked
  assert.ok(imp.xp > 0);
  imp.setTarget('defense');
  assert.equal(imp.xp, 0);
});

test('implant serialize round-trip', () => {
  const { pp, stats } = makeWorld();
  const imp = new NeuralImplantSystem(pp, stats);
  imp.setTarget('focus');
  imp.xp = 7.5;
  imp.totalTrained = 3;

  const imp2 = new NeuralImplantSystem(pp, stats);
  imp2.deserialize(JSON.parse(JSON.stringify(imp.serialize())));
  assert.equal(imp2.target, 'focus');
  assert.equal(imp2.xp, 7.5);
  assert.equal(imp2.totalTrained, 3);
});
