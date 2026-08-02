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
  // (finally-restore: GENERATIONS is shared module state — a mid-test failure
  // must not leak the mutated threshold into later tests)
  const row = c.nextRow();
  const saved = row.eligibility;
  try {
    row.eligibility = 3;
    assert.ok(!c.canEvolve(), 'recompiles below threshold block evolve');
    c.getAscensionCount = () => 3;
    assert.ok(c.canEvolve());
  } finally {
    row.eligibility = saved;
  }
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
