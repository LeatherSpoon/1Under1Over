# Expanded Biome Worlds Design

**Date:** 2026-07-24

**Status:** Approved design; implementation planning pending owner review

**Scope:** Map construction and visual world-building only

## Purpose

Expand the four current branches reached from the Mine into large, substantial,
separate worlds:

- Verdant Maw
- Lagoon Coast
- Frozen Tundra
- The Depths

Each main biome becomes a 100×100 environment with meaningful travel distance,
non-linear route choices, explorable places, distant landmarks, and room for
future expansion. The worlds remain separate scenes. They are not parts of one
homogeneous overworld.

The player is expected to become fast. The maps therefore need enough distance
for movement speed to remain valuable rather than collapsing every journey into
a few seconds.

This project builds the physical world. Quests, rewards, traversal abilities,
adventure persistence, and other gameplay mechanics will be designed
separately.

## Design Principles

### Separate worlds

The Mine remains the origin of the four current branches. Each biome has its
own terrain, visual identity, boundaries, and route network. Future gates may
allow travel from one biome to another without returning through the Mine, but
those connections do not make the biomes geographically continuous.

### Traffic-themed map grammar

The maps use a traffic hierarchy:

- **Arterial:** the primary route carrying the player outward from the biome
  entrance.
- **Collector:** a substantial branch serving a settlement, building, cave,
  ruin, landmark, or other large place.
- **Local:** a short trail serving a resource pocket, enemy territory, secret,
  overlook, or small environmental vignette.
- **Express return:** a shorter alternate corridor reached from deep in the
  biome and composed of two or three additional scenes.
- **Interchange:** reserved space for a future gate or cross-biome shortcut.

This is a spatial vocabulary, not a requirement that every route look like a
road. Depending on the biome, a route may be a rootway, beach, tidal shelf,
snow trail, frozen river, mine gallery, or natural fissure.

### Macro-linear, locally non-linear

Each biome has an overall outward direction from the Mine entrance toward deep
territory. The journey is not a single corridor.

Routes may:

- Fork around terrain.
- Offer two approaches with different visual character.
- Rejoin where the landscape naturally supports it.
- Feed collector and local branches.
- Allow off-route exploration through soft terrain.

No biome is required to form a circuit.

### A substantial first approach

The first major developed district should not sit beside the entrance. The
player should usually travel about 40–65 world units along the available routes
before reaching it. This is a pacing target rather than a fixed coordinate or
mandatory distance.

The existing developed content in each biome becomes this first major district
near the middle of the expanded map. The entrance approach contains wilderness,
environmental storytelling, resources, creatures, and small discoveries, but
not another major settlement or adventure complex.

### Soft corridors and future terraforming

Routes are guided by soft environmental pressure rather than continuous hard
walls. Dense vegetation, water, dunes, snowbanks, ice shelves, rubble, crystal
growth, and similar features make the authored routes clearest and fastest
while still allowing off-route exploration.

Every scene distinguishes:

- **Fixed terrain:** perimeter landforms, foundational ruins, major bodies of
  water, terminal landmarks, and other elements that define the biome.
- **Soft terrain:** trees, brush, rubble, minor rock, snowdrifts, shallow-water
  dressing, and other elements that a future terraforming system may remove or
  reshape.

Terraforming mechanics are not part of this project. The maps merely preserve
space and data classifications so later work can widen routes, connect
branches, expose construction areas, or create shortcuts.

## Common Main-Biome Layout

Each main biome uses a 100×100 footprint. Exact coordinates are tuned in
Blender, but the common composition is:

1. An entrance near one edge.
2. A 40–65-unit route journey through approach wilderness.
3. The existing developed content re-composed as the first major district.
4. A deeper half containing collector destinations, local discoveries, and a
   terminal landmark.
5. A reserved future interchange near or beyond the terminal region.
6. An entrance into an express-return corridor of two or three scenes.

Arterials should generally retain 6–9 units of readable clearance. Collectors
may narrow to 3.5–5 units, and local trails may narrow to 2–3 units. These are
starting standards to validate at the actual player camera and future-feeling
movement speed, not rigid geometric rules.

