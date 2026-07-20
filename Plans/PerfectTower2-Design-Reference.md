# The Perfect Tower II — Systems & Math Design Reference

*A design study of The Perfect Tower II (FireSword Studios), written for borrowing ideas about progression, economy, prestige, and automation for a new 3D game. Unlike the Mono-Unity games in this series, TPT2 is an IL2CPP build — its C# is compiled to native code, so no decompiled source was available. Every formula below was instead researched against the community wiki (perfecttower2.com/wiki), Steam guides and discussions, dev diaries, and the community's script-tooling repositories, with inline citations; anything unverifiable is marked. Confidence is flagged honestly throughout.*

---

## The Big Picture

TPT2 looks like a tower-defense game, but the tower is a lie: rounds always end in death, and everything that matters is the town behind them. It is the series' best study in **automation as content** and **many games sharing one wallet**. The load-bearing ideas:

1. **Combat is a resource pump for a persistent metagame.** Tower rounds are low-stakes and repeatable by design — the payout is one universal resource that converts into each building's currency at *fixed exchange rates spanning five orders of magnitude* (Workshop 50:1 → Statue 250,000:1). The exchange table *is* the unlock schedule: later systems aren't mechanically locked, just priced out until your economy grows into them.

2. **Every building is a different verb.** The Factory is Factorio-in-an-inventory; the Mine is an active clicker; the Power Plant is a spatial logistics puzzle with a 1,000 L/tick pipe cap; the Shipyard is a 5-minute-to-24-hour timer game; the Arcade contains a roguelite and a full shmup; the Statue of Cubos is five boss fights in five genres. A dozen genuinely different games, all paying into one economy — the most 3D-ready architecture in this reference series, because each system can literally be a place.

3. **Design the pain, then sell the cure — in three stages.** Manual play teaches the systems; crude *workers* (bought with gems, click every 5 s) arrive at Military Tier 1; the full **Facility AI** arrives at MT4: a real in-game scripting language (impulses/conditions/actions, 50 lines per script, 100 scripts) whose *execution budget is purchased as RAM* (`(⌊log₁.₄₅₉(totalRAM)⌋+1)×100`) and whose research speed is purchased as CPU (`4^tier × 25 Hz`). TPT2 sells you a computer and makes upgrading it the endgame. A community toolchain (external compilers with macros and Lua preprocessing) grew on top of the portable script format — endgame content the developers never had to build.

4. **Prestige is a changing checklist, refunded on a timer.** Each of 15 Military Tiers demands a bespoke breadth+depth checklist (N modules maxed, N regions, wave/Era records, bosses) — every reset is a different scenario, not a bigger number. Town resources lost at prestige *drip back over 4 hours*, converting the classic prestige wipe into a short cooldown.

5. **Late "resets" only count up.** Eras (wave 100 billion) don't wipe anything — they permanently increment a counter that exponentiates enemy stats (`10^(20·era^…/(level+1))`), which you then *buy down* with ÷8-per-level divisors. Infinity repeats the trick a level up. The prestige feeling without the prestige cost, with overflow-proofing built into the divisor math.

6. **Curves do the tuning.** Elemental effectiveness is *exponentiated* by difficulty (`(Eff)^Fac`, Fac = 1→8), turning a gentle suggestion into a hard build requirement only at the top. Module drops scale with `log₁₀(wave/10)`, making short runs loot-optimal and long runs banking-optimal — session shape steered by math, not rules. The Museum's merge ladder hides `3^tier` in an inventory UI and prices convenience at `18^tier`.

*Coverage note: two minor systems (deep-dives on the Shipyard and Trading Post) had their dedicated research cut short by an API session limit; both are still covered at moderate depth inside the Town and Side Systems chapters.*

## Contents

1. **The Tower** — modules, waves, the region × difficulty lattice
2. **The Town** — building web, exchange-rate economy, resource flow graph
3. **The Factory** — production chains, up-tiering, producers as income
4. **Mine, Power Plant & Production Minigames** — three automation archetypes
5. **Museum & Gems** — the combine-to-tier ladder
6. **Prestige** — Headquarters, Military Tiers, Eras, Software & the Laboratory
7. **The AI Scripting System** — automation as endgame content (the centerpiece)
8. **Military, Arcade, Statue of Cubos & Side Systems**
9. **Distilled Playbook** — the transferable patterns, collected

---

## The Tower: Modules, Waves, Regions & Difficulty Tiers

### 1. What the system is

The core loop of TPT2 is "Tower Testing": you assemble a tower from a loadout of **modules** (a saved loadout is called a **blueprint**), drop it into an elemental-themed **region** at a chosen **difficulty tier**, and let it auto-fight escalating waves of enemies marching down lanes. During the round, kills grant experience spent on *temporary* in-run module upgrades; when the tower dies, the round ends and everything temporary is wiped — but the resources you banked convert into currencies for the town's buildings (Workshop, Laboratory, Headquarters, etc.), which buy *permanent* power (wiki: Tower Testing). The genius of the design is that the tower-defense round is not the game — it is the **resource extraction phase** for a factory/town metagame, and the metagame in turn feeds power back into the tower.

### 2. The math

**Modules & blueprints.** ~399 modules exist (v1.0.10), split into offensive / defensive / utility / ultimate / special / legendary, and active vs. passive (passives raise core tower stats: health, health regen, damage reduction, energy) (wiki: Modules). Documented cost math:

| Mechanic | Value | Confidence |
|---|---|---|
| Module level cap | 100 per tier (Attack Speed: 20 per tier) | High (wiki: Modules) |
| Level-up cost, Tier I | +1 resource per level; 5,050 total for 0→100 (triangular sum) | High (wiki: Modules) |
| Tier-up cost | 7,500 × 12^(tier−1) Workshop resources; tiering resets level to 0, raises cap by +100 | High (wiki: Modules) |
| Per-level cost growth across tiers | Tier II upgrades ~8× Tier I | High (wiki: Modules) |
| Module tier cap | 250 (special modules: 1); extra tiers gated by Military Tier at HQ | High (wiki: Modules, Workshop) |
| Module drop chance from regions | Bdc × Pb × Df × log10(Cw/10) — base chance × player bonus × difficulty factor × log of current wave | High (wiki: Modules) |

That drop formula is a quietly brilliant curve: because wave contribution is *logarithmic*, many short runs to wave ~30–50 beat one marathon run — farming behavior is shaped by math, not rules.

**Enemies & waves.** Six archetypes with stat multipliers relative to a Normal enemy (wiki: Enemies): Tank (50% atk / 250% HP), Archer (90/90, ranged), Wizard (90/150, applies a 300% slow), Assassin (200% atk / 90% HP, leaps), and a **Boss every 10 waves** at 1000% atk/HP and 200% speed. Enemies per lane per wave scales with difficulty: 4 (Easy), 6 (Medium/Hard), 8 (Insane), 9 (Nightmare), 10 (Impossible) (wiki: Tower Testing). Waves advance on a timer rather than on clears, and a community-known "wave acceleration factor" can multiply wave advancement (Steam forum; exact base seconds-per-wave **unverified**). The exact per-wave HP growth formula is **not publicly documented**; the wiki instead publishes each region/difficulty's enemy HP *at wave 100* relative to Forest-Easy — the growth within a round is steeply exponential in practice (qualitative).

**Elements.** Ten elements; base effectiveness spans 25%–200%. Difficulty *exponentiates* the matchup (wiki: Elements):

> Effective% = (Eff/100)^Fac × 100, with Fac = 1 / 1.5 / 2 / 3 / 4 / 8 for Easy → Impossible.

So a 200% counter-element hit becomes 25,600% on Impossible, and a 25% resisted hit collapses to ~0.0015%. A soft rock-paper-scissors at low difficulty becomes a hard build requirement at high difficulty.

**Region × difficulty lattice.** 15 regions (Forest → Chaos), each with an element palette and 3–10 lanes; each region has 6 difficulties. Enemy-strength multipliers (HP at wave 100 vs. Forest-Easy; wiki: Regions):

| | Easy | Medium | Hard | Insane | Nightmare | Impossible |
|---|---|---|---|---|---|---|
| Forest | 100% | 6,377% | 128,043% | 8.83M% | 4.99B% | 3.21Qa% |
| Desert | 781% | 18,340% | 403,948% | 34.1M% | 28.5B% | 52.4Qa% |

Note the shape: stepping up a *region* is roughly a 4×–8× jump, but stepping up a *difficulty* is ×20 → ×60 → ×500 → ×600,000 as you climb. Players therefore zig-zag: push regions on one difficulty, then restart the region ladder on the next difficulty.

### 3. Interconnections

- **Inbound:** Workshop levels/tiers (permanent module power, paid in resources from rounds), Laboratory research, Military Tier perks, Headquarters software/contracts (contracts multiply drops as Bonus^(FulfilledContracts+1) — wiki: Headquarters), and Factory-produced items all raise tower strength.
- **Outbound:** each round pays out resources that convert into per-building currencies at fixed per-building ratios (e.g., Workshop "blue" at 50:1, Headquarters "purple" at 750:1 — wiki: Workshop, Headquarters), plus town XP and module drops.
- **Tension:** every region/difficulty combo drops different amounts and feeds different needs (module hunting wants short runs by the log formula; resource banking wants deep runs), and Impossible spawns *all* elements, forcing generalist builds exactly when the exponent punishes them most.

### 4. Pacing & gating

