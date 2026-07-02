import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MATERIALS,
  MASTERY_TRACKS,
  RECIPES,
  TECH_NODES
} from '../../server/definitions/seedData.js';
import { seedDefinitions } from '../../server/db/seed.js';

test('starter definitions include current materials and progression tracks', () => {
  assert.ok(MATERIALS.some(m => m.id === 'copper'));
  assert.ok(MATERIALS.some(m => m.id === 'timber'));
  assert.ok(MATERIALS.some(m => m.id === 'logicChip'));
  assert.deepEqual(MASTERY_TRACKS.map(t => t.id), ['survival', 'tooling', 'combat', 'energy']);
});

test('starter recipes are categorized for mastery', () => {
  const ration = RECIPES.find(r => r.id === 'ration');
  const terrainCutter = RECIPES.find(r => r.id === 'terrainCutter');
  const basicBlade = RECIPES.find(r => r.id === 'basicBlade');

  assert.equal(ration.category, 'survival');
  assert.equal(terrainCutter.category, 'tooling');
  assert.equal(basicBlade.category, 'combat');
  assert.deepEqual(ration.costs, { timber: 2, fiber: 1 });
});

test('tech tree starts with four branches', () => {
  assert.deepEqual(
    TECH_NODES.map(n => n.id),
    ['fieldFabrication', 'droneLogistics', 'terrainControl', 'biomeAccess']
  );
});

test('PostgreSQL seed writes every canonical progression definition', async () => {
  const calls = [];
  const pool = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      return { rows: [], rowCount: 0 };
    }
  };

  await seedDefinitions(pool, {
    defaultPlayerId: 'local-player',
    defaultPlayerName: 'Local Player'
  });

  const materialIds = calls
    .filter(c => c.sql.includes('insert into materials'))
    .map(c => c.params[0]);
  const masteryIds = calls
    .filter(c => c.sql.includes('insert into mastery_tracks'))
    .map(c => c.params[0]);
  const techIds = calls
    .filter(c => c.sql.includes('insert into tech_nodes'))
    .map(c => c.params[0]);
  const recipeIds = calls
    .filter(c => c.sql.includes('insert into recipes'))
    .map(c => c.params[0]);
  const recipeCosts = calls
    .filter(c => c.sql.includes('insert into recipe_costs'))
    .map(c => `${c.params[0]}:${c.params[1]}`);
  const prerequisites = calls
    .filter(c => c.sql.includes('insert into tech_node_prerequisites'))
    .map(c => `${c.params[0]}:${c.params[1]}`);

  assert.deepEqual(materialIds, MATERIALS.map(m => m.id));
  assert.deepEqual(masteryIds, MASTERY_TRACKS.map(t => t.id));
  assert.deepEqual(techIds, TECH_NODES.map(n => n.id));
  assert.deepEqual(recipeIds, RECIPES.map(r => r.id));
  assert.deepEqual(
    recipeCosts,
    RECIPES.flatMap(r => Object.keys(r.costs).map(materialId => `${r.id}:${materialId}`))
  );
  assert.deepEqual(
    prerequisites,
    TECH_NODES.flatMap(n => n.prerequisites.map(prerequisite => `${n.id}:${prerequisite}`))
  );
});
