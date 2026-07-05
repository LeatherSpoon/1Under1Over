# The Mine Reimagining Design

Date: 2026-07-05

## Goal

Reimagine The Mine as the first zone in a game-wide visual face-lift, and in the
process turn it from a fixed procedural-placeholder space into a re-rolling delve.
The Mine should:

- Look professionally hand-crafted in the game's canonical art style — westernized
  anime, clean confident outlines, flat color with soft gradient shading, painterly
  backgrounds, strong silhouette reads (Avatar: The Last Airbender / Studio Ghibli).
- Progress from a small worked mine (timber, rails, lanterns, drill) into a large
  primitive natural cave that dominates the majority of the zone, ending at the
  ancient Breach.
- Feel like Shadows of Brimstone: you never know exactly what a descent holds. The
  natural cave re-rolls every venture, while a set of fixed anchors keeps the world
  graph and key rooms predictable and always reachable.

The visual upgrade is the headline deliverable and lands first. The re-rolling
system and smarter collision are the good ideas surfaced during design and are
captured here as the same project's later phases.

## Non-Goals

- Do not change the game's toon shader or black outlines. The Mine adopts the new
  art style within the existing rendering conventions; outlines are still auto-added
  by `addOutlineToGroup`.
- Do not change the movement/collision *resolver* (the radial push-out). Collision
  gets smarter *boundaries* (colliders that match the visible rock and props that
  block), not a new sliding algorithm.
- Do not change sub-grid resolution. The map stays on 3.2m cells; organic feel comes
  from art variation and off-grid dressing, not a finer grid.
- Do not build the endless descent in this project. "Venture as deep as you want"
  is delivered here as "the cave is large and different every venture," bounded by
  the Breach. The literally-endless push-your-luck delve is a documented follow-on
  (see Future Work) with its own spec.
- Do not alter the five portals' roles or the boss's clearance/unlock logic. They
  are re-staged into the new layout, not redesigned.
- Do not expose or require the Postgres server. The Mine runs client-side like the
  rest of the game.

## Art Direction

Canonical style prompt, applied to environments the same way it is applied to the
user's generated character/prop assets:

> westernized anime style, clean confident outlines, flat color with soft gradient
> shading, painterly backgrounds, strong silhouette reads, inspired by Avatar: The
> Last Airbender and Studio Ghibli.

Practical rules for authoring:

- Flat base colors with gentle toon-ramp shading and baked ambient occlusion. Bold
  silhouettes are prioritized over surface micro-detail.
- Black toon outlines stay; author flat and let the game supply the outline.
- Dark-cave lighting with warm (worked mine) and cool/violet (breach) point-light
  pools, consistent with the existing zone ambience system.
- The "Living Geode" concept (banded strata, emissive veins, crystal gardens) is
  deliberately reserved for a later depth pass (e.g. The Depths), not the Mine.

## Layout & Flow

The Mine is a top-to-bottom descent. Region bands, ordered surface (−z) to deep (+z):

1. **Worked entrance** (compact) — timbered adit, rails, abandoned ore cart, the
   return lift to Landing Site. Human-built, warm lantern light.
2. **Worked shaft & drill** (compact) — the active dig face: the drill rig and the
   first copper/iron seams. Structured, industrial. This is the "improved mine."
3. **Primitive natural cave** (the majority) — past the drill's reach, raw winding
   rock: branching chambers, the bulk of the ore (iron/carbon/quartz), enemy spawns,
   the boss arena, and the Depths shaft in a natural chasm. Most play-time is here,
   and new points of interest go here.
4. **Transition** (thin) — natural rock begins turning ancient; alien veins appear.
5. **The Breach** (deep end) — the ancient chamber with the three world gates
   (Verdant Maw, Frozen Tundra, Lagoon Coast).

Scale: the natural cave and beyond grow to roughly 10× their current area. The whole
zone lands around a 78×78 cell grid (~240m across) on 3.2m cells. That scale is why
authoring becomes procedural (below) and why performance work is required (Phase 3).

The drill rig marks the boundary between the worked mine and the raw cave. The
Depths shaft lives inside the natural cave, not the worked section.

## Fixed Anchors vs. Re-Rolling Cave

The two halves of the Shadows-of-Brimstone feel map onto an anchor split:

**Fixed anchors** — hand-authored templates stamped at known cell coordinates every
generation, always present and always reachable:

- Entrance hub (return portal to Landing Site).
- Drill face.
- Depths shaft chamber (portal down to The Depths).
- Boss arena (the `boss_mine` boss).
- The Breach chamber with three gate alcoves (Verdant Maw, Frozen Tundra, Lagoon
  Coast portals).

Because anchors never move, `MINE_ZONE_PORTALS` stays a constant set of coordinates
and the world graph, boss clearance, and portal-access logic are untouched.

**Re-rolling cave** — the connective natural cave between anchors regenerates from a
fresh seed each venture. Chamber shapes, ore vein placement, enemy spawn points, and
minor finds differ every descent. The generator always carves guaranteed trunk
corridors to every anchor, and a flood-fill reachability check validates each layout
before it is accepted; on failure it repairs or advances the seed and retries.
Randomness therefore delivers surprise without ever stranding a gate.

