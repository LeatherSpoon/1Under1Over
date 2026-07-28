// The Machine — part registry + MachineSystem.
// Spec: docs/superpowers/specs/2026-07-27-physical-computer-design.md
// The registry is the modularity contract: every effect key, material, boss,
// rung and codex reference must be REAL, so a data edit that typos a key
// fails here by name instead of silently doing nothing in-game.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import {
  MACHINE_PARTS, MACHINE_MINOR,
  MACHINE_GRANT_KEYS, MACHINE_RESTORE_KEYS, MACHINE_CAPABILITIES,
} from '../../server/definitions/systemsData.js';
import { InventorySystem } from '../../js/systems/InventorySystem.js';
import { BossSystem } from '../../js/systems/BossSystem.js';
import { CodexSystem } from '../../js/systems/CodexSystem.js';
import { ChapterSystem } from '../../js/systems/ChapterSystem.js';
import { MachineSystem, CONSUMED_GRANT_KEYS } from '../../js/systems/MachineSystem.js';
import { PPSystem } from '../../js/systems/PPSystem.js';
import { CraftingSystem } from '../../js/systems/CraftingSystem.js';
import {
  MACHINE_PLOT, MACHINE_CORE, MACHINE_KEEPOUT, GEN_CORE, machineFootprint,
  consolePos, rackSlot, RACK_DRAW_CAP, drawnRacks, machineCircles,
} from '../../js/scene/zones/LandingSite/machineLayout.js';
import { getPlayerBounds } from '../../js/config.js';

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
        assert.ok(a.input[m] > 0, `${p.id}/${a.id}: '${m}' qty must be > 0`);
      }
    }
    for (const [i, s] of p.stageBills.entries()) {
      assert.ok(s.pp > 0, `${p.id} stage ${i}: pp must be > 0`);
      for (const m of Object.keys(s.mats)) {
        assert.ok(MATS.has(m), `${p.id} stage ${i}: unknown material '${m}'`);
        assert.ok(s.mats[m] > 0, `${p.id} stage ${i}: '${m}' qty must be > 0`);
      }
    }
    if (p.findings.boss) assert.ok(BOSS_IDS.has(p.findings.boss), `${p.id}: unknown boss '${p.findings.boss}'`);
    if (p.findings.zoneLore) assert.ok(CODEX_KEYS.has(p.findings.zoneLore), `${p.id}: unknown codex key '${p.findings.zoneLore}'`);
    for (const c of p.findings.codex) {
      assert.ok(CODEX_KEYS.has(c), `${p.id}: unknown codex key '${c}'`);
    }
    if (p.findings.boss) {
      const s = ChapterSystem.STORY.find(st => st.boss === p.findings.boss);
      assert.ok(s, `${p.id}: boss '${p.findings.boss}' is not a story boss`);
      assert.equal(p.rung, s.rung, `${p.id}: rung ${p.rung} disagrees with ${p.findings.boss} (rung ${s.rung})`);
    }
    if (p.gen > 0) {
      assert.ok(STORY_RUNGS.has(p.rung), `${p.id}: rung ${p.rung} is not a story rung`);
      assert.ok(p.analyses.length >= 1, `${p.id}: needs at least one analysis`);
      assert.ok(p.stageBills.length >= 2, `${p.id}: needs at least two build stages`);
    }
  }
  assert.ok(MACHINE_MINOR.billBase.pp > 0, 'minor bill pp must be > 0');
  for (const m of Object.keys(MACHINE_MINOR.billBase.mats)) {
    assert.ok(MATS.has(m), `minor bill: unknown material '${m}'`);
  }
  assert.ok(MACHINE_MINOR.ppMultPerPart > 0, 'ppMultPerPart must be > 0');
  assert.ok(MACHINE_MINOR.billGrowth > 1, 'billGrowth must be > 1');
  assert.ok(MACHINE_MINOR.matCap > 0 && MACHINE_MINOR.matCap <= 99, 'matCap must be payable within the 99 bag stack');
  for (const [m, q] of Object.entries(MACHINE_MINOR.billBase.mats)) {
    assert.ok(q <= MACHINE_MINOR.matCap, `minor bill base ${m} exceeds matCap`);
  }
});

test('machine registry: generations contiguous from 0, rungs strictly ascend', () => {
  MACHINE_PARTS.forEach((p, i) => assert.equal(p.gen, i, `${p.id}: gen must be ${i}`));
  for (let i = 1; i < MACHINE_PARTS.length; i++) {
    assert.ok(MACHINE_PARTS[i].rung > MACHINE_PARTS[i - 1].rung, 'rungs must strictly ascend');
  }
  assert.equal(MACHINE_PARTS[0].rung, 0, 'gen0 has no chapter requirement');
});

