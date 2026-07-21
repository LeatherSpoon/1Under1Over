// Phase E — Compute allocation pool, stocked-offline gating, Al modules.
import test from 'node:test';
import assert from 'node:assert/strict';

import { ComputeSystem, COMPUTE_DESTINATIONS, AL_MODULES } from '../../js/systems/ComputeSystem.js';
import { OfflineSystem } from '../../js/systems/OfflineSystem.js';
import { ExtractorSystem } from '../../js/systems/ExtractorSystem.js';
import { AscensionSystem } from '../../js/systems/AscensionSystem.js';
import { InventorySystem } from '../../js/systems/InventorySystem.js';
import { PPSystem } from '../../js/systems/PPSystem.js';
import { ExpeditionSystem } from '../../js/systems/ExpeditionSystem.js';
import { CONFIG } from '../../js/config.js';

function makeCompute({ level = 3, power = 0, amp = 0 } = {}) {
  const pp = { spend: (n) => { pp.spent = (pp.spent || 0) + n; return true; } };
  const c = new ComputeSystem(pp);
  c.getChapterLevel = () => level;
  c.getPowerBonus = () => power;
  c.getAmpLevel = () => amp;
  return c;
}

// ── Pool math ────────────────────────────────────────────────────────────────

test('pool starts at 4 units; cap upgrades add 2 at 500×2.5^n PP', () => {
  const c = makeCompute();
  assert.equal(c.totalUnits(), 4);
  assert.equal(c.capUpgradeCost(), 500);
  assert.ok(c.buyCapUpgrade());
  assert.equal(c.totalUnits(), 6);
  assert.equal(c.capUpgradeCost(), 1250);
  assert.ok(c.buyCapUpgrade());
  assert.equal(c.capUpgradeCost(), 3125);
});

test('assignment clamps to the pool; withdrawal is lossless', () => {
  const c = makeCompute();
  assert.equal(c.setUnits('ladder', 3), 3);
  assert.equal(c.freeUnits(), 1);
  assert.equal(c.setUnits('drones', 5), 1);   // only 1 free
  assert.equal(c.freeUnits(), 0);
  c.setUnits('ladder', 0);                     // instant, lossless withdrawal
  assert.equal(c.freeUnits(), 3);
  assert.equal(c.assignMax('holodeck'), 3);
  assert.equal(c.freeUnits(), 0);
});

test('adjust() and NaN inputs are safe', () => {
  const c = makeCompute();
  c.adjust('ladder', +2);
  assert.equal(c.unitsOn('ladder'), 2);
  c.adjust('ladder', -5);
  assert.equal(c.unitsOn('ladder'), 0);
  assert.equal(c.setUnits('ladder', 'garbage'), 0);
});

// ── Output / gate formula ────────────────────────────────────────────────────

test('outputMult: 1 unit = ×1; extras add 25% each, leveraged by power leg', () => {
  const c = makeCompute({ power: 0 });
  c.setUnits('ladder', 1);
  assert.equal(c.outputMult('ladder'), 1);
  c.setUnits('ladder', 3);
  assert.equal(c.outputMult('ladder'), 1 + 0.25 * 2); // ×1.5
  // Power leg leverage: powerBonus 0.4 → each extra worth 0.25 × 1.2
  const cp = makeCompute({ power: 0.4 });
  cp.setUnits('ladder', 3);
  assert.ok(Math.abs(cp.outputMult('ladder') - (1 + 0.25 * 2 * 1.2)) < 1e-9);
});

test('Compute Amplifier multiplies unit output ×(1+0.10/lvl)', () => {
  const c = makeCompute({ amp: 2 });
  c.setUnits('drones', 1);
  assert.ok(Math.abs(c.outputMult('drones') - 1.2) < 1e-9);
});

test('gateMult: locked board = 1 everywhere; unlocked = 0 without units', () => {
  const locked = makeCompute({ level: 2 });
  assert.equal(locked.unlocked, false);
  assert.equal(locked.gateMult('ladder'), 1);
  const open = makeCompute({ level: 3 });
  assert.equal(open.unlocked, true);
  assert.equal(open.gateMult('ladder'), 0);
  open.setUnits('ladder', 1);
  assert.equal(open.gateMult('ladder'), 1);
});