## The Generation Engine

The static `MINE_MAP` ASCII array is replaced by `generateMineMap(seed)`, which
returns the same grid shape the existing consumers already read, so downstream code
keeps working:

- `getMineWallRuns()`, `getMineFloorRuns()`, `getMineableWallBlocks()`,
  `isMineFloorCell()`, `mineCellToWorld()`, `mineWorldToCell()`.

Generation steps:

1. Stamp fixed anchor templates at known coordinates.
2. Carve guaranteed trunk corridors connecting all anchors.
3. Fill the natural-cave region with a seeded procedural cave (a tunneling pass
   smoothed by cellular-automata iterations), scattering ore tiers by depth band.
4. Run the flood-fill reachability check (generalized from the existing
   `tests/mineLayout.test.js` logic). Repair or re-seed until every anchor is
   reachable.
5. Return the grid plus metadata: anchor positions, ore block list, and enemy spawn
   points (boss fixed at its arena; regular enemies at generated positions).

Determinism: the same seed always produces the same map. This keeps the whole system
testable and lets a mid-delve reload rebuild the identical cave.

Suggested module layout (final structure decided during implementation planning):

- `js/scene/zones/Mine/generator.js` — `generateMineMap(seed)` and the cave fill.
- `js/scene/zones/Mine/anchors.js` — anchor templates and stamping.
- `js/scene/zones/Mine/layout.js` — retains the grid-reading helpers and constants,
  now operating on a generated grid instead of a static string array.

## Delve Lifecycle & Persistence

**When it re-rolls:** a delve begins when the player descends into the Mine from
Landing Site (fresh seed) and ends when they surface. Coming *up* from The Depths
mid-delve returns the player to the same cave they descended — still the same
venture. Re-roll is therefore gated on "entered the Mine from Landing Site," not on
every `switchZone('mine')`.

**Mined-out state persists within a delve.** Once a block is mined out it stays
depleted for the rest of that delve — there is no in-delve ore regeneration. The
incentive is intentional: to get a fresh, full cave the player surfaces and
re-descends, which re-rolls the seed. This is a deliberate change from the current
richness/regen behavior for the Mine's mineable blocks.

**Save format:** `SaveSystem` gains `mine: { seed, minedCells: [...] }`.

- On load mid-delve: rebuild the map from `seed`, then re-apply `minedCells` so
  depleted blocks stay depleted.
- On surface + re-descend: assign a new seed and clear `minedCells`.

Verification note: confirm this does not conflict with any passive ore system (e.g.
the Refinery `ExtractorSystem`) that assumes persistent nodes. If there is a
conflict, the extractor should read from the current delve's live blocks or be
scoped to not target re-rolling Mine nodes.

## Art Kit & Rendering

**Modular kit.** Region bands drive a modular GLB kit with a distinct palette each:
worked (timber-lined walls, plank floor) → primitive cave (rough rock walls in
several variants, cave floor) → transition → breach (alien stone). Each piece is
authored on the 3.2m footprint so pieces tile cleanly.

**Breaking the grid visually.** Three mechanisms hide the underlying grid:

- Multiple authored variants per wall/floor type.
- Random rotation/mirroring per cell (seeded).
- A seeded off-grid dressing pass scattering boulders, stalagmites, and crystal
  clusters into floor cells.

**Hero props** (drill rig, ore cart, timber support sets, adit frame, the Breach
great-ring, world-gate arches, standing stones) are GLB models placed at anchors.

**Rendering pattern.** All GLB content follows the existing preload-cache-clone-
with-procedural-fallback pattern used by `ResourceNode._nodeModels` and
`Enemy._bossModels`: a module-level `GLTFLoader` kicks off on import, resolves into
a `{ key: THREE.Group }` cache, and mesh-building clones from cache if present, else
falls back to primitives. Decorative props route through `Environment.loadModel()` /
`_glb` and `ZoneAssets.js` per that file's existing add-a-prop steps.

The reveal effect (tall cave walls opening around the player,
`createRevealToonMaterial`) is preserved.

## Performance At Scale (Phase 3)

A ~240m cave is thousands of meshes and thousands of colliders — a naive port tanks
the orthographic scene. Two mechanisms keep cost flat:

- **Instanced rendering.** One `THREE.InstancedMesh` per kit-piece-variant, so all
  copies of a wall variant are a single draw call. The reveal effect is computed
  in-shader from world position, so it needs no per-instance CPU work.
- **Chunking.** The map partitions into chunks; only chunks near the player are
  active (built/colliding). Because the camera is orthographic and frames a bounded
  area, this keeps draw calls and collision checks independent of total map size.

## Smart Collision

Two boundary improvements, plus a broad-phase to keep them cheap at scale:

- **Match the visible rock.** Each kit piece carries an authored collision footprint
  (a tightened AABB or a small set of circles matching its actual silhouette).
  Placing a module emits that footprint transformed by the module's rotation, not a
  blanket 3.2m box. Faces that curve in get colliders set back; jutting rock gets
  covered. This replaces the current uniform `GRID_COLLISION_INSET` box per cell.
