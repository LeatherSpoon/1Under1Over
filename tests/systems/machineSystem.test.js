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
import { MachineSystem, CONSUMED_GRANT_KEYS } from '../../js/systems/MachineSystem.js';
import { PPSystem } from '../../js/systems/PPSystem.js';

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
