import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PPSystem } from '../../js/systems/PPSystem.js';
import { StatsSystem } from '../../js/systems/StatsSystem.js';
import { InventorySystem } from '../../js/systems/InventorySystem.js';
import { BossSystem } from '../../js/systems/BossSystem.js';
import { ExpeditionSystem } from '../../js/systems/ExpeditionSystem.js';
import { ChallengeSystem } from '../../js/systems/ChallengeSystem.js';
import { NeuralImplantSystem } from '../../js/systems/NeuralImplantSystem.js';
import { AscensionSystem } from '../../js/systems/AscensionSystem.js';

function makeWorld() {
  const pp = new PPSystem();
  const stats = new StatsSystem();
  const inventory = new InventorySystem();
  return { pp, stats, inventory };
}

// ── Simulation Ladder (idle adventure) ─────────────────────────────────────────

test('ladder tier 0 is fightable with starting stats and tier math is exponential', () => {
  const { pp, stats, inventory } = makeWorld();
  const exp = new ExpeditionSystem(pp, stats, inventory);
  assert.equal(exp.maxTier, 9, 'first band open before any warden');
  assert.equal(exp.tierTooDangerous(0), false, 'starter frame survives tier 0');
  assert.ok(exp.killRate(0) > 0);
  assert.ok(Math.abs(exp.enemyHP(0) - 30) < 1e-9);
  assert.ok(Math.abs(exp.enemyHP(10) - 30 * Math.pow(1.18, 10)) < 1e-6);
  assert.equal(exp.killRate(15), 0, 'tiers beyond the warden gate are inaccessible');
});

test('ladder accumulates kills, PP and drops while active', () => {
  const { pp, stats, inventory } = makeWorld();
  stats.stats.strength.level = 20; // 40 dmg → 50 dps → fast kills
  const exp = new ExpeditionSystem(pp, stats, inventory);
  assert.equal(exp.start(), true);

  const ppBefore = pp.ppTotal;
  exp.update(30); // 30 simulated seconds
  assert.ok(exp.totalKills > 0, 'kills accumulated');
  assert.ok(pp.ppTotal > ppBefore, 'PP awarded');
});

test('field kills mint Override Keys deterministically; bosses never do', () => {
  const { pp, stats, inventory } = makeWorld();
  const exp = new ExpeditionSystem(pp, stats, inventory);
  for (let i = 0; i < 14; i++) exp.recordFieldKill('serpendrill');
  assert.equal(exp.keysFor('serpendrill'), 2, '14 kills = 2 keys (5 per key)');
  assert.equal(exp.killsTowardKey('serpendrill'), 4);
  exp.recordFieldKill('boss_landing');
  exp.recordFieldKill('not_a_creature');
  assert.equal(exp.keysFor('serpendrill'), 2, 'non-family archetypes never mint keys');
});

test('warden success clears the band, opens the next, banks Archive Fragments', () => {
  const { pp, stats, inventory } = makeWorld();
  stats.stats.strength.level = 500;
  stats.stats.health.level = 500;
  const exp = new ExpeditionSystem(pp, stats, inventory);
  for (let i = 0; i < 15; i++) exp.recordFieldKill('serpendrill'); // 3 keys
  const preview = exp.wardenPreview();
  assert.equal(preview.keysNeed, 3);
  assert.ok(preview.damageFraction >= 1, 'this frame should project a win');

  const res = exp.attemptWarden();
  assert.equal(res.won, true);
  assert.equal(exp.wardensCleared, 1);
  assert.equal(exp.maxTier, 19);
  assert.ok(exp.archiveShards > 0, 'success banks Archive Fragments');
  assert.equal(exp.keysFor('serpendrill'), 0, 'keys spent');
  assert.equal(exp.isBandCleared(0), true, 'band 0 becomes a farm sector');
});

test('failed warden push costs keys but salvages partial fragments', () => {
  const { pp, stats, inventory } = makeWorld();
  const exp = new ExpeditionSystem(pp, stats, inventory); // starter stats cannot win gate 10
  for (let i = 0; i < 15; i++) exp.recordFieldKill('serpendrill');
  const res = exp.attemptWarden();
  assert.equal(res.won, false);
  assert.equal(exp.wardensCleared, 0);
  assert.ok(res.damageFraction > 0 && res.damageFraction < 1);
  assert.equal(exp.keysFor('serpendrill'), 0, 'a failed push still spends the keys');
});

test('ladder offline simulation awards kills at reduced efficiency', () => {
  const { pp, stats, inventory } = makeWorld();
  stats.stats.strength.level = 20;
  const exp = new ExpeditionSystem(pp, stats, inventory);
  exp.start();
  const summary = exp.simulateOffline(3600, 0.5);
  assert.ok(summary, 'offline summary produced');
  assert.ok(summary.kills > 0);
  assert.ok(summary.pp > 0);
});

test('ladder serialize/deserialize round-trip preserves keys, wardens, fragments', () => {
  const { pp, stats, inventory } = makeWorld();
  const exp = new ExpeditionSystem(pp, stats, inventory);
  exp.active = true;
  exp.tier = 14;
  exp.wardensCleared = 2;
  exp.keys = { serpendrill: 2, reptlar: 1 };
  exp._killCounters = { reptlar: 3 };
  exp.totalKills = 125;
  exp.archiveShards = 37;

  const exp2 = new ExpeditionSystem(pp, stats, inventory);
  exp2.deserialize(JSON.parse(JSON.stringify(exp.serialize())));
  assert.equal(exp2.active, true);
  assert.equal(exp2.tier, 14);
  assert.equal(exp2.wardensCleared, 2);
  assert.equal(exp2.keysFor('serpendrill'), 2);
  assert.equal(exp2.killsTowardKey('reptlar'), 3);
  assert.equal(exp2.totalKills, 125);
  assert.equal(exp2.archiveShards, 37);
});

