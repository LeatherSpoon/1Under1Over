import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  mineRegionForRow, getMineWallCells, getMineWallRuns,
  setActiveMineMap, getActiveMineMap,
} from '../../js/scene/zones/Mine/layout.js';

test('mineRegionForRow matches the floor-run region bands', () => {
  assert.equal(mineRegionForRow(0),  'entrance');
  assert.equal(mineRegionForRow(4),  'entrance');
  assert.equal(mineRegionForRow(5),  'shaft');
  assert.equal(mineRegionForRow(7),  'shaft');
  assert.equal(mineRegionForRow(8),  'cavern');
  assert.equal(mineRegionForRow(16), 'cavern');
  assert.equal(mineRegionForRow(17), 'passage');
  assert.equal(mineRegionForRow(19), 'passage');
  assert.equal(mineRegionForRow(20), 'breach');
  assert.equal(mineRegionForRow(24), 'breach');
});

test('getMineWallCells covers exactly the cells the merged runs cover', () => {
  const baseline = getActiveMineMap();
  try {
    setActiveMineMap([
      '     ',
      ' ... ',
      ' .1. ',
      ' ... ',
      '     ',
    ]);
    const cells = getMineWallCells();
    const runCells = getMineWallRuns()
      .reduce((n, run) => n + Math.round(run.width / 3.2), 0);
    assert.equal(cells.length, runCells);
    assert.ok(cells.every(cell =>
      typeof cell.x === 'number' && typeof cell.z === 'number' &&
      typeof cell.c === 'number' && typeof cell.r === 'number' &&
      typeof cell.region === 'string'
    ));
  } finally {
    setActiveMineMap(baseline);
  }
});
