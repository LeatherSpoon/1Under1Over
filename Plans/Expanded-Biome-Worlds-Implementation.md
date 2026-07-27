# Expanded Biome Worlds — Implementation Plan

**Date:** 2026-07-24 (decisions resolved 2026-07-26)
**Status:** Phase 0 + the Phase 1 exporter are built (F1–F4). D1–D5 are now
resolved (§2). Phase 1.2 (round-trip the current Lagoon Coast through the
pipeline) and Phase 2 (block out the larger footprint) are next, both of which
need Blender / blender-mcp reachable from the session — not yet confirmed
available.
**Design of record:** `Plans/Expanded-Biome-Worlds-Design.md`

## 0. Build log

**2026-07-24 — F1–F4 shipped.** 272/272 tests (was 231); verified in-browser
across all thirteen zones.

| Finding | What landed |
|---|---|
| F1 | Per-zone bounds: `CONFIG.ZONE_BOUNDS` + `getZoneBounds`/`getPlayerBounds`; `Player.bounds` set by `switchZone`; `_addGround` sizes and centres from them. The ±39 global ceiling is gone — a zone is enlarged by one `ZONE_BOUNDS` entry. Existing zones unchanged (verified: all thirteen still ±39, same prop and collision counts). Live proof: a declared 100×100 Lagoon Coast gave a 100×100 ground plane and the player walked to x = 49. |
| F2 | `Assets/3D/BiomeWorlds/export_layout.py` (Blender harvest → `layout.generated.js`) + `README.md` conventions; `validateLayout()` implements all seven rejection rules with one test each, wired into `npm test`. |
| F3 | `js/scene/layoutSchema.js` (shape + rules), `js/scene/LayoutBuilder.js` (`buildLayout`, `expandRegion`, `routeLength`, `routeDistance`), `js/scene/modelKeys.js` pinned to Environment's `_glb` literal by a drift test. `Environment.buildPropMesh()` extracted so ZoneAssets and generated layouts share one art path. |
| F4 | `js/scene/SectorView.js` — built clean rather than retrofitted, per the owner's call that the Mine adapts to it. Adds persistent landmarks, sector-scoped collision, and a movement epsilon over the Mine's chunk view. The Mine still runs `_mineChunks`. |

**Measured while building, and it changes a plan assumption:** generous sector
radii make sectoring a *no-op* at 100×100. Against 841 props on a 100×100 map,
measured at the worst-case position (map centre):

| sector size | radii | props live at centre |
|---|---|---|
| 16 | 56 / 72 | 96% |
| 16 | 34 / 48 | 60% |
| 10 | 40 / 56 | 66% |
| 10 | 34 / 48 | **50%** ← default |
| 8 | 34 / 48 | 51% (196 sectors to scan, no gain) |

Two consequences. First, the defaults are now size 10 / 34 / 48, chosen because
34 sits ~7 units beyond the camera's widest reach so a sector materializes
before it can be seen. Second, **sectoring buys roughly a 2× reduction at
100×100, not an order of magnitude** — it earns its keep, but 100×100 is near
the low end of where it matters. That is worth knowing before sizing the
remaining biomes.

This plan turns the approved design into a build order, grounded in what the
code actually does today. It changes nothing about the design's intent; where
the code contradicts an assumption in the design, that is called out under
"Findings" and, where it needs an owner call, under "Decisions needed".

---

## 1. Findings from the current code

These are the facts that shape the plan. Line references are current as of this
document's date.

*(F1–F4 below describe the code as found. All four are now resolved — see the
build log above for what replaced them.)*

### F1 — The player is hard-clamped to ±39. A 100×100 map is impossible today.

`js/config.js:72` sets `GROUND_SIZE: 80`, and `js/entities/Player.js:277-279`
clamps the player every frame to `±(GROUND_SIZE / 2 - 1)` = **±39**. The value
is global, shared by all twelve zones, and also sizes the ground plane and the
debug grid in `Environment._addGround()` (`js/scene/Environment.js:747-765`).

A 100×100 biome would render, but the player would hit an invisible wall at 39
units and never reach the outer 11 units on any side. **Per-zone world bounds
are a hard prerequisite for everything else in this project**, and they are the
first thing to build.

### F2 — No Blender→data exporter exists. This is genuinely new tooling.

