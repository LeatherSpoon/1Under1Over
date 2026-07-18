import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { CONFIG } from '../../js/config.js';
import { ZONE_TERRAIN, ZONE_SPAWN_POS } from '../../js/zoneManager.js';
import { GameStatistics } from '../../js/systems/GameStatistics.js';

// Enforces the "adding a zone" checklist in CLAUDE.md. When a named assertion
// fails, the fix is to add the missing entry it names (or, if the new zone is
// a deliberate exception, add it to the exception set here with a comment).

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const envSrc = read('../../js/scene/Environment.js');
const mainSrc = read('../../js/main.js');
const codexSrc = read('../../js/systems/CodexSystem.js');

// Canonical zone list: the labels map inside Environment.getZoneLabel().
function canonicalZones() {
  const start = envSrc.indexOf('getZoneLabel() {');
  const end = envSrc.indexOf('return labels', start);
  assert.ok(start !== -1 && end !== -1, 'could not locate getZoneLabel() labels map in Environment.js');
  const body = envSrc.slice(start, end);
  return [...body.matchAll(/^\s*(\w+):/gm)].map(m => m[1]);
}

const zones = canonicalZones();

test('canonical zone list parses and looks sane', () => {
  assert.ok(zones.length >= 8, `expected at least 8 zones in getZoneLabel(), parsed: ${zones.join(', ')}`);
  assert.ok(zones.includes('landingSite') && zones.includes('mine'));
});

test('every zone has switchZone, getResourceNodeSpawns, and getEnemySpawns cases in Environment.js', () => {
  for (const zone of zones) {
    const count = envSrc.split(`case '${zone}'`).length - 1;
    assert.ok(
      count >= 3,
      `zone '${zone}' has only ${count} \`case '${zone}'\` occurrence(s) in Environment.js — ` +
      `it needs one each in switchZone(), getResourceNodeSpawns(), and getEnemySpawns() (empty returns are fine)`
    );
  }
});

test('every zone has ZONE_TERRAIN and ZONE_SPAWN_POS entries in js/zoneManager.js', () => {
  assert.deepEqual(Object.keys(ZONE_TERRAIN).sort(), [...zones].sort(),
    'ZONE_TERRAIN keys must match the zones in Environment.getZoneLabel()');
  assert.deepEqual(Object.keys(ZONE_SPAWN_POS).sort(), [...zones].sort(),
    'ZONE_SPAWN_POS keys must match the zones in Environment.getZoneLabel()');
});

test('every portal-reachable zone has an ENV_UNLOCK PP threshold in js/config.js', () => {
  // Zones entered through a door interaction instead of a PP-gated portal.
  const NO_PP_GATE = new Set(['spaceship', 'workspace']);
  const expected = zones.filter(z => !NO_PP_GATE.has(z)).sort();
  assert.deepEqual(Object.keys(CONFIG.ENV_UNLOCK).sort(), expected,
    'ENV_UNLOCK keys must cover every portal-reachable zone (see NO_PP_GATE exceptions in this test)');
});

test('every zone has a ZONE_LORE entry in main.js backed by a CodexSystem Lore entry', () => {
  // The workspace is a utility sub-zone with no lore entry by design.
  const NO_LORE = new Set(['workspace']);
  const start = mainSrc.indexOf('const ZONE_LORE = {');
  const end = mainSrc.indexOf('};', start);
  assert.ok(start !== -1 && end !== -1, 'could not locate ZONE_LORE map in main.js');
  const body = mainSrc.slice(start, end);
  const lore = Object.fromEntries([...body.matchAll(/(\w+):\s*'(\w+)'/g)].map(m => [m[1], m[2]]));

  const expected = zones.filter(z => !NO_LORE.has(z)).sort();
  assert.deepEqual(Object.keys(lore).sort(), expected,
    'ZONE_LORE in main.js must have an entry for every zone (see NO_LORE exceptions in this test)');

  for (const [zone, loreId] of Object.entries(lore)) {
    assert.ok(
      new RegExp(`\\b${loreId}:\\s*\\{`).test(codexSrc),
      `ZONE_LORE maps '${zone}' to codex entry '${loreId}', but no such entry exists in js/systems/CodexSystem.js`
    );
  }
});

test('GameStatistics.TOTAL_WORLDS matches the zone count', () => {
  assert.equal(GameStatistics.TOTAL_WORLDS, zones.length,
    `TOTAL_WORLDS in js/systems/GameStatistics.js must be ${zones.length} (one per zone in Environment.getZoneLabel())`);
});
