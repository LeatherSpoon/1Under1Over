# Generation Engine Round 1 — Buildable Computer Building (Era 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Era 1 (generations 1–4) of the Generation Engine: the player founds and grows the computer's building chunk-by-chunk anywhere valid in the Landing Site, walks inside from the first chunk, feeds material schematics to evolve the machine, all persisted (save v15) and test-guarded.

**Architecture:** A new `ComputerSystem` (Pedometer pending-pool pattern) owns `{ generation, plan, door, pendingChunks, delivered, slotChoices, colorId }`. A pure shell module (Labyrinth cell-map grammar) derives wall runs + collision chains + door gap from the plan; `Environment.buildComputerShell()` renders them into a dedicated group, rebuilt once per plan edit. The interior is one door zone (`computerCore`, HomeInteriors template) whose room and machine-fill props derive from the same plan + a generation data table (single source of truth). Placeholder toon-box art everywhere; the real ComputerKit is a later Blender round.

**Tech Stack:** Vanilla ES modules, Three.js toon materials, Node `node:test`.

**Read first:** `Plans/Generation-Engine-Site-Addendum.md` (v3 — wins conflicts), `Plans/Generation-Engine-Design.md`. Donor files named per task.

**Decisions already made (logged in `Plans/DESIGN-DECISIONS.md` by Task 0):** eligibility reads `ascension.ascensionCount` (NOT `prestigeCount` — that's PPSystem's offload counter); eligibility thresholds all 0 this round (schematic-only gating, owner tunes later); chunk grants 1/1/0/0 across gens 1–4 (Era-1 budget = 2 chunks); chunk lattice = centers at multiples of 6 world units (aligned to the 2-unit track grid); door defaults to the south (+z, camera-side) edge of the founding chunk, movable to any exterior edge; a chunk is removable only if the plan stays connected and it isn't the door chunk (move the door first) and it isn't the last chunk; interior zone key `computerCore` with codex lore id `computerCore`; panel is a new menu-bar tab `CORE`, visible from boot; evolution beat = flash + toast this round (drone swarm later); ground cover (collisionless scatter) under a new chunk is cleared at shell build — trees and anything with collision block placement instead.

---

### Task 0: Log design decisions

**Files:**
- Create or append: `Plans/DESIGN-DECISIONS.md`

- [ ] **Step 1: Append the round's decisions**

Append this section (create the file with just this section if absent):

```markdown
## 2026-08-02 — Generation Engine Round 1 (coding session calls)

- **Eligibility property:** the addendum names `ascension.prestigeCount`; the real recompile counter is `AscensionSystem.ascensionCount` (js/systems/AscensionSystem.js:38 — "recompile count (legacy name kept)"). `prestigeCount` is PPSystem's offload counter. ComputerSystem reads `ascensionCount` via callback.
- **Eligibility thresholds:** stubbed to 0 for gens 2–4 (data-table field `eligibility`, owner tunes later). Round 1 gating is schematic-only.
- **Chunk grants:** gen 1→1 (founding), gen 2→1, gens 3–4→0. Matches the addendum's Era-1 cumulative budget of 2 chunks; "every evolution includes a placement moment" starts at Era 2.
- **Chunk lattice:** chunk centers at world coords ≡ 0 (mod 6); a 6×6 chunk covers a 3×3 block of 2-unit track cells exactly.
- **Door:** record `{ cx, cz, side }`, side ∈ N/E/S/W, must be an exterior edge. Defaults to 'S' (+z, camera side) of the founding chunk. Movable in the panel's DOOR mode.
- **Reclaim rule:** remove allowed only if plan stays connected, chunk isn't the door chunk, and isn't the last chunk. (Addendum open question resolved: fill is area-fraction this round, so "empty chunks only" isn't expressible; connectivity + door is the enforceable rule.)
- **Interior:** zone `computerCore`, one room (a `floors` field rides the data table for the Era-4 answer), codex lore `computerCore`.
- **Panel entry:** new menu-bar tab CORE (`computer-panel`), ungated this round.
- **Evolution beat:** zone-fade flash + toast. Drone-swarm beat deferred.
- **Scatter under chunks:** collisionless ground cover inside the plan is removed at shell build; trees/collision circles make a cell invalid instead.
- **Schematic material keys:** reuse keys proven in TrainingAreaSystem.UPGRADE_COSTS (iron, stone, fiber, quartz, steel_ingot, mechanical_servo) — guarded by test.
```

- [ ] **Step 2: Commit**

```bash
git add Plans/DESIGN-DECISIONS.md
git commit -m "docs: log Generation Engine round-1 design calls"
```

---

### Task 1: Generation data table

**Files:**
- Create: `js/systems/computerGenerations.js`
- Test: `tests/systems/computerGenerations.test.js`
- Modify: `tests/runAll.test.js` (add import)

- [ ] **Step 1: Write the failing test**

```js
// tests/systems/computerGenerations.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GENERATIONS, CHUNK, chunkKey, worldToChunk, chunkToWorld }
  from '../../js/systems/computerGenerations.js';

test('table covers gens 1-4 contiguously with era-1 invariants', () => {
  assert.equal(GENERATIONS.length, 4);
  GENERATIONS.forEach((row, i) => {
    assert.equal(row.gen, i + 1);
    assert.equal(row.era, 1);
    assert.equal(row.storyHeight, 3);
    assert.equal(typeof row.fillFraction, 'number');
    assert.ok(row.fillFraction > 0 && row.fillFraction <= 0.95);
    assert.equal(typeof row.eligibility, 'number');
  });
  // Era-1 cumulative budget is 2 chunks (addendum §4)
  const total = GENERATIONS.reduce((s, r) => s + r.chunkGrant, 0);
  assert.equal(total, 2);
  // Gen 1 has no schematic (it's the founding), 2-4 do
  assert.equal(GENERATIONS[0].schematic, null);
  for (const r of GENERATIONS.slice(1)) assert.ok(r.schematic && Object.keys(r.schematic).length > 0);
});

test('schematic material keys are proven inventory keys', () => {
  // Keys proven in TrainingAreaSystem.UPGRADE_COSTS — the recipe economy donors.
  const KNOWN = new Set(['iron', 'stone', 'fiber', 'quartz', 'steel_ingot', 'mechanical_servo']);
  for (const r of GENERATIONS.slice(1)) {
    for (const k of Object.keys(r.schematic)) assert.ok(KNOWN.has(k), `unknown material ${k}`);
  }
});

test('chunk grid math round-trips on the 6-unit lattice', () => {
  assert.equal(CHUNK, 6);
  assert.deepEqual(chunkToWorld(2, -1), [12, -6]);
  assert.deepEqual(worldToChunk(13.4, -5.2), [2, -1]);
  assert.equal(chunkKey(2, -1), '2,-1');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/systems/computerGenerations.test.js`
Expected: FAIL (module not found)

- [ ] **Step 3: Write the module**

```js
// js/systems/computerGenerations.js
/**
 * Generation Engine — the single source of truth for the computer's growth.
 * Zone builder, shell generation, interior dressing, door record, and
 * ComputerSystem all read this table + the player's plan; no coordinate or
 * pacing number lives in two files (addendum §5.1).
 *
 * Round 1 ships Era 1 only. Later eras append rows; `floors`, `kitSet`,
 * `slotVariants`, `provenancePalette` are carried now so era rounds are data
 * changes. Eligibility thresholds are stubbed to 0 (owner tunes; see
 * Plans/DESIGN-DECISIONS.md 2026-08-02).
 */

export const CHUNK = 6;           // world units per chunk = 3×3 track cells on the 2-unit grid

export const chunkKey = (cx, cz) => `${cx},${cz}`;
export const worldToChunk = (x, z) => [Math.round(x / CHUNK), Math.round(z / CHUNK)];
export const chunkToWorld = (cx, cz) => [cx * CHUNK, cz * CHUNK];

export const GENERATIONS = [
  { gen: 1, era: 1, chunkGrant: 1, fillFraction: 0.15, interiorSet: 'fieldTerminal',
    storyHeight: 3, floors: 1, kitSet: 'placeholder', eligibility: 0, schematic: null },
  { gen: 2, era: 1, chunkGrant: 1, fillFraction: 0.40, interiorSet: 'missionServers',
    storyHeight: 3, floors: 1, kitSet: 'placeholder', eligibility: 0,
    schematic: { iron: 20, stone: 15 } },
  { gen: 3, era: 1, chunkGrant: 0, fillFraction: 0.70, interiorSet: 'integrationBench',
    storyHeight: 3, floors: 1, kitSet: 'placeholder', eligibility: 0,
    schematic: { steel_ingot: 4, iron: 30, fiber: 10 } },
  { gen: 4, era: 1, chunkGrant: 0, fillFraction: 0.95, interiorSet: 'expeditionRack',
    storyHeight: 3, floors: 1, kitSet: 'placeholder', eligibility: 0,
    schematic: { mechanical_servo: 2, steel_ingot: 8, quartz: 6 } },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/systems/computerGenerations.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Register in runAll and commit**

Add to `tests/runAll.test.js` (alphabetical-ish, near the other systems imports):
```js
import './systems/computerGenerations.test.js';
```

```bash
git add js/systems/computerGenerations.js tests/systems/computerGenerations.test.js tests/runAll.test.js
git commit -m "feat: generation data table for the Generation Engine (era 1)"
```

---

### Task 2: ComputerSystem — plan, door, schematic, evolve

**Files:**
- Create: `js/systems/ComputerSystem.js`
- Test: `tests/systems/computerSystem.test.js`
- Modify: `tests/runAll.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// tests/systems/computerSystem.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ComputerSystem } from '../../js/systems/ComputerSystem.js';

