// Fixed anchor rooms + guaranteed corridors for the Mine's re-rolling cave.
// Coordinates are 25x25 grid cells. Column c -> x=(c-12)*3.2, row r -> z=(r-12)*3.2.
// These are identical every generation so the world graph never breaks.
export const MINE_GRID_SIZE = 25;

// Rectangular rooms guaranteed to be open floor. Each contains a fixed point of
// interest. { c0, r0, c1, r1 } are inclusive cell ranges.
//   entrance chamber : return portal (12,2) + spawn (12,3)
//   shaft mouth      : connective spine
//   working cavern   : drill (9,12)
//   depths chamber   : depths shaft (17,14)
//   breach chamber   : verdantMaw (9,21), frozenTundra (15,21), lagoon (12,23)
export const ANCHOR_ROOMS = [
  { c0: 9,  r0: 1,  c1: 15, r1: 3  },
  { c0: 11, r0: 4,  c1: 13, r1: 8  },
  { c0: 6,  r0: 9,  c1: 13, r1: 15 },
  { c0: 15, r0: 12, c1: 19, r1: 16 },
  { c0: 7,  r0: 19, c1: 17, r1: 23 },
];

// Straight floor runs guaranteeing connectivity between the rooms.
export const CORRIDOR_SEGMENTS = [
  { c0: 12, r0: 2,  c1: 12, r1: 21 }, // spine: entrance -> breach
  { c0: 9,  r0: 12, c1: 12, r1: 12 }, // spur to drill
  { c0: 12, r0: 14, c1: 17, r1: 14 }, // spur to depths
  { c0: 9,  r0: 21, c1: 15, r1: 21 }, // breach cross-gallery (side gates)
  { c0: 12, r0: 21, c1: 12, r1: 23 }, // lagoon gate drop
];

export function blankGrid() {
  return Array.from({ length: MINE_GRID_SIZE }, () =>
    Array.from({ length: MINE_GRID_SIZE }, () => ' ')
  );
}

function carveRect(grid, { c0, r0, c1, r1 }) {
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (r >= 0 && r < grid.length && c >= 0 && c < grid[r].length) grid[r][c] = '.';
    }
  }
}

export function stampAnchors(grid) {
  for (const room of ANCHOR_ROOMS) carveRect(grid, room);
}

export function carveCorridors(grid) {
  for (const seg of CORRIDOR_SEGMENTS) {
    const dc = Math.sign(seg.c1 - seg.c0);
    const dr = Math.sign(seg.r1 - seg.r0);
    let c = seg.c0, r = seg.r0;
    grid[r][c] = '.';
    while (c !== seg.c1 || r !== seg.r1) {
      if (c !== seg.c1) c += dc;
      else if (r !== seg.r1) r += dr;
      grid[r][c] = '.';
    }
  }
}
