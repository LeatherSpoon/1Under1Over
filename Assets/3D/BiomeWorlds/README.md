# Biome Worlds — Blender authoring conventions

How an expanded biome is authored in Blender and exported into the game.
The design of record is `Plans/Expanded-Biome-Worlds-Design.md`; the build
order is `Plans/Expanded-Biome-Worlds-Implementation.md`.

## The pipeline

```
<Biome>.blend  ──export_layout.py──▶  js/scene/zones/<Zone>/layout.generated.js
                                             │
                                             ├─ validateLayout()   (js/scene/layoutSchema.js)
                                             │  enforced by npm test
                                             └─ buildLayout()      (js/scene/LayoutBuilder.js)
                                                streams through SectorView
```

Run the exporter from Blender's scripting tab with the biome file open:

```python
import export_layout
export_layout.export(
    zone="lagoonCoast",
    out="D:/1Under1OverToo/js/scene/zones/LagoonCoast/layout.generated.js",
)
```

It refuses to write anything if the scene has problems, and reports all of them
at once. After a successful export, run `npm test` — the Node validator is the
authority, and it gates CI.

## Coordinate mapping

| Blender | Game |
|---|---|
| X | x |
| Y | z |
| Z | height (not exported — interactive objects sit at y ≈ 0) |

Author top-down in Blender's XY plane. The game's camera looks from +z at a
~46° pitch, so "toward the camera" is +Y in Blender.

## Collections

Only these collections export. Everything else — reference images, notes,
blockout sketches, cameras — is ignored, so keep working geometry wherever it
is convenient.

| Collection | Contents | Becomes |
|---|---|---|
| `Terrain_Fixed` | perimeter landforms, foundational ruins, major water, terminal landmarks | `props[]` with `terrain: 'fixed'` |
| `Terrain_Soft` | trees, brush, rubble, drifts, shore dressing | `props[]` with `terrain: 'soft'` |
| `Routes` | curves — one per authored route | `routes[]` |
| `Markers` | empties — entrances, portals, posts, landmarks | `markers[]` |
| `Regions` | empties (circle) or meshes (rect) — procedural dressing areas | `regions[]` |
| `Districts` | empties — named areas, used for authoring and validation | `districts[]` |

Plus one object named **`Bounds`** (a plane or an empty) defining the biome's
footprint. Its extent becomes the zone's `CONFIG.ZONE_BOUNDS` entry.

**Fixed vs soft is the terraforming contract.** A future terraforming system
may remove or reshape soft terrain and must never touch fixed. Put an object in
the collection that matches what it *is*, not what looks tidy — the validator
rejects a prop whose `terrain` disagrees with its collection.

## Custom properties

Set these in Object Properties → Custom Properties. `id` defaults to the object
name, so it is only needed when two objects would otherwise collide (ids must
be unique across the *whole* layout, not just within one collection).

### `Terrain_Fixed` / `Terrain_Soft` — mesh or empty

| Property | Required | Notes |
|---|---|---|
| `model` | yes | a key from `js/scene/modelKeys.js` |
| `r` | no | collision radius; omit for walkable dressing |
| `tint` | no | integer hex, e.g. `0x5f574c` |
| `district` | no | a district id, for authoring clarity |

Position, uniform scale and Z-rotation come from the object transform. Scale
must be uniform — the game clones a GLB at a single scale, so a non-uniform
Blender scale would silently lie about what ships.

### `Routes` — curve

| Property | Required | Notes |
|---|---|---|
| `type` | yes | `arterial` · `collector` · `local` · `express` · `interchange` |
| `width` | yes | intended clearance in world units |

Target clearances (starting standards, validated in the pilot — deviations are
reported as warnings, not errors):

| Type | Clearance |
|---|---|
| arterial | 6–9 |
| collector | 3.5–5 |
| local | 2–3 |

Routes join automatically where endpoints coincide within ~2 units, so a branch
that starts on an arterial is connected without extra authoring.

### `Markers` — empty

| Property | Required | Notes |
|---|---|---|
| `kind` | yes | `entrance` · `portal` · `interchange` · `npc` · `enemy` · `resource` · `landmark` · `mechanic` |
| `propId` | no | for `landmark`: the prop id it refers to (keeps it materialized at any distance) |
| `target` | no | for `portal`: destination zone key |
| `label`, `archetype`, `materialType` | no | passed through for the zone builder |

Markers are *returned* by `buildLayout`, not built. What an entrance or an enemy
post means stays the zone's business.

### `Regions` — empty (circle) or mesh (rect)

| Property | Required | Notes |
|---|---|---|
| `models` | yes | comma-separated model keys, e.g. `mawFernCluster, mossyBoulder` |
| `seed` | yes | integer; **unique per region** |
| `density` | yes | props per square world unit (0.02 ≈ scattered, 0.1 ≈ thick) |
| `terrain` | no | defaults to `soft` |
| `scale`, `scaleJitter`, `r` | no | per-prop scale, variation, collision radius |

An empty's display size is the circle radius; a mesh's bounding box is the rect.
Density is per unit *area*, so it reads the same at any region size.

**Every region needs its own seed.** That independence is what makes editing one
district safe — a shared seed would reshuffle the whole biome on any change.

## Landmarks at distance

Props with `terrain: 'fixed'` at scale ≥ 2.5, and any prop referenced by a
`landmark` marker, stay materialized at any distance instead of streaming with
their sector. Everything else appears and disappears with its sector.

Note the camera's real reach here: about 14 world units ahead at default zoom
and ~21 fully zoomed out. A landmark 40 units away is off-screen, not merely
small — see finding F5 in the implementation plan. Compose landmarks for
district scale until that decision is settled.

## Sanity checklist before exporting

- [ ] Every object is in exactly one export collection (or none, if reference).
- [ ] `Bounds` exists and covers every placement.
- [ ] Prop scales are uniform.
- [ ] Region seeds are unique.
- [ ] Route types and widths are set.
- [ ] Ids are unique across the whole scene.

Then export, then `npm test`.
