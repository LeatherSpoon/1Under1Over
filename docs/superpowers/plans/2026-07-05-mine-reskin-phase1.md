# Mine Visual Reskin (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Mine's primitive-box walls, ore blocks, and scatter with a Blender-authored modular GLB kit (region-banded palettes: worked timber → rough cave rock → alien transition → the Breach), wired through the existing preload-cache-clone-with-procedural-fallback pattern, so the zone reads hand-crafted in the canonical ATLA/Ghibli toon style.

**Architecture:** A single `models/MineKit.glb` holds every kit piece as a named object authored on the 3.2m cell footprint. A new `Mine/kit.js` preloads it at import (module-level `GLTFLoader`), splits it into a `{ name: Object3D }` cache, and maps GLB materials to the game's shader set (walls/ore → `createRevealToonMaterial` so the reveal effect survives; vein/rune/crystal materials → `MeshBasicMaterial` glow). `Mine/index.js` swaps its three primitive builders (`_buildWalls`, `_buildOreBlocks`, `_scatterCaveDetail`) to clone kit pieces per cell with seeded variant/rotation picks, keeping the exact same run-merged collision boxes and falling back to the current primitives when the GLB isn't loaded. Floors get a per-cell three-tone palette lift (pure code). All Blender authoring is scripted through the BlenderMCP raw socket (port 9876) so every piece is reproducible.

**Tech Stack:** Blender via BlenderMCP socket (`execute_code` bpy scripts), Three.js GLB pipeline (`export_apply=True, export_yup=True`), ES6 modules, `node:test`.

**Spec:** `docs/superpowers/specs/2026-07-05-mine-reimagining-design.md` (Phase 1 — "The reskin")

**Scope guards (from the spec's non-goals):**
- Do NOT change the toon shader, outlines (`addOutlineToGroup` still supplies them), the collision resolver, or the 3.2m grid.
- Do NOT change layout/scale/generation — Phase 2's generator stays as-is; this is visuals only.
- Collision boxes stay the current run-merged `GRID_COLLISION_INSET` boxes. Per-module collision footprints are Phase 3.
- Hero props (drill rig, ore cart, adit frame, Breach great-ring, world-gate arches, standing stones) are **user-generated** per the spec's hybrid pipeline — the existing procedural ones remain until those assets arrive (Task 11 hands off the list). This plan authors the *modular kit + dressing*, which is what covers the screen.

---

## File Structure

**Create:**
- `js/scene/zones/Mine/kitRules.js` — pure lookup tables + pick/classify helpers (Node-testable, no three import). One responsibility: which piece goes where, which material kind a GLB material name maps to.
- `js/scene/zones/Mine/kit.js` — GLB preload cache, `getKitPiece(name)` cloning, and the three material-application helpers (imports three; browser-only, `node --check` verified).
- `models/MineKit.glb` — all kit pieces, authored in Blender (committed; models/*.glb are tracked).
- `tests/systems/mineKitRules.test.js` — kitRules + new layout helpers.
- Scratchpad (not committed): `blender_client.py`, `run_code.py`, `kit_common.py`, per-task bpy scripts.

**Modify:**
- `js/scene/zones/Mine/layout.js` — export `mineRegionForRow(r)` and `getMineWallCells()`; dedupe the region mapping.
- `js/scene/zones/Mine/index.js` — floors palette lift; kit-clone paths for walls/ore/dressing with primitive fallbacks.
- `tests/runAll.test.js` — register the new test file.
- `CLAUDE.md` — document the kit pattern (final task).

**Blender kit pieces (all named objects in MineKit.glb, origin at cell-center base, y=0 ground):**

| Piece | Region | Blender size (X×Y×Z) | Materials |
|---|---|---|---|
| `wall_worked_a/b` | entrance+shaft | 3.2×3.2×~3.4 | WorkedRock, WorkedStrata, Timber |
| `wall_rock_a/b/c` | cavern | 3.2×3.2×4.0–4.6 | CaveRock, CaveStrata |
| `wall_passage_a/b` | passage | 3.2×3.2×4.6–4.9 | PassageRock, PassageStrata, AlienVein |
| `wall_breach_a/b` | breach | 3.2×3.2×5.4–5.8 | AlienStone, AlienDark, RuneVein |
| `ore_rock_a/b` | any (tier-tinted in game) | ~3.0×3.0×3.4 | OreRock, OreVein |
| `stalagmite_a/b` | dressing | ~0.5×0.5×1.0–1.4 | Stal |
| `crystal_a/b` | dressing | ~0.5×0.5×0.5 | CrystalVein |
| `rubble_a` | dressing | ~1.0×1.0×0.35 | Stal |

Palette (authored in Blender; the game derives its reveal-toon colors from these GLB base colors, so palette tuning happens in Blender only): WorkedRock `#6b5a4a`, WorkedStrata `#57483a`, Timber `#8a6238`, CaveRock `#5d5348`, CaveStrata `#463c33`, PassageRock `#4e4458`, PassageStrata `#3c3346`, AlienVein `#7a5cc8` (emissive), AlienStone `#3a2d5e`, AlienDark `#241a38`, RuneVein `#8a5cff` (emissive), OreRock `#4a4038`, OreVein `#ffffff` (emissive; game re-tints per tier), Stal `#55493d`, CrystalVein `#ffffff` (game re-tints per region).

---

## Task 1: Layout helpers — `mineRegionForRow` and `getMineWallCells`

The kit places one wall piece per cell, but `layout.js` only exposes merged runs. Add a per-cell wall getter and promote the floor-run region mapping to a shared export.

**Files:**
- Modify: `js/scene/zones/Mine/layout.js`
- Test: `tests/systems/mineKitRules.test.js` (created here, extended in Task 2)

- [ ] **Step 1: Write the failing test**

Create `tests/systems/mineKitRules.test.js`:

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  mineRegionForRow, getMineWallCells, getMineWallRuns,
  setActiveMineMap, getActiveMineMap,
} from '../../js/scene/zones/Mine/layout.js';

test('mineRegionForRow matches the floor-run region bands', () => {
  assert.equal(mineRegionForRow(0),  'entrance');
  assert.equal(mineRegionForRow(4),  'entrance');
  assert.equal(mineRegionForRow(5),  'shaft');
  assert.equal(mineRegionForRow(7),  'shaft');
  assert.equal(mineRegionForRow(8),  'cavern');
  assert.equal(mineRegionForRow(16), 'cavern');
  assert.equal(mineRegionForRow(17), 'passage');
  assert.equal(mineRegionForRow(19), 'passage');
  assert.equal(mineRegionForRow(20), 'breach');
  assert.equal(mineRegionForRow(24), 'breach');
});

test('getMineWallCells covers exactly the cells the merged runs cover', () => {
  const baseline = getActiveMineMap();
  try {
    setActiveMineMap([
      '     ',
      ' ... ',
      ' .1. ',
      ' ... ',
      '     ',
    ]);
    const cells = getMineWallCells();
    const runCells = getMineWallRuns()
      .reduce((n, run) => n + Math.round(run.width / 3.2), 0);
    assert.equal(cells.length, runCells);
    assert.ok(cells.every(cell =>
      typeof cell.x === 'number' && typeof cell.z === 'number' &&
      typeof cell.c === 'number' && typeof cell.r === 'number' &&
      typeof cell.region === 'string'
    ));
  } finally {
    setActiveMineMap(baseline);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/systems/mineKitRules.test.js`
Expected: FAIL — `mineRegionForRow` / `getMineWallCells` are not exported.

- [ ] **Step 3: Add `mineRegionForRow` and share it with the floor runs**

In `js/scene/zones/Mine/layout.js`, immediately BEFORE `export function getMineFloorRuns() {`, add:

```js
/** Region band for a map row — drives kit palettes and floor tints. */
export function mineRegionForRow(r) {
  return r <= 4 ? 'entrance' : r <= 7 ? 'shaft' : r <= 16 ? 'cavern' : r <= 19 ? 'passage' : 'breach';
}
```

Then inside `getMineFloorRuns`, replace:

```js
  const regionOf = (r) =>
    r <= 4 ? 'entrance' : r <= 7 ? 'shaft' : r <= 16 ? 'cavern' : r <= 19 ? 'passage' : 'breach';
```

with nothing (delete those two lines), and replace the one use `region: regionOf(r),` with `region: mineRegionForRow(r),`.

- [ ] **Step 4: Extract the wall predicate and add `getMineWallCells`**

In `getMineWallRuns`, the wall predicate is currently a local `const isWall = (c, r) => {...}`. Move it to module level (unchanged logic) directly ABOVE `getMineWallRuns`:

```js
function isWallCell(c, r) {
  if (isCarved(cellAt(c, r))) return false;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if ((dr || dc) && isCarved(cellAt(c + dc, r + dr))) return true;
    }
  }
  return false;
}
```

Delete the local `const isWall = ...` block inside `getMineWallRuns` and change its one use `isWall(c, r)` to `isWallCell(c, r)`.

Then add, after `getMineWallRuns`:

```js
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
```

- [ ] **Step 5: Run the tests**

Run: `node --test tests/systems/mineKitRules.test.js`
Expected: PASS (2 tests).

Run: `node --test tests/mineLayout.test.js tests/systems/mineActiveMap.test.js tests/systems/mineGenerator.test.js`
Expected: PASS — the run getters' behavior is unchanged.

- [ ] **Step 6: Syntax-check and commit**

Run: `node --check js/scene/zones/Mine/layout.js`

```bash
git add js/scene/zones/Mine/layout.js tests/systems/mineKitRules.test.js
git commit -m "feat(mine): expose per-cell wall list and shared region mapping"
```

---

## Task 2: kitRules.js — piece tables and material classification

Pure, Node-testable decisions: which pieces exist per region, how a roll picks one, and which shader a GLB material name maps to.

**Files:**
- Create: `js/scene/zones/Mine/kitRules.js`
- Test: `tests/systems/mineKitRules.test.js` (extend)

- [ ] **Step 1: Add the failing tests**

Append to `tests/systems/mineKitRules.test.js`:

```js
import { WALL_REGION_PIECES, pickWallPiece, materialKindFor } from '../../js/scene/zones/Mine/kitRules.js';

