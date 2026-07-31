/**
 * The Labyrinth's floor plan — pure data (no three.js import, so tests
 * flood-fill it headlessly). The zone builder registers collision and the
 * ZONE_ASSETS rows place the kit GLBs from the same map.
 *
 * One 19×19 cell grid, CELL = 5 world units — sized to the kit's wall module
 * (Lab_WallStraight is 4.52 long; ×1.13 closes the joins). Rows run north
 * (r0, z −45) to south (r18, z +45); the return gate to Atlantis stands in
 * the southern entry court. '#' is wall; every other char is floor — letters
 * mark courts so the map reads: E entry court, M Minotaur plaza, F fountain
 * court, W well yard, S shrine sanctum, T tomb alcove.
 *
 * The outer walk (the 2026-07-30 expansion): the original 15×15 maze is
 * wrapped in a perimeter corridor ring, split by two cross-walls (c8 north
 * and south) into two arcs that never meet. The east arc is a loop — south
 * opening (r16,c13) → east opening into the NE room (r9,c16) → north opening
 * behind the tomb alcove (r2,c13). The west arc is the long dark: one way in
 * off the west corridor (r12,c2), all the way around the SW corner and up to
 * a hidden back door into the shrine sanctum's west arm (r2,c5). Growing the
 * grid symmetrically (2 cells per side) keeps every old cell's world
 * position — only CENTER moves.
 *
 * Walls are thin carved slabs run along the wall cells' center lines (an
 * x-run and/or z-run per cell — a cell in both runs gets both slabs, which
 * builds its corner; a wall cell touching no other wall stands as a column).
 * Collision is a chain of small circles along each slab's own line, so the
 * player is held at the carved face, not at some invisible cell boundary.
 */

export const CELL = 5;
export const LAB_MAP = [
  '###################', // r0
  '#.......#.........#', // r1  the outer walk — cross-wall at c8 splits the arcs
  '#.###.#######.###.#', // r2  old north wall: shrine back door c5, tomb opening c13
  '#.#.....SSS#...T#.#', // r3  sanctum + north arms; tomb alcove NE
  '#.#FFF#####.WWW##.#', // r4  fountain court NW, well yard NE
  '#.#FFF..###.WWW##.#', // r5
  '#.#FFF#..#..WWW##.#', // r6
  '#.##.###.###.####.#', // r7
  '#.#...##MMM#...##.#', // r8  the Minotaur plaza
  '#.#.#...MMM..#....#', // r9  east opening c16 into the NE room
  '#.#.#.##MMM###.##.#', // r10
  '#.#.#..##.#....##.#', // r11
  '#...#.......#...#.#', // r12 the cross corridor; west opening c2
  '#.#.####EEE####.#.#', // r13 entry court
  '#.#.#..#EEE#..#.#.#', // r14
  '#.#....#EEE#....#.#', // r15
  '#.###########.###.#', // r16 old south wall: opening c13 east of the court
  '#.......#.........#', // r17 the outer walk south, cross-wall at c8
  '###################', // r18
];
export const SIZE = LAB_MAP.length;
export const CENTER = (SIZE - 1) / 2;

export const isFloor = ch => ch !== undefined && ch !== '#';
const cellAt = (c, r) => (r < 0 || r >= SIZE || c < 0 || c >= SIZE) ? '#' : LAB_MAP[r][c];
export const floorAtCell = (c, r) => isFloor(cellAt(c, r));
/** Cell center in world units. */
export const cellWorld = (c, r) => [(c - CENTER) * CELL, (r - CENTER) * CELL];

// Landmark positions (world units), used by the builder, spawns and tests.
export const POIS = {
  gate: [0, 26],        // return gate to Atlantis (entry court)
  spawn: [0, 22],       // arrival point, just north of the gate
  statue: [0, 0],       // the Minotaur, plaza center
  shrine: [0, -31.3],   // sanctum back wall
  fountain: [-25, -20],
  well: [20, -20],
};

/** mulberry32 — module-local copy (Environment's is not exported). */
function seededRandom(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A wall cell is skipped entirely when no floor cell can see it (8-neigh). */
function exposed(c, r) {
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if ((dc || dr) && floorAtCell(c + dc, r + dr)) return true;
    }
  }
  return false;
}

/**
 * Kit placements for every exposed wall cell — emitted as ZONE_ASSETS rows.
 * Slab length 4.52 × 1.13 ≈ 5.1 closes the cell joins; per-cell seeded
 * height jitter keeps the crest line from reading machine-flat (the Mine
 * kit lesson), and the yaw flip breaks texture repetition on long runs.
 */
export function wallPlacements() {
  const rng = seededRandom(140921);
  const out = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const sy = 0.96 + rng() * 0.1;
      const flip = rng() < 0.5 ? Math.PI : 0;
      if (isFloor(cellAt(c, r)) || !exposed(c, r)) continue;
      const [x, z] = cellWorld(c, r);
      const xRun = cellAt(c - 1, r) === '#' || cellAt(c + 1, r) === '#';
      const zRun = cellAt(c, r - 1) === '#' || cellAt(c, r + 1) === '#';
      if (!xRun && !zRun) {
        out.push({ model: 'labColumn', x, z, scale: 1.15, rotY: flip, reveal: true });
        continue;
      }
      if (xRun) {
        out.push({ model: 'labWallStraight', x, z, scale: 1, rotY: flip,
          scaleXYZ: [1.13, sy, 1], reveal: true });
      }
      if (zRun) {
        out.push({ model: 'labWallStraight', x, z, scale: 1, rotY: Math.PI / 2 + flip,
          scaleXYZ: [1.13, sy, 1], reveal: true });
      }
    }
  }
  return out;
}

/**
 * Collision — circle chains along each slab's center line (r 0.7 at 1.65
 * spacing: gap-free for PLAYER_R 0.35, holding the player ~0.4 off the
 * carved face). Cross cells emit both chains, sharing the center circle.
 */
export function wallCollisionCircles() {
  const out = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (isFloor(cellAt(c, r)) || !exposed(c, r)) continue;
      const [x, z] = cellWorld(c, r);
      const xRun = cellAt(c - 1, r) === '#' || cellAt(c + 1, r) === '#';
      const zRun = cellAt(c, r - 1) === '#' || cellAt(c, r + 1) === '#';
      if (!xRun && !zRun) { out.push({ x, z, r: 0.75 }); continue; }
      out.push({ x, z, r: 0.7 });
      if (xRun) { out.push({ x: x - 1.65, z, r: 0.7 }, { x: x + 1.65, z, r: 0.7 }); }
      if (zRun) { out.push({ x, z: z - 1.65, r: 0.7 }, { x, z: z + 1.65, r: 0.7 }); }
    }
  }
  return out;
}
