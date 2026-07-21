# Processing Power — Systems Inventory & Gap Map (Phase 1)

*Written 2026-07-19 by code-level analysis (four parallel read passes over `js/`, `server/`, and specs). Companion to the six design references in `Plans/`. Supersedes the older `Plans/game_analysis.md`. Judgment-neutral: this records what is built and how it behaves, including partially-wired and dead paths, without recommendations. Interview decisions land in `Plans/DESIGN-DECISIONS.md`; synthesis comes after.*

---

## 0. The game at a glance

Browser 3D idle RPG, Three.js orthographic toon-shaded, ES6 modules, no build step. A cyborg explores 8 zones (Landing Site, Mine, Depths, Verdant Maw, Lagoon Coast, Frozen Tundra, Spaceship, Workspace), gathers/crafts/fights, while **PP (Processing Power)** accrues toward a cap. Optional Node/Postgres server for save sync; game is fully playable client-only.

**Owner-declared identity:** *"not 100% idle — a busy game that rewards strategic systems set in motion before logging off."* The code agrees: walking mints PP, there is **no passive energy regen**, live sessions earn a momentum multiplier that offline never gets.

**Currencies:** PP (core, capped), steps (second wallet: zone unlocks, stat levels, track placement), Quantum Crystals (premium-style drip: time-skips only, never power), Ascension Points (prestige-2 shop), ~47 material keys, and stat levels themselves.

**Scale today:** the entire economy spans ~1 → ~10⁵ PP. Measured completionist sustained rate ≈ 11 PP/s (charitable sim, 2026-07-18). Display formatting supports up to ~10³³ (`NumberFormat.js` suffix `Dc`), so the presentation layer has ~28 orders of magnitude of unused headroom.

**Save:** `SAVE_VERSION 9`, tolerant (guard-based, not strict-migration) loader. Cloud autosave every 60 s, newest 20 snapshots kept.

---

## 1. The core engine: PP, energy, offload, ascension

### PP accrual & cap (`js/systems/PPSystem.js`)
- Rate: `effectiveRate = ppRate × globalMultiplier` where `ppRate = 1.0 base + Σ named additive modifiers` (keys: `tripartite_power`, `bossTrophies`, `mod_overclock`, `mod_frugal`, `mod_minimalist`, temp boosts). Only whole PP banks: `ppTotal = min(ppCap, ppTotal + floor(accrued))` (PPSystem.js:69-77).
- Cap: `ppCap = _baseCap × Π capMultipliers` (keys: `tripartite_capacity`, `bossTrophies`, `challenges`). Base cap starts **150** (`INITIAL_PP_CAP`).
- `globalMultiplier` is recomputed **every frame** in main.js:1492-1496:
  ```js
  ppSystem.globalMultiplier   = ascension.ppMultiplier * challenges.ppRateMult;
  combatSystem.permDamageMult = bossSystem.damageMult * challenges.damageMult;
  expedition.damageMult       = combatSystem.damageMult * combatSystem.permDamageMult;
  ```
- **Everything clamps at cap**: passive accrual, step PP, offline PP, quest rewards, expedition rewards. Kill PP, TimeWarp grants, consumable PP, and minigame payouts add **unclamped** but get clamped back down by the next whole-PP passive tick (~1 s later) — over-cap income is effectively destroyed. (Known, documented, **on hold** per owner decision 2026-07-18.)

### Offload — prestige layer 1 (`PPSystem.offload`)
- `capGain = floor(√(pp) × 4 × tripartiteRateMult × fill)`, `fill = min(1, pp/ppCap)` — the fill factor makes partial offloads strictly worse than full-cap offloads. Resets `ppTotal` to 0, `prestigeCount++`, adds `capGain` to `_baseCap`.
- At starting cap 150: full offload → +48 cap. Relative return shrinks as `4/√pp`.
- `prestigeCount` is the **content key**: it gates most tabs (see §10).