// ── Auto-seed (migration + fresh S2 crossing share this path) ────────────────

test('maybeSeed assigns 1 unit to each active system once, priority order', () => {
  const c = makeCompute({ level: 3 });
  c.probe = { ladder: () => true, drones: () => true, extractors: () => false, holodeck: () => true };
  c.maybeSeed();
  assert.equal(c.unitsOn('ladder'), 1);
  assert.equal(c.unitsOn('drones'), 1);
  assert.equal(c.unitsOn('extractors'), 0);
  assert.equal(c.unitsOn('holodeck'), 1);
  assert.equal(c.freeUnits(), 1);
  // Never re-seeds
  c.setUnits('ladder', 0);
  c.maybeSeed();
  assert.equal(c.unitsOn('ladder'), 0);
});

test('maybeSeed does nothing while the board is locked', () => {
  const c = makeCompute({ level: 1 });
  c.probe = { ladder: () => true, drones: () => true, extractors: () => true, holodeck: () => true };
  c.maybeSeed();
  assert.equal(c.seeded, false);
  assert.equal(c.assignedTotal(), 0);
});

// ── Serialize round-trip + v13 migration ─────────────────────────────────────

test('serialize/deserialize round-trips; v13 (null) leaves pool unseeded', () => {
  const a = makeCompute();
  a.buyCapUpgrade();
  a.setUnits('ladder', 2);
  a.setUnits('processing', 1);
  a.seeded = true;
  const b = makeCompute();
  b.deserialize(a.serialize());
  assert.equal(b.capLevel, 1);
  assert.equal(b.unitsOn('ladder'), 2);
  assert.equal(b.unitsOn('processing'), 1);
  assert.equal(b.seeded, true);

  const fresh = makeCompute();
  fresh.deserialize(null); // pre-v14 save blob
  assert.equal(fresh.seeded, false);
  assert.equal(fresh.assignedTotal(), 0);
});

test('deserialize clamps assignments that exceed the (smaller) pool', () => {
  const b = makeCompute();
  b.deserialize({ capLevel: 0, assigned: { ladder: 3, drones: 3 }, seeded: true });
  assert.equal(b.assignedTotal() <= b.totalUnits(), true);
  assert.equal(b.unitsOn('ladder'), 3); // first restore fits
  assert.equal(b.unitsOn('drones'), 1); // clamped to remaining free
});

test('destination registry covers every gate key main.js wires', () => {
  const keys = COMPUTE_DESTINATIONS.map(d => d.key);
  for (const k of ['ladder', 'drones', 'extractors', 'holodeck', 'processing',
    'factory:smelter', 'factory:assembler', 'factory:fabricator']) {
    assert.ok(keys.includes(k), `missing destination ${k}`);
  }
});

// ── Stocked offline (OfflineSystem + compute gate) ───────────────────────────

function makeOfflineRig({ awaySeconds = 3600, level = 3 } = {}) {
  // Minimal localStorage shim (Node test env)
  const store = {};
  globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
  };
  const pp = { ppRate: 2, ppTotal: 0, ppCap: 1e9 };
  const inventory = {
    materials: { copper: 0, iron: 0, stone: 0, alloy: 0 },
    addMaterial(mat, qty) { this.materials[mat] = (this.materials[mat] || 0) + qty; },
  };
  const drones = { drones: [{ id: 1, assignedMaterial: 'copper', efficiency: 1 }] };
  const offline = new OfflineSystem(pp, drones, inventory);
  const compute = makeCompute({ level });
  const extractors = new ExtractorSystem(inventory);
  const ascension = new AscensionSystem(pp);
  store['pp_last_active'] = String(Date.now() - awaySeconds * 1000);
  return { offline, compute, extractors, ascension, pp, inventory, drones, store };
}

test('offline PP pays full rate (50% haircut is gone) and buffer caps at 12h base', () => {
  const rig = makeOfflineRig({ awaySeconds: 20 * 3600 }); // away 20h > 12h buffer
  rig.offline.setReturnContext({ ascension: rig.ascension, compute: rig.compute });
  const result = rig.offline.calculate();
  assert.equal(result.seconds, 12 * 3600);                    // 24h flat cap replaced by 12h base buffer
  assert.equal(result.ppGained, Math.floor(2 * 12 * 3600));   // full rate
});

