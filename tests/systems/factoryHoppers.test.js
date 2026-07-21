// Phase E slice 3 — input hoppers: stocked machines run online AND offline
// while fed (TPT2 model); processing queue survives reload (§12 chore-fix).
import test from 'node:test';
import assert from 'node:assert/strict';

import { FactorySystem } from '../../js/systems/FactorySystem.js';
import { ProcessingNodeSystem } from '../../js/systems/ProcessingNodeSystem.js';
import { InventorySystem } from '../../js/systems/InventorySystem.js';
import { PPSystem } from '../../js/systems/PPSystem.js';

function makeFactory() {
  const inventory = new InventorySystem();
  const pp = new PPSystem();
  pp.setBaseCap(1e9);
  const stats = { stats: { speed: { level: 1 }, health: { level: 1 }, energyCap: { level: 1 } } };
  const factory = new FactorySystem(inventory, pp, stats, null);
  return { inventory, pp, stats, factory };
}

// ── Stock / unstock ──────────────────────────────────────────────────────────

test('stock moves bag → hopper clamped by bag count and hopper size', () => {
  const { inventory, factory } = makeFactory();
  inventory.materials.ferrous_ore = 30;
  assert.equal(factory.stock('smelter', 'ferrous_ore'), 20, 'base hopper size is 20');
  assert.equal(inventory.materials.ferrous_ore, 10);
  assert.equal(factory.machines.smelter.hopper.ferrous_ore, 20);
  assert.equal(factory.stock('smelter', 'ferrous_ore'), 0, 'hopper full');
});

test('unstock returns hopper → bag without ever voiding', () => {
  const { inventory, factory } = makeFactory();
  inventory.materials.ferrous_ore = 20;
  factory.stock('smelter', 'ferrous_ore');
  inventory.materials.ferrous_ore = 95; // little bag space left
  assert.equal(factory.unstock('smelter', 'ferrous_ore'), 4, 'stops at the 99 stack cap');
  assert.equal(inventory.materials.ferrous_ore, 99);
  assert.equal(factory.machines.smelter.hopper.ferrous_ore, 16, 'rest stays in the hopper');
});

test('hopper size and upgrade cost follow 20×2^n and 250×3^n', () => {
  const { pp, factory } = makeFactory();
  assert.equal(factory.hopperSize('smelter'), 20);
  assert.equal(factory.hopperUpgradeCost('smelter'), 250);
  pp.ppTotal = 10000;
  assert.ok(factory.upgradeHopper('smelter'));
  assert.equal(factory.hopperSize('smelter'), 40);
  assert.equal(factory.hopperUpgradeCost('smelter'), 750);
  assert.equal(pp.ppTotal, 9750);
});

// ── Consumption paths ────────────────────────────────────────────────────────

test('automated machines consume from the hopper, not the shared bag', () => {
  const { inventory, factory } = makeFactory();
  const m = factory.machines.smelter;
  m.isAutomated = true;
  inventory.materials.ferrous_ore = 50;
  factory.stock('smelter', 'ferrous_ore'); // 20 in hopper, 30 in bag
  factory.update(4); // 4s × (1/2.0) = 2 cycles
  assert.equal(inventory.materials.steel_ingot, 2);
  assert.equal(m.hopper.ferrous_ore, 16, '2 cycles × 2 ore from the hopper');
  assert.equal(inventory.materials.ferrous_ore, 30, 'bag untouched');
});

test('an unfed machine halts at 100% even with materials in the bag', () => {
  const { inventory, factory } = makeFactory();
  const m = factory.machines.smelter;
  m.isAutomated = true;
  inventory.materials.ferrous_ore = 50; // bag full, hopper empty
  factory.update(10);
  assert.equal(m.progress, 1.0);
  assert.equal(inventory.materials.steel_ingot, 0);
});

test('manualProcess gates on the hopper too', () => {
  const { inventory, factory } = makeFactory();
  inventory.materials.ferrous_ore = 10;
  assert.equal(factory.manualProcess('smelter'), false, 'hopper empty');
  factory.stock('smelter', 'ferrous_ore');
  assert.ok(factory.manualProcess('smelter'));
});

test('Foreman auto-restocks automated hoppers from the bag', () => {
  const { inventory, factory } = makeFactory();
  const m = factory.machines.smelter;
  m.isAutomated = true;
  factory.foremanActive = () => true;
  inventory.materials.ferrous_ore = 30;
  factory.update(4); // restock happens at tick start, then 2 cycles run
  assert.equal(inventory.materials.steel_ingot, 2);
  assert.equal(inventory.materials.ferrous_ore, 10, 'foreman pulled 20 into the hopper');
});

// ── Stocked offline ──────────────────────────────────────────────────────────

