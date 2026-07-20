# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Session start: read `STATUS.md` (repo root) before exploring.** It is the live current-state brief — which branch the work is on, what just landed, what's next, open threads — and exists so sessions don't re-derive project state from scratch. If it's missing from the checked-out branch, look for it on other branches before assuming it's gone.

## Keeping CLAUDE.md current

After completing any feature, ask: **does this change how future work should be done?** If yes, update this file before finishing the task.

Update when you:
- Add a new zone, system, or major UI panel (update checklists and key files table)
- Introduce a new architectural pattern or wiring convention
- Add a DB table, migration, or transaction type (update the Postgres section)
- Discover a technical gotcha that would have saved time if documented
- Change a checklist (e.g., "adding a zone now requires N steps")

Do not update for: bug fixes, content additions (items, enemies, node positions), minor tweaks, or anything already obvious from reading the code.

## Keeping STATUS.md current

`STATUS.md` is the session-start brief; it is only useful if it never rots. Before finishing any session that changed the project (code, assets, design docs, or a decision):

1. Rewrite **Current focus** / **Next up** if they shifted
2. Add one line to the **Session log** (date — what landed)
3. Update **Where the work lives** if branches or HEAD changed, and **Open threads** as threads open or close
4. Bump **Last updated**; prune so the file stays about one screen (session log ≤10 lines) — anything CLAUDE.md or git history already records doesn't belong there

Sessions that change nothing (pure Q&A or analysis) skip this.

---

## Project

**Processing Power** — a browser-based 3D idle RPG. Orthographic camera, toon-shaded Three.js renderer, ES6 modules (no build step). The game runs entirely client-side; the Node.js server is optional and only used for save-state sync and progression definitions.

## Commands

