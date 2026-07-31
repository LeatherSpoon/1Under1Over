import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  LAB_MAP, SIZE, CELL, CENTER, isFloor, cellWorld, POIS,
  wallPlacements, wallCollisionCircles,
} from '../../js/scene/zones/Labyrinth/layout.js';

const floorAt = (c, r) =>
  r >= 0 && r < SIZE && c >= 0 && c < SIZE && isFloor(LAB_MAP[r][c]);
const worldCell = (x, z) => [Math.round(x / CELL) + CENTER, Math.round(z / CELL) + CENTER];

test('the map is a well-formed bordered grid', () => {
  assert.equal(LAB_MAP.length, SIZE);
  for (const row of LAB_MAP) assert.equal(row.length, SIZE, `bad row width: "${row}"`);
  for (let i = 0; i < SIZE; i++) {
    assert.equal(LAB_MAP[0][i], '#');
    assert.equal(LAB_MAP[SIZE - 1][i], '#');
    assert.equal(LAB_MAP[i][0], '#');
    assert.equal(LAB_MAP[i][SIZE - 1], '#');
  }
});

/** BFS over floor cells, 4-connected, from the spawn cell. */
function reachableFrom(c0, r0) {
  const seen = new Set([`${c0},${r0}`]);
  const queue = [[c0, r0]];
  while (queue.length) {
    const [c, r] = queue.pop();
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc, nr = r + dr;
      if (!floorAt(nc, nr) || seen.has(`${nc},${nr}`)) continue;
      seen.add(`${nc},${nr}`);
      queue.push([nc, nr]);
    }
  }
  return seen;
}

test('every floor cell is reachable from the spawn — no orphaned pockets', () => {
  const [sc, sr] = worldCell(...POIS.spawn);
  assert.ok(floorAt(sc, sr), 'spawn must stand on floor');
  const seen = reachableFrom(sc, sr);
  let floors = 0;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (!floorAt(c, r)) continue;
      floors++;
      assert.ok(seen.has(`${c},${r}`), `floor cell (${c},${r}) is walled off`);
    }
  }
  assert.ok(floors >= 90, `expected a real maze, got only ${floors} floor cells`);
});

test('every landmark stands on floor, and the shrine is a genuine trek', () => {
  for (const [name, [x, z]] of Object.entries(POIS)) {
    const [c, r] = worldCell(x, z);
    assert.ok(floorAt(c, r), `${name} at (${x},${z}) → cell (${c},${r}) is not floor`);
  }
  // BFS distance spawn → shrine must be maze-long, not a straight shot
  // (straight-line distance is ~11 cells).
  const [sc, sr] = worldCell(...POIS.spawn);
  const dist = new Map([[`${sc},${sr}`, 0]]);
  const queue = [[sc, sr]];
  while (queue.length) {
    const [c, r] = queue.shift();
    const d = dist.get(`${c},${r}`);
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc, nr = r + dr, k = `${nc},${nr}`;
      if (!floorAt(nc, nr) || dist.has(k)) continue;
      dist.set(k, d + 1);
      queue.push([nc, nr]);
    }
  }
  const [gc, gr] = worldCell(...POIS.shrine);
  const d = dist.get(`${gc},${gr}`);
  assert.ok(d !== undefined, 'shrine unreachable');
  assert.ok(d >= 16, `shrine should be a trek through the maze, got ${d} cells`);
});

test('wall slabs and collision cover exactly the exposed wall cells', () => {
  // Every collision circle's center sits inside a wall cell (corridors keep
  // their full width), and every exposed wall cell has both a visual and a
  // barrier. Buried cells (no floor in 8-neigh) have neither.
  const circles = wallCollisionCircles();
  for (const { x, z } of circles) {
    const [c, r] = worldCell(x, z);
    assert.ok(!floorAt(c, r), `collision circle at (${x},${z}) sits in floor cell (${c},${r})`);
  }
  const placedCells = new Set(wallPlacements().map(p => worldCell(p.x, p.z).join(',')));
  const circleCells = new Set(circles.map(p => worldCell(p.x, p.z).join(',')));
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (floorAt(c, r)) continue;
      let exposed = false;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if ((dc || dr) && floorAt(c + dc, r + dr)) exposed = true;
        }
      }
      const key = `${c},${r}`;
      if (exposed) {
        assert.ok(placedCells.has(key), `exposed wall cell (${c},${r}) has no slab`);
        assert.ok(circleCells.has(key), `exposed wall cell (${c},${r}) has no barrier`);
      } else {
        assert.ok(!placedCells.has(key), `buried wall cell (${c},${r}) wastes a slab`);
      }
    }
  }
  // Chain circles are close enough that a PLAYER_R 0.35 body can never slip
  // between two neighbours of the same run (needs gap > 2·(r + 0.35) = 2.1;
  // spacing is 1.65 in-cell and 1.7 across the cell join). Pillar cells
  // (single circle, no run) are exempt — they're meant to be walked around.
  const byCell = new Map();
  for (const c of circles) {
    const key = worldCell(c.x, c.z).join(',');
    byCell.set(key, (byCell.get(key) || 0) + 1);
  }
  for (const a of circles) {
    if (byCell.get(worldCell(a.x, a.z).join(',')) === 1) continue; // pillar
    const near = circles.some(b => b !== a && Math.hypot(a.x - b.x, a.z - b.z) <= 1.71);
    assert.ok(near, `lonely barrier circle at (${a.x},${a.z})`);
  }
});

test('resource and enemy spawns in Environment.js stand on floor cells', async () => {
  // Pure-data mirror of the coordinates wired in Environment.getResourceNodeSpawns
  // / getEnemySpawns (kept literal there; a drift fails here with the cell name).
  const nodes = [[-30, -5], [25, -25], [-27, -18], [-25, 31.6], [30, -28.5], [4, -30.5],
    [-40, -40], [40, -15]];
  const enemies = [[-20, 10], [20, -5], [-5, 15], [25, 0], [-10, -30],
    [-40, 0], [40, 10]];
  for (const [x, z] of [...nodes, ...enemies]) {
    const [c, r] = worldCell(x, z);
    assert.ok(floorAt(c, r), `spawn at (${x},${z}) → cell (${c},${r}) is not floor`);
  }
});