Gates are uniform and legible: **reach wave 100** to unlock the next region, and **wave 100** on a difficulty to unlock the next difficulty (wiki: Regions). Early game is a fresh-tower/short-round loop; Military Tier prestige (resets module levels and town resources, keeps buildings/gems, grants a perk each reset) re-paces the mid-game, with MT4 the automation watershed (Steam/community beginner guide: slashskill). The deep endgame swaps curves entirely: Endless mode grows enemy health/collision damage +1%/sec and bullet damage +2%/sec additively (wiki: Endless mode); at MT8, hitting wave 100B increments an **Era** counter with scaling 10^(20 × era^(1 − level/300 × 0.78)/(level+1)) that literally overflows IEEE doubles ("skull" enemies) unless divided down by ÷8-per-level Era Divisor upgrades (wiki: Era); Infinity difficulty converts depth to "Infinity Power" via x = 1 + log10(1 + (10^11−1)(n/10^11)(1.12 − 0.06d)) (wiki: Infinity). The walls, by design, are the difficulty-step cliffs (×500+ late steps) — each wall is a signal to go grow the town, not to grind the tower.

### 5. Borrowable design lessons

1. **Make combat a resource pump for a persistent metagame.** Rounds that always end in death stay low-stakes and repeatable; permanence lives in the town. Maps cleanly onto a 3D game: dungeon runs feed a base-building layer.
2. **Log-scaled reward curves shape session length without rules.** log10(wave/10) drop chance makes short runs optimal for loot and long runs optimal for banking — two farming styles from one formula.
3. **Exponentiate elemental matchups by difficulty.** (Eff)^Fac turns a gentle suggestion into a build-defining constraint only at high tiers — soft onboarding, hard mastery.
4. **A 2D lattice (region × difficulty) beats a 1D ladder.** Small horizontal steps and huge vertical steps give players a choice of *which* wall to hit and an obvious sidegrade when stuck.
5. **Arithmetic level costs + geometric tier costs (×12), with tier-ups resetting level.** Cheap visible progress every session, big planned purchases between sessions — two cadences from one upgrade track.
6. **One universal gate ("wave 100") everywhere.** Uniform unlock conditions make an enormous content matrix (15×6) self-explanatory with zero tutorial text.

