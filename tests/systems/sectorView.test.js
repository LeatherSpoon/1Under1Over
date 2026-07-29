import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SectorView, spatialRng } from '../../js/scene/SectorView.js';

// SectorView takes no three.js dependency — it only ever calls group.add /
// group.remove — so it is testable headlessly. That is deliberate: the
// streaming logic is the part worth pinning, and it should not need a renderer.
function fakeGroup() {
  return {
    children: [],
    add(o) { this.children.push(o); },
    remove(o) {
      const i = this.children.indexOf(o);
      if (i !== -1) this.children.splice(i, 1);
    },
  };
}

/** An item that records how many times it was built and torn down. */
function probe(x, z, extra = {}) {
  const item = {
    x, z, builds: 0, disposals: 0,
    materialize() { item.builds++; return { id: `${x},${z}` }; },
    dispose() { item.disposals++; },
    ...extra,
  };
  return item;
}

test('items only materialize once the player is inside the activate radius', () => {
  const group = fakeGroup();
  const view = new SectorView({ group, sectorSize: 16, activateR: 20, deactivateR: 30 });
  const near = view.add(probe(0, 0));
  const far = view.add(probe(90, 90));

  view.update({ x: 0, z: 0 });

  assert.equal(near.builds, 1, 'the nearby item should be built');
  assert.equal(far.builds, 0, 'the distant item should not be built');
  assert.equal(group.children.length, 1);
});

test('hysteresis: an active sector survives the gap between the two radii', () => {
  const group = fakeGroup();
  const view = new SectorView({ group, sectorSize: 16, activateR: 20, deactivateR: 30 });
  const item = view.add(probe(0, 0));

  view.update({ x: 0, z: 0 });
  assert.equal(item.builds, 1);

  // Between activateR and deactivateR — must NOT tear down, or a player walking
  // the boundary would thrash the whole sector every frame.
  view.update({ x: 40, z: 0 });
  assert.equal(item.disposals, 0, 'item torn down inside the hysteresis band');

  // Past deactivateR — now it goes.
  view.update({ x: 60, z: 0 });
  assert.equal(item.disposals, 1);
  assert.equal(group.children.length, 0);

  // Coming back rebuilds it.
  view.update({ x: 0, z: 0 });
  assert.equal(item.builds, 2);
});

test('collision only exists for sectors that are actually live', () => {
  const group = fakeGroup();
  const view = new SectorView({ group, sectorSize: 16, activateR: 20, deactivateR: 30 });
  view.add(probe(0, 0, { r: 0.7 }));
  view.add(probe(90, 90, { r: 0.7 }));
  view.add(probe(2, 2));                  // walkable — no radius, never a blocker

  view.update({ x: 0, z: 0 });
  assert.equal(view.collisionCircles.length, 1, 'only the live blocker should collide');
  assert.deepEqual(view.collisionCircles[0], { x: 0, z: 0, r: 0.7 });

  view.update({ x: 90, z: 90 });
  assert.equal(view.collisionCircles.length, 1);
  assert.equal(view.collisionCircles[0].x, 90, 'collision should follow the player');
});

test('the collision version bumps only when something actually changes', () => {
  const group = fakeGroup();
  const view = new SectorView({ group, sectorSize: 16, activateR: 20, deactivateR: 30 });
  view.add(probe(0, 0, { r: 1 }));

  view.update({ x: 0, z: 0 });
  const settled = view.version;

  // Moving far enough to re-scan but not far enough to change any sector must
  // not invalidate Environment's cached collision array.
  view.update({ x: 3, z: 0 });
  assert.equal(view.version, settled, 'version bumped without a sector change');
});

test('persistent items build immediately and never tear down', () => {
  const group = fakeGroup();
  const view = new SectorView({ group, sectorSize: 16, activateR: 20, deactivateR: 30 });
  const landmark = view.add(probe(90, 90, { persistent: true, r: 2 }));

  // Built on the first update even though the player is 127 units away — this
  // is what keeps a distant landmark legible as a navigation silhouette.
  view.update({ x: 0, z: 0 });
  assert.equal(landmark.builds, 1);
  assert.equal(view.collisionCircles.length, 1);

  view.update({ x: 200, z: 200 });
  assert.equal(landmark.disposals, 0, 'a landmark must never tear down');
});

test('a standing player costs no rescans', () => {
  const group = fakeGroup();
  const view = new SectorView({ group, sectorSize: 16, activateR: 20, deactivateR: 30 });
  const item = view.add(probe(0, 0));

  view.update({ x: 0, z: 0 });
  for (let i = 0; i < 100; i++) view.update({ x: 0, z: 0 });
  assert.equal(item.builds, 1, 'a stationary player should not rebuild anything');
});

test('clear tears everything down, including persistent items', () => {
  const group = fakeGroup();
  const view = new SectorView({ group, sectorSize: 16, activateR: 20, deactivateR: 30 });
  const near = view.add(probe(0, 0, { r: 1 }));
  const landmark = view.add(probe(5, 5, { persistent: true }));
  view.update({ x: 0, z: 0 });

  view.clear();

  assert.equal(near.disposals, 1);
  assert.equal(landmark.disposals, 1);
  assert.equal(group.children.length, 0, 'zone switch must leave no orphan meshes');
  assert.equal(view.collisionCircles.length, 0);
  assert.equal(view.stats.sectors, 0);
});

test('hysteresis is required, not optional', () => {
  // Equal radii would thrash a sector on and off at the boundary; the
  // constructor refuses rather than shipping a frame-rate cliff.
  assert.throws(
    () => new SectorView({ group: fakeGroup(), activateR: 30, deactivateR: 30 }),
    /hysteresis/
  );
});

test('a sector activates early enough for a wide blocker straddling its border', () => {
  const group = fakeGroup();
  const view = new SectorView({ group, sectorSize: 16, activateR: 10, deactivateR: 20 });
  // A big landmark at the far corner of its sector, with a wide radius.
  const wide = view.add(probe(15.5, 0, { r: 3 }));

  // 24 units from the sector's near edge (x=0) but only ~8.5 from the prop.
  // Padding by the widest blocker is what makes this activate in time.
  view.update({ x: 24, z: 0 });
  assert.equal(wide.builds, 1, 'a wide prop must activate before it can be reached');
});

test('spatialRng is stable per cell and different between cells', () => {
  // Prop variants must survive any number of materialize/dispose round trips.
  const a = spatialRng(1234, 3, 7);
  const b = spatialRng(1234, 3, 7);
  assert.equal(a(), b());
  assert.equal(a(), b());

  const other = spatialRng(1234, 4, 7);
  assert.notEqual(spatialRng(1234, 3, 7)(), other());

  // A different region seed must not reproduce another region's stream —
  // that independence is what stops one edit reshuffling the whole biome.
  assert.notEqual(spatialRng(1234, 3, 7)(), spatialRng(5678, 3, 7)());
});

test('stats report what is live', () => {
  const group = fakeGroup();
  const view = new SectorView({ group, sectorSize: 16, activateR: 20, deactivateR: 30 });
  view.add(probe(0, 0));
  view.add(probe(1, 1));
  view.add(probe(90, 90));

  view.update({ x: 0, z: 0 });
  const s = view.stats;
  assert.equal(s.items, 3);
  assert.equal(s.sectors, 2);
  assert.equal(s.active, 1);
  assert.equal(s.live, 2, 'only the two items in the live sector should be built');
});
