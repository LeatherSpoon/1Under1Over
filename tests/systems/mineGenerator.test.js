import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blankGrid, stampAnchors, carveCorridors } from '../../js/scene/zones/Mine/anchors.js';
import { MINE_ZONE_PORTALS, mineWorldToCell } from '../../js/scene/zones/Mine/layout.js';

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