All twelve Python scripts under `Assets/3D/` export GLB or rig meshes
(`build_shell.py`, `rig_creatures.py`, `hull_envelope.py`, `npc_export3.py`, …).
Nothing emits game *data*. The authored-layout exporter — Blender-side emitter
plus the validator implementing the design's seven rejection rules — is new
work with no in-repo precedent to copy. Budget for it accordingly; it is the
riskiest part of Phase 1, not a formality.

The design's rejection list maps one-to-one onto test assertions, which makes
it a usable spec. That is the intended reading in Phase 0.2.

### F3 — `ZoneAssets.js` is already the authored-placement layer, but it is flat.

`ZONE_ASSETS[zone]` is an array of `{ model, x, z, scale, rotY?, r?, tint? }`
(`js/scene/ZoneAssets.js`, 273 lines, hand-edited, well-commented). The design's
authored data adds routes, terrain classification, markers, districts,
procedural-region definitions with seeds, and bounds — none of which fit that
shape.

**Recommendation:** do not extend `ZONE_ASSETS`. Emit a separate generated
module per expanded biome — `js/scene/zones/<Zone>/layout.generated.js` —
following the `Mine/layout.js` precedent, and leave `ZONE_ASSETS` owning the
eight small hand-authored zones untouched. Generated data stays visibly
generated; the hand-edited file stays hand-editable.

### F4 — The Mine's chunk view is the right precedent but is not reusable as-is.

`js/scene/zones/Mine/index.js:153-219` implements exactly the sectoring the
design describes: chunk bounds, activate/deactivate hysteresis
(`CHUNK_ACTIVATE_R = 36` / `CHUNK_DEACTIVATE_R = 44`), per-cell deterministic
RNG (`cellRng`) so variants survive round trips, and a single
`env._mineChunks.update(player.position)` call from the game loop
(`js/main.js:1478`).

It is also welded to the Mine: `mineCellToWorld`, `getMineWallCells`, kit
pieces, and rock logic objects. Reuse means **extracting the bookkeeping** into
a zone-agnostic `SectorView` that takes items shaped
`{ x, z, materialize(), dispose() }`, and leaving the Mine's materializers in
the Mine. The 36/44 radii were tuned for a dark cave and will need to grow
outdoors — see F5 and F6.

### F5 — The camera can see roughly 14–21 units ahead. "Distant landmarks" has a ceiling.

`SceneManager.js:177` sets the ortho half-height to `(FRUSTUM_SIZE / 2) × zoom`
= `10 × zoom`, with `ZOOM_MIN 0.45` / `ZOOM_MAX 1.5` (`config.js:11-12`). The
camera sits at `CAMERA_OFFSET (0, 14, 13.5)` — a ~46° pitch.

Deriving forward reach in world-z from the player to the top of the screen:
`10 × zoom / sin(46°)` ≈ **14 units at default zoom, ~21 units fully zoomed
out**. Half-width is `10 × zoom × aspect` ≈ 18 units default, ~27 fully zoomed
out at 16:9.

So on a 100×100 map, a landmark 40 units away is roughly **twice the maximum
zoomed-out forward reach** — off-screen entirely, not merely small. The
design's "major landmarks should remain legible while the player is moving
quickly" and "useful forward sightlines" pillars are limited by the *camera*,
not by layout. Layout tuning cannot fix this on its own.

These numbers are derived, not measured. Measuring them in-game is the first
task of Phase 2, before any layout is tuned against them.

### F6 — 40–65 units is a few seconds once the player is fast.

`StatsSystem.js:68-69`: `moveSpeed = 3.5 + speed.level × 0.15 + trackBonus +
augBonuses.speed`. Track bonuses stack at `+0.3` each
(`PEDOMETER_TRACK_SPEED_BONUS`).

| Speed | 40 units | 65 units |
|---|---|---|
| 3.5 u/s (base) | 11.4 s | 18.6 s |
| 8 u/s (speed lvl 30) | 5.0 s | 8.1 s |
| 12 u/s | 3.3 s | 5.4 s |
| 20 u/s | 2.0 s | 3.3 s |

The design's stated goal is distance "for movement speed to remain valuable
rather than collapsing every journey into a few seconds." At the speeds the
design itself anticipates, **40–65 units is a few seconds.** The target holds
at base speed and dissolves above roughly 10 u/s.

