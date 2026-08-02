import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SaveSystem } from '../../js/systems/SaveSystem.js';
import { ComputerSystem } from '../../js/systems/ComputerSystem.js';

function minimalSystems(computer) {
  return {
    pp: {
      ppTotal: 0, prestigeCount: 0, ppRate: 1, globalMultiplier: 1,
      _baseCap: 100, _capMultipliers: {}, ppCap: 100, _rateModifiers: {},
      setModifier() {},
      setBaseCap(v) { this._baseCap = v; this._recomputeCap(); },
      _recomputeCap() { this.ppCap = this._baseCap; },
    },
    stats: {
      statNames: [], stats: {},
      currentHP: 1, currentFP: 1, currentEnergy: 1, maxHP: 1, maxEnergy: 1,
    },
    inventory: { materials: {}, consumables: {}, tools: {}, storageItems: {}, equipmentBag: [] },
    pedometer: {
      totalSteps: 0, _ppBonusPerStep: 0, _ppBonusPurchases: 0, _nextBonusCost: 0,
      _trackCount: 0, _nextTrackCost: 0, _pendingTracks: 0, _placedTracks: [],
      _statStepPurchases: {}, _totalStatPurchases: 0, _nextStatCost: 0, _unlockedZones: new Set(),
    },
    drones: { drones: [], upgradeCost: 0, _missions: [], getMissions() { return []; } },
    equipment: { slots: {}, unequip() {}, equip() {} },
    gameStats: {
      enemiesDefeated: 0, defeats: 0, actionsTaken: 0, highestHit: 0,
      totalStepsTaken: 0, resourcesGathered: 0, _visitedZones: new Set(),
    },
    computer,
  };
}

test('computer plan, door and checklist survive a save round-trip', () => {
  const src = new ComputerSystem({ materials: { iron: 30 }, removeMaterial() {} });
  src.isCellValid = () => true;
  src.place(2, -1); src.pendingChunks = 1; src.place(2, 0);
  src.setDoor(2, 0, 'S');
  src.delivered = { iron: 5 };
  const save = new SaveSystem(minimalSystems(src));
  const data = save._buildSaveData('landingSite', 0, 0);
  assert.equal(data.version, 15);
  assert.deepEqual(data.computer.plan.sort(), ['2,-1', '2,0']);

  const dst = new ComputerSystem({ materials: {}, removeMaterial() {} });
  new SaveSystem(minimalSystems(dst)).apply(data);
  assert.deepEqual([...dst.plan].sort(), ['2,-1', '2,0']);
  assert.deepEqual(dst.door, { cx: 2, cz: 0, side: 'S' });
  assert.deepEqual(dst.delivered, { iron: 5 });
});

test('v14 save (no computer blob) loads to the fresh unfounded state', () => {
  const dst = new ComputerSystem({ materials: {}, removeMaterial() {} });
  const save = new SaveSystem(minimalSystems(dst));
  const data = save._buildSaveData('landingSite', 0, 0);
  delete data.computer;          // simulate a v14 blob
  data.version = 14;
  new SaveSystem(minimalSystems(dst)).apply(data);
  assert.equal(dst.plan.size, 0);
  assert.equal(dst.generation, 1);
  assert.equal(dst.pendingChunks, 1);
});
