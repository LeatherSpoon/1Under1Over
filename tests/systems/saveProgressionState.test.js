import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TechTreeSystem } from '../../js/systems/TechTreeSystem.js';
import { CraftingMasterySystem } from '../../js/systems/CraftingMasterySystem.js';

test('progression systems serialize stable state', () => {
  const tech = new TechTreeSystem({ owned: ['fieldFabrication'] });
  const mastery = new CraftingMasterySystem({ tracks: [{ id: 'survival', xpPerLevel: 100 }] });
  mastery.award('survival', 125);

  assert.deepEqual(tech.serialize(), { owned: ['fieldFabrication'] });
  assert.equal(mastery.serialize().progress.survival.level, 2);
});
