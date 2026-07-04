import assert from 'node:assert/strict';
import { test } from 'node:test';
import { InventorySystem } from '../../js/systems/InventorySystem.js';
import { ProcessingNodeSystem } from '../../js/systems/ProcessingNodeSystem.js';
import { AssemblySystem } from '../../js/systems/AssemblySystem.js';

// Phase 0 (P0.1): the production chain must share one material vocabulary.
// These guards would have caught the original orphaned-system bug where
// addMaterial() silently dropped keys missing from MATERIAL_NAMES.

const NEW_KEYS = [
  'iron_dust', 'alloy_bar', 'metal_strut', 'hull_plating', 'data_cable',
  'micro_fastener', 'extractor_unit', 'extractor_unit_adv', 'circuit_board', 'hull_segment',
];

test('MATERIAL_NAMES includes every Phase 0 chain/product key', () => {
  const names = new Set(InventorySystem.MATERIAL_NAMES);
  for (const key of NEW_KEYS) {
    assert.ok(names.has(key), `MATERIAL_NAMES missing "${key}"`);
  }
});

test('addMaterial persists a chain material instead of dropping it', () => {
  const inv = new InventorySystem();
  inv.addMaterial('iron_dust', 3);
  assert.equal(inv.materials.iron_dust, 3);
});

test('every ProcessingNode input/output key is a known material', () => {
  const names = new Set(InventorySystem.MATERIAL_NAMES);
  for (const [id, def] of Object.entries(ProcessingNodeSystem.NODE_DEFS)) {
    for (const key of [...Object.keys(def.input), ...Object.keys(def.output)]) {
      assert.ok(names.has(key), `Node "${id}" references unknown material "${key}"`);
    }
  }
});

test('every Assembly schematic cell + output is a known material', () => {
  const names = new Set(InventorySystem.MATERIAL_NAMES);
  // Non-material schematic cells that are intentionally enemy-drop / special keys.
  for (const sch of AssemblySystem.SCHEMATICS) {
    for (const row of sch.grid) {
      for (const cell of row) {
        if (cell) assert.ok(names.has(cell), `Schematic "${sch.id}" references unknown material "${cell}"`);
      }
    }
    assert.ok(names.has(sch.output.key), `Schematic "${sch.id}" output "${sch.output.key}" is unknown`);
  }
});

test('a full processing chain step produces a persisted output', () => {
  const inv = new InventorySystem();
  const pp = { spend: () => true };
  const pn = new ProcessingNodeSystem(inv, pp);
  // quantumCrusher: { iron: 2 } -> { iron_dust: 3 }, baseDuration 8 at tier 1
  inv.addMaterial('iron', 2);
  assert.ok(pn.enqueue('quantumCrusher'));
  assert.equal(inv.materials.iron, 0, 'inputs consumed on enqueue');
  pn.update(8); // advance past the job duration
  assert.equal(inv.materials.iron_dust, 3, 'output landed in inventory');
});
