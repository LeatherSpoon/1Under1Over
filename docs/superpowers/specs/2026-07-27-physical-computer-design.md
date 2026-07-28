# The Machine — the physical computer the game is about

**Date:** 2026-07-27 · **Status:** draft, awaiting owner review · **Owner directive:** "the biggest feature, the reason the game exists"

The player is creating a physical computer that they help learn, and which in turn improves their status. It is modular, built piece by piece, and grows from reasonably small to enormous over the whole game. This spec turns that directive — plus the owner's persistence note (`Plans/The computer is the persistence mechanism.txt`) — into a buildable design.

## 1. Decisions made in this brainstorm (owner-answered, 2026-07-27)

| Question | Decision |
|---|---|
| What drives growth? | **Full build loop** — every part is a component the player physically builds and installs; the machine is a first-class material/PP sink |
| What are parts? | **Chapter capstones** — each part crystallizes a chapter's field investigations + laboratory investigations; "represents what has been learned so far"; grants a significant improvement |
| Relation to the Chapter Chain? | **Install trails the spine** — chapters close on boss/warden exactly as today; a crossed chapter unlocks its part; the machine never gates progression |
| Final physical form? | **Enterable** — late generations open a doorway; the interior is its own zone that keeps growing |
| Build-loop approach? | **Field & lab findings** (approach 2) — chapter crossed + findings threshold + materials bill → staged physical build |
| Generation payoff? | **Capability + modest multiplier** — each generation unlocks one signature thing you can *do*, plus a boost; minor parts carry the pure-multiplier chain |
| Persistence tiers? | **Mechanical rebirth head-starts** — run-layer only; Recompile stays meaningful |
| Field data? | The player is **always inspecting** — ordinary participation is data collection; no survey chore. Specimens gathered in the field are studied in laboratory conditions at the machine |
| Server? | **Use Postgres wherever possible** — full DB integration ships with the system, not deferred |
| World presence? | Eastern meadow plot, Gen 0 near the dropship, growth extends east; generation leaps + endless minor modules; interior door at Gen 5 |
| Modularity? (post-review) | **Assigning which improvements land at which chapter is a data edit** — one declarative parts registry, keyed effects, named capability handlers; no engine changes to remap |

Standing constraints honored: flow-with-bottlenecks economy; no dodge mechanic; no calendar cadence; moveSpeed changes stay out (deferred to its own session); visuals authored in Blender; no real-money anything.

## 2. Fiction (from the persistence note)

The dropship's survivor builds a surface computer from salvage. The exo-suit is networked to it: every fall and every Recompile is the machine restoring the player from the most recent backup it was powerful enough to hold. Early generations barely store motor calibration; late generations hold full neural continuity. The machine also maintains the portal connections (zone reach) and runs the simulations the player fights as bosses. The player isn't just building a computer — they're building their own immortality engine, and its silhouette on the eastern skyline is a ledger of everything they have learned.

This spec ships the machine itself. Re-theming existing boss/portal copy to match the fiction is a listed follow-up (§10), not part of this build.

## 3. World presence

- **Plot:** eastern meadow belt of the Landing Site, centered near world (26, 0); the Gen 0 core stands at the plot's west edge ~20 units east of the dropship ramp. Growth extends **east**, away from the play field — the skyline rises over the eastern treeline as seen from spawn. Clear of the camp (9.4, 8.6), knoll (14, −24), and mountain (−11.4, −11.4); the forest scatter gets a plot keep-out like other landmarks.
- **Growth model:** a persistent core plus docked parts.
  - **Story-chapter parts (Gen 1–7 today)** are *generation leaps*: the core silhouette changes (GLB stage swap). Eight core stages including Gen 0.
  - **Warden-rung parts (minor, infinite)** are *expansion modules*: a small reusable library (rack, cooler, dish, conduit — 4–6 GLB variants) docking at seeded socket positions, so the machine keeps visibly growing forever past S7.
