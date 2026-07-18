import assert from 'node:assert/strict';
import { test } from 'node:test';
import { StatsSystem } from '../../js/systems/StatsSystem.js';
import { CombatSimSystem } from '../../js/systems/CombatSimSystem.js';

test('combat sim trains strength and defense over time while enabled', () => {
  const stats = new StatsSystem();
  const sim = new CombatSimSystem(stats);
  const strBefore = stats.stats.strength.level;
  const defBefore = stats.stats.defense.level;

  sim.update(1000); // disabled — nothing happens
  assert.equal(stats.stats.strength.level, strBefore);

  sim.toggle();
  sim.update(1000); // plenty of banked XP at COMBAT_SIM_RATE
  assert.ok(stats.stats.strength.level > strBefore, 'strength trained');
  assert.ok(stats.stats.defense.level > defBefore, 'defense trained');
  assert.ok(sim.totalTrained > 0);
});

test('combat sim fires onLevelUp and banks partial progress', () => {
  const stats = new StatsSystem();
  const sim = new CombatSimSystem(stats);
  const levelUps = [];
  sim.onLevelUp = (stat, lvl) => levelUps.push({ stat, lvl });
  sim.toggle();
  sim.update(1); // 0.3 XP each — below any upgrade cost
  assert.equal(levelUps.length, 0);
  assert.ok(sim.xp.strength > 0, 'partial XP banked');
  sim.update(1000);
  assert.ok(levelUps.some(l => l.stat === 'strength'));
  assert.ok(levelUps.some(l => l.stat === 'defense'));
});

test('combat sim serialize/deserialize round-trip', () => {
  const stats = new StatsSystem();
  const sim = new CombatSimSystem(stats);
  sim.toggle();
  sim.update(3);
  const blob = sim.serialize();

  const sim2 = new CombatSimSystem(new StatsSystem());
  sim2.deserialize(blob);
  assert.equal(sim2.enabled, true);
  assert.equal(sim2.xp.strength, sim.xp.strength);
  assert.equal(sim2.totalTrained, sim.totalTrained);
});
