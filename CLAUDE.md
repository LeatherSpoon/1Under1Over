# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Keeping CLAUDE.md current

After completing any feature, ask: **does this change how future work should be done?** If yes, update this file before finishing the task.

Update when you:
- Add a new zone, system, or major UI panel (update checklists and key files table)
- Introduce a new architectural pattern or wiring convention
- Add a DB table, migration, or transaction type (update the Postgres section)
- Discover a technical gotcha that would have saved time if documented
- Change a checklist (e.g., "adding a zone now requires N steps")

Do not update for: bug fixes, content additions (items, enemies, node positions), minor tweaks, or anything already obvious from reading the code.

---

## Project

**Processing Power** — a browser-based 3D idle RPG. Orthographic camera, toon-shaded Three.js renderer, ES6 modules (no build step). The game runs entirely client-side; the Node.js server is optional and only used for save-state sync and progression definitions.

## Commands

```bash
# Serve the game (required — index.html blocks file:// protocol)
start-node.bat          # Windows: serves on http://localhost:8080
node server/start.js    # Start the optional API on port 3000

# Tests
npm test                # Runs tests/runAll.test.js (Node, ES modules)

# Database (optional server)
npm run db:migrate
npm run db:seed

# Syntax check a file without running it
node --check js/path/to/file.js
```

There is no linter or formatter configured. Run `node --check <file>` after edits to catch syntax errors before browser testing.

## Architecture

### Entry points

- **`index.html`** — SPA shell. Defines all panel HTML. Guards against `file://` with a visible error. Imports Three.js via importmap from `js/vendor/`.
- **`js/main.js`** — Bootstrap, game loop, input handling, collision resolution, and interaction logic. All systems are instantiated here and wired together via callbacks. The animation loop runs via `renderer.setAnimationLoop(gameLoop)`.
- **`js/config.js`** — Single source of truth for all tunable constants (energy costs, speed multipliers, stat costs, zone PP unlock thresholds, etc.).

### System wiring pattern

Systems are decoupled via optional callbacks set after instantiation:

```js
craftingSystem.onCraftComplete = (recipe) => { /* handle in main.js */ };
combatSystem.onCombatEnd = (won, fled) => { /* chain existing + add */ };
techTree.onPurchase = (id) => { /* apply effects in main.js */ };
```

Never import `main.js` from a system — all cross-system effects flow through these callbacks wired in `main.js`.

### Collision system

All collision uses **circles on the XZ plane**: `{ x, z, r }`. The player has `PLAYER_R = 0.35`. Every frame, `main.js` iterates `env.getCollisionCircles()` and pushes the player radially outward when `dist < circle.r + PLAYER_R`.

For **axis-aligned rectangular blocks** (mine/depths grid), the correct collision radius is:
`r_min = (half_block_width × √2) − PLAYER_R`
This keeps the player center outside the block at all approach angles without the large face gap of the full circumscribed radius.

### Zone system

`Environment.js` owns all 3D scene construction. `switchZone(name)` in `main.js` calls `env.switchZone(name)` which clears and rebuilds the scene. Each zone needs entries in:

1. `Environment.js` — `switchZone()` case, `getZoneLabel()`, `getResourceNodeSpawns()`, `getEnemySpawns()`, and a `_build<Zone>()` method
2. `main.js` — `ZONE_TERRAIN`, `ZONE_SPAWN_POS`
3. `js/config.js` — `ENV_UNLOCK` PP threshold
4. `js/systems/GameStatistics.js` — increment `TOTAL_WORLDS`

### Save system

`SaveSystem.js` serializes all game state to a JSON blob downloaded as a file. Each system implements `serialize()` / `load()` (or `deserialize()`). When adding a new system that needs persistence:

