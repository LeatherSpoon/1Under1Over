# The Cinderforge — volcano maze zone (design)

**Date:** 2026-07-30 · **Ask:** "Make a new environment (using blender and rodin) that is similar to labyrinth but is volcano themed."

## Concept

**The Cinderforge** — the 16th zone: an ancient volcanic forge-maze where the
Ancient World Gates were cast. Basalt corridors on the Labyrinth's proven
15×15-cell grammar (CELL 5, slab walls, circle-chain collision), lit by lava
pools, brazier fire and glowing rune steles under a near-black ember sky.

**Why this connection point:** the Meltwater Rift shipped with two sealed
future-zone thresholds; the **Ember Chasm** (east, at (13, 10.5), winch
platform = the intended way down) "breathes heat" and was built to be paid
off exactly the way Atlantis' back door paid off into the Labyrinth. The
sealed gate swaps for a real `_addCaveEntrance` (the builder comment says to
do precisely this); the return is an Ancient World Gate in the entry court
with `spawnOverride` back to the chasm apron — lore-perfect, since the gates
were forged here.

## Approaches considered

1. **Behind the Ember Chasm (chosen)** — pays off an authored hook, zero new
   gate furniture in the Rift (pit + winch already exist), free unlock
   (`ENV_UNLOCK 0`, reaching the Rift is the gate) matching the Labyrinth.
2. Off the Breach gate gallery — would need a 6th gate on row 21 and a new
   unlock path; the gallery is composed and full.
3. Off the Emberglade — the glade is deliberately a reward-terminus with no
   nodes/enemies; hanging a combat maze off it breaks its design.

## Layout

New 15×15 map in `js/scene/zones/Cinderforge/layout.js` (pure data, same
exports as the Labyrinth's). Courts: **E** entry court (south, return gate at
[0, 26], spawn [0, 22]), **G** Forgemaster plaza (center — the golem statue),
**A** Anvil sanctum (NW — the trek destination, BFS ≥ 16 from spawn),
**C** crucible court (E), **V** vent yard (W), **S** slag vault (NE, treasure).
Topology braided differently from the Labyrinth (verified by its own test,
`tests/systems/cinderforgeLayout.test.js`, cloned from the Labyrinth's:
bordered grid, full connectivity, ≥ 90 floor cells, sanctum trek, slab +
collision coverage, spawn-cell checks).

## Asset kit (Rodin text-to-3D → Blender → `models/Forge_*.glb`)

13 jobs, Sketch tier, processed by `Assets/3D/Cinderforge/build_cinderforge.py`
(clone of build_labyrinth.py: join → single 512px diffuse → orient (render-
sweep-verified FORCED_ROT) → normalize → decimate → export at origin → park in
watcher-convention `Cinderforge.blend`):

| GLB | h | role |
|---|---|---|
| Forge_WallStraight | 2.8 | maze slab (×1.13 join rule, seeded jitter) |
| Forge_Column | 3.0 | isolated wall cells + court dressing |
| Forge_ArchGate | 3.4 | plaza + sanctum thresholds (leg circles only) |
| Forge_Golem | 3.2 | the Forgemaster — plaza centerpiece statue |
| Forge_Anvil | 2.0 | the Great Anvil — sanctum centerpiece |
| Forge_Crucible | 1.8 | crucible court (fountain analog) |
| Forge_Vent | 2.0 | vent yard fumaroles (well analog) |
| Forge_Brazier | 1.2 | light posts |
| Forge_RuneStele | 1.6 | junction waymarks |
| Forge_BrokenColumn | 2.0 | ruin storytelling |
| Forge_Rubble | 0.7 | scatter (noOutline) |
| Forge_IngotStack | 1.0 | treasure (slag vault / dead ends) |
| Forge_Gargoyle | 1.6 | sanctum guards |

`labBones` rows are reused for charred-bone scatter (models are shared across
zones by convention). Golem follows the Minotaur success formula (upright,
symmetrical, no held objects, calm simple face). No NPCs this round; no boss —
the Forgemaster is a statue, *for now* (both are follow-up hooks, mirroring
how the Labyrinth shipped).

## Content

- **Nodes** (all existing materials): obsidian ×2 (cryoPick, one rich in the
  sanctum), embermoss ×1, tungsten ×1, copper ×1, quartz ×1.
- **Enemies**: cavecrab ×2, scalerunner ×2, duneplate ×1 — tight leashes
  (patrolR ≤ 1.8; corridors are 5 wide). No boss.
- **Light/FX**: near-black warm `cinderforge` ambience preset; lava pool
  discs (MeshBasicMaterial, black rim over orange core — the Rift's pit
  recipe) in authored pockets + point lights; rising ember motes
  (`env._spinners` update-fn convention); spinning ember ring over the anvil;
  dark flagstone PathRibbons entry→plaza and across the plaza mouths.

## Wiring checklist (all enforced by zoneWiring/panel tests)

Environment.js (switchZone case + label + node/enemy spawns + GLB preloads),
zones/index.js barrel, zoneManager (`ZONE_TERRAIN: 'rock'`,
`ZONE_SPAWN_POS: [0, 22]`), config `ENV_UNLOCK.cinderforge: 0`,
GameStatistics TOTAL_WORLDS 16→17… (whatever the current count +1 is),
ZONE_LORE `cinderforge: 'theCinderforge'` + CodexSystem Lore entry,
`ZONE_AMBIENCE.cinderforge`, modelKeys, ZONE_ASSETS.cinderforge (kit rows +
generated wall rows), MeltwaterRift sealed-gate swap.

## Verification

`npm test` green (incl. the two new-zone enforcers + the new layout test);
headless Playwright rig: enter via the Ember Chasm, walk the maze, screenshot
plaza/sanctum/courts, confirm collision holds and the return gate lands on
the chasm apron.