- **Props block properly.** Each dressing prop declares a `collisionR`, or
  `walkOver: true` for small ground debris that emits no collider. Boulders and
  stalagmites stop the player; pebbles and floor crystals do not catch the ankles.
- **Spatial-hash broad-phase.** All colliders are bucketed into a spatial hash once
  per generation. A new `env.getNearbyColliders(x, z)` returns only nearby colliders,
  so the main-loop collision cost is independent of map size. The existing radial
  push-out resolver is unchanged.

## Asset Pipeline (Hybrid)

- **User generates** the hero/organic props with the canonical style prompt, dropped
  into `Assets/3D`: drill rig, ore cart, timber support sets / adit frame, the Breach
  great-ring, world-gate arches, standing stones. Enemy/boss models already exist
  (e.g. the Pirate Lizard / TIDE ORACLE boss).
- **Claude authors** the grid-precise modular cave kit in Blender via the MCP socket
  (walls ×N variants per region, floor tiles per region, ore-block chunks per tier,
  corridor/transition pieces) and small dressing props; and handles scale-correction,
  grid fitting, optimization, and integration for all assets.

GLB authoring, rigging, and export follow the established Blender pipeline (raw
socket on port 9876; export selected meshes to GLB with `export_apply=True`,
`export_yup=True`). Check each import's real bounding box before choosing a scale —
GLB native scales vary wildly.

## Integration & Wiring

- `Mine/index.js` `build(env)` reads the current seed, generates the grid, builds the
  scene via kit clones + instancing, emits smart colliders, and scatters dressing.
  Region palette drives kit selection.
- A small piece of delve state (a `MineSystem` or equivalent) holds the current seed,
  decides re-roll on entry from Landing Site, and serializes `{ seed, minedCells }`
  through `SaveSystem` (add to both `_buildSaveData()` and `apply()`).
- `Environment.getEnemySpawns('mine')` returns the boss at its fixed arena plus
  regular enemies at generated spawn points, fed to `EntityManager`.
- `main.js` collision resolution switches to `env.getNearbyColliders(x, z)`.
- No changes to `MINE_ZONE_PORTALS` roles, `CONFIG.ENV_UNLOCK`, `BossSystem`
  clearance, `GameStatistics.TOTAL_WORLDS`, zone lore, or the codex.

## Build Phases

Art lands first, on ground already known to be walkable. Each phase ends green.

- **Phase 1 — The reskin.** Author the modular kit and hero props; wire GLB-clone
  rendering and region palettes into the *current* Mine (existing layout, scale, and
  collision). Delivers the headline visual upgrade fast and low-risk.
  - Verify: live-preview walk-through of all regions; existing tests still pass.
- **Phase 2 — The re-rolling engine.** `generateMineMap(seed)`, fixed anchors,
  guaranteed corridors, generalized reachability test, re-roll on surfacing, and the
  `{ seed, minedCells }` save. The kit is now placed procedurally.
  - Verify: reachability across many seeds (e.g. 100) all-anchors-reachable;
    determinism (same seed → same map); save round-trip rebuilds the identical cave
    with depleted blocks intact.
- **Phase 3 — Scale & smarts.** Grow to ~10×; add instancing/chunking, the
  spatial-hash broad-phase, per-module collision footprints, and prop colliders.
  - Verify: frame-time acceptable at full scale; collision matches the visible rock
    (no invisible walls, no phantom gaps); props block; full-region preview walk.

## Testing & Verification

- **Reachability:** generalize `tests/mineLayout.test.js` to run `generateMineMap`
  over many seeds and assert every anchor is reachable each time. This is the safety
  net for procedural generation.
- **Determinism:** same seed → identical grid.
- **Save round-trip:** serialize/deserialize `{ seed, minedCells }` and confirm the
  rebuilt cave matches and depleted blocks persist.
- **Drop tables:** the existing test asserting every drop is a known material stays
  green.
- **Live preview:** per the project's verify-entity workflow — `__debugSwitchZone('mine')`,
  raise `ppSystem._baseCap` before setting `ppTotal` to avoid the zone-lock recall,
  move with `player.teleportTo`. Walk each region, screenshot the art, confirm all
  gates and the boss arena are present, and check frame-time at scale.

## Future Work (Captured, Out Of Scope Here)

- **Endless descent delve.** Beyond this bounded re-rolling Mine, a push-your-luck
  endless descent: no fixed bottom, depth-scaling ore and rising danger, re-rolled
  each run, gates reachable from a predictable top hub. Phase 3's chunking and
  seeded generation are designed so this can bolt on. It gets its own spec and plan
  after this project ships.
- **Living Geode depth pass.** The banded-strata / emissive-vein / crystal-garden
  aesthetic applied to The Depths as its own face-lift.
- **Game-wide face-lift rollout.** The Mine is the first zone; the same kit approach
  and art direction extend to the remaining zones in later projects.