This is not a reason to change the number unilaterally — it may be that the
approach is meant to feel long *early* and become a fast commute *later*, which
is a legitimate and common design. But it should be an explicit choice rather
than an accident, so it is raised under Decisions.

### F7 — Lagoon Coast has no developed content to re-compose.

`js/scene/zones/LagoonCoast/index.js` is 89 lines: six seeded water circles,
ten procedural cone-and-cylinder palm trees, three cylinder "rocky islands", a
portal, and a return beacon. No GLB props, no `ZONE_ASSETS` entry, roughly a
30×30 footprint. It is the least developed zone in the game.

That makes it a low-risk tooling pilot — nothing to break, and it needs a
rebuild regardless. But the design's step "the existing developed content in
each biome becomes this first major district" **cannot be exercised there**,
because there is no existing developed content. It also forces a from-scratch
coastal asset pack into the same phase as brand-new tooling.

The three biomes that follow all *do* have developed content to re-compose (the
Maw's hamlet and interiors most of all). Proving the pipeline can round-trip
real developed content should not wait until three biomes depend on it — hence
the added Phase 3.5 below.

### F8 — The Depths is a different job from the other three.

`js/scene/zones/Depths/index.js` is 78 lines of pre-kit primitives: a 24×24
plane, a 7×7 grid of box "ore blocks", eight octahedron crystals. No reveal
materials, no chunking, no GLB, no tile map. It is essentially the Mine as it
was before its rework.

Expanding it to 100×100 is not "apply the outdoor workflow to a fourth biome" —
it is **rebuilding the Depths on the Mine's stack** (kit, generator, anchors,
reveal materials, chunked view). The Mine already solved authored-anchors +
seeded-cave-fill in `Mine/anchors.js` and `Mine/generator.js`, which is the
same hybrid the design's route grammar implies for a cave.

Treating the Depths as three-plus-one rather than four-of-a-kind is the main
structural change this plan makes to the delivery order.

### F9 — Spawns are hardcoded per-zone lists and will need a validity pass.

`Environment.getResourceNodeSpawns()` and `getEnemySpawns()` are literal arrays
keyed by zone (`js/scene/Environment.js`, ~lines 570-700). Redistributing them
across 11× the area (delivery step 11) means rewriting those lists.

The Mine already hit this problem and solved it: `_snapToMineFloor` relocates
an authored spawn point to the nearest valid floor cell, so an approximate
authored coordinate is fine. Outdoor biomes need the equivalent — a
snap-or-reject pass so a spawn authored inside a soft-terrain cluster does not
wedge an enemy inside a tree.

### F10 — Express-return scenes roughly double the zone count.

Two or three scenes per biome × four biomes = **8–12 new zones**, against 12
today. Each needs the full five-step zone checklist enforced by
`tests/systems/zoneWiring.test.js`: `Environment.switchZone` case +
`getZoneLabel` + spawn getters + builder, `zoneManager` `ZONE_TERRAIN` and
`ZONE_SPAWN_POS`, `ENV_UNLOCK`, `TOTAL_WORLDS`, and `ZONE_LORE` + a matching
Codex entry.

Individually cheap, collectively real bookkeeping. They are almost certainly
`NO_PP_GATE` exceptions (corridors, not gated destinations) and must be added
to that exception set consciously.

---

## 2. Decisions needed before Phase 2 tuning

Phases 0 and 1 can proceed without these. Phase 2 is where they bind.