### Ascension — prestige layer 2 (`js/systems/AscensionSystem.js`)
- Trigger: `ppCap ≥ 150 × 3^ascensionCount` (450, 1 350, 4 050, …). Resets `ppTotal` to 0 and base cap to 150; **nothing else resets** (stats, inventory, tech, zones persist).
- AP award: `floor(√(prevCap/threshold) × 3) + 1` — 4 AP at-threshold, 7 AP at 4× overshoot.
- AP shop: PP Amplifier +0.25×/buy (**live**), Combat +0.20×, Gather +0.25×, Drone +0.30× (**all three dead — never read by any consumer**). Repeat-buy cost `1 + floor(n(n+1)/2)` = 1, 2, 4, 7, 11…
- Each ascension: +2 Quantum Crystals. Measured wall: knees at ascension 5-6 (2.6 h → 13 h → 70 h per level at constant 4 AP).

### Energy (main.js + config)
- Pool `100 + constitution×5 + energyCap×10 + aug`. **No passive regen** (`ENERGY_REGEN_RATE 2` exists in config; `StatsSystem.regenEnergy()` is never called — dead code). Restore via consumables or Charging Station (full HP+energy).
- Costs through `_energyCost(base) = max(1, round((base − energyEfficiency?1:0) × modifiers.energyCostMult))` (main.js:752-756): gather 8, tree 12, rock 15 (mine rocks 3–25 by tier), plant 5.

### Step economy (`js/systems/PedometerSystem.js`)
- 1 step per 0.5 world units; steps mint `0.25 PP` each, cap-clamped. At base speed that is **1.75 PP/s while walking vs 1.0 idle** — movement outearns idling early.
- Steps also spend on: zone unlocks (Verdant Maw 2 000 / Tundra 8 000 / Lagoon 15 000 — note Tundra is cheaper in steps than Lagoon despite the higher PP gate), stat levels (`200·n·1.08^(n−1)` shared counter, bypasses PP), track placement (100 flat; tracks give +0.3 speed within 1.0 units), and a PP-per-step upgrade (`50·n·1.08^(n−1)`) that is **display-only — the grant path never reads it**.

---

## 2. Tripartite allocation (`js/systems/TripartiteSystem.js`)

The NGU Energy/Magic analog as-built: a **non-consumptive passive flow** (PP never drained) split by three sliders.

- Flow: `0.5 units/s × sessionMomentum`, where `sessionMomentum = min(4, 1 + sessionHours × 0.5)` — ×4 after 6 h of continuous session; resets every boot; **never applies offline**. Zone presence bonus ×1.5 to one leg per zone (landingSite→power, mine→rate, verdantMaw→capacity).
- Bonus curve per leg (decided 2026-07-18): `bonus = invested^0.35 × scale` — capacity `×(1+inv^0.35×0.027)` cap multiplier; power `+inv^0.35×0.034` PP/s flat; rate `×(1+inv^0.35×0.041)` offload multiplier. 10× investment ≈ ×2.24 bonus.
- Anchors: 1 h online even-split ≈ capacity ×1.25 / power +0.32 PP/s / rate ×1.39. 24 h offline (flat 50%, no momentum) ≈ ×1.60 / +0.76 / ×1.92.
- `powerBonus` doubles as the training-area multiplier (`main.js:138`) — the first realization of "power = sink-effectiveness."

---

## 3. Stats & the shared cost curve (`js/systems/StatsSystem.js`)

14 stats: strength, health, defense, constitution, dexterity, agility, perception, focusRate, focus, crafting, craftingSpeed, speed, energyCap, gatherSpeed.

- **The one shared curve:** `cost(L) = ceil(15 × L × 1.08^(L−1))` PP — L2 = 15, L10 = 300, L25 = 2 378, L50 = 32 571. The same curve prices implant training, holodeck training banks, combat-sim XP, and (at base 200) pedometer stat buys. This is the closest thing the game has to RuneScape's "one XP curve everywhere."
- Derived: `maxHP = 50 + health×10`; `maxFP = 100 + focus×50`; `fpRate = 5 + focusRate×2`; `maxEnergy = 100 + constitution×5 + energyCap×10`; `moveSpeed = 3.5 + speed×0.15 + trackBonus`; `gatherSpeedMult = 1 + (gatherSpeed−1)×0.08`; `damage = strength×2`; `defense = level`; incoming damage `max(1, amount − floor(defense×0.5))`. All plus augment flats.
- **Stats with no derived value anywhere:** dexterity (trained by a holodeck program, feeds nothing), perception, crafting (only `minCraftingLevel` recipe gates read it indirectly).
- Stat levels are also mutated directly by equipment (equip = +levels), augments, tech nodes (+5 STR/DEF chips), factory module buffs, and training de-levels — raw stat levels are the game's de-facto accumulator.