test('every region has wall pieces and picks are stable within [0,1)', () => {
  for (const region of ['entrance', 'shaft', 'cavern', 'passage', 'breach']) {
    const pieces = WALL_REGION_PIECES[region];
    assert.ok(Array.isArray(pieces) && pieces.length >= 2, `${region} needs >=2 variants`);
    assert.equal(pickWallPiece(region, 0), pieces[0]);
    assert.equal(pickWallPiece(region, 0.999), pieces[pieces.length - 1]);
  }
  // Unknown regions fall back to cavern rock
  assert.equal(pickWallPiece('nonsense', 0), WALL_REGION_PIECES.cavern[0]);
});

test('materialKindFor classifies glow materials by name', () => {
  assert.equal(materialKindFor('RuneVein'),     'emissive');
  assert.equal(materialKindFor('AlienVein'),    'emissive');
  assert.equal(materialKindFor('OreVein'),      'emissive');
  assert.equal(materialKindFor('CrystalVein'),  'emissive');
  assert.equal(materialKindFor('CaveRock'),     'reveal');
  assert.equal(materialKindFor('Timber'),       'reveal');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/systems/mineKitRules.test.js`
Expected: FAIL — `kitRules.js` does not exist.

- [ ] **Step 3: Create kitRules.js**

Create `js/scene/zones/Mine/kitRules.js`:

```js
// Pure lookup rules for the Mine's modular GLB kit (no three import — Node-testable).
// Piece names must match the object names exported in models/MineKit.glb.

export const WALL_REGION_PIECES = {
  entrance: ['wall_worked_a', 'wall_worked_b'],
  shaft:    ['wall_worked_a', 'wall_worked_b'],
  cavern:   ['wall_rock_a', 'wall_rock_b', 'wall_rock_c'],
  passage:  ['wall_passage_a', 'wall_passage_b'],
  breach:   ['wall_breach_a', 'wall_breach_b'],
};

export const ORE_PIECES      = ['ore_rock_a', 'ore_rock_b'];
export const STAL_PIECES     = ['stalagmite_a', 'stalagmite_b'];
export const CRYSTAL_PIECES  = ['crystal_a', 'crystal_b'];
export const RUBBLE_PIECES   = ['rubble_a'];

/** roll in [0,1) → deterministic variant pick. */
export function pickWallPiece(region, roll) {
  const pieces = WALL_REGION_PIECES[region] || WALL_REGION_PIECES.cavern;
  return pieces[Math.min(pieces.length - 1, Math.floor(roll * pieces.length))];
}

/** GLB material name → game shader kind. Glow names stay emissive (MeshBasic). */
export function materialKindFor(name) {
  return /vein|rune|crystal|glow/i.test(name || '') ? 'emissive' : 'reveal';
}
```

- [ ] **Step 4: Run tests, register in suite, commit**

Run: `node --test tests/systems/mineKitRules.test.js` → PASS (4 tests).

In `tests/runAll.test.js`, after `import './systems/mineDelveSave.test.js';` add:

```js
import './systems/mineKitRules.test.js';
```

Run: `npm test` → all pass.

```bash
git add js/scene/zones/Mine/kitRules.js tests/systems/mineKitRules.test.js tests/runAll.test.js
git commit -m "feat(mine): add kit piece tables and material classification rules"
```

---

## Task 3: Blender socket client scripts

The BlenderMCP addon listens on TCP 9876; there are no MCP tools — talk to it with a Python client. Scripts live in the session scratchpad, NOT the repo.

**Files:**
- Create (scratchpad): `blender_client.py`, `run_code.py`, `kit_common.py`

- [ ] **Step 1: Write the client**

Save to `<scratchpad>/blender_client.py`:

```python
import json, socket

def send(cmd, params=None, timeout=180):
    s = socket.create_connection(('127.0.0.1', 9876), timeout=timeout)
    s.sendall(json.dumps({'type': cmd, 'params': params or {}}).encode())
    buf = b''
    while True:
        chunk = s.recv(65536)
        if not chunk:
            break
        buf += chunk
        try:
            resp = json.loads(buf.decode())
            break
        except Exception:
            continue
    s.close()
    return resp
```

Save to `<scratchpad>/run_code.py`:

```python
# Usage: python run_code.py <script.py> [--common]
# --common prepends kit_common.py (shared material/geometry helpers).
import sys, json, os
from blender_client import send

here = os.path.dirname(os.path.abspath(__file__))
code = ''
if '--common' in sys.argv:
    code += open(os.path.join(here, 'kit_common.py'), encoding='utf-8').read() + '\n'
code += open(sys.argv[1], encoding='utf-8').read()
r = send('execute_code', {'code': code})
print(json.dumps(r)[:6000])
```

- [ ] **Step 2: Write the shared bpy helpers**

Save to `<scratchpad>/kit_common.py`:

```python
import bpy, bmesh, random

EXPORT_PATH = r'D:\1Under1Over-main\models\MineKit.glb'

def to_rgb(h):
    return (((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255)

def flat_mat(name, hexcol, emissive=False, strength=2.0):
    m = bpy.data.materials.get(name)
    if m is None:
        m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*to_rgb(hexcol), 1)
    b.inputs['Roughness'].default_value = 0.95
    if 'Specular IOR Level' in b.inputs:
        b.inputs['Specular IOR Level'].default_value = 0.05
    if emissive:
        b.inputs['Emission Color'].default_value = (*to_rgb(hexcol), 1)
        b.inputs['Emission Strength'].default_value = strength
    return m

def delete_if_exists(name):
    o = bpy.data.objects.get(name)
    if o:
        bpy.data.objects.remove(o, do_unlink=True)

def new_obj(name, mesh):
    delete_if_exists(name)
    o = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(o)
    return o

def rock_block(name, seed, h, mat_base, mat_band, band=(0.30, 0.55),
               jag=0.26, cuts=3, taper=0.10, footprint=3.2, clamp=1.68):
    """Faceted low-poly rock filling a footprint x footprint cell, base at z=0."""
    rnd = random.Random(seed)
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    for v in bm.verts:
        v.co.x *= footprint
        v.co.y *= footprint
        v.co.z = (v.co.z + 0.5) * h
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=cuts, use_grid_fill=True)
    for v in bm.verts:
        if v.co.z < 0.05:
            continue  # keep the base square and planted
        t = v.co.z / h
        v.co.x += (rnd.random() - 0.5) * jag * footprint * (0.4 + 0.6 * t)
        v.co.y += (rnd.random() - 0.5) * jag * footprint * (0.4 + 0.6 * t)
        v.co.z += (rnd.random() - 0.5) * jag * h * (0.25 + 0.75 * t)
        v.co.x -= v.co.x * taper * t
        v.co.y -= v.co.y * taper * t
        v.co.x = max(-clamp, min(clamp, v.co.x))
        v.co.y = max(-clamp, min(clamp, v.co.y))
        v.co.z = max(0.3, v.co.z)
    bm.to_mesh(mesh)
    bm.free()
    for p in mesh.polygons:
        p.use_smooth = False
    o = new_obj(name, mesh)
    o.data.materials.append(mat_base)
    o.data.materials.append(mat_band)
    lo, hi = band
    for p in mesh.polygons:
        if lo * h < p.center.z < hi * h:
            p.material_index = 1
    return o

def box_into(bm, size, loc):
    ret = bmesh.ops.create_cube(bm, size=1)
    for v in ret['verts']:
        v.co.x = v.co.x * size[0] + loc[0]
        v.co.y = v.co.y * size[1] + loc[1]
        v.co.z = v.co.z * size[2] + loc[2]
    return ret['verts']

def export_kit(names):
    for n in names:
        o = bpy.data.objects[n]
        o.location = (0, 0, 0)
        o.rotation_euler = (0, 0, 0)
    bpy.ops.object.select_all(action='DESELECT')
    for n in names:
        bpy.data.objects[n].select_set(True)
    bpy.context.view_layer.objects.active = bpy.data.objects[names[0]]
    bpy.ops.export_scene.gltf(
        filepath=EXPORT_PATH, export_format='GLB', use_selection=True,
        export_apply=True, export_yup=True, export_cameras=False, export_lights=False)
    return EXPORT_PATH

def report(names):
    out = {}
    for n in names:
        o = bpy.data.objects[n]
        d = o.dimensions
        out[n] = [round(d.x, 2), round(d.y, 2), round(d.z, 2)]
    print('KIT_DIMS=' + str(out))
```

- [ ] **Step 3: Verify connectivity**

Run: `cd <scratchpad> && python -c "from blender_client import send; print(send('get_scene_info')['status'])"`
Expected: `success`.

If the connection is refused: STOP — Blender with the BlenderMCP addon must be running. Ask the user to launch it.

(No commit — scratchpad only.)

---

## Task 4: Author and export the nine wall pieces

Scripted faceted-rock walls, one bpy script, then export and dimension-check. Worked walls get timber shoring; passage/breach get emissive vein bands.

**Files:**
- Create (scratchpad): `make_walls.py`
- Output: `models/MineKit.glb` (walls only at this point)

- [ ] **Step 1: Write the wall generator script**

Save to `<scratchpad>/make_walls.py`:

```python
# Requires kit_common (run with --common)
import bmesh

WorkedRock   = flat_mat('WorkedRock',   0x6b5a4a)
WorkedStrata = flat_mat('WorkedStrata', 0x57483a)
Timber       = flat_mat('Timber',       0x8a6238)
CaveRock     = flat_mat('CaveRock',     0x5d5348)
CaveStrata   = flat_mat('CaveStrata',   0x463c33)
PassageRock  = flat_mat('PassageRock',  0x4e4458)
PassageStrata= flat_mat('PassageStrata',0x3c3346)
AlienVein    = flat_mat('AlienVein',    0x7a5cc8, emissive=True, strength=1.5)
AlienStone   = flat_mat('AlienStone',   0x3a2d5e)
AlienDark    = flat_mat('AlienDark',    0x241a38)
RuneVein     = flat_mat('RuneVein',     0x8a5cff, emissive=True, strength=2.5)

# ── Natural cave rock: three jagged variants ─────────────────────────────
rock_block('wall_rock_a', 11, 4.0, CaveRock, CaveStrata, jag=0.24)
rock_block('wall_rock_b', 12, 4.3, CaveRock, CaveStrata, jag=0.28, band=(0.45, 0.68))
rock_block('wall_rock_c', 13, 4.6, CaveRock, CaveStrata, jag=0.30, band=(0.20, 0.42))

# ── Passage: taller, colder, thin vein band ──────────────────────────────
for name, seed, h in [('wall_passage_a', 21, 4.6), ('wall_passage_b', 22, 4.9)]:
    o = rock_block(name, seed, h, PassageRock, PassageStrata, jag=0.26, band=(0.30, 0.50))
    # re-band a thin high stripe to the emissive vein
    o.data.materials.append(AlienVein)
    for p in o.data.polygons:
        if 0.58 * h < p.center.z < 0.70 * h:
            p.material_index = 2

# ── Breach: tallest, alien, rune veins ───────────────────────────────────
for name, seed, h in [('wall_breach_a', 31, 5.4), ('wall_breach_b', 32, 5.8)]:
    o = rock_block(name, seed, h, AlienStone, AlienDark, jag=0.30, band=(0.25, 0.50))
    o.data.materials.append(RuneVein)
    for p in o.data.polygons:
        if 0.62 * h < p.center.z < 0.74 * h:
            p.material_index = 2

# ── Worked: flatter rock + timber shoring at the four vertical edges ─────
for name, seed, h in [('wall_worked_a', 41, 3.3), ('wall_worked_b', 42, 3.5)]:
    rock = rock_block(name, seed, h, WorkedRock, WorkedStrata, jag=0.09, taper=0.04,
                      band=(0.35, 0.60))
    faces_before = len(rock.data.polygons)
    bm = bmesh.new()
    bm.from_mesh(rock.data)
    for ex, ey in [(-1.45, -1.45), (1.45, -1.45), (-1.45, 1.45), (1.45, 1.45)]:
        box_into(bm, (0.30, 0.30, h * 0.96), (ex, ey, h * 0.48))
    for beam in [((3.2, 0.26, 0.24), (0, -1.45, h - 0.35)),
                 ((3.2, 0.26, 0.24), (0,  1.45, h - 0.35)),
                 ((0.26, 3.2, 0.24), (-1.45, 0, h - 0.35)),
                 ((0.26, 3.2, 0.24), ( 1.45, 0, h - 0.35))]:
        box_into(bm, beam[0], beam[1])
    bm.to_mesh(rock.data)
    bm.free()
    for p in rock.data.polygons:
        p.use_smooth = False
    if len(rock.data.materials) < 3:
        rock.data.materials.append(Timber)
    for p in rock.data.polygons[faces_before:]:
        p.material_index = 2

WALLS = ['wall_rock_a', 'wall_rock_b', 'wall_rock_c',
         'wall_passage_a', 'wall_passage_b',
         'wall_breach_a', 'wall_breach_b',
         'wall_worked_a', 'wall_worked_b']
report(WALLS)
path = export_kit(WALLS)
print('EXPORTED=' + path)
```

- [ ] **Step 2: Run it**

Run: `cd <scratchpad> && python run_code.py make_walls.py --common`
Expected: the response JSON contains `KIT_DIMS=` with each wall's X/Y within `[2.6, 3.4]` (jag pushes some in, clamp holds ≤3.36) and Z near its target height, then `EXPORTED=D:\1Under1Over-main\models\MineKit.glb`.

- [ ] **Step 3: Eyeball the silhouettes**

Run: `cd <scratchpad> && python -c "from blender_client import send; r=send('get_viewport_screenshot',{'max_size':1024}); print(r.get('status'))"` and read the screenshot it saves — check silhouettes only (faceted crests, timber posts visible). EEVEE shading does NOT predict the in-game toon look; do not judge color here.

- [ ] **Step 4: Commit the GLB**

Run: `ls -la models/MineKit.glb` — expect a file in the tens-to-hundreds of KB.

```bash
git add models/MineKit.glb
git commit -m "art(mine): author nine modular wall pieces (worked/rock/passage/breach)"
```

---

## Task 5: Author ore chunks + dressing, final MineKit.glb

**Files:**
- Create (scratchpad): `make_ore_dressing.py`
- Output: `models/MineKit.glb` (complete, 16 pieces)

- [ ] **Step 1: Write the script**

Save to `<scratchpad>/make_ore_dressing.py`:

```python
# Requires kit_common (run with --common)
import bmesh, math, random

OreRock     = flat_mat('OreRock',     0x4a4038)
OreVein     = flat_mat('OreVein',     0xffffff, emissive=True, strength=2.0)
Stal        = flat_mat('Stal',        0x55493d)
CrystalVein = flat_mat('CrystalVein', 0xffffff, emissive=True, strength=2.0)

def ore_chunk(name, seed):
    rnd = random.Random(seed)
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.0)
    for v in bm.verts:
        r = 1.0 + (rnd.random() - 0.5) * 0.5
        v.co.x *= 1.5 * r
        v.co.y *= 1.5 * r
        v.co.z = v.co.z * 1.7 * r + 1.55
        v.co.z = max(0.0, v.co.z)
    rock_faces = len(bm.faces)
    # half-embedded vein crystals: elongated octahedra poking out of the flanks
    for i in range(5):
        a = rnd.random() * math.pi * 2
        cx, cy = math.cos(a) * 1.25, math.sin(a) * 1.25
        cz = 0.7 + rnd.random() * 1.6
        s = 0.22 + rnd.random() * 0.16
        ret = bmesh.ops.create_icosphere(bm, subdivisions=0, radius=1.0)
        for v in ret['verts']:
            v.co.x = v.co.x * s + cx
            v.co.y = v.co.y * s + cy
            v.co.z = v.co.z * s * 1.9 + cz
    bm.to_mesh(mesh)
    bm.free()
    for p in mesh.polygons:
        p.use_smooth = False
    o = new_obj(name, mesh)
    o.data.materials.append(OreRock)
    o.data.materials.append(OreVein)
    for p in mesh.polygons[rock_faces:]:
        p.material_index = 1
    return o

def stalagmite(name, seed):
    rnd = random.Random(seed)
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    base_h = 1.0 + rnd.random() * 0.4
    for i, (rad, h0, h1) in enumerate([(0.26, 0.0, base_h * 0.55),
                                       (0.17, base_h * 0.45, base_h * 0.85),
                                       (0.09, base_h * 0.75, base_h)]):
        ret = bmesh.ops.create_cone(bm, cap_ends=True, segments=6,
                                    radius1=rad, radius2=rad * 0.3, depth=h1 - h0)
        ox, oy = (rnd.random() - 0.5) * 0.12, (rnd.random() - 0.5) * 0.12
        for v in ret['verts']:
            v.co.x += ox
            v.co.y += oy
            v.co.z += (h0 + h1) / 2
    bm.to_mesh(mesh)
    bm.free()
    for p in mesh.polygons:
        p.use_smooth = False
    o = new_obj(name, mesh)
    o.data.materials.append(Stal)
    return o

def crystal_cluster(name, seed):
    rnd = random.Random(seed)
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    for i in range(4 + int(rnd.random() * 2)):
        s = 0.10 + rnd.random() * 0.10
        ret = bmesh.ops.create_icosphere(bm, subdivisions=0, radius=1.0)
        tilt = (rnd.random() - 0.5) * 0.8
        a = rnd.random() * math.pi * 2
        for v in ret['verts']:
            x, z = v.co.x * s, v.co.z * s * 2.4
            v.co.x = x * math.cos(tilt) - z * math.sin(tilt) + math.cos(a) * 0.18
            v.co.y = v.co.y * s + math.sin(a) * 0.18
            v.co.z = x * math.sin(tilt) + z * math.cos(tilt) + s * 1.6
    bm.to_mesh(mesh)
    bm.free()
    o = new_obj(name, mesh)
    o.data.materials.append(CrystalVein)
    return o

def rubble(name, seed):
    rnd = random.Random(seed)
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    for i in range(6):
        s = 0.10 + rnd.random() * 0.14
        ret = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=1.0)
        a = rnd.random() * math.pi * 2
        d = rnd.random() * 0.45
        for v in ret['verts']:
            v.co.x = v.co.x * s + math.cos(a) * d
            v.co.y = v.co.y * s + math.sin(a) * d
            v.co.z = max(0.0, v.co.z * s * 0.8 + s * 0.5)
    bm.to_mesh(mesh)
    bm.free()
    for p in mesh.polygons:
        p.use_smooth = False
    o = new_obj(name, mesh)
    o.data.materials.append(Stal)
    return o