test('v10 legacy expedition saves migrate by enemy-HP equivalence', () => {
  const { pp, stats, inventory } = makeWorld();
  const exp = new ExpeditionSystem(pp, stats, inventory);
  exp.deserialize({ active: true, tier: 3, highestCleared: 2, kills: { 0: 55, 1: 60 }, totalKills: 125, totalPP: 900 });
  assert.equal(exp.wardensCleared, 2, 'old tier-2 clear ≈ two sim wardens');
  assert.equal(exp.tier, 20, 'old tier 3 (900 HP) ≈ new tier 20');
  assert.ok(exp.tier <= exp.maxTier, 'migrated tier stays accessible');
  assert.equal(exp.totalKills, 125);
  assert.equal(exp.archiveShards, 0);
});

// ── Recompile + Archive (rebirth) ──────────────────────────────────────────────

function makeRecompileWorld() {
  const { pp, stats, inventory } = makeWorld();
  const exp = new ExpeditionSystem(pp, stats, inventory);
  const asc = new AscensionSystem(pp);
  asc.expedition = exp;
  return { pp, stats, inventory, exp, asc };
}

test('recompile locks until a warden falls; the NUMBER composes peak × wardens × momentum', () => {
  const { asc, exp, stats } = makeRecompileWorld();
  assert.equal(asc.recompileUnlocked, false);
  assert.equal(asc.canAscend(), false);

  stats.stats.strength.level = 500;
  stats.stats.health.level = 500;
  for (let i = 0; i < 15; i++) exp.recordFieldKill('serpendrill');
  exp.attemptWarden();
  assert.equal(asc.recompileUnlocked, true, 'first warden unlocks Recompile');

  exp.setTier(15);
  assert.equal(asc.momentum, 1.5, 'warden trigger jumps momentum to ×1.5');
  assert.equal(asc.archiveNext, 9, 'floor(15/5 × 2 wardens × 1.5)');
});

test('momentum knee: dormant early, ×1.5 jump, +0.5/hr growth, ×4 cap', () => {
  const { asc } = makeRecompileWorld();
  assert.equal(asc.momentum, 1, 'dormant before 2h with no warden');
  asc.runSeconds = 3 * 3600;
  assert.equal(asc.momentum, 2, '1.5 + 0.5×(3−2)');
  asc.runSeconds = 24 * 3600;
  assert.equal(asc.momentum, 4, 'capped at ×4');
});

test('recompile pays watermark once, sweeps fragments, resets the run layer only', () => {
  const { asc, exp, stats, pp } = makeRecompileWorld();
  stats.stats.strength.level = 500;
  stats.stats.health.level = 500;
  for (let i = 0; i < 15; i++) exp.recordFieldKill('serpendrill');
  exp.attemptWarden();       // wardens 1, +15 fragments (5 + gate 10)
  exp.setTier(15);
  pp.ppTotal = 999;

  const expected = asc.archiveNext + 2 * 15 + exp.archiveShards; // base + watermark + fragments
  const r = asc.recompile();
  assert.equal(r.gained, expected);
  assert.equal(asc.archive, expected);
  assert.equal(asc.bestTierEver, 15);
  assert.equal(pp.ppTotal, 0);
  assert.equal(pp.ppCap, 150);
  assert.equal(exp.tier, 0);
  assert.equal(exp.wardensCleared, 0);
  assert.equal(exp.peakTier, 0);
  assert.equal(exp.archiveShards, 0, 'fragments swept into Archive');
  assert.equal(exp.keysFor('serpendrill'), 0, 'keys reset with the run');
  assert.equal(asc.watermarkBonus, 0, 're-reaching an old peak pays no watermark');
});

test('legacy AP saves convert to Archive (1 AP → 3) with shop levels intact', () => {
  const { asc } = makeRecompileWorld();
  asc.deserialize({ ascensionCount: 2, ascensionPoints: 5, ppMultiplier: 1.5, upgradeCounts: { ppMult: 2, combatMult: 1 } });
  assert.equal(asc.archive, 15);
  assert.equal(asc.ascensionCount, 2);
  assert.equal(asc.ppMultiplier, 1.5, '1 + 0.25 × level 2');
  assert.ok(Math.abs(asc.combatMultiplier - 1.15) < 1e-9, 'combat recomputes as 1.15^level');
  assert.equal(asc.offlineCapSeconds, 12 * 3600, 'v14 stocked-offline base buffer is 12h');
});

test('archive shop spends and levels; offline buffer extends the cap; round-trips', () => {
  const { asc } = makeRecompileWorld();
  asc.archive = 20;
  assert.ok(asc.buyUpgrade('ppMult'));        // cost 1
  assert.equal(asc.ppMultiplier, 1.25);
  assert.equal(asc.archive, 19);
  assert.ok(asc.buyUpgrade('offlineBuffer')); // cost 5
  assert.equal(asc.offlineCapSeconds, 24 * 3600, '12h base + 12h per level');
  assert.equal(asc.archive, 14);
  assert.equal(asc._cost('offlineBuffer'), 10, 'buffer cost doubles');

  const b = new AscensionSystem(asc.pp);
  b.deserialize(JSON.parse(JSON.stringify(asc.serialize())));
  assert.equal(b.archive, 14);
  assert.equal(b.ppMultiplier, 1.25);
  assert.equal(b.offlineCapSeconds, 24 * 3600);
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
