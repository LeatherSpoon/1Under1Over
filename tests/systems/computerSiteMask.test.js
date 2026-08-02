import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isChunkCellValid } from '../../js/scene/zones/ComputerBuilding/siteMask.js';

test('occupied ground rejects, open meadow accepts', () => {
  assert.ok(!isChunkCellValid(0, 0), 'landing pad');
  assert.ok(!isChunkCellValid(2, -2), 'the Starwing');
  assert.ok(!isChunkCellValid(-3, -3), 'mountain');
  assert.ok(!isChunkCellValid(3, 3), 'arena');
  assert.ok(!isChunkCellValid(-1, -1), 'pad→adit corridor');
  assert.ok(!isChunkCellValid(7, 0), 'outside the edge margin');
  // Known-open meadow: south of the pad, east of the corridor
  assert.ok(isChunkCellValid(0, 3), 'open meadow south of the pad');
  assert.ok(isChunkCellValid(-3, 3), 'open meadow SW');
});

test('live collision circles veto', () => {
  assert.ok(isChunkCellValid(0, 3));
  assert.ok(!isChunkCellValid(0, 3, [{ x: 1, z: 19, r: 0.6 }]), 'a tree in the cell');
});
