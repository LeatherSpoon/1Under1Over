import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TaskSystem } from '../../js/systems/TaskSystem.js';

// ── Terrain Cutter sequence ────────────────────────────────────────────────────

test('crafting stat upgrade completes first Terrain Cutter step', () => {
  const ts = new TaskSystem();
  assert.equal(ts.currentSequence.id, 'terrainCutter');
  assert.equal(ts.currentSequence.steps[0].done, false);
  ts.recordStatUpgrade('crafting');
  assert.equal(ts.currentSequence.steps[0].done, true);
  assert.equal(ts.currentSequence.steps[1].done, false);
});

test('upgrading a non-crafting stat does not advance Terrain Cutter', () => {
  const ts = new TaskSystem();
  ts.recordStatUpgrade('strength');
  assert.equal(ts.currentSequence.steps[0].done, false);
});

test('material collection requires both Stone ×1 and Copper ×1', () => {
  const ts = new TaskSystem();
  ts.recordStatUpgrade('crafting'); // complete step 1 first

  ts.recordMaterialAdded({ stone: 1, copper: 0 });
  assert.equal(ts.currentSequence.steps[1].done, false, 'stone alone not enough');

  ts.recordMaterialAdded({ stone: 0, copper: 1 });
  assert.equal(ts.currentSequence.steps[1].done, false, 'copper alone not enough');

  ts.recordMaterialAdded({ stone: 1, copper: 1 });
  assert.equal(ts.currentSequence.steps[1].done, true, 'both present completes step');
});

test('material collection step completes regardless of crafting upgrade order', () => {
  const ts = new TaskSystem();
  ts.recordMaterialAdded({ stone: 1, copper: 1 });
  assert.equal(ts.currentSequence.steps[1].done, true, 'steps complete in any order');
});

test('crafting terrainCutter completes Terrain Cutter sequence', () => {
  const ts = new TaskSystem();
  ts.recordStatUpgrade('crafting');
  ts.recordMaterialAdded({ stone: 1, copper: 1 });
  ts.recordCraftComplete('terrainCutter');

  const seq = ts._sequences.find(s => s.id === 'terrainCutter');
  assert.equal(seq.done, true);
  assert.notEqual(ts.currentSequence?.id, 'terrainCutter', 'sequence advances past terrainCutter');
});

test('crafting an unrelated recipe does not advance Terrain Cutter', () => {
  const ts = new TaskSystem();
  ts.recordStatUpgrade('crafting');
  ts.recordMaterialAdded({ stone: 1, copper: 1 });
  ts.recordCraftComplete('ration');
  assert.equal(ts.currentSequence.steps[2].done, false);
});

// ── Speed Track sequences ─────────────────────────────────────────────────────

test('placing fewer than 20 tracks does not advance the place-20 step', () => {
  const ts = new TaskSystem();
  const terrainSeq = ts._sequences.find(s => s.id === 'terrainCutter');
  terrainSeq.done = true; // skip to speed track

  ts.recordTrackPlaced(19);
  const seq = ts._sequences.find(s => s.id === 'speedTrackPlace');
  assert.equal(seq.steps[0].done, false);
});

test('placing exactly 20 tracks completes the place-20 step', () => {
  const ts = new TaskSystem();
  const terrainSeq = ts._sequences.find(s => s.id === 'terrainCutter');
  terrainSeq.done = true;

  ts.recordTrackPlaced(20);
  const seq = ts._sequences.find(s => s.id === 'speedTrackPlace');
  assert.equal(seq.steps[0].done, true);
  assert.equal(seq.done, true);
});

test('purchased track sequence requires 25 placed tracks (5 beyond free 20)', () => {
  const ts = new TaskSystem();
  ts._sequences.find(s => s.id === 'terrainCutter').done = true;
  ts._sequences.find(s => s.id === 'speedTrackPlace').done = true;

  ts.recordTrackPlaced(24);
  const expandSeq = ts._sequences.find(s => s.id === 'speedTrackExpand');
  assert.equal(expandSeq.steps[0].done, false, '24 placed is not enough');

  ts.recordTrackPlaced(25);
  assert.equal(expandSeq.steps[0].done, true, '25 placed completes buy+place step');
});

