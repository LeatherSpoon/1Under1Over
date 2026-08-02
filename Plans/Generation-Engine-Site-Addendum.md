# Generation Engine — Site & Building Addendum (v3)

**Date:** 2026-08-02 · **Status:** contribution for owner review · **Companion to:** `20260801generationenginedesign.md` (the approved Generation Engine design). Where this addendum contradicts that doc, the owner calls below win; everything else in the original stands. v2 cut the survey-plot and umbilical-conduit ideas (owner veto) in favor of player-built construction. **v3 cuts the fixed build plot (owner veto): the player chooses where the building stands and what its layout looks like.**

**The owner calls this addendum implements (2026-08-02):**

1. **This is an expedition, not a hobby.** The character flew to another planet *to build this computer*. No salvaged-beige-PC hobbyist flavor anywhere in the arc.
2. **The building houses the computer from generation 1, is walk-in from generation 1, starts mostly empty, fills as the machine grows, and grows into a bigger building when full.**
3. **The worlds provide.** Materials gathered across the zones are processed into computer components; the machine is literally built out of the worlds it connects to.
4. **The player builds the building — with freedom, including where it stands and what the layout looks like.** No pre-placed plot, no designated site, no scripted structure: construction uses the speed-track placement feature (Pedometer [T]/[G] grid placement), scaled up. One building chunk is a **3×3** block. The only constraints are the chunk budget and the cells already occupied by the world (ship, pad, camp, mountain, and so on).

---

## 1. Fiction pass — mission-grade from the first frame

The original Era 1 beats ("salvaged beige PC on a crate → dual-tower cable tangle") read as a garage hobbyist. Replace the register, keep the silhouettes:

| Gen | Old beat | Mission-grade beat |
|---|---|---|
| 1 | salvaged beige PC on a crate | **flight-cased field terminal** on deployment legs — stenciled expedition cases in the Starwing's livery palette, still half-unpacked |
| 2 | dual-tower cable tangle | **twin mission servers** + cable spools and a power-conditioning case — deliberate wiring, labeled runs, not tangle |
| 3 | open-frame workbench rig | **open-frame integration bench** — the first *planet-built* components slot in beside the shipped hardware |
| 4 | full-height server pillar | **full-height expedition rack** — the shipped kit is now the minority of the machine |

Two rules carry this register through all 24 generations:

- **Ship-livery continuity (Era 1):** the earliest hardware shares the Starwing's material palette and crate stenciling — one look says *this came off that ship*. From Era 2 on, the shipped-hardware fraction visibly shrinks each generation.
- **Provenance materials ("the worlds provide"):** each era's new mass is visibly made of the zones the player was farming during that band. The schematic checklist already consumes zone materials — the *building should show it*. Suggested provenance keying (tune to actual material tiers at build time): Era 1 = ship stock; Era 2 = Landing Site ores + Mine alloys; Era 3 = Verdant Maw resins/growth-composite panels; Era 4 = Tundra/Cinderforge — coolant-blue ice-cooled cores and forge-black alloy plate; Era 5 = Atlantis/Gate-tech — the machine starts looking like Ancient World Gate material because that's what's feeding it. This costs nothing extra (the kits need per-era palettes anyway) and turns the material economy into visible biography.

The persistence fiction (`Plans/The computer is the persistence mechanism.txt`) gets stronger under this framing: the expedition's purpose *is* the immortality engine, and every zone the portals reach becomes raw material for the machine that reaches further.

## 2. Player-built construction — the chunk grammar

**Supersedes** v1's fixed shells and the original doc's "first walk-in at Era 3." The building exists, is player-shaped, and is enterable from the first chunk with a door.

### The chunk

- **One chunk = 3×3 speed-track cells = 6×6 world units**, snapped to the same 2-unit grid the tracks use (`Math.round(p/2)*2`). One shared grid means tracks, chunks, and any future placeable all align — and the placement code, the pending-pool pattern, the per-zone persistence, and the [T]/[G] interaction grammar are already written and already serialized (PedometerSystem is the reference implementation).
- A chunk is a **floor-plan claim**, not a finished box: the player lays out the footprint chunk by chunk; the era kit *skins the plan* — perimeter walls auto-run along the plan's outer edges, floor and roof generate over the claimed cells, module slots (crown/facade/cooling/glow) attach to the generated shell. This is the Mine/Labyrinth grammar reused: **a cell map generating wall runs, collision chains, and a flood-fill validity test is the single most proven pattern in this codebase.** The player's plan is just a cell map the player edits in-world.
- **Vertical growth = stacking:** placing a chunk on top of an existing chunk raises that 6×6 column one story. Story height scales with era (≈3 → 4.5 → 6 units), so late towers climb fast without inflating chunk counts. (Scope call: stacking can ship in the Era-3+ round; Eras 1–2 are single-story regardless.)
- **Placement rules (all testable with existing grammar):** chunks go on any valid cell (§3); after the first chunk, new ground chunks must share an edge with the plan (one connected building, no scattered sheds); a stacked chunk needs support below; at least one exterior wall carries the door (player picks which edge — the door is a placement choice, not a fixed coordinate). A flood-fill test asserts the plan is connected and the door is reachable from open ground — `labyrinthLayout.test.js` is the template.