ore_chunk('ore_rock_a', 51)
ore_chunk('ore_rock_b', 52)
stalagmite('stalagmite_a', 61)
stalagmite('stalagmite_b', 62)
crystal_cluster('crystal_a', 71)
crystal_cluster('crystal_b', 72)
rubble('rubble_a', 81)

ALL = ['wall_rock_a', 'wall_rock_b', 'wall_rock_c',
       'wall_passage_a', 'wall_passage_b',
       'wall_breach_a', 'wall_breach_b',
       'wall_worked_a', 'wall_worked_b',
       'ore_rock_a', 'ore_rock_b',
       'stalagmite_a', 'stalagmite_b', 'crystal_a', 'crystal_b', 'rubble_a']
report(ALL)
path = export_kit(ALL)
print('EXPORTED=' + path)
```

- [ ] **Step 2: Run it**

Run: `cd <scratchpad> && python run_code.py make_ore_dressing.py --common`
Expected: `KIT_DIMS=` shows ore chunks ~2.5–3.4 X/Y and ~3.0–3.6 Z; stalagmites ~1.0–1.5 Z; crystals/rubble under 0.8 Z. Then `EXPORTED=`. (The wall objects from Task 4 must still exist in the Blender scene — if the user restarted Blender, re-run `make_walls.py` first.)

- [ ] **Step 3: Commit the final GLB**

```bash
git add models/MineKit.glb
git commit -m "art(mine): add ore chunks and cave dressing to the kit"
```

---

## Task 6: kit.js — preload cache, cloning, material application

Follows the `ResourceNode._nodeModels` convention: module-level loader kicks off on import, cache object, no await. Material mapping keeps the reveal effect and the glow veins.

**Files:**
- Create: `js/scene/zones/Mine/kit.js`
- Verify: `node --check` (imports three — browser-only execution).

- [ ] **Step 1: Create kit.js**

```js
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createRevealToonMaterial, createToonMaterial } from '../../ToonMaterials.js';
import { materialKindFor } from './kitRules.js';

