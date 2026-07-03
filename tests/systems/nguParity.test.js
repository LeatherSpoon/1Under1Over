import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PPSystem } from '../../js/systems/PPSystem.js';
import { StatsSystem } from '../../js/systems/StatsSystem.js';
import { InventorySystem } from '../../js/systems/InventorySystem.js';
import { AscensionSystem } from '../../js/systems/AscensionSystem.js';
import { EquipmentSystem } from '../../js/systems/EquipmentSystem.js';
import { AdventureSystem } from '../../js/systems/AdventureSystem.js';
import { BossSystem, KILLS_TO_UNLOCK } from '../../js/systems/BossSystem.js';
import { ChallengeSystem } from '../../js/systems/ChallengeSystem.js';
import { WishSystem } from '../../js/systems/WishSystem.js';
import { TrainingSystem } from '../../js/systems/TrainingSystem.js';
import { SynthesisSystem, SYNTHESIS_MIN_ASCENSIONS } from '../../js/systems/SynthesisSystem.js';
import { StorySystem } from '../../js/systems/StorySystem.js';
import { ARCHETYPES, DROP_TABLES } from '../../js/entities/archetypes.js';
import { CONFIG } from '../../js/config.js';

function makeWorld() {
  const pp = new PPSystem();
  const stats = new StatsSystem();
  const inv = new InventorySystem();
  return { pp, stats, inv };
}

// ── Archetypes ────────────────────────────────────────────────────────────────

test('archetype expansion: 10 archetypes, all with drop tables of valid materials', () => {
  const keys = Object.keys(ARCHETYPES);
  assert.ok(keys.length >= 10, `expected >=10 archetypes, got ${keys.length}`);
  for (const key of keys) {
    const cfg = ARCHETYPES[key];
    assert.ok(cfg.hp > 0 && cfg.damage > 0 && cfg.ppReward > 0, `${key} has combat stats`);
    assert.ok(['melee', 'windup', 'burst'].includes(cfg.attackPattern), `${key} pattern valid`);
    assert.ok(['rusher', 'swinger', 'burst'].includes(cfg.visual), `${key} visual valid`);
    const table = DROP_TABLES[key];
    assert.ok(Array.isArray(table) && table.length > 0, `${key} has drops`);
    for (const drop of table) {
      assert.ok(InventorySystem.MATERIAL_NAMES.includes(drop.mat), `${key} drop ${drop.mat} is a real material`);
    }
  }
});

test('new archetypes use status effects defined in CONFIG', () => {
  for (const [key, cfg] of Object.entries(ARCHETYPES)) {
    if (cfg.statusEffect) {
      assert.ok(CONFIG.STATUS_EFFECTS[cfg.statusEffect], `${key} status ${cfg.statusEffect} exists`);
    }
  }
});

// ── Adventure (idle combat sim) ───────────────────────────────────────────────

test('adventure sim kills enemies over time and pays PP + drops', () => {
  const { pp, stats, inv } = makeWorld();
  const adv = new AdventureSystem(stats, pp, inv);
  assert.equal(adv.setTier(1), true);
  const pp0 = pp.ppTotal;
  // dps ≈ 2.5 at strength 1; T1 rusher hp 30 → ~12s per kill. Run 300 sim-seconds.
  for (let i = 0; i < 3000; i++) adv.update(0.1);
  assert.ok(adv.totalKills > 0, 'at least one sim kill');
  assert.ok(pp.ppTotal > pp0, 'PP earned from sim kills');
  assert.ok((adv.killsByTier[1] || 0) === adv.totalKills, 'kills tallied per tier');
});

test('adventure tiers above maxUnlockedTier are locked', () => {
  const { pp, stats, inv } = makeWorld();
  const adv = new AdventureSystem(stats, pp, inv);
  assert.equal(adv.setTier(2), false, 'tier 2 locked initially');
  adv.maxUnlockedTier = 2;
  assert.equal(adv.setTier(2), true, 'tier 2 unlocks');
});