### Era = kit + budget. Generation = fill.

- Evolving the machine (the schematic quest, unchanged from the original doc) grants **pending chunks** to the pool — placement freedom every generation, not just at era boundaries. Era boundaries additionally upgrade the **kit** (taller walls, new provenance palette, new module slots) and re-skin the standing plan in place: nothing the player laid out is ever discarded, it gets re-clad. RS-no-reset, expressed architecturally.
- **Interior fill is the machine, not the building:** inside the player's plan, the computer itself (desk → racks → cores, from the generation data table) occupies floor area per generation — ~15% → 40% → 70% → 95% across an era's gens. "Full" is the diegetic eligibility signal: when racks crowd the walls, the building is telling you what the panel says numerically — *grow the plan*. Interior is one HomeInteriors-template door zone whose room dimensions derive from the player's plan and whose prop set derives from the generation table; the same kit pieces dress interior and exterior (no second art set).
- **Exterior tells:** windows light up as generations land inside; vents/condensers accrete per gen; first exterior glow lines still debut at Gen 8 per the original table. Delivered checklist materials stack as pallets by the door (grows as the checklist fills, consumed on evolve) — the Terraria-altar delivery made visible at ortho distance.
- **The evolution beat:** on evolve, existing drone assets swarm the site, dust/flash, the new cladding stands — "Al assembled it while you watched" is on-fiction and costs no bespoke rig.

## 3. The site — the player's choice

**Superseded (owner, 2026-08-02): there is no designated site and no build plot.** The player founds the building wherever they want in the Landing Site by placing the first chunk; everything after that grows by adjacency (§2). The building stands wherever they chose, forever — "grows in place" still holds, it's just *their* place.

- **Valid cells instead of a plot:** a chunk can land on any grid cell that isn't already spoken for — the ship's footprint, the landing pad, the survivor camp, the mountain/adit approach, the boss arena, the knoll, existing enemy posts and resource nodes, and the zone-edge margin are all excluded. This is the same keep-out data the tree scatter and track placement already respect; nothing relocates and nothing is reserved. The world as it exists is the constraint, and the rest of the meadow is theirs.
- **East is a suggestion, not a rule:** compositionally, the strip east of the Starwing is still the sweet spot — the mountain anchors the west of the frame, a tower in the east brackets the meadow, and the ship's nose happens to point right at it. Worth a gentle nudge (a Mara or Finch line, or Al musing about "good ground east of the ship"), never an enforcement.
- **Path and nav follow the door:** the nav landmark ('Computer') tracks the plan's door cell, and a worn path ribbon from the landing pad regenerates to the door whenever the door moves (the pad→adit ribbon builder, re-aimed). The world adapts to where they built, not the other way around.
- **Zone bounds:** the 80×80 meadow already fits the completed footprint in several spots. If late-era mass wants more breathing room, the Era-4 `ZONE_BOUNDS.landingSite` expansion is still available as *extra meadow* (Verdant Maw precedent) — but it's no longer load-bearing.
- **Collision** comes from the plan's generated wall runs, not hand-authored circles; the plan's cells join the scatter keep-outs so trees and ground cover clear out around whatever shape the player draws.

## 4. How large is a completed building?

Sizing from the original doc's era scale table (Era 5 = 20–34 units), the meadow's real geometry, and the ortho rule (base interactive at y≈0, upper mass reads as backdrop).

**Recommendation: a completed (gen-24) building of about 5×4 chunks — 30×24 world units on the ground — with core columns stacked to ~30–34 units tall.** For scale: footprint slightly longer than the Starwing (26 units nose to tail) — a genuine second landmark, not a prop. This is a *budget*, not a blueprint: it's the total extent the chunk grants add up to, and the player arranges it however they like, wherever they founded it.

| Era | Plan budget (cumulative) | Footprint if packed | Height | Sanity vs original scale table |
|---|---|---|---|---|
| 1 | 2 chunks | 12×6 | ~3 (one story) | shelter housing desk clutter ✓ (0.5–1.5 machine inside a 6-unit room) |
| 2 | 4 chunks | 12×12 | ~4 | rack hall ✓ (2–3.5) |
| 3 | 6–8 chunks | 18×12 | ~8 (two stories) | low structure ✓ (4–8) |
| 4 | 9–12 ground + first stacks | 18×18 | 14–18 at the core | vertical mass ✓ (10–18) |
| 5 | 20 ground + stacks | 30×24 | 30–34 at the core | megastructure ✓ (20–34) |

