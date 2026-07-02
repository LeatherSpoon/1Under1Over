import assert from 'node:assert/strict';
import { test } from 'node:test';
import { InventorySystem } from '../../js/systems/InventorySystem.js';
import { ExtractorSystem } from '../../js/systems/ExtractorSystem.js';
import { ProcessingNodeSystem } from '../../js/systems/ProcessingNodeSystem.js';

// Phase 0 (P0.2): the two newly-wired systems must round-trip through save/load,
// and tolerate older (v6) saves that lack their keys.

test('ExtractorSystem serialize/deserialize round-trips installed slots', () => {
  const inv = new InventorySystem();
  inv.materials.extractor_unit = 1;
  inv.materials.extractor_unit_adv = 1;

  const ex = new ExtractorSystem(inv);
  ex.install('basic');
  ex.install('advanced');
  const blob = ex.serialize();

  const fresh = new ExtractorSystem(new InventorySystem());
  fresh.deserialize(blob);
  assert.equal(fresh.slotCount, 2);
  assert.equal(fresh.basicCount, 1);
  assert.equal(fresh.advancedCount, 1);
});

test('ProcessingNodeSystem serialize/deserialize round-trips tier + totals', () => {
  const inv = new InventorySystem();
  const pp = { spend: () => true };
  const pn = new ProcessingNodeSystem(inv, pp);
  pn.upgrade('quantumCrusher'); // tier 1 -> 2
  inv.addMaterial('iron', 2);
  pn.enqueue('quantumCrusher');
  pn.update(8); // complete one job

  const blob = pn.serialize();
  const fresh = new ProcessingNodeSystem(new InventorySystem(), pp);
  fresh.deserialize(blob);
  assert.equal(fresh.getState('quantumCrusher').tier, 2);
  assert.equal(fresh.getState('quantumCrusher').totalCompleted, 1);
});

test('deserialize tolerates a v6 save (missing keys) without throwing', () => {
  const inv = new InventorySystem();
  const ex = new ExtractorSystem(inv);
  const pn = new ProcessingNodeSystem(inv, { spend: () => true });
  // v6 saves have no extractor / processingNodes blob -> undefined.
  assert.doesNotThrow(() => ex.deserialize(undefined));
  assert.doesNotThrow(() => pn.deserialize(undefined));
  assert.equal(ex.slotCount, 0);
  assert.equal(pn.getState('quantumCrusher').tier, 1);
});