test('remove-all step completes only when all placed tracks are removed', () => {
  const ts = new TaskSystem();
  ts._sequences.find(s => s.id === 'terrainCutter').done = true;
  ts._sequences.find(s => s.id === 'speedTrackPlace').done = true;
  ts._sequences.find(s => s.id === 'speedTrackExpand').done = true;

  ts.recordTrackRemoved(3);
  const clearSeq = ts._sequences.find(s => s.id === 'speedTrackClear');
  assert.equal(clearSeq.steps[0].done, false, 'non-zero placed does not complete');

  ts.recordTrackRemoved(0);
  assert.equal(clearSeq.steps[0].done, true, 'zero placed completes step');
});

test('remove-all step requires expand sequence to be done first', () => {
  const ts = new TaskSystem();
  // expand NOT done
  ts.recordTrackRemoved(0);
  const clearSeq = ts._sequences.find(s => s.id === 'speedTrackClear');
  assert.equal(clearSeq.steps[0].done, false, 'must not complete before expand is done');
});

// ── Equipment Build sequence ───────────────────────────────────────────────────

test('equipment craft completes after collecting copper and crafting copperRing', () => {
  const ts = new TaskSystem();
  // skip all earlier sequences
  ['terrainCutter','speedTrackPlace','speedTrackExpand','speedTrackClear']
    .forEach(id => { ts._sequences.find(s => s.id === id).done = true; });

  const seq = ts._sequences.find(s => s.id === 'equipmentBuild');

  ts.recordMaterialAdded({ copper: 4 });
  assert.equal(seq.steps[0].done, true, 'collect step done with copper 4');
  assert.equal(seq.steps[1].done, false);

  ts.recordCraftComplete('copperRing');
  assert.equal(seq.steps[1].done, true, 'craft step done');
  assert.equal(seq.steps[2].done, false);
});

test('equipping copperRing completes equipment sequence', () => {
  const ts = new TaskSystem();
  ['terrainCutter','speedTrackPlace','speedTrackExpand','speedTrackClear']
    .forEach(id => { ts._sequences.find(s => s.id === id).done = true; });

  const seq = ts._sequences.find(s => s.id === 'equipmentBuild');
  ts.recordMaterialAdded({ copper: 4 });
  ts.recordCraftComplete('copperRing');
  ts.recordEquipItem('copperRing');

  assert.equal(seq.steps[2].done, true);
  assert.equal(seq.done, true);
});

test('equipping a different item does not complete equipment sequence', () => {
  const ts = new TaskSystem();
  ['terrainCutter','speedTrackPlace','speedTrackExpand','speedTrackClear']
    .forEach(id => { ts._sequences.find(s => s.id === id).done = true; });

  const seq = ts._sequences.find(s => s.id === 'equipmentBuild');
  ts.recordMaterialAdded({ copper: 4 });
  ts.recordCraftComplete('copperRing');
  ts.recordEquipItem('basicBlade');

  assert.equal(seq.steps[2].done, false);
});

// ── Drone Dispatch sequence ────────────────────────────────────────────────────

test('drone assign completes first dispatch step', () => {
  const ts = new TaskSystem();
  ['terrainCutter','speedTrackPlace','speedTrackExpand','speedTrackClear','equipmentBuild']
    .forEach(id => { ts._sequences.find(s => s.id === id).done = true; });

  const seq = ts._sequences.find(s => s.id === 'droneDispatch');
  ts.recordDroneAssigned();
  assert.equal(seq.steps[0].done, true);
  assert.equal(seq.steps[1].done, false);
});

test('drone dispatch completes on successful sendOnMission, not on totals', () => {
  const ts = new TaskSystem();
  ['terrainCutter','speedTrackPlace','speedTrackExpand','speedTrackClear','equipmentBuild']
    .forEach(id => { ts._sequences.find(s => s.id === id).done = true; });

  const seq = ts._sequences.find(s => s.id === 'droneDispatch');
  ts.recordDroneAssigned();
  ts.recordDroneDispatched();

  assert.equal(seq.steps[1].done, true);
  assert.equal(seq.done, true);
});

