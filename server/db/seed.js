import { readConfig } from '../config.js';
import { createPool } from './pool.js';
import { MATERIALS, MASTERY_TRACKS, RECIPES, TECH_NODES } from '../definitions/seedData.js';
import { ACHIEVEMENTS, AUGMENTATIONS, CODEX_ENTRIES, ZONES, STAT_DEFINITIONS } from '../definitions/systemsData.js';
import { isDirectRun, runCli } from './cli.js';

export async function seedDefinitions(pool, config = readConfig()) {
  for (const mat of MATERIALS) {
    await pool.query(
      `insert into materials (id, label, stack_limit, rarity, drone_gatherable)
       values ($1, $2, $3, $4, $5)
       on conflict (id) do update set
         label = excluded.label,
         stack_limit = excluded.stack_limit,
         rarity = excluded.rarity,
         drone_gatherable = excluded.drone_gatherable`,
      [mat.id, mat.label, mat.stackLimit, mat.rarity, mat.droneGatherable]
    );
  }

  for (const track of MASTERY_TRACKS) {
    await pool.query(
      `insert into mastery_tracks (id, label, xp_per_level)
       values ($1, $2, $3)
       on conflict (id) do update set label = excluded.label, xp_per_level = excluded.xp_per_level`,
      [track.id, track.label, track.xpPerLevel]
    );
  }

  for (const node of TECH_NODES) {
    await pool.query(
      `insert into tech_nodes (id, branch, label, description, cost_type, cost_amount, material_costs, display_order)
       values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
       on conflict (id) do update set
         branch = excluded.branch,
         label = excluded.label,
         description = excluded.description,
         cost_type = excluded.cost_type,
         cost_amount = excluded.cost_amount,
         material_costs = excluded.material_costs,
         display_order = excluded.display_order`,
      [
        node.id,
        node.branch,
        node.label,
        node.description,
        node.costType,
        node.costAmount,
        JSON.stringify(node.materialCosts || {}),
        node.displayOrder
      ]
    );

    await pool.query('delete from tech_node_prerequisites where tech_node_id = $1', [node.id]);
    for (const prerequisite of node.prerequisites) {
      await pool.query(
        `insert into tech_node_prerequisites (tech_node_id, prerequisite_id)
         values ($1, $2)
         on conflict do nothing`,
        [node.id, prerequisite]
      );
    }
  }

  for (const recipe of RECIPES) {
    await pool.query(
      `insert into recipes
        (id, label, recipe_type, output_key, output_qty, category, base_time, min_crafting_level, required_tech_node, slot, tier, stat_bonuses)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
       on conflict (id) do update set
         label = excluded.label,
         recipe_type = excluded.recipe_type,
         output_key = excluded.output_key,
         output_qty = excluded.output_qty,
         category = excluded.category,
         base_time = excluded.base_time,
         min_crafting_level = excluded.min_crafting_level,
         required_tech_node = excluded.required_tech_node,
         slot = excluded.slot,
         tier = excluded.tier,
         stat_bonuses = excluded.stat_bonuses`,
      [
        recipe.id,
        recipe.label,
        recipe.type,
        recipe.outputKey,
        recipe.outputQty,
        recipe.category,
        recipe.baseTime,
        recipe.minCraftingLevel,
        recipe.requiredTechNode,
        recipe.slot || null,
        recipe.tier || null,
        JSON.stringify(recipe.statBonuses || {})
      ]
    );

    await pool.query('delete from recipe_costs where recipe_id = $1', [recipe.id]);
    for (const [materialId, qty] of Object.entries(recipe.costs)) {
      await pool.query(
        `insert into recipe_costs (recipe_id, material_id, qty)
         values ($1, $2, $3)
         on conflict (recipe_id, material_id) do update set qty = excluded.qty`,
        [recipe.id, materialId, qty]
      );
    }
  }

  await pool.query(
    `insert into players (id, display_name)
     values ($1, $2)
     on conflict (id) do nothing`,
    [config.defaultPlayerId, config.defaultPlayerName]
  );

  await pool.query(
    `insert into player_wallets (player_id, pp, pp_rate, steps, state_version)
     values ($1, 0, 1, 0, 0)
     on conflict (player_id) do nothing`,
    [config.defaultPlayerId]
  );

  await pool.query(
    `insert into player_inventory (player_id, item_key, bucket, qty)
     values ($1, 'ration', 'consumable', 3), ($1, 'energyCell', 'consumable', 3)
     on conflict (player_id, item_key, bucket) do nothing`,
    [config.defaultPlayerId]
  );

  await pool.query(
    `insert into player_drones (player_id, drone_id, name, assigned_material, efficiency, gather_timer)
     values ($1, 1, 'Drone Alpha', null, 1, 0)
     on conflict (player_id, drone_id) do nothing`,
    [config.defaultPlayerId]
  );

  // ── Systems definitions (002_player_systems) ─────────────────────────────

  for (const a of ACHIEVEMENTS) {
    await pool.query(
      `insert into achievements (id, label, description, icon, reward_pp, reward_items)
       values ($1, $2, $3, $4, $5, $6::jsonb)
       on conflict (id) do update set
         label        = excluded.label,
         description  = excluded.description,
         icon         = excluded.icon,
         reward_pp    = excluded.reward_pp,
         reward_items = excluded.reward_items`,
      [a.id, a.label, a.description, a.icon, a.rewardPP, JSON.stringify(a.rewardItems || {})]
    );
  }

  for (const aug of AUGMENTATIONS) {
    await pool.query(
      `insert into augmentations (id, label, category, description, cost_pp, stat_effects)
       values ($1, $2, $3, $4, $5, $6::jsonb)
       on conflict (id) do update set
         label        = excluded.label,
         category     = excluded.category,
         description  = excluded.description,
         cost_pp      = excluded.cost_pp,
         stat_effects = excluded.stat_effects`,
      [aug.id, aug.label, aug.category, aug.description, aug.costPP, JSON.stringify(aug.statEffects || {})]
    );
  }

  for (const entry of CODEX_ENTRIES) {
    await pool.query(
      `insert into codex_entries (id, category, label, flavor)
       values ($1, $2, $3, $4)
       on conflict (id) do update set
         category = excluded.category,
         label    = excluded.label,
         flavor   = excluded.flavor`,
      [entry.id, entry.category, entry.label, entry.flavor]
    );
  }

  for (const zone of ZONES) {
    await pool.query(
      `insert into zones (id, label, pp_unlock, display_order)
       values ($1, $2, $3, $4)
       on conflict (id) do update set
         label         = excluded.label,
         pp_unlock     = excluded.pp_unlock,
         display_order = excluded.display_order`,
      [zone.id, zone.label, zone.ppUnlock, zone.displayOrder]
    );
  }

  for (const stat of STAT_DEFINITIONS) {
    await pool.query(
      `insert into stat_definitions (id, label, display_order)
       values ($1, $2, $3)
       on conflict (id) do update set
         label         = excluded.label,
         display_order = excluded.display_order`,
      [stat.id, stat.label, stat.displayOrder]
    );
  }

  // ── Default player: new system rows ──────────────────────────────────────

  // player_stats — one row per stat, all starting at level 1
  for (const stat of STAT_DEFINITIONS) {
    await pool.query(
      `insert into player_stats (player_id, stat_id, level, exp)
       values ($1, $2, 1, 0)
       on conflict (player_id, stat_id) do nothing`,
      [config.defaultPlayerId, stat.id]
    );
  }

  // player_ascension — baseline multipliers
  await pool.query(
    `insert into player_ascension (player_id)
     values ($1)
     on conflict (player_id) do nothing`,
    [config.defaultPlayerId]
  );

  // player_statistics — all counters at zero
  await pool.query(
    `insert into player_statistics (player_id)
     values ($1)
     on conflict (player_id) do nothing`,
    [config.defaultPlayerId]
  );

  // player_preferences — defaults
  await pool.query(
    `insert into player_preferences (player_id)
     values ($1)
     on conflict (player_id) do nothing`,
    [config.defaultPlayerId]
  );
}

if (isDirectRun(import.meta.url)) {
  const config = readConfig();
  const pool = createPool(config.databaseUrl);
  runCli(pool => seedDefinitions(pool, config), pool);
}
