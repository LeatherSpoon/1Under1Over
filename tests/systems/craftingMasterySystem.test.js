import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CraftingMasterySystem } from '../../js/systems/CraftingMasterySystem.js';

test('mastery awards XP and increases level', () => {
  const mastery = new CraftingMasterySystem({
    tracks: [{ id: 'survival', label: 'Survival', xpPerLevel: 100 }]
  });

  const result = mastery.award('survival', 125);

  assert.equal(result.level, 2);
  assert.equal(mastery.getLevel('survival'), 2);
});

test('mastery craft speed bonus stays modest', () => {
  const mastery = new CraftingMasterySystem({
    tracks: [{ id: 'energy', label: 'Energy', xpPerLevel: 100 }]
  });
  mastery.award('energy', 350);

  assert.equal(mastery.getCraftTimeMultiplier('energy'), 0.88);
});