test('offline buffer grows +12h per Archive Offline Buffer level', () => {
  const rig = makeOfflineRig({ awaySeconds: 30 * 3600 });
  rig.ascension.archive = 100;
  assert.ok(rig.ascension.buyUpgrade('offlineBuffer'));       // 12 + 12 = 24h
  rig.offline.setReturnContext({ ascension: rig.ascension, compute: rig.compute });
  const result = rig.offline.calculate();
  assert.equal(result.seconds, 24 * 3600);
});

test('stocked drones run offline; unstocked report DORMANT with zero haul', () => {
  const stocked = makeOfflineRig();
  stocked.compute.setUnits('drones', 1);
  stocked.offline.setReturnContext({ compute: stocked.compute });
  const s = stocked.offline.applyAndSummarize();
  const sRow = s.rows.find(r => r.label === 'DRONE ROUTES');
  assert.equal(sRow.ran, true);
  assert.equal(stocked.inventory.materials.copper, 120);      // 3600s / 30s cycles

  const dormant = makeOfflineRig();
  dormant.offline.setReturnContext({ compute: dormant.compute }); // 0 units
  const d = dormant.offline.applyAndSummarize();
  const dRow = d.rows.find(r => r.label === 'DRONE ROUTES');
  assert.equal(dRow.ran, false);
  assert.match(dRow.detail, /no compute/i);
  assert.equal(dormant.inventory.materials.copper, 0);
});

test('pre-board saves (level < 3) keep ungated offline behavior', () => {
  const rig = makeOfflineRig({ level: 1 });
  rig.offline.setReturnContext({ compute: rig.compute });
  const s = rig.offline.applyAndSummarize();
  const row = s.rows.find(r => r.label === 'DRONE ROUTES');
  assert.equal(row.ran, true);
  assert.equal(rig.inventory.materials.copper, 120);
});

test('stocked extractor bank runs offline through applyOfflineTime', () => {
  const rig = makeOfflineRig();
  rig.inventory.materials.extractor_unit = 1;
  rig.extractors.install('basic');
  rig.compute.setUnits('extractors', 1);
  rig.compute.setUnits('drones', 1);
  rig.offline.setReturnContext({ compute: rig.compute, extractors: rig.extractors });
  const s = rig.offline.applyAndSummarize();
  const row = s.rows.find(r => r.label === 'EXTRACTOR BANK');
  assert.equal(row.ran, true);
  // basic extractor: copper 0.03/s × 3600s = 108, clamped to 99 stack space
  assert.equal(rig.inventory.materials.stone, Math.min(99, Math.floor(0.020 * 3600)));

  const dormant = makeOfflineRig();
  dormant.inventory.materials.extractor_unit = 1;
  dormant.extractors.install('basic');
  dormant.offline.setReturnContext({ compute: dormant.compute, extractors: dormant.extractors });
  const d = dormant.offline.applyAndSummarize();
  assert.equal(d.rows.find(r => r.label === 'EXTRACTOR BANK').ran, false);
});

test('extractor applyOfflineTime returns gains and respects the 99 stack cap', () => {
  const inventory = {
    materials: { copper: 90, iron: 0, stone: 0 },
    addMaterial(mat, qty) { this.materials[mat] += qty; },
  };
  const ex = new ExtractorSystem(inventory);
  inventory.materials.extractor_unit = 1;
  ex.install('basic');
  const gains = ex.applyOfflineTime(3600);
  assert.equal(gains.copper, 9);              // 108 produced, 9 fit
  assert.equal(inventory.materials.copper, 99);
  assert.equal(gains.iron, 72);               // 0.02 × 3600
});

// ── Archive shop: Compute Amplifier entry ────────────────────────────────────

test('Compute Amplifier is buyable and reports its level', () => {
  const pp = {};
  const asc = new AscensionSystem(pp);
  asc.archive = 10;
  assert.equal(asc.computeAmpLevel, 0);
  assert.ok(asc.getUpgrades().some(u => u.id === 'computeAmp'));
  assert.ok(asc.buyUpgrade('computeAmp'));    // cost 1 (triangular curve)
  assert.equal(asc.computeAmpLevel, 1);
  assert.equal(asc.archive, 9);
});