test('adventure serialize/deserialize round-trip', () => {
  const { pp, stats, inv } = makeWorld();
  const adv = new AdventureSystem(stats, pp, inv);
  adv.maxUnlockedTier = 3;
  adv.setTier(3);
  adv.totalKills = 42;
  adv.killsByTier = { 1: 40, 3: 2 };
  const adv2 = new AdventureSystem(stats, pp, inv);
  adv2.deserialize(adv.serialize());
  assert.equal(adv2.maxUnlockedTier, 3);
  assert.equal(adv2.activeTier, 3);
  assert.equal(adv2.totalKills, 42);
});

// ── Bosses ────────────────────────────────────────────────────────────────────

test('boss challenge gates on sim kills, victory grants PP multiplier', () => {
  const { pp, stats, inv } = makeWorld();
  const adv = new AdventureSystem(stats, pp, inv);
  const bosses = new BossSystem(pp);
  assert.equal(bosses.canChallenge('boss1', adv), false, 'needs kills first');
  adv.killsByTier[1] = KILLS_TO_UNLOCK;
  assert.equal(bosses.canChallenge('boss1', adv), true);

  let fired = null;
  bosses.onFightRequested = (b) => { fired = b; };
  assert.equal(bosses.requestFight('boss1', adv), true);
  assert.equal(fired.id, 'boss1');

  assert.equal(bosses.ppMultiplier, 1);
  bosses.recordVictory('boss1');
  assert.ok(Math.abs(bosses.ppMultiplier - 1.05) < 1e-9, '+5% per boss');
  assert.equal(bosses.recordVictory('boss1'), null, 'no double-count');
});

test('boss enemy object duck-types the combat contract', () => {
  const bosses = new BossSystem(new PPSystem());
  const enemy = bosses.createBossEnemy(bosses.bossById('boss4')); // burst pattern
  assert.equal(enemy.isBoss, true);
  assert.ok(enemy.maxHP > 0 && enemy.ppReward > 0);
  assert.equal(enemy.getAttackSequence().length, 3, 'burst = 3 hits');
  assert.doesNotThrow(() => enemy.die());
});

// ── Challenges ────────────────────────────────────────────────────────────────

test('challenge completes on goal and applies permanent multiplier', () => {
  const pp = new PPSystem();
  const ch = new ChallengeSystem(pp);
  assert.equal(ch.start('pacifist'), true);
  pp.setBaseCap(400);
  ch.update(0.1);
  assert.ok(ch.completed.has('pacifist'));
  assert.ok(Math.abs(ch.ppMultiplier - 1.10) < 1e-9);
  assert.equal(ch.activeId, null);
});

test('challenge fails when restriction is broken', () => {
  const pp = new PPSystem();
  const ch = new ChallengeSystem(pp);
  let failed = null;
  ch.onFail = (c) => { failed = c.id; };
  ch.start('pacifist');
  ch.notify('enemyDefeated');
  assert.equal(failed, 'pacifist');
  assert.equal(ch.activeId, null);
  assert.ok(!ch.completed.has('pacifist'), 'failing grants nothing');
  assert.equal(ch.start('pacifist'), true, 'can retry after failing');
});

test('timed challenge fails when the clock runs out', () => {
  const pp = new PPSystem();
  const ch = new ChallengeSystem(pp);
  ch.start('sprinter');
  ch.update(20 * 60 + 1);
  assert.equal(ch.activeId, null);
  assert.ok(!ch.completed.has('sprinter'));
});

test('offload-count challenge completes via notify events', () => {
  const pp = new PPSystem();
  const ch = new ChallengeSystem(pp);
  ch.start('sprinter');
  ch.notify('offload');
  ch.notify('offload');
  ch.update(0.1);
  assert.ok(ch.completed.has('sprinter'));
});

// ── Wishes ────────────────────────────────────────────────────────────────────

test('focused wish siphons PP into progress and completes', () => {
  const pp = new PPSystem();
  const wi = new WishSystem(pp);
  const wish = wi.wishes[0];
  wi.focus(wish.id);
  let done = null;
  wi.onComplete = (w) => { done = w.id; };
  // Feed PP and tick until complete
  for (let i = 0; i < 200000 && !done; i++) {
    pp.ppTotal = Math.max(pp.ppTotal, 1000);
    wi.update(1);
  }
  assert.equal(done, wish.id);
  assert.ok(Math.abs(wi.ppMultiplier - wish.reward.mult) < 1e-9);
  assert.equal(wi.focusedId, null);
});

