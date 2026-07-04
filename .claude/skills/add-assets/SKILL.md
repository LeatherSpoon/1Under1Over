---
name: add-assets
description: "scan Assets/3D for unprocessed models - rig, animate, optimize, wire into the game, verify visually"
trigger: /add-assets
---

# /add-assets

Turns raw 3D model exports sitting in `Assets/3D/` into finished, rigged, game-ready GLBs in `models/`, wired into the appropriate game system (decorative prop, resource node, or enemy/creature), verified visually in the live preview.

## Usage

```
/add-assets                  # scan for and process every unprocessed asset
/add-assets <name>           # process one specific asset folder (e.g. /add-assets Drone)
/add-assets --dry-run        # just report what would be processed, don't touch Blender or code
```

## Step 1 — Discover unprocessed assets

Diff `Assets/3D/*` against `models/*.glb` by normalized name (`BlueBoulder` ~ `Blue_Boulder.glb`, `PirateLizard` ~ `Pirate_Lizard.glb`, etc.). Anything in `Assets/3D` without a corresponding finished file in `models/` is new. Each asset folder typically contains `base_basic_pbr.glb` (separate diffuse/normal/metallic-roughness maps — use this one) and `base_basic_shaded.glb` (a pre-baked variant — ignore unless the pbr version is missing). Skip non-glb sources (e.g. `.usdz`) and flag them to the user instead of guessing a conversion.

Report the list to the user before doing any Blender work if run with no argument and more than ~2 assets are found — batch-processing several rigs unattended is worth a quick confirmation.

## Step 2 — Process each asset (sequentially, not in parallel)

**Blender is a single shared instance reached over the raw MCP socket** (see the project's Blender MCP memory/reference notes — no registered MCP tools, drive it via a Python socket client on `localhost:9876`, protocol `{"type": <cmd>, "params": {...}}`). Because there is only one Blender scene, assets **must be handled one at a time in sequence**, even though each is conceptually a self-contained unit of work — do not spawn multiple subagents concurrently against Blender. If delegating to a subagent per asset, launch them one after another and wait for each to finish before starting the next.

For each asset, in a subagent (or inline if the user asked for a single asset):

1. **Import & inspect.** Open/append `base_basic_pbr.glb` into the Blender scene. Get scene info, check for accidental duplicate hierarchies (this has happened before — identical mesh names/vertex counts at the same world position), and screenshot before touching anything.
2. **Classify the body plan.** Compute bounding boxes/centers per mesh part. Decide:
   - **Single continuous organic mesh** (vines, limbs, tentacles) → needs the inverse-distance bone-heat-fallback weighting approach (bone-heat auto-weights fail on AI-generated meshes with overlapping shells).
   - **Discrete rigid parts** (segmented creature body, mechanical drone panels) → simpler: one bone per part, 100% rigid vertex-group weight, no blending needed.
   - **Static single-piece prop** (rock, ore chunk, plant with no moving parts) → no rig needed at all; skip to Step 4 as a decorative prop.
3. **Decide what it is:**
   - Does the game already reference this name somewhere (`ZoneAssets.js`, `ResourceNode.js` `_nodeModels`, `Enemy.js` `_bossModels`/`ARCHETYPE_CONFIG`, `DroneSystem.js`)? That tells you whether it's a drop-in replacement for an existing procedural mesh (gameplay entity) or a new decorative prop.
   - A creature/character with legs or limbs → enemy archetype (or check if it's meant to replace an existing boss's procedural geometry).
   - Something with the drone system's naming → wire into `DroneSystem`'s model cache, not `Enemy.js`.
   - A plant/rock/ore chunk with no bones → decorative prop via `ZoneAssets.js`.
4. **Rig + animate** (skip if static prop). Author only the animations that make sense for what it is:
   - Locomoting creature/drone → `Idle` + `Walk` (or `Run` if it's meant to chase/flee) as NLA tracks, unmuted, same convention as `Player.glb`/`Scorpion.glb` (contact/pass keyframes, looping).
   - Something that only needs a subtle living/idle presence (a plant, a hovering drone with no legs) → `Idle` only.
   - Verify deformation in pose mode with a screenshot before committing to full animation authoring — a bad joint placement is cheap to catch early and expensive to catch after 20 keyframes.
5. **Optimize before export:**
   - Strip normal maps and metallic/roughness maps from every material — this game is toon-shaded and doesn't use them (confirmed by `Player.glb` shipping with only a single diffuse texture).
   - Downscale the diffuse to 1024px (or smaller — 512 is fine for a small prop) via an `img.copy()`, leaving the original untouched.
   - Rebuild each material's node graph clean (Image Texture → Base Color → Principled BSDF → Output) rather than trying to surgically unlink nodes — it's more reliable than hunting down every stray node reference.
   - Run `bpy.data.orphans_purge(do_recursive=True)` a few times after any object/material deletions — leftover orphaned datablocks (especially from duplicate cleanup) silently keep old textures alive and bloat the file.
   - Export GLB (`export_apply=True`, `export_yup=True`, `export_animation_mode='NLA_TRACKS'` if animated), then check the actual file size. **Target: under 2MB.** If still over, drop the diffuse further (512px) before accepting a compromise — do not ship an asset over budget without flagging it to the user.

## Step 3 — Wire into the game

Follow whichever existing pattern matches the classification from Step 2:
- **Decorative prop:** `Environment.js`'s `loadModel()`/`_glb` cache + an entry in `ZoneAssets.js` (see that file's header for the full steps and radii).
- **Gameplay entity (resource node / enemy / boss):** the per-file preload-with-procedural-fallback pattern — a module-level loader resolves into a `{ key: THREE.Group }` cache object, and the entity's mesh-building code clones from that cache if present. See `ResourceNode.js` (`_nodeModels`) and `Enemy.js` (`_bossModels`) for the two existing examples. Add a new `ARCHETYPE_CONFIG` entry if it's a new enemy.
- **Drone:** wire into `DroneSystem`'s rendering path the same way.

**Always check the actual bounding box** (`new THREE.Box3().setFromObject(...)`) before picking a scale value — GLB assets from different generation batches are frequently 3-5x different in native scale from each other, and guessing has produced invisible or giant assets before.

## Step 4 — Verify visually

Start (or reuse) the dev server preview. Load the zone where the asset was wired in. `preview_screenshot` it standing next to known-good neighboring objects and sanity-check:
- Is it visible at all (not near-invisible from a bad scale guess)?
- Is its scale plausible relative to the player and neighbors?
- Does the silhouette read correctly (no inside-out normals, no missing outline)?
- If animated, step the timeline (or trigger the animation in-engine) and confirm it plays without popping/twisting — watch especially for rotation-axis mistakes (a bend that does nothing because the rotation axis is along the limb's own length rather than its hinge axis).

Fix anything wrong before moving to the next asset. Don't declare an asset done off of "the export succeeded" alone.

## Step 5 — Report

After all assets are processed, output a single summary table:

| Asset | Type | Rigged? | Animations | Before | After | Wired into |
|---|---|---|---|---|---|---|
| Drone | gameplay entity | yes | Idle, Walk | 8.4MB | 1.2MB | DroneSystem |
| ... | | | | | | |

Flag anything that didn't fit cleanly (ambiguous classification, still over the 2MB budget, a source format that couldn't be processed) rather than silently deciding for the user.
