# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Session start: read `STATUS.md` (repo root) before exploring.** It is the project map — an annotated folder map, a doc index (live vs historical), and a short "where the work stands" — so a session orients in one read instead of re-deriving the project from scratch. Git, not STATUS.md, is the authority on branch state; if the map contradicts the folder, fixing it is the session's first task.

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

`STATUS.md` is the project map; it is only useful if it never rots. Before finishing any session that changed the project (code, assets, design docs, or a decision):

1. Refresh **Where the work stands** (shipped / next) if it moved
2. Update the **folder map** and **doc index** when files, directories, or docs are added, retired, or go stale
3. Bump **Last updated**; keep the whole file about one screen

Keep it a *map*: no branch bookkeeping beyond a one-line pointer (git owns that), no session logs (git history owns that), and no owner-preference notes (those live in Claude's private memory — this repo is public).

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

**Door zones** (spaceship hatch, cave mouths, home interiors) skip `ENV_UNLOCK` — they go in the `NO_PP_GATE` exception set in `zoneWiring.test.js`. Helpers and gotchas are in the door-zone paragraph below, after the Mine section.

**The Labyrinth is cell-map-driven but STATIC** (contrast the Mine): `js/scene/zones/Labyrinth/layout.js` holds one 19×19 ASCII map (5-unit cells, letters mark courts, all floor; grow the grid only symmetrically — `CENTER` derives from `SIZE`, which keeps every old cell's world position) from which everything generates — reveal-shaded wall SLABS run along wall-cell centerlines (an x-run and/or z-run per cell; cross cells get both slabs, isolated cells a column; Lab_WallStraight is 4.52 long so ×1.13 closes the joins), collision is small-circle chains along those same slab lines (players are held at the carved face, not a cell boundary), and the generated rows spread into `ZONE_ASSETS.labyrinth`. `tests/systems/labyrinthLayout.test.js` flood-fills connectivity, pins the shrine trek length, and asserts slab/collision coverage per exposed wall cell — edit the map freely, the test names any cell that breaks.

**Zone-switch warm-up (perf architecture, 2026-07-29):** THREE bakes the scene's point-light COUNT into every shader program, so each distinct count used to compile a whole program set on first sight (~2–3 s frozen). Three cooperating pieces keep switches fast — `SceneManager.padZonePointLights` pads every zone to a light bucket (6/12/24; called in `zoneManager.switchZone` after spawns) so zones share program sets; `js/scene/shaderWarm.js` pre-compiles the common material×bucket matrix at boot (compileAsync — parallel driver threads) and pre-uploads all GLB buffers+textures in one hidden render behind the boot overlay; the switch itself sync-renders only the ARRIVAL view on the covered frame, then fires `compileAsync` for the rest. Gotchas: adding a NEW material family (custom ShaderMaterial, new define combo) means first-sight compile on zone entry — add a sampler to shaderWarm.js if it's widely used; a warm texture must match the real one's `colorSpace` or it pre-compiles nothing; and don't add point lights to a zone mid-play — the count change recompiles everything (build-time lights only).

**The Mine is tile-map-driven, re-rolls per delve, and is dig-anywhere**: `js/scene/zones/Mine/layout.js` holds the baseline 25×25 ASCII map (`.` floor, `0` plain diggable rock, `1`-`5` ore tiers, space = immortal rock — generated maps keep space only on the outer shell) plus a mutable *active map* all getters read (`setActiveMineMap`/`getActiveMineMap`/`setMineMapCell`). Only *exposed* mineable cells (8-neighbor open floor) are instantiated; depleting one opens its cell and `env._mineDig.onDepleted` (called from `Environment.drillRock`, guarded on `rock.cellC`) spawns the newly exposed layer behind it. Plain rock is one-hit, stone-only loot (`PLAIN_ROCK_PROPS`), renders as region wall pieces; floor is pre-built under every mineable cell so no patching on dig. **The kit path is chunk-windowed (Phase 3)**: the grid partitions into 8×8-cell chunks; rock/wall/dressing *visuals* materialize within `CHUNK_ACTIVATE_R` of the player and tear down beyond `CHUNK_DEACTIVATE_R` (`env._mineChunks.update(playerPos)` from the game loop), while all gameplay state (map cells, `env._rocks` logic objects, collision boxes) stays global — `rock.mesh` is null while far away, and per-cell visuals derive from `cellRng(seed,c,r)` so variants survive round trips (as does partial drill damage, re-derived from `richness`). Growing the map is now a data change (grid size + anchor layout), not a perf risk. The reveal cut is occlusion-aware (`_addRevealDiscard` in `ToonMaterials.js`): fragments discard only when inside the player's view-space circle AND closer to the camera — rock beside the player stays solid; outline shells use `createRevealOutlineMaterial` so the hole never exposes black shell interiors. At build time `Mine/index.js` swaps in `generateMineMap(seed)` from `Mine/generator.js`: fixed anchor rooms + guaranteed corridors (`Mine/anchors.js` — entrance, drill, Depths shaft, Breach; portals never move) filled with a seeded cave carve and depth-banded ore, flood-fill-validated so every gate stays reachable (`tests/systems/mineGenerator.test.js` sweeps 100 seeds). `MineDelveSystem` (save v9) owns the delve lifecycle: descending from Landing Site re-rolls the seed and clears mined cells; Mine↔Depths keeps the same cave; blocks mined out stay depleted within a delve (`env.onRockDepleted` → `recordMined`, re-roll/arm gating lives in `zoneManager.js`). Non-mineable cave walls are auto-generated around carved cells and merged into per-row runs; `tests/mineLayout.test.js` flood-fills the baseline map. Narrative flow: entrance adit → main shaft → working cavern (drill rig + Depths shaft) → winding passage → the Breach (ancient portal chamber holding the world gates). Because the cave re-rolls per delve, mine enemy spawn coordinates in `getEnemySpawns()` are approximate: `_snapToMineFloor` (Environment.js) relocates each to the nearest carved floor cell at spawn time — an authored point inside rock is fine. Bosses don't patrol (they guard their spawn post with a visible red aggro-ring telegraph at their 1.6-unit engage radius); regular enemies patrol as before.

The Mine renders from a modular GLB kit (`models/MineKit.glb`, source `Assets/3D/MineKit/MineKit.blend` with embedded export/bake/regen scripts): `Mine/kit.js` preloads it and maps GLB materials → game shaders (`materialKindFor` in `kitRules.js`: names matching /vein|rune|crystal|glow/ become `MeshBasicMaterial` glow, everything else becomes `createRevealToonMaterial` from the GLB color — palette tuning happens in Blender, not JS). Kit meshes carry a baked `COLOR_0` layer (Cycles AO + painterly mottle); `kit.js` enables `vertexColors` on any replacement material whose geometry has it (glow materials skip it). Mine floors are **one merged vertex-colored mesh** sampling the pure `floorColorAt(x,z)` field in `Mine/floorColor.js` (tested in Node) — never per-cell flat tiles, which read as a grid. Walls place per cell (`getMineWallCells`) with seeded variant/quarter-rotation picks; collision still uses the merged runs. Every kit path falls back to the pre-kit primitives while the GLB loads. **Blender color gotcha:** node color inputs (`default_value`) are linear — convert sRGB palette hexes with the sRGB EOTF before assigning or every exported material reads ~1.5 stops too bright in-engine. **Vertex-color export gotchas:** a Base Color input left *linked* (e.g. to a vertex-color mix node) exports `baseColorFactor` as white — unlink during export and restore after (the blend's `export_glb.py` does this); pass `export_vertex_color='ACTIVE'`, and Cycles vertex-color bakes require the mesh to have a UV layer even though it's unused.

Environment also supports:
- `env._spinners` — `{ mesh, axis, speed }` entries rotated each frame by `env.update()`, cleared on zone switch (Breach ring, floating shard).
- `env._revealMaterials` — materials from `createRevealToonMaterial(color, { revealR })`; `main.js` feeds them the player position each frame so tall cave walls open up around the player.
- `env._npcs` — **ambient rigged NPCs** via `env._addNpc(glbKey, x, z, { scale, rotY, r })` in a zone builder (first use: the Verdant Maw's Maw-tender hamlet). Clones the preloaded GLB (`cloneSkinned`, imported from Enemy.js), re-shades to toon, plays the clip matching `/idle/i` on an `AnimationMixer` ticked in `env.update(delta)`, registers a collision circle, and late-attaches through `_modelsReady` exactly like portals/stations. `loadModel()` stashes `gltf.animations` on `scene.userData._clips` so rigged props keep their clips (plain `gltf.scene` resolution would drop them). NPC *homes* are ordinary ZoneAssets prop entries. Pipeline scripts (breathing-spine rig, hull+export) live in `Assets/3D/VerdantMaw/`.

**Door zones (no Ancient World Gate):** two helpers push the same portal record as `_addPortal` (so main.js's proximity prompt, `getPortals()` and `switchZone` all work unchanged) but set `noGate: true` + `hasModel: true`, so `_attachPortalModel` skips them — no gate GLB, fallback ring or energy material. `_addCaveEntrance(x, z, targetZone, label, opts)` has no visual and pushes **no collision circle** — the mouth GLB placed from `ZONE_ASSETS` supplies that (the Glacial Hollow off the Frozen Tundra is the reference). `opts: { walkIn: true, triggerR }` makes the door **walk-activated**: entering `triggerR` of the door point fires the switch itself, no [E] — main.js arms the crossing only after the player has been seen outside the radius, so spawning near the door can't loop (the Starwing's bay is the reference; its `triggerR` 4.0 is tuned to where the hull half-covers the player at the fixed camera). `_addDoorway(x, z, targetZone, label, spawnOverride)` adds a glowing door mat; `spawnOverride` is an optional `[x, z]` that `switchZone(zone, spawn)` uses instead of `ZONE_SPAWN_POS`, so leaving a home interior lands back on its own doorstep. **Interact-radius gotcha:** collision holds the player at `r + PLAYER_R` from a prop's centre, so a mouth prop with `r: 2.2` parks the player 2.55 units out — outside the portal's 2.5-unit interact radius, and the prompt never fires. Put the trigger 1.5–2 units *in front* of the prop rather than at its centre (and keep the prop's `r` under ~2). The NPC home interiors (`js/scene/zones/HomeInteriors/index.js`, zones `homeSylva`/`homeBram`/`homeSprig`) are the template for walk-in rooms: shared shell builder, tall far-wall arc + low camera-side rim (the fixed camera looks from +z), furniture as ZoneAssets entries, point light at mine-lantern scale (`intensity ~4.5, decay 1` — this three build uses physical light units, so intensity ~1 is a candle).

**The Generation Engine (player-built computer, save v15):** the computer's building is a **player-authored chunk plan** — 6×6-unit chunks (3×3 track cells; centers at world coords ≡ 0 mod 6) placed at the Landing Site through the CORE panel's build modes, stored as a `Set` of `'cx,cz'` keys in `js/systems/ComputerSystem.js` (pending-chunk pool, door edge record `{cx,cz,side}`, schematic delivery, evolve; pacing/interiors data table in `js/systems/computerGenerations.js` — single source of truth). `js/scene/zones/ComputerBuilding/shell.js` derives exterior edges → merged wall runs → collision chains from the plan (pure, Node-tested by a 0.15-stride walk-probe); **the collision door-cut is deliberately wider than the visual door gap** (end circles' r+PLAYER_R would seal the doorway otherwise). `Environment.buildComputerShell` renders it (rebuilt per plan edit + zone entry via `onAfterSwitch`, never per frame; shell collision circles carry `computer: true`, which the validity mask `siteMask.js` flag-skips so the building's own walls can't veto adjacent growth — and `_collisionCacheStatic` must be invalidated on rebuild, the splice-then-push length trap). Placement validity = exported `LANDING_KEEPOUT`/`LANDING_KEEPOUT_SEGS` + an `EXTRA` list that **mirrors `_addOuterWoods` keepClear** (sync comments in both files) + live collision circles. The interior is zone `computerCore` (walk-in from gen 1, same world coordinates as the plan so the door lines up without mapping; machine props fill `fillFraction` of floor area per generation). The door, nav chip 'Computer', and pad→door path ribbon all re-derive from the door record in `refreshComputerDoor` (main.js); dynamic re-registration uses `env.removePortalsTo`/`removeNavLandmark`. Adding a generation = a data-table row + (if a new era) kit/interior-set entries — no coordinates elsewhere.

**Portals** are the `models/Portal.glb` "Ancient World Gate" (built in Blender, sits on the ground at `y=0`, no procedural ring/torus). `_addPortal(x, z, targetZone, ppRequired, label, scale, spawnOverride)` — the optional trailing `spawnOverride` ([x, z]) lands the traveller at a specific point in the TARGET zone instead of its `ZONE_SPAWN_POS` default, for gate pairs that are one doorway (Labyrinth ↔ Atlantis' end chamber). `_addPortal()` registers the portal then calls `_attachPortalModel()`, which clones the GLB and grabs the mesh whose material name matches `/PortalEnergy/i` as the per-portal dynamic-state material. `refreshPortalAccess()` tints that material's `color`+`emissive` teal (reachable) / orange (locked). **Gotcha:** on the first zone the GLB is still loading when `_addPortal` runs, so `_attachPortalModel` is called again for every existing portal inside the `_modelsReady.then()` in the constructor — keep it idempotent (guarded by `portal.hasModel`). While `hasModel` is false a glowing teal fallback ring marks the gate (removed on attach), so a portal is never invisible even if the GLB download fails. `loadModel()` caches failures only for the page's lifetime — never persist load failures across reloads (a sessionStorage failure cache once made portals invisible forever in a tab after one transient hiccup).

**Decorative GLB props** (trees, rocks, boulders, etc.) go through `Environment.js`'s `loadModel()`/`_glb` cache and `ZoneAssets.js` (see file header there for the full add-a-prop steps and radii). `cloneModel()` re-shades any texture-mapped material to `MeshToonMaterial` (kills PBR specular so Rodin exports read flat; emissive-baked and plain-colour materials pass through untouched), and `_placeGLBProps` adds an inverted-hull outline to every prop whose GLB doesn't already carry a baked BackSide hull (the hand-built trees do). Boot never shows fallbacks: `#boot-overlay` in index.html covers first paint until the boot gate at the bottom of `main.js` (player rig + `env._modelsReady`, 6 s hard cap) fades it out. **Spaceship station bodies** (fabricator, offload, charging, drone monitor, ascension, mastery, combat rig, training console, holodeck pylons) GLB-swap via `_registerStationModel(group, glbKey)` inside each `_add*` station builder in `Environment.js`: the procedural body stays as the pre-load fallback, the swap runs immediately when the GLB is already loaded or via the portal-style late attach in `_modelsReady.then()` (entries cleared on zone switch); children flagged `userData.isIndicator` (the floating color-coded interaction gems) survive the swap and re-float just above the model's bounding box. The hull architecture itself is one `SpaceshipShell.glb` placed through ZoneAssets at origin (source `Assets/3D/SpaceshipInterior/SpaceshipInterior.blend`, regenerated by `build_shell.py` in that folder) carrying a baked `Shell_OutlineHull` so the runtime auto-hull skips it. Station GLBs are exported pre-normalized to true world scale (grounded, centered, front toward +game-z), so attach scale is 1.0. **Rodin text-to-3D import orientation is a per-asset coin flip** — one batch imported lying (height along Y), the next upright; never batch-apply a rotation rule, verify each with two renders (and remember ortho verification renders see the whole grid row behind the subject — keep unique rows/columns per shot or you'll chase phantom geometry). Two traps that cost an hour on the Glacial Hollow batch: (1) **pin your verification camera's up-vector to +Z**. `to_track_quat('-Z', 'Y')` aims the camera with world **+Y** up, so a Z-up asset renders tipped and a Y-up one renders upright — combine that with the dims heuristic (which lies, as above) and both errors cancel into a confident wrong answer. (2) The reliable test is numeric and per-asset: for each of the six axis directions, take the vertices in the outer 10% slab and measure their cross-section area in the other two axes; the **flat base scores highest**, so up = the opposite direction (`Assets/3D/GlacialHollow` history has the script). It is decisive for anything with a footprint, but **not** for radiating shapes like a crystal spray, where both ends are narrow — fall back to a render there.

**Gameplay-entity GLB swaps** (a resource node, enemy, or boss rendered from a model instead of primitives) follow a different, per-file pattern: a module-level `GLTFLoader` kicks off the load immediately when the module is imported, resolves into a plain `{ key: THREE.Group }` cache object, and the entity's mesh-building code clones from that cache if present, else falls back to the original procedural geometry (no `await`, no pop-in handling — see `ResourceNode.js` (`_nodeModels`, keyed by material type) and `Enemy.js` (`_bossModels`, keyed by archetype) for the two existing examples). GLB assets are frequently exported at wildly different native scales from each other — always check the actual bounding box (`new THREE.Box3().setFromObject(...)`) before picking a `scale` value instead of guessing; a naive scale tuned for one model can be 3-5x wrong for another. **Boss GLBs specifically should be authored at ~0.8 units native height** (the Scorpion convention): `_buildBossModelMesh` applies a shared ×1.4 model scale and places the threat indicator at group-local y=2.2, both tuned for that size — a 1.8-tall export comes out 2.7× the player and buries the indicator inside the model's head.

**Rigged creature GLBs** (tundra pack: `Frostfang/Glacierback/Blubberfin.glb`): `Enemy.js` already plays any clips named `/idle/i` and `/walk/i` on a spawned model — `_buildBossModelMesh` builds an `AnimationMixer` and `update()` crossfades Idle↔Walk from patrol state, using `cloneSkinned` (SkeletonUtils-style rebind) when the GLB is skinned. So "rigged creature" = export armature+mesh with two NLA tracks named exactly `Idle`/`Walk` (glTF `NLA_TRACKS` mode names animations after tracks; action datablock names may collide globally — 'Idle.001' still matches the regex, but name tracks canonically anyway). Authoring recipe (proven in `Assets/3D/FrozenTundra/rig_creatures.py`): normalize the mesh FIRST (grounded, centered, facing −y, final native scale ~0.5–0.7 tall — creatures get ×1.4 in-game at cfg.scale 1.0), build the armature procedurally (feet from ground-contact vertex clusters — never bbox fractions, a sideways tail fools them; expect to hand-place a leg when a creature's rear hooves merge into one blob), skin with nearest-bone-segment weights (K=2, inverse-distance⁴ — deterministic where bone-heat fails on Rodin soup), author Idle (48f) + Walk (24f) parametrically with keyframes every 2 frames, first/last frame identical for clean loops. Blender 5.x slotted actions: after `adt.action = act`, create+assign `act.slots.new(id_type='OBJECT', ...)` before keyframing. **Never bulk-delete "debris" components from a Rodin creature by bbox tests** — fur/ruff/face shells are separate components and get shredded (a fox lost its head that way; `.blend1` saved the day). Enemies freeze mid-pose during combat by design (`update()` early-returns on aggro). **Rigged-GLB export rule:** the armature binding (what becomes the glTF inverse-bind data) is captured at `parent_set` time — export the pair in exactly that relative state. When centering/grounding for export, move ONLY the rig object (the parented mesh follows — the creature exports do this), or clear-parent + re-bind at the origin and export there (`Assets/3D/VerdantMaw/npc_export3.py`). Never set the child mesh's `location` — it is parent-space against a stale `parent_inverse`, and zeroing it renders the skinned mesh at minus-slot world coordinates (symptom: accessor bounds look perfect, standalone GLB node transforms are all zero, but the drawn body sits hundreds of units away — diagnose with a `Box3.setFromObject` after a real render). **Texture pass before export** (Mine pack, `Assets/3D/MineCreatures/`): a Rodin creature arrives as dozens of part-objects sharing one diffuse/normal/metallic trio — join to one mesh, collapse every part-material into a single diffuse-only material, and drop the diffuse to 512px; that alone takes a 14 MB source to a ~1 MB GLB (the tundra/Maw packs kept all three maps and ship at 2.1–2.5 MB). Check the source diffuse's **mean brightness** while you're there: Rodin returns genuinely near-black bodies (Bramblemaw's mean linear was 0.107), and one of those reads as an unlit blob in a dark zone like the Mine — gamma-lift the packed image (`c ** 0.54` put it at ~0.28, matching its packmates) before shipping rather than discovering it in-game.

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
- **ExpeditionSystem** (EXPED tab, "Field Ops") — the **Simulation Ladder**: infinite idle auto-combat. Deterministic: kills/sec = playerDPS / `enemyHP(t)` with `enemyHP = 30×1.18^t`, `threat = 10×1.15^t`, `ppPerKill = 6×1.14^t`; stalled if survivability < threat×5. Bands of 10 tiers reuse the creature roster with rank prefixes (Juvenile→Primeval). Every 10th tier is a Sector Warden gated by **Override Keys** minted deterministically from *field* kills of that band's creature family (5 kills = 1 key; wired at the combat-end wrap in `main.js`). Warden attempts spend keys and resolve instantly + transparently (must burn 8× tier HP within a 60 s window AND pass the survival gate); failed pushes salvage partial **Archive Fragments** (death-as-harvest — fragments bank in `archiveShards` with no sink until the Recompile system lands). Cleared bands become farm sectors the player can aim the ladder at. Offline at full rate × compute gate when stocked, dormant otherwise (v14 — see ComputeSystem). Legacy 7-tier saves migrate by enemy-HP equivalence in `deserialize()` (save v11).
- **AscensionSystem = the Recompile rebirth + Archive Data** (Ascension Terminal in the Spaceship → `ascension-panel`, rendered by `_refreshAscension()` on a 1 s live tick). Recompiling resets the RUN layer only — PP pool, base cap→150, ladder position/wardens/keys (`expedition.recompileReset()`) — and pays **Archive Data**: `⌊peakTier/5 × (1+wardensThisRun) × momentum⌋` + watermark bonus (+2 per first-ever tier past `bestTierEver`, paid once) + the ladder's banked fragments (swept in). **Momentum** is 1.0 until the knee (2 h ONLINE this run OR a warden beaten this run), then jumps ×1.5 and grows +0.5/hr to a ×4 cap — `ascension.update(delta)` accrues `runSeconds` in the game loop; offline time never counts. Archive shop levels persist forever: PP +0.25×/lvl (old AP cost curve), Combat/Harvest/Drone ×1.15/lvl, Offline Buffer +12 h/lvl (read by `OfflineSystem.calculate()` through the return context). Legacy AP saves convert 1 AP → 3 Archive, shop levels carry 1:1 (save v12). **Wiring gotcha:** `ascension.expedition = expedition` must be set in main.js — the ladder IS the run layer; without it the NUMBER reads 0 forever.
- **ChapterSystem — the spine** (`js/systems/ChapterSystem.js`, save v13): one number is the player's level, computed as the contiguous crossed prefix of an interleaved rung ladder — odd rungs 1–13 are the seven beat-once story bosses, even rungs 2–12 are Sim Wardens W10–W60, every rung past S7 is another warden (infinite). **Adding a story boss shifts every rung above it** (the Rimefather went in at 11 and pushed The Unmaker 11→13), so `_wardenIndexFor` must move with it — it is `rung <= 12 ? rung/2 : rung - 7`, where the `- 7` is the story-boss count and the `<= 12` is the last interleaved warden rung. No save can regress across such a shift because `highestEver` is monotonic and `level = max(current, highestEver)`; `tests/systems/chapterSystem.test.js` pins that migration case, plus a check that story rungs stay odd and gapless. Warden rungs read the lifetime tier watermark `max(ascension.bestTierEver, expedition.peakTier)`. `level = max(current, highestEver)` — `highestEver` serializes and is monotonic; **pre-v13 saves seed it from `prestigeCount`** (1→CH.1, 2→CH.2, 3→CH.4) so no tab ever re-locks (`deserialize(null)` handles it — SaveSystem calls it unconditionally). `TAB_UNLOCKS` keys off `h.prog.chapters.level`; **zone portals no longer check held PP** — the gate is `ppRequired === 0 || step-unlock || boss clearance` at all four sites (main.js ×3, zoneManager.js). `chapterSystem.expedition/.ascension` and `hud.prog.chapters` must be wired in main.js. Chapter headline + next objective render in the FIELD OPS panel and DATA tab.
- **ChallengeSystem** (TRIALS tab) — constrained runs for permanent multipliers. Event hooks (`recordStatUpgrade`, `recordOffload`, `recordEnemyDefeated`, `recordSteps`, `recordMaterialCount`, `recordExpeditionKills`, `tick`) are wired at the existing wrap points in `main.js`.
- **NeuralImplantSystem** (IMPLANT tab) — idle stat training: siphons 25% of PP income from the pool into a target stat, auto-levels when banked XP covers `upgradeCost()`. Trains offline at 50% (time-based, no pool drain).
- **TrainingAreaSystem** — the Spaceship holodeck training chamber: the player loads a *program* at the console outside (`training-panel`, a standalone station panel), then walks into the chamber circle; while inside, the HUD swaps to a fullscreen sim-feed overlay (`#training-overlay`: looping video from `Assets/Video/training_<programId>.mp4` or `training.mp4`, else an animated holo placeholder — see `Assets/Video/README.txt`) showing elapsed stint time + stat gains; walking out ends it. Banked stat XP auto-levels (NeuralImplant convention). Advanced programs train two stats at 2× while *de-leveling* a third (real NGU-style cost, floored at Lv 1). Rate scales with the tripartite power leg (`getPowerBonus` callback — "power" = PP sink effectiveness). Program upgrades consume material recipes (gathered mats early, crafted intermediates later) via the console panel. Offline (v14): the loaded program runs at full rate × the holodeck compute gate — chamber presence only matters pre-board (`activeId`/`selectedProgram` serialized); with ≥1 unit assigned, Al also runs the program unattended while online. Chamber+console register via `env._addTrainingChamber(x, z, r)` in the Spaceship zone builder; program defs/recipes live in the system file.

- **ComputeSystem — the allocation board** (`js/systems/ComputeSystem.js`, save v14): Al's attention pool, the session-scale juggling layer (tripartite stays the rebirth-scale investment layer). Pool = 4 units + 2/cap-upgrade (`500×2.5^n` PP); destinations: ladder, drones, extractors, holodeck, processing, `factory:<machineId>`, overflow (module-gated). **Gate semantics**: board locked (chapter level < 3) → `gateMult()` = 1 everywhere (v13 behavior); unlocked → 0 units = paused online AND offline, ≥1 unit = `(1 + 0.25×extras×(1 + 0.5×powerBonus)) × (1 + 0.10×computeAmp)`. Attended play is never gated (manual PROCESS, chamber training, gathering). Consumers read per-frame fields set in the main.js recompute block (`expedition.computeMult`, `extractorSystem.computeMult`, `processingNodes.computeMult`, `trainingAreas.computeMult`, drone gate folded into `efficiencyMult`, `factorySystem.computeGate` callback). **ComputeSystem itself reads live callbacks, not fed fields** (`getChapterLevel`/`getPowerBonus`/`getAmpLevel` → chapterSystem/tripartite/ascension) so boot- and cloud-restore-time offline resolution sees current values. `maybeSeed()` (called each frame) runs ONCE ever at first unlock/migration: 1 unit to each in-use system, ladder→drones→extractors→holodeck. **Al modules** (`AL_MODULES`): chapter gates the right to buy, PP+materials price it — Key Tracker (S1), Overflow Routing (S2), Farm Director (S3, 5s timer in main.js), Foreman (S4, hopper auto-restock); Triage ships with Phase G.
- **Stocked offline (v14)**: `OfflineSystem.applyAndSummarize()` resolves each destination at FULL rate × `gateMult` when stocked, `DORMANT` rows when not (the away banner's per-system report teaches the pre-logout puzzle); the flat 50% haircut is gone (implant/tripartite keep 0.5 — they're not destinations). Buffer = `(12 + 12×offlineBuffer lvl) h` — no 24 h flat cap. Factory/processing/drones expose `simulateOffline(seconds, mult)`-shaped closed-form methods (completion toasts suppressed inside). **PP overflow choke**: `PPSystem.deposit(amount)` is the only sanctioned way to add clamp-at-cap PP — it routes spill to `pp.onOverflow` → `compute.routeOverflow(amount, implant)` (25% × (1+power) × outputMult into the implant XP bank; needs module + unit + implant target). Combat's raw `+=` at `CombatSystem.js` stays deliberately unrouted (combat-PP hold) — its excess converts at the next update clamp.
- **Factory hoppers (v14)**: machines consume from per-machine `hopper` (per-material capacity `20×2^hopperLevel`, upgrade `250×3^n` PP), never the shared bag — manual and automated alike; `stock`/`unstock` are lossless (unstock stops at the 99 bag cap). v13 loads auto-stock each running automated line once. Processing nodes' queue IS their stock (inputs consumed at enqueue) and `active`+`queue` now serialize. Drone missions queue 3-deep (+1/efficiency past 3), chain on completion, resolve offline under the drones gate.

**Permanent-multiplier convention**: bonuses that multiply PP rate or damage are recomputed *every frame* in the game loop (`ppSystem.globalMultiplier = ascension × challenges × factory ring`; `combatSystem.permDamageMult = bosses × challenges × ascension combat`; `expedition.damageMult = combat.damageMult × permDamageMult`; `droneSystem.efficiencyMult = modifiers × ascension drone × compute gate`; ascension's gather multiplier composes inline at the two gather-duration sites; all compute gate mults — see ComputeSystem above) — no stale wiring after save load. Cap-side bonuses use named `pp.setCapMultiplier()` keys and are re-applied in `SaveSystem.apply()` via each system's `applyBonuses()`.

### Enemy archetypes & combat mechanics

`ARCHETYPE_CONFIG` in `js/entities/Enemy.js` defines 5 regular creature archetypes (`serpendrill`, `reptlar`, `dunkraza`, `hardlizzy`, `cavecrab`) + 7 zone bosses — every one is GLB-modelled (see `_bossModelPaths`; the Cryo Monarch and the Rimefather have their own models, the rest still share `Pirate_Lizard.glb`, and the creatures use one GLB each). **Boss GLBs are authored at ~0.8 units native height** (measure `Boss_CryoMonarch.glb` if in doubt) — `_buildBossModelMesh` applies ×1.4 and `cfg.scale` on top, landing a boss around 2.4 units against the player's 1.78. The pre-`0.x` procedural "box-robot" archetypes (rusher/swinger/burst/etc.) were removed; `serpendrill` is the fallback default in `Enemy` and `EntityManager`. Optional per-archetype mechanic fields, all honored by `CombatSystem`: `statusEffect`, `armor` (flat player-damage reduction), `dodgeChance`, `fpDrainOnHit`, `regenOnAttack`, `rageRamp` (enemy damage compounds per attack), `burstCount`, `speed`, and for bosses `phase2: { at, damageMult, intervalMult, dodge, regen }` (triggers once below `at` fraction of max HP). The zone packs added since then follow the same shape — Mine (`scalerunner`/`duneplate`/`bramblemaw`), Verdant Maw (`vineclaw`/`sporeback`/`bloomfang`), Frozen Tundra (`frostfang`/`glacierback`/`blubberfin`) and the Glacial Hollow (`rimeburrow`/`shardback`/`cryolisk`/`chillwing`), each a rigged GLB with Idle/Walk clips. Drop tables live in `CombatSystem.DROP_TABLES` — a test asserts every entry is a known inventory material. **Model-swap on late load:** enemies (and resource nodes) built before their GLB finishes parsing start with the procedural fallback body and are rebuilt **in place** the moment the model arrives (module-level `_awaitingModel` registry + `_refreshMesh()`, cleared once all loads settle) — same group, so position/scale/combat state persist. A fresh page load may show fallback bodies for well under a second; nothing stays procedural until zone re-entry anymore.

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
| Labyrinth cell map (walls, collision, POIs) | `js/scene/zones/Labyrinth/layout.js` |
| Boot shader/texture pre-warm (zone-switch perf) | `js/scene/shaderWarm.js` |
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
| Generation Engine — player-built computer (CORE tab) | `js/systems/ComputerSystem.js`, `js/systems/computerGenerations.js`, `js/scene/zones/ComputerBuilding/` |
| Compute allocation board + Al modules (ALLOC panel) | `js/systems/ComputeSystem.js` |
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
- Outlines are added via `addOutline(mesh, thickness)` (cloned mesh, inverted normals). `thickness` is a scale fraction, but hulls are floored at `MIN_OUTLINE_WORLD` (0.045) world units via the geometry's bounding sphere — without the floor, sub-unit props (resource nodes, small rocks) render sub-pixel, i.e. invisible, outlines.
- **GLB outline conventions:** `_placeGLBProps` auto-hulls placed props at runtime, EXCEPT GLBs that carry a baked shell (detected by a BackSide material or a mesh named `*OutlineHull*`). The live tree GLBs (`Ghibli_Tree_D/H/I/J` — oak/broadleaf/windswept/spruce, all Rodin image-to-3D from owner references; A–C hand-built and E–G text-prompt variants are retired files) each embed a baked `<Name>_OutlineHull` — a flipped-normal **smooth-cage** shell (source: `Assets/3D/LandingProps/LandingProps.blend`; two recipes in `Assets/3D/LandingProps/`, run via the blender-mcp socket): **`hull_envelope.py` — the preferred recipe for single-mass crowns (TreeH)**: voxel-remesh the body into a closed low-poly envelope (keep only the largest remesh component — surface-soup emits interior shells), smooth, dissolve+triangulate, then lift every vertex along the envelope's own normals by a dilated need-field until clearance ≥ target everywhere (verified in-script over verts/edge-mids/centroids; total lift capped so the enclosed under-canopy pocket, which misclassifies as inside, doesn't extrude a curtain). A smooth strictly-containing envelope with clearance > chord error can never cross the body from any angle — zero interior artifacts, no face deletions, continuous bold band, and it's ~3k tris. **`hull_rebake.py` — the cage recipe for multi-lobed trees (I blobs / J tiers / D)** where one envelope would balloon over the gaps: err-inward smooth cage with per-tree ink weight (`PER_TREE`), penetration + hemisphere-visibility cuts. Hard-won principles: Rodin soup has flipped-normal patches, so **signed distance via `(p−loc)·nrm` lies** — test inside/outside with unsigned distance + a multi-ray escape vote; **never repair a hull by per-vertex pushing against the bumpy body** (shatters the smooth envelope into visible shards — twice); diagnose with shadowless Eevee renders (the game casts no shadows; hull shadows fake speck fields) plus a hull-only render to tell deletion holes from poke-through. **Never displace-and-decimate a copy for the hull, and never put a runtime scale-hull on a high-poly organic mesh** — both poke through bumpy surfaces as black speckles; that's exactly what the smooth-cage shells exist to avoid. Tree variant weights/scales live in `_treeModel()` (weighted 40/25/20/15, native heights normalised to a 2.2–3.6-unit forest). The camera sits at ~46° elevation (`CAMERA_OFFSET` in config.js) so trees and props read in profile — art is judged at that pitch, not top-down.
- The camera is orthographic; object height affects visual layering but not gameplay — keep interactive objects at `y ≈ 0`.
- `seededRandom` is a module-level function in `Environment.js`, not exported. Inline a copy if needed in other files (see `MineLayout.js`).
