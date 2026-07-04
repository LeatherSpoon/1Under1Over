import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CombatSystem } from '../../js/systems/CombatSystem.js';
import { PPSystem } from '../../js/systems/PPSystem.js';
import { StatsSystem } from '../../js/systems/StatsSystem.js';
import { InventorySystem } from '../../js/systems/InventorySystem.js';

function makeEnemy(overrides = {}) {
  return {
    name: 'TEST DUMMY',
    archetype: 'rusher',
    maxHP: 100,
    damage: 5,
    attackInterval: 60000, // effectively never attacks during a test
    ppReward: 10,
    attackPattern: 'melee',
    statusEffect: null,
    armor: 0,
    dodgeChance: 0,
    fpDrainOnHit: 0,
    regenOnAttack: 0,
    rageRamp: 0,
    burstCount: 3,
    boss: false,
    phase2: null,
    _enraged: false,
    die() { this.dead = true; },
    setCharging() {},
    ...overrides,
  };
}

function makeCombat() {
  const stats = new StatsSystem();
  const pp = new PPSystem();
  const inventory = new InventorySystem();
  const combat = new CombatSystem(stats, pp, inventory);
  return { combat, stats, pp, inventory };
}

test('enemy armor reduces player attack damage (min 1)', () => {
  const { combat, stats } = makeCombat();
  const enemy = makeEnemy({ armor: 1 });
  combat.startCombat(enemy);
  const hpBefore = combat.enemyCurrentHP;
  combat.fight(); // strength 1 → 2 dmg, armor 1 → 1 dealt
  assert.equal(hpBefore - combat.enemyCurrentHP, stats.damage - 1);
  combat._endCombat(false, true); // clean up timers
});

test('dodge chance 1.0 makes player attacks always miss', () => {
  const { combat } = makeCombat();
  const enemy = makeEnemy({ dodgeChance: 1 });
  combat.startCombat(enemy);
  const hpBefore = combat.enemyCurrentHP;
  combat.fight();
  assert.equal(combat.enemyCurrentHP, hpBefore, 'no damage on dodge');
  combat._endCombat(false, true);
});

test('permDamageMult scales player damage', () => {
  const { combat, stats } = makeCombat();
  const enemy = makeEnemy();
  combat.permDamageMult = 2;
  combat.startCombat(enemy);
  const hpBefore = combat.enemyCurrentHP;
  combat.fight();
  assert.equal(hpBefore - combat.enemyCurrentHP, stats.damage * 2);
  combat._endCombat(false, true);
});

test('enemy strike applies rage ramp and FP drain', () => {
  const { combat, stats } = makeCombat();
  const enemy = makeEnemy({ rageRamp: 2, fpDrainOnHit: 30 });
  stats.currentFP = 50;
  combat.startCombat(enemy);

  const hp1 = stats.currentHP;
  combat._enemyStrike(enemy.damage);
  combat._afterEnemyAttack(); // rage compounds ×2
  const firstHit = hp1 - stats.currentHP;
  assert.equal(stats.currentFP, 20, 'FP drained on hit');

  const hp2 = stats.currentHP;
  combat._enemyStrike(enemy.damage);
  const secondHit = hp2 - stats.currentHP;
  assert.ok(secondHit > firstHit, `rage ramp increases damage (${firstHit} → ${secondHit})`);
  combat._endCombat(false, true);
});

test('regenOnAttack heals the enemy between attacks', () => {
  const { combat } = makeCombat();
  const enemy = makeEnemy({ regenOnAttack: 7 });
  combat.startCombat(enemy);
  combat.enemyCurrentHP = 50;
  combat._afterEnemyAttack();
  assert.equal(combat.enemyCurrentHP, 57);
  combat._endCombat(false, true);
});

test('boss phase 2 triggers once when HP crosses the threshold', () => {
  const { combat } = makeCombat();
  const enemy = makeEnemy({
    boss: true, maxHP: 100, damage: 10, attackInterval: 60000,
    phase2: { at: 0.5, damageMult: 2, intervalMult: 0.5 },
  });
  combat.startCombat(enemy);

  combat._dealDamageToEnemy(40); // 60 left — above 50%
  assert.equal(enemy._enraged, false);

  combat._dealDamageToEnemy(20); // 40 left — below 50%
  assert.equal(enemy._enraged, true);
  assert.equal(enemy.damage, 20, 'phase-2 damage multiplier applied');
  assert.equal(enemy.attackInterval, 30000, 'phase-2 interval multiplier applied');

  const dmgAfter = enemy.damage;
  combat._dealDamageToEnemy(10); // still enraged — no double trigger
  assert.equal(enemy.damage, dmgAfter);
  combat._endCombat(false, true);
});

test('boss victory pays PP, fires onBossDefeated, and rolls guaranteed drops', () => {
  const { combat, pp, inventory } = makeCombat();
  const enemy = makeEnemy({ boss: true, archetype: 'boss_landing', maxHP: 10, ppReward: 150 });
  let defeatedArchetype = null;
  combat.onBossDefeated = (a) => { defeatedArchetype = a; };

  combat.startCombat(enemy);
  const ppBefore = pp.ppTotal;
  combat._dealDamageToEnemy(10); // lethal — ends combat as a win

  assert.equal(combat.active, false);
  assert.equal(defeatedArchetype, 'boss_landing');
  assert.equal(pp.ppTotal, ppBefore + 150);
  assert.equal(inventory.materials.powerCore, 3, 'boss drop table is guaranteed');
  assert.equal(inventory.materials.circuitWire, 5);
  assert.ok(enemy.dead);
});

test('every archetype with a drop table only drops known materials', () => {
  const inv = new InventorySystem();
  for (const [archetype, table] of Object.entries(CombatSystem.DROP_TABLES)) {
    for (const { mat } of table) {
      assert.ok(mat in inv.materials, `${archetype} drops unknown material "${mat}"`);
    }
  }
});