test('simulateOffline runs cycles bounded by time and hopper, at gate speed', () => {
  const { inventory, factory } = makeFactory();
  const m = factory.machines.smelter;
  m.isAutomated = true;
  inventory.materials.ferrous_ore = 20;
  factory.stock('smelter', 'ferrous_ore'); // fuel for 10 cycles
  // 8s at ×1: 8 × (1/2.0) = 4 cycles (time-bound)
  let report = factory.simulateOffline(8, () => 1);
  const smelterLine = report.find(r => r.id === 'smelter');
  assert.equal(smelterLine.cycles, 4);
  assert.equal(inventory.materials.steel_ingot, 4);
  // Long stretch: hopper-bound at the remaining 6 cycles, halts fed-edge
  report = factory.simulateOffline(3600, () => 1);
  assert.equal(report.find(r => r.id === 'smelter').cycles, 6);
  assert.equal(factory.machines.smelter.progress, 1.0, 'halted awaiting restock');
  assert.equal(inventory.materials.steel_ingot, 10);
});

test('simulateOffline reports dormant lines at gate 0 and skips manual machines', () => {
  const { inventory, factory } = makeFactory();
  factory.machines.smelter.isAutomated = true;
  inventory.materials.ferrous_ore = 20;
  factory.stock('smelter', 'ferrous_ore');
  const report = factory.simulateOffline(100, () => 0);
  assert.equal(report.length, 1, 'only the automated line reports');
  assert.equal(report[0].dormant, true);
  assert.equal(inventory.materials.steel_ingot, 0);
});

// ── Serialization & migration ────────────────────────────────────────────────

test('hoppers serialize round-trip', () => {
  const { inventory, factory } = makeFactory();
  inventory.materials.ferrous_ore = 20;
  factory.stock('smelter', 'ferrous_ore');
  factory.machines.smelter.hopperLevel = 2;
  const b = makeFactory().factory;
  b.deserialize(JSON.parse(JSON.stringify(factory.serialize())));
  assert.equal(b.machines.smelter.hopper.ferrous_ore, 20);
  assert.equal(b.machines.smelter.hopperLevel, 2);
});

test('v13 saves auto-stock a running automated line so it never silently halts', () => {
  const { inventory, factory } = makeFactory();
  inventory.materials.ferrous_ore = 50;
  // v13-shaped blob: no hopper fields at all
  factory.deserialize({
    buffs: {},
    machines: { smelter: { unlocked: true, count: 1, isAutomated: true, currentRecipe: 'steel_ingot', progress: 0.4 } },
  });
  assert.equal(factory.machines.smelter.hopper.ferrous_ore, 20, 'stocked once from the bag');
  assert.equal(inventory.materials.ferrous_ore, 30);
  const manual = makeFactory();
  manual.inventory.materials.ferrous_ore = 50;
  manual.factory.deserialize({
    buffs: {},
    machines: { smelter: { unlocked: true, count: 1, isAutomated: false, currentRecipe: 'steel_ingot', progress: 0 } },
  });
  assert.equal(manual.factory.machines.smelter.hopper.ferrous_ore, undefined, 'manual lines are not auto-stocked');
});

// ── Processing bank: queue persistence + offline ─────────────────────────────

function makeProcessing() {
  const inventory = new InventorySystem();
  const pp = new PPSystem();
  pp.setBaseCap(1e9);
  return { inventory, pp, nodes: new ProcessingNodeSystem(inventory, pp) };
}

test('active job and queue survive serialize (inputs consumed at enqueue — §12 fix)', () => {
  const { inventory, nodes } = makeProcessing();
  inventory.materials.iron = 10;
  assert.ok(nodes.enqueue('quantumCrusher'));
  assert.ok(nodes.enqueue('quantumCrusher'));
  assert.ok(nodes.enqueue('quantumCrusher'));
  nodes.update(3); // partway into job 1 (duration 8)
  const blob = JSON.parse(JSON.stringify(nodes.serialize()));
  const b = makeProcessing().nodes;
  b.deserialize(blob);
  const st = b.getState('quantumCrusher');
  assert.ok(Math.abs(st.active.progress - 3) < 1e-9);
  assert.equal(st.queue.length, 2);
});

test('processing simulateOffline completes queued jobs in closed form', () => {
  const { inventory, nodes } = makeProcessing();
  inventory.materials.iron = 10;
  nodes.enqueue('quantumCrusher'); // active (8s)
  nodes.enqueue('quantumCrusher'); // queued
  nodes.enqueue('quantumCrusher'); // queued
  const done = nodes.simulateOffline(20, 1); // 20s: 2 full jobs + 4s into #3
  assert.equal(done, 2);
  assert.equal(inventory.materials.iron_dust, 6);
  const st = nodes.getState('quantumCrusher');
  assert.ok(Math.abs(st.active.progress - 4) < 1e-9, 'third job mid-flight');
  assert.equal(nodes.simulateOffline(100, 0), 0, 'gate 0 = dormant');
});
