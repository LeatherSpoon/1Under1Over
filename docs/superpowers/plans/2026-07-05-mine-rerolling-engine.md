# Mine Re-Rolling Engine (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Mine's static `MINE_MAP` with a seeded `generateMineMap(seed)` that stamps fixed reachable anchors and fills the connective cave procedurally, and add a delve lifecycle that re-rolls the cave each descent from Landing Site while persisting depleted blocks within a delve.

**Architecture:** The static ASCII map becomes a mutable "active map" that all existing layout getters read. A new `generator.js` produces a fresh 25×25 grid per seed (fixed anchor rooms + guaranteed corridors + seeded cave carve + seeded ore), validated by flood-fill. A new `MineDelveSystem` holds the current seed and the set of mined-out cells, re-rolling on descent from Landing Site and persisting through `SaveSystem`. This phase stays at the current 25×25 grid and current primitive rendering — the 10× scale-up, art kit, and smart collision are Phase 3 and are out of scope here.

**Tech Stack:** ES6 modules (no build step), `node:test` for unit tests, Three.js (untouched here), mulberry32 seeded RNG.

**Spec:** `docs/superpowers/specs/2026-07-05-mine-reimagining-design.md`

---

## File Structure

**Create:**
- `js/scene/zones/Mine/anchors.js` — fixed anchor rooms, guaranteed corridors, and the blank-grid/stamp/carve helpers. One responsibility: the parts of the map that must be identical and connected every generation.
- `js/scene/zones/Mine/generator.js` — `generateMineMap(seed)`: assembles anchors + corridors + seeded cave + seeded ore, validates reachability. One responsibility: turning a seed into a valid grid.
- `js/systems/MineDelveSystem.js` — delve state: current seed, mined-cell set, arm/re-roll, serialize/load.
- `tests/systems/mineGenerator.test.js` — determinism, dimensions, reachability across seeds.
- `tests/systems/mineDelveSystem.test.js` — delve state unit tests.
- `tests/systems/mineDelveSave.test.js` — save round-trip integration.
- `tests/systems/mineActiveMap.test.js` — the active-map indirection swaps getter output.

**Modify:**
- `js/scene/zones/Mine/layout.js` — introduce the mutable active map; getters read it; ore blocks expose their cell.
- `js/scene/zones/Mine/index.js` — `build()` sets the active map from the delve seed; ore build skips mined cells; cave-detail scatter reads the active map.
- `js/scene/Environment.js` — `drillRock()` fires an `onRockDepleted` callback when a block depletes.
- `js/zoneManager.js` — `createSwitchZone` runs the delve lifecycle (arm on Landing Site, re-roll on mine descent).
- `js/main.js` — instantiate `MineDelveSystem`, register it with `SaveSystem` and `createSwitchZone`, set `env._mineDelve` and `env.onRockDepleted`.
- `js/systems/SaveSystem.js` — serialize/deserialize the delve; bump `SAVE_VERSION`.
- `tests/runAll.test.js` — register the four new test files.

---

## Task 1: Active-map indirection in layout.js

The getters currently close over the static `MINE_MAP` const. Make them read a mutable module-level `_activeMap` that defaults to the current baseline, so behavior is unchanged until `setActiveMineMap` is called. Also expose each ore block's cell coordinates for depletion tracking.

**Files:**
- Modify: `js/scene/zones/Mine/layout.js`
- Test: `tests/systems/mineActiveMap.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/systems/mineActiveMap.test.js`:

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  setActiveMineMap,
  getActiveMineMap,
  getMineableWallBlocks,
} from '../../js/scene/zones/Mine/layout.js';

test('setActiveMineMap swaps the grid the getters read, then restores', () => {
  const baseline = getActiveMineMap();
  try {
    // A 3x3 grid with a single tier-1 ore block in the centre.
    setActiveMineMap(['   ', ' 1 ', '   ']);
    const blocks = getMineableWallBlocks();
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].cellC, 1);
    assert.equal(blocks[0].cellR, 1);
  } finally {
    setActiveMineMap(baseline);
  }
});

