import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CraftingSystem } from '../../js/systems/CraftingSystem.js';

test('crafting start emits sync transaction with local job id', async () => {
  const events = [];
  const inventory = {
    materials: { timber: 2 },
    hasTool: () => false,
    hasMaterials: () => true,
    removeMaterial: () => true
  };
  const stats = { stats: { crafting: { level: 1 }, craftingSpeed: { level: 1 } } };
  const crafting = new CraftingSystem(inventory, stats, {
    recipes: {
      ration: { label: 'Ration', type: 'consumable', key: 'ration', materials: { timber: 2 }, baseTime: 3, minCraftingLevel: 1, masteryCategory: 'survival' }
    },
    sync: {
      recordTransaction(type, payload) {
        events.push({ type, payload });
      }
    }
  });

  assert.equal(crafting.startCraft('ration'), true);
  assert.equal(events[0].type, 'crafting.start');
  assert.equal(events[0].payload.recipeId, 'ration');
  assert.ok(events[0].payload.localJobId);
});