test('drone dispatch step completes independently of assign step', () => {
  const ts = new TaskSystem();
  ['terrainCutter','speedTrackPlace','speedTrackExpand','speedTrackClear','equipmentBuild']
    .forEach(id => { ts._sequences.find(s => s.id === id).done = true; });

  const seq = ts._sequences.find(s => s.id === 'droneDispatch');
  ts.recordDroneDispatched(); // no assign first
  assert.equal(seq.steps[1].done, true);
});

// ── Zone missions ──────────────────────────────────────────────────────────────

test('recordDrill in mine zone completes mine exploration step', () => {
  const ts = new TaskSystem();
  ts.recordDrill('mine');
  const seq = ts._sequences.find(s => s.id === 'mineExploration');
  assert.equal(seq.steps[0].done, true);
});

test('recordDrill in a non-mine zone does not advance mine exploration', () => {
  const ts = new TaskSystem();
  ts.recordDrill('verdantMaw');
  const seq = ts._sequences.find(s => s.id === 'mineExploration');
  assert.equal(seq.steps[0].done, false);
});

test('recordGather in verdantMaw completes verdant expedition step', () => {
  const ts = new TaskSystem();
  ts.recordGather('verdantMaw');
  assert.equal(ts._sequences.find(s => s.id === 'verdantMawExploration').steps[0].done, true);
});

test('recordGather in lagoonCoast completes lagoon survey step', () => {
  const ts = new TaskSystem();
  ts.recordGather('lagoonCoast');
  assert.equal(ts._sequences.find(s => s.id === 'lagoonCoastExploration').steps[0].done, true);
});

test('recordGather in frozenTundra completes tundra survey step', () => {
  const ts = new TaskSystem();
  ts.recordGather('frozenTundra');
  assert.equal(ts._sequences.find(s => s.id === 'frozenTundraExploration').steps[0].done, true);
});

test('recordZoneAction spaceship ascensionTerminal completes spaceship mission', () => {
  const ts = new TaskSystem();
  ts.recordZoneAction('spaceship', 'ascensionTerminal');
  assert.equal(ts._sequences.find(s => s.id === 'spaceshipStation').steps[0].done, true);
});

// ── onUpdate callback ──────────────────────────────────────────────────────────

test('onUpdate fires immediately when a step completes', () => {
  const ts = new TaskSystem();
  let calls = 0;
  ts.onUpdate = () => calls++;

  ts.recordStatUpgrade('crafting');
  assert.equal(calls, 1);

  ts.recordStatUpgrade('strength'); // no change
  assert.equal(calls, 1);
});

// ── Serialization round-trip ───────────────────────────────────────────────────

test('serialize and load preserves completed step state', () => {
  const ts1 = new TaskSystem();
  ts1.recordStatUpgrade('crafting');
  ts1.recordMaterialAdded({ stone: 1, copper: 1 });
  ts1.recordCraftComplete('terrainCutter');

  const saved = ts1.serialize();

  const ts2 = new TaskSystem();
  ts2.load(saved);

  const seq = ts2._sequences.find(s => s.id === 'terrainCutter');
  assert.equal(seq.done, true);
  assert.equal(seq.steps.every(s => s.done), true);
  assert.notEqual(ts2.currentSequence?.id, 'terrainCutter');
});

test('load ignores unknown sequence ids gracefully', () => {
  const ts = new TaskSystem();
  assert.doesNotThrow(() => {
    ts.load([{ id: 'unknownMission', done: false, steps: [{ id: 'x', done: true }] }]);
  });
});

test('load with non-array data is a no-op', () => {
  const ts = new TaskSystem();
  assert.doesNotThrow(() => ts.load(null));
  assert.doesNotThrow(() => ts.load({}));
  assert.equal(ts.currentSequence.id, 'terrainCutter');
});

// ── currentSequenceForDisplay ─────────────────────────────────────────────────

test('currentSequenceForDisplay returns null label when all sequences done', () => {
  const ts = new TaskSystem();
  ts._sequences.forEach(s => { s.done = true; });
  const { label, steps } = ts.currentSequenceForDisplay();
  assert.equal(label, null);
  assert.deepEqual(steps, []);
});

test('currentSequenceForDisplay returns label and steps for active sequence', () => {
  const ts = new TaskSystem();
  const { label, steps } = ts.currentSequenceForDisplay();
  assert.equal(label, 'Terrain Cutter');
  assert.equal(steps.length, 3);
  assert.equal(steps[0].done, false);
});