test('wish progress persists through serialize round-trip', () => {
  const pp = new PPSystem();
  const wi = new WishSystem(pp);
  wi.focus('wishDamage');
  pp.ppTotal = 500;
  wi.update(1);
  const invested = wi.progressFor(wi.wishes.find(w => w.id === 'wishDamage')).invested;
  assert.ok(invested > 0);
  const wi2 = new WishSystem(pp);
  wi2.deserialize(wi.serialize());
  assert.equal(wi2.progressFor(wi2.wishes.find(w => w.id === 'wishDamage')).invested, invested);
  assert.equal(wi2.focusedId, 'wishDamage');
});

// ── Training ──────────────────────────────────────────────────────────────────

test('idle training siphons PP income and auto-levels the stat', () => {
  const pp = new PPSystem();
  const stats = new StatsSystem();
  const tr = new TrainingSystem(pp, stats);
  assert.equal(tr.toggle('strength'), true);
  assert.equal(tr.toggle('defense'), false, 'only 1 slot by default');

  const lvl0 = stats.stats.strength.level;
  let leveled = false;
  tr.onLevelUp = () => { leveled = true; };
  // upgradeCost(str@1) = 10 PP; drain = 25% of 1 PP/s → ~40s
  for (let i = 0; i < 600; i++) {
    pp.ppTotal = Math.min(pp.ppCap, pp.ppTotal + 1 * 0.1); // simulate income
    tr.update(0.1);
  }
  assert.ok(leveled, 'auto-leveled');
  assert.ok(stats.stats.strength.level > lvl0);
});

test('training slots grow via synthesis perk application', () => {
  const pp = new PPSystem();
  const stats = new StatsSystem();
  const tr = new TrainingSystem(pp, stats);
  const asc = new AscensionSystem(pp);
  const syn = new SynthesisSystem(pp, asc);
  syn.cores = 10;
  assert.equal(syn.buyPerk('trainingMatrix'), true);
  syn.applyPerks({ pp, training: tr });
  assert.equal(tr.slots, 2);
  assert.equal(tr.toggle('strength'), true);
  assert.equal(tr.toggle('defense'), true, 'second slot usable');
});

// ── Synthesis ─────────────────────────────────────────────────────────────────

test('synthesis requires min ascensions, resets ascension layer, grants cores', () => {
  const pp = new PPSystem();
  const asc = new AscensionSystem(pp);
  const syn = new SynthesisSystem(pp, asc);
  assert.equal(syn.canSynthesize(), false);
  assert.equal(syn.synthesize(), null);

  asc.ascensionCount = SYNTHESIS_MIN_ASCENSIONS;
  asc.ascensionPoints = 5;
  asc.ppMultiplier = 2.0;
  pp.ppTotal = 999;
  pp.setBaseCap(5000);

  const r = syn.synthesize();
  assert.ok(r);
  assert.equal(r.coresEarned, SYNTHESIS_MIN_ASCENSIONS + 1, 'ascensions + floor(AP/5)');
  assert.equal(asc.ascensionCount, 0);
  assert.equal(asc.ascensionPoints, 0);
  assert.equal(asc.ppMultiplier, 1.0);
  assert.equal(pp.ppTotal, 0);
  assert.equal(pp.ppCap, CONFIG.INITIAL_PP_CAP);
});

test('overflow buffer perk multiplies PP cap and survives serialize', () => {
  const pp = new PPSystem();
  const asc = new AscensionSystem(pp);
  const syn = new SynthesisSystem(pp, asc);
  syn.cores = 4;
  syn.buyPerk('overflowBuffer');
  syn.buyPerk('overflowBuffer');
  syn.applyPerks({ pp });
  assert.ok(Math.abs(pp.ppCap - CONFIG.INITIAL_PP_CAP * 2.25) < 1e-6, '1.5^2 cap multiplier');

  const syn2 = new SynthesisSystem(pp, asc);
  syn2.deserialize(syn.serialize());
  assert.equal(syn2.perkLevel('overflowBuffer'), 2);
  assert.equal(syn2.cores, 0);
});