- Budget pacing: ~1 chunk per generation with 2-chunk grants at era boundaries lands near 20 ground chunks + 10–15 stack chunks across 24 generations — every evolution includes a placement moment.
- "If packed" is illustrative only — the player may build an L, a courtyard, a long hall. The budget bounds the *extent*; the shape and the location are theirs. The flood-fill test only enforces connected + door-reachable.
- Footprint is softer than height: the interior is a door zone and can be roomier than the exterior implies (standard RPG-house liberty), so the building never *needs* to grow for space reasons — growth is paced for drama. The ~30-unit endgame height is the money shot; hold that line.

## 5. Coding-prompt success kit

What the asset/coding session needs stated up front:

1. **One data table is the single source of truth.** A module exporting per-generation rows: `{ gen, era, chunkGrant, interiorSet, fillFraction, storyHeight, kitSet, slotVariants, exteriorTells, provenancePalette }` — plus the serialized player plan (cell map). Zone builder, wall generation, collision, interior dressing, door record, nav landmark, and ComputerSystem all read table + plan. No coordinate in two files.
2. **Reuse, don't invent:** placement = PedometerSystem's pending-pool/[T]/[G]/per-zone-persistence pattern, on the same 2-unit grid; shell generation = the Mine/Labyrinth cell-map → wall-run/collision/flood-fill grammar; interior = HomeInteriors door-zone template; delivery checklist = Training-console recipe pattern; evolution eligibility = `ascension.prestigeCount`. The prompt should name each donor system explicitly.
3. **Kit conventions (MineKit pattern):** one `.blend` per era in `Assets/3D/ComputerKit/` with embedded export scripts → GLBs in `models/`. Kit pieces are **chunk-grammar pieces** — wall segments sized to close 6-unit runs (state the join math like Lab_WallStraight's ×1.13 rule), corner pieces, roof tiles, door frame, window variants, module-slot attachments — not whole-building shells. Local convention: origin at piece base center, faces +z; rotations derive from the plan.
4. **Envelope discipline per piece:** each kit piece's bounding box asserted in the export script; story heights stated numerically per era so stacked silhouettes stay inside the era's scale band.
5. **Judge at the real pitch:** export scripts include a 46° ortho render preset — assembled test-plan silhouette, west-face readability, glow pass — before GLB export. The tree-saga lesson, applied preemptively.
6. **Tool split + outline rules:** walls/racks/cases are procedural Blender (never Rodin for hard-surface boxes); sculptural Era 4–5 crown/module pieces may go through Rodin **and therefore need envelope hulls** (`hull_envelope.py` precedent). Hard-surface kit pieces: `noOutline` like the Starwing, or clean runtime outlines — decide once, in the prompt.
7. **Material naming contract:** tint-friendly names for the runtime re-shade (case tint + accent glow per the color-variation requirement); glow materials follow the `/glow/` naming rule; Era 1 = Starwing livery palette; Eras 2–5 = provenance palettes (§1).
8. **Runtime/system wiring:** `ComputerSystem` serializes `{ generation, plan, slotChoices, colorId }` (SaveSystem convention, save-version bump + migration + tests); schematic checklist and evolution trigger per the original doc; evolution locks slot variants until next evolution.
9. **Perf envelope:** phone is a supported target. Generated walls merge into per-run meshes (Mine convention); per-era poly budget stated in the prompt; Era 5's animated energy spine is one shader-driven material, zero per-frame CPU. Plan edits regenerate the shell mesh once per edit, never per frame.
10. **Placement checklist for the zone commit:** valid-cell mask built from the existing keep-out data (ship, pad, camp, mountain, arena, knoll, posts, nodes, edge margin), path ribbon that re-aims to the door on plan change, door record (`walkIn`, tracks the plan), nav landmark, pallet-stack intake prop, plan cells joining the scatter keep-outs, and — only if late-era mass wants room — the optional `ZONE_BOUNDS.landingSite` entry.
11. **Tests to demand by name:** plan flood-fill (connected, door reachable, inside plot), wall/collision coverage per exposed plan edge (labyrinth test template), save round-trip of plan + generation, and the zone-wiring checklist (`zoneWiring.test.js`) for the interior door zone.

## 6. Open questions for the owner (small)

- **Stacking scope:** ship vertical stacking with Era 3 (two-story) or hold it until Era 4? (Recommendation: Era 3 — two stories is the cheapest possible proof of the stacking rules before the tower era leans on them.)
- **Chunk grid confirm:** chunk = 3×3 *track cells* (6×6 world units, shared snap grid) is the assumption throughout — confirm, or if 3×3 *world units* was meant, the grid needs a 1-unit snap and the size table halves.
- **Interior floor count at Era 4–5:** one core-shaft gallery room, or does the "reasons to venture inside" future hook start claiming the player's upper stories? (This round: one room; carry a `floors` field in the table so the answer is a data change.)
- **Reclaim rule:** can the player un-place a chunk ([G]-style) once the machine occupies it, or only empty chunks? (Recommendation: empty chunks only — the machine never shrinks.)
