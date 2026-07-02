# Hybrid Local-First PostgreSQL Progression Design

## Goal

Add PostgreSQL-backed progression to the game without making core play depend on a live server. The browser remains responsive and playable while PostgreSQL stores shared game definitions, validates economy transactions, and persists player state when the local backend is available.

## Current Project Context

The project is currently a static ES-module browser game. Game state lives in memory, save files are downloaded as JSON, offline progress uses `localStorage`, recipes are hard-coded in `CraftingSystem`, inventory is held in `InventorySystem`, and unlocks are split across PP portal thresholds and pedometer step purchases.

There is no backend, database layer, migration system, or server-side test harness yet. The first pass must introduce those pieces conservatively while preserving the existing local play loop.

## Approved Direction

Use a schema-first transactional API:

- Add a small local Node API server with PostgreSQL access.
- Store normalized game definitions in PostgreSQL.
- Store player progression state in PostgreSQL.
- Validate important economy actions on the server.
- Keep movement, rendering, combat frames, PP ticking, resource node visibility, and immediate UI behavior local-first.
- Queue economy events in the browser when the backend is unavailable and replay them when it returns.

## First-Pass Feature Scope

The first implementation pass adds the backend foundation and two light progression features:

- A Tech Tree panel with a small starter tree.
- A Crafting Mastery panel with category XP and modest bonuses.
- A sync status indicator showing `Local`, `Syncing`, `Synced`, or `Retry`.
- Telemetry coverage for sync health, transaction outcomes, tech unlocks, and mastery progression.

Backend-owned transactional features in this pass:

- Crafting start and completion.
- Inventory material, consumable, tool, and equipment mutations.
- Tech node purchases.
- Crafting mastery XP awards and level recalculation.
- Drone assignment and upgrade purchases.
- Offline gains reconciliation.
- Full save snapshot storage for compatibility and recovery.

Still local-first in this pass:

- Movement and collision.
- Rendering and Three.js scene state.
- Combat frame updates and FP ticking.
- PP ticking between syncs.
- Resource node visibility, depletion animation, and immediate gather feedback.
- UI responsiveness while offline.

## Architecture

The browser keeps the current game systems as the immediate runtime. A new sync layer sits beside those systems and sends economy transactions to a local Node server.

The Node server exposes API endpoints, validates transactions, writes them to PostgreSQL inside database transactions, and returns the reconciled player state plus a monotonically increasing state version.

PostgreSQL stores two classes of data:

- Game definitions: materials, recipes, recipe costs, tech nodes, mastery tracks, and unlock rules.
- Player state: wallets, inventory, tools, equipment, crafting jobs, tech unlocks, mastery progress, drones, accepted transaction IDs, and save snapshots.

The browser stores a pending event queue locally. If the server is unavailable, economy actions still update local state optimistically and events remain queued. On reconnect, the sync layer submits queued events in order. Accepted server responses update local state and clear queued events.

## Data Model

Definition tables:

- `materials`: material IDs, labels, stack limits, rarity, and whether the material can be drone-gathered.
- `recipes`: craftable item definitions, recipe type, output key, output quantity, craft time, category, required crafting level, and optional required tech node.
- `recipe_costs`: material requirements per recipe.
- `tech_nodes`: node ID, label, description, branch, cost type, cost amount, display order, and enabled flag.
- `tech_node_prerequisites`: prerequisite links between tech nodes.
- `mastery_tracks`: category IDs such as `survival`, `tooling`, `combat`, and `energy`.
- `unlock_rules`: reusable conditions for PP thresholds, step thresholds, owned tech nodes, mastery levels, recipe completion counts, and zone visits.

Player state tables:

- `players`: local player profile ID, display name, created timestamp, and updated timestamp.
- `player_wallets`: PP, PP rate baseline, prestige data, steps, and state version.
- `player_inventory`: stack quantities by item key and inventory bucket.
- `player_tools`: persistent owned tools.
- `player_equipment`: equipped slots and equipment bag entries.
- `player_crafting_jobs`: active and queued craft jobs with recipe ID, status, start time, finish time, and consumed inputs.
- `player_tech_unlocks`: purchased tech nodes.
- `player_mastery`: mastery XP and level by track.
- `player_drones`: drone records, assignments, efficiency, and gather timers.
- `player_transactions`: accepted local event IDs for idempotency and audit.
- `player_save_snapshots`: full JSON save snapshots for migration safety and recovery.
- `telemetry_sessions`: finalized session summaries uploaded from the existing browser telemetry system.
- `telemetry_events`: optional event-level records for sync, transaction, tech tree, and mastery diagnostics.

## API

Initial endpoints:

- `GET /api/health`: returns backend and database availability.
- `GET /api/bootstrap`: returns definitions and the current player state.
- `POST /api/sync`: applies a batch of queued transactions and returns reconciled state.
- `POST /api/transactions`: applies one transaction atomically.
- `POST /api/save-snapshot`: stores a full compatibility snapshot.
- `GET /api/save-snapshot/:playerId`: retrieves the latest snapshot for a player.
- `POST /api/telemetry/sessions`: stores a finalized telemetry session summary.
- `POST /api/telemetry/events`: stores non-blocking telemetry events when event-level diagnostics are enabled.

Transaction shape:

```json
{
  "eventId": "local-uuid",
  "playerId": "local-profile-id",
  "type": "crafting.start",
  "createdAt": "2026-04-19T00:00:00.000Z",
  "expectedVersion": 12,
  "payload": {}
}
```

Initial transaction types:

- `inventory.addMaterial`
- `inventory.removeMaterial`
- `crafting.start`
- `crafting.complete`
- `tech.purchase`
- `mastery.awardCraftXp`
- `drone.assign`
- `drone.upgrade`
- `offline.applyGains`
- `snapshot.save`

The server rejects malformed transactions, duplicate event IDs are treated as already accepted, and valid writes increment the player state version.

## Telemetry

Telemetry is not authoritative game state and must never block gameplay or economy transactions. The existing `TelemetrySystem` remains local-first and continues storing session reports in `localStorage` under `telemetry_sessions`. When the backend is available, finalized session summaries can be uploaded to PostgreSQL.

The first pass extends telemetry coverage to the new progression and sync systems:

- Backend health result and bootstrap duration.
- Active definition version loaded by the browser.
- Sync status transitions: `Local`, `Syncing`, `Synced`, and `Retry`.
- Queue length, oldest queued event age, sync batch size, and sync latency.
- Transaction accepted, rejected, retried, and deduplicated counts.
- Transaction rejection reason categories such as insufficient materials, locked recipe, unmet prerequisite, stale version, and malformed payload.
- Tech node viewed, affordable, purchased, and rejected.
- Mastery XP awarded, mastery level gained, and mastery-gated recipe unlocked.
- Crafting transactions correlated with telemetry recipe IDs.

Telemetry records should include transaction `eventId` when available so a session report can be correlated with server-side transaction audit rows. Telemetry should avoid storing high-frequency movement samples in PostgreSQL; the existing aggregated movement/session counters are enough for the first pass.

## Local-First Sync Flow

On boot:

1. The browser starts from the existing local state path so the game loads even without a server.
2. The sync layer calls `GET /api/health`.
3. If available, it calls `GET /api/bootstrap`.
4. If the server has state, the browser applies the reconciled state.
5. If the server has no state, the browser creates a player record from the current local snapshot.

During play:

1. Economy actions update local state immediately.
2. The sync layer records an event with a stable `eventId`.
3. If online, the event is sent to the server.
4. If offline, the event remains in the local queue.
5. Server responses update local state and state version.

On reconnect:

1. Queued events are submitted in creation order.
2. The server applies events atomically and idempotently.
3. The browser replaces local economy state with the reconciled server state.
4. Any rejected event is marked for retry or conflict display.

## Tech Tree Feature

The first tree is intentionally small and data-driven. Nodes live in `tech_nodes` and are rendered by the new panel from bootstrap definitions.

Starter branches:

- `Field Fabrication`: unlocks additional basic recipes and makes recipe progression visible.
- `Drone Logistics`: unlocks better drone assignments and prepares future drone upgrades.
- `Terrain Control`: gates terrain/tool progression such as Terrain Cutter improvements.
- `Biome Access`: centralizes zone unlocks currently split between PP portals and pedometer purchases.

Initial cost types:

- PP cost.
- Step cost.
- Material bundle cost.
- Prerequisite tech node ownership.
- Mastery level requirement.

The first version does not need a large visual graph. A clear branch list with locked, affordable, and owned states is enough. The data model should support a richer graph later.

## Crafting Mastery Feature

Crafting completions award mastery XP by recipe category. Mastery progress lives in `player_mastery`; category definitions live in `mastery_tracks`.

Initial tracks:

- `survival`: rations, first aid, antidote, repair kits.
- `tooling`: terrain cutter, storage, charging-related tools.
- `combat`: weapons, armor, combat modules.
- `energy`: energy cells, signal flare, overcharge cell, data cache.

Initial mastery effects:

- Small category craft-time reduction.
- Recipe visibility or unlock gates.
- Future room for queue-size or yield bonuses.

The first pass should avoid large compounding bonuses. Mastery should create direction and unlock structure without destabilizing the economy.

## Error Handling

Backend unavailable:

- The game stays playable.
- The sync indicator shows `Local` or `Retry`.
- New economy events are queued locally.
- Existing JSON save export remains available.

Transaction rejected:

- The sync layer records the rejected event.
- The HUD shows a concise retry/conflict state.
- Local economy state is reconciled from the server response when possible.
- Hard conflicts fall back to the most recent save snapshot.

Definition mismatch:

- Definitions include a version.
- The server returns the active definition version during bootstrap.
- The browser can keep a cached definition set but must prefer server definitions when available.

Database migration failure:

- Server startup fails fast with a clear log.
- Browser remains local-only because `/api/health` fails.

## Testing Strategy

Backend tests:

- Migration smoke test against a test database.
- Seed data test proving starter materials, recipes, tech nodes, and mastery tracks exist.
- Transaction tests for crafting start, crafting complete, tech purchase, mastery XP, drone upgrade, and duplicate event IDs.
- Rejection tests for insufficient materials, locked recipes, unmet prerequisites, and stale expected versions.

Frontend tests:

- Sync client queues events when health check fails.
- Sync client replays queued events in order.
- Existing save export remains usable.
- Crafting and inventory systems can consume server definitions.
- Tech Tree and Crafting Mastery panels render locked, affordable, and owned states.

Manual verification:

- Start the game with no server and confirm local play works.
- Start the server and confirm definitions load.
- Craft an item and confirm inventory, mastery XP, and sync status update.
- Unlock a tech node and confirm new recipe or zone availability.
- Stop the server, gather/craft locally, restart the server, and confirm queued events sync.

## Non-Goals For First Pass

- Remote account authentication.
- Multiplayer.
- Fully authoritative frame-by-frame gameplay.
- Replacing all local systems in one pass.
- Large tech tree art or complex graph layout.
- Final economy balancing.
- Removing JSON save/load compatibility.