// Modular cave kit — preloaded once, cloned per cell. Falls back to the
// procedural primitives in index.js if not loaded yet (no await, no pop-in
// handling — same convention as ResourceNode._nodeModels).
const _kitPieces = {};
new GLTFLoader().load('./models/MineKit.glb', (gltf) => {
  for (const child of [...gltf.scene.children]) {
    _kitPieces[child.name] = child;
  }
}, undefined, () => {});

export function kitReady() {
  return Object.keys(_kitPieces).length > 0;
}

/** Deep clone of a kit piece, or null (caller falls back to primitives). */
export function getKitPiece(name) {
  const piece = _kitPieces[name];
  return piece ? piece.clone(true) : null;
}

// ── Material application ────────────────────────────────────────────────────
// kitMats: per-zone-build cache (env._revealMaterials is reset every switch,
// so materials must be rebuilt per build — pass a fresh {} from build()).

function _revealFor(kitMats, env, color, revealR) {
  const key = `r:${color}:${revealR}`;
  if (!kitMats[key]) {
    const m = createRevealToonMaterial(color, { revealR });
    env._revealMaterials.push(m);
    kitMats[key] = m;
  }
  return kitMats[key];
}

function _basicFor(kitMats, color) {
  const key = `b:${color}`;
  if (!kitMats[key]) kitMats[key] = new THREE.MeshBasicMaterial({ color });
  return kitMats[key];
}

