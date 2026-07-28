# The Machine — Phases 1–2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Machine's core build loop — declarative part registry, `MachineSystem` (findings → analysis → staged builds → install → grants), save v15, and the machine standing live on the Landing Site with a walk-up console panel, covering Gens 0–2 plus infinite Expansion Racks.

**Architecture:** All part content lives in one declarative registry (`MACHINE_PARTS` in `server/definitions/systemsData.js`, imported client-side — the ProgressionDefinitions precedent). `MachineSystem` is pure state + generic keyed-effect appliers; field findings are computed from already-persisted state (Codex/Boss/Chapter systems), never stored. World visuals are primitive fallback bodies per the station convention (the Blender kit lands in the asset-pass plan); geometry truth lives in `js/scene/zones/LandingSite/machine.js`.

**Tech Stack:** Vanilla ES6 modules (no build step), three.js via importmap (`import * as THREE from 'three'`), `node:test` + `node:assert/strict`, tests registered manually in `tests/runAll.test.js`.

**Spec:** `docs/superpowers/specs/2026-07-27-physical-computer-design.md` (§4 loop, §5 grants, §6 architecture + modularity contract, §9 phases 1–2).

**Deliberately deferred to later plans** (do NOT build here): Postgres integration (phase 3), capability handlers `fieldBeacon`/`schematicPrinter` and Gens 3–7 (phase 4), `OfflineSystem` analysis row + away-banner entry (phase 3/4), interior zone (phase 5), GLB kit + `_registerStationModel`/`modelKeys` entries (phase 6). SaveSystem.apply feeds crafting.speedMult from the machine before crafting recomputes restored-job durations (apply-order guarantee, pinned by the v15 wiring test's ordering assert). Phase 3/4 pickups recorded by the final review: gen2's registry row gains `processSpeedMult: 1.2` when phase 4 wires that consumer (spec §5 says craft & process); the §4 field-data odometer and install codex entries are unshipped flavor for a later pass; the layout test's landmark coords are value-copies of LandingSite keepClear (comment-level coupling only).

**Conventions used throughout (verified against source 2026-07-27):**
- `InventorySystem`: zero-arg constructor; `this.materials[name]` public map; `hasMaterials({mat: qty})` → boolean; `removeMaterial(name, qty)` → boolean; `static MATERIAL_NAMES`.
- `PPSystem`: `ppTotal` public; `spend(cost)` → boolean; `globalMultiplier` recomputed every frame in main.js.
- `BossSystem.isDefeated('boss_landing')`; `CodexSystem.isDiscovered(key)`; `ChapterSystem.rungCrossed(rung)` / `wardensCrossedLifetime()`; story rungs: gen1↔1 (`boss_landing`), gen2↔3 (`boss_mine`).
- Toasts: `hud.showAchievementToast({ icon, label, desc, reward })` (reward 0 hides the PP line).
- Panels open via global `togglePanel('<id>')` (menuController); HUD refreshers are `_refresh<Name>()` (no "Panel" suffix).
- Commit trailer: end every commit message with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Part registry + validation tests

**Files:**
- Modify: `server/definitions/systemsData.js` (append at end of file)
- Create: `tests/systems/machineSystem.test.js`
- Modify: `tests/runAll.test.js` (add import line after `import './systems/computeSystem.test.js';`)

- [ ] **Step 1: Write the failing registry-validation tests**

Create `tests/systems/machineSystem.test.js`:

```js
// The Machine — part registry + MachineSystem.
// Spec: docs/superpowers/specs/2026-07-27-physical-computer-design.md
// The registry is the modularity contract: every effect key, material, boss,
// rung and codex reference must be REAL, so a data edit that typos a key
// fails here by name instead of silently doing nothing in-game.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MACHINE_PARTS, MACHINE_MINOR,
  MACHINE_GRANT_KEYS, MACHINE_RESTORE_KEYS, MACHINE_CAPABILITIES,
} from '../../server/definitions/systemsData.js';
import { InventorySystem } from '../../js/systems/InventorySystem.js';
import { BossSystem } from '../../js/systems/BossSystem.js';
import { CodexSystem } from '../../js/systems/CodexSystem.js';
import { ChapterSystem } from '../../js/systems/ChapterSystem.js';

const MATS = new Set(InventorySystem.MATERIAL_NAMES);
const BOSS_IDS = new Set(BossSystem.BOSS_DEFS.map(b => b.id));
const CODEX_KEYS = new Set(Object.keys(CodexSystem.ENTRIES));
const STORY_RUNGS = new Set(ChapterSystem.STORY.map(s => s.rung));

test('machine registry: every effect key, material, boss and codex ref is real', () => {
  const grantKeys = new Set(MACHINE_GRANT_KEYS);
  const restoreKeys = new Set(MACHINE_RESTORE_KEYS);
  const caps = new Set(MACHINE_CAPABILITIES);
  assert.ok(MACHINE_PARTS.length >= 3, 'phase 1 ships gen0..gen2 at minimum');
  for (const p of MACHINE_PARTS) {
    for (const k of Object.keys(p.grants)) {
      assert.ok(grantKeys.has(k), `${p.id}: unknown grant key '${k}'`);
    }
    for (const k of Object.keys(p.restore)) {
      assert.ok(restoreKeys.has(k), `${p.id}: unknown restore key '${k}'`);
    }
    assert.ok(caps.has(p.capability), `${p.id}: unknown capability '${p.capability}'`);
    for (const a of p.analyses) {
      assert.ok(a.duration > 0, `${p.id}/${a.id}: duration must be > 0`);
      for (const m of Object.keys(a.input)) {
        assert.ok(MATS.has(m), `${p.id}/${a.id}: unknown material '${m}'`);
      }
    }
    for (const [i, s] of p.stageBills.entries()) {
      assert.ok(s.pp > 0, `${p.id} stage ${i}: pp must be > 0`);
      for (const m of Object.keys(s.mats)) {
        assert.ok(MATS.has(m), `${p.id} stage ${i}: unknown material '${m}'`);
      }
    }
    if (p.findings.boss) assert.ok(BOSS_IDS.has(p.findings.boss), `${p.id}: unknown boss '${p.findings.boss}'`);
    if (p.findings.zoneLore) assert.ok(CODEX_KEYS.has(p.findings.zoneLore), `${p.id}: unknown codex key '${p.findings.zoneLore}'`);
    for (const c of p.findings.codex) {
      assert.ok(CODEX_KEYS.has(c), `${p.id}: unknown codex key '${c}'`);
    }
    if (p.gen > 0) {
      assert.ok(STORY_RUNGS.has(p.rung), `${p.id}: rung ${p.rung} is not a story rung`);
      assert.ok(p.analyses.length >= 1, `${p.id}: needs at least one analysis`);
      assert.ok(p.stageBills.length >= 2, `${p.id}: needs at least two build stages`);
    }
  }
  for (const m of Object.keys(MACHINE_MINOR.billBase.mats)) {
    assert.ok(MATS.has(m), `minor bill: unknown material '${m}'`);
  }
  assert.ok(MACHINE_MINOR.ppMultPerPart > 0 && MACHINE_MINOR.billGrowth > 1);
});

test('machine registry: generations contiguous from 0, rungs strictly ascend', () => {
  MACHINE_PARTS.forEach((p, i) => assert.equal(p.gen, i, `${p.id}: gen must be ${i}`));
  for (let i = 1; i < MACHINE_PARTS.length; i++) {
    assert.ok(MACHINE_PARTS[i].rung > MACHINE_PARTS[i - 1].rung, 'rungs must strictly ascend');
  }
  assert.equal(MACHINE_PARTS[0].rung, 0, 'gen0 has no chapter requirement');
});
```

- [ ] **Step 2: Register the test file and verify it fails**

In `tests/runAll.test.js`, after the line `import './systems/computeSystem.test.js';` add:

```js
import './systems/machineSystem.test.js';
```

Run: `npm test`
Expected: FAIL — `SyntaxError: The requested module '../../server/definitions/systemsData.js' does not provide an export named 'MACHINE_PARTS'`

- [ ] **Step 3: Append the registry to `server/definitions/systemsData.js`**

At the end of the file, append:

```js
// ── The Machine — part registry ──────────────────────────────────────────────
// Spec: docs/superpowers/specs/2026-07-27-physical-computer-design.md
// One entry per story generation. Effects are KEYED DATA consumed by generic
// appliers in js/systems/MachineSystem.js — reassigning an improvement to a
// different chapter is an edit to THIS file only. Grant/restore/capability
// keys are validated against the lists below by tests/systems/machineSystem.test.js.
// Client imports this directly (ProgressionDefinitions precedent); seed.js
// will upsert it to Postgres in the phase-3 plan.

export const MACHINE_GRANT_KEYS = [
  'gatherMult',       // × gather speed (main.js gather-duration sites)
  'craftSpeedMult',   // × crafting speed (CraftingSystem.speedMult)
  'ppMult',           // folds into ppSystem.globalMultiplier
  // Declared for later generations (consumers wired in the phase-4 plan):
  'processSpeedMult', 'damageMult', 'droneMult', 'trainingMult',
  'computeUnits', 'offlineBufferH',
];

export const MACHINE_RESTORE_KEYS = [
  // Run-layer rebirth head-starts, consumed by AscensionSystem (phase-4 plan).
  'baseCapStart', 'keyKeepFrac', 'ladderFloorDiv',
  'momentumKneeMinusMin', 'momentumFloor', 'ppRefillFrac',
];

export const MACHINE_CAPABILITIES = [
  'analysisBay', 'fieldBeacon', 'schematicPrinter', 'gateRecall',
  'trainingSlot', 'interiorDoor', 'loadoutSnapshots', 'continuityRestore',
];

export const MACHINE_PARTS = [
  {
    id: 'gen0', gen: 0, rung: 0, name: 'Field Core', tierName: null,
    capability: 'analysisBay',
    grants: {}, restore: {},
    findings: { zoneLore: null, boss: null, codex: [] },
    analyses: [],
    stageBills: [
      { pp: 40, mats: { stone: 6, copper: 4 } },
      { pp: 80, mats: { iron: 4, fiber: 6 } },
    ],
  },
  {
    id: 'gen1', gen: 1, rung: 1, name: 'Calibration Bank', tierName: 'Motor calibration',
    capability: 'fieldBeacon',
    grants: { gatherMult: 1.15 },
    restore: { baseCapStart: 225 },
    findings: {
      zoneLore: 'theLanding', boss: 'boss_landing',
      codex: ['mossback', 'burrfang', 'stiltbeak'],
    },
    analyses: [
      { id: 'meadow_flora', label: 'Meadow flora assay', input: { fiber: 8, seed: 2 }, duration: 240 },
      { id: 'scrap_alloys', label: 'Scrap alloy census', input: { copper: 8, iron: 6 }, duration: 300 },
    ],
    stageBills: [
      { pp: 150, mats: { timber: 10, stone: 10 } },
      { pp: 250, mats: { iron: 8, copper: 8, circuitWire: 2 } },
      { pp: 400, mats: { fiber: 10, resin: 4 } },
    ],
  },
  {
    id: 'gen2', gen: 2, rung: 3, name: 'Fabrication Co-processor', tierName: 'Built infrastructure',
    capability: 'schematicPrinter',
    grants: { craftSpeedMult: 1.2 },
    restore: { keyKeepFrac: 0.25 },
    findings: {
      zoneLore: 'theMine', boss: 'boss_mine',
      codex: ['scalerunner', 'duneplate', 'bramblemaw'],
    },
    analyses: [
      { id: 'ore_bands', label: 'Ore band spectrometry', input: { silica: 6, quartz: 4 }, duration: 420 },
      { id: 'deep_carbon', label: 'Deep carbon dating', input: { carbon: 6, stone: 12 }, duration: 420 },
      { id: 'drill_wear', label: 'Drill wear forensics', input: { iron: 10, ironSpike: 2 }, duration: 480 },
    ],
    stageBills: [
      { pp: 600, mats: { stone: 20, iron: 12 } },
      { pp: 900, mats: { alloy_bar: 2, silica: 8 } },
      { pp: 1400, mats: { steel_ingot: 2, logicChip: 2, quartz: 6 } },
    ],
  },
];

export const MACHINE_MINOR = {
  name: 'Expansion Rack',
  ppMultPerPart: 0.04,   // +4% each, additive: ppMult factor = 1 + n × this
  billBase: { pp: 400, mats: { iron: 10, copper: 10, stone: 10 } },
  billGrowth: 1.6,       // whole bill (pp and every mat) scales ×1.6^built
  matCap: 60,            // per-material ceiling — bag stacks cap at 99, so material
                         // lines clamp here to keep the infinite rack tail payable;
                         // PP is the leg that scales forever
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (both new tests green, all existing tests still green).

- [ ] **Step 5: Commit**

```bash
git add server/definitions/systemsData.js tests/systems/machineSystem.test.js tests/runAll.test.js
git commit -m "feat(machine): declarative MACHINE_PARTS registry + validation tests

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: MachineSystem — state, dossier lookups, computed findings

**Files:**
- Create: `js/systems/MachineSystem.js`
- Modify: `tests/systems/machineSystem.test.js` (append)

- [ ] **Step 1: Append failing behavior tests**

Append to `tests/systems/machineSystem.test.js`:

```js
import { MachineSystem } from '../../js/systems/MachineSystem.js';
import { PPSystem } from '../../js/systems/PPSystem.js';

// Real systems where cheap, tiny stubs where not (chapterSystem.test.js idiom).
function makeMachine() {
  const pp = new PPSystem();
  pp.ppTotal = 1e9;
  const inv = new InventorySystem();
  for (const m of InventorySystem.MATERIAL_NAMES) inv.materials[m] = 99;
  const machine = new MachineSystem(inv, pp);
  machine.codex = new CodexSystem();
  machine.bosses = new BossSystem(pp);
  machine.chapters = { rungCrossed: () => false, wardensCrossedLifetime: () => 0 };
  return { machine, pp, inv };
}

test('machine: gen0 is buildable immediately; later parts lock on rung', () => {
  const { machine } = makeMachine();
  assert.equal(machine.currentGen, -1);
  assert.equal(machine.partState('gen0'), 'building', 'gen0 has no findings and no rung gate');
  assert.equal(machine.partState('gen1'), 'locked', 'rung 1 not crossed yet');
  machine.chapters.rungCrossed = () => true;
  assert.equal(machine.partState('gen1'), 'investigating', 'rung crossed but findings incomplete');
});

test('machine: field findings compute live from codex + bosses, never stored', () => {
  const { machine } = makeMachine();
  machine.chapters.rungCrossed = () => true;
  let f = machine.fieldFindings('gen1');
  assert.equal(f.total, 5, 'zone lore + boss + 3 codex specimens');
  assert.equal(f.done, 0);
  machine.codex.discover('theLanding');
  machine.codex.discover('mossback');
  machine.bosses.recordDefeat('boss_landing');
  f = machine.fieldFindings('gen1');
  assert.equal(f.done, 3);
  assert.equal(f.complete, false);
  machine.codex.discover('burrfang');
  machine.codex.discover('stiltbeak');
  assert.equal(machine.fieldFindings('gen1').complete, true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module ... js/systems/MachineSystem.js`

- [ ] **Step 3: Create `js/systems/MachineSystem.js`**

```js
// The Machine — the surface computer the game is named for. Chapter-capstone
// parts are built from field findings (computed live from already-persisted
// state — the player is always inspecting just by playing), lab analyses
// (specimens studied at the Analysis Bay), and staged material bills.
// All part CONTENT lives in MACHINE_PARTS (server/definitions/systemsData.js):
// remapping improvements between chapters is a data edit, never code here.
// Spec: docs/superpowers/specs/2026-07-27-physical-computer-design.md
import {
  MACHINE_PARTS, MACHINE_MINOR,
} from '../../server/definitions/systemsData.js';

// Grant keys with a live consumer wired in main.js TODAY. The registry may
// declare more (MACHINE_GRANT_KEYS) for later phases, but a part may only
// USE a key once its consumer exists — pinned by the registry test so a
// data edit can never silently do nothing in-game.
export const CONSUMED_GRANT_KEYS = ['gatherMult', 'craftSpeedMult', 'ppMult'];

export class MachineSystem {
  static get PARTS() { return MACHINE_PARTS; }
  static get MINOR() { return MACHINE_MINOR; }

  constructor(inventorySystem, ppSystem) {
    this.inventory = inventorySystem;
    this.pp = ppSystem;
    // Wired in main.js after construction (ChapterSystem convention):
    this.codex = null;     // CodexSystem — isDiscovered()
    this.bosses = null;    // BossSystem — isDefeated()
    this.chapters = null;  // ChapterSystem — rungCrossed(), wardensCrossedLifetime()

    this.installed = new Set();   // part ids
    this.stagesDelivered = {};    // partId -> stages delivered so far
    this.analysesDone = {};       // partId -> Set of completed analysis ids
    this.analysisJob = null;      // { partId, analysisId, progress, duration } | null
    this.analysisQueue = [];      // [{ partId, analysisId, duration }]
    this.minorsBuilt = 0;

    this.onInstall = null;           // fn(part) — toast + world refresh in main.js
    this.onAnalysisComplete = null;  // fn(partId, analysisId)
  }

  // ── Registry lookups ───────────────────────────────────────────────────────
  getPart(id) { return MACHINE_PARTS.find(p => p.id === id) || null; }

  get currentGen() {
    let g = -1;
    for (const p of MACHINE_PARTS) if (this.installed.has(p.id)) g = Math.max(g, p.gen);
    return g;
  }

  get analysisUnlocked() { return this.installed.has('gen0'); }

  consoleHint() {
    return this.currentGen < 0
      ? '[E/ACT] Salvage Heap — assemble the Field Core'
      : '[E/ACT] Machine Console';
  }

  // ── Findings — the "always inspecting" contract: computed, never stored ────
  fieldFindings(partId) {
    const p = this.getPart(partId);
    if (!p) return { rows: [], done: 0, total: 0, complete: false };
    const rows = [];
    if (p.findings.zoneLore) {
      rows.push({ label: 'Zone surveyed', done: !!this.codex?.isDiscovered(p.findings.zoneLore) });
    }
    if (p.findings.boss) {
      rows.push({ label: 'Apex threat neutralized', done: !!this.bosses?.isDefeated(p.findings.boss) });
    }
    for (const key of p.findings.codex) {
      const entry = this.codex ? this.codex.constructor.ENTRIES[key] : null;
      rows.push({ label: `Specimen logged: ${entry ? entry.label : key}`, done: !!this.codex?.isDiscovered(key) });
    }
    const done = rows.filter(r => r.done).length;
    return { rows, done, total: rows.length, complete: done === rows.length };
  }

  labFindings(partId) {
    const p = this.getPart(partId);
    if (!p) return { done: 0, total: 0, complete: false };
    const set = this.analysesDone[partId] || new Set();
    const done = p.analyses.filter(a => set.has(a.id)).length;
    return { done, total: p.analyses.length, complete: done >= p.analyses.length };
  }

  // locked → investigating → building → installed
  partState(partId) {
    const p = this.getPart(partId);
    if (!p) return 'unknown';
    if (this.installed.has(p.id)) return 'installed';
    if (p.gen > 0 && !(this.chapters && this.chapters.rungCrossed(p.rung))) return 'locked';
    if (!this.fieldFindings(partId).complete || !this.labFindings(partId).complete) return 'investigating';
    return 'building';
  }

  // ── Grants — generic keyed applier (the modularity contract) ───────────────
  // Live getters — recomputed on every read (BossSystem/ChallengeSystem
  // convention), so direct mutation of `installed`/`minorsBuilt` can never
  // leave a stale cache. Keys listed in CONSUMED_GRANT_KEYS are the ones
  // with live consumers; the registry test pins parts to that list.
  _grantProduct(key) {
    let v = 1;
    for (const p of MACHINE_PARTS) {
      if (this.installed.has(p.id) && p.grants[key]) v *= p.grants[key];
    }
    return v;
  }

  get gatherMult() { return this._grantProduct('gatherMult'); }
  get craftSpeedMult() { return this._grantProduct('craftSpeedMult'); }
  get ppMult() {
    return this._grantProduct('ppMult') * (1 + MACHINE_MINOR.ppMultPerPart * this.minorsBuilt);
  }

  restoreTiers() {
    const out = {};
    // Later generations supersede earlier ones — tiers are cumulative fidelity, not stacking bonuses (last write wins; registry order is gen-ascending, test-pinned).
    for (const p of MACHINE_PARTS) {
      if (!this.installed.has(p.id)) continue;
      for (const [k, v] of Object.entries(p.restore)) out[k] = v;
    }
    return out;
  }

  // Grants are live getters, so there is nothing to re-apply after a load;
  // kept as a documented no-op because SaveSystem.apply() calls it by
  // convention, and phase 4's additive grants (computeUnits) will need it.
  applyBonuses() {}
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/systems/MachineSystem.js tests/systems/machineSystem.test.js
git commit -m "feat(machine): MachineSystem state, dossiers, computed field findings

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Analysis Bay — enqueue, tick, offline closed form

**Files:**
- Modify: `js/systems/MachineSystem.js`
- Modify: `tests/systems/machineSystem.test.js` (append)

- [ ] **Step 1: Append failing tests**

```js
test('machine: analysis bay consumes inputs at enqueue and completes over time', () => {
  const { machine, inv } = makeMachine();
  machine.chapters.rungCrossed = () => true;
  assert.equal(machine.enqueueAnalysis('gen1', 'meadow_flora'), false, 'bay offline before gen0');
  machine.installed.add('gen0');
  const fiberBefore = inv.materials.fiber;
  assert.equal(machine.enqueueAnalysis('gen1', 'meadow_flora'), true);
  assert.equal(inv.materials.fiber, fiberBefore - 8, 'inputs consumed at enqueue');
  assert.equal(machine.enqueueAnalysis('gen1', 'meadow_flora'), false, 'no duplicate enqueue');
  assert.equal(machine.enqueueAnalysis('gen1', 'scrap_alloys'), true, 'second analysis queues');
  machine.update(239);
  assert.equal(machine.labFindings('gen1').done, 0);
  machine.update(2);
  assert.equal(machine.labFindings('gen1').done, 1, 'first analysis complete');
  assert.ok(machine.analysisJob, 'queued job auto-started');
});

test('machine: simulateOffline finishes jobs closed-form and suppresses callbacks', () => {
  const { machine } = makeMachine();
  machine.chapters.rungCrossed = () => true;
  machine.installed.add('gen0');
  let fired = 0;
  machine.onAnalysisComplete = () => { fired++; };
  machine.enqueueAnalysis('gen1', 'meadow_flora'); // 240s
  machine.enqueueAnalysis('gen1', 'scrap_alloys'); // 300s
  const completed = machine.simulateOffline(400);
  assert.equal(completed, 1, '240s job done, 160s into the 300s job');
  assert.equal(fired, 0, 'offline completion is silent');
  assert.ok(Math.abs(machine.analysisJob.progress - 160) < 1e-9);
  assert.equal(machine.simulateOffline(140), 1, 'remainder finishes');
  assert.equal(machine.labFindings('gen1').complete, true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `machine.enqueueAnalysis is not a function`

- [ ] **Step 3: Add the Analysis Bay block to `MachineSystem`**

Insert between the `partState` method and the `_recompute` section:

```js
  // ── Analysis Bay (gen0 capability) — processing-node conventions:
  // inputs consumed at enqueue, the queue IS the stock, offline closed form. ──
  analysisDone(partId, analysisId) {
    return (this.analysesDone[partId] || new Set()).has(analysisId);
  }

  analysisQueued(partId, analysisId) {
    if (this.analysisJob && this.analysisJob.partId === partId && this.analysisJob.analysisId === analysisId) return true;
    return this.analysisQueue.some(q => q.partId === partId && q.analysisId === analysisId);
  }

  enqueueAnalysis(partId, analysisId) {
    if (!this.analysisUnlocked) return false;
    const p = this.getPart(partId);
    const a = p ? p.analyses.find(x => x.id === analysisId) : null;
    if (!a) return false;
    if (this.analysisDone(partId, analysisId) || this.analysisQueued(partId, analysisId)) return false;
    if (!this.inventory.hasMaterials(a.input)) return false;
    for (const [mat, qty] of Object.entries(a.input)) this.inventory.removeMaterial(mat, qty);
    const job = { partId, analysisId, duration: a.duration };
    if (this.analysisJob) this.analysisQueue.push(job);
    else this.analysisJob = { ...job, progress: 0 };
    return true;
  }

  update(delta) {
    if (!this.analysisJob) return;
    this.analysisJob.progress += delta;
    if (this.analysisJob.progress >= this.analysisJob.duration) this._completeAnalysis();
  }

  _completeAnalysis() {
    const { partId, analysisId } = this.analysisJob;
    if (!this.analysesDone[partId]) this.analysesDone[partId] = new Set();
    this.analysesDone[partId].add(analysisId);
    const next = this.analysisQueue.shift() || null;
    this.analysisJob = next ? { ...next, progress: 0 } : null;
    if (this.onAnalysisComplete) this.onAnalysisComplete(partId, analysisId);
  }

  simulateOffline(seconds) {
    if (!(seconds > 0)) return 0;
    const savedCb = this.onAnalysisComplete;
    this.onAnalysisComplete = null;
    let completed = 0;
    let budget = seconds;
    while (this.analysisJob && budget > 0) {
      const remaining = this.analysisJob.duration - this.analysisJob.progress;
      if (remaining <= budget) {
        budget -= remaining;
        this._completeAnalysis();
        completed++;
      } else {
        this.analysisJob.progress += budget;
        budget = 0;
      }
    }
    this.onAnalysisComplete = savedCb;
    return completed;
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/systems/MachineSystem.js tests/systems/machineSystem.test.js
git commit -m "feat(machine): Analysis Bay — enqueue-consumes, tick, offline closed form

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Build stages, install, grants, Expansion Racks

**Files:**
- Modify: `js/systems/MachineSystem.js`
- Modify: `tests/systems/machineSystem.test.js` (append)

- [ ] **Step 1: Append failing tests**

```js
function completeInvestigation(machine, partId) {
  const p = machine.getPart(partId);
  if (p.findings.zoneLore) machine.codex.discover(p.findings.zoneLore);
  for (const c of p.findings.codex) machine.codex.discover(c);
  if (p.findings.boss) machine.bosses.recordDefeat(p.findings.boss);
  for (const a of p.analyses) machine.enqueueAnalysis(partId, a.id);
  machine.simulateOffline(1e7);
}

test('machine: staged delivery spends bills and the final stage installs', () => {
  const { machine, pp, inv } = makeMachine();
  let installed = null;
  machine.onInstall = (part) => { installed = part.id; };
  const ppBefore = pp.ppTotal;
  const stoneBefore = inv.materials.stone;
  assert.equal(machine.deliverStage('gen0'), true);
  assert.equal(pp.ppTotal, ppBefore - 40);
  assert.equal(inv.materials.stone, stoneBefore - 6);
  assert.equal(machine.partState('gen0'), 'building', 'one stage left');
  assert.equal(machine.deliverStage('gen0'), true);
  assert.equal(installed, 'gen0', 'final stage fires onInstall');
  assert.equal(machine.currentGen, 0);
  assert.equal(machine.deliverStage('gen0'), false, 'installed part takes no more deliveries');
});

test('machine: grants go live on install through the live getters', () => {
  const { machine } = makeMachine();
  machine.chapters.rungCrossed = () => true;
  machine.deliverStage('gen0'); machine.deliverStage('gen0');
  assert.equal(machine.gatherMult, 1);
  completeInvestigation(machine, 'gen1');
  assert.equal(machine.partState('gen1'), 'building');
  for (let i = 0; i < 3; i++) assert.equal(machine.deliverStage('gen1'), true, `gen1 stage ${i}`);
  assert.ok(Math.abs(machine.gatherMult - 1.15) < 1e-9, 'gen1 grant live');
  assert.deepEqual(machine.restoreTiers(), { baseCapStart: 225 });
});

test('machine: restore tiers only ever use run-layer keys', () => {
  // The run-layer guarantee is structural: the registry key set is closed and
  // every key names a field recompileReset()/recompile() already clears.
  for (const p of MACHINE_PARTS) {
    for (const k of Object.keys(p.restore)) {
      assert.ok(MACHINE_RESTORE_KEYS.includes(k), `${p.id}: restore key '${k}' outside the closed run-layer set`);
    }
  }
});

test('machine: expansion racks scale bills ×1.6 and stack +4% PP each', () => {
  const { machine } = makeMachine();
  machine.deliverStage('gen0'); machine.deliverStage('gen0');
  assert.equal(machine.canBuildMinor(), false, 'no warden rungs crossed');
  machine.chapters.wardensCrossedLifetime = () => 2;
  assert.equal(machine.minorsAvailable, 2);
  const bill0 = machine.minorBill();
  assert.equal(bill0.pp, 400);
  assert.equal(machine.buildMinor(), true);
  const bill1 = machine.minorBill();
  assert.equal(bill1.pp, Math.ceil(400 * 1.6));
  assert.equal(bill1.mats.iron, Math.ceil(10 * 1.6));
  assert.equal(machine.buildMinor(), true);
  assert.equal(machine.minorsAvailable, 0);
  assert.equal(machine.buildMinor(), false, 'no rack without a crossed rung behind it');
  assert.ok(Math.abs(machine.ppMult - 1.08) < 1e-9, 'two racks = +8%');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `machine.deliverStage is not a function`

- [ ] **Step 3: Add stages + minors to `MachineSystem`**

Insert between the Analysis Bay block and the Grants section:

```js
  // ── Build stages + install ──────────────────────────────────────────────────
  stageBill(partId) {
    const p = this.getPart(partId);
    if (!p || this.installed.has(partId)) return null;
    return p.stageBills[this.stagesDelivered[partId] || 0] || null;
  }

  canDeliverStage(partId) {
    if (this.partState(partId) !== 'building') return false;
    const bill = this.stageBill(partId);
    return !!bill && this.pp.ppTotal >= bill.pp && this.inventory.hasMaterials(bill.mats);
  }

  deliverStage(partId) {
    if (!this.canDeliverStage(partId)) return false;
    const bill = this.stageBill(partId);
    if (!this.pp.spend(bill.pp)) return false;
    for (const [mat, qty] of Object.entries(bill.mats)) this.inventory.removeMaterial(mat, qty);
    this.stagesDelivered[partId] = (this.stagesDelivered[partId] || 0) + 1;
    const p = this.getPart(partId);
    if (this.stagesDelivered[partId] >= p.stageBills.length) this._install(p);
    return true;
  }

  _install(part) {
    this.installed.add(part.id);
    if (this.onInstall) this.onInstall(part);
  }

  // ── Expansion Racks — one earned per crossed warden rung, forever ──────────
  get minorsAvailable() {
    const crossed = this.chapters ? this.chapters.wardensCrossedLifetime() : 0;
    return Math.max(0, crossed - this.minorsBuilt);
  }

  minorBill() {
    const scale = Math.pow(MACHINE_MINOR.billGrowth, this.minorsBuilt);
    const mats = {};
    for (const [m, q] of Object.entries(MACHINE_MINOR.billBase.mats)) {
      mats[m] = Math.min(MACHINE_MINOR.matCap, Math.ceil(q * scale));
    }
    return { pp: Math.ceil(MACHINE_MINOR.billBase.pp * scale), mats };
  }

  canBuildMinor() {
    if (this.currentGen < 0 || this.minorsAvailable <= 0) return false;
    const bill = this.minorBill();
    return this.pp.ppTotal >= bill.pp && this.inventory.hasMaterials(bill.mats);
  }

  buildMinor() {
    if (!this.canBuildMinor()) return false;
    const bill = this.minorBill();
    if (!this.pp.spend(bill.pp)) return false;
    for (const [mat, qty] of Object.entries(bill.mats)) this.inventory.removeMaterial(mat, qty);
    this.minorsBuilt += 1;
    if (this.onInstall) {
      this.onInstall({
        id: `minor_${this.minorsBuilt}`, gen: this.currentGen,
        name: `${MACHINE_MINOR.name} ${this.minorsBuilt}`, minor: true,
      });
    }
    return true;
  }
```

Also add the import of `MACHINE_RESTORE_KEYS` to the test file's existing import from `systemsData.js` if not already present (it is — Task 1 imported it).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

**Review carry-forwards folded into this task (Task 3 quality review):** generic `hasCapability(cap)` + `analysisUnlocked` via `'analysisBay'` capability (data-edit remappability); a comment on `update()` routing future catch-up through `simulateOffline`; shortfall/unknown-id enqueue test; edge-behavior pin test (overflow discard, callback suppression + restoration, zero-second no-op, queued-job payment).

**Second review pass (Task 4 quality review):** fixed a Critical design collision — Expansion Rack material bills grew unbounded (×1.6 per part) and would exceed the 99-per-material bag-stack cap around rack 6, contradicting the "infinite racks" decision, so `MACHINE_MINOR.matCap` (60) now clamps every material line in `minorBill()` while PP keeps scaling forever; added two gate-pinning tests (`'machine: purchases actually charge and gates actually gate'`, `'machine: racks stay payable forever (mat cap under the bag stack)'`) after a mutation battery found the payment/entitlement gates unprotected; and deleted `'machine: restore tiers only ever use run-layer keys'` as redundant with the registry test's existing restore-key assertion over the same data.

- [ ] **Step 5: Commit**

```bash
git add js/systems/MachineSystem.js tests/systems/machineSystem.test.js
git commit -m "feat(machine): staged builds, install grants, expansion racks

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Serialization + SaveSystem v15

**Files:**
- Modify: `js/systems/MachineSystem.js` (append methods)
- Modify: `js/systems/SaveSystem.js`
- Modify: `tests/systems/machineSystem.test.js` (append)

- [ ] **Step 1: Append failing tests**

```js
import fs from 'node:fs';

test('machine: serialize → deserialize → applyBonuses round-trips exactly', () => {
  const { machine } = makeMachine();
  machine.chapters.rungCrossed = () => true;
  machine.chapters.wardensCrossedLifetime = () => 3;
  machine.deliverStage('gen0'); machine.deliverStage('gen0');
  completeInvestigation(machine, 'gen1');
  machine.deliverStage('gen1');
  machine.buildMinor();
  machine.enqueueAnalysis('gen2', 'ore_bands');
  machine.update(100);

  const blob = JSON.parse(JSON.stringify(machine.serialize()));
  const { machine: fresh } = makeMachine();
  fresh.deserialize(blob);
  fresh.applyBonuses();

  assert.equal(fresh.currentGen, 0);
  assert.equal(fresh.stagesDelivered.gen1, 1);
  assert.equal(fresh.minorsBuilt, 1);
  assert.equal(fresh.analysisDone('gen1', 'meadow_flora'), true);
  assert.ok(Math.abs(fresh.analysisJob.progress - 100) < 1e-9, 'in-flight analysis survives');
  assert.ok(Math.abs(fresh.ppMult - 1.04) < 1e-9, 'grants recomputed after load');
  assert.equal(fresh.deserialize(null), undefined, 'null blob (pre-v15 save) is a no-op');
});

test('SaveSystem carries the machine (v15 wiring)', () => {
  const src = fs.readFileSync(new URL('../../js/systems/SaveSystem.js', import.meta.url), 'utf8');
  assert.ok(src.includes('const SAVE_VERSION = 15'), 'SAVE_VERSION must be 15');
  const destructures = src.match(/const \{[\s\S]*?\} = this\.systems;/g) || [];
  assert.equal(destructures.length, 2, 'expected the two systems destructures');
  for (const d of destructures) assert.ok(/\bmachine\b/.test(d), 'machine missing from a systems destructure');
  assert.ok(/machine:\s*machine \? machine\.serialize\(\) : null,/.test(src), 'serialize entry missing');
  assert.ok(/machine\.deserialize\(data\.machine \?\? null\)/.test(src), 'apply entry missing');
  assert.ok(/machine\.applyBonuses\(\)/.test(src), 'applyBonuses call missing');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `machine.serialize is not a function`

- [ ] **Step 3: Append persistence methods to `MachineSystem`** (end of class)

```js
  // ── Persistence (SaveSystem v15) ────────────────────────────────────────────
  serialize() {
    return {
      installed: [...this.installed],
      stagesDelivered: { ...this.stagesDelivered },
      analysesDone: Object.fromEntries(
        Object.entries(this.analysesDone).map(([k, v]) => [k, [...v]])
      ),
      analysisJob: this.analysisJob ? { ...this.analysisJob } : null,
      analysisQueue: this.analysisQueue.map(q => ({ ...q })),
      minorsBuilt: this.minorsBuilt,
    };
  }

  deserialize(data) {
    if (!data) return;
    this.installed = new Set(data.installed || []);
    this.stagesDelivered = { ...(data.stagesDelivered || {}) };
    this.analysesDone = {};
    for (const [k, v] of Object.entries(data.analysesDone || {})) this.analysesDone[k] = new Set(v);
    this.analysisJob = data.analysisJob ? { ...data.analysisJob } : null;
    this.analysisQueue = (data.analysisQueue || []).map(q => ({ ...q }));
    this.minorsBuilt = Number(data.minorsBuilt) || 0;
    // A hand-edited or corrupted blob can carry a malformed job: no positive
    // duration → drop it (a NaN job would jam the bay forever, while still
    // charging materials for every later enqueue); progress past duration →
    // clamp, so simulateOffline's remaining-time math can never go negative
    // and inflate the offline budget through the whole queue.
    if (this.analysisJob && !(this.analysisJob.duration > 0)) {
      this.analysisJob = null;
    } else if (this.analysisJob && !(this.analysisJob.progress <= this.analysisJob.duration)) {
      this.analysisJob.progress = this.analysisJob.duration;
    }
  }
```

- [ ] **Step 4: Wire SaveSystem v15**

In `js/systems/SaveSystem.js`:

1. Line 3: change `const SAVE_VERSION = 14;` → `const SAVE_VERSION = 15;`
2. In BOTH destructure blocks (in `_buildSaveData()` and in `apply()`), change the last destructure line `  compute,` → `  compute, machine,`
3. In the serialize object, directly after the line `compute:       compute       ? compute.serialize()       : null,` add:

```js
      machine: machine ? machine.serialize() : null,
```

4. In `apply()`, directly after the compute deserialize line (`compute.deserialize(data.compute ?? null)` and its surrounding `if`), add:

```js
    if (machine) {
      machine.deserialize(data.machine ?? null);
      machine.applyBonuses(); // grants are recomputed, never trusted from the blob
    }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

**Review carry-forwards folded into this task:** deserialize progress clamp + pin test (Task 3 review); stage/rack material-shortfall refusal pins and the n=2 ceil pin (Task 4 re-review); `import fs` placed in the top import block; second-pass hardening: queue round-trip pin, budget-inflation pin, malformed-job drop, Number coercion on minorsBuilt, non-vacuous null-blob pin.

- [ ] **Step 6: Commit**

```bash
git add js/systems/MachineSystem.js js/systems/SaveSystem.js tests/systems/machineSystem.test.js
git commit -m "feat(machine): serialization + SaveSystem v15

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: CraftingSystem speed hook (gen2's consumer)

**Files:**
- Modify: `js/systems/CraftingSystem.js`
- Modify: `tests/systems/machineSystem.test.js` (append)

- [ ] **Step 1: Append the failing behavioral test**

```js
test('the machine speed grant divides craft time', () => {
  const make = () => new CraftingSystem(
    { hasTool: () => false, hasMaterials: () => true, removeMaterial: () => true },
    { stats: { crafting: { level: 1 }, craftingSpeed: { level: 0 } } },
    { recipes: { ration: { label: 'Ration', type: 'consumable', key: 'ration', materials: {}, baseTime: 4, minCraftingLevel: 1 } } },
  );
  const c = make();
  assert.equal(c.getAvailableRecipes()[0].craftTime, 4);
  c.speedMult = 2;
  assert.equal(c.getAvailableRecipes()[0].craftTime, 2);
  c.startCraft('ration');
  assert.equal(c._craftingDuration, 2, 'the started job uses the boosted duration');
});
```

`import { CraftingSystem } from '../../js/systems/CraftingSystem.js';` goes in the test file's existing top import block, not a new one local to this test.

- [ ] **Step 2: Run tests to verify it fails**

Run: `npm test`
Expected: FAIL — `craftTime` is `NaN` (`this.speedMult` is undefined before Step 3 adds the field).

- [ ] **Step 3: Add the hook**

In `js/systems/CraftingSystem.js`, after the line `this.maxQueueSize = 5;` add:

```js
    this.speedMult = 1; // × crafting speed, always ≥1 (machine grant product; set per frame in main.js)
```

Then change the craft-time return (currently):

```js
    return (baseTime * masteryMult) / (1 + this.stats.stats.craftingSpeed.level * 0.2);
```

to:

```js
    return (baseTime * masteryMult) / ((1 + this.stats.stats.craftingSpeed.level * 0.2) * this.speedMult);
```

- [ ] **Step 4: Run tests + syntax check**

Run: `npm test` → PASS. Run: `node --check js/systems/CraftingSystem.js` → no output.

**Review pass:** guard dropped (producer is total; 0 must mean paused if a gate ever feeds this), source-pin replaced with behavioral coverage; main.js feed gets its own pin in Task 7.

- [ ] **Step 5: Commit**

```bash
git add js/systems/CraftingSystem.js tests/systems/machineSystem.test.js
git commit -m "feat(machine): crafting speed hook for the Fabrication Co-processor

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: main.js wiring — instantiate, fold grants, tick, interact, save

**Files:**
- Modify: `js/main.js`

All anchors below were verified 2026-07-27; if a line has drifted, find it by the quoted text, not the line number.

- [ ] **Step 1: Import + instantiate**

Add to the systems import block at the top of `js/main.js`:

```js
import { MachineSystem } from './systems/MachineSystem.js';
```

After the line `const chapterSystem   = new ChapterSystem(bossSystem, ppSystem);` add:

```js
const machineSystem   = new MachineSystem(inventorySystem, ppSystem);
```

- [ ] **Step 2: Wire refs + callbacks**

Next to the existing post-construction attachments (`hud.prog.chapters = chapterSystem;` around line 542), add:

```js
machineSystem.codex = codexSystem;
machineSystem.bosses = bossSystem;
machineSystem.chapters = chapterSystem;
hud.machine = machineSystem;
env._machineState = () => ({ gen: machineSystem.currentGen, minors: machineSystem.minorsBuilt });
machineSystem.onInstall = (part) => {
  hud.showAchievementToast({
    icon: '🛠️',
    label: `${part.name} installed`,
    desc: part.minor ? 'The machine grows.' : `Machine generation ${part.gen} online.`,
    reward: 0,
  });
  env.refreshMachine();
  const panel = document.getElementById('machine-panel');
  if (panel && !panel.hidden) hud._refreshMachine();
};
machineSystem.onAnalysisComplete = () => {
  const panel = document.getElementById('machine-panel');
  if (panel && !panel.hidden) hud._refreshMachine();
};
```

- [ ] **Step 3: Fold grants into the per-frame recompute block**

Change (currently at ~line 1627):

```js
  ppSystem.globalMultiplier = ascension.ppMultiplier * challenges.ppRateMult * factorySystem.moduleGlobalMult;
```

to:

```js
  ppSystem.globalMultiplier = ascension.ppMultiplier * challenges.ppRateMult * factorySystem.moduleGlobalMult * machineSystem.ppMult;
  craftingSystem.speedMult = machineSystem.craftSpeedMult;
```

- [ ] **Step 4: Fold gather grant into BOTH gather-duration sites**

Site 1 (~line 820) — change:

```js
    / (statsSystem.gatherSpeedMult * modifiers.gatherMult * ascension.gatherMultiplier);
```

to:

```js
    / (statsSystem.gatherSpeedMult * modifiers.gatherMult * ascension.gatherMultiplier * machineSystem.gatherMult);
```

Site 2 (~line 933) — change:

```js
          _gatherDuration = 2.5 * (techTree?.owned.has('swiftHarvest') ? 0.8 : 1) / (statsSystem.gatherSpeedMult * modifiers.gatherMult * ascension.gatherMultiplier);
```

to:

```js
          _gatherDuration = 2.5 * (techTree?.owned.has('swiftHarvest') ? 0.8 : 1) / (statsSystem.gatherSpeedMult * modifiers.gatherMult * ascension.gatherMultiplier * machineSystem.gatherMult);
```

- [ ] **Step 5: Tick + interaction + save bag**

In the game loop next to `trainingAreas.update(delta);` add:

```js
  machineSystem.update(delta);
```

In the interaction candidates function, after the training-console `reg(...)` block, add:

```js
  // The Machine — surface computer console (Landing Site plot)
  reg(env.getMachineConsolePos(), machineSystem.consoleHint(), () => {
    if (_actionCooldown <= 0) { togglePanel('machine-panel'); _actionCooldown = 0.5; }
  });
```

(`reg` already null-guards the position, and the console position only exists in the Landing Site.)

In the `new SaveSystem({ ... })` bag, after `compute: computeSystem,` add:

```js
  machine: machineSystem,
```

- [ ] **Step 6: Syntax check + full tests**

Run: `node --check js/main.js` → no output. Run: `npm test` → PASS (the SaveSystem source pin from Task 5 still passes; nothing here changes test-visible files except main.js which has no direct test).

**Review carry-forwards folded into this task (Task 8 re-review + the main.js feed pin):** a source-pin test (`'main.js feeds the machine (wiring pins)'`) asserting main.js actually feeds the machine — `ppMult`/`craftSpeedMult`/`gatherMult` (both sites)/`update(delta)`/the SaveSystem bag/`env._machineState` — the un-constructable side of the Task 6 review split; the console-reachability test now starts its loop at gen −1 to also pin the pre-build salvage-heap prompt (`machineCircles(-1,0)`/`consolePos(-1)`, same assertion shape); two `machineLayout.js` comments corrected to match actual behavior instead of an earlier draft's framing — the `rackSlot` rationale is positional stability (a rack's collision circle never moves when the core upgrades) plus a pure single-argument `rackSlot()`, not "racks would be swallowed"; `RACK_DRAW_CAP`'s excess racks are simply not drawn at all (bounded; the kit pass owns any future densification), not "densify rather than sprawl". Also found in this pass: the console interact check could not live in `handleSpaceshipInteractions()`'s `reg()` candidates list as first drafted — that function returns `false` before its body runs on any zone but `'spaceship'`, so a `reg()` call added there is permanently unreachable from the Landing Site. Implemented instead as a standalone zone-agnostic check in the main interaction priority chain (after Workspace station interactions, before Resource node gathering), gated only by `getMachineConsolePos()`'s existing null-on-every-other-zone behavior — same hint/action semantics (`machineSystem.consoleHint()`, `togglePanel('machine-panel')`, the standard 0.5s `_actionCooldown`), same 2.2 range as the sibling stations.

- [ ] **Step 7: Commit**

```bash
git add js/main.js
git commit -m "feat(machine): main.js wiring — grants folded per-frame, tick, console interact, save bag

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: World presence — plot geometry, primitive bodies, env plumbing

**Files:**
- Create: `js/scene/zones/LandingSite/machineLayout.js` (pure data + math — NO three.js import, Node-testable; the knoll.js/canopy.js discipline)
- Create: `js/scene/zones/LandingSite/machine.js` (THREE builder — never imported by tests)
- Modify: `js/scene/Environment.js`
- Modify: `js/scene/zones/LandingSite/index.js`
- Modify: `tests/systems/machineSystem.test.js` (append pure-layout tests)

- [ ] **Step 1: Append failing pure-layout tests**

```js
import {
  MACHINE_PLOT, MACHINE_CORE, MACHINE_KEEPOUT, GEN_CORE, machineFootprint,
  consolePos, rackSlot, RACK_DRAW_CAP, drawnRacks, machineCircles,
} from '../../js/scene/zones/LandingSite/machineLayout.js';
import { getPlayerBounds } from '../../js/config.js';

test('machine plot: clear of every Landing Site landmark and inside bounds', () => {
  // Landmark coords from js/scene/zones/LandingSite/index.js (keepClear list).
  const landmarks = [
    { x: 9.4, z: 8.6, r: 5, name: 'survivor camp' },
    { x: 14, z: -24, r: 6.5, name: 'lookout knoll' },
    { x: -18, z: -18, r: 12, name: 'mountain' },
    { x: 18, z: 18, r: 7, name: 'arena' },
  ];
  for (const l of landmarks) {
    const d = Math.hypot(MACHINE_PLOT.x - l.x, MACHINE_PLOT.z - l.z);
    assert.ok(d >= MACHINE_KEEPOUT.r + l.r, `plot crowds the ${l.name} (d=${d.toFixed(1)})`);
  }
  assert.ok(MACHINE_PLOT.x + MACHINE_KEEPOUT.r <= 38, 'keep-out inside the 80×80 playable east edge');
  assert.ok(MACHINE_CORE.x < MACHINE_PLOT.x, 'Gen 0 core stands at the plot west edge, nearest the dropship');
});

test('machine circles keep clear of the two nearest authored placements', () => {
  // Copper node and burrfang post (js/scene/zones/LandingSite/index.js
  // keepClear list) sit inside the forest keep-out ring, which only rejects
  // tree/rock SCATTER — it says nothing about the machine's own collision
  // circles, so those are checked directly against these two instead.
  const nearby = [
    { x: 24, z: 6, r: 2, name: 'copper node' },
    { x: 24, z: -12, r: 3, name: 'burrfang post' },
  ];
  const circles = machineCircles(2, 40);
  for (const l of nearby) {
    for (const c of circles) {
      const clearance = Math.hypot(c.x - l.x, c.z - l.z) - c.r - l.r;
      assert.ok(clearance >= 1.0, `a machine circle crowds the ${l.name} (clearance=${clearance.toFixed(2)})`);
    }
  }
});

test('the console pedestal tracks the collision-blocked approach point at every generation', () => {
  // The documented interact-radius gotcha (CLAUDE.md): collision holds the
  // player at r + PLAYER_R (0.35) from a prop's centre, so the console must
  // stay close to where a west-approaching player actually stops walking,
  // or the interact prompt never fires.
  for (let gen = 0; gen < GEN_CORE.length; gen++) {
    const [coreCircle] = machineCircles(gen, 0);
    const stopX = MACHINE_CORE.x - (coreCircle.r + 0.35);
    const diff = Math.abs(stopX - consolePos(gen).x);
    assert.ok(diff < 2.2, `gen ${gen}: console is ${diff.toFixed(2)} from the blocked approach point`);
  }
});

test('the rack field never crosses the playable edge, even absurdly overbuilt', () => {
  assert.equal(drawnRacks(1000), RACK_DRAW_CAP, 'drawnRacks caps at RACK_DRAW_CAP');
  const circles = machineCircles(2, 1000); // gen2 (widest core) + a wildly excessive rack count
  const maxEdge = Math.max(...circles.map(c => c.x + c.r));
  assert.ok(maxEdge <= getPlayerBounds('landingSite').maxX, `machine geometry crosses the playable edge (${maxEdge.toFixed(2)})`);
});

test('every drawn rack has a matching collision circle', () => {
  const minors = 40;
  const circles = machineCircles(2, minors);
  for (let i = 0; i < drawnRacks(minors); i++) {
    const slot = rackSlot(i);
    const match = circles.some(c => Math.hypot(c.x - slot.x, c.z - slot.z) < 0.01);
    assert.ok(match, `rack ${i} at (${slot.x.toFixed(2)},${slot.z.toFixed(2)}) has no matching collision circle`);
  }
});

test('core silhouette grows monotonically across every generation', () => {
  let prev = { coreH: 0, coreW: 0, coreD: 0 };
  for (let g = 0; g < GEN_CORE.length; g++) {
    const f = machineFootprint(g);
    assert.ok(f.coreH > prev.coreH, `gen ${g} must be taller than gen ${g - 1}`);
    assert.ok(f.coreW > prev.coreW, `gen ${g} must be wider than gen ${g - 1}`);
    assert.ok(f.coreD > prev.coreD, `gen ${g} must be deeper than gen ${g - 1}`);
    prev = f;
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module ... machine.js`

- [ ] **Step 3a: Create `js/scene/zones/LandingSite/machineLayout.js`** (pure — this is what the test imports)

```js
// The Machine — plot geometry, pure data + math. NO three.js import, so the
// numbers are Node-testable (knoll.js/canopy.js discipline). The THREE-touching
// builder lives in ./machine.js; the Blender kit must mirror these footprints
// when it ships in the asset-pass plan.
// Spec: docs/superpowers/specs/2026-07-27-physical-computer-design.md §3.
//
// Review pass 2: collision moved to pure machineCircles() (per-rack circles
// replaced the over-blocking disc), console trigger tracks the pedestal per
// gen, rack draw cap keeps the field in-bounds, length-keyed cache
// invalidated on rebuild.

export const MACHINE_PLOT = { x: 26, z: 0 };   // plot centre — growth extends east
export const MACHINE_CORE = { x: 20, z: 0 };   // Gen 0 core / console anchor (west edge)
export const MACHINE_KEEPOUT = { x: 26, z: 0, r: 9 }; // forest-scatter rejection circle

// Per-generation core silhouette (world units). Gens past the table clamp to
// its last row until the matching plan ships their stage.
export const GEN_CORE = [
  { h: 1.5, w: 1.6, d: 1.2 },   // gen0 Field Core — crate + antenna
  { h: 2.5, w: 2.2, d: 1.6 },   // gen1 Calibration Bank — adds a cabinet tier
  { h: 4.0, w: 3.0, d: 2.2 },   // gen2 Fabrication Co-processor — first tower
];

function clampedCore(gen) {
  return GEN_CORE[Math.max(0, Math.min(gen, GEN_CORE.length - 1))];
}

// Core silhouette only. `minors` used to also drive an `eastReach` field for
// a single blocking disc over the whole rack field, but that disc was the
// invisible-wall defect this pass fixes (machineCircles() below replaced it
// with per-rack circles); nothing else read eastReach, so it — and the
// now-unused second parameter — are gone.
export function machineFootprint(gen) {
  const core = clampedCore(gen);
  return { coreH: core.h, coreW: core.w, coreD: core.d };
}

// Console pedestal / interact-trigger position (CLAUDE.md's interact-radius
// gotcha: the console must sit close to where collision actually stops the
// player, or the prompt never fires). gen<0 (pre-build) keeps the salvage
// heap's prompt exactly where it sits today, MACHINE_CORE.x - 1.6 — which
// happens to equal the gen>=0 formula evaluated at GEN_CORE[0] (w=1.6:
// 1.6/2 + 0.8 = 1.6), but the two are conceptually independent (the heap's
// boxes are positioned by their own fixed offsets, unrelated to GEN_CORE[0].w)
// so the pre-build case is spelled out rather than leaned on as a coincidence.
export function consolePos(gen) {
  if (gen < 0) return { x: MACHINE_CORE.x - 1.6, z: MACHINE_CORE.z };
  const core = clampedCore(gen);
  return { x: MACHINE_CORE.x - core.w / 2 - 0.8, z: MACHINE_CORE.z };
}

// Expansion racks march east of the core in seeded 3-row columns. Anchored to
// the WIDEST core (gen2, the last GEN_CORE row) rather than whichever gen is
// current, so a rack placed while the core is still small (gen0/gen1) can
// never end up swallowed once a later upgrade grows the core body — the
// anchor is fixed at the largest size the core will ever reach.
const RACK_ANCHOR_W = GEN_CORE[GEN_CORE.length - 1].w;
const RACK_COL_PITCH = 0.9;
const RACK_ROW_PITCH = 1.4;

export function rackSlot(i) {
  const col = Math.floor(i / 3);
  const row = i % 3;
  return {
    x: MACHINE_CORE.x + RACK_ANCHOR_W / 2 + 1.2 + col * RACK_COL_PITCH,
    z: MACHINE_CORE.z - 1.4 + row * RACK_ROW_PITCH,
  };
}

// Highest rack index still drawn as an individual mesh + collision circle.
// Derivation: a rack is a 0.5-wide box (half-width 0.25); allow a further
// 0.25 for its +-0.075 visual jitter (rounded up generously). At the widest
// core (gen2, w=3.0) the rack column anchor is MACHINE_CORE.x + 3.0/2 + 1.2
// = MACHINE_CORE.x + 2.7, so column c's east edge sits at
// MACHINE_CORE.x + 2.7 + 0.9c + 0.5. Requiring that stay <= 34 (5 units of
// margin inside the true 39-unit playable edge, so the rack field never
// brushes the world boundary) gives:
//   MACHINE_CORE.x(20) + 2.7 + 0.9c + 0.5 <= 34  =>  0.9c <= 10.8  =>  c <= 12
// Column 12 is last reached by rack index 38 (floor(38/3) = 12), so the cap
// is 39 racks (indices 0..38). Excess racks beyond the cap densify rather
// than sprawl further east — the kit pass owns that visual.
export const RACK_DRAW_CAP = 39;

export function drawnRacks(minors) {
  return Math.min(minors, RACK_DRAW_CAP);
}

// Full machine-tagged collision set for the current build state — the single
// source of truth for both the builder's pushCircles() and these tests.
// Replaces the old single "shallow circle over the whole rack field" disc,
// which blocked long before any geometry did (the invisible-wall defect),
// with one small circle per DRAWN rack instead.
export function machineCircles(gen, minors) {
  if (gen < 0) {
    return [{ x: MACHINE_CORE.x, z: MACHINE_CORE.z, r: 1.0, machine: true }];
  }
  const core = clampedCore(gen);
  const circles = [{
    x: MACHINE_CORE.x, z: MACHINE_CORE.z,
    r: Math.hypot(core.w, core.d) / 2 + 0.1, machine: true,
  }];
  const n = drawnRacks(minors);
  for (let i = 0; i < n; i++) {
    const slot = rackSlot(i);
    circles.push({ x: slot.x, z: slot.z, r: 0.45, machine: true });
  }
  return circles;
}
```

- [ ] **Step 3b: Create `js/scene/zones/LandingSite/machine.js`** (THREE builder)

```js
import * as THREE from 'three';
import { createToonMaterial, addOutline } from '../../ToonMaterials.js';
import {
  MACHINE_CORE, machineFootprint, consolePos, rackSlot, drawnRacks, machineCircles,
} from './machineLayout.js';

// The Machine — primitive-stage bodies (DELIBERATE pre-kit fallbacks, station
// convention). Geometry + collision truth lives in ./machineLayout.js.

const TEAL = 0x36e0b8;
const HULL = 0x3c4652;
const DARK = 0x2a3138;

// mulberry32 — house convention: inline copy, seeded per feature
// (Environment.js does not export its own; MineLayout precedent).
function seededRandom(seed) {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildMachinePlot(env) {
  let group = null;

  const state = () => (env._machineState ? env._machineState() : { gen: -1, minors: 0 });

  function render() {
    const { gen, minors } = state();
    const g = new THREE.Group();

    if (gen < 0) {
      // Pre-Gen0: salvage heap + empty socket ring. The heap is the prompt.
      const heapMat = createToonMaterial(DARK);
      const boxes = [
        [0.9, 0.5, 0.7, -0.3, 0.25, 0.1, 0.4],
        [0.6, 0.4, 0.5, 0.4, 0.2, -0.2, -0.3],
        [0.5, 0.7, 0.5, 0.15, 0.35, 0.45, 0.9],
      ];
      for (const [w, h, d, x, y, z, rot] of boxes) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), heapMat);
        m.position.set(MACHINE_CORE.x + x, y, MACHINE_CORE.z + z);
        m.rotation.y = rot;
        addOutline(m, 0.05);
        g.add(m);
      }
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(1.0, 1.25, 24),
        new THREE.MeshBasicMaterial({ color: TEAL, transparent: true, opacity: 0.5, depthWrite: false })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(MACHINE_CORE.x, 0.02, MACHINE_CORE.z);
      g.add(ring);
    } else {
      const f = machineFootprint(gen);
      const bodyMat = createToonMaterial(HULL);
      const core = new THREE.Mesh(new THREE.BoxGeometry(f.coreW, f.coreH, f.coreD), bodyMat);
      core.position.set(MACHINE_CORE.x, f.coreH / 2, MACHINE_CORE.z);
      addOutline(core, 0.05);
      g.add(core);
      // Teal energy slit up the camera-facing (+z) face — the portal family glow.
      const slit = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, f.coreH * 0.7, 0.05),
        new THREE.MeshBasicMaterial({ color: TEAL })
      );
      slit.position.set(MACHINE_CORE.x - f.coreW * 0.22, f.coreH * 0.45, MACHINE_CORE.z + f.coreD / 2 + 0.03);
      g.add(slit);
      // Antenna
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 6), bodyMat);
      mast.position.set(MACHINE_CORE.x + f.coreW * 0.3, f.coreH + 0.55, MACHINE_CORE.z);
      g.add(mast);
      // Expansion racks — seeded jitter on top of the pure rackSlot() centers
      // (visual only, so collision stays jitter-independent). Excess racks
      // past the draw cap densify rather than sprawl — kit pass owns the visual.
      const rng = seededRandom(90260);
      const racksToDraw = drawnRacks(minors);
      for (let i = 0; i < racksToDraw; i++) {
        const slot = rackSlot(i);
        const rack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9 + rng() * 0.3, 0.7), bodyMat);
        rack.position.set(
          slot.x + (rng() - 0.5) * 0.15,
          rack.geometry.parameters.height / 2,
          slot.z + (rng() - 0.5) * 0.2
        );
        addOutline(rack, 0.05);
        g.add(rack);
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.08), new THREE.MeshBasicMaterial({ color: TEAL }));
        lamp.position.set(rack.position.x, rack.geometry.parameters.height - 0.1, rack.position.z + 0.38);
        g.add(lamp);
      }
      // Console pedestal on the west face (dropship side)
      const cPos = consolePos(gen);
      const ped = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.4), createToonMaterial(DARK));
      ped.position.set(cPos.x, 0.45, cPos.z);
      addOutline(ped, 0.05);
      g.add(ped);
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 0), new THREE.MeshBasicMaterial({ color: TEAL }));
      gem.position.set(ped.position.x, 1.25, ped.position.z);
      gem.userData.isIndicator = true;
      g.add(gem);
    }
    return g;
  }

  function pushCircles() {
    const { gen, minors } = state();
    env._collisionCircles.push(...machineCircles(gen, minors));
  }

  function rebuild() {
    if (group) env.group.remove(group);
    env._collisionCircles = env._collisionCircles.filter(c => !c.machine);
    group = render();
    env.group.add(group);
    pushCircles();
    // A same-length rebuild (e.g. gen advances but minors doesn't) can't be
    // told apart from "nothing changed" by the sector cache's length-keyed
    // staleness check — force it to recompute once SectorView zones exist.
    env._collisionCacheStatic = -1;
    // Re-track the pedestal on every install, not just the first build.
    env._machineConsolePos = consolePos(state().gen);
    // Rebuilds scale with rack count; accepted leak (~70 geometries at the
    // draw cap) until the kit swap replaces this whole path.
  }

  rebuild();
  env._machineRefresh = rebuild;
  env._addNavLandmark(MACHINE_CORE.x, 2.0, MACHINE_CORE.z, 'The Machine');
}
```

- [ ] **Step 4: Environment plumbing**

In `js/scene/Environment.js`:

1. In the `switchZone` reset block (next to `this._trainingChamber = null; this._trainingConsolePos = null;`) add:

```js
    this._machineConsolePos = null;
    this._machineRefresh = null;
```

2. Next to `getTrainingConsolePos()` add the accessors:

```js
  getMachineConsolePos() { return this._machineConsolePos || null; }
  refreshMachine() { if (this._machineRefresh) this._machineRefresh(); }
```

- [ ] **Step 5: Landing Site integration**

In `js/scene/zones/LandingSite/index.js`:

1. Add to the imports:

```js
import { buildMachinePlot } from './machine.js';
import { MACHINE_KEEPOUT } from './machineLayout.js';
```
2. In `build(env)`, after the `_addShip(env);` line add:

```js
  buildMachinePlot(env);
```

3. In the `keepClear` array inside `_addOuterWoods`, after the lookout-knoll entry add:

```js
    { x: MACHINE_KEEPOUT.x, z: MACHINE_KEEPOUT.z, r: MACHINE_KEEPOUT.r },  // the machine plot
```

- [ ] **Step 6: Syntax checks + tests**

Run: `node --check js/scene/zones/LandingSite/machineLayout.js`, `node --check js/scene/zones/LandingSite/machine.js`, `node --check js/scene/zones/LandingSite/index.js`, `node --check js/scene/Environment.js` → no output.
Run: `npm test` → PASS (the layout test imports only the pure `machineLayout.js` — never `machine.js`, whose bare `'three'` specifier resolves only in the browser importmap).

- [ ] **Step 7: Commit**

```bash
git add js/scene/zones/LandingSite/machineLayout.js js/scene/zones/LandingSite/machine.js js/scene/zones/LandingSite/index.js js/scene/Environment.js tests/systems/machineSystem.test.js
git commit -m "feat(machine): Landing Site plot — primitive stage bodies, collision, nav chip

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

**Review pass 2:** collision moved to pure `machineCircles()` (per-rack circles replaced the over-blocking disc), console trigger tracks the pedestal per gen, rack draw cap keeps the field in-bounds, length-keyed cache invalidated on rebuild.

```bash
git add js/scene/zones/LandingSite/machineLayout.js js/scene/zones/LandingSite/machine.js tests/systems/machineSystem.test.js docs/superpowers/plans/2026-07-27-machine-phase1-2.md
git commit -m "fix(machine): per-rack collision via pure machineCircles, console tracks pedestal

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Machine console panel

**Files:**
- Modify: `index.html`
- Modify: `js/menuController.js`
- Modify: `js/ui/HUD.js`

- [ ] **Step 1: Panel markup**

In `index.html`, directly after the closing `</div>` of `training-panel` (and before `training-overlay`), add:

```html
    <!-- The Machine: surface computer console (dossiers, analysis bay, build stages) -->
    <div id="machine-panel" hidden>
      <div id="machine-modal">
        <div class="panel-header">MACHINE CONSOLE <button class="panel-close" onclick="document.getElementById('machine-panel').hidden=true">X</button></div>
        <div id="machine-contents" class="panel-body"></div>
      </div>
    </div>
```

- [ ] **Step 2: menuController lists**

In `js/menuController.js`:
1. Append `'machine-panel',` to `MENU_PANEL_IDS` (after `'training-panel',`).
2. Append `'machine-panel',` to `STANDALONE_PANEL_IDS` (station panel like training).

- [ ] **Step 3: HUD wiring**

In `js/ui/HUD.js`:

1. In `_closeCommandPanels`, after `'training-panel',` add `'machine-panel',`.
2. In `_refreshPanel`, after `case 'training-panel': this._refreshTraining(); break;` add:

```js
      case 'machine-panel': this._refreshMachine(); break;
```

3. Add the refresh method next to `_refreshTraining()`:

```js
  // ── The Machine console — dossiers, analysis bay, build stages ────────────
  _refreshMachine() {
    const el = document.getElementById('machine-contents');
    const machine = this.machine;
    if (!el || !machine) return;
    el.innerHTML = '';

    const head = document.createElement('div');
    head.style.cssText = 'margin-bottom:10px;color:#9fd8c8;font-size:0.85rem;';
    head.textContent = machine.currentGen < 0
      ? 'Assemble the Field Core from dropship salvage to bring the machine online.'
      : `Machine online — generation ${machine.currentGen} · ${machine.minorsBuilt} expansion rack${machine.minorsBuilt === 1 ? '' : 's'}.`;
    el.appendChild(head);

    const billText = (bill) => [`${bill.pp} PP`]
      .concat(Object.entries(bill.mats).map(([m, q]) => `${m} ×${q}`)).join(' · ');

    for (const part of machine.constructor.PARTS) {
      const state = machine.partState(part.id);
      const card = document.createElement('div');
      card.className = 'training-program' + (state === 'building' ? ' selected' : '');

      const title = document.createElement('div');
      title.style.cssText = 'display:flex;justify-content:space-between;gap:8px;';
      const badge = { locked: '🔒 LOCKED', investigating: '🔬 INVESTIGATING', building: '🔧 BUILDING', installed: '✅ INSTALLED' }[state] || state;
      title.innerHTML = `<b>GEN ${part.gen} — ${part.name}</b><span>${badge}</span>`;
      card.appendChild(title);

      if (part.tierName) {
        const tier = document.createElement('div');
        tier.style.cssText = 'color:#88aacc;font-size:0.75rem;margin:2px 0 6px;';
        tier.textContent = `Restore tier: ${part.tierName}`;
        card.appendChild(tier);
      }

      if (state === 'locked') {
        const hint = document.createElement('div');
        hint.style.cssText = 'color:#8899aa;font-size:0.8rem;';
        hint.textContent = `Cross chapter rung ${part.rung} to open this dossier.`;
        card.appendChild(hint);
        el.appendChild(card);
        continue;
      }

      if (state !== 'installed') {
        const f = machine.fieldFindings(part.id);
        for (const row of f.rows) {
          const r = document.createElement('div');
          r.style.cssText = 'font-size:0.8rem;color:' + (row.done ? '#7fd8a8' : '#8899aa') + ';';
          r.textContent = `${row.done ? '☑' : '☐'} ${row.label}`;
          card.appendChild(r);
        }
        for (const a of part.analyses) {
          const row = document.createElement('div');
          row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;font-size:0.8rem;gap:8px;';
          const done = machine.analysisDone(part.id, a.id);
          const queued = machine.analysisQueued(part.id, a.id);
          const running = machine.analysisJob && machine.analysisJob.partId === part.id && machine.analysisJob.analysisId === a.id;
          const pct = running ? ` ${Math.floor(machine.analysisJob.progress / machine.analysisJob.duration * 100)}%` : '';
          const label = document.createElement('span');
          label.style.color = done ? '#7fd8a8' : '#aab8cc';
          label.textContent = `${done ? '☑' : '☐'} ${a.label}${running ? ' — analyzing' + pct : queued ? ' — queued' : ''}`;
          row.appendChild(label);
          if (!done && !queued) {
            const btn = document.createElement('button');
            btn.className = 'panel-btn';
            btn.textContent = `ANALYZE (${Object.entries(a.input).map(([m, q]) => `${m} ×${q}`).join(', ')})`;
            btn.addEventListener('click', () => { machine.enqueueAnalysis(part.id, a.id); this._refreshMachine(); });
            row.appendChild(btn);
          }
          card.appendChild(row);
        }
      }

      if (state === 'building') {
        const delivered = machine.stagesDelivered[part.id] || 0;
        const stage = document.createElement('div');
        stage.style.cssText = 'margin-top:6px;font-size:0.8rem;color:#cfe8ff;';
        stage.textContent = `Build stage ${delivered + 1} / ${part.stageBills.length} — ${billText(machine.stageBill(part.id))}`;
        card.appendChild(stage);
        const btn = document.createElement('button');
        btn.className = 'panel-btn';
        btn.textContent = 'DELIVER STAGE';
        btn.disabled = !machine.canDeliverStage(part.id);
        btn.addEventListener('click', () => { machine.deliverStage(part.id); this._refreshMachine(); });
        card.appendChild(btn);
      }

      if (state === 'installed' && Object.keys(part.grants).length) {
        const g = document.createElement('div');
        g.style.cssText = 'color:#7fd8a8;font-size:0.8rem;';
        g.textContent = 'Online: ' + Object.entries(part.grants).map(([k, v]) => `${k} ×${v}`).join(' · ');
        card.appendChild(g);
      }

      el.appendChild(card);
    }

    // Expansion racks — the infinite tail
    const minor = document.createElement('div');
    minor.className = 'training-program';
    const avail = machine.minorsAvailable;
    const mTitle = document.createElement('div');
    mTitle.innerHTML = `<b>EXPANSION RACKS</b> — built ${machine.minorsBuilt}, earned ${avail} (one per Sim Warden crossed)`;
    minor.appendChild(mTitle);
    if (machine.currentGen >= 0 && avail > 0) {
      const bill = document.createElement('div');
      bill.style.cssText = 'font-size:0.8rem;color:#cfe8ff;margin:4px 0;';
      bill.textContent = billText(machine.minorBill()) + ` → +${Math.round(machine.constructor.MINOR.ppMultPerPart * 100)}% PP`;
      minor.appendChild(bill);
      const btn = document.createElement('button');
      btn.className = 'panel-btn';
      btn.textContent = 'BUILD RACK';
      btn.disabled = !machine.canBuildMinor();
      btn.addEventListener('click', () => { machine.buildMinor(); this._refreshMachine(); });
      minor.appendChild(btn);
    }
    el.appendChild(minor);
  }
```

(If the stylesheet has no `.panel-btn` class, use `class="training-program-btn"` or whatever the buttons inside `_refreshTraining()` use — match the training panel's button class exactly; check `_refreshTraining()` at the time of editing and reuse its class names for cards and buttons.)

- [ ] **Step 4: Run the wiring tests**

Run: `npm test`
Expected: PASS — `panelWiring.test.js` proves `machine-panel` present in index.html, `MENU_PANEL_IDS`, and `_closeCommandPanels` together. Run `node --check js/ui/HUD.js` and `node --check js/menuController.js` → no output.

- [ ] **Step 5: Commit**

```bash
git add index.html js/menuController.js js/ui/HUD.js
git commit -m "feat(machine): console panel — dossiers, analysis bay, staged builds UI

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

**Review pass** (post-Step-5, `js/ui/HUD.js` only — `fix(machine): panel review pass`):

1. ANALYZE buttons gate on `!machine.analysisUnlocked || !this.inventory.hasMaterials(a.input)`, not just materials; an investigating/building card with analyses shows a one-time `Analysis Bay offline — assemble the Field Core first.` hint (`#8899aa`) while the bay isn't installed.
2. The 1s live-refresh block (`machine-panel` added alongside the other idle panels) now calls a new `_updateMachineLive()` instead of a full `_refreshMachine()`: it rewrites the running analysis's `%` text in place and refreshes every ANALYZE/DELIVER STAGE/BUILD RACK button's `.disabled`, falling back to a full rebuild only when the running job's identity changes (started/completed/swapped). `_refreshMachine()` stashes `this._machineLive = { runningEl, running, gated }` at the end of each rebuild and clears it to `null` at the top (stale-node hygiene).
3. Expansion Racks line fixed: `built N · M ready to build (...)` — `minorsAvailable` is unbuilt-but-earned, not a lifetime warden count; the old "earned N" copy misreported a fully-built player as having crossed zero wardens.
4. Material keys in bill text and ANALYZE input lists now route through the existing module-scope `_matLabel()` helper; a new `GRANT_LABELS` map (module scope, beside `_matLabel`/`ICON_IMG_KEYS` — physically the closest a module-level const can sit to a method this deep inside the `HUD` class) gives grants friendly names (`Gather speed`/`Craft speed`/`PP rate`), falling back to `_matLabel()` for any future grant key.
5. Locked-part hint now reads `machine.chapters?.rungInfo(part.rung)` and renders `Locked until CH.N — <label>.`, falling back to the old rung-number sentence if chapters is unwired or the rung has no label.
6. `machine-contents`' `scrollTop` is captured before each rebuild and restored after, so an open card list doesn't jump to the top every refresh.
8. The `building`-state stage row/button only render when `machine.stageBill(part.id)` is truthy, so a data-only shortening of a part's `stageBills` can't blank the whole card for an existing save.
9. Badge glyph for the installed state changed from `✅` to `✔` (house check mark, matching the ☑/☐ glyphs used elsewhere in the panel).

Item 7 (shared console-card styling — extracting the repeated card/badge/button look into a common class instead of the ad hoc inline styles used here and in `_refreshTraining()`) is deferred to the polish/asset pass, not addressed in this round.

---

### Task 10: Live verification + docs

**Files:**
- Modify: `STATUS.md`, `CLAUDE.md`

- [ ] **Step 1: Boot the game and smoke the whole loop**

1. `preview_start` with the existing `.claude/launch.json` config (list its `configurations[].name` first and use that name).
2. Reload; check `read_console_messages onlyErrors:true` → no errors at boot.
3. Verify the plot: walk east from spawn toward (20, 0) — salvage heap + teal socket ring visible, "The Machine" nav chip appears when it scrolls off-screen, prompt reads `[E/ACT] Salvage Heap — assemble the Field Core`.
4. Gather the Gen 0 bill honestly at the starter nodes (stone 6, copper 4, iron 4, fiber 6, 120 PP total) — under five minutes at base rates.
5. Open the console, DELIVER both stages: verify the body swaps from heap to Gen 0 core (teal slit, console pedestal, gem), toast fires, hint text flips to `[E/ACT] Machine Console`.
6. SAVE via the HUD button, reload the page, confirm the machine still stands at Gen 0 with the panel state intact (save v15 round trip in the real browser).
7. `computer {action: "screenshot"}` of the Gen 0 machine for the session record.

Expected: every step behaves as written; console stays clean. If anything fails, fix before proceeding — do not commit over a red smoke test.

- [ ] **Step 2: Docs**

`CLAUDE.md` — add one row to the key-files table:

```markdown
| The Machine — chapter-capstone build loop (registry: MACHINE_PARTS) | `js/systems/MachineSystem.js` + `server/definitions/systemsData.js` |
```

And append one sentence to the Save system section's numbered list intro: save v15 adds `machine` (MachineSystem) following the standard serialize/load/applyBonuses steps.

`STATUS.md` — add a "Where the work stands" entry (dated, one paragraph): the Machine phase 1–2 shipped (registry, MachineSystem, save v15, Landing Site plot with primitive fallback bodies, console panel, Gens 0–2 + Expansion Racks); next: Postgres integration (phase 3 plan), then Gens 3–7 capabilities. Add `js/scene/zones/LandingSite/machine.js` and the two docs files to the folder map if it lists zone files individually. Bump **Last updated**.

- [ ] **Step 3: Final full run + commit**

Run: `npm test` → ALL PASS. Run `node --check` on every modified js file.

```bash
git add STATUS.md CLAUDE.md
git commit -m "docs(machine): STATUS + CLAUDE entries for the machine phase 1-2

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Self-review record (kept for the executor)

- **Spec coverage (phases 1–2):** registry+modularity contract → Task 1; findings/analysis/stages/install loop → Tasks 2–4; grants folded per-frame → Tasks 6–7; save v15 → Task 5; plot/console/nav/keep-out → Task 8; panel checklist → Task 9; live smoke + docs → Task 10. Deferred items are listed in the header and match spec §9's later phases.
- **Known judgment calls:** Task 8 splits pure `machineLayout.js` (Node-tested) from the THREE-touching `machine.js` builder, since bare `'three'` resolves only in the browser importmap; the mid-session-LOAD stale-visual nit is documented in the header; button/card CSS classes in Task 9 defer to whatever `_refreshTraining()` actually uses.
- **Type consistency:** `partState` values (`locked/investigating/building/installed`), `stageBill/deliverStage/canDeliverStage`, `minorBill/buildMinor/canBuildMinor/minorsAvailable`, `gatherMult/craftSpeedMult/ppMult/restoreTiers/applyBonuses`, env surface (`_machineState`, `_machineConsolePos`, `_machineRefresh`, `getMachineConsolePos()`, `refreshMachine()`) are used with identical names in every task that touches them.