- **Interior:** the door opens at **Gen 5** via the door-zone pattern (`_addDoorway`, `NO_PP_GATE` exception). The interior is its own zone (HomeInteriors shell template) whose rooms extend with later parts; the Backup Vault room visualizes the current restore tiers.
- **Bounds:** Landing Site stays 80×80 until the footprint demands more; then one asymmetric `ZONE_BOUNDS` entry grows the zone east.
- **Sightlines:** the machine is tall and east of the play area; verify at implementation by raycast from `sceneManager.camera.position` (house rule) that it never hides the knoll approach or any prompt-bearing landmark.
- **Nav:** the plot registers an `env._addNavLandmark` chip ("The Machine") so it is findable from anywhere in the zone.

## 4. The loop

1. **Unlock.** Crossing chapter rung N (unchanged `ChapterSystem` semantics) unlocks part N's **dossier** at the machine console — a walk-up station panel (training-console pattern). The dossier shows field findings, lab findings, and the build bill.
2. **Field findings — accrue from ordinary play.** Computed live by a pure function over already-persisted state; never stored. Per chapter-zone: codex discoveries (creatures, lore, materials), roster first-kills, the boss clear, the zone visit. The player who played the chapter thoroughly arrives mostly complete — the machine was learning from them all along. The console also shows a lifetime "field data" odometer derived from `GameStatistics` (kills, gathers, steps) as ambient flavor — derived only, no new counters.
3. **Lab findings — analysis.** The dossier lists 2–4 **specimen analyses**: batches of that zone's existing gatherables/drops fed to the machine's **Analysis Bay** (built with Gen 0). Analyses are timed jobs on the processing-node convention — inputs consumed at enqueue, the queue is the stock, `simulateOffline` closed-form, runs offline when stocked. Each completion is a lab finding. No new material types are invented.
4. **Build stages.** With findings complete, the part builds in 3–5 stages. Each stage is a materials + PP bill weighted toward crafted intermediates (the factory feeds the machine), delivered by hand at the construction socket (`[E]`). Scaffold/partial geometry appears per stage — progress is visible mid-build.
5. **Install.** The final delivery is the beat: silhouette leap, toast, codex entry, and the part's grants land immediately.

Gen 0 is special: no chapter requirement, a small Landing-Site-materials bill, buildable in the first session. It teaches the loop and unlocks the console + Analysis Bay themselves.

## 5. Grants (draft numbers — tune at implementation; the *shape* is the spec)

Each generation grants: one **capability** (a thing you can now do), one **boost** (modest and permanent; multiplier-shaped boosts fold into the per-frame permanent-multiplier recompute block), and one **restore tier** (a run-layer head-start applied at Recompile — the machine restores more of you each generation).

| Gen | Part | Capability | Boost | Restore tier (run layer only) |
|---|---|---|---|---|
| 0 | Field Core | Machine console + Analysis Bay online | — | — |
| 1 | Calibration Bank | **Field Beacon** — place one beacon per zone; recall to it from that zone (uses `teleportTo`) | +15% gather speed | *Motor calibration:* post-Recompile base PP cap 150 → 225 |
| 2 | Fabrication Co-processor | **Schematic Printer** — crafting queue +1 slot; start/collect craft jobs from the machine console | +20% craft & process speed | *Built infrastructure:* keep 25% of Override Keys through Recompile |
| 3 | Portal Regression Engine | **Gate Recall** — fast-travel between already-visited world gates from the console | +1 compute unit | *Portal map:* ladder restarts at ⌊peak/5⌋ instead of 0 |
| 4 | Skill Lattice | **Second training program slot** (holodeck runs two programs) | +15% training & use-XP rates | *Skill memory:* momentum knee requirement −30 min |
| 5 | Stat Vault | **The door opens** — interior zone + Backup Vault | +20% damage | *Stat calibration:* runs start at momentum ×1.25 floor |
| 6 | Equipment Mirror | **Loadout snapshots** — save/one-click-restore equipment + modifier configurations | +12 h offline buffer, +20% drone efficiency | *Equipment configs:* Recompile grants an instant refill to 50% of the new cap |
| 7 | Continuity Core | **Continuity Restore** — one-click reapply of pre-rebirth compute allocation + modifiers + training config | ×1.5 global PP | *Neural continuity:* ladder floor ⌊peak/3⌋ and momentum knee halved |