function _toonFor(kitMats, color) {
  const key = `t:${color}`;
  if (!kitMats[key]) kitMats[key] = createToonMaterial(color);
  return kitMats[key];
}

function _mapMaterials(obj, mapFn) {
  obj.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
    if (Array.isArray(node.material)) {
      node.material = node.material.map(mapFn);
    } else {
      node.material = mapFn(node.material);
    }
  });
}

/** Walls: every GLB material → reveal toon of the same color; vein names glow. */
export function applyWallMaterials(obj, env, kitMats, revealR = 2.4) {
  _mapMaterials(obj, (mat) => {
    const color = mat.color ? mat.color.getHex() : 0x5d5348;
    return materialKindFor(mat.name) === 'emissive'
      ? _basicFor(kitMats, color)
      : _revealFor(kitMats, env, color, revealR);
  });
}

/** Ore chunks: rock takes the tier color, veins take the tier's glow color. */
export function applyOreMaterials(obj, env, kitMats, props, revealR = 1.8) {
  _mapMaterials(obj, (mat) =>
    materialKindFor(mat.name) === 'emissive'
      ? _basicFor(kitMats, props.veinColor)
      : _revealFor(kitMats, env, props.color, revealR)
  );
}

/** Dressing: rock parts re-tinted per region, crystal parts glow per region. */
export function applyDressingMaterials(obj, kitMats, palette) {
  _mapMaterials(obj, (mat) =>
    materialKindFor(mat.name) === 'emissive'
      ? _basicFor(kitMats, palette.crystal)
      : _toonFor(kitMats, palette.rock)
  );
}
```

- [ ] **Step 2: Syntax-check and commit**

Run: `node --check js/scene/zones/Mine/kit.js`

```bash
git add js/scene/zones/Mine/kit.js
git commit -m "feat(mine): add kit loader with reveal/glow material mapping"
```

---

## Task 7: Floors — per-cell three-tone palette lift

Pure code, visible immediately even before the GLB wiring. Replaces the near-black merged floor runs with brighter per-cell tones (~300 planes; cheap, no outlines).

**Files:**
- Modify: `js/scene/zones/Mine/index.js` (`FLOOR_TINT` + `_buildFloors`)

- [ ] **Step 1: Replace the palette and builder**

In `js/scene/zones/Mine/index.js`, replace the whole `FLOOR_TINT` const and `_buildFloors` function with:

```js
// Three tones per region — per-cell picks break the flat monotone floor.
const FLOOR_TONES = {
  entrance: [0x4a3623, 0x54402b, 0x40301f], // packed dirt, lantern-warm
  shaft:    [0x44311f, 0x4e3a26, 0x3a2a1a],
  cavern:   [0x4a4238, 0x544b3f, 0x3f382f], // worked grey-brown stone
  passage:  [0x453b4a, 0x4f4456, 0x3a3140], // rock going violet
  breach:   [0x3a2d52, 0x443666, 0x302545], // ancient stone
};