function makeInv(mats = {}) {
  return {
    materials: { ...mats },
    removeMaterial(k, q) { this.materials[k] = (this.materials[k] || 0) - q; },
  };
}
function make(mats) {
  const c = new ComputerSystem(makeInv(mats));
  c.isCellValid = () => true; // world mask injected in main.js; tests stub it
  return c;
}

test('founding: first chunk anywhere valid, door defaults to its south edge', () => {
  const c = make();
  assert.equal(c.pendingChunks, 1);
  assert.ok(c.canPlace(2, -1));
  assert.ok(c.place(2, -1));
  assert.equal(c.pendingChunks, 0);
  assert.deepEqual(c.door, { cx: 2, cz: -1, side: 'S' });
  assert.deepEqual(c.doorWorld(), [12, -3]); // chunk center (12,-6), south edge +3
});

test('adjacency: second chunk must share an edge; validity mask consulted', () => {
  const c = make();
  c.place(0, 0);
  c.pendingChunks = 1;
  assert.ok(!c.canPlace(2, 2), 'diagonal is not adjacent');
  assert.ok(!c.canPlace(0, 0), 'occupied');
  assert.ok(c.canPlace(1, 0));
  c.isCellValid = () => false;
  assert.ok(!c.canPlace(1, 0), 'world mask can veto');
});

test('remove: keeps connectivity, spares the door chunk and the last chunk', () => {
  const c = make();
  c.place(0, 0); c.pendingChunks = 2; c.place(1, 0); c.place(2, 0);
  assert.ok(!c.canRemove(1, 0), 'removing the middle disconnects');
  assert.ok(!c.canRemove(0, 0), 'door chunk protected');
  assert.ok(c.canRemove(2, 0));
  assert.ok(c.remove(2, 0));
  assert.equal(c.pendingChunks, 1, 'removed chunk returns to pending');
  c.remove(1, 0);
  assert.ok(!c.canRemove(0, 0), 'last chunk never removable');
});

test('door: only exterior edges accept it', () => {
  const c = make();
  c.place(0, 0); c.pendingChunks = 1; c.place(1, 0);
  assert.ok(!c.canSetDoor(0, 0, 'E'), 'edge shared with (1,0) is interior');
  assert.ok(c.canSetDoor(1, 0, 'E'));
  assert.ok(c.setDoor(1, 0, 'E'));
  assert.deepEqual(c.doorWorld(), [9, 0]);
});

test('schematic delivery consumes inventory and evolve advances + grants', () => {
  const c = make({ iron: 50, stone: 50 });
  c.place(0, 0);
  assert.equal(c.generation, 1);
  assert.deepEqual(c.remaining(), { iron: 20, stone: 15 }); // gen-2 schematic
  c.deliver('iron', 12);
  assert.equal(c.inventory.materials.iron, 38);
  assert.deepEqual(c.remaining(), { iron: 8, stone: 15 });
  c.deliver('iron', 999);                       // clamps to remaining AND held
  assert.equal(c.inventory.materials.iron, 30);
  assert.ok(!c.canEvolve());
  c.deliver('stone', 15);
  assert.ok(c.canEvolve());
  assert.ok(c.evolve());
  assert.equal(c.generation, 2);
  assert.equal(c.pendingChunks, 1, 'gen-2 grant');
  assert.deepEqual(c.delivered, {}, 'checklist resets');
});

test('eligibility gate reads the recompile count callback', () => {
  const c = make({ iron: 99, stone: 99 });
  c.place(0, 0);
  c.deliver('iron', 20); c.deliver('stone', 15);
  c.getAscensionCount = () => 0;
  // thresholds are 0 this round, so still eligible; force one to prove the gate
  const row = c.nextRow();
  const saved = row.eligibility;
  row.eligibility = 3;
  assert.ok(!c.canEvolve(), 'recompiles below threshold block evolve');
  c.getAscensionCount = () => 3;
  assert.ok(c.canEvolve());
  row.eligibility = saved;
});