```bash
# Serve the game (required — index.html blocks file:// protocol)
start-node.bat          # Windows: serves on http://localhost:8080
start-mobile.bat        # Serve on LAN for iPhone/mobile testing — prints phone URL + QR; append ?debug to the URL for an on-device console (eruda)
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
2. `js/zoneManager.js` — `ZONE_TERRAIN`, `ZONE_SPAWN_POS`
3. `js/config.js` — `ENV_UNLOCK` entry (0 = free portal; any positive value marks the portal as *gated* — since save v13 the actual gate is boss clearance or a `PEDOMETER_ENV_UNLOCK` step-spend, never a PP price)
4. `js/systems/GameStatistics.js` — increment `TOTAL_WORLDS`
5. `ZONE_LORE` map in `js/main.js` + a matching `Lore` entry in `js/systems/CodexSystem.js` (codex lore auto-discovers on first zone visit)
6. (optional) `js/scene/SceneManager.js` — `ZONE_AMBIENCE` preset if the zone needs non-default sky/fog/light levels. Cave zones (mine, depths) go dark and rely on point lights added by their zone builders; `switchZone` applies presets via `sceneManager.setZoneAmbience(zoneName)`.

Steps 1–5 are enforced by `tests/systems/zoneWiring.test.js` — run `npm test` after wiring; a failure names the exact missing entry. Zones that are deliberate exceptions (no PP gate, no lore) are listed in exception sets inside that test and must be added there consciously.

**The Mine is tile-map-driven, re-rolls per delve, and is dig-anywhere**: `js/scene/zones/Mine/layout.js` holds the baseline 25×25 ASCII map (`.` floor, `0` plain diggable rock, `1`-`5` ore tiers, space = immortal rock — generated maps keep space only on the outer shell) plus a mutable *active map* all getters read (`setActiveMineMap`/`getActiveMineMap`/`setMineMapCell`). Only *exposed* mineable cells (8-neighbor open floor) are instantiated; depleting one opens its cell and `env._mineDig.onDepleted` (called from `Environment.drillRock`, guarded on `rock.cellC`) spawns the newly exposed layer behind it. Plain rock is one-hit, stone-only loot (`PLAIN_ROCK_PROPS`), renders as region wall pieces; floor is pre-built under every mineable cell so no patching on dig. **The kit path is chunk-windowed (Phase 3)**: the grid partitions into 8×8-cell chunks; rock/wall/dressing *visuals* materialize within `CHUNK_ACTIVATE_R` of the player and tear down beyond `CHUNK_DEACTIVATE_R` (`env._mineChunks.update(playerPos)` from the game loop), while all gameplay state (map cells, `env._rocks` logic objects, collision boxes) stays global — `rock.mesh` is null while far away, and per-cell visuals derive from `cellRng(seed,c,r)` so variants survive round trips (as does partial drill damage, re-derived from `richness`). Growing the map is now a data change (grid size + anchor layout), not a perf risk. The reveal cut is occlusion-aware (`_addRevealDiscard` in `ToonMaterials.js`): fragments discard only when inside the player's view-space circle AND closer to the camera — rock beside the player stays solid; outline shells use `createRevealOutlineMaterial` so the hole never exposes black shell interiors. At build time `Mine/index.js` swaps in `generateMineMap(seed)` from `Mine/generator.js`: fixed anchor rooms + guaranteed corridors (`Mine/anchors.js` — entrance, drill, Depths shaft, Breach; portals never move) filled with a seeded cave carve and depth-banded ore, flood-fill-validated so every gate stays reachable (`tests/systems/mineGenerator.test.js` sweeps 100 seeds). `MineDelveSystem` (save v9) owns the delve lifecycle: descending from Landing Site re-rolls the seed and clears mined cells; Mine↔Depths keeps the same cave; blocks mined out stay depleted within a delve (`env.onRockDepleted` → `recordMined`, re-roll/arm gating lives in `zoneManager.js`). Non-mineable cave walls are auto-generated around carved cells and merged into per-row runs; `tests/mineLayout.test.js` flood-fills the baseline map. Narrative flow: entrance adit → main shaft → working cavern (drill rig + Depths shaft) → winding passage → the Breach (ancient portal chamber holding the world gates). Because the cave re-rolls per delve, mine enemy spawn coordinates in `getEnemySpawns()` are approximate: `_snapToMineFloor` (Environment.js) relocates each to the nearest carved floor cell at spawn time — an authored point inside rock is fine. Bosses don't patrol (they guard their spawn post with a visible red aggro-ring telegraph at their 1.6-unit engage radius); regular enemies patrol as before.

The Mine renders from a modular GLB kit (`models/MineKit.glb`, source `Assets/3D/MineKit/MineKit.blend` with embedded export/bake/regen scripts): `Mine/kit.js` preloads it and maps GLB materials → game shaders (`materialKindFor` in `kitRules.js`: names matching /vein|rune|crystal|glow/ become `MeshBasicMaterial` glow, everything else becomes `createRevealToonMaterial` from the GLB color — palette tuning happens in Blender, not JS). Kit meshes carry a baked `COLOR_0` layer (Cycles AO + painterly mottle); `kit.js` enables `vertexColors` on any replacement material whose geometry has it (glow materials skip it). Mine floors are **one merged vertex-colored mesh** sampling the pure `floorColorAt(x,z)` field in `Mine/floorColor.js` (tested in Node) — never per-cell flat tiles, which read as a grid. Walls place per cell (`getMineWallCells`) with seeded variant/quarter-rotation picks; collision still uses the merged runs. Every kit path falls back to the pre-kit primitives while the GLB loads. **Blender color gotcha:** node color inputs (`default_value`) are linear — convert sRGB palette hexes with the sRGB EOTF before assigning or every exported material reads ~1.5 stops too bright in-engine. **Vertex-color export gotchas:** a Base Color input left *linked* (e.g. to a vertex-color mix node) exports `baseColorFactor` as white — unlink during export and restore after (the blend's `export_glb.py` does this); pass `export_vertex_color='ACTIVE'`, and Cycles vertex-color bakes require the mesh to have a UV layer even though it's unused.

Environment also supports:
- `env._spinners` — `{ mesh, axis, speed }` entries rotated each frame by `env.update()`, cleared on zone switch (Breach ring, floating shard).
- `env._revealMaterials` — materials from `createRevealToonMaterial(color, { revealR })`; `main.js` feeds them the player position each frame so tall cave walls open up around the player.

**Portals** are the `models/Portal.glb` "Ancient World Gate" (built in Blender, sits on the ground at `y=0`, no procedural ring/torus). `_addPortal()` registers the portal then calls `_attachPortalModel()`, which clones the GLB and grabs the mesh whose material name matches `/PortalEnergy/i` as the per-portal dynamic-state material. `refreshPortalAccess()` tints that material's `color`+`emissive` teal (reachable) / orange (locked). **Gotcha:** on the first zone the GLB is still loading when `_addPortal` runs, so `_attachPortalModel` is called again for every existing portal inside the `_modelsReady.then()` in the constructor — keep it idempotent (guarded by `portal.hasModel`).

**Decorative GLB props** (trees, rocks, boulders, etc.) go through `Environment.js`'s `loadModel()`/`_glb` cache and `ZoneAssets.js` (see file header there for the full add-a-prop steps and radii). **Gameplay-entity GLB swaps** (a resource node, enemy, or boss rendered from a model instead of primitives) follow a different, per-file pattern: a module-level `GLTFLoader` kicks off the load immediately when the module is imported, resolves into a plain `{ key: THREE.Group }` cache object, and the entity's mesh-building code clones from that cache if present, else falls back to the original procedural geometry (no `await`, no pop-in handling — see `ResourceNode.js` (`_nodeModels`, keyed by material type) and `Enemy.js` (`_bossModels`, keyed by archetype) for the two existing examples). GLB assets are frequently exported at wildly different native scales from each other — always check the actual bounding box (`new THREE.Box3().setFromObject(...)`) before picking a `scale` value instead of guessing; a naive scale tuned for one model can be 3-5x wrong for another. **Boss GLBs specifically should be authored at ~0.8 units native height** (the Scorpion convention): `_buildBossModelMesh` applies a shared ×1.4 model scale and places the threat indicator at group-local y=2.2, both tuned for that size — a 1.8-tall export comes out 2.7× the player and buries the indicator inside the model's head.

**The player is a rigged, animated GLB** (`models/Player.glb`: 17-bone humanoid armature + `Idle`/`Run` NLA clips, authored via the Blender MCP socket). `Player.js` follows the same preload-with-procedural-fallback pattern, plus an `AnimationMixer` that crossfades Idle↔Run from movement state (`_setMoving`) and scales run `timeScale` by `speed / RUN_CLIP_SPEED` to prevent foot-slide (the mixer is ticked in `update()` on every path, including combat/gathering early-returns — movement itself lives in `_updateMovement()`). Skinned-mesh gotchas encoded there: (1) `addOutline`'s scale trick doesn't follow bone deformation — the outline is a second `SkinnedMesh` bound to the same skeleton with a vertex-shader normal-offset patch; (2) outline/ghost must be **children of the skinned mesh**, not siblings — a sibling's different matrix chain yields FP depth deltas that break `GreaterDepth`; (3) a single full-body `GreaterDepth` ghost self-occludes (head reads as "wall" over torso), so the ghost uses x-ray ordering instead: opaque pass, `renderOrder` world(0) → ghost(1) → outline+body(2), which depth-tests the ghost against world geometry only — nothing player-owned may write depth before the ghost (an outline at the usual −1 leaves a faint permanent ghost tint on stacked shells like hair-over-skull).

### Save system

`SaveSystem.js` serializes all game state to a JSON blob downloaded as a file. Each system implements `serialize()` / `load()` (or `deserialize()`). When adding a new system that needs persistence:

1. Add it to `SaveSystem.systems` destructure in both `_buildSaveData()` and `apply()`
2. Call `system.serialize()` in the save data object
3. Call `system.load(data.key)` in `apply()`
4. If the system applies bonuses to other systems on load (e.g., augmentations), implement an `applyBonuses(statsSystem)` method called explicitly during `apply()` rather than relying on the `onPurchase` callback (which isn't set yet at load time)

**Cloud autosave (optional server):** `CloudSaveSystem` (`js/systems/CloudSaveSystem.js`, wired in `main.js`) uploads the full save blob to `player_save_snapshots` every 60s (skipping timestamp-only changes), flushes a `sendBeacon` on tab-hide/`pagehide`, and restores the latest snapshot on boot via `applySessionData()` (shared with the LOAD button in `saveButtons.js`). After a restore, `OfflineSystem.rewindTo(snapshot.timestamp)` re-runs offline gains against the restored state. All paths are silent no-ops while the server is down. The **CLOUD HUD button toggles autosave off** (`localStorage.pp_cloud_saves_enabled`) — pause it before loading god-mode test sessions or they overwrite the real cloud save. Gotchas: `SyncClient.baseUrl` follows `location.hostname` so LAN/phone sessions hit the same server; the beacon posts `text/plain` (a beacon can't run the CORS preflight `application/json` would need cross-port) and the server parses the body as JSON regardless; the repository keeps only the newest 20 snapshots per player.

### HUD / panels

`HUD.js` manages all panels. Adding a new panel requires:

1. Panel HTML in `index.html` (`<div id="my-panel" class="panel-overlay" hidden>`)
2. `_refreshMyPanel()` method in `HUD.js`
3. A case in `_refreshPanel(panelId)`
4. Add panel ID to the `MENU_PANEL_IDS` array in `js/menuController.js` (so opening it closes others) AND `_closeCommandPanels()` in `HUD.js`
5. For a menu-bar tab: add `<button class="menu-tab" data-tab="my-panel">` inside `#menu-tabbar` in `index.html`
6. For a HUD button: add to `_wirePanelToggles()` or a dedicated `_wireMyButton()` method, called from the constructor
7. (optional) To gate the tab behind progression, add an entry to `TAB_UNLOCKS` in `js/ui/HUD.js` — hidden tabs reveal with a "console online" toast when their condition first turns true. Conditions must be monotonic and derive from state that already persists in saves (nothing extra is serialized).

