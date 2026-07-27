import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MODEL_KEYS } from '../../js/scene/modelKeys.js';
import {
  RULES, ROUTE_TYPES, LAYOUT_VERSION,
  validateLayout, validateRouteClearance,
} from '../../js/scene/layoutSchema.js';
import { expandRegion, routeLength, routeDistance } from '../../js/scene/LayoutBuilder.js';

// The exporter (Assets/3D/BiomeWorlds/export_layout.py) emits a JS module per
// biome; validateLayout is the gate that keeps a bad export out of the browser.
// The design lists seven rejection rules — there is one test per rule below.

/** A minimal layout that must pass cleanly. Each rule test breaks one copy. */
function validLayout() {
  return {
    version: LAYOUT_VERSION,
    zone: 'lagoonCoast',
    bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 },
    districts: [
      { id: 'd.tideworks', label: 'Tideworks', x: 0, z: 5, r: 12, collection: 'Districts' },
    ],
    routes: [
      {
        id: 'r.arterial', type: 'arterial', width: 7,
        points: [[0, -45], [0, -25], [5, -10], [0, 5]],
        collection: 'Routes',
      },
      {
        id: 'r.local', type: 'local', width: 2.5,
        points: [[5, -10], [18, -14]],
        collection: 'Routes',
      },
    ],
    props: [
      {
        id: 'p.idol', model: 'mawMossIdol', x: 0, z: 5,
        scale: 3, rotY: 0, r: 0.9, terrain: 'fixed', collection: 'Terrain_Fixed',
      },
      {
        id: 'p.boulder', model: 'boulder', x: 8, z: -12,
        scale: 0.8, rotY: 1.2, r: 0.75, terrain: 'soft', collection: 'Terrain_Soft',
      },
    ],
    markers: [
      { id: 'm.entrance', kind: 'entrance', x: 0, z: -45, collection: 'Markers' },
      { id: 'm.landmark', kind: 'landmark', x: 0, z: 5, propId: 'p.idol', collection: 'Markers' },
    ],
    regions: [
      {
        id: 'g.scrub', seed: 4242, terrain: 'soft', density: 0.02,
        models: ['mawFernCluster', 'mossyBoulder'],
        shape: { kind: 'circle', x: -15, z: -20, r: 10 },
        collection: 'Regions',
      },
    ],
  };
}

/** Assert that a layout produces exactly the expected rule, and say where. */
function expectRule(layout, rule) {
  const errors = validateLayout(layout);
  const hit = errors.find(e => e.rule === rule);
  assert.ok(hit, `expected ${rule}, got: ${JSON.stringify(errors)}`);
  return hit;
}

test('a well-formed layout passes with no errors', () => {
  assert.deepEqual(validateLayout(validLayout()), []);
});

// ── The seven rejection rules ───────────────────────────────────────────────

test('rejects unknown model keys', () => {
  const l = validLayout();
  l.props[0].model = 'notARealModel';
  const hit = expectRule(l, RULES.UNKNOWN_MODEL);
  assert.match(hit.message, /notARealModel/);

  // Region model lists are checked too — a typo there fails just as loudly.
  const l2 = validLayout();
  l2.regions[0].models = ['mawFernCluster', 'alsoNotReal'];
  expectRule(l2, RULES.UNKNOWN_MODEL);
});

test('rejects duplicate marker ids', () => {
  const l = validLayout();
  l.markers[1].id = 'm.entrance';
  expectRule(l, RULES.DUPLICATE_ID);
});

test('ids must be unique across the whole layout, not just within an array', () => {
  const l = validLayout();
  l.props[0].id = 'm.entrance';
  expectRule(l, RULES.DUPLICATE_ID);
});

test('rejects missing required custom properties', () => {
  const l = validLayout();
  delete l.props[0].scale;
  const hit = expectRule(l, RULES.MISSING_PROPERTY);
  assert.match(hit.path, /props\[0\]\.scale/);
});

