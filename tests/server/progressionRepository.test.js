import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createProgressionRepositoryFromPool } from '../../server/repositories/progressionRepository.js';

function fakePool(rowsBySql) {
  return {
    queries: [],
    async query(sql, params = []) {
      this.queries.push({ sql, params });
      const key = Object.keys(rowsBySql).find(k => sql.includes(k));
      return { rows: key ? rowsBySql[key] : [], rowCount: key ? rowsBySql[key].length : 0 };
    }
  };
}

test('getBootstrap returns definitions and player state', async () => {
  const pool = fakePool({
    'from materials': [{ id: 'copper', label: 'Copper', stack_limit: 99, rarity: 'common', drone_gatherable: true }],
    'from mastery_tracks': [{ id: 'survival', label: 'Survival Fabrication', xp_per_level: 100 }],
    'from tech_nodes': [{ id: 'fieldFabrication', branch: 'fabrication', label: 'Field Fabrication', description: 'Unlocks recipes', cost_type: 'pp', cost_amount: 150, material_costs: {}, display_order: 1 }],
    'from tech_node_prerequisites': [],
    'from recipes': [{ id: 'ration', label: 'Ration', recipe_type: 'consumable', output_key: 'ration', output_qty: 1, category: 'survival', base_time: '3', min_crafting_level: 1, required_tech_node: null, slot: null, tier: null, stat_bonuses: {} }],
    'from recipe_costs': [{ recipe_id: 'ration', material_id: 'copper', qty: 1 }],
    'from player_wallets': [{ player_id: 'local-player', pp: '25', pp_rate: '1', prestige_bonus: '0', prestige_count: 0, steps: 10, state_version: 2 }],
    'from player_inventory': [{ item_key: 'copper', bucket: 'inventory', qty: 4 }],
    'from player_tools': [],
    'from player_tech_unlocks': [],
    'from player_mastery': [{ track_id: 'survival', xp: 20, level: 1 }],
    'from player_drones': [{ drone_id: 1, name: 'Drone Alpha', assigned_material: null, efficiency: 1, gather_timer: '0' }],
    'from player_crafting_jobs': []
  });
  const repo = createProgressionRepositoryFromPool(pool);

  const bootstrap = await repo.getBootstrap('local-player');

  assert.equal(bootstrap.definitions.materials[0].id, 'copper');
  assert.equal(bootstrap.definitions.recipes[0].costs.copper, 1);
  assert.equal(bootstrap.player.wallet.pp, 25);
  assert.equal(bootstrap.player.inventory.inventory.copper, 4);
  assert.equal(bootstrap.player.version, 2);
});