Steps 1, 4, and 5 are enforced by `tests/ui/panelWiring.test.js` — run `npm test` after wiring; a failure names the missing list. Panels that deliberately live in only one of `MENU_PANEL_IDS` / `_closeCommandPanels` are listed in exception sets inside that test.

### Item icon art

Material/consumable icons are hand-painted PNGs served from `Assets/Inventory/icons/` (128px, ~15KB each). The 1024px source art lives in `Assets/Inventory/` (~1MB each) and must **never** be referenced from UI code — the decoded-memory cost would sink mobile. `_makeIcon(key)` in `js/ui/HUD.js` renders the image (over the material's `INV_ICONS` signature color/border) when `key` is in `ICON_IMG_KEYS`, else falls back to the colored 2-letter-label style, so items without art degrade gracefully.

To add art for an item: drop the 1024px PNG (transparent background, named `<itemKey>.png`) in `Assets/Inventory/`, regenerate the 128px icon (PowerShell `System.Drawing` resize into `icons/`), and add the key to `ICON_IMG_KEYS`. **Gotcha:** never assign `icon.style.cssText = '...'` to a `_makeIcon` result — it wipes the inline background-image/border styles; set individual properties instead.

### IIC framework systems (Optimization Console)

The OPT tab houses three subsystems instantiated in `main.js` and passed to `HUD` as a single `optimization` bag (`{ mathematician, timeWarp, modifiers }`):

- **Mathematician** — paid time-limited window that reveals gains-per-PP across upgrades. `analyze({ stats, ascension, techTree })` returns sorted ROI rows.
- **Modifiers** — opt-in trade-off toggles (max 2 active). Each modifier mutates `pp.setModifier()` and a `statsAccum` bag (`gatherMult`, `energyCostMult`, `damageMult`, `droneMult`). All four are now honored: `gatherMult`/`energyCostMult` are read inline in `main.js` (gather-duration sites + the `_energyCost()` helper); `damageMult`/`droneMult` are pushed into `CombatSystem.damageMult` / `DroneSystem.efficiencyMult` via `modifiers.onChange` in `main.js`.
- **TimeWarp** — Quantum Crystals premium currency. Awarded on every 5th achievement, on ascension, and on >4hr offline returns. Spent on instant PP grants + temporary rate boosts.

All three serialize/deserialize via `SaveSystem` (version 4+).

### Idle progression systems (v8+)

Four NGU-inspired systems instantiated in `main.js` and passed to `HUD` as a single `progression` bag (`{ bosses, expedition, challenges, implant }`). All serialize via `SaveSystem` (version 8+).

- **BossSystem** — each combat zone hosts a unique boss (spawn entries flagged `boss: true` in `Environment.getEnemySpawns()`). Defeat grants a permanent bonus (PP rate / cap / damage) and "clearance" — an alternate unlock path for the next zone's portal. Defeated bosses never respawn: `entityManager.spawnFilter` (set in `main.js`) drops them, and `EntityManager` excludes `boss: true` spawns from the timed respawn pool.
- **ExpeditionSystem** (EXPED tab, "Field Ops") — the **Simulation Ladder**: infinite idle auto-combat. Deterministic: kills/sec = playerDPS / `enemyHP(t)` with `enemyHP = 30×1.18^t`, `threat = 10×1.15^t`, `ppPerKill = 6×1.14^t`; stalled if survivability < threat×5. Bands of 10 tiers reuse the creature roster with rank prefixes (Juvenile→Primeval). Every 10th tier is a Sector Warden gated by **Override Keys** minted deterministically from *field* kills of that band's creature family (5 kills = 1 key; wired at the combat-end wrap in `main.js`). Warden attempts spend keys and resolve instantly + transparently (must burn 8× tier HP within a 60 s window AND pass the survival gate); failed pushes salvage partial **Archive Fragments** (death-as-harvest — fragments bank in `archiveShards` with no sink until the Recompile system lands). Cleared bands become farm sectors the player can aim the ladder at. Offline at 50% via `OfflineSystem`. Legacy 7-tier saves migrate by enemy-HP equivalence in `deserialize()` (save v11).
- **AscensionSystem = the Recompile rebirth + Archive Data** (Ascension Terminal in the Spaceship → `ascension-panel`, rendered by `_refreshAscension()` on a 1 s live tick). Recompiling resets the RUN layer only — PP pool, base cap→150, ladder position/wardens/keys (`expedition.recompileReset()`) — and pays **Archive Data**: `⌊peakTier/5 × (1+wardensThisRun) × momentum⌋` + watermark bonus (+2 per first-ever tier past `bestTierEver`, paid once) + the ladder's banked fragments (swept in). **Momentum** is 1.0 until the knee (2 h ONLINE this run OR a warden beaten this run), then jumps ×1.5 and grows +0.5/hr to a ×4 cap — `ascension.update(delta)` accrues `runSeconds` in the game loop; offline time never counts. Archive shop levels persist forever: PP +0.25×/lvl (old AP cost curve), Combat/Harvest/Drone ×1.15/lvl, Offline Buffer +12 h/lvl (read by `OfflineSystem.calculate()` through the return context). Legacy AP saves convert 1 AP → 3 Archive, shop levels carry 1:1 (save v12). **Wiring gotcha:** `ascension.expedition = expedition` must be set in main.js — the ladder IS the run layer; without it the NUMBER reads 0 forever.
- **ChapterSystem — the spine** (`js/systems/ChapterSystem.js`, save v13): one number is the player's level, computed as the contiguous crossed prefix of an interleaved rung ladder — odd rungs 1–11 are the six beat-once story bosses, even rungs 2–10 are Sim Wardens W10–W50, every rung past S6 is another warden (infinite). Warden rungs read the lifetime tier watermark `max(ascension.bestTierEver, expedition.peakTier)`. `level = max(current, highestEver)` — `highestEver` serializes and is monotonic; **pre-v13 saves seed it from `prestigeCount`** (1→CH.1, 2→CH.2, 3→CH.4) so no tab ever re-locks (`deserialize(null)` handles it — SaveSystem calls it unconditionally). `TAB_UNLOCKS` keys off `h.prog.chapters.level`; **zone portals no longer check held PP** — the gate is `ppRequired === 0 || step-unlock || boss clearance` at all four sites (main.js ×3, zoneManager.js). `chapterSystem.expedition/.ascension` and `hud.prog.chapters` must be wired in main.js. Chapter headline + next objective render in the FIELD OPS panel and DATA tab.
- **ChallengeSystem** (TRIALS tab) — constrained runs for permanent multipliers. Event hooks (`recordStatUpgrade`, `recordOffload`, `recordEnemyDefeated`, `recordSteps`, `recordMaterialCount`, `recordExpeditionKills`, `tick`) are wired at the existing wrap points in `main.js`.
- **NeuralImplantSystem** (IMPLANT tab) — idle stat training: siphons 25% of PP income from the pool into a target stat, auto-levels when banked XP covers `upgradeCost()`. Trains offline at 50% (time-based, no pool drain).
- **TrainingAreaSystem** — the Spaceship holodeck training chamber: the player loads a *program* at the console outside (`training-panel`, a standalone station panel), then walks into the chamber circle; while inside, the HUD swaps to a fullscreen sim-feed overlay (`#training-overlay`: looping video from `Assets/Video/training_<programId>.mp4` or `training.mp4`, else an animated holo placeholder — see `Assets/Video/README.txt`) showing elapsed stint time + stat gains; walking out ends it. Banked stat XP auto-levels (NeuralImplant convention). Advanced programs train two stats at 2× while *de-leveling* a third (real NGU-style cost, floored at Lv 1). Rate scales with the tripartite power leg (`getPowerBonus` callback — "power" = PP sink effectiveness). Program upgrades consume material recipes (gathered mats early, crafted intermediates later) via the console panel. Trains offline at 50% when the player logs out inside the chamber (`activeId` serialized). Chamber+console register via `env._addTrainingChamber(x, z, r)` in the Spaceship zone builder; program defs/recipes live in the system file.

**Permanent-multiplier convention**: bonuses that multiply PP rate or damage are recomputed *every frame* in the game loop (`ppSystem.globalMultiplier = ascension × challenges × factory ring`; `combatSystem.permDamageMult = bosses × challenges × ascension combat`; `expedition.damageMult = combat.damageMult × permDamageMult`; `droneSystem.efficiencyMult = modifiers × ascension drone`; ascension's gather multiplier composes inline at the two gather-duration sites) — no stale wiring after save load. Cap-side bonuses use named `pp.setCapMultiplier()` keys and are re-applied in `SaveSystem.apply()` via each system's `applyBonuses()`.

### Enemy archetypes & combat mechanics

`ARCHETYPE_CONFIG` in `js/entities/Enemy.js` defines 5 regular creature archetypes (`serpendrill`, `reptlar`, `dunkraza`, `hardlizzy`, `cavecrab`) + 6 zone bosses — every one is GLB-modelled (see `_bossModelPaths`; all six bosses share `Pirate_Lizard.glb`, the creatures use one GLB each). The pre-`0.x` procedural "box-robot" archetypes (rusher/swinger/burst/etc.) were removed; `serpendrill` is the fallback default in `Enemy` and `EntityManager`. Optional per-archetype mechanic fields, all honored by `CombatSystem`: `statusEffect`, `armor` (flat player-damage reduction), `dodgeChance`, `fpDrainOnHit`, `regenOnAttack`, `rageRamp` (enemy damage compounds per attack), `burstCount`, `speed`, and for bosses `phase2: { at, damageMult, intervalMult, dodge, regen }` (triggers once below `at` fraction of max HP). Drop tables live in `CombatSystem.DROP_TABLES` — a test asserts every entry is a known inventory material. **Model-swap timing gotcha:** enemies built during zone init before their GLB finishes parsing fall back to the procedural body and are not rebuilt when the model arrives (the documented no-pop-in pattern), so a fresh page load can show procedural enemies in the *starting* zone until the next zone entry.

### Data Core (PP growth visualization)

DATA tab. `HUD` samples effective PP/s every 2s into a 10-minute ring buffer (`_ppSamples`) and draws a canvas sparkline (`_drawPPGraph()`), plus session PP / avg / peak / trophy stats. Session tracking (`_sessionPP`) predates it and also feeds the top-bar `▲` ticker.

### Key files by concern

| Concern | File |
|---|---|
| Game constants | `js/config.js` |
| All systems bootstrap + game loop | `js/main.js` |
| Zone generation, collision, portals | `js/scene/Environment.js` |
| Mine cave layout (25×25 tile map + active map) | `js/scene/zones/Mine/layout.js` (re-exported by `js/scene/MineLayout.js`) |
| Mine seeded generation (anchors + cave fill) | `js/scene/zones/Mine/generator.js`, `js/scene/zones/Mine/anchors.js` |
| Mine delve lifecycle (re-roll seed, mined cells) | `js/systems/MineDelveSystem.js` + gating in `js/zoneManager.js` |
| Per-zone sky/fog/light presets | `ZONE_AMBIENCE` in `js/scene/SceneManager.js` |
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
| Enemy archetypes + boss configs (5 creatures + 6 bosses) | `ARCHETYPE_CONFIG` in `js/entities/Enemy.js` |
| Zone bosses, trophies, portal clearance | `js/systems/BossSystem.js` |
| Simulation Ladder — infinite idle combat, wardens, Override Keys (EXPED tab) | `js/systems/ExpeditionSystem.js` |
| Recompile rebirth + Archive shop (Spaceship terminal) | `js/systems/AscensionSystem.js` |
| Chapter Chain — the player's level, gates tabs/zones | `js/systems/ChapterSystem.js` |
| Challenge runs → permanent multipliers (TRIALS tab) | `js/systems/ChallengeSystem.js` |
| Idle stat training (IMPLANT tab) | `js/systems/NeuralImplantSystem.js` |
| Training chamber (Spaceship holodeck) | `js/systems/TrainingAreaSystem.js` |
| PP growth graph + session stats (DATA tab) | `_refreshDataCore()` in `js/ui/HUD.js` |
| All DB read/write methods | `server/repositories/progressionRepository.js` |
| Transaction validation + application | `server/services/transactionService.js` |
| Schema migrations (run in order) | `server/db/migrations/` |
| Client → server sync queue | `js/sync/SyncClient.js` |
| Wiring-checklist enforcement (zones, panels) | `tests/systems/zoneWiring.test.js`, `tests/ui/panelWiring.test.js` |

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