test('rejects out-of-bounds authored placements', () => {
  const l = validLayout();
  l.props[1].x = 500;
  expectRule(l, RULES.OUT_OF_BOUNDS);

  // Route points are bounds-checked as well, not just prop origins.
  const l2 = validLayout();
  l2.routes[0].points[1] = [0, -400];
  expectRule(l2, RULES.OUT_OF_BOUNDS);
});

test('rejects objects exported from the wrong collection', () => {
  const l = validLayout();
  l.markers[0].collection = 'Routes';
  expectRule(l, RULES.WRONG_COLLECTION);
});

test('a prop terrain class must match the collection it came from', () => {
  // Terraforming reads the terrain class; the Blender scene and the data must
  // not disagree about what a future system is allowed to remove.
  const l = validLayout();
  l.props[0].terrain = 'soft'; // still in Terrain_Fixed
  expectRule(l, RULES.WRONG_COLLECTION);
});

test('rejects invalid route types', () => {
  const l = validLayout();
  l.routes[0].type = 'highway';
  const hit = expectRule(l, RULES.INVALID_ROUTE_TYPE);
  assert.match(hit.message, /highway/);
});

test('rejects invalid or non-finite transforms', () => {
  for (const bad of [NaN, Infinity, 'three', null]) {
    const l = validLayout();
    l.props[0].rotY = bad;
    const errors = validateLayout(l);
    assert.ok(
      errors.some(e => e.rule === RULES.INVALID_TRANSFORM || e.rule === RULES.MISSING_PROPERTY),
      `rotY=${String(bad)} should have been rejected`
    );
  }

  const zeroScale = validLayout();
  zeroScale.props[0].scale = 0;
  expectRule(zeroScale, RULES.INVALID_TRANSFORM);
});

// ── Structural checks ───────────────────────────────────────────────────────

test('a route needs at least two points', () => {
  const l = validLayout();
  l.routes[0].points = [[0, 0]];
  expectRule(l, RULES.MISSING_PROPERTY);
});

test('inverted scene bounds are rejected', () => {
  const l = validLayout();
  l.bounds = { minX: 50, maxX: -50, minZ: -50, maxZ: 50 };
  expectRule(l, RULES.INVALID_TRANSFORM);
});

test('every route type in the grammar is accepted', () => {
  for (const type of ROUTE_TYPES) {
    const l = validLayout();
    l.routes[0].type = type;
    l.routes[0].width = 7; // inside every band's outer edge
    assert.ok(
      !validateLayout(l).some(e => e.rule === RULES.INVALID_ROUTE_TYPE),
      `${type} should be a valid route type`
    );
  }
});

test('route clearance deviations are reported as warnings, not errors', () => {
  // The design calls these "starting standards to validate", so an out-of-band
  // width must be surfaced without blocking the export.
  const l = validLayout();
  l.routes[0].width = 2; // an arterial at local-trail width
  assert.deepEqual(validateLayout(l), [], 'clearance must not be a hard error');

  const warnings = validateRouteClearance(l);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0].message, /arterial/);
  assert.deepEqual(validateRouteClearance(validLayout()), []);
});

// ── Model key registry ──────────────────────────────────────────────────────

test('MODEL_KEYS matches the _glb registry in Environment.js', () => {
  // Adding a GLB to Environment without adding its key here would let a layout
  // reference a model the validator cannot check. Fail loudly instead.
  const envSrc = readFileSync(
    fileURLToPath(new URL('../../js/scene/Environment.js', import.meta.url)), 'utf8'
  );
  const match = envSrc.match(/this\._glb\s*=\s*\{([^}]*)\}/);
  assert.ok(match, 'could not find the `this._glb = { … }` literal in Environment.js');

  const envKeys = match[1].split(',').map(s => s.trim()).filter(Boolean).sort();
  const listed = [...MODEL_KEYS].sort();

  const missing = envKeys.filter(k => !listed.includes(k));
  const extra = listed.filter(k => !envKeys.includes(k));
  assert.deepEqual(missing, [], 'these models are loaded but missing from modelKeys.js');
  assert.deepEqual(extra, [], 'these keys are in modelKeys.js but no longer loaded');
});

