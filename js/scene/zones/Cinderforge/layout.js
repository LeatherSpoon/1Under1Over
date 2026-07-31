/**
 * The Cinderforge's floor plan — pure data (no three.js import, so tests
 * flood-fill it headlessly). The zone builder registers collision and the
 * ZONE_ASSETS rows place the kit GLBs from the same map. Same cell grammar
 * as the Labyrinth (the two mazes are siblings): 15×15 cells, CELL = 5,
 * sized to the kit's wall module (Forge_WallStraight is exported 4.52 long;
 * ×1.13 closes the joins).
 *
 * Rows run north (r0, z −35) to south (r14, z +35); the return gate to the
 * Meltwater Rift's Ember Chasm stands in the southern entry court. '#' is
 * wall; every other char is floor — letters mark courts so the map reads:
 * E entry court, G Forgemaster plaza (the golem), A anvil sanctum (NW —
 * the trek), C crucible court, V vent yard, S slag vault.
 *
 * Walls are thin basalt slabs run along the wall cells' center lines (an
 * x-run and/or z-run per cell — a cell in both runs gets both slabs, which
 * builds its corner; a wall cell touching no other wall stands as a column).
 * Collision is a chain of small circles along each slab's own line, so the
 * player is held at the carved face, not at some invisible cell boundary.
 */

export const CELL = 5;
export const FORGE_MAP = [
  '###############', // r0
  '#AAA#....#SSS.#', // r1  anvil sanctum NW; slag vault NE
  '#AAA#.##.#.##.#', // r2
  '#AAA#.#..#.CCC#', // r3  crucible court E
  '##.##.#.##.CCC#', // r4
  '#..#...#...CCC#', // r5
  '#.#..#GGG#.##.#', // r6  the Forgemaster plaza
  '#.#.#.GGG....##', // r7
  '#V..#.GGG#.#..#', // r8  vent yard W
  '#V#.##.#.##.#.#', // r9
  '#V#......#....#', // r10 the cross corridor
  '#..###EEE###.##', // r11 entry court
  '##.#.#EEE#.#..#', // r12
  '#....#EEE#....#', // r13
  '###############', // r14
];
export const SIZE = FORGE_MAP.length;

export const isFloor = ch => ch !== undefined && ch !== '#';
const cellAt = (c, r) => (r < 0 || r >= SIZE || c < 0 || c >= SIZE) ? '#' : FORGE_MAP[r][c];
export const floorAtCell = (c, r) => isFloor(cellAt(c, r));
/** Cell center in world units. */
export const cellWorld = (c, r) => [(c - 7) * CELL, (r - 7) * CELL];

// Landmark positions (world units), used by the builder, spawns and tests.
export const POIS = {
  gate: [0, 26],        // return gate to the Meltwater Rift (entry court)
  spawn: [0, 22],       // arrival point, just north of the gate
  golem: [0, 0],        // the Forgemaster, plaza center
  anvil: [-25, -25],    // the Great Anvil, sanctum center
  crucible: [25, -15],
  vent: [-30, 10],
  slagVault: [25, -30],
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
  const rng = seededRandom(88417);
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
        out.push({ model: 'forgeColumn', x, z, scale: 1.15, rotY: flip, reveal: true });
        continue;
      }
      if (xRun) {
        out.push({ model: 'forgeWallStraight', x, z, scale: 1, rotY: flip,
          scaleXYZ: [1.13, sy, 1], reveal: true });
      }
      if (zRun) {
        out.push({ model: 'forgeWallStraight', x, z, scale: 1, rotY: Math.PI / 2 + flip,
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
