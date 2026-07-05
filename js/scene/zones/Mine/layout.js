/**
 * The Mine layout — tile-map-driven cave.
 *
 * The mine is a journey, not a hub (Shadows of Brimstone style): you descend
 * through a timbered entrance, follow the main shaft into a working cavern,
 * and deep at the far end the miners broke through into something older —
 * the Breach, an ancient chamber whose stone gates lead to other worlds.
 *
 * ── Map legend ────────────────────────────────────────────────────────────────
 *   ' '  void (solid mountain — walls are auto-generated around open space)
 *   '.'  open cave floor
 *   1-5  mineable ore block, tier 1 (copper) … tier 5 (gold)
 *
 * Each cell is MINE_CELL (3.2 m). Column c → x = (c-12)*3.2, row r → z = (r-12)*3.2.
 * Row 0 is the surface end (entrance, −z); row 24 is deepest (the Breach, +z).
 */

export const MINE_CELL = 3.2;
const HALF = 12; // 25×25 grid centre index

//                       1111111111222222
//             0123456789012345678901234
export const MINE_MAP = [
  '                         ', // r0   z=-38.4
  '          .....          ', // r1   entrance chamber
  '         .......         ', // r2   ← return portal (0,-32)
  '         .......         ', // r3   ← spawn (0,-28.8)
  '           ...           ', // r4   shaft mouth
  '          1...1          ', // r5   main shaft + copper alcoves
  '           ...           ', // r6
  '          1...1          ', // r7
  '        2.......2        ', // r8   cavern throat
  '      1..1.....2..2      ', // r9   working cavern
  '     1..2........2.2     ', // r10
  '    2.........2.....3    ', // r11
  '    ........3........    ', // r12  ← drill rig (-9.6, 0)
  '     3....2....3.....    ', // r13
  '     ..3.....3.....3     ', // r14  ← Depths shaft (16, 6.4)
  '      3..3.........      ', // r15
  '        3.......4        ', // r16  passage mouth (SE)
  '             4..4        ', // r17  winding passage
  '           4...4         ', // r18
  '          4..4           ', // r19
  '        5.......5        ', // r20  the Breach
  '       5.........5       ', // r21  ← ancient ring (0,28.8), world gates (±9.6,28.8)
  '        .........        ', // r22
  '          .....          ', // r23  ← Lagoon gate (0,35.2)
  '                         ', // r24  z=+38.4
];

// The live grid the getters read. Defaults to the baseline; the generator swaps
// it in via setActiveMineMap() when a delve is (re)built.
let _activeMap = MINE_MAP;

export function setActiveMineMap(grid) { _activeMap = grid; }
export function getActiveMineMap() { return _activeMap; }

export function mineCellToWorld(c, r) {
  return { x: (c - HALF) * MINE_CELL, z: (r - HALF) * MINE_CELL };
}

export function mineWorldToCell(x, z) {
  return { c: Math.round(x / MINE_CELL) + HALF, r: Math.round(z / MINE_CELL) + HALF };
}

// Fixed points of interest
export const MINE_PORTAL_POS = { x: 0, z: -32 };      // return portal (entrance)
export const MINE_SPAWN_POS  = { x: 0, z: -28.8 };
export const MINE_DRILL_POS  = { x: -9.6, z: 0 };
// Crossing this z inside the mine means the player has broken into the Breach passage
export const MINE_BREACH_Z   = 14;

// All zone gates. The return portal sits at the entrance; the Depths shaft is
// in the working cavern (the mine keeps going down); the three world gates
// stand inside the Breach chamber.
export const MINE_ZONE_PORTALS = {
  landingSite:  { x: 0,    z: -32   }, // entrance (surface lift)
  depths:       { x: 16,   z: 6.4   }, // cavern — descending shaft
  verdantMaw:   { x: -9.6, z: 28.8  }, // Breach — west gate
  frozenTundra: { x: 9.6,  z: 28.8  }, // Breach — east gate
  lagoonCoast:  { x: 0,    z: 35.2  }, // Breach — far gate
};

// 5-tier ore properties, indexed by tier
const TIER_PROPS = [
  { tier: 0, ore: 'copper', chance: 0.15, cost: 5,  duration: 2.0, color: 0x2a1a08, veinColor: 0xcc7722 },
  { tier: 1, ore: 'iron',   chance: 0.20, cost: 8,  duration: 3.5, color: 0x1a1c24, veinColor: 0x8899cc },
  { tier: 2, ore: 'carbon', chance: 0.25, cost: 12, duration: 5.0, color: 0x06050a, veinColor: 0x3355ff },
  { tier: 3, ore: 'quartz', chance: 0.30, cost: 18, duration: 6.5, color: 0x110f1a, veinColor: 0xff88cc },
  { tier: 4, ore: 'gold',   chance: 0.35, cost: 25, duration: 9.0, color: 0x1c1500, veinColor: 0xffcc00 },
];