---

## 4. Gathering & world interaction

### Resource nodes (`js/entities/ResourceNode.js`)
- 2.0 s gather ÷ `gatherSpeedMult` only (tech `swiftHarvest` and the Harvest Focus modifier apply to *trees* but **not** this path), energy 8, yield `1 + (materialFocus?1:0)`, respawn 30 s, every node single-richness. Tool-gated tiers: harvestBlade → resin/silica/quartz/carbon_biomass; diveTool → silica/quartz; cryoPick → titanium/tungsten.

### Trees & rocks (main.js)
- Trees: Terrain Cutter required (the only durable tool: 50 uses, repair 1 iron+1 resin), 12 energy, `2.5 s × (swiftHarvest?0.8) ÷ (gatherSpeedMult × gatherMult)`, 1-2 timber + 1 seed. A non-destructive `timber_harvest` path exists but is **unreachable** (nothing sets it).
- Surface boulders: rockDrill tool, 15 energy, 3.0 s. Mine rocks: **no tool required** (asymmetry flagged in the roadmap's consistency audit), tier props energy 3-25 / 1.4-9.0 s.

### The Mine delve loop (`Mine/generator.js`, `MineDelveSystem.js`)
- Seeded 25×25 dig-anywhere cave, re-rolled per delve (surface→descend re-rolls; Mine⇄Depths keeps it). 3-5 random walkers, 12-35 steps each; every void cell adjacent to floor becomes ore at **P = 0.28**; depth bands: rows ≤7 copper, 8-10 iron, 11-13 carbon, 14-17 quartz, ≥18 gold.
- Ore rocks 3 hits; per-hit ore roll `chance × [0.4, 0.7, 1.0][stage] × (deepVeins?1.5)` with chance .15-.35 by tier; **pity: a vein that never rolled ore force-drops 1 on depletion** — the game's only pity mechanic. 15% side-chance of ferrous_ore per mine block.

### Deep Core Drill (`js/systems/DrillSystem.js`)
- Clicker at the Mine drill rig: damage/click `5×level + 0.2×strength`; stratum HP `100 × 1.4^(n−1)`; break pays `PP 50 × 1.2^n` + gold/quartz trickle. Upgrades cost materials `×1.5-1.8^level`. HP grows geometrically vs linear click damage — a built-in wall.

---

## 5. Production: two refining chains, assembly, extractors, drones

### Chain A — Processing Nodes (`ProcessingNodeSystem.js`, Refinery)
8 fixed converters, queue 5/node, inputs eaten on enqueue. `duration = base / 2^(tier−1)`, tier ≤ 4; tier upgrades are the game's **largest one-time PP sink ladder: ~126 000 PP total** (500→24 000 per step per node). Chain: iron → iron_dust → alloy_bar → {metal_strut → micro_fastener | hull_plating → data_cable}; copper+iron → alloy_bar; alloy_bar → iron_dust (recycle).

### Chain B — Factory (`FactorySystem.js`)
Three machines (Arc Smelter 2 s, Constructor 5 s, Adv. Fabricator 10 s per item at count 1): ferrous_ore/silica_sand/carbon_biomass → steel_ingot/silicon_wafer/synthetic_resin → logic_processor/mechanical_servo/energy_capacitor → three **modules** (quantum_processor_ring, exo_servo_harness, aegis_capacitor_bank; 10+5 components each). Manual-click or automate (100 PP flat; count upgrade `100×2^n`). First-ever module build grants one-time buffs (+15 speed levels / +10 health +5 energyCap; the ring's ×1.20 globalMultiplier is **overwritten the next frame** by the main-loop recompute — inert in practice).
- **As-built vs decided direction:** machines pull from shared inventory and run **online only** (halt at 100% when starved, resume on restock; absent from OfflineSystem). The decided direction (2026-07-18) is TPT2-style: *stock the machine, it runs until materials run out, online AND offline.* Neither stocking nor offline exists yet.

### Assembly Matrix (`AssemblySystem.js`)
5×5 spatial schematic grid, instant on match: extractor_unit, extractor_unit_adv (→ install into ExtractorSystem, closing a positive automation loop), circuit_board and hull_segment (**terminal items — no downstream consumer**).

### Extractors (`ExtractorSystem.js`)
6 slots; basic unit ≈ 108 copper + 72 iron + 72 stone/hr; advanced adds carbon/quartz at ~2×. No upgrade curve — scaling = more/better units. `applyOfflineTime()` exists but is **never called** — extractors produce nothing offline. All output clips at the 99 stack cap.

### Drones (`DroneSystem.js`)
Up to 5; passive assigned-material gather (1 unit per `30/(eff × effMult)` s) or timed zone missions (120-360 s loot bundles). Drone cost 50 PP ×2.5 each; efficiency `30 × 1.8^(L−1)` PP. Offline: passive path runs at **full** efficiency (no 50% haircut) via drone-cycle math; missions freeze but resume.

### Inventory substrate (`InventorySystem.js`)
Flat bags, **99 per material stack** — a hard wall all passive production silently discards against. 47 material keys, consumables (heals/energy/PP), boolean tools except the durable Terrain Cutter, storage overflow grid (needs storageContainer), unbounded equipment bag.

---

## 6. Crafting, mastery, tech, augments, equipment

- **Crafting (`CraftingSystem.js`):** single active + queue 5, materials eaten on queue entry. Craft time `base / (1 + craftingSpeed.level × 0.2)`. Runtime recipes come from `server/definitions/seedData.js` — **17 recipes** (consumables, tools, 4 Basic equipment). The in-file 24-recipe fallback (all the enemy-drop gear: spikeKnuckles, heavyPlateArmor, pulseModule…) is **dead — never reachable**. Craft state is **not serialized**: reload loses active craft + queue, materials already spent. `requiredTechNode` on recipes is carried but **enforced nowhere**.
- **Crafting Mastery (`CraftingMasterySystem.js`):** +25 XP/craft, 4 tracks, level = `1+floor(xp/100-140)`. The −4%/level craft-time bonus (cap −20%) is **display-only — `_calcCraftTime` never reads it**.
- **Tech tree (`TechTreeSystem.js` + seedData):** 11 one-time nodes, three cost currencies (PP/steps/materials), whole tree ≈ 850 PP + 1 000 steps + 21 mats. Effects are inline at use sites. **3 nodes are inert** (droneLogistics, terrainControl, biomeAccess — purchasable, no implementation).
- **Augmentations (`AugmentationSystem.js`):** 8 one-time PP purchases totalling 6 100 PP (flat HP/DEF/speed/energy/damage/craft-speed + gather-QoL).
- **Equipment (`EquipmentSystem.js`):** 9 slots; equipping adds `floor(statBonus × tierMult)` directly to raw stat levels. Tier multipliers Basic 1.0 / Good 1.5 / Rare 2.0 / Epic 3.0 are **defined but unused — only 4 Basic craftable items + the starter blade exist in data**. No drop gear at all; head/legs/deploy1/deploy2/consumable slots have no items in the game.

---

## 7. Combat

### Field combat (`CombatSystem.js`)
Real-time: enemy attacks on `setTimeout` at `attackInterval`; player acts freely, **no cooldown** (mash-friendly). 1.5 s opening grace. Player hit `floor(strength×2 × modifierMult × permMult)` → enemy dodge check → `− armor, min 1`. Skills: jab 20 FP ×2 → ionBeam 500 FP ×7 (+ scan). FP accrues only in combat (`5 + focusRate×2` per s), resets to 0 after. Enemy patterns: melee / windup (telegraph at 67%) / burst (N hits 150 ms apart). Status effects 30%/hit: burn, poison, shock; **corrosion's defenseReduction is never read — mechanically inert**. DoTs floor at 1 HP (can't kill). Flee `0.5 + (agility−1)×0.05`. Loss: free rescue (full heal, teleport to Landing Site) — **death costs time only, never resources** (Crashlands-aligned as-built).
- Kill PP: **flat per archetype, 45→2 000, added unclamped then clamped next tick** (on-hold issue). Drop tables: flat independent % per archetype (55% ferrous_ore etc.); **dunkraza is the one archetype with no drop table**; bosses drop fixed bundles at 100%.

### Roster (`Enemy.js ARCHETYPE_CONFIG`)
6 creatures (serpendrill 70 HP → cavecrab 280 HP; mechanics: armor, dodge, fpDrain, rageRamp, statusEffect, burst) + 6 zone bosses (250 → 1 200 HP, all `phase2 at 50%`: interval/damage/dodge/regen rewrites). Threat-tint ring computed from `surviveTime/killTime` ratio every 0.5 s.

### Bosses as meta (`BossSystem.js`)
One per zone, never respawn. Trophies: +0.5 PP/s, ×1.10 cap, ×1.10 dmg, +1.5 PP/s, ×1.15 cap, ×1.25 dmg (max product ×1.375 dmg). Clearance = alternate portal unlock. Total one-time kill PP: 4 950.

### Expedition — the idle combat pump (`ExpeditionSystem.js`)
Deterministic: `killRate = playerDPS / tierHP` with `playerDPS = damage × damageMult / 0.8`; stalled if `maxHP + defense×10 < threat×5`. **7 fixed tiers** (HP 30 → 20 000, PP/kill 6 → 2 200 clamped at cap); 50 kills → warden (10× PP bonus) → next tier. Ends at tier 6 — **the ladder has a top today**. Offline at 50% incl. drops.

### Challenges (`ChallengeSystem.js`)
6 one-shot constrained runs (TRIALS, gated prestige ≥ 3): e.g. offload 200 PP with zero stat upgrades → ×1.05 PP rate; 100 expedition kills → ×1.15 damage. All-complete totals: rate ×1.1025, cap ×1.155, damage ×1.265. One active at a time; each completes once — **a finite system**.

### Training quartet
- **NeuralImplant** (prestige ≥ 1): siphons `25% × effectiveRate` PP/s from the pool into one stat's XP bank; auto-levels on the shared curve; offline 50% time-based without pool drain.
- **CombatSim** sparring rig: 0.3 XP/s each into STR+DEF while toggled (toggle only reachable in Spaceship; keeps training in every zone once on). No offline.
- **TrainingArea** holodeck (v1 shipped 2026-07-19): program at console, stand in chamber; `0.5 XP/s × (1 + 0.25×(programLv−1)) × (1 + tripartite powerBonus)`. Advanced programs train two stats ×2 while **de-leveling** a third (real NGU-style cost, refunds cost per lost level, floor Lv 1). Program upgrades are material recipes reaching into both production chains (steel_ingot → exo_servo_harness). Offline 50% if left standing in chamber.
- **AutoCombatSystem**: **retired** — never updated, no toggle call site; flag still serialized.

---

## 8. Meta & retention systems

- **Quests (`QuestSystem.js`):** 10 story chains (25 quests, 3 855 PP) + 24 side quests (3 815 PP), rewards cap-clamped. MissionTracker HUD renders tracked story quest + one codex-derived side objective. (Older `TaskSystem.js` is dead — imported nowhere.)
- **Achievements (`AchievementSystem.js`):** 49 predicates polled every 0.5 s; flat PP rewards totalling **50 925 PP** (largest flat faucet in the game) + item bundles; thresholds follow a 1×10^k ladder (100/1k/10k/100k/1M). Every 5th unlock = 1 Quantum Crystal (max 9 lifetime). **Two are unobtainable** (`all_zones_fought`, `energy_empty` — their counters are never written).
- **Codex (`CodexSystem.js`):** 74 discovery entries, 6 categories; discovery toasts only — **no rewards attached**.
- **Quantum Crystals (`TimeWarpSystem.js`):** sources: 1/5-achievements, 2/ascension, 1/≥4 h-away return. Sinks: warp options 1/3/8 QC → instant `ppRate × 600/3 600/21 600 s` + ×2/×3/×4 rate boost 60-180 s. Grants exceed cap and are clamped ~1 s later, so the instant portion is bounded by `ppCap`. QC buys time, never power — NGU-AP-shaped. (Bug: an active `_warpBoost_` modifier serializes and reloads with no expiry timer.)
- **Mathematician (`MathematicianSystem.js`):** paid ROI reveal, `250 × 1.6^hires` PP for 90 s windows; gain/PP ratios are **hardcoded heuristic fractions of ppRate**, not measured.
- **Modifiers (`ModifiersSystem.js`):** 5 toggles, max 2: Overclock (+30% rate / −20% gather), Frugal (−15% rate / ×0.7 energy), Combat Focus (+25% dmg / ×0.8 drones), Harvest Focus (+30% gather / ×0.8 dmg), Minimalist (+1 flat PP/s; its stated stat-efficacy drawback is **unimplemented**).
- **Minigame (`MinigameSystem.js`):** timing bar, 60 s cooldown, payout `max(10, ppRate×10) × 1-3×`, PERFECT ×3 + temp rate boost; speed scales +0.08/play.
- **Offline (`OfflineSystem.js`):** min 30 s, **cap 24 h**, PP at `raw ppRate × 0.5` (**globalMultiplier does not apply offline**), cap-clamped. Delegates at 50%: tripartite, training area, expedition, implant. Drones at full rate. **Not offline at all: factory, extractors, processing nodes, crafting queue.** Itemized away-report with "cheapest affordable upgrade" and "ascension ready" nudges + the ≥4 h QC.
- **Data Core (DATA tab):** effective-PP/s sample every 2 s, 10-min ring buffer sparkline, session PP/peak stats.
- **Telemetry:** rich local session recorder (50 sessions in localStorage, JSON/CSV export); server upload path exists but is never called. `js/Telemetry.js` is a dead twin.

---

## 9. Engineering substrate

- **Save:** v9 blob, every system serializes; tolerant loader with ordering gotchas handled (unequip→set→re-equip; explicit `applyBonuses()` calls). Gaps: crafting queue not serialized; warp-boost persistence bug; trainingAreas added without version bump.
- **Sync:** localStorage transaction queue → `POST /api/sync`; 17 transaction types; 29 Postgres tables; **an event-sourced ledger already exists server-side** (`player_transactions`). Fully optional.
- **RNG:** seeded (mulberry32) for mine generation only; combat/drops use `Math.random()` (RNG states not serialized).
- **Tick model:** frame-delta (`renderer.setAnimationLoop`), accumulator for whole-PP banking; offline is closed-form linear (rate × seconds), no fixed-tick sim.
- **Numbers:** raw doubles; display suffixes to ~1e33 then exponential. No BigDouble need at current scale (~1e5).

---

## 10. The unlock ladder as shipped (content schedule)

1. Start: Landing Site, Mine, Spaceship, Workspace free.
2. First field kill → FIELD OPS tab.
3. Offload ×1 → TECH, IMPLANT, DATA tabs.
4. 1 000 PP held (or 2 000 steps, or Scrap Tyrant) → Verdant Maw.
5. 2 000 PP held (or Forge Warden; no step path) → Depths.
6. Offload ×2 → ALLOC, OPT tabs. Offload ×3 → TRIALS.
7. 9 000 PP held (or 15 000 steps, or Maw Sovereign) → Lagoon Coast.
8. 25 000 PP held (or 8 000 steps, or Tide Oracle) → Frozen Tundra.
9. Cap ≥ 150·3^n → nth ascension (AP + 2 QC).
10. Pacing drip alongside: 49 achievements (50.9k PP), 49 quests (7.7k PP), 6 boss trophies, QC drip, minigame.

Zone gates are **hold-PP** checks (never spent) with step-spend and boss-kill alternates — three parallel unlock paths.

---

## 11. Interconnection map (as-built)

```
                      steps ──0.25/step──▶ PP ◀──flat rewards── kills/quests/achievements/minigame/drill
                        │                  │▲
              zone unlocks, stat buys      ││ 25% siphon ──▶ Implant ──▶ stat levels
                                           ││
   PP sinks: stats · tech · augments ◀─────┘│
   processing tiers · factory automate      │ tripartite powerBonus (+PP/s)
   drones · mathematician · timewarp        │        ▲
                                            │        │ flow 0.5/s × momentum(≤4)
   offload ──▶ baseCap ──▶ ascension ──▶ AP shop (¼ live) ──▶ globalMultiplier ◀── challenges ppRateMult
                                            ▲
   bosses: trophies (rate/cap/dmg) + clearance┘
   
   gather/trees/rocks/mine ─▶ materials ─▶ {craft: tools/consumables/4 gear} 
   drones/extractors ────────▶    │            {processing chain ─▶ assembly ─▶ extractor units}
   expedition drops ─────────▶    │            {factory chain ─▶ modules ─▶ one-time buffs}
   combat drops ─────────────▶    └──────────▶ {training program upgrades}  ◀── largest material sink
   
   damage = strength×2 × modifiers × bosses × challenges ─▶ field combat + expedition killRate
   stat levels ◀── PP buys · implant · holodeck(±) · combat sim · equipment(+) · steps · tech chips · factory buffs
```

Load-bearing observations, stated neutrally:
- PP's biggest *faucets* are flat one-time pools (achievements + quests ≈ 58.6k) at current scale; its biggest *sink ladder* is processing tiers (~126k); its only *infinite* sink is stat levels on the 1.08 curve.
- Raw stat levels are the universal accumulator — seven systems write them.
- The power loop closes as: stats → DPS → expedition tier → drops → training/assembly materials → stats. The expedition ladder topping out at tier 6 puts a ceiling on that loop.

---

## 12. Wiring health (as-built status, no judgment)

**Dead / unreachable:** TaskSystem (replaced by QuestSystem) · AutoCombatSystem (retired; flag still saved) · `js/Telemetry.js` twin · CraftingSystem's 24-recipe fallback incl. all enemy-drop gear · `timber_harvest` path · `StatsSystem.regenEnergy` · extractor offline path (never called) · telemetry server upload (never called).

**Purchasable/visible but no effect:** Ascension combat/gather/drone multipliers (3 of 4 AP upgrades) · pedometer PP-per-step upgrade · crafting-mastery speed bonus (display-only) · tech nodes droneLogistics/terrainControl/biomeAccess · Minimalist modifier drawback · corrosion `defenseReduction` · factory ring ×1.20 buff (overwritten next frame) · `requiredTechNode` recipe gates.

**Defined but unused capacity:** equipment tiers Good/Rare/Epic (no items) · 5 of 9 equipment slots (no items) · EntityManager multi-richness nodes (no spawns use it) · `droneGatherable` material flag (HUD hardcodes its own list) · dexterity/perception/crafting stats (no derived values).

**Known bugs on file:** kill-PP over-cap clamp race (on hold by decision) · warp-boost persists without timer · 2 unobtainable achievements · dunkraza missing drop table.

---

## 13. Gap map vs the Pattern Index

Verdicts: **HAS** (working answer) / **PARTIAL** (seed exists, incomplete or partly dead) / **MISSING** (no answer).

### Progression spine — PARTIAL
Multiple co-equal spines, none dominant: PP-bought stat levels (shared 1.08 curve ≈ RS's one-curve idea, unbranded), offload→cap growth, negligible gear. The NGU one-multiplier-per-system discipline is half-present (frame-composed `ascension × challenges`, boss trophies) but 3 of 4 ascension multipliers and several other emitters are dead ends. No gear-as-level staircase (Crashlands), no visible-number identity (Idle Spiral), no total-level portfolio score (RS).

### Prestige & resets — PARTIAL
Two working layers: offload (√-yield, fill-factor, prestigeCount as content key — rebirth-lite with no time-cadence math) and ascension (3^n threshold, mostly-dead AP shop). No live-watched prestige number with time-penalty cadence (NGU), no peak-derived/watermarked currency (FAPI), no composed reset supersets (Idle Spiral), no layer-pays-layer scalars, no retention schedules. Challenges are one-shot constraints, not repeatable-at-rising-difficulty. RS-style "no more resets, milestone stacking" is a live alternative given the finite content.

### Currencies & economy — PARTIAL
Interesting bones: steps are a genuine second wallet with three verbs (unlock/stat/track — TPT2 many-verbs-one-wallet in miniature); QC is correctly time-not-power (NGU AP philosophy); a server-side event ledger exists. Weaknesses as-built: over-cap income destroyed rather than converted (anti-FAPI), sinks are overwhelmingly one-time purchases, only stats scale forever, 99-stack caps silently void passive production, no exchange rates, no disassembly/shredder, no NPC floor, no log-scale sink rewards, no allocated-not-consumed pools with reclaim decisions (tripartite flows but never asks for reallocation under pressure).

### Curve toolkit — PARTIAL
In use: geometric costs (1.08 stats, 1.6 mathematician, 1.8 drones, 2.5 drone buys, ×2 factory, ×4 processing), √ offload yield, 3^n ascension gates, ^0.35 softcap, 1.4^n drill HP, deterministic kills/s. Absent: milestone cost jumps with other-system-reducible periods (NGU hacks), income-equilibrium drains, continuity-preserving softcap library (Idle Spiral), caps-that-convert (FAPI), double-log infinite sinks, closed-form bulk-buy.

### Combat — PARTIAL
Idle pump exists (expedition, deterministic, offline-capable) and manual field combat exists, but they are separate contents rather than NGU's idle-baseline-×-manual-multiplier on one system. The ladder ends at tier 6 (no infinite wall, no autokill-threshold farms, no provable-optimal-floor). Telegraphs exist (windup/burst) and death costs time only (Crashlands-aligned). No death-as-harvest meta payout (FAPI), no per-boss player-stat rewrites (Idle Spiral), no ratio hit-chance / tier-function gear math (RS). Boss phase2 rewrites the *enemy*, not the player.

### Itemization & RNG — MISSING (widest gap)
No drop gear at all; tier multipliers and 5 slots built but empty; no merge/level/boost (NGU), no rarity/affix bands (FAPI/Crashlands), no collection-log bonus engine (codex pays nothing), no pity taxonomy beyond the single mine-vein pity, no elites-superset-loot, no two-clock collectibles, no fragment banking. Drop tables are flat independent rolls with one archetype missing entirely.

### Automation & QoL — PARTIAL
Stage-1 automation exists (drones, extractors, factory automate at 100 PP, processing queues) but arrives nearly free — no designed pain→priced cure arc (TPT2), no compute-as-currency, no scripting endgame. Crashlands-style friction audit never performed: 99-caps, no-regen energy, walk-to-station frictions, queue-loss-on-reload all live; some frictions are deliberate (busy-game identity) but undeclared. Offline is a partial patchwork (50%/24 h for some systems, full for drones, zero for the whole production layer) rather than a policy.

### Retention cadence — MISSING (near-total)
No daily/weekly/monthly anything, no banked grace, no rotating spotlight, no catch-up-weakest mechanic, no lifetime-counter escalators, no first-X spikes beyond one-shot achievements. What exists: ≥4 h-away QC drip, 60 s minigame cooldown, session momentum (×4 at 6 h — a *live-session* cadence lever, the inverse of login cadence), 24 h offline cap as an implicit check-in ask. Notably already compliant with the RS 2026 verdict: zero login streaks.

### Engineering — HAS (at current scale)
Doubles + 1e33 display headroom vastly exceed the 1e5 economy; save versioning tolerant; event-sourced ledger on the server; seeded RNG discipline in the one place it matters today. Missing only if scale ambitions grow: BigDouble, serialized RNG states, strict migration ladder, closed-form bulk-buy, fixed-tick offline sim.

---

## 14. Direction already on file (constraints for synthesis)

1. **Busy-game identity** (owner, 2026-07-18) — active sessions must outearn idle; momentum, no-regen energy, and step-PP already encode it.
2. **Flow-with-bottlenecks PP** — no ambient emission; chokepoints + event rewards. (Over-cap destruction is the current, crude bottleneck implementation.)
3. **Tripartite stays for now; power = sink-effectiveness** — the 2026-07-18 decision fixed the curve (^0.35 + momentum) and aimed power at sinks (training first). The 2026-07-07 roadmap's Phase 3 (allocation pools replacing tripartite, Kernel-gated) **predates** this and conflicts; unresolved.
4. **Factory should become TPT2 stock-based, online+offline** — current FactorySystem is neither.
5. **Training = holodeck with real NGU-style de-level costs, material-recipe upgrades** — shipped v1.
6. **Combat PP economy on hold** — flat rewards + clamp race documented, deliberately unfixed.
7. **NGU-feel roadmap (draft, pending review)** — Ladder → Al → pools → merge grid → raid/titans → challenge expansion; explicitly "each phase gets its own spec." Kickoff preferences (Round 0): NGU + Crashlands heavy, RS honorable, TPT2 = mine/factory only, "borrow the shared features."
8. **God save (Endgame_Test) never used for balance analysis.**