Broad turns and deliberate vegetation breaks should provide useful forward
sightlines. Major landmarks should remain legible while the player is moving
quickly. The biome entrance begins near one edge of the map. Two initial approaches
split after the entrance: Intentional mission run, and return route.

### Blender scene contents

Each Blender scene includes:

- Scene bounds and coordinate grid.
- Fixed terrain and soft terrain in separate named collections.
- Arterial, collector, and local routes as named curves.
- District boundaries and terraform reserves.
- Linked or instanced GLB props at game coordinates.
- Named empties for entrances, portals, future interchanges, NPC posts, enemy
  posts, resources, landmarks, and future mechanic markers.
- An orthographic camera approximating the in-game view.
- Reference-only collections ignored by export.

Coordinate mapping is:

- Blender X → game X.
- Blender Y → game Z.
- Blender Z → game height.

## Authored Layout Data

The generated placement module carries:

- Scene bounds.
- Route class and route points.
- Prop model keys and transforms.
- Collision radii for authored props.
- Landmark, entrance, and future-interchange markers.
- Fixed/soft terrain classification.
- Procedural-dressing region definitions and seeds.
- District labels used for authoring and validation.

The exporter rejects:

- Unknown model keys.
- Duplicate marker IDs.
- Missing required custom properties.
- Out-of-bounds authored placements.
- Objects in the wrong export collection.
- Invalid route types.
- Invalid or non-finite transforms.

Reference geometry, notes, cameras, and illustrative annotations are not
exported.

## Runtime World Construction

Authored placement data defines the composition. Deterministic generators fill
the connective wilderness with biome-appropriate trees, brush, rocks, snow,
shore dressing, crystals, and debris.

Each procedural region uses an independent stable seed. Editing one district
must not reshuffle another district or the whole biome.

The 100×100 environments use spatial sectors following the Mine's existing
chunking philosophy:

- Major landmarks and navigation silhouettes remain available at distance.
- Dense dressing activates near the player.
- Dressing collisions activate with the same sector.
- Sector transitions must tolerate high player speed without visible late
  materialization.
- Interiors and small subzones do not need outdoor-scale sectoring unless
  profiling demonstrates a need.

Existing enemies and resource nodes may be redistributed across the larger
maps so the new spaces are not empty. New enemy, reward, resource, or encounter
mechanics are outside scope.

## Delivery Order

1. Establish shared map data, route, terrain-classification, and Blender
   collection conventions.
2. Build and validate the Lagoon Coast Blender-export pilot.
3. Block out Lagoon Coast at 100×100 in Blender and in the game.
4. Tune route widths, first-district travel distance, sightlines, sector size,
   and dressing density from the pilot.
5. Finish Lagoon Coast landmark, building-shell, boundary, and soft-corridor
   composition.
6. Apply the proven workflow to Verdant Maw.
7. Apply the proven workflow to Frozen Tundra.
8. Apply the proven workflow to The Depths.
9. Build the two or three express-return scenes for each biome.
10. Produce final editable Blender files and in-game comparison captures for
    every expanded scene.
11. Reposition current enemies and resources and run final traversal,
    collision, performance, and visual checks.

Each biome should remain independently reviewable. A later biome does not need
to wait for gameplay mechanics in an earlier biome.

## Validation

### Spatial validation

- Every intended route is connected to the mine.
- Every entrance, destination, and return exit is reachable.
- Arterials, collectors, and local paths meet their intended clearance ranges
  or record a deliberate exception.
- No required path intersects a fixed collision obstacle.
- Soft corridors allow off-route exploration without making authored routes
  irrelevant.
- The first major district requires a substantial journey from the entrance.
- The overall route network remains outward-moving while supporting local
  non-linearity.
- Reserved interchanges and terraform areas remain unobstructed.

### Regression validation

- Existing portals and return behavior remain functional.
- Existing interactable positions remain clear after relocation.
- Current enemies and resources spawn on valid traversable ground.
- Glacial Hollow and Maw-tender home entrances remain usable.
