import { readConfig } from '../config.js';
import { createPool } from '../db/pool.js';

function number(value) {
  return Number(value || 0);
}

function groupInventory(rows) {
  const buckets = {};
  for (const row of rows) {
    buckets[row.bucket] ||= {};
    buckets[row.bucket][row.item_key] = row.qty;
  }
  return buckets;
}

function attachRecipeCosts(recipes, costs) {
  const byRecipe = new Map(recipes.map(r => [r.id, { ...r, costs: {} }]));
  for (const cost of costs) {
    const recipe = byRecipe.get(cost.recipe_id);
    if (recipe) recipe.costs[cost.material_id] = cost.qty;
  }
  return [...byRecipe.values()];
}

export function createProgressionRepository(config = readConfig()) {
  return createProgressionRepositoryFromPool(createPool(config.databaseUrl), config);
}

export function createProgressionRepositoryFromPool(pool, config = readConfig()) {
  const repo = {
    async health() {
      await pool.query('select 1');
      return { ok: true };
    },

    async getBootstrap(playerId = config.defaultPlayerId) {
      const [
        materials,
        masteryTracks,
        techNodes,
        prerequisites,
        recipes,
        recipeCosts,
        achievementDefs,
        augmentationDefs,
        codexEntryDefs,
        zoneDefs,
        statDefs,
        wallet,
        inventory,
        tools,
        techUnlocks,
        mastery,
        drones,
        jobs,
        playerStats,
        playerAscension,
        playerAchievements,
        playerAugmentations,
        playerCodex,
        playerStatistics,
        playerZoneVisits,
        playerEquipmentBag,
        playerPreferences
      ] = await Promise.all([
        pool.query('select * from materials order by id'),
        pool.query('select * from mastery_tracks order by id'),
        pool.query('select * from tech_nodes where enabled = true order by display_order'),
        pool.query('select * from tech_node_prerequisites order by tech_node_id, prerequisite_id'),
        pool.query('select * from recipes where enabled = true order by id'),
        pool.query('select * from recipe_costs order by recipe_id, material_id'),
        pool.query('select * from achievements order by id'),
        pool.query('select * from augmentations order by id'),
        pool.query('select * from codex_entries order by id'),
        pool.query('select * from zones order by display_order'),
        pool.query('select * from stat_definitions order by display_order'),
        pool.query('select * from player_wallets where player_id = $1', [playerId]),
        pool.query('select * from player_inventory where player_id = $1', [playerId]),
        pool.query('select * from player_tools where player_id = $1', [playerId]),
        pool.query('select * from player_tech_unlocks where player_id = $1', [playerId]),
        pool.query('select * from player_mastery where player_id = $1', [playerId]),
        pool.query('select * from player_drones where player_id = $1 order by drone_id', [playerId]),
        pool.query('select * from player_crafting_jobs where player_id = $1 and status in ($2, $3) order by id', [playerId, 'active', 'queued']),
        pool.query('select * from player_stats where player_id = $1 order by stat_id', [playerId]),
        pool.query('select * from player_ascension where player_id = $1', [playerId]),
        pool.query('select achievement_id, unlocked_at from player_achievements where player_id = $1', [playerId]),
        pool.query('select augment_id, purchased_at from player_augmentations where player_id = $1', [playerId]),
        pool.query('select entry_id, discovered_at from player_codex where player_id = $1', [playerId]),
        pool.query('select * from player_statistics where player_id = $1', [playerId]),
        pool.query('select zone_id, first_visited_at, visit_count from player_zone_visits where player_id = $1', [playerId]),
        pool.query('select id, item_key, slot_type, acquired_at from player_equipment_bag where player_id = $1 order by acquired_at', [playerId]),
        pool.query('select * from player_preferences where player_id = $1', [playerId])
      ]);

      const recipeDefs = attachRecipeCosts(recipes.rows.map(r => ({
        id: r.id,
        label: r.label,
        type: r.recipe_type,
        outputKey: r.output_key,
        outputQty: r.output_qty,
        category: r.category,
        baseTime: number(r.base_time),
        minCraftingLevel: r.min_crafting_level,
        requiredTechNode: r.required_tech_node,
        slot: r.slot,
        tier: r.tier,
        statBonuses: r.stat_bonuses || {}
      })), recipeCosts.rows);

      const walletRow = wallet.rows[0] || {
        pp: 0,
        pp_rate: 1,
        prestige_bonus: 0,
        prestige_count: 0,
        steps: 0,
        state_version: 0
      };

      const ascRow = playerAscension.rows[0] || {};
      const statsRow = playerStatistics.rows[0] || {};
      const prefsRow = playerPreferences.rows[0] || {};

      return {
        definitions: {
          version: 'starter-2',
          materials: materials.rows.map(r => ({
            id: r.id,
            label: r.label,
            stackLimit: r.stack_limit,
            rarity: r.rarity,
            droneGatherable: r.drone_gatherable
          })),
          masteryTracks: masteryTracks.rows.map(r => ({
            id: r.id,
            label: r.label,
            xpPerLevel: r.xp_per_level
          })),
          techNodes: techNodes.rows.map(r => ({
            id: r.id,
            branch: r.branch,
            label: r.label,
            description: r.description,
            costType: r.cost_type,
            costAmount: r.cost_amount,
            materialCosts: r.material_costs || {},
            displayOrder: r.display_order,
            prerequisites: prerequisites.rows.filter(p => p.tech_node_id === r.id).map(p => p.prerequisite_id)
          })),
          recipes: recipeDefs,
          achievements: achievementDefs.rows.map(r => ({
            id: r.id,
            label: r.label,
            description: r.description,
            icon: r.icon,
            rewardPP: r.reward_pp,
            rewardItems: r.reward_items || {}
          })),
          augmentations: augmentationDefs.rows.map(r => ({
            id: r.id,
            label: r.label,
            category: r.category,
            description: r.description,
            costPP: r.cost_pp,
            statEffects: r.stat_effects || {}
          })),
          codexEntries: codexEntryDefs.rows.map(r => ({
            id: r.id,
            category: r.category,
            label: r.label,
            flavor: r.flavor
          })),
          zones: zoneDefs.rows.map(r => ({
            id: r.id,
            label: r.label,
            ppUnlock: r.pp_unlock,
            displayOrder: r.display_order
          })),
          statDefinitions: statDefs.rows.map(r => ({
            id: r.id,
            label: r.label,
            displayOrder: r.display_order
          }))
        },
        player: {
          id: playerId,
          version: walletRow.state_version,
          wallet: {
            pp: number(walletRow.pp),
            ppRate: number(walletRow.pp_rate),
            prestigeBonus: number(walletRow.prestige_bonus),
            prestigeCount: walletRow.prestige_count,
            steps: walletRow.steps
          },
          inventory: groupInventory(inventory.rows),
          tools: tools.rows.map(r => r.tool_key),
          techUnlocks: techUnlocks.rows.map(r => r.tech_node_id),
          mastery: mastery.rows.map(r => ({ trackId: r.track_id, xp: r.xp, level: r.level })),
          drones: drones.rows.map(r => ({
            id: r.drone_id,
            name: r.name,
            assignedMaterial: r.assigned_material,
            efficiency: r.efficiency,
            gatherTimer: number(r.gather_timer)
          })),
          craftingJobs: jobs.rows.map(r => ({
            id: r.local_job_id,
            recipeId: r.recipe_id,
            status: r.status,
            startedAt: r.started_at,
            finishesAt: r.finishes_at
          })),
          stats: playerStats.rows.reduce((acc, r) => {
            acc[r.stat_id] = { level: r.level, exp: number(r.exp) };
            return acc;
          }, {}),
          ascension: {
            ascensionCount:   ascRow.ascension_count   || 0,
            ascensionPoints:  ascRow.ascension_points  || 0,
            ppMultiplier:     number(ascRow.pp_multiplier)     || 1.0,
            combatMultiplier: number(ascRow.combat_multiplier) || 1.0,
            gatherMultiplier: number(ascRow.gather_multiplier) || 1.0,
            droneMultiplier:  number(ascRow.drone_multiplier)  || 1.0,
            upgradeCounts:    ascRow.upgrade_counts || {}
          },
          achievements:   playerAchievements.rows.map(r => r.achievement_id),
          augmentations:  playerAugmentations.rows.map(r => r.augment_id),
          codex:          playerCodex.rows.map(r => r.entry_id),
          statistics: {
            enemiesDefeated:    statsRow.enemies_defeated    || 0,
            defeats:            statsRow.defeats             || 0,
            highestHit:         statsRow.highest_hit         || 0,
            resourcesGathered:  statsRow.resources_gathered  || 0,
            miningActions:      statsRow.mining_actions      || 0,
            totalActions:       statsRow.total_actions       || 0,
            energyDepletedCount:statsRow.energy_depleted_count || 0,
            perfectHits:        statsRow.perfect_hits        || 0,
            zonesWithKills:     statsRow.zones_with_kills    || []
          },
          zoneVisits: playerZoneVisits.rows.map(r => ({
            zoneId: r.zone_id,
            firstVisitedAt: r.first_visited_at,
            visitCount: r.visit_count
          })),
          equipmentBag: playerEquipmentBag.rows.map(r => ({
            id: r.id,
            itemKey: r.item_key,
            slotType: r.slot_type,
            acquiredAt: r.acquired_at
          })),
          preferences: {
            autocombatEnabled: prefsRow.autocombat_enabled || false,
            ...(prefsRow.preferences || {})
          }
        }
      };
    },

    async hasAcceptedEvent(eventId) {
      const result = await pool.query('select 1 from player_transactions where event_id = $1 and accepted = true', [eventId]);
      return result.rowCount > 0;
    },

    async getTransactionContext(playerId) {
      const bootstrap = await this.getBootstrap(playerId);
      return {
        definitions: bootstrap.definitions,
        state: {
          version:        bootstrap.player.version,
          wallet:         bootstrap.player.wallet,
          inventory:      bootstrap.player.inventory,
          techUnlocks:    bootstrap.player.techUnlocks,
          mastery:        bootstrap.player.mastery,
          playerStats:    bootstrap.player.stats,
          achievements:   bootstrap.player.achievements,
          augmentations:  bootstrap.player.augmentations,
          codex:          bootstrap.player.codex
        }
      };
    },

    async recordAccepted(event, result) {
      await pool.query(
        `insert into player_transactions (event_id, player_id, transaction_type, payload, accepted, state_version)
         values ($1, $2, $3, $4::jsonb, true, $5)
         on conflict (event_id) do nothing`,
        [event.eventId, event.playerId, event.type, JSON.stringify(event.payload || {}), result.version]
      );
      await pool.query(
        `update player_wallets
         set state_version = greatest(state_version, $2), updated_at = now()
         where player_id = $1`,
        [event.playerId, result.version]
      );
    },

    async recordRejected(event, reason) {
      await pool.query(
        `insert into player_transactions (event_id, player_id, transaction_type, payload, accepted, reason)
         values ($1, $2, $3, $4::jsonb, false, $5)
         on conflict (event_id) do nothing`,
        [event.eventId, event.playerId, event.type || 'unknown', JSON.stringify(event.payload || {}), reason]
      );
    },

    async applyInventoryDelta(playerId, itemKey, bucket, delta) {
      await pool.query(
        `insert into player_inventory (player_id, item_key, bucket, qty)
         values ($1, $2, $3, $4)
         on conflict (player_id, item_key, bucket)
         do update set qty = greatest(0, player_inventory.qty + excluded.qty)`,
        [playerId, itemKey, bucket, delta]
      );
    },

    async updateWalletDelta(playerId, delta) {
      await pool.query(
        `update player_wallets
         set pp = greatest(0, pp + $2),
             steps = greatest(0, steps + $3),
             updated_at = now()
         where player_id = $1`,
        [playerId, delta.pp || 0, delta.steps || 0]
      );
    },

    async insertCraftingJob(playerId, localJobId, recipeId, startedAt, finishesAt, consumedInputs) {
      await pool.query(
        `insert into player_crafting_jobs (player_id, local_job_id, recipe_id, status, started_at, finishes_at, consumed_inputs)
         values ($1, $2, $3, 'active', $4, $5, $6::jsonb)
         on conflict (player_id, local_job_id) do nothing`,
        [playerId, localJobId, recipeId, startedAt, finishesAt, JSON.stringify(consumedInputs)]
      );
    },

    async completeCraftingJob(playerId, localJobId) {
      await pool.query(
        `update player_crafting_jobs set status = 'complete' where player_id = $1 and local_job_id = $2`,
        [playerId, localJobId]
      );
    },

    async unlockTech(playerId, techNodeId) {
      await pool.query(
        `insert into player_tech_unlocks (player_id, tech_node_id)
         values ($1, $2)
         on conflict do nothing`,
        [playerId, techNodeId]
      );
    },

    async awardMastery(playerId, trackId, xp) {
      await pool.query(
        `insert into player_mastery (player_id, track_id, xp, level)
         values ($1, $2, $3, 1 + floor($3 / 100.0)::int)
         on conflict (player_id, track_id)
         do update set
           xp = player_mastery.xp + excluded.xp,
           level = 1 + floor((player_mastery.xp + excluded.xp) / 100.0)::int,
           updated_at = now()`,
        [playerId, trackId, xp]
      );
    },

    async saveSnapshot(snapshot) {
      await pool.query(
        'insert into player_save_snapshots (player_id, snapshot) values ($1, $2::jsonb)',
        [snapshot.playerId, JSON.stringify(snapshot)]
      );
      return { ok: true };
    },

    async getLatestSnapshot(playerId) {
      const result = await pool.query(
        'select snapshot from player_save_snapshots where player_id = $1 order by created_at desc limit 1',
        [playerId]
      );
      return result.rows[0]?.snapshot || null;
    },

    async saveTelemetrySession(report) {
      await pool.query(
        'insert into telemetry_sessions (player_id, session_id, report) values ($1, $2, $3::jsonb)',
        [report.playerId || null, report.meta?.sessionId || report.session?.sessionId || 'unknown', JSON.stringify(report)]
      );
      return { ok: true };
    },

    async saveTelemetryEvent(event) {
      await pool.query(
        'insert into telemetry_events (player_id, session_id, event_id, event_type, payload) values ($1, $2, $3, $4, $5::jsonb)',
        [event.playerId || null, event.sessionId || null, event.eventId || null, event.type, JSON.stringify(event.payload || {})]
      );
      return { ok: true };
    },

    // ── Stats ───────────────────────────────────────────────────────────────

    async upsertPlayerStat(playerId, statId, newLevel, newExp) {
      await pool.query(
        `insert into player_stats (player_id, stat_id, level, exp, updated_at)
         values ($1, $2, $3, $4, now())
         on conflict (player_id, stat_id)
         do update set level = excluded.level, exp = excluded.exp, updated_at = now()`,
        [playerId, statId, newLevel, newExp]
      );
    },

    // ── Ascension ───────────────────────────────────────────────────────────

    async upsertPlayerAscension(playerId, data) {
      await pool.query(
        `insert into player_ascension
           (player_id, ascension_count, ascension_points, pp_multiplier, combat_multiplier, gather_multiplier, drone_multiplier, upgrade_counts, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, now())
         on conflict (player_id)
         do update set
           ascension_count   = excluded.ascension_count,
           ascension_points  = excluded.ascension_points,
           pp_multiplier     = excluded.pp_multiplier,
           combat_multiplier = excluded.combat_multiplier,
           gather_multiplier = excluded.gather_multiplier,
           drone_multiplier  = excluded.drone_multiplier,
           upgrade_counts    = excluded.upgrade_counts,
           updated_at        = now()`,
        [
          playerId,
          data.ascensionCount    || 0,
          data.ascensionPoints   || 0,
          data.ppMultiplier      || 1.0,
          data.combatMultiplier  || 1.0,
          data.gatherMultiplier  || 1.0,
          data.droneMultiplier   || 1.0,
          JSON.stringify(data.upgradeCounts || {})
        ]
      );
    },

    // ── Achievements ────────────────────────────────────────────────────────

    async unlockAchievement(playerId, achievementId) {
      await pool.query(
        `insert into player_achievements (player_id, achievement_id)
         values ($1, $2)
         on conflict (player_id, achievement_id) do nothing`,
        [playerId, achievementId]
      );
    },

    // ── Augmentations ───────────────────────────────────────────────────────

    async purchaseAugmentation(playerId, augmentId) {
      await pool.query(
        `insert into player_augmentations (player_id, augment_id)
         values ($1, $2)
         on conflict (player_id, augment_id) do nothing`,
        [playerId, augmentId]
      );
    },

    // ── Codex ───────────────────────────────────────────────────────────────

    async discoverCodexEntry(playerId, entryId) {
      await pool.query(
        `insert into player_codex (player_id, entry_id)
         values ($1, $2)
         on conflict (player_id, entry_id) do nothing`,
        [playerId, entryId]
      );
    },

    // ── Statistics ──────────────────────────────────────────────────────────
    // Uses greatest() so counters only move forward regardless of sync order.

    async syncStatistics(playerId, s) {
      await pool.query(
        `insert into player_statistics
           (player_id, enemies_defeated, defeats, highest_hit, resources_gathered,
            mining_actions, total_actions, energy_depleted_count, perfect_hits, zones_with_kills, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::text[], now())
         on conflict (player_id)
         do update set
           enemies_defeated      = greatest(player_statistics.enemies_defeated,      excluded.enemies_defeated),
           defeats               = greatest(player_statistics.defeats,               excluded.defeats),
           highest_hit           = greatest(player_statistics.highest_hit,           excluded.highest_hit),
           resources_gathered    = greatest(player_statistics.resources_gathered,    excluded.resources_gathered),
           mining_actions        = greatest(player_statistics.mining_actions,        excluded.mining_actions),
           total_actions         = greatest(player_statistics.total_actions,         excluded.total_actions),
           energy_depleted_count = greatest(player_statistics.energy_depleted_count, excluded.energy_depleted_count),
           perfect_hits          = greatest(player_statistics.perfect_hits,          excluded.perfect_hits),
           zones_with_kills      = array(select distinct unnest(player_statistics.zones_with_kills || excluded.zones_with_kills)),
           updated_at            = now()`,
        [
          playerId,
          s.enemiesDefeated     || 0,
          s.defeats             || 0,
          s.highestHit          || 0,
          s.resourcesGathered   || 0,
          s.miningActions       || 0,
          s.totalActions        || 0,
          s.energyDepletedCount || 0,
          s.perfectHits         || 0,
          s.zonesWithKills      || []
        ]
      );
    },

    // ── Zone visits ─────────────────────────────────────────────────────────

    async recordZoneVisit(playerId, zoneId) {
      await pool.query(
        `insert into player_zone_visits (player_id, zone_id, visit_count)
         values ($1, $2, 1)
         on conflict (player_id, zone_id)
         do update set visit_count = player_zone_visits.visit_count + 1`,
        [playerId, zoneId]
      );
    },

    // ── Equipment bag ────────────────────────────────────────────────────────

    async addToEquipmentBag(playerId, itemKey, slotType) {
      const result = await pool.query(
        `insert into player_equipment_bag (player_id, item_key, slot_type)
         values ($1, $2, $3) returning id`,
        [playerId, itemKey, slotType]
      );
      return result.rows[0].id;
    },

    async removeFromEquipmentBag(playerId, bagItemId) {
      await pool.query(
        'delete from player_equipment_bag where player_id = $1 and id = $2',
        [playerId, bagItemId]
      );
    },

    // ── Preferences ─────────────────────────────────────────────────────────

    async upsertPreferences(playerId, data) {
      await pool.query(
        `insert into player_preferences (player_id, autocombat_enabled, preferences, updated_at)
         values ($1, $2, $3::jsonb, now())
         on conflict (player_id)
         do update set
           autocombat_enabled = excluded.autocombat_enabled,
           preferences        = player_preferences.preferences || excluded.preferences,
           updated_at         = now()`,
        [
          playerId,
          data.autocombatEnabled ?? false,
          JSON.stringify(data.preferences || {})
        ]
      );
    },

    pool
  };

  return repo;
}
