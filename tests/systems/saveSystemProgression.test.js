import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SaveSystem } from '../../js/systems/SaveSystem.js';

function makeSystems() {
  const calls = {
    tech: null,
    mastery: null,
  };

  return {
    calls,
    systems: {
      pp: {
        ppTotal: 25,
        prestigeBonus: 0,
        prestigeCount: 0,
        ppRate: 1,
        globalMultiplier: 1,
        _rateModifiers: {},
        setModifier() {},
      },
      stats: {
        statNames: ['strength'],
        stats: { strength: { level: 1, exp: 0 } },
        currentHP: 10,
        currentFP: 5,
        currentEnergy: 8,
        maxHP: 10,
        maxEnergy: 8,
      },
      inventory: {
        materials: { timber: 2 },
        consumables: {},
        tools: {},
        storageItems: {},
        equipmentBag: [],
      },
      pedometer: {
        totalSteps: 0,
        _ppBonusPerStep: 0,
        _ppBonusPurchases: 0,
        _nextBonusCost: 10,
        _trackCount: 0,
        _nextTrackCost: 20,
        _pendingTracks: 0,
        _placedTracks: [],
        _statStepPurchases: {},
        _totalStatPurchases: 0,
        _nextStatCost: 50,
        _unlockedZones: new Set(),
      },
      drones: {
        drones: [],
        upgradeCost: 10,
      },
      equipment: {
        slots: {},
        unequip() {},
        equip() {},
      },
      gameStats: {
        enemiesDefeated: 0,
        defeats: 0,
        actionsTaken: 0,
        highestHit: 0,
        totalStepsTaken: 0,
        resourcesGathered: 0,
        _visitedZones: new Set(),
      },
      techTree: {
        serialize() { return { owned: ['fieldFabrication'] }; },
        deserialize(data) { calls.tech = data; },
      },
      mastery: {
        serialize() { return { progress: { survival: { level: 2, xp: 25 } } }; },
        deserialize(data) { calls.mastery = data; },
      },
      sync: {
        version: 7,
        queue: [{ eventId: 'evt_local' }],
      },
    },
  };
}

test('save data preserves tech tree, mastery, and sync version state', () => {
  const { calls, systems } = makeSystems();
  const save = new SaveSystem(systems);

  const data = save._buildSaveData('landingSite', 1, 2);

  assert.deepEqual(data.techTree, { owned: ['fieldFabrication'] });
  assert.deepEqual(data.mastery, { progress: { survival: { level: 2, xp: 25 } } });
  assert.deepEqual(data.sync, { version: 7, queuedEvents: 1 });

  data.techTree = { owned: ['automationProtocols'] };
  data.mastery = { progress: { survival: { level: 3, xp: 5 } } };
  data.sync.version = 12;

  save.apply(data);

  assert.deepEqual(calls.tech, { owned: ['automationProtocols'] });
  assert.deepEqual(calls.mastery, { progress: { survival: { level: 3, xp: 5 } } });
  assert.equal(systems.sync.version, 12);
});
