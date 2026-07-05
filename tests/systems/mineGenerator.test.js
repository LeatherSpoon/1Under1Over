import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blankGrid, stampAnchors, carveCorridors } from '../../js/scene/zones/Mine/anchors.js';
import { MINE_ZONE_PORTALS, mineWorldToCell } from '../../js/scene/zones/Mine/layout.js';
import { generateMineMap } from '../../js/scene/zones/Mine/generator.js';

function floodReachesGates(grid) {
  const cellAt = (c, r) =>
    (r < 0 || r >= grid.length || c < 0 || c >= grid[r].length) ? ' ' : grid[r][c];
  const start = mineWorldToCell(0, -28.8); // MINE_SPAWN_POS
  const seen = new Set([`${start.c},${start.r}`]);
  const q = [start];
  while (q.length) {
    const { c, r } = q.pop();
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc, nr = r + dr;
      if (!seen.has(`${nc},${nr}`) && cellAt(nc, nr) === '.') {
        seen.add(`${nc},${nr}`);
        q.push({ c: nc, r: nr });
      }
    }
  }
  return Object.values(MINE_ZONE_PORTALS).every(p => {
    const cell = mineWorldToCell(p.x, p.z);
    return seen.has(`${cell.c},${cell.r}`);
  });
}

test('anchors + corridors make every gate open floor and reachable', () => {
  const grid = blankGrid().map(row => row.slice()); // 2D char array
  stampAnchors(grid);
  carveCorridors(grid);
  const strings = grid.map(row => row.join(''));

  for (const [zone, p] of Object.entries(MINE_ZONE_PORTALS)) {
    const cell = mineWorldToCell(p.x, p.z);
    assert.equal(strings[cell.r][cell.c], '.', `${zone} gate must be floor`);
  }
  assert.ok(floodReachesGates(strings), 'all gates reachable from spawn');
});

test('generated map is deterministic per seed', () => {
  assert.deepEqual(generateMineMap(7), generateMineMap(7));
});

test('different seeds produce different maps', () => {
  assert.notDeepEqual(generateMineMap(7), generateMineMap(8));
});

test('generated map is 25x25', () => {
  const m = generateMineMap(3);
  assert.equal(m.length, 25);
  for (const row of m) assert.equal(row.length, 25);
});

test('every gate is reachable across 100 seeds', () => {
  for (let seed = 1; seed <= 100; seed++) {
    assert.ok(floodReachesGates(generateMineMap(seed)), `seed ${seed} strands a gate`);
  }
});

test('every generated gate cell is open floor', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const m = generateMineMap(seed);
    for (const [zone, p] of Object.entries(MINE_ZONE_PORTALS)) {
      const cell = mineWorldToCell(p.x, p.z);
      assert.equal(m[cell.r][cell.c], '.', `seed ${seed}: ${zone} gate not floor`);
    }
  }
});
