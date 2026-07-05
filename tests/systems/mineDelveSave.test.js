import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SaveSystem } from '../../js/systems/SaveSystem.js';
import { MineDelveSystem } from '../../js/systems/MineDelveSystem.js';

function minimalSystems(mineDelve) {
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
    mineDelve,
  };
}

test('mine delve seed and mined cells survive a save round-trip', () => {
  const src = new MineDelveSystem();
  src.load({ seed: 4242, minedCells: ['3,4', '5,6'] });
  const save = new SaveSystem(minimalSystems(src));
  const data = save._buildSaveData('mine', 0, 0);
  assert.deepEqual(data.mineDelve, { seed: 4242, minedCells: ['3,4', '5,6'] });

  const dst = new MineDelveSystem();
  new SaveSystem(minimalSystems(dst)).apply(data);
  assert.equal(dst.seed, 4242);
  assert.equal(dst.isMined(3, 4), true);
  assert.equal(dst.isMined(5, 6), true);
});