test('serialize/deserialize round-trips; deserialize(null) is the fresh state', () => {
  const a = make({ iron: 99 });
  a.place(0, 0); a.pendingChunks = 1; a.place(0, 1);
  a.setDoor(0, 1, 'S');
  a.deliver('iron', 5);
  const b = make();
  b.deserialize(a.serialize());
  assert.equal(b.generation, 1);
  assert.deepEqual([...b.plan].sort(), ['0,0', '0,1']);
  assert.deepEqual(b.door, { cx: 0, cz: 1, side: 'S' });
  assert.deepEqual(b.delivered, { iron: 5 });
  const fresh = make();
  fresh.deserialize(null); // pre-v15 save
  assert.equal(fresh.plan.size, 0);
  assert.equal(fresh.pendingChunks, 1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/systems/computerSystem.test.js`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement ComputerSystem**

```js
// js/systems/ComputerSystem.js
import { GENERATIONS, CHUNK, chunkKey, chunkToWorld } from './computerGenerations.js';

/**
 * The Generation Engine's run-time state: the player-built plan (a set of
 * chunk cells on the 6-unit lattice), the door edge, the pending-chunk pool
 * (Pedometer pattern), and the schematic delivery checklist. Pure state —
 * rendering reads it (Environment.buildComputerShell), the world validity
 * mask and the recompile count are injected callbacks so this file stays
 * Node-testable.
 */

const DIRS = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };

function isConnected(plan) {
  if (plan.size === 0) return true;
  const [first] = plan;
  const seen = new Set([first]);
  const queue = [first];
  while (queue.length) {
    const [cx, cz] = queue.pop().split(',').map(Number);
    for (const [dx, dz] of Object.values(DIRS)) {
      const k = chunkKey(cx + dx, cz + dz);
      if (plan.has(k) && !seen.has(k)) { seen.add(k); queue.push(k); }
    }
  }
  return seen.size === plan.size;
}

export class ComputerSystem {
  constructor(inventorySystem) {
    this.inventory = inventorySystem;
    this.generation = 1;
    this.plan = new Set();          // 'cx,cz'
    this.door = null;               // { cx, cz, side }
    this.pendingChunks = GENERATIONS[0].chunkGrant;
    this.delivered = {};            // material → qty toward the next schematic
    this.slotChoices = {};          // reserved: module-slot variants (later round)
    this.colorId = 0;               // reserved: color variants (later round)
    this.onPlanChanged = null;      // wired in main.js → shell rebuild + HUD refresh
    this.getAscensionCount = () => 0; // ascension.ascensionCount (NOT pp.prestigeCount)
    this.isCellValid = () => true;  // world keep-out mask, injected in main.js
  }

  row() { return GENERATIONS[this.generation - 1]; }
  nextRow() { return GENERATIONS[this.generation] || null; }
  hasFounded() { return this.plan.size > 0; }

  // ── Plan ────────────────────────────────────────────────────────────────
  _adjacent(cx, cz) {
    return Object.values(DIRS).some(([dx, dz]) => this.plan.has(chunkKey(cx + dx, cz + dz)));
  }

  canPlace(cx, cz) {
    if (this.pendingChunks <= 0) return false;
    if (this.plan.has(chunkKey(cx, cz))) return false;
    if (this.hasFounded() && !this._adjacent(cx, cz)) return false;
    return this.isCellValid(cx, cz);
  }

  place(cx, cz) {
    if (!this.canPlace(cx, cz)) return false;
    this.plan.add(chunkKey(cx, cz));
    this.pendingChunks--;
    if (!this.door) this.door = { cx, cz, side: 'S' }; // camera-side default
    this.onPlanChanged?.();
    return true;
  }

  canRemove(cx, cz) {
    const key = chunkKey(cx, cz);
    if (!this.plan.has(key)) return false;
    if (this.plan.size <= 1) return false;                          // never un-found
    if (this.door && chunkKey(this.door.cx, this.door.cz) === key) return false;
    const rest = new Set(this.plan);
    rest.delete(key);
    return isConnected(rest);
  }

  remove(cx, cz) {
    if (!this.canRemove(cx, cz)) return false;
    this.plan.delete(chunkKey(cx, cz));
    this.pendingChunks++;
    this.onPlanChanged?.();
    return true;
  }

  // ── Door ────────────────────────────────────────────────────────────────
  isExteriorEdge(cx, cz, side) {
    if (!this.plan.has(chunkKey(cx, cz))) return false;
    const [dx, dz] = DIRS[side];
    return !this.plan.has(chunkKey(cx + dx, cz + dz));
  }

  canSetDoor(cx, cz, side) { return this.isExteriorEdge(cx, cz, side); }

  setDoor(cx, cz, side) {
    if (!this.canSetDoor(cx, cz, side)) return false;
    this.door = { cx, cz, side };
    this.onPlanChanged?.();
    return true;
  }

  /** Door edge midpoint in world units. */
  doorWorld() {
    const { cx, cz, side } = this.door;
    const [x, z] = chunkToWorld(cx, cz);
    const [dx, dz] = DIRS[side];
    return [x + dx * (CHUNK / 2), z + dz * (CHUNK / 2)];
  }

  /** Point 1.5 units outside the door — spawnOverride for leaving the interior. */
  doorOutside() {
    const [x, z] = this.doorWorld();
    const [dx, dz] = DIRS[this.door.side];
    return [x + dx * 1.5, z + dz * 1.5];
  }

  /** Point 1.5 units inside the door — spawnOverride for entering. */
  doorInside() {
    const [x, z] = this.doorWorld();
    const [dx, dz] = DIRS[this.door.side];
    return [x - dx * 1.5, z - dz * 1.5];
  }

  // ── Schematic / evolve ──────────────────────────────────────────────────
  schematic() { return this.nextRow()?.schematic || null; }

  remaining() {
    const s = this.schematic();
    if (!s) return null;
    const out = {};
    for (const [k, q] of Object.entries(s)) {
      const left = q - (this.delivered[k] || 0);
      if (left > 0) out[k] = left;
    }
    return out;
  }

  deliver(mat, qty) {
    const rem = this.remaining();
    if (!rem || !rem[mat]) return 0;
    const held = this.inventory.materials[mat] || 0;
    const n = Math.min(qty, rem[mat], held);
    if (n <= 0) return 0;
    this.inventory.removeMaterial(mat, n);
    this.delivered[mat] = (this.delivered[mat] || 0) + n;
    return n;
  }

  eligible() {
    const n = this.nextRow();
    return !!n && this.getAscensionCount() >= n.eligibility;
  }

  schematicComplete() {
    const rem = this.remaining();
    return rem !== null && Object.keys(rem).length === 0;
  }

  canEvolve() { return this.hasFounded() && this.eligible() && this.schematicComplete(); }

  evolve() {
    if (!this.canEvolve()) return false;
    this.generation++;
    this.pendingChunks += this.row().chunkGrant;
    this.delivered = {};
    this.onPlanChanged?.();
    return true;
  }

  // ── Save ────────────────────────────────────────────────────────────────
  serialize() {
    return {
      generation: this.generation,
      plan: [...this.plan],
      door: this.door ? { ...this.door } : null,
      pendingChunks: this.pendingChunks,
      delivered: { ...this.delivered },
      slotChoices: { ...this.slotChoices },
      colorId: this.colorId,
    };
  }

  deserialize(data) {
    if (!data) return; // pre-v15 save — fresh state stands
    this.generation = data.generation || 1;
    this.plan = new Set(data.plan || []);
    this.door = data.door ? { ...data.door } : null;
    this.pendingChunks = data.pendingChunks ?? 0;
    this.delivered = { ...(data.delivered || {}) };
    this.slotChoices = { ...(data.slotChoices || {}) };
    this.colorId = data.colorId || 0;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/systems/computerSystem.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: Register + commit**

Add `import './systems/computerSystem.test.js';` to `tests/runAll.test.js`.

```bash
git add js/systems/ComputerSystem.js tests/systems/computerSystem.test.js tests/runAll.test.js
git commit -m "feat: ComputerSystem — plan/door/schematic/evolve state"
```

---

### Task 3: Shell geometry module (plan → walls, collision, door gap)

**Files:**
- Create: `js/scene/zones/ComputerBuilding/shell.js`
- Test: `tests/systems/computerShell.test.js`
- Modify: `tests/runAll.test.js`

Pure functions only — no THREE imports — mirroring `js/scene/zones/Labyrinth/layout.js`'s generate-then-test grammar. Consumed by both the exterior (Environment) and the interior zone builder.

- [ ] **Step 1: Write the failing tests** (labyrinthLayout.test.js is the template)

```js
// tests/systems/computerShell.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { exteriorEdges, wallRuns, shellCollisionCircles, DOOR_GAP }
  from '../../js/scene/zones/ComputerBuilding/shell.js';

const plan = new Set(['0,0', '1,0', '1,1']);   // an L
const door = { cx: 0, cz: 0, side: 'S' };

test('exterior edges: every plan chunk edge not shared with a neighbor', () => {
  const edges = exteriorEdges(plan);
  // L of 3 chunks: 12 chunk edges total, 2 shared pairs → 8 exterior
  assert.equal(edges.length, 8);
  for (const e of edges) {
    assert.ok(plan.has(`${e.cx},${e.cz}`));
    const [dx, dz] = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[e.side];
    assert.ok(!plan.has(`${e.cx + dx},${e.cz + dz}`), 'edge must not face a neighbor');
  }
});

test('wall runs merge collinear edges and carry the door gap', () => {
  const runs = wallRuns(plan, door);
  // Every run is axis-aligned with positive length
  for (const r of runs) {
    assert.ok((r.x1 === r.x2) !== (r.z1 === r.z2), 'axis-aligned');
  }
  // The door edge's run is split: a gap of DOOR_GAP centered at (0, 3)
  const southRuns = runs.filter(r => r.z1 === 3 && r.z2 === 3);
  const covered = southRuns.reduce((s, r) => s + Math.abs(r.x2 - r.x1), 0);
  // south face of (0,0) is x -3..3 (6 long) minus the gap
  assert.ok(Math.abs(covered - (6 - DOOR_GAP)) < 1e-9,
    `south face covers ${covered}, expected ${6 - DOOR_GAP}`);
});

test('collision covers every exterior edge, passable only at the door', () => {
  const circles = shellCollisionCircles(plan, door);
  const PLAYER_R = 0.35;
  // (a) no circle sits inside the plan interior beyond the wall line
  // (b) walk probe: step along each exterior edge line at 0.15; every point
  //     is blocked (within r + PLAYER_R of a circle) except the door span
  const [doorX, doorZ] = [0, 3];
  for (const e of exteriorEdges(plan)) {
    const horiz = e.side === 'N' || e.side === 'S';
    for (let t = -2.85; t <= 2.85; t += 0.15) {
      const px = horiz ? e.x + t : e.x;
      const pz = horiz ? e.z : e.z + t;
      const inDoor = Math.hypot(px - doorX, pz - doorZ) < DOOR_GAP / 2;
      const blocked = circles.some(c => Math.hypot(px - c.x, pz - c.z) < c.r + PLAYER_R);
      if (inDoor) assert.ok(!blocked, `door span blocked at ${px},${pz}`);
      else assert.ok(blocked, `wall gap at ${px},${pz} on ${e.cx},${e.cz} ${e.side}`);
    }
  }
});

test('door reachable from open ground (flood fill at chunk level)', () => {
  // The plan is connected (ComputerSystem guarantees it); here we assert the
  // door edge is exterior so the outside walk-in can always reach it.
  const [dx, dz] = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[door.side];
  assert.ok(!plan.has(`${door.cx + dx},${door.cz + dz}`), 'door faces open ground');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/systems/computerShell.test.js`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement the shell module**

```js
// js/scene/zones/ComputerBuilding/shell.js
import { CHUNK, chunkKey, chunkToWorld } from '../../../systems/computerGenerations.js';

/**
 * Plan → shell geometry, pure data (Labyrinth layout.js grammar): exterior
 * edges, merged wall runs with the door gap, and collision circle chains
 * along the wall lines. Rendering (Environment.buildComputerShell) and the
 * interior builder both consume these; tests probe them directly.
 */

export const DOOR_GAP = 2.2;      // walkable door width in the wall run
const DIRS = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };

/** Every chunk edge not shared with a plan neighbor. {cx,cz,side,x,z} — x,z = edge midpoint. */
export function exteriorEdges(plan) {
  const out = [];
  for (const key of plan) {
    const [cx, cz] = key.split(',').map(Number);
    const [wx, wz] = chunkToWorld(cx, cz);
    for (const [side, [dx, dz]] of Object.entries(DIRS)) {
      if (plan.has(chunkKey(cx + dx, cz + dz))) continue;
      out.push({ cx, cz, side, x: wx + dx * (CHUNK / 2), z: wz + dz * (CHUNK / 2) });
    }
  }
  return out;
}

/**
 * Merge collinear exterior edges into runs {x1,z1,x2,z2}, then cut the door
 * gap (DOOR_GAP centered on the door edge midpoint) out of its run.
 */
export function wallRuns(plan, door) {
  const edges = exteriorEdges(plan);
  const segs = [];
  for (const e of edges) {
    const horiz = e.side === 'N' || e.side === 'S';
    segs.push(horiz
      ? { x1: e.x - CHUNK / 2, z1: e.z, x2: e.x + CHUNK / 2, z2: e.z, line: `z${e.z}` }
      : { x1: e.x, z1: e.z - CHUNK / 2, x2: e.x, z2: e.z + CHUNK / 2, line: `x${e.x}` });
  }
  // merge collinear touching segments (Mine merged-run convention, perf)
  const byLine = new Map();
  for (const s of segs) {
    if (!byLine.has(s.line)) byLine.set(s.line, []);
    byLine.get(s.line).push(s);
  }
  const merged = [];
  for (const [line, list] of byLine) {
    const horiz = line[0] === 'z';
    list.sort((a, b) => horiz ? a.x1 - b.x1 : a.z1 - b.z1);
    let cur = { ...list[0] };
    for (const s of list.slice(1)) {
      const touches = horiz ? Math.abs(s.x1 - cur.x2) < 1e-9 : Math.abs(s.z1 - cur.z2) < 1e-9;
      if (touches) { cur.x2 = s.x2; cur.z2 = s.z2; }
      else { merged.push(cur); cur = { ...s }; }
    }
    merged.push(cur);
  }
  if (!door) return merged;
  // cut the door gap out of whichever run contains the door midpoint
  const [dwx, dwz] = doorMid(door);
  const out = [];
  for (const r of merged) {
    const horiz = r.z1 === r.z2;
    const onLine = horiz ? Math.abs(r.z1 - dwz) < 1e-9 : Math.abs(r.x1 - dwx) < 1e-9;
    const t = horiz ? dwx : dwz;
    const lo = horiz ? Math.min(r.x1, r.x2) : Math.min(r.z1, r.z2);
    const hi = horiz ? Math.max(r.x1, r.x2) : Math.max(r.z1, r.z2);
    if (!onLine || t < lo || t > hi) { out.push(r); continue; }
    const g = DOOR_GAP / 2;
    if (t - g > lo) out.push(horiz
      ? { x1: lo, z1: r.z1, x2: t - g, z2: r.z1 }
      : { x1: r.x1, z1: lo, x2: r.x1, z2: t - g });
    if (t + g < hi) out.push(horiz
      ? { x1: t + g, z1: r.z1, x2: hi, z2: r.z1 }
      : { x1: r.x1, z1: t + g, x2: r.x1, z2: hi });
  }
  return out;
}

function doorMid(door) {
  const [wx, wz] = chunkToWorld(door.cx, door.cz);
  const [dx, dz] = DIRS[door.side];
  return [wx + dx * (CHUNK / 2), wz + dz * (CHUNK / 2)];
}

/**
 * Collision — circle chains along the (door-cut) wall runs. r 0.7 at ≤1.5
 * spacing: gap-free for PLAYER_R 0.35 (needs gap > 2·(0.7+0.35) = 2.1), the
 * Labyrinth numbers. Chains start/end half a step inside each run end so the
 * door span stays walkable.
 */
export function shellCollisionCircles(plan, door) {
  const out = [];
  for (const r of wallRuns(plan, door)) {
    const horiz = r.z1 === r.z2;
    const len = horiz ? Math.abs(r.x2 - r.x1) : Math.abs(r.z2 - r.z1);
    const n = Math.max(1, Math.ceil(len / 1.4));
    for (let i = 0; i <= n; i++) {
      const t = len === 0 ? 0 : (i / n) * len;
      out.push(horiz
        ? { x: Math.min(r.x1, r.x2) + t, z: r.z1, r: 0.7 }
        : { x: r.x1, z: Math.min(r.z1, r.z2) + t, r: 0.7 });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test tests/systems/computerShell.test.js`
Expected: PASS (4 tests). If the walk-probe test fails at run ends, tighten circle spacing (the `1.4` divisor) rather than loosening the probe.

- [ ] **Step 5: Register + commit**

Add `import './systems/computerShell.test.js';` to `tests/runAll.test.js`.

```bash
git add js/scene/zones/ComputerBuilding/shell.js tests/systems/computerShell.test.js tests/runAll.test.js
git commit -m "feat: plan-to-shell geometry (wall runs, door gap, collision chains)"
```

---

### Task 4: SaveSystem wiring (v15) + through-save test

**Files:**
- Modify: `js/systems/SaveSystem.js` (version at :3, destructures at :14-22 and :216-224, write map near :133-137, read block near :363-370)
- Test: `tests/systems/computerSave.test.js` (template: `tests/systems/mineDelveSave.test.js`)
- Modify: `tests/runAll.test.js`

- [ ] **Step 1: Bump version and wire**

In `js/systems/SaveSystem.js`:
1. `const SAVE_VERSION = 14;` → `const SAVE_VERSION = 15;`
2. Add `computer,` to BOTH destructures (after `compute,`).
3. In the save-data object (after the `compute:` line):
```js
      computer:      computer      ? computer.serialize()      : null,
```
4. In `apply()`'s read block (after the compute line):
```js
    // Generation Engine (v15). Pre-v15 saves have no computer blob —
    // deserialize(null) keeps the fresh unfounded state (gen 1, 1 pending chunk).
    if (computer) computer.deserialize(data.computer ?? null);
```

- [ ] **Step 2: Write the through-save test**

Copy `tests/systems/mineDelveSave.test.js`'s `minimalSystems()` helper verbatim into a new `tests/systems/computerSave.test.js`, add `computer` to the returned bag, and:

```js
// tests/systems/computerSave.test.js  (imports + minimalSystems as in mineDelveSave.test.js,
// with `computer` added to the bag: minimalSystems(mineDelveStub, computer))
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SaveSystem } from '../../js/systems/SaveSystem.js';
import { ComputerSystem } from '../../js/systems/ComputerSystem.js';
// ... minimalSystems(computer) — copy from mineDelveSave.test.js, add `computer` key,
// keep the pedometer/pp/stats stubs exactly as that file has them, mineDelve omitted (optional in bag)

test('computer plan, door and checklist survive a save round-trip', () => {
  const src = new ComputerSystem({ materials: { iron: 30 }, removeMaterial() {} });
  src.isCellValid = () => true;
  src.place(2, -1); src.pendingChunks = 1; src.place(2, 0);
  src.setDoor(2, 0, 'S');
  src.delivered = { iron: 5 };
  const save = new SaveSystem(minimalSystems(src));
  const data = save._buildSaveData('landingSite', 0, 0);
  assert.equal(data.version, 15);
  assert.deepEqual(data.computer.plan.sort(), ['2,-1', '2,0']);

  const dst = new ComputerSystem({ materials: {}, removeMaterial() {} });
  new SaveSystem(minimalSystems(dst)).apply(data);
  assert.deepEqual([...dst.plan].sort(), ['2,-1', '2,0']);
  assert.deepEqual(dst.door, { cx: 2, cz: 0, side: 'S' });
  assert.deepEqual(dst.delivered, { iron: 5 });
});

test('v14 save (no computer blob) loads to the fresh unfounded state', () => {
  const dst = new ComputerSystem({ materials: {}, removeMaterial() {} });
  const save = new SaveSystem(minimalSystems(dst));
  const data = save._buildSaveData('landingSite', 0, 0);
  delete data.computer;          // simulate a v14 blob
  data.version = 14;
  new SaveSystem(minimalSystems(dst)).apply(data);
  assert.equal(dst.plan.size, 0);
  assert.equal(dst.generation, 1);
  assert.equal(dst.pendingChunks, 1);
});
```

- [ ] **Step 3: Run**

Run: `node --test tests/systems/computerSave.test.js`
Expected: PASS. Then `npm test` — full suite green (SaveSystem changes can break other save tests if the destructure edit typos).

- [ ] **Step 4: Register + commit**

Add `import './systems/computerSave.test.js';` to `tests/runAll.test.js`.

```bash
git add js/systems/SaveSystem.js tests/systems/computerSave.test.js tests/runAll.test.js
git commit -m "feat: save v15 — ComputerSystem persistence + migration test"
```

---

### Task 5: Valid-cell mask + Environment shell rendering

**Files:**
- Modify: `js/scene/ZoneAssets.js` (export `_LANDING_KEEPOUT` near :127 — rename export to `LANDING_KEEPOUT`, keep a `const _LANDING_KEEPOUT = LANDING_KEEPOUT;` alias so the scatter call at :444-457 is untouched)
- Create: `js/scene/zones/ComputerBuilding/siteMask.js`
- Modify: `js/scene/Environment.js` (constructor group + `buildComputerShell` + `clearGroundCoverIn`)
- Test: `tests/systems/computerSiteMask.test.js`
- Modify: `tests/runAll.test.js`

- [ ] **Step 1: Export the keep-out data**

In `js/scene/ZoneAssets.js:127` change `const _LANDING_KEEPOUT = [` to `export const LANDING_KEEPOUT = [` and directly after the array close add `const _LANDING_KEEPOUT = LANDING_KEEPOUT;` (so the internal scatter reference stands). Run `node --check js/scene/ZoneAssets.js`.

- [ ] **Step 2: Write the mask module + test**

```js
// js/scene/zones/ComputerBuilding/siteMask.js
import { CHUNK, chunkToWorld } from '../../../systems/computerGenerations.js';
import { LANDING_KEEPOUT } from '../../ZoneAssets.js';

/**
 * Landing-Site validity mask for chunk placement. A chunk cell is valid when
 * its 6×6 square (plus MARGIN) clears: the static keep-out circles (pad,
 * gates, mountain, camp, arena, knoll, nodes — the scatter's own list), the
 * Starwing exclusion, the pad→adit corridor segment, live collision circles
 * (trees, rocks, props — passed in), and the zone-edge margin.
 */

const MARGIN = 0.5;
const HALF = CHUNK / 2 + MARGIN;
// Starwing planform + boss arena + knoll from LandingSite/index.js outer-woods
// keepClear (not all of those are in LANDING_KEEPOUT at full radius):
const EXTRA = [
  { x: 9.0, z: -10.5, r: 15 },   // the Starwing, 26-unit dart planform
  { x: 18, z: 18, r: 7 },        // Scrap Tyrant arena
  { x: 14, z: -24, r: 6.5 },     // lookout knoll + shelf ramp
  { x: -18, z: -18, r: 12 },     // mountain
  { x: 9.4, z: 8.6, r: 5 },      // survivor camp
];
const CORRIDOR = { ax: 0, az: 0, bx: -11.5, bz: -11.5, r: 1.6 }; // pad → adit ribbon
const BOUND = 40 - HALF;         // landingSite ground is ±40

function circleHitsSquare(c, wx, wz) {
  const dx = Math.max(Math.abs(c.x - wx) - HALF, 0);
  const dz = Math.max(Math.abs(c.z - wz) - HALF, 0);
  return Math.hypot(dx, dz) < c.r;
}

function segDist(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz)));
  return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
}

export function isChunkCellValid(cx, cz, liveCircles = []) {
  const [wx, wz] = chunkToWorld(cx, cz);
  if (Math.abs(wx) > BOUND || Math.abs(wz) > BOUND) return false;
  if (segDist(wx, wz, CORRIDOR.ax, CORRIDOR.az, CORRIDOR.bx, CORRIDOR.bz) < CORRIDOR.r + HALF) return false;
  for (const c of [...LANDING_KEEPOUT, ...EXTRA]) if (circleHitsSquare(c, wx, wz)) return false;
  for (const c of liveCircles) if (circleHitsSquare(c, wx, wz)) return false;
  return true;
}
```

```js
// tests/systems/computerSiteMask.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isChunkCellValid } from '../../js/scene/zones/ComputerBuilding/siteMask.js';

test('occupied ground rejects, open meadow accepts', () => {
  assert.ok(!isChunkCellValid(0, 0), 'landing pad');
  assert.ok(!isChunkCellValid(2, -2), 'the Starwing');
  assert.ok(!isChunkCellValid(-3, -3), 'mountain');
  assert.ok(!isChunkCellValid(3, 3), 'arena');
  assert.ok(!isChunkCellValid(-1, -1), 'pad→adit corridor');
  assert.ok(!isChunkCellValid(7, 0), 'outside the edge margin');
  // Known-open meadow: south of the pad, east of the corridor
  assert.ok(isChunkCellValid(0, 3), 'open meadow south of the pad');
  assert.ok(isChunkCellValid(-3, 3), 'open meadow SW');
});

test('live collision circles veto', () => {
  assert.ok(isChunkCellValid(0, 3));
  assert.ok(!isChunkCellValid(0, 3, [{ x: 1, z: 19, r: 0.6 }]), 'a tree in the cell');
});
```

Run: `node --test tests/systems/computerSiteMask.test.js` — if a "known-open" assertion fails, print the offending keep-out circle and pick a different open cell (the mask is data-true; the test names cells, not the reverse). Register in `tests/runAll.test.js`.

- [ ] **Step 3: Environment — shell group + build + scatter clearing**

In `js/scene/Environment.js` constructor, next to `this._trackGroup` (≈:94):
```js
    this._computerGroup = new THREE.Group(); // Generation Engine shell, rebuilt per plan edit
    scene.add(this._computerGroup);
    this._computerCircles = [];              // our collision refs, spliced out on rebuild
```

Add methods near `refreshTrackMarkers` (≈:721). First verify `getCollisionCircles()` returns the live `this._collisionCircles` array (or an equivalent that reflects pushes) — if it snapshots/caches, invalidate the cache in `buildComputerShell` the same way zone switches do.

```js
  /**
   * Rebuild the computer building's exterior from the player's plan. Called on
   * zone entry (landingSite) and once per plan edit — never per frame. All
   * visuals live in _computerGroup; collision circles are tracked so a rebuild
   * can splice exactly ours out of _collisionCircles.
   */
  buildComputerShell(computer) {
    while (this._computerGroup.children.length > 0) {
      this._computerGroup.remove(this._computerGroup.children[0]);
    }
    for (const c of this._computerCircles) {
      const i = this._collisionCircles.indexOf(c);
      if (i !== -1) this._collisionCircles.splice(i, 1);
    }
    this._computerCircles = [];
    if (this.currentZone !== 'landingSite' || !computer.hasFounded()) return;

    const { wallRuns, shellCollisionCircles } = computer._shellFns; // injected in main.js (see Task 7)
    const { chunkToWorld, CHUNK } = computer._gridFns;
    const H = computer.row().storyHeight;
    const wallMat = createToonMaterial(0x8a94a0);   // expedition-alloy grey (placeholder kit)
    const floorMat = createToonMaterial(0x4a5058);
    const roofMat = createToonMaterial(0x39404a);

    for (const r of wallRuns(computer.plan, computer.door)) {
      const horiz = r.z1 === r.z2;
      const len = horiz ? Math.abs(r.x2 - r.x1) : Math.abs(r.z2 - r.z1);
      const wall = new THREE.Mesh(new THREE.BoxGeometry(horiz ? len : 0.3, H, horiz ? 0.3 : len), wallMat);
      wall.position.set((r.x1 + r.x2) / 2, H / 2, (r.z1 + r.z2) / 2);
      this._computerGroup.add(wall);
    }
    for (const key of computer.plan) {
      const [cx, cz] = key.split(',').map(Number);
      const [wx, wz] = chunkToWorld(cx, cz);
      const floor = new THREE.Mesh(new THREE.BoxGeometry(CHUNK, 0.08, CHUNK), floorMat);
      floor.position.set(wx, 0.04, wz);
      this._computerGroup.add(floor);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(CHUNK + 0.4, 0.25, CHUNK + 0.4), roofMat);
      roof.position.set(wx, H + 0.12, wz);
      this._computerGroup.add(roof);
    }
    // Lit window strips — one per generation reached (exterior tell)
    // (skip on gen 1: the shed is dark until the machine grows)
    for (let g = 2; g <= computer.generation; g++) {
      const [dwx, dwz] = computer.doorWorld();
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.5, 0.06),
        new THREE.MeshBasicMaterial({ color: 0x8fe8cc })
      );
      // spread strips along the door face, left of the door
      strip.position.set(dwx - 1.6 - (g - 2) * 1.2, H * 0.6, dwz + (computer.door.side === 'S' ? 0.18 : -0.18));
      if (computer.door.side === 'E' || computer.door.side === 'W') {
        strip.rotation.y = Math.PI / 2;
        strip.position.set(dwx + (computer.door.side === 'E' ? 0.18 : -0.18), H * 0.6, dwz - 1.6 - (g - 2) * 1.2);
      }
      this._computerGroup.add(strip);
    }
    for (const c of shellCollisionCircles(computer.plan, computer.door)) {
      const circle = { ...c };
      this._collisionCircles.push(circle);
      this._computerCircles.push(circle);
    }
    this.clearGroundCoverIn(computer.plan, computer._gridFns);
  }

  /** Remove collisionless scatter (grass/flowers/bushes) whose position falls
   *  inside the plan's chunks — trees and collision-bearing props instead veto
   *  placement via the validity mask. */
  clearGroundCoverIn(plan, { worldToChunk, chunkKey }) {
    const doomed = [];
    this.group.traverse(o => {
      if (!o.userData?.isGroundCover) return;
      const p = o.getWorldPosition(new THREE.Vector3());
      const [cx, cz] = worldToChunk(p.x, p.z);
      if (plan.has(chunkKey(cx, cz))) doomed.push(o);
    });
    for (const o of doomed) o.parent?.remove(o);
  }
```

`isGroundCover` flag: find where `scatterGroundCover` rows are instantiated (they flow through `_placeGLBProps` like any ZONE_ASSETS row — check whether scatter rows are distinguishable; if not, add `groundCover: true` to the rows `scatterGroundCover` emits in `ZoneAssets.js` (inside its row-push around :100-110) and set `mesh.userData.isGroundCover = true` where `_placeGLBProps` reads the row). Keep the change to those two touch points.

- [ ] **Step 4: Syntax check + full suite + commit**

```bash
node --check js/scene/Environment.js
node --check js/scene/ZoneAssets.js
npm test
```
Expected: all green (no behavior change until Task 7 wires the calls).

```bash
git add js/scene/ZoneAssets.js js/scene/zones/ComputerBuilding/siteMask.js js/scene/Environment.js tests/systems/computerSiteMask.test.js tests/runAll.test.js
git commit -m "feat: chunk validity mask + computer shell rendering in Environment"
```

---

### Task 6: Interior zone `computerCore` + full zone wiring

**Files:**
- Create: `js/scene/zones/ComputerBuilding/interior.js`
- Modify: `js/scene/Environment.js` (switchZone case ≈:370, getZoneLabel ≈:766, empty spawns cases ≈:910 and ≈:1089)
- Modify: `js/zoneManager.js` (`ZONE_TERRAIN`, `ZONE_SPAWN_POS`)
- Modify: `tests/systems/zoneWiring.test.js` (`NO_PP_GATE` set)
- Modify: `js/main.js` (`ZONE_LORE` ≈:560), `js/systems/CodexSystem.js` (lore entry), `js/systems/GameStatistics.js` (`TOTAL_WORLDS` +1)
- Modify: `js/scene/SceneManager.js` (`ZONE_AMBIENCE` entry, dim interior like the homes ≈:145)

- [ ] **Step 1: Interior builder**

```js
// js/scene/zones/ComputerBuilding/interior.js
import * as THREE from 'three';
import { createToonMaterial } from '../../ToonMaterials.js';
import { CHUNK, chunkToWorld } from '../../../systems/computerGenerations.js';
import { wallRuns } from './shell.js';

/**
 * Inside the computer's building — one room whose footprint IS the player's
 * plan (same world coordinates, so door in/out lines up without any mapping).
 * Machine props derive from the generation table's interiorSet/fillFraction.
 * HomeInteriors is the template: camera looks from +z, so walls on the camera
 * side render as low rims; far walls go full height.
 */

const INTERIOR_SETS = {
  fieldTerminal:   { color: 0x9aa4b0, glow: 0x8fe8cc, w: 1.2, d: 0.9, h: 1.1 },
  missionServers:  { color: 0x6a7480, glow: 0x8fe8cc, w: 0.9, d: 0.9, h: 1.8 },
  integrationBench:{ color: 0x7a6f5a, glow: 0xffcf7a, w: 1.6, d: 0.9, h: 1.0 },
  expeditionRack:  { color: 0x525a66, glow: 0x8fe8cc, w: 1.0, d: 0.9, h: 2.6 },
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

export function buildComputerCore(env, computer) {
  const H = computer.row().storyHeight;
  const floorMat = createToonMaterial(0x3a4048);
  const wallMat = createToonMaterial(0x565e6a);
  wallMat.side = THREE.DoubleSide;

  for (const key of computer.plan) {
    const [cx, cz] = key.split(',').map(Number);
    const [wx, wz] = chunkToWorld(cx, cz);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(CHUNK, 0.06, CHUNK), floorMat);
    floor.position.set(wx, 0.03, wz);
    env.group.add(floor);
  }
  for (const r of wallRuns(computer.plan, computer.door)) {
    const horiz = r.z1 === r.z2;
    const len = horiz ? Math.abs(r.x2 - r.x1) : Math.abs(r.z2 - r.z1);
    // Camera-side (max-z horizontal) walls become low rims so the room reads
    const isCameraSide = horiz && r.z1 >= maxPlanZ(computer.plan) - 0.1;
    const h = isCameraSide ? 0.5 : H;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(horiz ? len : 0.25, h, horiz ? 0.25 : len), wallMat);
    wall.position.set((r.x1 + r.x2) / 2, h / 2, (r.z1 + r.z2) / 2);
    env.group.add(wall);
  }
  // collision mirrors the exterior exactly (same chains, same door gap)
  const { shellCollisionCircles } = computer._shellFns;
  for (const c of shellCollisionCircles(computer.plan, computer.door)) {
    env._collisionCircles.push({ ...c });
  }

  // ── The machine — fill fillFraction of the plan's floor area ─────────────
  const setDef = INTERIOR_SETS[computer.row().interiorSet];
  const area = computer.plan.size * CHUNK * CHUNK;
  const perProp = setDef.w * setDef.d * 2.2;       // footprint + working clearance
  const count = Math.max(1, Math.round(computer.row().fillFraction * area / perProp));
  const rng = seededRandom(90815 + computer.generation);
  const [dix, diz] = computer.doorInside();
  const placed = [];
  const chunks = [...computer.plan].sort();
  let attempts = 0;
  while (placed.length < count && attempts++ < count * 40) {
    const key = chunks[Math.floor(rng() * chunks.length)];
    const [cx, cz] = key.split(',').map(Number);
    const [wx, wz] = chunkToWorld(cx, cz);
    const x = wx + (rng() - 0.5) * (CHUNK - 1.8);
    const z = wz + (rng() - 0.5) * (CHUNK - 1.8);
    if (Math.hypot(x - dix, z - diz) < 2.0) continue;                 // door approach clear
    if (placed.some(p => Math.hypot(x - p.x, z - p.z) < 1.5)) continue;
    placed.push({ x, z });
    const body = new THREE.Mesh(new THREE.BoxGeometry(setDef.w, setDef.h, setDef.d), createToonMaterial(setDef.color));
    body.position.set(x, setDef.h / 2, z);
    body.rotation.y = Math.floor(rng() * 4) * (Math.PI / 2);
    env.group.add(body);
    const light = new THREE.Mesh(new THREE.BoxGeometry(setDef.w * 0.7, 0.08, 0.05),
      new THREE.MeshBasicMaterial({ color: setDef.glow }));
    light.position.set(x, setDef.h * 0.8, z + setDef.d / 2 + 0.03);
    light.rotation.copy(body.rotation);
    env.group.add(light);
    env._collisionCircles.push({ x, z, r: Math.max(setDef.w, setDef.d) * 0.62 });
  }

  // Lamp — mine-lantern scale (this three build uses physical light units)
  const [lx, lz] = centerOfPlan(computer.plan);
  const lamp = new THREE.PointLight(0x8fe8cc, 4.5, 20, 1);
  lamp.position.set(lx, H - 0.4, lz);
  env.group.add(lamp);

  // Exit — walk back out to the doorstep (spawnOverride = just outside the door)
  const [dox, doz] = computer.doorOutside();
  const [dwx, dwz] = computer.doorWorld();
  env._addDoorway(dwx, dwz, 'landingSite', 'Landing Site', [dox, doz]);
}

function maxPlanZ(plan) {
  let m = -Infinity;
  for (const key of plan) {
    const cz = Number(key.split(',')[1]);
    m = Math.max(m, chunkToWorld(0, cz)[1] + CHUNK / 2);
  }
  return m;
}
function centerOfPlan(plan) {
  let sx = 0, sz = 0;
  for (const key of plan) {
    const [cx, cz] = key.split(',').map(Number);
    const [wx, wz] = chunkToWorld(cx, cz);
    sx += wx; sz += wz;
  }
  return [sx / plan.size, sz / plan.size];
}
```

- [ ] **Step 2: Zone wiring (all six checklist items)**

1. `Environment.js` `switchZone` (≈:370): `case 'computerCore': buildComputerCore(this, this._computerSystemRef); break;` — add `import { buildComputerCore } from './zones/ComputerBuilding/interior.js';` at the top and set `env._computerSystemRef = computerSystem;` in main.js (Task 7).
2. `getZoneLabel()` (≈:766): `computerCore: 'The Computer'`.
3. Empty spawn cases (≈:910 and ≈:1089): add `case 'computerCore': return [];` to both (machine room — no nodes, no enemies).
4. `js/zoneManager.js`: `computerCore: 'rock'` in `ZONE_TERRAIN`; `computerCore: [0, 0]` in `ZONE_SPAWN_POS` (real entry always arrives via the door's spawnOverride; [0,0] is the never-hit fallback).
5. `tests/systems/zoneWiring.test.js`: add `'computerCore'` to `NO_PP_GATE`.
6. `js/main.js` `ZONE_LORE` (≈:560): `computerCore: 'computerCore',` and in `js/systems/CodexSystem.js` add a Lore entry:
```js
    computerCore: {
      name: 'The Machine',
      category: 'Lore',
      text: 'Every backup Al holds lives in this room. The expedition did not come to explore — it came to build the machine that remembers you. Feed it the worlds, and it will reach further.',
    },
```
(match the exact entry shape of neighboring lore entries in that file — copy `denSylva`'s field set.)
7. `js/systems/GameStatistics.js`: increment `TOTAL_WORLDS` by 1.
8. `js/scene/SceneManager.js` `ZONE_AMBIENCE` (≈:145): `computerCore: { ... }` — copy `homeSylva`'s preset values verbatim (dim interior, lamp-lit).

- [ ] **Step 3: Run the wiring test**

Run: `npm test`
Expected: `zoneWiring.test.js` green — a failure names the exact missing entry; fix and re-run.

- [ ] **Step 4: Commit**

```bash
git add js/scene/zones/ComputerBuilding/interior.js js/scene/Environment.js js/zoneManager.js js/main.js js/systems/CodexSystem.js js/systems/GameStatistics.js js/scene/SceneManager.js tests/systems/zoneWiring.test.js
git commit -m "feat: computerCore interior zone — plan-shaped room, machine fill, full wiring"
```

---

### Task 7: main.js integration — instantiate, door/nav/ribbon, build mode

**Files:**
- Modify: `js/main.js` (instantiate ≈:140-165, SaveSystem bag ≈:574-613, hud handoff ≈:545, debug ≈:1331, key handlers ≈:733, construct-mode area ≈:985-1071)
- Modify: `js/scene/Environment.js` (chunk cursor, door portal rebuild)
- Modify: `js/scene/PathRibbon.js` (`opts.parent` — default `env.group`, ~2-line change)

- [ ] **Step 1: Instantiate + inject + persist**

Near the other system instantiations (≈:145):
```js
// ── Generation Engine — the computer's building (save v15) ───────────────────
const computerSystem = new ComputerSystem(inventorySystem);
computerSystem.getAscensionCount = () => ascension.ascensionCount; // recompiles, NOT pp.prestigeCount
computerSystem.isCellValid = (cx, cz) =>
  env.currentZone === 'landingSite' && isChunkCellValid(cx, cz, env.getCollisionCircles());
computerSystem._shellFns = { wallRuns, shellCollisionCircles };     // Environment reads via system ref
computerSystem._gridFns = { CHUNK, chunkKey, chunkToWorld, worldToChunk };
env._computerSystemRef = computerSystem;
computerSystem.onPlanChanged = () => {
  env.buildComputerShell(computerSystem);
  refreshComputerDoor();
  hud._refreshPanel('computer-panel');
};
```
Imports at top of main.js:
```js
import { ComputerSystem } from './systems/ComputerSystem.js';
import { CHUNK, chunkKey, chunkToWorld, worldToChunk } from './systems/computerGenerations.js';
import { wallRuns, shellCollisionCircles } from './scene/zones/ComputerBuilding/shell.js';
import { isChunkCellValid } from './scene/zones/ComputerBuilding/siteMask.js';
```
Add `computer: computerSystem,` to the `new SaveSystem({...})` bag; `hud.computer = computerSystem;` next to the other hud handoffs; `computer: computerSystem,` in `window.__debugSystems`.

- [ ] **Step 2: Door portal + nav landmark + path ribbon (rebuilt on plan change)**

Add near the zone-switch plumbing in main.js:
```js
// The building's walk-in door, nav chip, and pad→door path all track the plan.
// Rebuilt on plan edits and on every landingSite entry (portals/landmarks are
// cleared per zone switch, so re-registering is the normal grammar).
function refreshComputerDoor() {
  if (env.currentZone !== 'landingSite' || !computerSystem.hasFounded()) return;
  // drop any previous computer door record before re-adding
  const portals = env._zonePortals;
  for (let i = portals.length - 1; i >= 0; i--) {
    if (portals[i].targetZone === 'computerCore') portals.splice(i, 1);
  }
  env._navLandmarks = env._navLandmarks.filter(l => l.label !== 'Computer');
  const [dx, dz] = computerSystem.doorOutside();
  env._addCaveEntrance(dx, dz, 'computerCore', 'The Computer',
    { walkIn: true, triggerR: 1.6, spawnOverride: computerSystem.doorInside() });
  env._addNavLandmark(dx, 2.0, dz, 'Computer');
  env.buildComputerPath(computerSystem);   // pad → door ribbon (Step 3)
}
```
Call `refreshComputerDoor()` from the zone-switch completion hook (find where `env.refreshTrackMarkers(pedometer)` is called on switch in `js/zoneManager.js:78` — add `hooks.onZoneReady?.()` style callback or simply call `env.buildComputerShell(computerSystem); refreshComputerDoor();` right after `refreshTrackMarkers` by passing both into `createZoneSwitcher`'s closure — match how `pedometer` is already passed in).

`_addCaveEntrance` needs `spawnOverride` support: in `Environment.js:1319-1346`, add `spawnOverride: opts.spawnOverride || null,` to the pushed record (the switchZone caller already honors `portal.spawnOverride` — verify at the walk-in trigger site in main.js; if the walk-in path doesn't pass it, mirror the [E]-interact path's `switchZone(portal.targetZone, portal.spawnOverride)`).

- [ ] **Step 3: Path ribbon rebuild**

In `js/scene/PathRibbon.js`, `addPathRibbon(env, points, opts)`: change every `env.group.add(...)` to `(opts.parent || env.group).add(...)`.

In `Environment.js`, next to `buildComputerShell`:
```js
  buildComputerPath(computer) {
    if (!this._computerPathGroup) {
      this._computerPathGroup = new THREE.Group();
      this.scene.add(this._computerPathGroup);
    }
    while (this._computerPathGroup.children.length > 0) {
      this._computerPathGroup.remove(this._computerPathGroup.children[0]);
    }
    if (this.currentZone !== 'landingSite' || !computer.hasFounded()) return;
    const [dx, dz] = computer.doorOutside();
    addPathRibbon(this, [[1.5, 1.5], [(1.5 + dx) / 2, (1.5 + dz) / 2], [dx, dz]], {
      width: 1.6, color: 0x8a7d6b, groundColor: 0x5a8c3c, strength: 1.0,
      seed: 90815, parent: this._computerPathGroup,
    });
  }
```
(`0x5a8c3c` = `GROUND_HEX` from `LandingSite/index.js:9`; import it or inline with a comment naming the source.)

- [ ] **Step 4: Build mode — cursor + place/remove/door**

Environment chunk cursor (next to `updateConstructCursor` ≈:2298): duplicate the cursor-group pattern with a 6×6 tile:
```js
  updateChunkCursor(x, z, ok, delta) {
    if (!this._chunkCursor) {
      const mat = createToonMaterial(0x00ffcc);
      mat.transparent = true; mat.opacity = 0.3;
      const tile = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), mat);
      tile.rotation.x = -Math.PI / 2; tile.position.y = 0.05;
      this._chunkCursor = new THREE.Group();
      this._chunkCursor.add(tile);
      this._chunkCursorMat = mat;
      this.scene.add(this._chunkCursor);
    }
    this._chunkCursor.visible = true;
    this._chunkCursor.position.set(x, 0, z);
    this._chunkCursorMat.color.setHex(ok ? 0x00ffcc : 0xff4422);
  }
  hideChunkCursor() { if (this._chunkCursor) this._chunkCursor.visible = false; }
```

main.js — mirror `handleConstructMode` (:1035-1071) with a `handleComputerBuildMode(delta)` gated on the computer panel being open AND its mode button state (`hud._computerBuildMode` ∈ `null | 'add' | 'remove' | 'door'`):
```js
function handleComputerBuildMode(delta) {
  const mode = hud._computerBuildMode;
  const panel = document.getElementById('computer-panel');
  if (!panel || panel.hidden || !mode || player.isInCombat || env.currentZone !== 'landingSite') {
    env.hideChunkCursor();
    return false;
  }
  const snap = _constructGroundSnap();   // reuse the existing raycast helper
  const px = snap ? snap.x : player.position.x;
  const pz = snap ? snap.z : player.position.z;
  const [cx, cz] = worldToChunk(px, pz);
  const [wx, wz] = chunkToWorld(cx, cz);
  if (mode === 'add') {
    const ok = computerSystem.canPlace(cx, cz);
    env.updateChunkCursor(wx, wz, ok, delta);
    hud.showInteractHint(ok
      ? `Click / [E] to build  (${computerSystem.pendingChunks} chunk${computerSystem.pendingChunks === 1 ? '' : 's'} ready)`
      : computerSystem.pendingChunks <= 0 ? 'No chunks pending — evolve the machine'
        : computerSystem.hasFounded() ? 'Must touch the building, on clear ground' : 'Ground occupied');
    if (keysDown.has('KeyE') && _actionCooldown <= 0) { _doComputerAction(cx, cz); }
  } else if (mode === 'remove') {
    const ok = computerSystem.canRemove(cx, cz);
    env.updateChunkCursor(wx, wz, ok, delta);
    hud.showInteractHint(ok ? 'Click / [E] to reclaim this chunk'
      : 'Keep the plan connected — door and last chunk stay');
    if (keysDown.has('KeyE') && _actionCooldown <= 0) { _doComputerAction(cx, cz); }
  } else { // 'door'
    // nearest exterior side of the hovered chunk to the pointer
    const side = _nearestSide(px - wx, pz - wz);
    const ok = computerSystem.canSetDoor(cx, cz, side);
    env.updateChunkCursor(wx, wz, ok, delta);
    hud.showInteractHint(ok ? `Click / [E] to move the door (${side} face)` : 'Pick an exterior face of the building');
    if (keysDown.has('KeyE') && _actionCooldown <= 0) { _doComputerAction(cx, cz, side); }
  }
  return true;
}
function _nearestSide(lx, lz) {
  return Math.abs(lx) > Math.abs(lz) ? (lx > 0 ? 'E' : 'W') : (lz > 0 ? 'S' : 'N');
}
function _doComputerAction(cx, cz, side) {
  const mode = hud._computerBuildMode;
  if (mode === 'add') computerSystem.place(cx, cz);
  else if (mode === 'remove') computerSystem.remove(cx, cz);
  else if (mode === 'door' && side) computerSystem.setDoor(cx, cz, side);
  _actionCooldown = 0.3;
}
```
Wire `handleComputerBuildMode(delta)` into the game loop right after the existing `handleConstructMode(delta)` call, and extend the canvas `pointerdown` handler (:1053-1062 area) to route to `_doComputerAction` when the computer panel + a mode is active (same pattern as the construct branch, computing `[cx,cz]` + `_nearestSide` from the snap).

- [ ] **Step 5: Boot + save-load rebuild**

After `SaveSystem`/cloud restore applies (find the boot sequence where the first zone builds — the boot gate at the bottom of main.js), call once:
```js
env.buildComputerShell(computerSystem);
refreshComputerDoor();
```

- [ ] **Step 6: Syntax check + suite + commit**

```bash
node --check js/main.js
node --check js/scene/Environment.js
node --check js/scene/PathRibbon.js
npm test
```

```bash
git add js/main.js js/scene/Environment.js js/scene/PathRibbon.js
git commit -m "feat: computer build mode — chunk cursor, door mode, plan-tracked door/nav/path"
```

---

### Task 8: CORE panel (HUD) — status, checklist, evolve, build modes

**Files:**
- Modify: `index.html` (panel HTML + menu tab)
- Modify: `js/ui/HUD.js` (`_refreshComputer()`, `_refreshPanel` case, `_closeCommandPanels`)
- Modify: `js/menuController.js` (`MENU_PANEL_IDS`)

Panel-wiring checklist steps 1, 4, 5 are enforced by `tests/ui/panelWiring.test.js`.

- [ ] **Step 1: Panel HTML**

In `index.html`, next to the other panel divs:
```html
<div id="computer-panel" class="panel-overlay" hidden>
  <h2>THE COMPUTER</h2>
  <div id="computer-status"></div>
  <div id="computer-build-modes">
    <button id="computer-mode-add">BUILD CHUNK</button>
    <button id="computer-mode-remove">RECLAIM</button>
    <button id="computer-mode-door">MOVE DOOR</button>
  </div>
  <div id="computer-schematic"></div>
</div>
```
And in `#menu-tabbar`: `<button class="menu-tab" data-tab="computer-panel">CORE</button>`.

- [ ] **Step 2: HUD refresh + mode buttons**

In `js/ui/HUD.js` add (mirror `_refreshTraining` at :845 for structure; `this.computer` is set in main.js):
```js
  _refreshComputer() {
    const c = this.computer;
    if (!c) return;
    const status = document.getElementById('computer-status');
    const row = c.row();
    status.innerHTML = '';
    const lines = [
      `Generation ${c.generation} — ${row.interiorSet.replace(/([A-Z])/g, ' $1').toLowerCase()}`,
      c.hasFounded()
        ? `Plan: ${c.plan.size} chunk${c.plan.size === 1 ? '' : 's'} · machine fill ${(row.fillFraction * 100) | 0}%`
        : 'Not yet founded — BUILD CHUNK, then walk the meadow and place the first block.',
      `Pending chunks: ${c.pendingChunks}`,
    ];
    for (const t of lines) {
      const div = document.createElement('div');
      div.textContent = t;
      status.appendChild(div);
    }

    const sch = document.getElementById('computer-schematic');
    sch.innerHTML = '';
    const rem = c.remaining();
    if (rem === null) {
      sch.textContent = 'Era 1 complete. The machine waits for the next era.';
    } else {
      const h = document.createElement('h3');
      h.textContent = `GENERATION ${c.generation + 1} SCHEMATIC`;
      sch.appendChild(h);
      const schematic = c.schematic();
      for (const [mat, total] of Object.entries(schematic)) {
        const have = c.delivered[mat] || 0;
        const line = document.createElement('div');
        line.textContent = `${mat}: ${have}/${total}`;
        if (rem[mat]) {
          const btn = document.createElement('button');
          const held = c.inventory.materials[mat] || 0;
          btn.textContent = `DELIVER (${Math.min(held, rem[mat])})`;
          btn.disabled = held <= 0;
          btn.addEventListener('click', () => {
            c.deliver(mat, rem[mat]);
            this._refreshComputer();
          });
          line.appendChild(btn);
        }
        sch.appendChild(line);
      }
      const evolveBtn = document.createElement('button');
      evolveBtn.textContent = c.eligible() ? 'EVOLVE' : 'EVOLVE (needs recompile)';
      evolveBtn.disabled = !c.canEvolve();
      evolveBtn.addEventListener('click', () => {
        if (this.computer.evolve()) {
          this.showToast?.(`GENERATION ${this.computer.generation} ONLINE`);
          this._refreshComputer();
        }
      });
      sch.appendChild(evolveBtn);
    }

    // mode buttons reflect + toggle _computerBuildMode
    for (const [id, mode] of [['computer-mode-add', 'add'], ['computer-mode-remove', 'remove'], ['computer-mode-door', 'door']]) {
      const b = document.getElementById(id);
      b.classList.toggle('active', this._computerBuildMode === mode);
      b.onclick = () => {
        this._computerBuildMode = this._computerBuildMode === mode ? null : mode;
        this._refreshComputer();
      };
    }
  }
```
(`showToast` — use whatever toast helper HUD already has; search for the "console online" toast used by TAB_UNLOCKS and call the same method. Style the `.active` class inline with existing panel button CSS conventions in index.html.)
Initialize `this._computerBuildMode = null;` in the HUD constructor. Add `case 'computer-panel': this._refreshComputer(); break;` to `_refreshPanel` (≈:575). Add `'computer-panel'` to `MENU_PANEL_IDS` in `js/menuController.js` AND to `_closeCommandPanels()` in HUD.js. When the panel closes, clear the mode: in `_closeCommandPanels()` (or the tab-switch handler) set `this._computerBuildMode = null;`.

- [ ] **Step 3: Evolution beat**

In main.js's `computerSystem.onPlanChanged` — no. The beat belongs at evolve: extend the EVOLVE click path via a callback so main.js owns effects (system-wiring convention):
```js
// main.js, after instantiation:
computerSystem.onEvolved = () => {
  // reuse the #zone-fade cover for a one-frame white-flash beat
  hud.showToast?.(`GENERATION ${computerSystem.generation} ONLINE`);
};
```
In `ComputerSystem.evolve()` add `this.onEvolved?.();` before `return true` (and `this.onEvolved = null;` in the constructor). Keep the HUD toast in the button handler OR the callback — one place only (prefer the callback; delete the button-handler toast).

- [ ] **Step 4: Run panel wiring test + suite**

Run: `npm test`
Expected: `panelWiring.test.js` green (it names any missing list on failure).

- [ ] **Step 5: Commit**

```bash
git add index.html js/ui/HUD.js js/menuController.js js/main.js js/systems/ComputerSystem.js
git commit -m "feat: CORE panel — schematic checklist, evolve, build-mode toggles"
```

---

### Task 9: Live verification on the Playwright rig

**Files:** none (verification only; fix regressions in place)

- [ ] **Step 1: Boot + place + enter, headless**

Use the project's headless Playwright rig (memory: Browser pane may not composite — use `__debugSystems` handles). Script the walkthrough:
1. Boot; assert no console errors; `__debugSystems.computer` exists, `pendingChunks === 1`.
2. Open CORE panel, set add mode, teleport player to open meadow (e.g. (0, 18)), place chunk via `__debugSystems.computer.place(0, 3)`; assert shell meshes exist (walk a probe into the wall line — player is expelled), door + nav landmark registered (`env.getPortals()` has `computerCore`, landmarks contain 'Computer').
3. Walk the probe through the door gap → zone switches to `computerCore`; assert interior props > 0; walk out the doorway → back at the doorstep.
4. Deliver gen-2 schematic via debug (`inventory` grant + `computer.deliver`), evolve; assert `generation === 2`, `pendingChunks === 1`, window strip count changed.
5. Save round-trip in-browser: `saveSystem._buildSaveData(...)` → reload → apply → plan/door persist.
6. Screenshots at the fixed camera: founded 1-chunk shed (exterior + door face), interior gen 1, interior gen 2, the invalid-cursor red tile over the landing pad.

- [ ] **Step 2: Invalid-placement probes**

Assert `computer.canPlace` is false for: pad (0,0), Starwing cells, corridor cells, non-adjacent cells; assert ground cover was cleared under the placed chunk and trees still stand outside it.

- [ ] **Step 3: Full suite one last time**

Run: `npm test`
Expected: all green.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: round-1 verification fixes (rig-driven)"
```

---

### Task 10: Docs + wrap-up

**Files:**
- Modify: `STATUS.md` (Where the work stands + folder map + Last updated)
- Modify: `CLAUDE.md` (new system row in key-files table; add the chunk-placement pattern note if it changed how future placeables are added)
- Modify: `Plans/DESIGN-DECISIONS.md` (append anything decided during implementation)

- [ ] **Step 1: STATUS.md** — new top entry: Generation Engine Round 1 (what shipped, test count, verification note). Folder map: `js/scene/zones/ComputerBuilding/`, `js/systems/ComputerSystem.js`, `js/systems/computerGenerations.js`.

- [ ] **Step 2: CLAUDE.md** — key-files table rows:
```
| Generation Engine — player-built computer building | `js/systems/ComputerSystem.js`, `js/systems/computerGenerations.js`, `js/scene/zones/ComputerBuilding/` |
```
Plus one paragraph in the zone section: chunk grammar (6-unit lattice, plan→shell, `computerCore` interior derives from the plan, save v15).

- [ ] **Step 3: Final commit + push both remotes (flat policy)**

```bash
git add STATUS.md CLAUDE.md Plans/DESIGN-DECISIONS.md
git commit -m "docs: Generation Engine round 1 — status, guide, decisions"
git push origin main
git push backup main
```

---

## Self-review notes (already applied)

- **Spec coverage:** kickoff items 1–5 map to Tasks 2/5 (placement+mask), 3/5 (plan→shell), 6/7 (door+interior), 2/4/8 (ComputerSystem+save+checklist), 1 (data table). Named tests: flood-fill/coverage (Task 3), save round-trip + migration (Task 4), zone wiring (Task 6), panel wiring (Task 8).
- **Known soft spots for the executor:** exact line numbers drift — anchor by the quoted code, not the number; `getCollisionCircles()` caching must be verified before relying on splice (Task 5 Step 3); `scatterGroundCover` row flagging needs a quick read of `_placeGLBProps` (Task 5); the walk-in `spawnOverride` pass-through must be verified at the trigger site (Task 7 Step 2).
- **Not this round** (do not build, even if tempting): stacking, module-slot variants, color variants, real kit art, `ZONE_BOUNDS` change, bonuses, Recompile-terminal move, drone-swarm beat.