**D1 — Travel time vs. player speed (from F6). RESOLVED 2026-07-26: keep it
meaningful at high speed, via both remaining levers together** — a footprint
larger than 100×100 *and* a semi-firm soft cap on `moveSpeed`. The exact
footprint number is deliberately not set here; F5's camera-reach math was a
constraint on *this* option only insofar as bigger maps make landmarks harder
to see at range, and D2 resolves that by routing around camera reach entirely
(an off-screen nav aid) rather than by keeping the map small enough for direct
sightlines. So Phase 2's "measure before tuning" step should size the
footprint against travel-time-at-target-speed (F6's table) rather than against
camera reach. **The `moveSpeed` soft cap is progression/economy work, not
world-building — owner wants it scoped as its own separate session**, not
folded into biome delivery. Until that session, treat current `StatsSystem`
speed scaling as unchanged; the larger footprint can and should proceed
without waiting on it.

**D2 — Landmark legibility (from F5). RESOLVED 2026-07-26: off-screen
navigation aid** — a compass/indicator HUD element pointing toward
notable landmarks/POIs when they're outside the camera's view, rather than
relying on landmarks staying within the ~14–21-unit sightline or raising
`ZOOM_MAX`. This is the most engineering-heavy of the four options but is the
most robust against D1's larger-than-100×100 footprint. It needs a per-zone
landmark/POI registry that does not currently exist (portals, bosses, NPCs are
placed but not tagged as navigable landmarks) — worth building as a
zone-agnostic system now so it also benefits the twelve existing zones, not
just the four expanded biomes.

**D3 — The Depths (from F8). RESOLVED 2026-07-26: confirmed — cave stack.**
Rebuilt on the Mine's kit/generator/chunk stack with authored anchors, not the
outdoor authored-layout pipeline. Scheduled last per the existing plan
(Phase 6).

**D4 — Pilot re-composition risk (from F7). RESOLVED 2026-07-26: confirmed —
do the dry run.** Phase 3.5 (round-trip the *existing* Verdant Maw hamlet
through the new pipeline at its current scale, unchanged) proceeds before any
second biome is expanded for real, to catch pipeline gaps against real
hand-built content (NPCs, doorways, the idol landmark) before three biomes
depend on the pipeline working.

**D5 — Terrain classification granularity. DEFAULTED 2026-07-26 (not asked —
lowest-stakes, reversible call): a two-value fixed/soft flag**, per the design
doc's own assumption. Nothing about the terraforming system that would consume
richer data (yield, regrowth, cost tier) exists yet, so richer classification
would be speculative today and is cheaper to add later than to retrofit. Revisit
if a terraforming system design lands before Phase 1 export work starts.

---

## 3. Phase plan

Each phase ends in a state that can be shipped and reviewed on its own. Verify
criteria are concrete because loose ones ("make it work") cost a round trip.

### Phase 0 — Foundations. No visible change in game.

**Status: done** — see the build log. Delivered as described, with one
deliberate change: 0.3 built `SectorView` clean rather than extracting it from
the Mine (owner's call — "the Mine is due for an upgrade… develop something you
agree with and I will adjust for the Mine"), so the Mine keeps `_mineChunks`
for now and adopts `SectorView` later.

| # | Work | Verify |
|---|---|---|
| 0.1 | Per-zone world bounds. Replace the global `GROUND_SIZE` clamp (`Player.js:277-279`) with a per-zone bounds record; make `_addGround` and the debug grid take a size. | Player walks to ±49 in a 100-unit test zone; all existing zones keep identical bounds and ground; `npm test` green. |
| 0.2 | Shared layout-data schema + validator. Document the module shape (bounds, routes, props, markers, regions, districts, terrain class) and write a Node validator implementing the design's seven rejection rules. | One unit test per rejection rule, each failing for the right reason. New `tests/systems/biomeLayout.test.js`. |
| 0.3 | Zone-agnostic `SectorView`: bounds/hysteresis/activate/dispose over `{x, z, materialize, dispose}` items. | A synthetic 100×100 fixture activates and disposes at the right radii; the Mine is untouched. |
| 0.4 | Blender conventions: named collections, custom-property names, X→x / Y→z / Z→height mapping, reference-collection exclusion. | Written into `Assets/3D/BiomeWorlds/README.md`. |

### Phase 1 — Exporter pilot (Lagoon Coast, current 30×30 scale)

| # | Work | Verify |
|---|---|---|
| 1.1 | Blender export script → `layout.generated.js`. **Done.** | Emits a module that passes the 0.2 validator. |
| 1.2 | Round-trip the *current* Lagoon Coast through it — same zone, same look, now data-driven. **Not started.** | Side-by-side capture against today's build; portal and return beacon still function; `npm test` green. |
| 1.3 | Wire the validator into `npm test` so a bad export fails CI, not the browser. **Done.** | Deliberately corrupt an export; `npm test` fails naming the rule. |

1.1 has not been run against a real `.blend` — no biome scene exists yet, and
Blender is not reachable from this session. The Node side is proven end to end
(a hand-built layout validated, streamed and collided correctly against the
live Environment and real GLBs); the Blender harvest is written to the
documented conventions but unexercised. First real export will shake it out.

Rationale for round-tripping at the *current* scale first: it separates "does
the pipeline work" from "is the big map any good". Two failure modes, two
phases.

### Phase 2 — Lagoon Coast at 100×100: the calibration biome

This phase produces the **numbers the other three biomes inherit**. It is the
most valuable phase in the project and should not be rushed.

1. **Measure before tuning.** Confirm F5's derived sightlines empirically at
   both zoom extremes, and time the 40–65-unit approach at base speed and at a
   representative late speed. Settle D1 and D2 against real captures.
2. Block out the 100×100 layout: entrance near one edge, the two initial
   approaches (mission run / return route), approach wilderness, first district
   at the tuned distance, deeper half, terminal landmark, reserved interchange,
   express-return entrance.
3. Tune and record: arterial/collector/local clearances, first-district
   distance, sector size and activate/deactivate radii under high-speed
   traversal, dressing density.

**Verify:** every route connected and walkable end to end; no required path
crosses fixed collision; sector transitions show no visible late
materialization at the highest speed tested; the recorded numbers written back
into this document as the standard for Phases 4–6.

### Phase 3 — Lagoon Coast finish

Landmarks, building shells, perimeter, soft-corridor composition, and the
coastal asset pack.

**Verify:** the design's full spatial-validation list, run as a checklist;
in-game captures at the reviewed camera.

### Phase 3.5 — Re-composition dry run on Verdant Maw (added; see D4)

Export the *existing* Maw hamlet — three homes, three NPC posts, three
interior doorways, the idol landmark — through the new pipeline at its current
scale, changing nothing about how it looks or plays.

**Verify:** hamlet visually identical; all three home doorways still prompt and
transition; NPC idles intact; `npm test` green. This proves the pipeline
handles real developed content before three biomes depend on it.

### Phases 4–6 — Verdant Maw, Frozen Tundra, then the Depths

- **4. Verdant Maw** — expand to 100×100, existing hamlet becomes the first
  district at the tuned distance.
- **5. Frozen Tundra** — expand to 100×100; the Glacial Hollow cave mouth
  becomes a collector destination. Its interact-radius gotcha (documented in
  CLAUDE.md) must survive relocation.
- **6. The Depths** — rebuilt on the Mine's kit/generator/chunk stack with
  authored anchors (F8, D3). Scheduled last because it shares least with the
  outdoor work.

**Verify each:** the same spatial-validation checklist, plus the regression
list — portals, return behaviour, interactables clear, Glacial Hollow and
Maw-tender home entrances usable.

### Phase 7 — Express-return scenes

8–12 small zones, each through the full five-step zone checklist (F10), added
to the `NO_PP_GATE` exception set consciously.

**Verify:** `tests/systems/zoneWiring.test.js` green with no unexplained
exceptions; every return corridor walkable from its deep-biome entrance to its
exit.

### Phase 8 — Population and final validation

Redistribute enemy and resource spawns across the expanded maps, with the
snap-or-reject validity pass from F9.

**Verify:** no spawn inside collision; every spawn reachable; traversal,
collision, performance and visual checks across all four biomes; final editable
`.blend` files and in-game comparison captures per the design's step 10.

---

## 4. Risk register

| Risk | Phase | Mitigation |
|---|---|---|
| Camera cannot show landmarks at biome scale (F5) | 2 | Measure first; settle D2 before composing landmarks. |
| Approach distance dissolves at high speed (F6) | 2 | Settle D1 explicitly; the pilot is where it is cheap to change. |
| Exporter is new tooling with no precedent (F2) | 1 | Round-trip the existing zone before the big map; validator in CI. |
| Pilot cannot exercise re-composition (F7) | 3.5 | The added dry run on the Maw. |
| Sector pop-in at high speed | 2 | Hysteresis radii are a tuned output of Phase 2, not inherited from the Mine's 36/44. |
| Depths mis-scoped as an outdoor biome (F8) | 6 | Confirm D3 up front; schedule separately. |
| Scope. 4 biomes at 11× current area, 8–12 new zones, new tooling, new asset packs | all | Phase boundaries are shippable; each biome independently reviewable per the design. |

## 5. Scope note

For calibration: the Glacial Hollow — one small cave zone, four rigged
creatures, seven props — was a full session's work. This project is four
biomes at roughly eleven times the area of a current zone, plus 8–12 new
corridor zones, plus new tooling, plus asset packs. It is a multi-session
project, and the phase boundaries above are drawn so that stopping between any
two of them leaves the game in a shippable state.