// ── Al modules (slice 2) ─────────────────────────────────────────────────────

function makeModuleWorld({ level = 7 } = {}) {
  const pp = new PPSystem();
  const inventory = new InventorySystem();
  const c = new ComputeSystem(pp, inventory);
  c.getChapterLevel = () => level;
  return { pp, inventory, c };
}

test('every module price uses real inventory material keys', () => {
  for (const def of AL_MODULES) {
    for (const mat of Object.keys(def.mats || {})) {
      assert.ok(InventorySystem.MATERIAL_NAMES.includes(mat),
        `${def.id} prices unknown material "${mat}"`);
    }
  }
});

test('module right-to-buy is chapter-gated (S1/S2/S3/S4)', () => {
  const { c } = makeModuleWorld({ level: 0 });
  for (const def of AL_MODULES) assert.equal(c.moduleAvailable(def.id), false);
  const gates = { keyTracker: 1, overflowRouting: 3, farmDirector: 5, foreman: 7 };
  for (const [id, lvl] of Object.entries(gates)) {
    const w = makeModuleWorld({ level: lvl });
    assert.equal(w.c.moduleAvailable(id), true, `${id} should open at level ${lvl}`);
    const below = makeModuleWorld({ level: lvl - 1 });
    assert.equal(below.c.moduleAvailable(id), false, `${id} must stay locked below ${lvl}`);
  }
});

test('buyModule spends PP + materials and is idempotent', () => {
  const { pp, inventory, c } = makeModuleWorld();
  const def = c.moduleDef('keyTracker');
  pp.setBaseCap(1e9); pp.ppTotal = 1000;
  assert.equal(c.canBuyModule('keyTracker'), false, 'missing materials');
  for (const [mat, qty] of Object.entries(def.mats)) inventory.materials[mat] = qty;
  assert.ok(c.canBuyModule('keyTracker'));
  assert.ok(c.buyModule('keyTracker'));
  assert.equal(pp.ppTotal, 1000 - def.pp);
  for (const mat of Object.keys(def.mats)) assert.equal(inventory.materials[mat], 0);
  assert.equal(c.hasModule('keyTracker'), true);
  assert.equal(c.buyModule('keyTracker'), false, 'already owned');
});

test('modules serialize round-trip', () => {
  const { c } = makeModuleWorld();
  c.modules.keyTracker = true;
  const b = new ComputeSystem(c.pp, c.inventory);
  b.deserialize(c.serialize());
  assert.equal(b.hasModule('keyTracker'), true);
  assert.equal(b.hasModule('foreman'), false);
});

// ── Overflow Routing ─────────────────────────────────────────────────────────

test('PPSystem.deposit clamps at cap and reports the spill', () => {
  const pp = new PPSystem();
  pp.setBaseCap(100);
  let routed = 0;
  pp.onOverflow = (n) => { routed += n; };
  pp.ppTotal = 90;
  assert.equal(pp.deposit(30), 10, 'only 10 fits');
  assert.equal(pp.ppTotal, 100);
  assert.equal(routed, 20);
  routed = 0;
  pp.ppTotal = 150; // pre-existing over-cap (combat leak) decays through deposit
  pp.deposit(5);
  assert.equal(pp.ppTotal, 100);
  assert.equal(routed, 55);
});

test('routeOverflow converts at 25% × (1+power) × outputMult into implant XP', () => {
  const { c } = makeModuleWorld({ level: 3 });
  c.getPowerBonus = () => 0.4;
  c.modules.overflowRouting = true;
  const implant = { target: 'strength', banked: 0, bankXP(n) { this.banked += n; } };
  assert.equal(c.routeOverflow(100, implant), 0, 'no units on the overflow row');
  c.setUnits('overflow', 2); // extras: 1 + 0.25×1×1.2 = 1.3
  const xp = c.routeOverflow(100, implant);
  assert.ok(Math.abs(xp - 100 * 0.25 * 1.4 * 1.3) < 1e-9);
  assert.ok(Math.abs(implant.banked - xp) < 1e-9);
});