test('resonance perk raises the synthesis PP multiplier', () => {
  const syn = new SynthesisSystem(new PPSystem(), new AscensionSystem(new PPSystem()));
  syn.cores = 2;
  syn.buyPerk('resonance');
  syn.buyPerk('resonance');
  assert.ok(Math.abs(syn.ppMultiplier - 1.15 * 1.15) < 1e-9);
});

// ── Story ─────────────────────────────────────────────────────────────────────

test('story triggers unlock matching entries exactly once, in order', () => {
  const story = new StorySystem();
  const seen = [];
  story.onUnlock = (e) => seen.push(e.id);
  story.trigger('boot');
  story.trigger('boot');
  story.trigger('zone:mine');
  assert.deepEqual(seen, ['log_boot', 'log_mine']);
  assert.equal(story.unreadCount, 2);
  story.markRead('log_boot');
  assert.equal(story.unreadCount, 1);
});

test('every story entry has a reachable trigger form and non-empty text', () => {
  const story = new StorySystem();
  for (const e of story.entries) {
    assert.ok(e.id && e.act && e.title && e.trigger, `${e.id} well-formed`);
    assert.ok(e.text.length > 50, `${e.id} has substantial text`);
  }
});

test('story serialize round-trip preserves unlock order and read state', () => {
  const story = new StorySystem();
  story.trigger('boot');
  story.trigger('breach');
  story.markRead('log_boot');
  const story2 = new StorySystem();
  story2.deserialize(story.serialize());
  assert.deepEqual(story2.unlocked, ['log_boot', 'log_breach']);
  assert.equal(story2.unreadCount, 1);
});

// ── Equipment merge + set bonuses ─────────────────────────────────────────────

function makeSword(tier = 'Basic') {
  return { label: 'Test Sword', slot: 'weapon', tier, statBonuses: { strength: 10 } };
}

test('merging a bag duplicate boosts equipped item bonuses by 15% per level', () => {
  const stats = new StatsSystem();
  const eq = new EquipmentSystem(stats);
  const inv = new InventorySystem();

  eq.equip(makeSword());
  assert.equal(stats.stats.strength.level, 11, 'base +10');

  inv.equipmentBag.push(makeSword());
  assert.equal(eq.mergeFromBag(inv, 'weapon'), true);
  assert.equal(inv.equipmentBag.length, 0, 'duplicate consumed');
  assert.equal(eq.slots.weapon.mergeLevel, 1);
  assert.equal(stats.stats.strength.level, 12, '+10 × 1.15 = 11 (floored)');

  assert.equal(eq.mergeFromBag(inv, 'weapon'), false, 'no duplicate left');
});

test('bag-to-bag merge consumes the duplicate and raises mergeLevel', () => {
  const eq = new EquipmentSystem(new StatsSystem());
  const inv = new InventorySystem();
  inv.equipmentBag.push(makeSword(), makeSword());
  assert.equal(eq.mergeBagItems(inv, 0), true);
  assert.equal(inv.equipmentBag.length, 1);
  assert.equal(inv.equipmentBag[0].mergeLevel, 1);
});

test('different tier items are not merge-compatible', () => {
  const eq = new EquipmentSystem(new StatsSystem());
  const inv = new InventorySystem();
  eq.equip(makeSword('Basic'));
  inv.equipmentBag.push(makeSword('Rare'));
  assert.equal(eq.mergeFromBag(inv, 'weapon'), false);
});

test('equipping 3 same-tier items activates the tier set bonus', () => {
  const stats = new StatsSystem();
  const eq = new EquipmentSystem(stats);
  const hp0 = stats.maxHP;
  eq.equip({ label: 'A', slot: 'weapon', tier: 'Basic', statBonuses: {} });
  eq.equip({ label: 'B', slot: 'head',   tier: 'Basic', statBonuses: {} });
  assert.deepEqual(eq.getActiveSets(), [], '2 pieces not enough');
  eq.equip({ label: 'C', slot: 'legs',   tier: 'Basic', statBonuses: {} });
  assert.deepEqual(eq.getActiveSets(), ['Basic']);
  assert.equal(stats.maxHP, hp0 + EquipmentSystem.SET_BONUSES.Basic.hp);
  eq.unequip('legs');
  assert.equal(stats.maxHP, hp0, 'set bonus removed when set breaks');
});
