# Kickoff — Generation Engine, Round 1: the buildable computer building

Read these two docs first; where they disagree, the addendum (v3) wins:

- `Plans/Generation-Engine-Design.md` — the approved Generation Engine design (24 generations, 5 eras, schematic quest, module slots, color variants)
- `Plans/Generation-Engine-Site-Addendum.md` — the owner's later calls: mission fiction, player-built construction, chunk grammar, sizes. Fiction backdrop: `Plans/The computer is the persistence mechanism.txt`.

## What this round ships

Era 1 only (generations 1–4), fully playable. Art: the established Blender/Rodin pipeline and house-style prompts (`Plans/Art_prompt_generic`, MineKit/build-script conventions) are available — run the Era 1 kit through it this round **if capacity allows**; otherwise ship clean toon-box placeholders and the ComputerKit art pass is the immediate next round, not a someday. Either way the chunk-grammar piece list (wall runs, corners, roof, door frame, window variants) and the addendum's material-naming rules are the spec to build against, so placeholders and real kit are drop-in swaps:

1. **Chunk placement.** The player builds the computer's building anywhere valid in the Landing Site, one chunk at a time. A chunk is 3×3 speed-track cells = 6×6 world units on the existing 2-unit snap grid. Reuse `js/systems/PedometerSystem.js` wholesale as the pattern: pending pool, place/remove keys, per-zone persistence (see the [T]/[G] handlers in `js/main.js` ~line 733). Valid cells = any cell clear of existing keep-outs (ship, pad, camp, mountain/adit approach, arena, knoll, posts, nodes, edge margin) — a mask built from data that already exists in `js/scene/zones/LandingSite/index.js` and `js/scene/ZoneAssets.js`. No designated plot. After the first chunk, new ground chunks must share an edge with the plan.
2. **Plan → shell.** The player's chunk plan is a cell map; generate perimeter walls, floor, roof, and collision from it the way `js/scene/zones/Labyrinth/layout.js` generates the maze — wall runs, collision chains, flood-fill test. Regenerate on plan edit, never per frame; merge wall runs (Mine convention, phone perf budget applies).
3. **Door + interior.** One exterior wall carries the door (player-chosen edge). `_addCaveEntrance` with `walkIn: true` (Starwing pattern), nav landmark 'Computer' tracking the door cell, and a path ribbon from the landing pad that re-aims when the door moves. Interior is one door zone on the `js/scene/zones/HomeInteriors/index.js` template, room sized from the plan; the machine (flight-cased field terminal → twin mission servers → integration bench → full expedition rack, per the addendum's Era 1 beats) fills ~15/40/70/95% of floor area across gens 1–4.
4. **ComputerSystem.** New system serializing `{ generation, plan, slotChoices, colorId }` — SaveSystem conventions, save-version bump, migration, tests. Eligibility reads `ascension.prestigeCount` (thresholds stubbed/configurable). Schematic delivery checklist reuses the Training-console recipe pattern (`js/systems/TrainingAreaSystem.js`); evolving grants pending chunks per the addendum's pacing table and advances the generation.
5. **A generation data table** as the single source of truth: `{ gen, era, chunkGrant, interiorSet, fillFraction, storyHeight, kitSet, exteriorTells }`. Zone builder, shell generation, collision, interior, door record, and ComputerSystem all read table + plan. No coordinate lives in two files.

## Tests to write by name

Plan flood-fill (connected, door reachable, all cells valid); wall/collision coverage per exposed plan edge (labyrinthLayout test as template); save round-trip of plan + generation + pending chunks; migration from current save version; zone-wiring checklist for the interior door zone.

## Explicitly NOT this round

Eras 2–5, vertical stacking, module-slot variants, color variants, `ZONE_BOUNDS.landingSite` expansion, mechanical bonuses per generation, relocating the Recompile terminal. All are named in the two docs as later rounds.

Open questions are at the bottom of the addendum — make a reasonable call, log it in `Plans/DESIGN-DECISIONS.md`, and flag it in your wrap-up.