1. Add it to `SaveSystem.systems` destructure in both `_buildSaveData()` and `apply()`
2. Call `system.serialize()` in the save data object
3. Call `system.load(data.key)` in `apply()`
4. If the system applies bonuses to other systems on load (e.g., augmentations), implement an `applyBonuses(statsSystem)` method called explicitly during `apply()` rather than relying on the `onPurchase` callback (which isn't set yet at load time)

### HUD / panels

`HUD.js` manages all panels. Adding a new panel requires:

1. Panel HTML in `index.html` (`<div id="my-panel" class="panel-overlay" hidden>`)
2. `_refreshMyPanel()` method in `HUD.js`
3. A case in `_refreshPanel(panelId)`
4. Add panel ID to the `_MENU_PANEL_IDS` array in `main.js` (so opening it closes others) AND `_closeCommandPanels()` in `HUD.js`
5. For a menu-bar tab: add `<button class="menu-tab" data-tab="my-panel">` inside `#menu-tabbar` in `index.html`
6. For a HUD button: add to `_wirePanelToggles()` or a dedicated `_wireMyButton()` method, called from the constructor

### IIC framework systems (Optimization Console)

The OPT tab houses three subsystems instantiated in `main.js` and passed to `HUD` as a single `optimization` bag (`{ mathematician, timeWarp, modifiers }`):

- **Mathematician** — paid time-limited window that reveals gains-per-PP across upgrades. `analyze({ stats, ascension, techTree })` returns sorted ROI rows.
- **Modifiers** — opt-in trade-off toggles (max 2 active). Each modifier mutates `pp.setModifier()` and a `statsAccum` bag (`gatherMult`, `energyCostMult`, `damageMult`, `droneMult`). All four are now honored: `gatherMult`/`energyCostMult` are read inline in `main.js` (gather-duration sites + the `_energyCost()` helper); `damageMult`/`droneMult` are pushed into `CombatSystem.damageMult` / `DroneSystem.efficiencyMult` via `modifiers.onChange` in `main.js`.
- **TimeWarp** — Quantum Crystals premium currency. Awarded on every 5th achievement, on ascension, and on >4hr offline returns. Spent on instant PP grants + temporary rate boosts.

All three serialize/deserialize via `SaveSystem` (version 4+).

### Key files by concern

| Concern | File |
|---|---|
| Game constants | `js/config.js` |
| All systems bootstrap + game loop | `js/main.js` |
| Zone generation, collision, portals | `js/scene/Environment.js` |
| Mine grid layout (procedural) | `js/scene/MineLayout.js` |
| Save/load serialization | `js/systems/SaveSystem.js` |
| Character stats + derived values | `js/systems/StatsSystem.js` |
| Crafting recipes + queue | `js/systems/CraftingSystem.js` |
| Tool durability, material bags | `js/systems/InventorySystem.js` |
| Passive ore extraction (Refinery) | `js/systems/ExtractorSystem.js` |
| Processing-node chain (Refinery) | `js/systems/ProcessingNodeSystem.js` |
| Spatial 5×5 schematic assembly | `js/systems/AssemblySystem.js` |
| All UI panels + HUD | `js/ui/HUD.js` |
| Combat turn logic | `js/systems/CombatSystem.js` |
| Tech tree nodes + effects | `server/definitions/seedData.js` + `js/systems/TechTreeSystem.js` |
| Materials, recipes, tech nodes (seed) | `server/definitions/seedData.js` |
| Achievements, augments, codex, zones, stats (seed) | `server/definitions/systemsData.js` |
| Number formatting (K/M/B/T/Qa+ shorthand, /min·/hr rates) | `js/util/NumberFormat.js` |
| ROI Analyzer (Mathematician — paid reveal window) | `js/systems/MathematicianSystem.js` |
| Time-Warp + Quantum Crystals (premium currency) | `js/systems/TimeWarpSystem.js` |
| Trade-off Modifiers (Overclock, Frugal Circuits, etc.) | `js/systems/ModifiersSystem.js` |
| Optimization Console panel (OPT tab) | `_refreshOptimization()` in `js/ui/HUD.js` |
| All DB read/write methods | `server/repositories/progressionRepository.js` |
| Transaction validation + application | `server/services/transactionService.js` |
| Schema migrations (run in order) | `server/db/migrations/` |
| Client → server sync queue | `js/sync/SyncClient.js` |

### Postgres integration

The server is a local-first sync layer backed by PostgreSQL. The client queues transactions in `localStorage` and flushes them to `POST /api/sync`. All critical player progression is authoritative in Postgres.

**Adding a new system that needs DB persistence:**
1. Add table(s) to a new migration file: `server/db/migrations/00N_description.sql`
2. Add definition data (if content-driven) to `server/definitions/systemsData.js` and seed it in `server/db/seed.js`
3. Add read/write methods to `server/repositories/progressionRepository.js`
4. Add transaction type handler(s) to `server/services/transactionService.js`
5. Include the new data in `getBootstrap()` (both the parallel query list and the return object)
6. Wire `syncClient.recordTransaction(type, payload)` in the client system on every state change

**Current transaction types** (add new ones here when implemented):
`inventory.addMaterial`, `crafting.start`, `crafting.complete`, `tech.purchase`, `mastery.awardCraftXp`, `stats.levelUp`, `ascension.update`, `achievement.unlock`, `augmentation.purchase`, `codex.discover`, `stats.sync`, `zone.visit`, `equipment.bag.add`, `equipment.bag.remove`, `preferences.update`, `drone.assign`, `drone.upgrade`

**Current DB tables** (29 total across 2 migrations):
- *Definitions*: `materials`, `mastery_tracks`, `tech_nodes`, `tech_node_prerequisites`, `recipes`, `recipe_costs`, `achievements`, `augmentations`, `codex_entries`, `zones`, `stat_definitions`
- *Player state*: `player_wallets`, `player_inventory`, `player_tools`, `player_equipment`, `player_crafting_jobs`, `player_tech_unlocks`, `player_mastery`, `player_drones`, `player_stats`, `player_ascension`, `player_achievements`, `player_augmentations`, `player_codex`, `player_statistics`, `player_zone_visits`, `player_equipment_bag`, `player_preferences`
- *Audit/analytics*: `player_transactions`, `player_save_snapshots`, `telemetry_sessions`, `telemetry_events`

### Seeded RNG

Use `seededRandom(seed)` (mulberry32, defined in `Environment.js`) for any deterministic procedural placement. Each zone/feature should use a distinct seed constant so changes to one don't shift others.

### Three.js conventions

- All materials use `createToonMaterial(hexColor)` from `js/scene/ToonMaterials.js`.
- Outlines are added via `addOutline(mesh, thickness)` (cloned mesh, inverted normals).
- The camera is orthographic; object height affects visual layering but not gameplay — keep interactive objects at `y ≈ 0`.
- `seededRandom` is a module-level function in `Environment.js`, not exported. Inline a copy if needed in other files (see `MineLayout.js`).