test('machine registry: part ids and analysis ids are unique save keys', () => {
  const ids = MACHINE_PARTS.map(p => p.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate part id');
  for (const p of MACHINE_PARTS) {
    const aids = p.analyses.map(a => a.id);
    assert.equal(new Set(aids).size, aids.length, `${p.id}: duplicate analysis id`);
  }
});

test('machine registry: every grant a part actually uses has a live consumer', () => {
  const consumed = new Set(CONSUMED_GRANT_KEYS);
  for (const p of MACHINE_PARTS) {
    for (const k of Object.keys(p.grants)) {
      assert.ok(consumed.has(k), `${p.id}: grant '${k}' has no live consumer yet — wire it (and add to CONSUMED_GRANT_KEYS) before using it in data`);
    }
  }
});

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

test('machine: lab findings gate partState alongside field findings', () => {
  const { machine } = makeMachine();
  machine.chapters.rungCrossed = () => true;
  machine.codex.discover('theLanding');
  machine.codex.discover('mossback');
  machine.codex.discover('burrfang');
  machine.codex.discover('stiltbeak');
  machine.bosses.recordDefeat('boss_landing');
  assert.equal(machine.fieldFindings('gen1').complete, true);
  assert.equal(machine.partState('gen1'), 'investigating', 'lab findings still incomplete');
  assert.equal(machine.labFindings('gen1').total, 2);
});

test('machine: unwired refs fail closed and unknown ids are inert', () => {
  const machine = new MachineSystem(new InventorySystem(), new PPSystem());
  assert.equal(machine.partState('gen1'), 'locked', 'no chapters ref → locked');
  assert.equal(machine.fieldFindings('gen1').complete, false, 'no codex/bosses → nothing done');
  assert.equal(machine.partState('nope'), 'unknown');
  assert.deepEqual(machine.fieldFindings('nope'), { rows: [], done: 0, total: 0, complete: false });
});

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
  assert.equal(machine.minorBill().mats.iron, 26, 'ceil pins fractional scaling (10×1.6² = 25.6 → 26)');
  assert.equal(machine.minorsAvailable, 0);
  assert.equal(machine.buildMinor(), false, 'no rack without a crossed rung behind it');
  assert.ok(Math.abs(machine.ppMult - 1.08) < 1e-9, 'two racks = +8%');
});

test('machine: enqueue fails without payment and consumes nothing', () => {
  const { machine, inv } = makeMachine();
  machine.chapters.rungCrossed = () => true;
  machine.installed.add('gen0');
  inv.materials.fiber = 3; // meadow_flora needs 8
  assert.equal(machine.enqueueAnalysis('gen1', 'meadow_flora'), false);
  assert.equal(inv.materials.fiber, 3, 'shortfall must not consume');
  assert.equal(machine.analysisJob, null);
  assert.equal(machine.enqueueAnalysis('gen1', 'not_an_analysis'), false);
  assert.equal(machine.enqueueAnalysis('nope', 'meadow_flora'), false);
});

test('machine: analysis bay edge behaviors are pinned', () => {
  const { machine, inv } = makeMachine();
  machine.chapters.rungCrossed = () => true;
  machine.installed.add('gen0');
  const copperBefore = inv.materials.copper;
  machine.enqueueAnalysis('gen1', 'meadow_flora');   // 240s
  machine.enqueueAnalysis('gen1', 'scrap_alloys');   // 300s, queued
  assert.equal(inv.materials.copper, copperBefore - 8, 'queued job also paid at enqueue');
  let fired = 0;
  machine.onAnalysisComplete = () => { fired++; };
  machine.update(500); // overshoots job 1 by 260s
  assert.equal(machine.analysisJob.progress, 0, 'overflow is deliberately discarded online');
  assert.equal(fired, 1, 'online completion fires the callback');
  assert.equal(machine.simulateOffline(0), 0, 'zero seconds is a no-op');
  assert.equal(machine.simulateOffline(300), 1, 'remainder finishes silently');
  assert.equal(fired, 1, 'offline completion did not fire');
  machine.enqueueAnalysis('gen2', 'ore_bands');      // 420s
  machine.update(421);
  assert.equal(fired, 2, 'callback restored after offline suppression');
});

test('machine: purchases actually charge and gates actually gate', () => {
  const { machine, pp, inv } = makeMachine();
  machine.chapters.rungCrossed = () => false;
  assert.equal(machine.canDeliverStage('gen1'), false, 'locked part not deliverable');
  assert.equal(machine.deliverStage('gen1'), false);
  machine.chapters.rungCrossed = () => true;
  assert.equal(machine.canDeliverStage('gen1'), false, 'investigating part not deliverable');
  machine.deliverStage('gen0'); machine.deliverStage('gen0');
  assert.equal(machine.hasCapability('analysisBay'), true);
  assert.equal(machine.hasCapability('schematicPrinter'), false, 'capabilities discriminate');
  machine.chapters.wardensCrossedLifetime = () => 1;
  const ppBefore = pp.ppTotal;
  const ironBefore = inv.materials.iron;
  assert.equal(machine.buildMinor(), true);
  assert.equal(pp.ppTotal, ppBefore - 400, 'rack charges PP');
  assert.equal(inv.materials.iron, ironBefore - 10, 'rack charges materials');
  machine.chapters.wardensCrossedLifetime = () => 2;
  inv.materials.iron = 5; // rack #2 needs 16
  const pp2 = pp.ppTotal;
  assert.equal(machine.canBuildMinor(), false, 'material shortfall refuses');
  assert.equal(machine.buildMinor(), false);
  assert.equal(pp.ppTotal, pp2, 'refusal charges nothing');
  assert.equal(inv.materials.iron, 5);
});