Sources: [wiki: Regions](https://www.perfecttower2.com/wiki/Regions), [wiki: Tower Testing](https://www.perfecttower2.com/wiki/Tower_Testing), [wiki: Modules](https://www.perfecttower2.com/wiki/Modules), [wiki: Enemies](https://www.perfecttower2.com/wiki/Enemies), [wiki: Elements](https://www.perfecttower2.com/wiki/Elements), [wiki: Workshop](https://www.perfecttower2.com/wiki/Workshop), [wiki: Headquarters](https://www.perfecttower2.com/wiki/Headquarters), [wiki: Era](https://www.perfecttower2.com/wiki/Era), [wiki: Infinity](https://www.perfecttower2.com/wiki/Infinity), [Steam forum: Wave Acceleration Factor](https://steamcommunity.com/app/1197260/discussions/0/3818529563394092928/), [slashskill beginner guide](https://www.slashskill.com/perfect-tower-ii-beginner-guide-essential-tips-to-master-every-system/)

---

## The Town: Building Web & Resource Economy

### 1. What the system is

The Town is TPT2's hub layer: a screen of 12 buildings sitting "above" the core tower-defense game. Running tower-defense rounds ("Tower Testing") drops a single universal currency — white resource cubes — and every building converts white cubes into its own private color-coded currency at a fixed, building-specific exchange rate, then spends that currency inside its own self-contained minigame (a mining grid, a factory crafting chain, a power-grid puzzle, a card game, etc.). The outputs of those minigames — modules, boosts, stones, software — feed back into the tower, which earns white cubes faster, closing the loop (wiki: Town, Resources).

### 2. The buildings (one line each)

| Building | Color | What it is |
|---|---|---|
| Workshop | Blue | Buy/level tower modules and arrange them on a blueprint — the main power sink (wiki: Workshop) |
| Construction Firm | Brown | Builds and upgrades every other building; refunds on cancel (wiki: Construction Firm) |
| Headquarters | Purple | Military Tier prestige, contracts (challenge modifiers), and server/CPU/RAM hardware that runs the in-game AI scripting language (wiki: Headquarters) |
| Mine | Orange | Active drill + click-to-uncover tile grids per resource type; produces shards, gems, white cubes (wiki: Mine) |
| Factory | Red | Ore→dust→ingot→plate/rod/wire/circuit crafting chains; builds "producers" that passively generate resources (wiki: Factory) |
| Laboratory | Green | Timed experiments, one per element, each individually prestigable up to 100 times; grants modules and elemental damage/resist caps (wiki: Laboratory) |
| Power Plant | Yellow | Grid-placement puzzle generating energy that is allocated as a speed/effectiveness boost to other buildings (wiki: Power Plant) |
| Trading Post | Light blue | Hourly-refreshing board of equal-value resource swap offers; completed trades earn "crates" that power passive bonuses (wiki: Trading Post) |
| Arcade | Pink | Four actual arcade games (Lucky Wheel, Jumble, Adventure dungeon, Perfect Space shooter) paying out resources, skill points, gems, cards (wiki: Arcade) |
| Museum | Grey | Power-stone loadouts (3-combine to tier up), stat milestones, artifact research, offshore stone market (wiki: Museum) |
| Shipyard | Cyan | Send ships on 5-minute to 24-hour timers for bulk resources/gems; per-shipment compounding reward bonus (wiki: Shipyard) |
| Statue of Cubos | Black | Five boss fights, each a different genre (TD, shooter, rhythm, card game), with their own module/XP systems (wiki: Statue of Cubos) |

**The key design idea:** every building is genuinely its own minigame with its own verbs, and the only shared interface is the white-cube exchange. The town is less a base-builder than a portfolio of 12 sub-games sharing one wallet.

### 3. The math

**Conversion rates (white cubes → 1 colored cube)** — this table *is* the pacing document (wiki: Resources):

| Resource | Rate | Resource | Rate |
|---|---|---|---|
| Blue (Workshop) | 50:1 | Purple (HQ) | 750:1 |
| Brown (Constr.) | 60:1 | Yellow (Power) | 800:1 |
| Orange (Mine) | 120:1 | Light blue (Trading) | 6,000:1 |
| Red (Factory) | 150:1 | Pink (Arcade) | 25,000:1 |
| Green (Lab) | 400:1 | Grey (Museum) | 45,000–50,000:1 (wiki pages disagree) |
| Cyan (Shipyard) | 100,000:1 | Black (Statue) | 250,000:1 |

Per-building skills reduce individual rates (e.g., Workshop "Recycling," Construction "Efficiency" 60→40) — rate reduction is itself an upgrade currency sink.

**Building upgrade costs (brown cubes, first tiers)** — sampled from the Construction Firm cost table (wiki: Construction Firm):

| Tier | Workshop | Mine | Factory | Lab | Power Plant | Arcade | Statue |
|---|---|---|---|---|---|---|---|
| 1 | 5 | 100 | 250 | 1,000 | 7,500 | 125,000 | 1.25M |
| 2 | 250 | 1,250 | 2,000 | 27,500 | 100,000 | 2.5M | 50M |
| 3 | 2,000 | 5,000 | 12,500 | 125,000 | 375,000 | 200M | 750M |

Build timers run from 1 second (Construction T1) to hours (Statue T3: 25,200 s). Max tiers vary per building: Workshop 12, Factory/Mine 10, HQ 8, Power Plant/Lab 6, Museum/Trading 5, Arcade 4, Shipyard/Statue 3.

**Documented sub-formulas** (all wiki-sourced, moderate confidence — wiki tables render formulas ambiguously):

- Power Plant boost: `Result = log₁₀(energy allocated) × perks × base value`; component prices multiply ×1.5 per duplicate on the grid; grid ticks 10/sec (wiki: Power Plant).
- Factory machine speed doubles per machine tier: `speed = base × 2^(tier−1)`, i.e. 512× at T10 (wiki: Factory).
- HQ contracts: resource bonus ≈ `per-contract multiplier^(fulfilled contracts+1)`, +0.03 per upgrade level, ≤10 concurrent (wiki: Headquarters).
- Trading Post crate bonuses: `Crates^(0.05+0.05×upgrade)`-style power curves; base trade profit 10%, raisable to ~30% via skills (wiki: Trading Post).
- Shipyard: reward bonus compounds +0.05% per completed shipment per "Improved decks" level (max 500); sea miles accrue at 0.0002/sec × shipment constant (wiki: Shipyard).
- Statue bosses gain abilities at Fibonacci tiers (2, 3, 5, 8, 13, 21) (wiki: Statue of Cubos).

### 4. Interconnections — the resource flow graph

```
Tower Testing ──white──> [12 fixed exchange rates] ──> 12 colored wallets
      ^                                                     │
      │   Workshop(modules) ── Lab(module unlocks, elem caps)
      │   Museum(stones) ── HQ(software, contracts) ────────┘
      │
Mine ──shards──> Factory ──parts──> module crafting, producers
Factory producers ──passive──> white + colored resources
Power Plant ──energy boost──> speed of every other building
Trading Post <──swaps any color for any color at par──> all wallets
Shipyard ──timers──> bulk any-color + gems ──> Museum stones
Construction Firm <──brown──> gates every building's tier
```

Three deliberate tensions: (a) **one faucet, thirteen sinks** — white income is shared, so every colored purchase is an opportunity cost against every other building; (b) **attention is a currency** — Mine and Arcade pay best when played actively, Shipyard and Lab pay for absence, Factory/Power Plant pay for setup time; (c) the **Trading Post is the pressure valve**: because trades are at equal value with a profit margin, it converts surplus in a cheap color into scarce expensive colors, softening the rigid exchange table without breaking it (wiki: Trading Post).

### 5. Pacing & gating

Buildings unlock along the Construction Firm's own tier ladder (T1: Workshop/HQ → T2: Mine/Factory → T3: Lab/Power Plant → T4: Arcade/Trading Post → later: Museum, Shipyard, Statue), with Military Tier prestige from HQ gating the broader arc (wiki: Construction Firm, Buildings). Note the ~5-orders-of-magnitude spread in both exchange rates (50:1 → 250,000:1) and tier-1 build costs (5 → 1.25M brown): late buildings are gated purely by economy, no new mechanic required. Early game is minutes-per-unlock; late buildings arrive over weeks. The walls are (1) brown-cube accumulation for high tiers, (2) the white-income plateau before Factory producers and HQ contracts come online, and (3) real-time timers (construction, Lab experiments, Shipyard voyages) that convert progress into calendar time.

### 6. Borrowable design lessons

1. **One universal drop, per-system exchange rates.** A single farmable currency with fixed per-system conversion ratios lets you pace a dozen subsystems by tuning one table — trivially rebalanceable, instantly legible to players.
2. **Exchange rate as unlock schedule.** Making later systems 100×–5000× more expensive per unit (rather than mechanically locked) creates soft gates players can rush if obsessed — good for a 3D game where "walking into" a new district should feel earned, not switched on.
3. **Every building is a different verb.** TPT2 retains idle players by making each hub building a distinct genre (crafting, grid puzzle, dungeon crawl, card game). In 3D, each physical building can literally contain a different play mode sharing one wallet.
4. **A player-facing exchange (Trading Post) as balance insurance.** An equal-value swap board with a small profit margin lets players fix your economy's local imbalances for you — and its hourly refresh is a free retention hook.
5. **Buff building instead of buff menu.** The Power Plant makes "boost allocation" a spatial puzzle with logarithmic returns and duplicate-cost escalation — a physical building that aims speed at other buildings is very 3D-friendly.
6. **Compounding rewards for repetition, not streaks.** Shipyard's permanent +bonus per completed shipment and HQ's `x^(n+1)` contract stacking reward long-run engagement without punishing missed days — kinder than daily streaks, same retention math.

Sources: [perfecttower2.com wiki — Town](https://www.perfecttower2.com/wiki/Town), [Buildings](https://www.perfecttower2.com/wiki/Buildings), [Resources](https://www.perfecttower2.com/wiki/Resources), [Construction Firm](https://www.perfecttower2.com/wiki/Construction_Firm), [Trading Post](https://www.perfecttower2.com/wiki/Trading_Post), [Factory](https://www.perfecttower2.com/wiki/Factory), [Mine](https://www.perfecttower2.com/wiki/Mine), [Power Plant](https://www.perfecttower2.com/wiki/Power_Plant), [Laboratory](https://www.perfecttower2.com/wiki/Laboratory), [Workshop](https://www.perfecttower2.com/wiki/Workshop), [Museum](https://www.perfecttower2.com/wiki/Museum), [Headquarters](https://www.perfecttower2.com/wiki/Headquarters), [Shipyard](https://www.perfecttower2.com/wiki/Shipyard), [Arcade](https://www.perfecttower2.com/wiki/Arcade), [Statue of Cubos](https://www.perfecttower2.com/wiki/Statue_of_Cubos)

---

## The Factory: Production Chains & Item Crafting

### 1. What it is

The Factory is TPT2's town building for physical manufacturing. You spend the Factory's own currency ("red" resources) to buy raw items, then push those items through crafting machines — oven, crusher, presser, shaper, refiner, cutter, assembly, mixer, boiler — to turn ores into dusts, ingots, plates, rods, cables, wires and circuit parts, which combine into ever-better **machines** and, critically, **producers**: placeable items that passively generate the currencies of *every other town building*, even offline (wiki: Factory; wiki: The Ultimate Potato Guide To Things!). It is a Factorio-in-an-inventory minigame inside an idle game: for a long stretch it is played entirely by hand — drag items into machine slots, wait a timer, right-click to extract — which made it simultaneously the most beloved "real game inside the game" and the most complained-about clickfest until automation systems arrive.

### 2. The math

**Chain depth.** The documented processing graph is 3–5 steps deep per branch (wiki: Factory):

| Machine | Converts | Base duration (t = material tier, 1–10) |
|---|---|---|
| Oven | ore/dust → ingots | 1.25t + 0.25 s |
| Crusher | ore → dust | 2t − 1 s |
| Crusher | ingots → dust | 0.5t + 0.25 s |
| Presser | ingots → plates | t + 1 s |
| Presser | stacked plates → dense plates | 3t s |
| Shaper | ingots → rods | t s |
| Shaper | rods → rings/nuts | 1.5(t+1) s |
| Shaper | plates → pipes | 5(t+1) s |
| Refiner | ingots → cables; cables → wires | t s each |
| Refiner | plates → circuit plates | 3t s |
| Assembly | cables → circuit wires | 2.5t + 5.5 s |
| Cutter | rods → screws/bolts | t s |
| Boiler | blocks → dense blocks | 50t s |

Confidence: high (tables copied from wiki: Factory). Two ratio rules are well documented: crushing ore to dust before smelting **doubles ingot yield per ore** (wiki: Factory), and dust up-tiers via "lumps" — **8 dust of tier t + 1 dust of tier t+1 → mixer → 2 dust of tier t+1** (wiki: Lordmatt/Factory notes), reducible to 4 dust with the 60-gem Chemical Lumps exotic skill. The boiler can also *down-tier* dust (2(t+1) s), so the tier ladder is traversable both ways.

**Speed vs. tier.** Recipe times grow only **linearly** with material tier, but machine upgrades multiply speed by **2^(machineTier−1)** — 1× at T1 up to 512× at T10 (wiki: Factory). So higher-tier materials feel slow exactly until you reinvest crafted goods into better machines.

**Input gate (shard refining).** Raw ore comes from Mine shards. A refine must include at least as many distinct shard types as the target ore tier AND exceed a size breakpoint: T1 = 12.5, T2 ≈ 164, T3 ≈ 982, T4 ≈ 5,224, T5 ≈ 26,920 … T10 ≈ 1.01e8 (wiki: Factory) — roughly **×5 per tier** after the early jumps. Base speed is 5 s per shard (2 s with the Advanced Refining skill); Belt machines double refining speed but produce nothing themselves.

**Producers.** Output grows super-linearly with producer tier — "even one or two higher tiers will kick out far more than a stack of one tier lower" (wiki: Factory); the wiki lists T5 producer baselines on the order of 1e18–1e20 resources/sec per building type (confidence: medium — snapshot values, boosted by Power Plant and Trading Post multipliers). The building itself caps at tier 10; each upgrade adds 12 inventory slots, widens the crafting grid, and unlocks recipes.

### 3. Interconnections

- **In:** Mine (shards → ore via refining); red resources buy base items; exotic gems buy factory skills; Laboratory experiments and Power Plant boosts multiply machine speed and producer output.
- **Out:** the Factory's true export is not items but **income** — producers generate the currencies that the Construction Firm (building upgrades, brown resources), Workshop (module crafting, and its module-loadout "blueprints"), Laboratory, Headquarters and Town all spend. One honest correction to the folk narrative: per the wiki, Construction Firm projects cost only brown resources — factory *items* are not directly consumed by other buildings' blueprints (wiki: Construction Firm); items are consumed internally by machine/producer recipes and by the Crafter's scanning system.
- **Second floor (Factory specialization):** adds the Crafter (scan items — consuming a quantity of them — to learn recipes), Fabricator (auto-builds ordered items from "mass"), Dissolve (items → mass), and a tree farm for rubber (wiki: Lordmatt/Factory notes; wiki: Specializations).
- **Automation:** the Headquarters' Facility AI (a real scripting language: impulses/conditions capped at 10, actions at 50, execution budget up to 10,000 bought via server RAM) can automate factory clicking; a large community script ecosystem exists (wiki: AI Scripts Guide; d0sboots/PerfectTower GitHub). Notably, community consensus is that scripts automated the factory *poorly* until the second-floor autocrafter shipped — "the Factory just has to remain a hassle of manual tasks until second floor" (Steam discussion: Factory Automation Script). One player measured 6 hours of 1 ms autoclicking to hand-craft manufacturing boosters (Steam discussion: Factory Manufacturing Blueprints).

### 4. Pacing & gating

Early: buy ore with red resources, learn machine verbs, craft T1 producers — minutes per craft, high engagement. Mid: the grind pivots to shard-refining breakpoints (×5 per tier) and up-tiering dust at 8:1, so each material tier is a distinct wall; machine-tier upgrades (2^n speed) are the release valve. Late: the walls become *attention* walls, not resource walls — chain depth × quantities makes manual play untenable, which is precisely when the game hands you the Crafter/Fabricator and the AI scripting system. The factory then converts from an active minigame into infrastructure you program once.

### 5. Borrowable design lessons

1. **Export income, not items.** Let the crafting minigame's end products be permanent passive generators of *other* systems' currencies — the factory stays relevant forever because every system's throughput routes through it.
2. **Linear recipe times, exponential machine speed.** Costs that grow with material tier plus tools that grow 2^n create a satisfying oscillation: each new tier briefly hurts, then upgrades trivialize it.
3. **Threshold-and-variety input gates.** Requiring N distinct inputs *and* a batch-size breakpoint (≈×5/tier) turns raw-material intake into a small optimization puzzle instead of a passive faucet.
4. **Catalyst up-tiering with a reverse path.** "8 lower + 1 higher → 2 higher" makes surpluses convertible upward while the higher unit stays precious; a down-tier machine prevents dead stock. Great fit for a 3D game's loot economy.
5. **Design the pain, then sell the cure diegetically.** TPT2 deliberately lets manual crafting become miserable, then delivers automation as an in-world upgrade (autocrafter) and finally as a full player-facing scripting language with resource-priced execution budget — turning "chore removal" into aspirational endgame content.
6. **Ship automation as content, budgeted like a stat.** Caps on script actions and a RAM-purchased instruction budget make automation itself a progression axis players grind for — worth copying for any game where late-game complexity outgrows hands-on play.

Sources: [wiki: Factory](https://www.perfecttower2.com/wiki/Factory), [wiki: Lordmatt/Factory notes](https://www.perfecttower2.com/wiki/User:Lordmatt/Factory_notes), [wiki: Construction Firm](https://www.perfecttower2.com/wiki/Construction_Firm), [wiki: The Ultimate Potato Guide To Things!](https://www.perfecttower2.com/wiki/The_Ultimate_Potato_Guide_To_Things!), [wiki: AI Scripts Guide](https://www.perfecttower2.com/wiki/AI_Scripts_Guide), [d0sboots/PerfectTower (GitHub)](https://github.com/d0sboots/PerfectTower), [Steam discussion: Factory Automation Script](https://steamcommunity.com/app/1197260/discussions/0/600774969474980361/), [Steam discussion: Factory Manufacturing Blueprints](https://steamcommunity.com/app/1197260/discussions/0/3812913565885869015/).

---

## Mine, Power Plant & the Production Minigames

### 1. What these systems are

TPT2's town contains twelve buildings, each a self-contained minigame that consumes one color of "town resources" and emits its own specialty currency and permanent bonuses. The **Mine** is an active-play excavation game: a fuel-burning drill descends continuously, and the player clicks tiles on a reveal-the-grid board to dig up shards, gems, and multipliers. The **Power Plant** is a spatial logistics puzzle: place generators, fuel sources, and pipes on a grid to produce "power," a spendable meta-resource that temporarily accelerates *other* buildings. The **Shipyard** is a pure timer game: dispatch ships on 5-minute to 24-hour voyages that return resources, with compounding bonuses per completed shipment. Together they cover the three classic production-minigame archetypes — active clicker, layout optimizer, and offline timer.

### 2. The math

**Mine.** The drill converts orange town resources into fuel (1 cube = 10 L) and depth. Three upgrade axes govern it: `DRILLPOWER` (seconds per unit of depth gained), `TANKVOLUME` (runtime before an all-or-nothing refuel), and `FUEL USAGE` (L/sec burned) (wiki: Mine). The digging board is separate: every cube resource in the game has its own independent mining zone, but **all zones share the single global drill depth** — depth is the one central stat. Each tile costs orange resources to dig ("digging cost," per tile type; exact tables are not published on the wiki, so treat per-tile costs as unverified). Tile-type probabilities shift with depth: resource tiles become more common and empty tiles rarer the deeper you are, so depth is a slow permanent yield multiplier rather than a level counter (wiki: Mine). A "New Layer" reroll button runs on a recharging pool capped at 10 charges per resource. Skills define the automation curve: Detector (auto-reveal 1 tile/layer), Deep Mining (+100% all rewards), Collapsing Tunnels (passive drilling worth 30 s/hour), Advanced Offline Mining (150% shard production offline), Advanced Drill (+10% drillpower per Mine tier). Exotic skills convert late-game currency into multipliers: Geology (25 exotic gems) multiplies rewards by town level; Mineralogy adds a 0.05% chance to convert finds into exotic gems (wiki: Mine).

**Asteroid mining** (Mine floor 2, Mine specialization required): scan space for asteroid clusters, then drill them for artifacts, modules, and factory items. Drill time follows

> `Time = 2 × Distance / DrillPower × 1.5^(TilesMined − 1)` (wiki: Mine)

— linear in distance (AU), geometric ×1.5 per additional tile mined in a cluster, so greed for one more tile is an explicit exponential tax. Higher military tier reveals farther clusters: better loot, longer drills. A Fast Scan option (MT6) cuts scan time 90% but hides loot hints — a clean information-vs-time trade (Steam dev diary #34; wiki: Mine).

**Power Plant.** The grid simulates at 10 ticks/second. Placing a duplicate of any component costs **×1.5** the previous one (multiplicative, refunded fully on sell), which soft-caps spam of the best generator (wiki: Power Plant). Producers must be orthogonally adjacent to consumers, or linked by pipes carrying 1,000 L/tick — but generated power and battery capacity are *pooled globally*, so the puzzle is entirely about supply chains, not wiring outputs. Representative chain (tier 1): Coal Chest holds 2,500 kg; Coal Boiler turns 100 L water + 4 kg coal into 30 L steam; Steam Turbine turns 10 L steam into 30 power/tick.

| Component (tier) | Base cost (yellow) | Conversion per tick | Confidence |
|---|---|---|---|
| Steam Turbine (1) | 60 | 10 L steam → 30 power | wiki: Power Plant |
| Gas Turbine (2) | 5,000 | 25 L gas → 100 power | wiki: Power Plant |
| Solar Panel (3) | 10,000 | → 1 power (0 in rain) | wiki: Power Plant |
| Thermal Generator (4) | 50,000 | 100 L lava + 100 L water → 200 power | wiki: Power Plant |
| Plasma Turbine (6) | 500,000 | 100 L plasma → 5,000 power | wiki: Power Plant |
| Batteries (Y/R/B) | — | +2,000 / +25,000 / +500,000 capacity | wiki: Power Plant |

The pipe's fixed 1,000 L/tick throughput creates the actual endgame puzzle: one pipe network can feed at most ~12.5 gas turbines, so optimal layouts split the grid into multiple pipe networks separated by tanks (Steam/GitHub guide: perfect-tower2-full-guide). Spending power is its own subsystem: a boost consumes 10/25/50/100% of stored energy, a slider splits that energy between duration and potency (1%→100% against 100%→1%), and the result is **logarithmic**:

> `Boost = log10(allocated energy) × perks × BaseValue` (wiki: Power Plant)

with per-building base values (Construction Firm 4:00 / 20%, Factory 3:00 / 15%, Mine 3:20 / 18%, HQ 2:00 / 22%). The Super Boost skill changes the log base from 10 to 7 — a rare example of "upgrade the exponent's base" as a purchasable. Concurrent boosts split the energy, so breadth costs depth.

**Shipyard** (cyan; conversion 100,000:1 vs. the Mine's 120:1 — later buildings tax town resources far harder). Six voyage lengths map to resource tiers: 5 m (white), 15 m (orange/brown/red), 60 m (green/blue/purple), 4 h (yellow/lt-blue/pink), 8 h (cyan/gray/black), 24 h (gems/exotic gems). Every *collected* shipment increments a lifetime counter that scales all future rewards (Improved Decks: +0.05%/shipment, 500 levels). Sea miles accrue at `0.0002/sec × ShipmentConstant` and unlock milestone multipliers (1 mile: +10%; 250: ×town level; 1,250: +100%; 100,000: +5% per mile). A weather modifier drifts over time; weather upgrades stack additively with themselves but multiplicatively across types. The exotic capstone Import Taxes raises rewards to the power `1.1 + 0.01×log10(shipments)` — a superlinear exponent that grows with lifetime play (wiki: Shipyard).

### 3. Interconnections

All three drink from the shared town-resource pool at building-specific exchange rates, so funding one starves the others early. The Power Plant is the hub: its energy boosts the Mine (drilling and asteroid ops), Shipyard (shipment speed), Factory, HQ, Museum, Arcade, Trading Post — and, with a 100-exotic-gem skill, itself (wiki: Power Plant). The Mine feeds shards to the Factory's production chains and exotic gems to every building's exotic-skill shop. The Shipyard's 100-sea-mile milestone buffs Factory producers by +1% per shipment — deliberate cross-building coupling. Attention tension is explicit: the Mine wants clicks, the Power Plant wants one-time layout thought, the Shipyard wants scheduled check-ins.

### 4. Pacing & gating

Buildings gate on Military Tier (prestige rank from the tower-defense side): Mine and Power Plant arrive at MT0–1, Shipyard at MT2 (wiki: Progression Guides). Each building also has its own tier (Mine max 10, Shipyard max 3) bought in the Construction Firm. Early game is manual and clicky; skills purchased with each building's own currency progressively automate it (offline mining, auto-reveal), which is the game's core promise: *every minigame eventually plays itself*. Walls are legible: the ×1.5 duplicate cost and 1,000 L pipe cap wall the Power Plant until you redesign; asteroid distance walls the Mine until higher MT; the 24-hour gem voyage walls the Shipyard behind real-time patience. Long-horizon vanity goals exist too — an achievement for drilling 12,742 km, Earth's diameter (GitHub guide).

### 5. Borrowable design lessons

1. **One global stat, many local boards.** Sharing drill depth across all per-resource mining zones makes a single upgrade feel game-wide — cheap to implement, huge perceived value.
2. **Log-cost spending of a stored meta-resource.** Power's `log10(energy)` boost formula lets stored energy grow exponentially while boosts grow linearly — players always feel rich, and the economy never breaks; selling a "better log base" is a brilliant upgrade template.
3. **×1.5 duplicate pricing with full refund.** Punishes stacking one optimal part, rewards diverse layouts, and free selling invites fearless experimentation — ideal for any 3D base-building grid.
4. **Exponential greed tax.** Asteroid `1.5^(tiles−1)` time scaling turns "how much do I grab" into a real decision instead of "always take everything."
5. **Lifetime counters as compounding prestige.** Shipment count feeding both additive bonuses and a slowly growing *exponent* (Import Taxes) makes every completed loop permanently matter without a reset.
6. **Throughput-capped connectors.** Fixed pipe capacity converts a solved grid into a partitioning puzzle at scale — congestion, not cost, is the endgame constraint, which suits 3D spatial games especially well.

Sources: [wiki: Mine](https://www.perfecttower2.com/wiki/Mine), [wiki: Power Plant](https://www.perfecttower2.com/wiki/Power_Plant), [wiki: Shipyard](https://www.perfecttower2.com/wiki/Shipyard), [wiki: Progression Guides](https://www.perfecttower2.com/wiki/Progression_Guides), [Steam dev diary #34 — Asteroid Mining](https://store.steampowered.com/news/app/1197260/view/2997690640691817279), [GitHub: perfect-tower2-full-guide](https://github.com/ExpertLove/perfect-tower2-full-guide/blob/main/README.md)

---

## Museum & Gems: Combine-to-Tier Progression

### 1. What the system is

The Museum is a town building in TPT2 where the player buys elemental "Power Stones," merges identical stones into higher tiers, and equips a limited loadout of them for permanent multiplicative buffs to resource gain and elemental damage/resistance (wiki: Museum). The core loop: convert town resources into cheap tier-1 stones, combine three of a tier into one of the next tier, equip the best stones in scarce slots, and later automate the whole grind. A note on terminology that the brief conflates: in TPT2, "Gems" are a separate spendable currency (earned from the Mine, Shipyard, Military Tier-ups, Factory gem producer, and Arcade minigames) used for instant-completing timers and module upgrades (wiki: Gems; wiki: Arcade) — the Museum's combine-ladder items are Power Stones, and the late-game meta-currency is "Exotic Gems." All three are covered below.

### 2. The math

**Correction to the brief:** sources consistently document the combine as **three tier-N stones → one tier-N+1** (log-base-3, not the log2 the brief assumed) (wiki: Museum; wiki: Power_Stones). One tier-N stone therefore embodies 3^(N−1) tier-1 stones — the exponential ladder hidden in the crafting UI.

| Element | Value | Confidence |
|---|---|---|
| Tier-1 stone cost | 1,000 Grey resource, any of 8 elements | High (wiki: Power_Stones) |
| Combine ratio | 3 same-tier → 1 next-tier | High (wiki: Museum) |
| Implied tier value | tier N = 3^(N−1) tier-1 stones = 1,000·3^(N−1) Grey if self-combined | Derived |
| Resource-gain boost | +1% per equipped stone (flat) | High (wiki: Museum, Primordial Power text) |
| Primordial Power skill | changes resource boost to 1% × *total tier* summed across the loadout | High (wiki: Museum) |
| Elemental damage & resistance | ~0.5% per tier per stone, for that stone's element | Medium (Steam forum discussion; not on wiki proper) |
| Power Prism skill | completing a full set of all 9 elements (8 + universal) boosts the neutral element by the set's average tier | Medium (wiki: Museum, exact multiplier unverified) |
| Transmutation | 8 stones, one per element, same tier → 1 Universal stone of that tier | High (wiki: Museum) |
| Museum building tier | +6 inventory slots per tier, max tier 5 | High (wiki: Museum) |
| Offshore Market price | 2,000 × 18^(tier−1) per stone; Universal costs 10×; tier cap 50 | High (wiki: Museum; d0sboots museum script README) |
| Offshore stock | refreshes hourly; 5 offer slots, expandable to 10 via exotic-gem purchases | Medium (wiki: Museum) |
| Key exotic skill costs | Offshore Market 60, Ancient Potency 1,000, Artifact Replica 1,200 exotic gems | High (wiki: Museum) |
| Artifact research | timed research, cost −15%/museum tier (Research Funding), time −10%/museum tier (Faster Research), skippable with gems | High (wiki: Museum) |

The deliberate mismatch between the two exponents is the elegant part: intrinsic stone value grows 3× per tier, but offshore *prices* grow 18× per tier (18 = 3 × 6, i.e. a 6× compounding convenience premium). Buying tier N directly costs 2·6^(N−1) times more Grey than hand-combining from tier 1 — a currency sink calibrated so that only late-game exponential income makes direct purchase sane, while the community's optimizer scripts solve "highest affordable tier" as log₁₈(budget) (d0sboots museum script README).

### 3. Interconnections

- **In:** Grey resource (the town's most basic currency) buys tier-1 stones; statistics milestones (lifetime play metrics) unlock equip slots; Exotic Gems — earned by defeating each new tier of the Cubos boss (wiki/Steam forums) — unlock the Offshore Market and the skills that transform the system's scaling.
- **Out:** stone loadouts multiply elemental tower damage/resistance (feeding boss kills, which pay Exotic Gems — a closed loop) and multiply town resource gain (feeding every other building, including buying more stones — a self-reinforcing loop deliberately throttled by slot count).
- **Attention tension:** manual buy-and-3-combine is click-intensive, so the game's worker/scripting automation layer becomes the real product; community AI scripts do bulk buy/combine passes and even the wiki notes workers can automate purchasing and combining (wiki: Power_Stones). Gems-the-currency crosses in only as a timer-skip for artifact research.

### 4. Pacing and gating

Buildings, the Museum included, are gated behind Military Tier — the game's prestige track (wiki: Buildings; wiki: Military_Tier). Early on, progress is linear and tactile: buy 1,000-cost stones, watch three become one, feel each +0.5% and each new slot. Mid-game walls: inventory (base plus 6 per museum tier, max tier 5) caps how much you can batch; slot milestones cap equipped power; and the 3^N cost of the next tier turns hand-combining into a visible grind — the designed pressure toward automation. The late game re-bases the whole system twice: Offshore Market (60 exotic gems) lets you buy high-tier stones outright up to the hard cap of tier 50 on an hourly-refresh shop, and Primordial Power converts the flat 1%-per-stone resource boost into 1%-per-total-tier, retroactively making every tier climbed pay out again (wiki: Museum). The tier-50 cap plus 18^tier pricing gives the ladder a definite, budgetable endpoint rather than an open-ended treadmill.

### 5. Borrowable design lessons

1. **Hide an exponential in a merge UI.** "3 of tier N = 1 of tier N+1" makes 3^N growth feel like tidy inventory management, not a math wall — players intuit tier value without ever seeing an exponent. In a 3D game, this maps naturally onto physical crafting stations where players drop three items on an anvil.
2. **Price convenience on a steeper curve than value.** Selling tier N directly at 18^N when its intrinsic value grows 3^N creates a guilt-free late-game money sink that never obsoletes the crafting path — it only buys back time.
3. **Gate power by slots, not by ownership.** Unlimited stones but scarce equip slots (earned from lifetime stat milestones) keeps hoarding harmless and makes *choosing* the strategic act; milestones double as a retention reward for total playtime.
4. **Re-base old grinds with a late skill.** Primordial Power retroactively converts flat per-item bonuses into per-tier bonuses, instantly revaluing the player's whole collection — a cheap way to make an old system feel new without new content.
5. **Reward completionism orthogonally.** Set bonuses (Power Prism: one of every element) and transmutation (8 elements → 1 universal) give lateral goals across the ladder, so players push breadth as well as height.
6. **Design the grind to be automated.** TPT2 treats the click-heavy combine loop as fuel for its scripting/worker systems; if your incremental has an automation layer, deliberately ship one system whose manual tedium makes automation feel like a triumph rather than a patch.

Sources: [wiki: Museum](https://www.perfecttower2.com/wiki/Museum), [wiki: Power Stones](https://www.perfecttower2.com/wiki/Power_Stones), [wiki: Gems](https://www.perfecttower2.com/wiki/Gems), [wiki: Arcade](https://www.perfecttower2.com/wiki/Arcade), [wiki: Military Tier](https://www.perfecttower2.com/wiki/Military_Tier), [d0sboots museum script README](https://github.com/d0sboots/PerfectTower/blob/main/museum/README.md), [Steam forum: town perks and museum](https://steamcommunity.com/app/1197260/discussions/0/3130541122097639858/), [Steam forum: exotic gems](https://steamcommunity.com/app/1197260/discussions/0/4289188745220292823/)

---

## Prestige: Headquarters, Eras, Software & the Laboratory

### 1. What the system is

TPT2's prestige stack lives mostly in one building, the **Headquarters**, plus a sibling building, the **Laboratory**. The core loop: you run "tower testing" rounds to earn resources and level up equippable modules; when you meet a checklist of goals (regions unlocked, modules maxed, wave records), you perform a **Military Tier prestige** in the HQ, which wipes your module levels and town resources in exchange for a permanently higher power ceiling, new buildings, and new automation software. Layered above that are **Eras** (a rolling in-run counter that multiplies enemy stats every time you hit wave 100B) and **Infinity** (the same trick again, one meta-level up). The Laboratory runs twelve element-themed mini-incremental-games ("experiments") that grant permanent modules, damage/resistance bonuses, and their own internal 100-deep prestige tracks (wiki: Headquarters, Laboratory, Era, Infinity).

### 2. The math

**The reset hierarchy** (inner to outer):

| Layer | Trigger | Resets | Persists |
|---|---|---|---|
| Round | Tower dies / player ends run | Wave count, in-run buffs | XP, resources, module levels |
| Military Tier ("soft prestige") | Checklist met, button in HQ | Module levels; town resources lost but **auto-recovered over 4 h** (1 h with an exotic skill) | Buildings, gems/exotic gems, lab progress, AI scripts, software |
| Era | Reaching wave 100B in a run | Nothing is lost — era counter **increments permanently** per region; enemies get harder | Everything; era count itself persists |
| Infinity | Reaching Era 100B (MT12) | Era-layer damage becomes irrelevant (enemies gain 1e50 Era resistance); new currency loop | Everything below |

(wiki: Military_Tier, Era, Infinity)

A correction worth flagging: Eras do **not** award "era points" and are not a reset in the classic sense — the counter only goes up, and the game instead sells you *divisors* against the scaling it imposes. Enemy HP and damage per era scale as:

`mult = 10^(20 × era^(1 − level/300 × 0.78) / (level + 1))`

where `level` = Workshop "Era Divisor" upgrades purchased. Divisors cut the multiplier by **8× per level**; first purchase costs **100,000 XP**, reducible to a floor of **213 XP** after 240 total upgrades. After a few hundred eras the raw multiplier overflows a double (1.8e308) (wiki: Era — formula reproduced from the wiki; treat exact constants as wiki-sourced, not datamined).

**Military Tier checklist scaling** (selected rows; full table wiki: Military_Tier):

| MT | Requirements (abridged) | Key unlock |
|---|---|---|
| 1 | 10 modules maxed, 3 regions | Module tier cap 2 |
| 4 | 60 modules maxed, 9 regions | **Facility AI** (scripting) |
| 6 | 120 modules, total tier ≥625, 15 regions, Boss 2 | Town perks |
| 8 | 150 modules, tier ≥825, **Era 1 reached** | Era Workshop |
| 10 | 200 modules, tier ≥1250, Era 1000 | Boss 4 |
| 12 | 225 modules, tier ≥1625, **Infinity 1** | Infinity Workshop |
| 15 | 300 modules, tier ≥3000, Infinity 25 in 15 regions | Final boss |

**HQ hardware** (buys compute that installs/runs software): CPU has 20 tiers — cost `5^tier × 2`, speed `4^tier × 25 Hz`; RAM has 20 tiers — cost `6^tier × 2.5e7`, capacity `4^tier KB`; up to 24 servers, each MT adding 2 server slots. Script instruction budget: `(⌊log₁.₄₅₉(totalRAM)⌋ + 1) × 100` (wiki: Headquarters — medium confidence on exact bases; the shape, geometric cost with geometric payoff, is solid).

**Software** is bought with resources, then must be *processed* (a real-time compute timer measured in flop-seconds/days) before it activates. The catalog is a ladder of wave-speed multipliers: Autoskip (removes inter-wave delay) → Wave Streaming (+0.1 wave-acceleration/sec) → Wave Surge (5× streaming) → Critical Wavejump (1% chance to skip 5% of your wave record) → Wave Momentum (extra wave per kill) → Era Surge (skip to next era every 10 waves) → Wave Restart (new rounds start at previous record). Prices span ~50 resources to ~5e25 (wiki: Headquarters — magnitudes per wiki, unverified against the build).

**Laboratory**: converts town resources to lab resources at **400:1**; six building tiers unlock experiment pairs (T1 Neutral/Fire … T6 Gems/Exotic). Experiments reward modules, elemental **damage bonuses (cap +200%)** and **resistances (cap 99%)**, and each can be **prestiged up to 100 times**, trading progress plus resources for a compounding permanent bonus — e.g., Fire prestige resets temperature/heaters/tickers and grants +1% per manual purchase of one chosen upgrade type; max temperature scales as `1e6 × max((level−1)^12, 1) °C`, with module rewards at fixed thresholds (100 °C, 3,000 °C, 75,000 °C…) and repeatable bonuses at `500 × 1.34^lvl` °C (wiki: Laboratory, Experiment: Fire). Lab prestiges also carry *negative* side-effects, removable only via 500-exotic-gem skills.

### 3. Interconnections

The HQ is the spine everything plugs into. Tower testing feeds resources → resources buy HQ hardware → hardware processes software → software multiplies wave speed → faster waves feed XP and resources back. MT4's Facility AI is the hinge: it converts every other building (mine, factory, museum) from manual chores into scriptable background processes, so prestige here literally purchases *attention relief*, not just power. The Laboratory pulls from the same resource pool at a punishing 400:1 rate — a deliberate tension between spending on immediate tower power versus permanent elemental caps. Era divisors consume run XP, competing with module leveling. The recoverable-resource prestige (4-hour drip-back) removes the classic "prestige dread" almost entirely: the only real cost of a tier-up is module re-leveling time.

### 4. Pacing & gating

Gating is checklist-based, not currency-threshold-based: each MT demands breadth (regions, module count) *and* depth (total tier, wave/era records), so you can't rush one axis. Early tiers fall in hours-to-days; the MT7→8 jump — requiring wave 100 *billion*, i.e., the first Era — is the notorious wall, reported at ~2 weeks of daily play (Steam discussion, anecdotal). The wall is by design soluble only through the software ladder: raw damage can't reach 100B waves in real time; stacked wave-skipping multipliers can. Era phase (MT8–11) then demands Era 1000 → Era 10M, and Infinity restarts the whole rhythm. Cycle length thus stretches from ~hours (MT1–3) to weeks per tier late; the game compensates by making late "resets" (Eras) lossless counters rather than true wipes.

### 5. Borrowable design lessons

1. **Sell time-compression as the prestige reward.** TPT2's software tree is almost entirely wave-*speed*, not damage — each prestige tier makes the next cycle mechanically faster. In a 3D RPG: prestige unlocks that skip trash fights, auto-resolve cleared dungeons, or fast-forward travel.
2. **Refund the reset on a timer.** Resources lost at prestige drip back over 4 hours, converting a scary wipe into a short cooldown — huge for retention with minimal power inflation.
3. **Late-game "resets" that only count up.** Eras impose exponential enemy scaling you *buy down* with divisors instead of wiping the player — the prestige feeling without the prestige cost, and the overflow-proofing lives in the divisor math.
4. **Checklist prestige gates.** Requiring breadth + depth (N zones, N maxed skills, one record run) makes each cycle a varied tour of the game rather than one grinded number.
5. **Prestige-purchased automation.** Locking scripting/AI behind mid-tier prestige turns "less busywork" into the most desired reward in the game — and ramps engagement cost down as content scale ramps up.
6. **Micro-prestiges inside subsystems.** Each lab experiment carrying its own 100-deep prestige (with opt-in downsides removable later) gives dozens of small, low-stakes reset loops nested inside the big one — good texture between major walls.

Sources: [wiki: Headquarters](https://www.perfecttower2.com/wiki/Headquarters) · [wiki: Military_Tier](https://www.perfecttower2.com/wiki/Military_Tier) · [wiki: Era](https://www.perfecttower2.com/wiki/Era) · [wiki: Infinity](https://www.perfecttower2.com/wiki/Infinity) · [wiki: Laboratory](https://www.perfecttower2.com/wiki/Laboratory) · [wiki: Experiment: Fire](https://www.perfecttower2.com/wiki/Experiment:_Fire) · [Steam: MT8 discussion](https://steamcommunity.com/app/1197260/discussions/0/5733650980544925971/)

---

## The AI Scripting System: Automation as Endgame Content

### 1. What It Is

The Perfect Tower II's "facility AI" is a full in-game scripting language, unlocked deep into progression, that lets players automate essentially the entire game: restarting tower-defense runs, batch-crafting in the factory, mining, market arbitrage in the museum, even playing the arcade minigames. Players write small event-driven programs — each a list of *impulses* (triggers), *conditions* (guards), and *actions* (statements) — inside an editor housed in the Headquarters building. Where most idle games sell you "auto-buy" toggles, TPT2 sells you a computer, then makes upgrading that computer (CPU speed, RAM, server count) its own resource-driven progression track. Anything without a scripting API can still be automated via simulated mouse clicks on UI coordinates, so coverage is effectively total (wiki: AI).

### 2. The Math

**The language.** Scripts are impulse → condition → action lists. Impulses include key presses, entering a building, and "wake up" (AI toggled on, F4). Conditions are boolean guards; if any fails, the impulse is ignored. Actions run sequentially top-down. Data types: `bool`, `int` (±2,147,483,647), `double`, `string`, `vector2`. Variables come in local (per script instance) and global (shared, persistent, inspectable in the F4 overlay) scopes. Control flow is `goto`/`gotoif` — no structured if/else — and scripts can `execute` other scripts, which are appended to the active-script list and begin running the same tick (wiki: Using the AI; external editor manual, d0sboots).

**Hard caps per script and system-wide** (wiki: AI / Using the AI):

| Limit | Value | Confidence |
|---|---|---|
| Impulses per script | 10 | verified |
| Conditions per script | 10 | verified |
| Actions (lines) per script | 50 | verified |
| Concurrent active scripts | 100 (exceeding shuts the AI down) | verified |
| Click coordinates | relative 0.0–1.0, resolution-independent | verified |

**Execution speed is a purchasable stat.** Legacy model: each active script executes exactly one action per game tick, in activation order. Modern model: each script gets an *execution budget* per tick — "atomic" actions (math, variable ops) cost 0, everything else costs 100 — so a bigger budget means more real actions per tick (wiki: AI). Budget is derived from total RAM installed across the Headquarters' servers:

| Hardware knob | Formula / value | Confidence |
|---|---|---|
| Execution budget | (⌊log₁.₄₅₉(totalRAM)⌋ + 1) × 100 | verified (wiki: Headquarters) |
| Max budget | ~10,000–10,100 with all servers at max RAM | verified; wiki pages disagree on 16 vs 24 max servers (likely patch drift) |
| RAM tier cost | 6^tier × 2.5e7 (resource units); max 1.1 PB/server | verified (wiki: Headquarters) |
| CPU tier cost | 5^tier × 2; speed = 4^tier × 25 Hz, max 27.49 THz/server | verified (wiki: Headquarters) |
| Server slot cost | ~2 units for server #1 up to ~1e23 for the last | verified order-of-magnitude (wiki: Headquarters) |

CPU (measured in flops) doesn't speed scripts — it speeds *software research*, timed installs costing from 50 up to ~1.5e30 of the HQ's resource, several of which unlock AI features themselves. So the automation stack has three exponential ladders (servers, CPU, RAM) feeding two different outputs (research throughput, script throughput).

**The pre-AI tier: workers.** Before scripting, Military Tier 1 unlocks workers — dumb single-task automators bought with gems at 100×3^(x−1) for the xth worker, capped at 1+Military Tier, with click interval upgrades (5s → 2s → 1s → 0.5s at 1k/10k/100k gems) (wiki: Workers). Workers are deliberately crude; the AI obsoletes them, and that obsolescence *is* the reward.

### 3. Interconnections

The AI sits at the top of the dependency graph. **Feeding it:** Military Tier (prestige track) gates the unlock at Tier 4; the Headquarters' purple resource buys servers/CPU/RAM; CPU-time gates the software installs that extend AI capability. **Fed by it:** everything — tower run restarts, factory production chains, mine clearing, museum stone combining, resource routing. This creates a distinctive tension: currency spent on AI hardware is currency *not* spent on direct power, and time spent writing scripts is time not spent playing — but a good script multiplies all future throughput. Attention economics invert at this point: the game shifts from "click the right things" to "specify the right behavior," and the 100-script / 50-line / budget caps force optimization of the programs themselves (fewer, tighter scripts; atomic-action tricks). One notable seam: worker names/groups have no intrinsic effect but are readable by scripts, letting the old system become addressable infrastructure for the new one (wiki: Workers).

### 4. Pacing & Gating

Automation arrives in three deliberate stages: manual play (learn the systems) → workers at MT1 (crude, interval-based relief for the worst chores) → full AI at MT4 + software research (total automation). Early AI is slow — low budget means one effective action per tick, so an auto-miner visibly grinds. The walls are exponential hardware costs (6^tier RAM, ~1e23 for the final server slot), which stretch "my scripts run instantly" across the whole endgame. Crucially, scripts only run while the game is open and the relevant building's window state matters, preserving *some* engagement constraint (wiki: AI). Machine learning (F7 macro recording) lowers the floor for non-programmers by recording clicks into script form, while import strings let players paste community scripts — imported scripts arrive disabled by default for review, a small but smart safety choice (wiki: AI). The ceiling, meanwhile, is community-raised: the external compiler (Kyromyr's, now maintained at d0sboots.github.io/perfect-tower) adds named variables, labels, comments, macros, constant folding, and Lua metaprogramming, all compiling down to vanilla import strings — an entire third-party toolchain grown on top of a 50-line assembly-like VM.

### 5. Borrowable Design Lessons

1. **Sell compute, not toggles.** Making script *throughput* (RAM→budget) and *research speed* (CPU) purchasable turns automation from a QoL checkbox into two full exponential upgrade ladders — in a 3D game, this maps naturally to buildable/visible server rooms or drone bays.
2. **Stage automation as crude → programmable.** Workers-then-AI makes players feel the pain, buy partial relief, then earn total mastery; the obsolescence of the old tier is itself a progression beat.
3. **Constrain the VM, not the ambition.** Caps (50 lines, 100 scripts, per-tick budgets) turn scripting into an optimization game with its own skill curve, and give you cheap knobs to sell later.
4. **Provide a click-simulation fallback API.** Letting scripts click relative screen coordinates guarantees 100% automation coverage without you writing an API for every subsystem — huge scope savings; in 3D, the analog is "issue any input the player could."
5. **Make scripts portable text.** Import/export strings (arriving disabled for review) created a script-sharing economy — wiki repositories, GitHub collections, Steam guides — that generates endgame content for free.
6. **Design for an external toolchain.** A simple, stable, documented script format let the community build a superior compiler with macros and Lua preprocessing; your in-game editor only needs to be adequate if your format is hackable.

Sources: [wiki: AI](https://www.perfecttower2.com/wiki/AI), [wiki: Using the AI](https://www.perfecttower2.com/wiki/Using_the_AI), [wiki: Headquarters](https://www.perfecttower2.com/wiki/Headquarters), [wiki: Workers](https://www.perfecttower2.com/wiki/Workers), [wiki: AI Scripts Guide (archived)](https://www.perfecttower2.com/wiki/AI_Scripts_Guide), [d0sboots external editor manual](https://github.com/d0sboots/perfect-tower/blob/main/manual.md), [d0sboots script repo](https://github.com/d0sboots/PerfectTower).

---

## Military, Arcade, Statue of Cubos & Side Systems

*(Note for the reader: TPT2's "Military" is not a units-and-campaign system — it is the game's meta-prestige track housed in the Headquarters. The closest thing to "sending units on missions" is the Shipyard, covered below.)*

### 1. Military Tier — the prestige spine (Headquarters)

**Loop.** The Headquarters (purple resource, 750:1 conversion) hosts the Military Tier, described by the wiki as "the game's prestige system." Each of 15 tiers has a bespoke checklist — max out N modules, unlock regions, reach wave/Era/Infinity milestones, defeat bosses — and prestiging resets all modules to base level while granting one Military Perk point plus new buildings, bosses, and "software" (wiki: Military Tier, Headquarters).

**Math & structure (wiki: Military Tier, Military Perks, Headquarters):**

| Element | Documented values | Confidence |
|---|---|---|
| Tiers | 15 total; requirements shift from module counts (early) to Era 1,000+ and Infinity tier 25 (late) | High |
| Total-module-tier requirement | jumps ~625 → 3,000 across late tiers | High |
| Post-prestige recovery | town resources regenerate over 4 h (1 h with Trustworthy Trust Fund exotic skill) | High |
| Perks | 1 point per tier; groups of 3 perks per band (MT1–3, 5–7, 9–11, 13–15); a Power Plant/Mine/Factory specialization every 4th tier; all perks eventually maxable | High |
| Servers/CPU | each tier adds 2 server slots (3 with skill); CPU tier cost ≈ 5^tier × 2, RAM scales logarithmically | Medium |
| Software costs | Wave Streaming 250 k → Wave Surge 7.5 M → Critical Wavejump 22.5 M → late software ~1.5e30 | Medium |

**Design shape.** Two elegant ideas: (a) prestige requirements are *curated checklists that change every reset*, so each prestige is a distinct scenario rather than "same climb, bigger number"; (b) the perk system is choice-order, not choice-exclusion — you pick *which* perk first, but all are eventually owned, so choices feel strategic without permanent regret. Software is the automation dividend: each prestige buys back speed (wave acceleration, wave-skipping), converting player patience into permanent throughput. Tier 4 unlocks the Facility AI, a full player-facing scripting system that automates other buildings (wiki: Headquarters) — automation is a *reward*, not a setting.

### 2. Shipyard & Trading Post — real-time "missions" and hourly markets

**Shipyard loop.** Send ships on timed shipments; longer timers return rarer resource colors: 5 min (white) → 15 min → 60 min → 4 h → 8 h → 24 h (gems/exotic gems). Each completed shipment additively grows a per-shipment reward bonus (Improved Decks: +0.05%/level, 500 levels), and ships passively accrue "sea miles" at 0.0002/sec × ShipmentConstant, with milestone unlocks at 1 / 250 / 100,000 miles (10% boost; rewards × town level; +5% per mile additive) (wiki: Shipyard). Confidence: high for timers, medium for constants.

**Trading Post loop.** Random resource-for-resource deals at equal value, **reset every hour** on a visible timer; executing trades earns "crates" that feed ~10 upgrade tracks (Tower/Factory/Shipyard bonuses) with power and logarithmic scaling (wiki: Trading Post). Formulas exist per-track but are not fully enumerated on the summary page — treat specifics as unverified.

**Hook.** These are TPT2's only real-clock appointment mechanics: shipments and hourly deal refreshes give lapsed-player re-entry points without any monetized energy system. The tension is attention-based — 24 h shipments are efficient for idlers; 5 min loops reward active check-ins.

### 3. Arcade — minigames as gacha with skill dials

**Loop.** A pink building (25,000:1 conversion, 4 tiers, one minigame per tier): **Lucky Wheel** (spin for resources, up to 100 skillpoints, cards, 6 modules; refresh on a cooldown, manual refresh gated behind the Fate Forging skill), **Jumble** (wager resources on a slot-like tile matcher — bigger wagers raise reward-tile probability; community math says ~18,000 luck guarantees all rows, unverified), **Adventure** (procedurally generated 256×256 roguelite dungeon), and **Perfect Space** (a full shmup with ships, pilots, weapons, XP levels) (wiki: Arcade).

**Documented math (wiki: Arcade):**

| System | Formula / values | Confidence |
|---|---|---|
| Adventure enemies | HP = round(dist × 0.38 + 1); armor = round(dist × 0.08); attack = ceil(dist × 0.39), cap 99 | Medium-high |
| Adventure "cheats" (token sinks) | Hearts 5 × 1.2^lvl; Armor 100 × 3.5^lvl; Keys 20 × 1.2^lvl; Bombs 60 × 1.4^lvl | Medium-high |
| Reward gating by distance | tokens dist 1+, gems dist 10+, artifacts dist 25+, skillpoints in 5 groups across dist 5–100 | High |
| Perfect Space leveling | XP to level = 100 × (level + 1), excess carries; endless scaling +1%/s HP, +2%/s bullet damage | Medium |
| Card set | 55 cards, 11 categories, 6 tiers each; tier rewards 1/2/3/5/8/13 skillpoints (32 per category) | High |
| Ship/weapon unlocks | 5,000 tokens per ship; weapons 10–20 k tokens or beat boss with previous weapon | Medium |

**Hook.** The Arcade launders grind into *variety*: four genuinely different game genres all pay out the same meta-currencies (tokens, skillpoints, modules, cards). The card collection is a Fibonacci-paced completionist layer, and each minigame drops modules usable in the main tower — so "goofing off" is always main-line progression. Exotic skills (Metallic/Spiked/Charged Tokens) even convert arcade currency into permanent tower stats.

### 4. Statue of Cubos — boss gauntlet and the exotic-gem faucet

**Loop.** A black-resource building (250,000:1) containing five hand-crafted boss fights, each a different genre: pillar-dodging (Cylindro), weapon combat (Pyramidas), rhythm grid battle on a 7×7 board (Cubos Jr.), card-battler (Dodecai), and the endgame spell-sequence fight Thorus, which literally sells *insurance* (100 QiD / 1 NoD / 10 DVi black resources) against failure (wiki: Statue of Cubos). Bosses unlock along the Military Tier track; Thorus additionally requires all Infinity Stones.

**Math.** First-kill-per-tier pays 10–100 exotic gems by boss; repeat combat XP follows 15 × (tier−1)² + 6 (wiki: Statue of Cubos; medium confidence). Each of the first four bosses unlocks 7 modules; 3 equippable (4 with the 1,500-gem Cyanotypes exotic skill). Notable skills: Divine Gamble (10% base chance of 2× damage, +0.1% per order of magnitude of *unspent* resources — a rare anti-spending incentive), Second Chance (negate one lethal hit), Victory Boost (+50% HP/shield/damage per tier up to 25, then +1%), Eternal Conflict (rematches pay 1/10 rewards, 250 gems).

**Hook.** Bosses are skill checks punctuating an idle game — earned, scarce, and the main faucet for exotic gems, the game's un-purchasable premium-feeling currency (wiki: Exotic gems). Repeatable-but-decimated rewards (1/10) let completionists grind without invalidating the first-kill spike.

### 5. Laboratory experiments, achievements, and events

The **Laboratory** (green, 400:1, 6 tiers) is TPT2's "academy": 12 experiments, two per tier, each an explicit *mini incremental game* whose progress pays modules, elemental damage (cap +200%) and resistance (cap 99%); most experiments individually prestige up to 100 times for permanent bonuses (wiki: Laboratory). It's fractal design — a prestige game nested inside a prestige game. **Achievements** (~100+, including hidden and seasonal Halloween/Winter event sets) exist but documented rewards are absent from the wiki — treat them as goal-signposting, not economy (wiki: Achievements). Cosmetics are essentially absent; the game spends its novelty budget on mechanics instead.

### 6. Borrowable design lessons

1. **Make prestige a changing checklist, not a repeated climb.** Per-reset bespoke requirements (regions, bosses, module counts) turn each prestige into a new puzzle — ideal for structuring a 3D game's rebirth loop around *different zones/activities* each cycle.
2. **Sell automation as progression.** Servers, software, and a scriptable AI are late-game rewards that retire early-game busywork; in a 3D game, let players earn NPC crews/drones that replay content they've mastered.
3. **Many genres, one economy.** Arcade minigames and boss fights in five different genres all feed shared currencies and equipment — a 3D game can route combat, racing, and puzzle side-modes into the same upgrade tracks so variety never feels off-path.
4. **Real-clock timers as free-to-play rhythm without monetization.** Shipment tiers (5 min → 24 h) and hourly trade resets create check-in cadence purely for retention, not revenue.
5. **First-kill spikes with decimated repeats.** 10–100 exotic gems once per boss per tier, then 1/10 on rematch, preserves event-feeling rewards while keeping grinders fed.
6. **Nested prestige (fractal incrementals).** Lab experiments that are themselves 100-prestige mini-incrementals give short-horizon dopamine inside a long-horizon meta — perfect for side-content pacing in a large RPG.

Sources: [wiki: Military Tier](https://www.perfecttower2.com/wiki/Military_Tier), [wiki: Military Perks](https://www.perfecttower2.com/wiki/Military_Perks), [wiki: Headquarters](https://www.perfecttower2.com/wiki/Headquarters), [wiki: Arcade](https://www.perfecttower2.com/wiki/Arcade), [wiki: Statue of Cubos](https://www.perfecttower2.com/wiki/Statue_of_Cubos), [wiki: Shipyard](https://www.perfecttower2.com/wiki/Shipyard), [wiki: Trading Post](https://www.perfecttower2.com/wiki/Trading_Post), [wiki: Laboratory](https://www.perfecttower2.com/wiki/Laboratory), [wiki: Achievements](https://www.perfecttower2.com/wiki/Achievements), [wiki: Exotic gems](https://www.perfecttower2.com/wiki/Exotic_gems)

---

## Distilled Playbook

Each chapter carries its own lessons; these are the cross-cutting ones — with an eye to what TPT2 adds *beyond* the other games in this series.

### Architecture

- **Combat as resource pump.** Rounds that always end in death stay low-stakes and infinitely repeatable; all permanence lives in the town. In 3D: dungeon runs feed a base-building layer, and "losing" a run is just the harvest event (compare FAPI's death-as-harvest — same insight, different genre).
- **One universal drop, per-system exchange rates.** A single farmable currency with fixed per-building conversion ratios (spanning 50:1 to 250,000:1) paces a dozen subsystems from one tunable table — and expensive-not-locked systems read as *earned* when you finally afford them.
- **Every building is a different verb.** Retain players by making each hub a distinct genre sharing one wallet. This is the pattern a 3D game can execute better than any 2D idle: the factory, mine, power plant, and arcade can be actual walkable spaces.
- **A 2D lattice beats a 1D ladder.** Region × difficulty gives small horizontal steps and huge vertical steps — players choose *which* wall to hit, and always have a sidegrade when stuck. One universal gate ("wave 100") makes a 15×6 content matrix self-explanatory with zero tutorial.

### Automation (the centerpiece)

- **Stage it: manual → crude workers → programmable AI.** Feel the pain, buy partial relief, earn total mastery. The obsolescence of the worker tier is itself a progression beat.
- **Sell compute, not toggles.** Script throughput priced as RAM, research speed as CPU, capacity as servers — automation becomes two exponential upgrade ladders instead of a settings menu. In 3D: visible server rooms, drone bays, golem workshops.
- **Constrain the VM, not the ambition.** Caps (50 lines, 10 impulses, 100 scripts, per-tick budgets) turn scripting into an optimization game with its own skill curve — and give you knobs to sell later.
- **Provide a click-simulation fallback.** Letting scripts issue any input the player could guarantees 100% automation coverage without writing an API per subsystem.
- **Make scripts portable text, imported disabled-by-default.** The share economy (wiki repos, GitHub, external compilers with macros and Lua) is free endgame content — your in-game editor only needs to be adequate if your format is hackable.

### Prestige & pacing

- **Checklist prestige, different every tier.** Breadth + depth requirements (zones, maxed skills, record runs) make each reset a curated tour instead of a repeated climb.
- **Refund the reset on a timer.** Resources drip back over 4 h — prestige dread becomes a coffee break. (Compare FAPI's watermarked currency: two different cures for the same anxiety.)
- **Late resets that only count up.** Era counters + purchasable divisors give the prestige *feeling* without the wipe, and the divisor math doubles as overflow protection.
- **Sell time-compression as the prestige dividend.** The software ladder is almost entirely wave-*speed* (autoskip, streaming, wavejump) — each cycle makes the next mechanically faster, which is what prestige is emotionally *for*.
- **Nested prestige.** Twelve Laboratory experiments, each its own 100-deep mini-incremental with opt-in downsides — short-horizon texture inside long-horizon walls.

### The math toolkit

- **Exponentiate matchups by difficulty** (`(Eff)^Fac`): soft onboarding, hard mastery, one constant.
- **Log-shaped reward curves steer session length** (`log₁₀(wave/10)` drops): short-run looting vs. long-run banking from one formula, no rules text.
- **Log-cost spending of stored meta-resources** (`Boost = log₁₀(energy) × base`): stores grow exponentially, boosts grow linearly, the economy never breaks — and "upgrade the log base" (10→7) is a brilliant purchasable.
- **×1.5 duplicate pricing with full refund** (Power Plant): punishes spamming the best part, invites fearless redesign.
- **Exponential greed tax** (asteroid `1.5^(tiles−1)`): "how much do I grab" becomes a real decision.
- **Merge ladders with convenience premiums:** 3-to-1 combining hides `3^tier` in inventory management; direct purchase at `18^tier` sells time back without obsoleting the craft path; a late skill (flat-per-stone → per-total-tier) re-bases the whole collection retroactively.
- **Lifetime counters with growing exponents** (Shipyard's `reward^(1.1+0.01·log₁₀(shipments))`): every completed loop matters forever, no streaks, no resets.
- **First-kill spikes with decimated repeats** (boss gems ÷10 on rematch): event-feeling rewards that stay grindable.
- **Arithmetic level costs + geometric tier costs** (`+1/level`, `×12/tier`, tier-up resets level): two purchase cadences from one track.

### What TPT2 adds to the series

NGU contributes the multiplier chain; FAPI the sprawl lifecycle; Idle Spiral the math library; RuneScape identity and economy; Crashlands friction-deletion. TPT2's contribution is twofold: **automation as the product** — the only game in the series that makes *programming itself* the endgame, with compute as the upgrade currency and a community toolchain as free content — and **the many-verbs-one-wallet town**, the single most directly transferable architecture for a 3D incremental, where each subsystem is a distinct genre in a distinct physical space feeding one economy.

---

*Compiled 2026-07-19 from the TPT2 community wiki (perfecttower2.com/wiki), Steam guides/discussions, official dev diaries, and community tooling repositories (d0sboots/PerfectTower). The game itself is an IL2CPP build whose logic could not be decompiled locally; formulas are as documented by the community, with confidence flagged per table.*
