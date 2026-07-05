import { MINE_GRID_SIZE, blankGrid, stampAnchors, carveCorridors } from './anchors.js';
import { MINE_ZONE_PORTALS, mineWorldToCell } from './layout.js';

function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const IN = (c, r) => c >= 0 && c < MINE_GRID_SIZE && r >= 0 && r < MINE_GRID_SIZE;

// Random walkers branch extra winding floor off the spine within the cave band.
function carveCave(grid, rng) {
  const walkers = 3 + Math.floor(rng() * 3);
  for (let w = 0; w < walkers; w++) {
    let c = 12, r = 6 + Math.floor(rng() * 12);
    const steps = 12 + Math.floor(rng() * 24);
    for (let i = 0; i < steps; i++) {
      grid[r][c] = '.';
      const dir = Math.floor(rng() * 4);
      if (dir === 0 && c > 2) c--;
      else if (dir === 1 && c < MINE_GRID_SIZE - 3) c++;
      else if (dir === 2 && r > 4) r--;
      else if (r < MINE_GRID_SIZE - 3) r++;
    }
  }
}

// Row -> ore tier char, mirroring the old vertical progression (copper..gold).
function tierForRow(r) {
  if (r <= 7) return '1';
  if (r <= 10) return '2';
  if (r <= 13) return '3';
  if (r <= 17) return '4';
  return '5';
}

// Fill void cells adjacent to floor with ore. Never overwrites floor, so
// reachability is preserved regardless of the roll.
function placeOre(grid, rng) {
  const isFloor = (c, r) => IN(c, r) && grid[r][c] === '.';
  for (let r = 4; r < MINE_GRID_SIZE - 1; r++) {
    for (let c = 1; c < MINE_GRID_SIZE - 1; c++) {
      if (grid[r][c] !== ' ') continue;
      const adj = isFloor(c - 1, r) || isFloor(c + 1, r) || isFloor(c, r - 1) || isFloor(c, r + 1);
      if (adj && rng() < 0.28) grid[r][c] = tierForRow(r);
    }
  }
}

function toStrings(grid) {
  return grid.map(row => row.join(''));
}

// Flood-fill over floor cells from the spawn; ore counts as blocked.
function reachableGates(strings) {
  const cellAt = (c, r) =>
    (r < 0 || r >= strings.length || c < 0 || c >= strings[r].length) ? ' ' : strings[r][c];
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

export function generateMineMap(seed) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const rng = mulberry32((seed >>> 0) + attempt * 0x9e3779b1);
    const grid = blankGrid();
    stampAnchors(grid);
    carveCorridors(grid);
    carveCave(grid, rng);
    placeOre(grid, rng);
    const strings = toStrings(grid);
    if (reachableGates(strings)) return strings;
  }
  // Defensive fallback: anchors + corridors only (always reachable).
  const grid = blankGrid();
  stampAnchors(grid);
  carveCorridors(grid);
  return toStrings(grid);
}