test('every model key used by the fixture is real', () => {
  for (const p of validLayout().props) assert.ok(MODEL_KEYS.includes(p.model));
});

// ── Deterministic region fill ───────────────────────────────────────────────

test('a region expands identically every time', () => {
  const region = validLayout().regions[0];
  const a = expandRegion(region);
  const b = expandRegion(region);
  assert.ok(a.length > 0, 'the region should produce placements');
  assert.deepEqual(a, b);
});

test('editing one region cannot reshuffle another', () => {
  // The design requires independent seeds per region so a district edit stays
  // local. Same seed + same shape → same output regardless of neighbours.
  const base = validLayout();
  const before = expandRegion(base.regions[0]);

  const edited = validLayout();
  edited.regions.push({
    id: 'g.other', seed: 999, terrain: 'soft', density: 0.05,
    models: ['boulder'], shape: { kind: 'circle', x: 30, z: 30, r: 8 },
    collection: 'Regions',
  });
  assert.deepEqual(expandRegion(edited.regions[0]), before);
});

test('region placements stay inside their shape and use only its models', () => {
  const region = validLayout().regions[0];
  const items = expandRegion(region);
  for (const item of items) {
    const d = Math.hypot(item.x - region.shape.x, item.z - region.shape.z);
    assert.ok(d <= region.shape.r + 1e-9, `placement at ${d} escaped a radius-${region.shape.r} region`);
    assert.ok(region.models.includes(item.model));
  }
});

test('region density scales the count with area, not with radius', () => {
  const small = { id: 'a', seed: 1, terrain: 'soft', density: 0.05, models: ['boulder'],
    shape: { kind: 'circle', x: 0, z: 0, r: 10 }, collection: 'Regions' };
  const big = { ...small, shape: { kind: 'circle', x: 0, z: 0, r: 20 } };
  // 4× the area → ~4× the props (rounding keeps it off an exact multiple), so
  // density reads the same whatever the region's size.
  const ratio = expandRegion(big).length / expandRegion(small).length;
  assert.ok(Math.abs(ratio - 4) < 0.1, `expected ~4× the props, got ${ratio}×`);
});

test('a rect region fills its box', () => {
  const region = {
    id: 'g.rect', seed: 7, terrain: 'soft', density: 0.02, models: ['boulder'],
    shape: { kind: 'rect', minX: -10, maxX: 10, minZ: 0, maxZ: 20 }, collection: 'Regions',
  };
  const items = expandRegion(region);
  assert.ok(items.length > 0);
  for (const i of items) {
    assert.ok(i.x >= -10 && i.x <= 10 && i.z >= 0 && i.z <= 20);
  }
});

// ── Route network measurement ───────────────────────────────────────────────

test('routeLength measures along the centreline, not straight-line', () => {
  const route = { points: [[0, 0], [0, 10], [10, 10]] };
  assert.equal(routeLength(route), 20);
});

test('routeDistance walks the network from entrance to district', () => {
  const l = validLayout();
  const entrance = l.markers.find(m => m.kind === 'entrance');
  const district = l.districts[0];

  const d = routeDistance(l, [entrance.x, entrance.z], [district.x, district.z]);
  assert.ok(d !== null, 'the district should be reachable along authored routes');
  // The arterial is 20 + ~15.8 + ~15.8 units; route distance must exceed the
  // 50-unit straight line, since the route bends.
  assert.ok(d > 50, `route distance ${d} should exceed the straight-line 50`);
});

test('routeDistance reports null for a destination no route reaches', () => {
  const l = validLayout();
  assert.equal(routeDistance(l, [0, -45], [45, 45]), null);
});

test('routes join where their endpoints coincide', () => {
  // r.local starts at (5,-10), a point on r.arterial — so the branch tip is
  // reachable from the entrance without any explicit graph authoring.
  const l = validLayout();
  const d = routeDistance(l, [0, -45], [18, -14]);
  assert.ok(d !== null, 'a branch sharing an endpoint should be connected');
});
