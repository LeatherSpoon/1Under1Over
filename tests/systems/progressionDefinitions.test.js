import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createLocalDefinitions,
  normalizeRecipesForCrafting
} from '../../js/systems/ProgressionDefinitions.js';
import {
  MATERIALS,
  MASTERY_TRACKS,
  RECIPES,
  TECH_NODES,
} from '../../server/definitions/seedData.js';

test('local definitions include starter recipes and tech nodes', () => {
  const defs = createLocalDefinitions();
  assert.ok(defs.recipes.some(r => r.id === 'ration'));
  assert.ok(defs.techNodes.some(n => n.id === 'fieldFabrication'));
});

test('recipes normalize to CraftingSystem map shape', () => {
  const recipes = normalizeRecipesForCrafting({
    recipes: [
      { id: 'ration', label: 'Ration', type: 'consumable', outputKey: 'ration', category: 'survival', costs: { timber: 2 }, baseTime: 3, minCraftingLevel: 1 }
    ]
  });

  assert.deepEqual(recipes.ration.materials, { timber: 2 });
  assert.equal(recipes.ration.key, 'ration');
  assert.equal(recipes.ration.masteryCategory, 'survival');
});

test('local fallback definitions stay in sync with PostgreSQL seed definitions', () => {
  const definitions = createLocalDefinitions();

  assert.deepEqual(
    definitions.materials.map(m => m.id),
    MATERIALS.map(m => m.id)
  );
  assert.deepEqual(
    definitions.masteryTracks.map(t => t.id),
    MASTERY_TRACKS.map(t => t.id)
  );
  assert.deepEqual(
    definitions.techNodes.map(n => n.id),
    TECH_NODES.map(n => n.id)
  );
  assert.deepEqual(
    definitions.recipes.map(r => r.id),
    RECIPES.map(r => r.id)
  );
});
