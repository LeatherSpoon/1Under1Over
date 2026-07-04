# For Future Claude

A practical guide for any Claude instance picking up work on **Processing Power** — a browser-based 3D idle RPG built in Three.js, ES6 modules, served at `http://localhost:8080`.

---

## Who You Are Working With

The user communicates in short bursts. Expect:
- "Good, proceed." → move to the next feature
- "Confirmed." → the thing you just fixed works
- "That wasn't it." → your diagnosis was wrong, look deeper
- A screenshot with no words → something is visually broken; study the image carefully
- "I don't like it." → scrap the feature entirely, don't iterate on it

They test everything in-browser before responding. When they say something is broken, it is broken. When they say it works, move on without re-explaining what you did.

They have a clear vision and will tell you when something doesn't match it. Don't over-explain or justify choices — just implement, verify, and report the outcome concisely.

---

## Project State (as of late April 2026)

### Completed features
- Grid mine layout (blocks touch, seeded RNG, 11×11 grid at 3.2m spacing)
- AABB collision for mine/depths grid blocks (not circular — this was an explicit fix)
- Crack overlay visualization on mine blocks (2 stages, hidden geometry revealed on hit)
- X-ray transparency system (`_fadeObj` + `_updateOccluders` in `main.js`) — **verify this works**; there was a long debugging history
- Resource node collision (planned via `EntityManager.getNodeCollisionCircles()` — **check if implemented**)
- Codex system, Achievement system, Milestone rewards
- Research/Tech tree (nodes in `server/definitions/seedData.js`)
- Drone missions system
- Augmentation system (8 augments, stat bonuses, `applyBonuses()` for save/load)
- Crafting Mastery system
- Save system v3 (storageItems, equipmentBag)
- Mouse-as-joystick (left-click drag on canvas)
- Drone Monitor + Ascension Terminal in Spaceship zone (not HUD buttons)

### Explicitly scrapped — do not re-introduce
- **Fatigue system** — user tested it, did not like it, removed
- **Trading Post** — user called it "unuseable", scrapped entirely

### Pending / uncertain
- X-ray transparency in The Mine: last fix was `material.needsUpdate = true` when toggling `transparent`. Verify before assuming it works.
- Phase 3 zones: Abandoned Lab, Orbital Platform — not started
- Zone Difficulty Scaling, Faction System — not started

---

## Architectural Rules That Must Not Be Reverted

### Energy
No passive regeneration. Energy only from Energy Cell consumables or the Charging Station in Spaceship zone. Do not add passive regen.

### Gathering
E-press starts the action; it completes automatically. Do not add hold-to-gather or release-to-cancel.

### Mine collision
Mine and Depths grid blocks use **AABB collision** stored in `env._collisionBoxes`. Each entry is `{ minX, maxX, minZ, maxZ, rock }` where `rock.alive` gates whether the box is active. The collision loop in `main.js` resolves AABB-circle (player) overlap. Do not switch back to circular collision for these blocks.

### Mine layout
Both The Mine and The Depths use grid-based layouts (blocks touch at 3.2m / 3.0m spacing). Do not revert to ring-based layouts.

### Panel locations
- **HUD bottom row**: INV, EQUIP, STEPS, TECH, MSTR, STATS, ACH, GAME, SAVE, LOAD
- **Spaceship stations only**: Drone Monitor (pos 5,3), Ascension Terminal (pos 0,-6)
- Do not add DRONE/ASC back to the HUD button row.

---

## Critical Technical Gotchas

### Three.js transparency
When toggling `material.transparent` from `false` to `true`, you **must** also set `material.needsUpdate = true`, otherwise the shader does not recompile and opacity changes have no visual effect. Always pair them.

```js
if (!child.material.transparent) {
  child.material.transparent = true;
  child.material.needsUpdate = true;
}
```

When restoring to opaque:
```js
child.material.transparent = false;
child.material.needsUpdate = true;
```

### BackSide materials (outlines)
Outline meshes use `side: THREE.BackSide` (inverted normals). Making them transparent causes black holes. Always skip BackSide materials in any transparency or opacity traversal:

```js
if (child.material.side === THREE.BackSide) return;
```

### Constructor vs switchZone
`Environment.js` constructor calls `_buildLandingSite()` directly — it does **not** go through `switchZone()`. Any array initialized in `switchZone()` must also be initialized in the constructor, or the landing site build will crash. `_collisionBoxes` was the bug that caused a black screen after the AABB system was added.

### seededRandom is not exported
`seededRandom` (mulberry32 PRNG) is a module-level function in `Environment.js` and is not exported. If another file needs deterministic RNG, inline a copy — as `MineLayout.js` does with seed 11111.

### Windows encoding
On Windows (cp1252), any `print()` or file write containing Unicode characters (arrows, box-drawing, etc.) will throw `UnicodeEncodeError`. When writing files, always use `encoding='utf-8'`. For console output, use `.encode('ascii', errors='replace')` or avoid the Unicode characters.

### Zone registration checklist
Adding a new zone requires changes in 4 places:
1. `Environment.js` — `switchZone()` case, `getZoneLabel()`, `getResourceNodeSpawns()`, `getEnemySpawns()`, `_build<Zone>()`
2. `main.js` — `ZONE_TERRAIN`, `ZONE_SPAWN_POS`
3. `js/config.js` — `ENV_UNLOCK` PP threshold
4. `js/systems/GameStatistics.js` — increment `TOTAL_WORLDS`

### Save system — new systems
When adding a system that needs persistence:
1. Add to `SaveSystem.systems` destructure in `_buildSaveData()` and `apply()`
2. Call `system.serialize()` in save data
3. Call `system.load(data.key)` in `apply()`
4. If it applies bonuses to other systems on load, implement `applyBonuses()` and call it explicitly in `apply()` (the `onPurchase` callback is not wired yet at load time)

---

## The Graphify Graph

A knowledge graph of this entire codebase was built on 2026-04-22:

```
D:\HTML_Project\graphify-out\
  graph.html        - interactive, open in browser
  graph.json        - queryable JSON graph
  GRAPH_REPORT.md   - community analysis
```

**God nodes** (architectural hubs): `Environment` (57 edges), `HUD` (50 edges). Everything else with high degree is Three.js internals.

**Key finding**: `TelemetrySystem` bridges four communities (Architecture/Docs, Achievement, Crafting, Telemetry) — it may be doing too much or is a natural integration hub worth understanding before touching.

To query the graph in a future session, run `/graphify query "your question"`.

---

## How the User Ideates

When the user asks you to "ideate" or "brainstorm", they want a structured list of feature options with brief descriptions. They will approve or reject items. They move fast — if they say "proceed", start implementing immediately without asking for more detail.

They think in phases: ideate → approve → implement → verify in browser → next feature. Don't skip phases or bundle unasked-for features into a phase.

---

## What Good Looks Like

- Surgical edits — only touch what the request requires
- Read the file before editing it
- Run `node --check js/path/to/file.js` after editing to catch syntax errors
- Report: what you changed and where (file:line), then stop
- Don't summarize what you did — the user can read the diff
