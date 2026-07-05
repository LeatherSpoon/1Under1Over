import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  mineRegionForRow, getMineWallCells, getMineWallRuns,
  setActiveMineMap, getActiveMineMap,
} from '../../js/scene/zones/Mine/layout.js';

import { WALL_REGION_PIECES, pickWallPiece, materialKindFor } from '../../js/scene/zones/Mine/kitRules.js';

test('every region has wall pieces and picks are stable within [0,1)', () => {
  for (const region of ['entrance', 'shaft', 'cavern', 'passage', 'breach']) {
    const pieces = WALL_REGION_PIECES[region];
    assert.ok(Array.isArray(pieces) && pieces.length >= 2, `${region} needs >=2 variants`);
    assert.equal(pickWallPiece(region, 0), pieces[0]);
    assert.equal(pickWallPiece(region, 0.999), pieces[pieces.length - 1]);
  }
  // Unknown regions fall back to cavern rock
  assert.equal(pickWallPiece('nonsense', 0), WALL_REGION_PIECES.cavern[0]);
});

test('materialKindFor classifies glow materials by name', () => {
  assert.equal(materialKindFor('RuneVein'),     'emissive');
  assert.equal(materialKindFor('AlienVein'),    'emissive');
  assert.equal(materialKindFor('OreVein'),      'emissive');
  assert.equal(materialKindFor('CrystalVein'),  'emissive');
  assert.equal(materialKindFor('CaveRock'),     'reveal');
  assert.equal(materialKindFor('Timber'),       'reveal');
});

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