test('baseline active map exposes the original ore blocks', () => {
  const blocks = getMineableWallBlocks();
  assert.ok(blocks.length > 0, 'baseline map should contain ore blocks');
  assert.ok(blocks.every(b => typeof b.cellC === 'number' && typeof b.cellR === 'number'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/systems/mineActiveMap.test.js`
Expected: FAIL — `setActiveMineMap`/`getActiveMineMap` are not exported, and `cellC`/`cellR` are undefined.

- [ ] **Step 3: Edit layout.js — add the active-map binding**

In `js/scene/zones/Mine/layout.js`, keep the `export const MINE_MAP = [ ... ];` array exactly as-is (it stays the baseline and is still re-exported by `MineLayout.js`). Immediately AFTER the array's closing `];` (the line following `'                         ', // r24`), add:

```js
// The live grid the getters read. Defaults to the baseline; the generator swaps
// it in via setActiveMineMap() when a delve is (re)built.
let _activeMap = MINE_MAP;

export function setActiveMineMap(grid) { _activeMap = grid; }
export function getActiveMineMap() { return _activeMap; }
```

- [ ] **Step 4: Edit layout.js — point `cellAt` at the active map**

Replace:

```js
function cellAt(c, r) {
  if (r < 0 || r >= MINE_MAP.length || c < 0 || c >= MINE_MAP[r].length) return ' ';
  return MINE_MAP[r][c];
}
```

with:

```js
function cellAt(c, r) {
  if (r < 0 || r >= _activeMap.length || c < 0 || c >= _activeMap[r].length) return ' ';
  return _activeMap[r][c];
}
```

- [ ] **Step 5: Edit layout.js — ore blocks read the active map and expose their cell**

Replace the whole `getMineableWallBlocks` function with:

```js
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
```

- [ ] **Step 6: Edit layout.js — wall runs read the active map**

Replace the loop bounds in `getMineWallRuns`. Change:

```js
  const runs = [];
  for (let r = 0; r < MINE_MAP.length; r++) {
    let start = -1;
    for (let c = 0; c <= MINE_MAP[r].length; c++) {
      if (c < MINE_MAP[r].length && isWall(c, r)) {
```

to:

```js
  const runs = [];
  for (let r = 0; r < _activeMap.length; r++) {
    let start = -1;
    for (let c = 0; c <= _activeMap[r].length; c++) {
      if (c < _activeMap[r].length && isWall(c, r)) {
```

- [ ] **Step 7: Edit layout.js — floor runs read the active map**

Replace the loop bounds in `getMineFloorRuns`. Change:

```js
  const runs = [];
  for (let r = 0; r < MINE_MAP.length; r++) {
    let start = -1;
    for (let c = 0; c <= MINE_MAP[r].length; c++) {
      if (c < MINE_MAP[r].length && isCarved(cellAt(c, r))) {
```

to:

```js
  const runs = [];
  for (let r = 0; r < _activeMap.length; r++) {
    let start = -1;
    for (let c = 0; c <= _activeMap[r].length; c++) {
      if (c < _activeMap[r].length && isCarved(cellAt(c, r))) {
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `node --test tests/systems/mineActiveMap.test.js`
Expected: PASS (both tests).

- [ ] **Step 9: Run the existing mine layout test to confirm no regression**

Run: `node --test tests/mineLayout.test.js`
Expected: PASS — the default active map is the baseline, so every existing assertion holds.

- [ ] **Step 10: Syntax-check and commit**

Run: `node --check js/scene/zones/Mine/layout.js`
Expected: no output (valid).

```bash
git add js/scene/zones/Mine/layout.js tests/systems/mineActiveMap.test.js
git commit -m "feat(mine): make the layout getters read a swappable active map"
```

---

## Task 2: Fixed anchors and guaranteed corridors

The parts of the map that must never change: rooms around each portal/drill and L-shaped corridors that connect them. All coordinates are 25×25 cells.

**Files:**
- Create: `js/scene/zones/Mine/anchors.js`
- Test: `tests/systems/mineGenerator.test.js` (created here, extended in Task 3)

- [ ] **Step 1: Write the failing test**

Create `tests/systems/mineGenerator.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/systems/mineGenerator.test.js`
Expected: FAIL — `anchors.js` does not exist.

- [ ] **Step 3: Create anchors.js**

Create `js/scene/zones/Mine/anchors.js`:

```js
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/systems/mineGenerator.test.js`
Expected: PASS.

- [ ] **Step 5: Syntax-check and commit**

Run: `node --check js/scene/zones/Mine/anchors.js`
Expected: no output.

```bash
git add js/scene/zones/Mine/anchors.js tests/systems/mineGenerator.test.js
git commit -m "feat(mine): add fixed anchor rooms and guaranteed corridors"
```

---

## Task 3: The seeded generator

Assemble anchors + corridors + a seeded cave carve + seeded ore into a valid 25×25 grid. Ore only fills void cells adjacent to floor, so it can never wall off a portal; a flood-fill validates each result and a retry/fallback guarantees a valid map.

**Files:**
- Create: `js/scene/zones/Mine/generator.js`
- Test: `tests/systems/mineGenerator.test.js` (extend)

- [ ] **Step 1: Add the failing tests**

Append to `tests/systems/mineGenerator.test.js`:

```js
import { generateMineMap } from '../../js/scene/zones/Mine/generator.js';

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/systems/mineGenerator.test.js`
Expected: FAIL — `generator.js` does not exist.

- [ ] **Step 3: Create generator.js**

Create `js/scene/zones/Mine/generator.js`:

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/systems/mineGenerator.test.js`
Expected: PASS (all tests, including the 100-seed reachability sweep).

- [ ] **Step 5: Syntax-check and commit**

Run: `node --check js/scene/zones/Mine/generator.js`
Expected: no output.

```bash
git add js/scene/zones/Mine/generator.js tests/systems/mineGenerator.test.js
git commit -m "feat(mine): add seeded generateMineMap with reachability validation"
```

---

## Task 4: Register the generator test in the suite

**Files:**
- Modify: `tests/runAll.test.js`

- [ ] **Step 1: Add the import**

In `tests/runAll.test.js`, after the line:

```js
import './systems/idleProgressionSystems.test.js';
```

add:

```js
import './systems/mineActiveMap.test.js';
import './systems/mineGenerator.test.js';
```

- [ ] **Step 2: Run the whole suite**

Run: `npm test`
Expected: PASS — all existing tests plus the new active-map and generator tests.

- [ ] **Step 3: Commit**

```bash
git add tests/runAll.test.js
git commit -m "test(mine): register active-map and generator tests in the suite"
```

---

## Task 5: MineDelveSystem

Holds the current delve seed and the set of mined-out cells, arms/re-rolls, and serializes.

**Files:**
- Create: `js/systems/MineDelveSystem.js`
- Test: `tests/systems/mineDelveSystem.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/systems/mineDelveSystem.test.js`:

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MineDelveSystem } from '../../js/systems/MineDelveSystem.js';

test('recordMined / isMined track depleted cells', () => {
  const d = new MineDelveSystem();
  assert.equal(d.isMined(3, 4), false);
  d.recordMined(3, 4);
  assert.equal(d.isMined(3, 4), true);
});

test('startNewDelve clears mined cells and disarms', () => {
  const d = new MineDelveSystem();
  d.recordMined(3, 4);
  d.arm();
  assert.equal(d.armed, true);
  d.startNewDelve();
  assert.equal(d.isMined(3, 4), false);
  assert.equal(d.armed, false);
});

test('serialize / load round-trips seed and mined cells', () => {
  const d = new MineDelveSystem();
  d.load({ seed: 123, minedCells: ['4,5', '6,7'] });
  assert.equal(d.seed, 123);
  assert.equal(d.isMined(4, 5), true);
  assert.equal(d.isMined(6, 7), true);
  assert.deepEqual(d.serialize(), { seed: 123, minedCells: ['4,5', '6,7'] });
});

test('load resets armed to false', () => {
  const d = new MineDelveSystem();
  d.arm();
  d.load({ seed: 1, minedCells: [] });
  assert.equal(d.armed, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/systems/mineDelveSystem.test.js`
Expected: FAIL — `MineDelveSystem` does not exist.

- [ ] **Step 3: Create MineDelveSystem.js**

Create `js/systems/MineDelveSystem.js`:

```js
// Tracks the current Mine delve: the seed that generated this cave and which
// ore cells have been mined out. A delve re-rolls (fresh seed, cleared cells)
// only when the player descends into the Mine from Landing Site.
export class MineDelveSystem {
  constructor() {
    this._seed = (Math.random() * 0xffffffff) >>> 0;
    this._minedCells = new Set();
    this._armed = false;
  }

  get seed() { return this._seed; }
  get armed() { return this._armed; }

  // Surfacing arms the next descent to start a fresh delve.
  arm() { this._armed = true; }

  // Begin a fresh delve: new seed, no depleted blocks, disarmed.
  startNewDelve() {
    this._seed = (Math.random() * 0xffffffff) >>> 0;
    this._minedCells.clear();
    this._armed = false;
  }

  recordMined(c, r) { this._minedCells.add(`${c},${r}`); }
  isMined(c, r) { return this._minedCells.has(`${c},${r}`); }

  serialize() {
    return { seed: this._seed, minedCells: [...this._minedCells] };
  }

  load(data) {
    if (!data) return;
    this._seed = (data.seed ?? this._seed) >>> 0;
    this._minedCells = new Set(data.minedCells || []);
    this._armed = false;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/systems/mineDelveSystem.test.js`
Expected: PASS.

- [ ] **Step 5: Syntax-check and commit**

Run: `node --check js/systems/MineDelveSystem.js`
Expected: no output.

```bash
git add js/systems/MineDelveSystem.js tests/systems/mineDelveSystem.test.js
git commit -m "feat(mine): add MineDelveSystem for seed and depleted-cell state"
```

---

## Task 6: Persist the delve through SaveSystem

**Files:**
- Modify: `js/systems/SaveSystem.js`
- Test: `tests/systems/mineDelveSave.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/systems/mineDelveSave.test.js`:

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SaveSystem } from '../../js/systems/SaveSystem.js';
import { MineDelveSystem } from '../../js/systems/MineDelveSystem.js';

function minimalSystems(mineDelve) {
  return {
    pp: {
      ppTotal: 0, prestigeCount: 0, ppRate: 1, globalMultiplier: 1,
      _baseCap: 100, _capMultipliers: {}, ppCap: 100, _rateModifiers: {},
      setModifier() {},
      setBaseCap(v) { this._baseCap = v; this._recomputeCap(); },
      _recomputeCap() { this.ppCap = this._baseCap; },
    },
    stats: {
      statNames: [], stats: {},
      currentHP: 1, currentFP: 1, currentEnergy: 1, maxHP: 1, maxEnergy: 1,
    },
    inventory: { materials: {}, consumables: {}, tools: {}, storageItems: {}, equipmentBag: [] },
    pedometer: {
      totalSteps: 0, _ppBonusPerStep: 0, _ppBonusPurchases: 0, _nextBonusCost: 0,
      _trackCount: 0, _nextTrackCost: 0, _pendingTracks: 0, _placedTracks: [],
      _statStepPurchases: {}, _totalStatPurchases: 0, _nextStatCost: 0, _unlockedZones: new Set(),
    },
    drones: { drones: [], upgradeCost: 0, _missions: [], getMissions() { return []; } },
    equipment: { slots: {}, unequip() {}, equip() {} },
    gameStats: {
      enemiesDefeated: 0, defeats: 0, actionsTaken: 0, highestHit: 0,
      totalStepsTaken: 0, resourcesGathered: 0, _visitedZones: new Set(),
    },
    mineDelve,
  };
}

test('mine delve seed and mined cells survive a save round-trip', () => {
  const src = new MineDelveSystem();
  src.load({ seed: 4242, minedCells: ['3,4', '5,6'] });
  const save = new SaveSystem(minimalSystems(src));
  const data = save._buildSaveData('mine', 0, 0);
  assert.deepEqual(data.mineDelve, { seed: 4242, minedCells: ['3,4', '5,6'] });

  const dst = new MineDelveSystem();
  new SaveSystem(minimalSystems(dst)).apply(data);
  assert.equal(dst.seed, 4242);
  assert.equal(dst.isMined(3, 4), true);
  assert.equal(dst.isMined(5, 6), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/systems/mineDelveSave.test.js`
Expected: FAIL — `data.mineDelve` is `undefined`.

- [ ] **Step 3: Bump the save version**

In `js/systems/SaveSystem.js`, change:

```js
const SAVE_VERSION = 8;
```

to:

```js
const SAVE_VERSION = 9;
```

- [ ] **Step 4: Add `mineDelve` to the `_buildSaveData` destructure**

In `_buildSaveData`, change:

```js
      extractor, processingNodes, tripartite, bosses, expedition, challenges,
      neuralImplant,
    } = this.systems;
```

to:

```js
      extractor, processingNodes, tripartite, bosses, expedition, challenges,
      neuralImplant, mineDelve,
    } = this.systems;
```

- [ ] **Step 5: Serialize the delve into the save data**

In `_buildSaveData`, change:

```js
      neuralImplant: neuralImplant ? neuralImplant.serialize() : null,
    };
```

to:

```js
      neuralImplant: neuralImplant ? neuralImplant.serialize() : null,
      mineDelve:     mineDelve     ? mineDelve.serialize()     : null,
    };
```

- [ ] **Step 6: Add `mineDelve` to the `apply` destructure**

In `apply`, change:

```js
      extractor, processingNodes, tripartite, bosses, expedition, challenges,
      neuralImplant,
    } = this.systems;
```

to:

```js
      extractor, processingNodes, tripartite, bosses, expedition, challenges,
      neuralImplant, mineDelve,
    } = this.systems;
```

- [ ] **Step 7: Load the delve on apply**

In `apply`, change:

```js
    if (neuralImplant && data.neuralImplant) neuralImplant.deserialize(data.neuralImplant);
    // Legacy: migrate old taskSystem saves (no-op if not present)
```

to:

```js
    if (neuralImplant && data.neuralImplant) neuralImplant.deserialize(data.neuralImplant);
    if (mineDelve && data.mineDelve) mineDelve.load(data.mineDelve);
    // Legacy: migrate old taskSystem saves (no-op if not present)
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `node --test tests/systems/mineDelveSave.test.js`
Expected: PASS.

- [ ] **Step 9: Register the save test and run the full suite**

In `tests/runAll.test.js`, after the two imports added in Task 4, add:

```js
import './systems/mineDelveSystem.test.js';
import './systems/mineDelveSave.test.js';
```

Run: `npm test`
Expected: PASS — full suite green.

- [ ] **Step 10: Syntax-check and commit**

Run: `node --check js/systems/SaveSystem.js`
Expected: no output.

```bash
git add js/systems/SaveSystem.js tests/systems/mineDelveSave.test.js tests/runAll.test.js
git commit -m "feat(mine): persist delve seed and mined cells in SaveSystem (v9)"
```

---

## Task 7: Build the Mine from the delve seed

Set the active map from the delve seed at the top of `build()`, skip ore blocks whose cells are already mined out, and read the active map when scattering cave detail.

**Files:**
- Modify: `js/scene/zones/Mine/index.js`
- Verify: `node --check` + live preview (this file needs Three.js/the browser, so no Node unit test).

- [ ] **Step 1: Update the imports**

In `js/scene/zones/Mine/index.js`, change:

```js
import {
  MINE_MAP, mineCellToWorld, isMineFloorCell,
  MINE_ZONE_PORTALS, MINE_DRILL_POS,
  getMineableWallBlocks, getMineWallRuns, getMineFloorRuns,
} from './layout.js';
```

to:

```js
import {
  mineCellToWorld, isMineFloorCell,
  MINE_ZONE_PORTALS, MINE_DRILL_POS,
  getMineableWallBlocks, getMineWallRuns, getMineFloorRuns,
  setActiveMineMap, getActiveMineMap,
} from './layout.js';
import { generateMineMap } from './generator.js';
```

- [ ] **Step 2: Generate the active map at the start of `build()`**

In `build(env)`, change:

```js
export function build(env) {
  env._addGround(0x060504); // void — unbroken mountain rock
  const rng = seededRandom(54321);
```

to:

```js
export function build(env) {
  // Re-roll (or restore) the cave for this delve before reading any map data.
  const seed = env._mineDelve?.seed ?? 1;
  setActiveMineMap(generateMineMap(seed));

  env._addGround(0x060504); // void — unbroken mountain rock
  const rng = seededRandom(54321);
```

- [ ] **Step 3: Skip already-mined ore blocks in `_buildOreBlocks`**

In `_buildOreBlocks`, change:

```js
  for (const b of blocks) {
    const bw = 3.2;
```

to:

```js
  for (const b of blocks) {
    // Blocks mined out earlier in this delve stay depleted (open floor).
    if (env._mineDelve?.isMined(b.cellC, b.cellR)) continue;
    const bw = 3.2;
```

- [ ] **Step 4: Read the active map in `_scatterCaveDetail`**

In `_scatterCaveDetail`, change:

```js
  for (let r = 0; r < MINE_MAP.length; r++) {
    for (let c = 0; c < MINE_MAP[r].length; c++) {
      if (!isMineFloorCell(c, r)) continue;
```

to:

```js
  const map = getActiveMineMap();
  for (let r = 0; r < map.length; r++) {
    for (let c = 0; c < map[r].length; c++) {
      if (!isMineFloorCell(c, r)) continue;
```

- [ ] **Step 5: Syntax-check**

Run: `node --check js/scene/zones/Mine/index.js`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add js/scene/zones/Mine/index.js
git commit -m "feat(mine): build the cave from the delve seed and skip mined cells"
```

---

## Task 8: Fire a depletion callback from Environment

`drillRock` already flips `rock.alive = false` when a block runs out. Emit a callback there so the delve can record the mined cell.

**Files:**
- Modify: `js/scene/Environment.js`
- Verify: `node --check`.

- [ ] **Step 1: Add the callback in the depleted branch**

In `js/scene/Environment.js`, inside `drillRock`, change:

```js
    if (rock.richness <= 0) {
      // Depleted — remove block
      rock.alive = false;
      rock.mesh.visible = false;
      const idx = this._collisionCircles.indexOf(rock.collision);
      if (idx !== -1) this._collisionCircles.splice(idx, 1);
    } else {
```

to:

```js
    if (rock.richness <= 0) {
      // Depleted — remove block
      rock.alive = false;
      rock.mesh.visible = false;
      const idx = this._collisionCircles.indexOf(rock.collision);
      if (idx !== -1) this._collisionCircles.splice(idx, 1);
      if (this.onRockDepleted) this.onRockDepleted(rock);
    } else {
```

- [ ] **Step 2: Syntax-check and commit**

Run: `node --check js/scene/Environment.js`
Expected: no output.

```bash
git add js/scene/Environment.js
git commit -m "feat(mine): fire onRockDepleted when a block is mined out"
```

---

## Task 9: Wire the delve lifecycle in main.js and zoneManager.js

Instantiate the delve, register it with save and zone-switching, record mined cells, and re-roll on descent from Landing Site.

**Files:**
- Modify: `js/main.js`
- Modify: `js/zoneManager.js`
- Verify: `node --check` + live preview.

- [ ] **Step 1: Import the delve system and `mineWorldToCell` in main.js**

In `js/main.js`, change:

```js
import { MINE_BREACH_Z } from './scene/zones/Mine/layout.js';
```

to:

```js
import { MINE_BREACH_Z, mineWorldToCell } from './scene/zones/Mine/layout.js';
import { MineDelveSystem } from './systems/MineDelveSystem.js';
```

- [ ] **Step 2: Instantiate the delve before SaveSystem**

In `js/main.js`, immediately BEFORE the line:

```js
const saveSystem = new SaveSystem({
```

add:

```js
const mineDelve = new MineDelveSystem();
```

- [ ] **Step 3: Register the delve with SaveSystem**

In the `new SaveSystem({ ... })` object, change:

```js
  neuralImplant,
});
```

to:

```js
  neuralImplant,
  mineDelve,
});
```

- [ ] **Step 4: Give the environment a delve reference and a depletion hook**

In `js/main.js`, immediately BEFORE the line:

```js
const switchZone = createSwitchZone({
```

add:

```js
// The Mine builder reads the delve seed and mined cells; record depletions back.
env._mineDelve = mineDelve;
env.onRockDepleted = (rock) => {
  if (env.currentZone !== 'mine') return;
  const cell = mineWorldToCell(rock.x, rock.z);
  mineDelve.recordMined(cell.c, cell.r);
};
```

- [ ] **Step 5: Pass the delve into createSwitchZone**

In `js/main.js`, change:

```js
const switchZone = createSwitchZone({
  gameStats, sceneManager, env, player, entityManager, hud, pedometer, ppSystem,
  bossSystem,
```

to:

```js
const switchZone = createSwitchZone({
  gameStats, sceneManager, env, player, entityManager, hud, pedometer, ppSystem,
  bossSystem, mineDelve,
```

- [ ] **Step 6: Run the delve lifecycle in zoneManager.js**

In `js/zoneManager.js`, change:

```js
export function createSwitchZone({
  gameStats, sceneManager, env, player, entityManager, hud, pedometer, ppSystem,
  bossSystem = null,
  onAfterSwitch,
}) {
  return function switchZone(zoneName) {
    gameStats.recordZoneVisit(zoneName);
```

to:

```js
export function createSwitchZone({
  gameStats, sceneManager, env, player, entityManager, hud, pedometer, ppSystem,
  bossSystem = null,
  mineDelve = null,
  onAfterSwitch,
}) {
  return function switchZone(zoneName) {
    // Delve lifecycle: descending into the Mine from the surface re-rolls the
    // cave; surfacing arms the next descent. Entering the Mine from The Depths
    // keeps the same delve. This runs before env.switchZone so the builder sees
    // the correct seed.
    if (mineDelve) {
      if (zoneName === 'mine' && mineDelve.armed) mineDelve.startNewDelve();
      if (zoneName === 'landingSite') mineDelve.arm();
    }

    gameStats.recordZoneVisit(zoneName);
```

- [ ] **Step 7: Syntax-check both files**

Run: `node --check js/main.js`
Run: `node --check js/zoneManager.js`
Expected: no output for either.

- [ ] **Step 8: Run the full test suite**

Run: `npm test`
Expected: PASS — nothing in the pure-logic suite regressed.

- [ ] **Step 9: Commit**

```bash
git add js/main.js js/zoneManager.js
git commit -m "feat(mine): wire delve re-roll lifecycle and depletion recording"
```

---

## Task 10: Live-preview verification

The wiring in Tasks 7–9 runs only in the browser. Verify the delve behaves end to end. Follow the project's verify-entity workflow (raise the PP cap before teleporting so the zone-lock recall does not eject you).

**Files:** none (verification only).

- [ ] **Step 1: Serve and open the game**

Run: `start-node.bat` (serves http://localhost:8080). Open it in the preview.

- [ ] **Step 2: Enter the Mine and confirm it builds from a seed**

In the console:

```js
__debugSystems.ppSystem._baseCap = 50000;
__debugSystems.ppSystem.ppTotal = 20000;
__debugSwitchZone('landingSite');
__debugSwitchZone('mine');
console.log('seed A', __debugEnv._mineDelve.seed);
```

Expected: the Mine renders; a numeric seed prints. Walk to each portal (return, Depths, the three Breach gates) and the drill — all reachable.

- [ ] **Step 3: Confirm mined blocks persist within the delve**

Mine a block out (drill it to depletion), note its position, then leave to The Depths and come back UP to the Mine:

```js
__debugSwitchZone('depths');
__debugSwitchZone('mine');
console.log('seed B (should equal seed A)', __debugEnv._mineDelve.seed);
```

Expected: same seed as step 2; the block you mined is still gone (its cell is open floor, not refilled).

- [ ] **Step 4: Confirm surfacing re-rolls the cave**

```js
const seedBefore = __debugEnv._mineDelve.seed;
__debugSwitchZone('landingSite');
__debugSwitchZone('mine');
const seedAfter = __debugEnv._mineDelve.seed;
console.log('re-rolled?', seedBefore !== seedAfter, seedBefore, seedAfter);
```

Expected: `re-rolled? true` — a different seed, a visibly different cave, and previously-mined blocks are full again.

- [ ] **Step 5: Confirm the save round-trip restores the delve**

Mine a block, then save to a file (the in-game Save button) and reload it (Load button). Confirm you return to the same cave (same seed) with the mined block still depleted:

```js
console.log('seed after reload', __debugEnv._mineDelve.seed, 'mined cells', __debugEnv._mineDelve.serialize().minedCells.length);
```

Expected: seed matches the pre-save seed; `minedCells` includes the block you mined.

- [ ] **Step 6: Check the console for errors**

Expected: no uncaught errors during any of the zone switches or the save/load.

---

## Notes for the implementer

- **Scope guard:** this phase keeps the 25×25 grid and the current primitive box rendering. Do NOT scale the map or touch collision/rendering here — that is Phase 3.
- **Extractor interaction (flagged in the spec):** if the Refinery `ExtractorSystem` targets specific Mine ore nodes that now re-roll, verify it still behaves after a re-roll during Task 10. If it breaks, capture it as a follow-up task rather than expanding this plan.
- **Determinism depends on the seed only.** Do not introduce `Math.random()` inside `generateMineMap`, `carveCave`, or `placeOre` — all randomness must come from the passed `rng`.