function _buildFloors(env) {
  const mats = {};
  for (const [region, tones] of Object.entries(FLOOR_TONES)) {
    mats[region] = tones.map((c) => createToonMaterial(c));
  }
  const geo = new THREE.PlaneGeometry(3.2, 3.2);
  const map = getActiveMineMap();
  for (let r = 0; r < map.length; r++) {
    for (let c = 0; c < map[r].length; c++) {
      const ch = map[r][c];
      const carved = ch === '.' || (ch >= '1' && ch <= '5'); // floor shows under mined-out ore
      if (!carved) continue;
      const { x, z } = mineCellToWorld(c, r);
      const mesh = new THREE.Mesh(geo, mats[mineRegionForRow(r)][(c * 7 + r * 13) % 3]);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, 0.015, z);
      mesh.receiveShadow = true;
      env.group.add(mesh);
    }
  }
}
```

Update the layout import at the top of the file: add `mineRegionForRow` to the existing `from './layout.js'` import list, and remove `getMineFloorRuns` from it (this was its only use).

- [ ] **Step 2: Verify**

Run: `node --check js/scene/zones/Mine/index.js` and `npm test` (all pass — no logic touched).

Live preview: start the server, `__debugSystems.ppSystem._baseCap = 50000; __debugSystems.ppSystem.ppTotal = 20000; __debugSwitchZone('mine')`, screenshot — floors show warm dirt at the entrance and subtle tone variation per cell.

- [ ] **Step 3: Commit**

```bash
git add js/scene/zones/Mine/index.js
git commit -m "art(mine): per-cell three-tone floor palette"
```

---

## Task 8: Walls — kit clones per cell, primitive fallback, collision unchanged

**Files:**
- Modify: `js/scene/zones/Mine/index.js` (`build`, `_buildWalls`)

- [ ] **Step 1: Update imports**

Add to the `./layout.js` import list: `getMineWallCells`. Add below the layout import:

```js
import { kitReady, getKitPiece, applyWallMaterials, applyOreMaterials, applyDressingMaterials } from './kit.js';
import { pickWallPiece, ORE_PIECES, STAL_PIECES, CRYSTAL_PIECES, RUBBLE_PIECES } from './kitRules.js';
```

- [ ] **Step 2: Thread a per-build material cache**

In `build(env)`, after `const rng = seededRandom(54321);` add:

```js
  const kitMats = {}; // per-build shader cache for kit clones (reveal/glow/toon)
```

and change the three calls to pass it: `_buildWalls(env, rng, kitMats);`, `_buildOreBlocks(env, rng, kitMats);`, `_scatterCaveDetail(env, rng, kitMats);`.

- [ ] **Step 3: Rewrite `_buildWalls`**

Replace the whole `_buildWalls` function with:

```js
function _buildWalls(env, rng, kitMats) {
  // Collision always comes from the merged runs — identical to the pre-kit
  // behavior and independent of which visual path builds below.
  for (const run of getMineWallRuns()) {
    env._collisionBoxes.push({
      minX: run.cx - run.width / 2 + GRID_COLLISION_INSET, maxX: run.cx + run.width / 2 - GRID_COLLISION_INSET,
      minZ: run.cz - run.depth / 2 + GRID_COLLISION_INSET, maxZ: run.cz + run.depth / 2 - GRID_COLLISION_INSET,
      rock: SOLID,
    });
  }

  if (!kitReady()) {
    _buildWallsPrimitive(env, rng);
    return;
  }

  for (const cell of getMineWallCells()) {
    const piece = getKitPiece(pickWallPiece(cell.region, rng()));
    if (!piece) continue;
    applyWallMaterials(piece, env, kitMats);
    piece.position.set(cell.x, 0, cell.z);
    piece.rotation.y = Math.floor(rng() * 4) * (Math.PI / 2); // quarter turns keep the footprint
    piece.scale.y = 0.92 + rng() * 0.2;                        // per-cell crest variation
    addOutlineToGroup(piece, 0.03);
    env.group.add(piece);
  }
}