function cellAt(c, r) {
  if (r < 0 || r >= _activeMap.length || c < 0 || c >= _activeMap[r].length) return ' ';
  return _activeMap[r][c];
}

function isOpenCell(ch) { return ch === '.'; }
function isOreCell(ch)  { return ch >= '1' && ch <= '5'; }
function isCarved(ch)   { return isOpenCell(ch) || isOreCell(ch); }

export function isMineFloorCell(c, r) {
  return isOpenCell(cellAt(c, r));
}

/** Mineable ore blocks parsed from the map. Same shape the old generator produced. */
export function getMineableWallBlocks() {
  const blocks = [];
  for (let r = 0; r < _activeMap.length; r++) {
    for (let c = 0; c < _activeMap[r].length; c++) {
      const ch = cellAt(c, r);
      if (!isOreCell(ch)) continue;
      const { x, z } = mineCellToWorld(c, r);
      blocks.push({
        x: Number(x.toFixed(2)),
        z: Number(z.toFixed(2)),
        r: 1.6,
        cellC: c,
        cellR: r,
        isBorder: false,
        props: TIER_PROPS[ch.charCodeAt(0) - 49], // '1' → tier 0
      });
    }
  }
  return blocks;
}

/**
 * Solid (non-mineable) cave walls: any void cell touching carved space,
 * merged into horizontal runs so the builder can draw fewer meshes.
 * kind: 'rock' near the surface, 'alien' once the passage breaks through (r ≥ 17).
 */
function isWallCell(c, r) {
  if (isCarved(cellAt(c, r))) return false;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if ((dr || dc) && isCarved(cellAt(c + dc, r + dr))) return true;
    }
  }
  return false;
}

export function getMineWallRuns() {
  const runs = [];
  for (let r = 0; r < _activeMap.length; r++) {
    let start = -1;
    for (let c = 0; c <= _activeMap[r].length; c++) {
      if (c < _activeMap[r].length && isWallCell(c, r)) {
        if (start === -1) start = c;
      } else if (start !== -1) {
        const a = mineCellToWorld(start, r);
        const b = mineCellToWorld(c - 1, r);
        runs.push({
          cx: (a.x + b.x) / 2,
          cz: a.z,
          width: (c - start) * MINE_CELL,
          depth: MINE_CELL,
          kind: r >= 17 ? 'alien' : 'rock',
          row: r,
        });
        start = -1;
      }
    }
  }
  return runs;
}

/** Per-cell wall list for the GLB kit builder (collision still uses the merged runs). */
export function getMineWallCells() {
  const cells = [];
  for (let r = 0; r < _activeMap.length; r++) {
    for (let c = 0; c < _activeMap[r].length; c++) {
      if (!isWallCell(c, r)) continue;
      const { x, z } = mineCellToWorld(c, r);
      cells.push({ x, z, c, r, region: mineRegionForRow(r) });
    }
  }
  return cells;
}

/** Region band for a map row — drives kit palettes and floor tints. */
export function mineRegionForRow(r) {
  return r <= 4 ? 'entrance' : r <= 7 ? 'shaft' : r <= 16 ? 'cavern' : r <= 19 ? 'passage' : 'breach';
}

/**
 * Floor runs (open + ore cells — ore blocks stand on floor so mining reveals it),
 * merged per row. region drives the floor tint in the builder.
 */
export function getMineFloorRuns() {
  const runs = [];
  for (let r = 0; r < _activeMap.length; r++) {
    let start = -1;
    for (let c = 0; c <= _activeMap[r].length; c++) {
      if (c < _activeMap[r].length && isCarved(cellAt(c, r))) {
        if (start === -1) start = c;
      } else if (start !== -1) {
        const a = mineCellToWorld(start, r);
        const b = mineCellToWorld(c - 1, r);
        runs.push({
          cx: (a.x + b.x) / 2,
          cz: a.z,
          width: (c - start) * MINE_CELL,
          depth: MINE_CELL,
          region: mineRegionForRow(r),
        });
        start = -1;
      }
    }
  }
  return runs;
}