**Minor parts** (one per warden rung, infinite): **Expansion Racks** — +4% each, additive into one named machine PP multiplier; bill: PP scales ×1.6 per part forever; each material line scales ×1.6 but clamps at `matCap` (60) so the infinite tail stays payable inside the 99-per-material bag stack. Optional texture (implementer's call): every 5th rack +1 analysis queue depth.

Guardrails: capabilities never touch moveSpeed (deferred topic) and never bypass boss/chapter gates (the machine trails the spine). Restore tiers touch only fields `recompileReset()` already clears — pinned by test.

## 6. Systems architecture

**Modularity contract (owner requirement).** All part content lives in ONE declarative registry, `MACHINE_PARTS`, defined in `server/definitions/systemsData.js` and imported client-side (the existing ProgressionDefinitions pattern — client already imports seed definitions from `server/definitions/`). One entry per part: `{ id, rung, name, tierName, capability, grants, restore, analyses, stageBills, glbKey }`. Effects are **keyed data, not code**: `grants` is a bag of known effect keys (`gatherMult`, `craftSpeedMult`, `damageMult`, `ppMult`, `computeUnits`, `offlineBufferH`, `droneMult`, `trainingMult`, …) folded by one generic loop into the per-frame recompute; `restore` is a bag of run-layer keys (`baseCapStart`, `keyKeepFrac`, `ladderFloorDiv`, `momentumKneeMinusMin`, `momentumFloor`, `ppRefillFrac`) consumed by one hook in the recompile path; `capability` is a string key into a capability-handler registry wired once in `main.js`. Reassigning an improvement to a different chapter, retuning a number, or adding a part for a future chapter is therefore an edit to one data file — the same file that seeds Postgres.

**New files**
- `js/systems/MachineSystem.js` — consumes the `MACHINE_PARTS` registry + owns mutable state (installed parts, stage progress, analysis queue/completions). API: `getDossier(n)`, `fieldFindings(n)` (pure over injected `codex`/`bosses`/`stats` refs), `enqueueAnalysis()`, `deliverStage()`, `install()`, `applyBonuses()`, `serialize()/deserialize()`, `simulateOffline(seconds)`.
- `js/scene/zones/LandingSite/machine.js` — single source of truth for plot geometry: per-generation GLB keys, minor-module socket layout (seeded), collision circles per generation, console + socket positions, nav landmark. Mirrored by the Blender build script (canopy.js discipline).
- `js/scene/zones/MachineInterior/index.js` — Gen 5+ door zone; rooms gated on installed parts; doorway `spawnOverride` returns to the machine's doorstep.
- `Assets/3D/Machine/` — `Machine.blend` (watched; one collection per stage GLB + module variants), `build_machine.py` bootstrap, Rodin where it fits, baked outline hulls per convention.

**Wiring (house patterns)**
- `main.js`: instantiate; inject system refs; `machine.onInstall` → apply grants, swap env stage, toast; grants folded into the existing per-frame permanent-multiplier recompute block; `AscensionSystem` reads `machine.restoreTiers()` inside its recompile path; console panel opens from the walk-up station.
- `Environment.js` / ZoneAssets: machine visuals derive from `machineSystem.installedParts` via a getter callback set in `main.js` (never import main.js). Stage swaps use the station-model late-attach pattern so mid-load installs never leave the machine invisible; pre-GLB fallback is a simple primitive stack.
- HUD: new `machine-panel` — full panel checklist (index.html, `_refreshMachinePanel()`, `_refreshPanel` case, `MENU_PANEL_IDS`, `_closeCommandPanels`); enforced by `panelWiring.test.js`. Walk-up only in v1; no menu-bar tab.
- Zone checklist for MachineInterior: all six steps + `NO_PP_GATE` exception; enforced by `zoneWiring.test.js`.
- `SaveSystem`: **v15** — destructure both sides, `serialize()`/`load()`, `applyBonuses()` called in `apply()` (the onPurchase-not-set-yet rule).
- `config.js`: `MACHINE` constants (minor-bill scaling, analysis durations, plot coordinates re-exported from machine.js only if needed).

**Postgres (owner mandate: use it wherever possible)** — the full six-step CLAUDE.md checklist ships with the feature:
1. Migration `server/db/migrations/003_machine.sql`: definitions table `machine_parts` (id, rung, name, tier_name, capability, grants jsonb, stage_bills jsonb, analyses jsonb); state tables `player_machine_parts` (player_id, part_id, stages_delivered, installed_at) and `player_machine_analyses` (player_id, part_id, analysis_id, status, completed_at).
2. Definitions in `server/definitions/systemsData.js` (`MACHINE_PARTS`), seeded by `server/db/seed.js`.
3. Repository methods in `progressionRepository.js` (read machine state, upsert part progress, record analysis).
4. Transaction types in `transactionService.js`: `machine.analysis.start`, `machine.analysis.complete`, `machine.stage.deliver`, `machine.install` — validation: known ids, stage order monotonic, no double-install.
5. `getBootstrap()` includes machine definitions + player machine state (parallel query list + return object).
6. `MachineSystem` calls `syncClient.recordTransaction()` on every state change.
The save blob (cloud snapshots) carries the same state via SaveSystem v15, as for every system; Postgres transactions are the authoritative ledger per the existing local-first sync model.

## 7. Asset plan

- One watched `Machine.blend`; collections per export: `Machine_Gen0` … `Machine_Gen7`, `Machine_ModRack`, `Machine_ModCooler`, `Machine_ModDish`, `Machine_ModConduit`, plus per-stage scaffold pieces if stage visuals need them (implementer may reuse one generic scaffold GLB).
- Toon-shaded in the teal energy family (the machine maintains the portals — same energy), gray-steel body palette distinct from the dropship's; baked `*_OutlineHull` shells (smooth-cage/envelope recipes); sRGB→linear conversion on node colors per the Blender gotcha.
- Scale targets (native, true world scale, export-normalized): Gen 0 ≈ 1.5 u tall → Gen 7 ≈ 11–12 u, footprint growing east to roughly 20×14 u before minors widen it.
- Interior shell reuses the HomeInteriors discipline: tall far-wall arc, low camera-side rim, mine-lantern-scale point lights.

## 8. Testing

- `tests/systems/machineSystem.test.js`:
  - every chapter rung 1..13 (and the minor-part generator) has a dossier; every analysis specimen and bill row is a known inventory material (DROP_TABLES discipline);
  - **registry validation:** every part's `grants`/`restore` keys belong to the known effect-key sets and every `capability` names a registered handler — a typo'd data edit fails CI naming the bad key;
  - `fieldFindings()` against mocked codex/boss/stats state;
  - serialize → load → `applyBonuses()` idempotence;
  - restore tiers touch only run-layer fields (pin: permanent-layer fields unchanged across a simulated Recompile);
  - minor-part scaling formula; `simulateOffline` closed form.
- `zoneWiring.test.js` / `panelWiring.test.js` enforce their checklists automatically.
- Server: transaction validation tests alongside existing transactionService coverage if present; otherwise validation asserted via repository round-trip in the existing server test pattern.
- Live verification per house practice: headless-rig captures of Gen 0 build, a stage delivery, an install swap, the Gen 5 door, and a raycast sightline sweep.

## 9. Build order

1. **MachineSystem + tests, headless** — dossiers Gen 0–2 + minor formula; save v15; no visuals.
2. **Plot + console + Gen 0–2 live** — machine.js geometry, panel, install flow, station-swap visuals, nav chip.
3. **Postgres integration** — migration, seed, repository, transaction types, bootstrap, client sync.
4. **Gen 3–7 definitions + capabilities + restore tiers** — AscensionSystem hook; capability wiring (beacon, schematic printer, gate recall, training slot, snapshots, continuity restore).
5. **Interior zone** (Gen 5 door) + Backup Vault.
6. **Asset completion + balance pass** — all stage GLBs, module library, numbers tuned, STATUS.md/CLAUDE.md updates.

Each phase lands green (`npm test`) and playable before the next starts.

## 10. Out of scope / follow-up hooks

- Re-theming existing boss/portal/recompile copy to the machine fiction (boss-as-simulation, portals-as-reach) — natural next content pass.
- An `analysis` destination on the Compute board (v1 analyses are ungated; adding the destination is a clean later step).
- Machine-driven story beats (the machine "speaking" as it grows; Al's relationship to it).
- The moveSpeed soft cap session (unrelated, standing deferral).