// Pre-kit visual path — kept as the fallback while MineKit.glb loads.
function _buildWallsPrimitive(env, rng) {
  const rockMat  = createRevealToonMaterial(0x191410, { revealR: 2.4 });
  const alienMat = createRevealToonMaterial(0x171126, { revealR: 2.4 });
  env._revealMaterials.push(rockMat, alienMat);

  for (const run of getMineWallRuns()) {
    const alien = run.kind === 'alien';
    const h = alien ? 5.2 + rng() * 1.6 : 3.8 + rng() * 1.9;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(run.width, h, run.depth),
      alien ? alienMat : rockMat
    );
    mesh.position.set(run.cx, h / 2, run.cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    addOutline(mesh, 0.03);
    env.group.add(mesh);
  }
}
```

(Note the collision push moved OUT of the primitive path — do not leave a duplicate inside `_buildWallsPrimitive`.)

- [ ] **Step 4: Verify in the live preview**

`node --check js/scene/zones/Mine/index.js`, `npm test`, then in the preview: enter the Mine, screenshot the entrance (timber-shored warm walls), the cavern (grey-brown faceted rock), the passage (violet, vein glints), the Breach (tall alien stone, rune veins). Confirm: outlines present, walls still open up around the player (reveal), player cannot walk through any wall, and `preview_console_logs` shows no errors.

- [ ] **Step 5: Commit**

```bash
git add js/scene/zones/Mine/index.js
git commit -m "art(mine): per-cell kit wall clones with region palettes"
```

---

## Task 9: Ore blocks — kit chunks with tier tints, cracks, depletion

**Files:**
- Modify: `js/scene/zones/Mine/index.js` (`_buildOreBlocks`)

- [ ] **Step 1: Rewrite `_buildOreBlocks`**

Replace the whole function with:

```js
function _buildOreBlocks(env, rng, kitMats) {
  const blocks = getMineableWallBlocks();
  const useKit = kitReady();

  // Primitive-path shared materials (only built when falling back)
  const tierMats = {};
  const veinMats = {};
  if (!useKit) {
    for (const b of blocks) {
      if (!tierMats[b.props.color]) {
        const m = createRevealToonMaterial(b.props.color, { revealR: 1.8 });
        tierMats[b.props.color] = m;
        env._revealMaterials.push(m);
      }
      if (!veinMats[b.props.veinColor]) {
        veinMats[b.props.veinColor] = new THREE.MeshBasicMaterial({ color: b.props.veinColor });
      }
    }
  }

  for (const b of blocks) {
    // Blocks mined out earlier in this delve stay depleted (open floor).
    if (env._mineDelve?.isMined(b.cellC, b.cellR)) continue;
    const bw = 3.2, bd = 3.2;
    let mesh, bh;

    if (useKit) {
      bh = 3.4;
      mesh = getKitPiece(ORE_PIECES[Math.floor(rng() * ORE_PIECES.length)]);
      applyOreMaterials(mesh, env, kitMats, b.props);
      mesh.position.set(b.x, 0, b.z);
      mesh.rotation.y = Math.floor(rng() * 4) * (Math.PI / 2);
      addOutlineToGroup(mesh, 0.04);
      env.group.add(mesh);
    } else {
      bh = 3.2 + rng() * 1.6;
      mesh = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), tierMats[b.props.color]);
      mesh.position.set(b.x, bh / 2, b.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      addOutline(mesh, 0.04);
      env.group.add(mesh);

      // Glowing vein studs — the "there's ore in that rock" sparkle
      const veinMat = veinMats[b.props.veinColor];
      const studCount = 2 + Math.floor(rng() * 2);
      for (let i = 0; i < studCount; i++) {
        const stud = new THREE.Mesh(new THREE.OctahedronGeometry(0.14 + rng() * 0.1, 0), veinMat);
        const face = Math.floor(rng() * 4);
        const along = (rng() - 0.5) * (bw * 0.7);
        const up = 0.5 + rng() * (bh * 0.55) - bh / 2;
        if (face === 0)      stud.position.set(along, up,  bd / 2 + 0.02);
        else if (face === 1) stud.position.set(along, up, -bd / 2 - 0.02);
        else if (face === 2) stud.position.set( bw / 2 + 0.02, up, along);
        else                 stud.position.set(-bw / 2 - 0.02, up, along);
        mesh.add(stud);
      }
    }

    const { crack1, crack2 } = env._makeCrackStages(mesh, bw, bh, bd);
    const rock = { mesh, x: b.x, z: b.z, alive: true, props: b.props, richness: 3, maxRichness: 3, crack1, crack2 };
    env._rocks.push(rock);
    env._collisionBoxes.push({
      minX: b.x - bw / 2 + GRID_COLLISION_INSET, maxX: b.x + bw / 2 - GRID_COLLISION_INSET,
      minZ: b.z - bd / 2 + GRID_COLLISION_INSET, maxZ: b.z + bd / 2 - GRID_COLLISION_INSET,
      rock,
    });
  }
}
```

**Crack-stage caveat:** `env._makeCrackStages(mesh, bw, bh, bd)` positions crack overlays for a box centered at `bh/2` on a mesh whose origin is at its center; the kit clone's origin is at its BASE. Before writing this off, read `_makeCrackStages` in `js/scene/Environment.js` — if it parents planes at face offsets relative to the object origin, add `0` → `bh / 2` height compensation by parenting the cracks yourself: after the call, `crack1.position.y += bh / 2; crack2.position.y += bh / 2;` (only in the kit path). Verify visually in Step 2 by drilling a block twice and checking the cracks appear on the chunk, not at its feet.

- [ ] **Step 2: Verify in the live preview**

`node --check`, `npm test`, then preview: enter the Mine — ore chunks read as jagged rocks with glowing crystals in tier colors (copper orange at the entrance band, gold near the Breach). Drill one twice (cracks appear on the chunk), a third time (it disappears, floor shows beneath, loot granted). Depths-and-back: the chunk stays gone. No console errors.

- [ ] **Step 3: Commit**

```bash
git add js/scene/zones/Mine/index.js
git commit -m "art(mine): kit ore chunks with tier-tinted rock and glow veins"
```

---

## Task 10: Dressing — kit stalagmites, crystals, rubble

**Files:**
- Modify: `js/scene/zones/Mine/index.js` (`_scatterCaveDetail`)

- [ ] **Step 1: Rewrite `_scatterCaveDetail`**

Replace the whole function with:

```js
function _scatterCaveDetail(env, rng, kitMats) {
  const palettes = {
    rock:   { rock: 0x55493d, crystal: 0x55e0c8 },
    breach: { rock: 0x3a2d5e, crystal: 0xbb88ff },
  };
  const useKit = kitReady();
  const stalMat = { rock: createToonMaterial(0x201812), breach: createToonMaterial(0x2a2040) };
  const crysMat = { rock: new THREE.MeshBasicMaterial({ color: 0x55e0c8 }), breach: new THREE.MeshBasicMaterial({ color: 0xbb88ff }) };
  const portals = Object.values(MINE_ZONE_PORTALS);

  const map = getActiveMineMap();
  for (let r = 0; r < map.length; r++) {
    for (let c = 0; c < map[r].length; c++) {
      if (!isMineFloorCell(c, r)) continue;
      const { x, z } = mineCellToWorld(c, r);

      // Keep the travelled routes and POIs clean
      if (Math.abs(x) < 4.5 && z < -8) continue;                                  // entrance + shaft spine
      if (portals.some(p => Math.hypot(x - p.x, z - p.z) < 4.2)) continue;
      if (Math.hypot(x - MINE_DRILL_POS.x, z - MINE_DRILL_POS.z) < 4.2) continue;
      if (Math.hypot(x, z - 28.8) < 5.5) continue;                                // dais clearing

      const roll = rng();
      const breachy = r >= 17;
      const key = breachy ? 'breach' : 'rock';
      const ox = (rng() - 0.5) * 2.0;
      const oz = (rng() - 0.5) * 2.0;

      if (useKit) {
        let name = null;
        if (roll < 0.30)      name = STAL_PIECES[Math.floor(rng() * STAL_PIECES.length)];
        else if (roll < 0.42) name = CRYSTAL_PIECES[Math.floor(rng() * CRYSTAL_PIECES.length)];
        else if (roll < 0.50) name = RUBBLE_PIECES[0];
        if (!name) continue;
        const piece = getKitPiece(name);
        if (!piece) continue;
        applyDressingMaterials(piece, kitMats, palettes[key]);
        piece.position.set(x + ox, 0, z + oz);
        piece.rotation.y = rng() * Math.PI * 2; // free rotation — dressing is off-grid
        const s = 0.8 + rng() * 0.6;
        piece.scale.set(s, s, s);
        addOutlineToGroup(piece, 0.03);
        env.group.add(piece);
        continue;
      }

      if (roll < 0.30) {
        const h = 0.5 + rng() * 0.9;
        const stal = new THREE.Mesh(
          new THREE.ConeGeometry(0.16 + rng() * 0.22, h, 6),
          stalMat[key]
        );
        stal.position.set(x + ox, h / 2, z + oz);
        stal.castShadow = true;
        addOutline(stal, 0.03);
        env.group.add(stal);
      } else if (roll < 0.42) {
        const crys = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.16 + rng() * 0.14, 0),
          crysMat[key]
        );
        crys.position.set(x + ox, 0.22, z + oz);
        crys.rotation.y = rng() * Math.PI;
        env.group.add(crys);
      }
    }
  }
}
```

- [ ] **Step 2: Verify + commit**

`node --check`, `npm test`, preview screenshot of the cavern (stalagmite clusters, glowing crystals, rubble; walkable — dressing emits no colliders, matching current behavior).

```bash
git add js/scene/zones/Mine/index.js
git commit -m "art(mine): kit dressing scatter (stalagmites, crystals, rubble)"
```

---

## Task 11: Full-region verification, docs, and hero-prop handoff

**Files:**
- Modify: `CLAUDE.md`
- Verification: live preview walk of all five regions.

- [ ] **Step 1: Full live walk**

Preview with the PP-cap guard (`_baseCap` then `ppTotal`), then teleport through and screenshot each region: entrance (0,-30), shaft (0,-20), cavern (-6,0), passage (5,17), Breach (0,26). Checks per region:
- Kit walls with correct palette; reveal opens walls around the player; outlines on everything.
- Ore chunks in the right tier colors; drill-deplete-persist still works (delve unchanged).
- Surface → re-descend re-rolls to a *visually different* cave (Phase 2 intact).
- `preview_console_logs` level error: empty; frame feels smooth walking the spine.
- `npm test`: full suite green.

- [ ] **Step 2: Update CLAUDE.md**

In the Mine paragraph of `CLAUDE.md` (Zone system section), append:

```markdown
The Mine renders from a modular GLB kit (`models/MineKit.glb`, authored via the Blender socket): `Mine/kit.js` preloads it and maps GLB materials → game shaders (`materialKindFor` in `kitRules.js`: names matching /vein|rune|crystal|glow/ become `MeshBasicMaterial` glow, everything else becomes `createRevealToonMaterial` from the GLB color — palette tuning happens in Blender, not JS). Walls place per cell (`getMineWallCells`) with seeded variant/quarter-rotation picks; collision still uses the merged runs. Every kit path falls back to the pre-kit primitives while the GLB loads.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document the Mine GLB kit rendering pattern"
```

- [ ] **Step 4: Hero-prop handoff (report to the user, no code)**

Report the list of spec-assigned user-generated props still pending, with the canonical prompt ("westernized anime style, clean confident outlines, flat color with soft gradient shading, painterly backgrounds, strong silhouette reads, inspired by Avatar: The Last Airbender and Studio Ghibli"): drill rig, ore cart, timber support set / adit frame, the Breach great-ring, world-gate arches, standing stones. Drop into `Assets/3D/<PropName>/` as usual; the `add-assets` skill integrates them (procedural versions remain until then).

---

## Notes for the implementer

- **Blender must be running** with the BlenderMCP addon (socket 9876) for Tasks 3–5. If the scene was restarted between Tasks 4 and 5, re-run `make_walls.py` before `make_ore_dressing.py` — the final export selects all 16 objects.
- **Do not trust Blender's viewport for color/emissive** — EEVEE's view transform lies about the in-game toon look. Judge silhouettes in Blender, colors in the game preview.
- **`rng()` call order changes the seeded look but nothing else** — layout, collision, and delve state never depend on these rolls. Don't try to keep roll counts stable across paths.
- **Keep the primitive fallbacks compiling** — they run for the first second of a cold load (and forever if the GLB 404s), which is exactly how `ResourceNode` degrades.
- **If a piece reads wrong in-game** (too dark, veins too loud), fix it in Blender (`flat_mat` colors / emission strength) and re-export — the game derives everything from the GLB. Do not add color constants to kit.js.