test('routeOverflow requires module, unlock, and an implant target', () => {
  const { c } = makeModuleWorld({ level: 3 });
  c.setUnits('overflow', 1);
  const implant = { target: 'strength', banked: 0, bankXP(n) { this.banked += n; } };
  assert.equal(c.routeOverflow(100, implant), 0, 'module not owned');
  c.modules.overflowRouting = true;
  assert.equal(c.routeOverflow(100, { target: null, bankXP() {} }), 0, 'no target');
  const locked = makeModuleWorld({ level: 2 });
  locked.c.modules.overflowRouting = true;
  locked.c.setUnits('overflow', 1);
  assert.equal(locked.c.routeOverflow(100, implant), 0, 'board locked');
});

// ── Farm Director ────────────────────────────────────────────────────────────

test('autoAdvanceFarm walks the active ladder to the highest safe tier', () => {
  const pp = new PPSystem();
  pp.setBaseCap(1e9);
  const stats = { damage: 50, maxHP: 500, defense: 0 };
  const inventory = new InventorySystem();
  const exp = new ExpeditionSystem(pp, stats, inventory);
  exp.wardensCleared = 1; // tiers 0..19 open
  exp.tier = 2;
  assert.equal(exp.autoAdvanceFarm(), false, 'inactive frame never moves');
  exp.active = true;
  const target = exp.maxSafeTier();
  assert.ok(target > 2, 'test setup: stats must clear tier 2 comfortably');
  assert.equal(exp.autoAdvanceFarm(), true);
  assert.equal(exp.tier, target);
  assert.equal(exp.autoAdvanceFarm(), false, 'already at the safe frontier');
});

// ── Drone mission queue (slice 4) ────────────────────────────────────────────

test('mission queue: depth 3 base, +1 per efficiency tier past 3; chains on completion', async () => {
  const { DroneSystem } = await import('../../js/systems/DroneSystem.js');
  const inventory = new InventorySystem();
  const pp = new PPSystem();
  const d = new DroneSystem(inventory, pp, {});
  assert.equal(d.missionQueueDepth(1), 3);
  d.drones[0].efficiency = 5;
  assert.equal(d.missionQueueDepth(1), 5);

  assert.ok(d.queueMission(1, 'landingSite'), 'idle drone dispatches immediately');
  assert.equal(d.isDroneOnMission(1), true);
  assert.ok(d.queueMission(1, 'mine'));
  assert.ok(d.queueMission(1, 'mine'));
  assert.equal(d.queuedMissions(1).length, 2);

  d.update(120); // finish leg 1 → leg 2 (mine) auto-dispatches
  assert.equal(d.queuedMissions(1).length, 1);
  const active = d.getMissions().find(m => !m.done);
  assert.equal(active.zoneName, 'mine');

  d.recallDrone(1);
  assert.equal(d.isDroneOnMission(1), false);
  assert.equal(d.queuedMissions(1).length, 0, 'recall clears the queue');
});

test('queued missions resolve offline in closed form, loot banked once', async () => {
  const { DroneSystem } = await import('../../js/systems/DroneSystem.js');
  const inventory = new InventorySystem();
  const pp = new PPSystem();
  const d = new DroneSystem(inventory, pp, {});
  d.queueMission(1, 'landingSite'); // 120s
  d.queueMission(1, 'landingSite'); // 120s queued
  d.queueMission(1, 'landingSite'); // 120s queued
  const ms = d.simulateOfflineMissions(300, 1); // finishes 2, leaves #3 at 60/120
  assert.equal(ms.completed, 2);
  const lootTotal = Object.values(ms.loot).reduce((a, b) => a + b, 0);
  const bagTotal = inventory.materials.copper + inventory.materials.timber + inventory.materials.stone;
  assert.equal(bagTotal, lootTotal, 'summary matches what actually landed in the bag');
  const active = d.getMissions().find(m => !m.done);
  assert.ok(Math.abs(active.elapsed - 60) < 1e-9);
  assert.equal(d.simulateOfflineMissions(100, 0), null, 'gate 0 = dormant');
});