test('machine: racks stay payable forever (mat cap under the bag stack)', () => {
  const { machine, pp } = makeMachine();
  machine.deliverStage('gen0'); machine.deliverStage('gen0');
  machine.chapters.wardensCrossedLifetime = () => 41;
  machine.minorsBuilt = 40;
  pp.ppTotal = 1e12;
  const bill = machine.minorBill();
  assert.equal(bill.mats.iron, MACHINE_MINOR.matCap, 'materials clamp at matCap');
  assert.ok(bill.mats.iron <= 99, 'payable within the bag stack cap');
  assert.equal(machine.canBuildMinor(), true, 'rack 41 still buildable');
});

test('machine: serialize → deserialize → applyBonuses round-trips exactly', () => {
  const { machine } = makeMachine();
  machine.chapters.rungCrossed = () => true;
  machine.chapters.wardensCrossedLifetime = () => 3;
  machine.deliverStage('gen0'); machine.deliverStage('gen0');
  completeInvestigation(machine, 'gen1');
  machine.deliverStage('gen1');
  machine.buildMinor();
  machine.enqueueAnalysis('gen2', 'ore_bands');
  machine.enqueueAnalysis('gen2', 'deep_carbon'); // stays queued behind ore_bands
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
  assert.equal(fresh.analysisQueue.length, 1, 'paid-for queued work survives the round trip');
  assert.equal(fresh.analysisQueued('gen2', 'deep_carbon'), true);
  assert.ok(Math.abs(fresh.ppMult - 1.04) < 1e-9, 'grants recomputed after load');
  fresh.deserialize(null);
  assert.equal(fresh.minorsBuilt, 1, 'null blob (pre-v15 save) leaves state untouched');
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

test('machine: deserialize clamps an overshooting analysis progress', () => {
  const { machine } = makeMachine();
  machine.deserialize({
    installed: ['gen0'],
    analysisJob: { partId: 'gen1', analysisId: 'meadow_flora', progress: 9999, duration: 240 },
  });
  assert.equal(machine.analysisJob.progress, 240, 'progress clamped to duration');
  machine.enqueueAnalysis('gen1', 'scrap_alloys'); // queued behind the clamped job
  assert.equal(machine.simulateOffline(1), 1, 'negative remaining must not inflate the offline budget');
  assert.equal(machine.analysisDone('gen1', 'meadow_flora'), true);
  machine.deserialize({ installed: ['gen0'], minorsBuilt: 'x', analysisJob: { partId: 'gen1', analysisId: 'scrap_alloys', progress: 5 } });
  assert.equal(machine.analysisJob, null, 'job with no positive duration is dropped');
  assert.equal(machine.minorsBuilt, 0, 'non-numeric minorsBuilt coerces to 0');
});

test('machine: stage delivery refuses on material shortfall and charges nothing', () => {
  const { machine, pp, inv } = makeMachine();
  inv.materials.stone = 1; // gen0 stage 1 needs 6
  const ppBefore = pp.ppTotal;
  assert.equal(machine.canDeliverStage('gen0'), false);
  assert.equal(machine.deliverStage('gen0'), false);
  assert.equal(pp.ppTotal, ppBefore, 'no PP charged on refusal');
  assert.equal(inv.materials.stone, 1);
  assert.equal(machine.stagesDelivered.gen0 || 0, 0, 'stage did not advance');
});

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
  for (let gen = -1; gen < GEN_CORE.length; gen++) {
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

test('main.js feeds the machine (wiring pins)', () => {
  const src = fs.readFileSync(new URL('../../js/main.js', import.meta.url), 'utf8');
  assert.ok(/\* machineSystem\.ppMult;/.test(src), 'ppMult not folded into globalMultiplier');
  assert.ok(/craftingSystem\.speedMult = machineSystem\.craftSpeedMult;/.test(src), 'craft speed feed missing');
  assert.equal((src.match(/\* machineSystem\.gatherMult\)/g) || []).length, 2, 'gatherMult must fold into BOTH gather-duration sites');
  assert.ok(/machineSystem\.update\(delta\);/.test(src), 'tick missing from the game loop');
  assert.ok(/machine:\s*machineSystem,/.test(src), 'machine missing from the SaveSystem bag');
  assert.ok(/env\._machineState = /.test(src), 'env._machineState feed missing');
});
