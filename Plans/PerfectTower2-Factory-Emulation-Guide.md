# Emulating the TPT2 Factory — A Builder's Guide

*Companion to [PerfectTower2-Design-Reference.md](PerfectTower2-Design-Reference.md). That document describes what the Factory is; this one is a blueprint for building your own. Verified TPT2 constants are cited (wiki: Factory); everything labeled "recommended" is my tuning guidance for a new game, not TPT2's value.*

---

## 1. Why the Factory works — the anatomy in one page

The Factory is the most beloved system in TPT2 because it's a *real game inside the idle game* — but its genius is structural, not thematic. Six properties do all the work:

1. **Items are physical, currencies are abstract.** Everything else in TPT2 is a number in a wallet. The Factory deals in *objects* — ore, dust, ingots, plates, wires — that occupy inventory slots and pass through machines. Tangibility is the reward; scarcity of slots is the puzzle.
2. **Machines are verbs, not recipes.** An Oven *smelts*, a Crusher *crushes*, a Presser *presses*. The player learns ~9 verbs once, and every material family flows through the same verbs. Content scales by adding *materials*, not by authoring hundreds of bespoke recipes.
3. **The chain is 3–5 steps deep — no deeper.** Ore → dust → ingot → plate → dense plate. Deep enough that routing feels like manufacturing, shallow enough to hold in your head without external tools.
4. **Its terminal product is *income*, not items.** The best things you can build are **producers** — placeable objects that passively generate the currencies of *every other system in the game*, even offline. This is why the Factory never becomes obsolete: all late-game throughput routes through it.
5. **The pain is designed, and the cure is content.** Manual crafting is deliberately allowed to become miserable at scale — and then the game sells you the Crafter, the Fabricator, and finally a scripting language. Automation is the Factory's own endgame.
6. **Two cost curves oscillate.** Recipe *times* grow only linearly with material tier, but machine *speed* upgrades grow as 2^tier. Each new material tier briefly hurts, then reinvestment trivializes it — a sawtooth of friction and relief that gives the system its rhythm.

If you copy nothing else, copy #2, #4, and #5. They are the load-bearing walls.

---

## 2. The system skeleton — seven components

Build these seven pieces and you have a Factory. TPT2's actual math is given for each, then a recommended starting value for your game.

### 2.1 The input gate (raw material intake)

TPT2 feeds the Factory from the Mine via **shard refining**: a refine must contain **at least as many distinct shard types as the target ore tier** AND exceed a batch-size breakpoint that grows ~×5 per tier (T1 = 12.5 → T5 ≈ 26,920 → T10 ≈ 1.01e8), at a base 5 s per shard (wiki: Factory).

**Why it's good:** intake is a small optimization puzzle (variety × quantity), not a passive faucet, and it couples the Factory to a *different* subsystem (the Mine) so neither is self-sufficient.

**Recommended:** `intake(t)` requires `t` distinct input types and batch size `B₀ · 5^(t−1)`. Feed it from whatever your 3D game's gathering loop is — mining nodes, salvage, creature parts.

### 2.2 The transformation graph (machines as verbs)

TPT2's machine table, with base durations in *material tier* `t` (1–10) — all verified (wiki: Factory):

| Machine (verb) | Converts | Base duration |
|---|---|---|
| Oven | ore/dust → ingots | 1.25t + 0.25 s |
| Crusher | ore → dust | 2t − 1 s |
| Crusher | ingots → dust | 0.5t + 0.25 s |
| Presser | ingots → plates | t + 1 s |
| Presser | plates → dense plates | 3t s |
| Shaper | ingots → rods | t s |
| Shaper | rods → rings/nuts | 1.5(t+1) s |
| Shaper | plates → pipes | 5(t+1) s |
| Refiner | ingots → cables → wires | t s each |
| Refiner | plates → circuit plates | 3t s |
| Assembly | cables → circuit wires | 2.5t + 5.5 s |
| Cutter | rods → screws/bolts | t s |
| Boiler | blocks → dense blocks | 50t s |

**The pattern to copy:** every duration is **linear in tier** (`a·t + b` with a ∈ [0.5, 5]). Never make recipe time exponential — the exponential lives in quantities demanded and machine speed, not in the recipe itself.

**Recommended:** 5–7 verbs is plenty for a first version. Pick verbs that read physically in 3D: smelt, crush, press, cut, wind, assemble. Give each verb ONE parameterized recipe template: `press(ingot[t]) → plate[t], time = t + 1`. Your content pipeline then scales by adding material families and tiers — zero per-recipe authoring.

### 2.3 The tier ladder with catalytic up-tiering

TPT2's dust up-tier rule (wiki: Factory, community notes): **8 dust of tier t + 1 dust of tier t+1 → 2 dust of tier t+1**, reducible to 4+1 with a late skill. The Boiler can also *down-tier* dust (2(t+1) s).

**Why it's brilliant:**
- The "+1 higher as catalyst" means you can't bootstrap a tier from nothing — you must *first* earn a sample of tier t+1 legitimately (via the intake gate), then the up-tier path lets surplus flow upward.
- The implied exchange rate (8→1 net) anchors tier value at roughly `8^t` — an exponential ladder hidden in a crafting rule, same trick as the Museum's 3-to-1 stone merge.
- The **down-tier path prevents dead stock.** Every hoard is always convertible to something useful. Never ship a tier ladder without the descent valve.
- Selling a *reduction of the catalyst ratio* (8→4) as a late upgrade is a perfect prestige-shop item: it halves the effective cost of every future tier climb.

**Recommended:** copy this rule almost verbatim. `k` lower + 1 higher → 2 higher, with k = 6–10, purchasable down to k/2.

### 2.4 Mastery shortcuts (optional-knowledge efficiency)

Crushing ore to dust *before* smelting **doubles ingot yield per ore** (wiki: Factory). Nothing tells you this; the naive path (smelt ore directly) works fine, just worse.

**The pattern:** hide a 2× efficiency inside an extra routing step. Players who study the graph get paid; players who don't are never blocked. This is the cheapest "skill expression" an economy system can have. Put one such shortcut in every material family.

### 2.5 Speed reinvestment (the sawtooth)

Machine upgrades multiply speed by **2^(machineTier−1)** — ×1 at tier 1 up to ×512 at tier 10 (wiki: Factory) — and each Factory building tier adds inventory slots and widens the crafting grid.

**The loop this creates:** new material tier arrives → everything feels slow (linear time × bigger quantities) → you reinvest crafted goods into machine tiers → 2^n speed makes the old tier trivial → repeat. Costs of machine upgrades should be paid *in factory outputs* (plates, circuits), so the factory eats its own production — the first sink is itself.

**Recommended:** speed = `2^(tier−1)`, machine upgrade cost = a recipe requiring the *current* tier's mid-chain products in quantities growing ~×6–8 per tier.

### 2.6 Terminal products — export income, not items

This is the most important architectural decision in the whole system. TPT2's Factory end-products are:

- **Producers** — placeable items that passively generate the currencies of other town buildings, even offline; output grows superlinearly with producer tier ("one or two higher tiers outproduce a stack of the tier below" — wiki: Factory).
- **Machines** — the factory's own upgrades (see 2.5).
- **Parts** for module crafting (the combat layer's gear).

And a critical negative finding from the research: other buildings' upgrade projects do **not** directly consume factory items (wiki: Construction Firm) — they consume *currencies that producers generate*. The Factory exports **income streams**, not widgets.

**Why this matters for you:** if every other system consumed factory items directly, the Factory would become a chore-gate in front of all content, and its throughput would need constant rebalancing against every consumer. By exporting *generators*, the Factory's output is one clean number per producer (currency/sec), trivially tunable, and building it feels like installing infrastructure rather than filling orders. In your 3D game: the factory's masterworks should be *engines you place in the world* — a shrine that generates mana/sec, a drone that mines gold/sec — not stacks of consumables.

**Recommended:** producer output `= P₀ · 8^(tier−1)` per second into the target system's currency; require one mid-chain item from *every* verb to craft a producer (forces full-graph engagement).

### 2.7 The constraint that makes it a puzzle

TPT2's factory is **Factorio-in-an-inventory** — there are no belts and no spatial routing. The puzzle is batching, slot management, and sequencing, not layout. (TPT2 puts its spatial puzzle in a different building — the Power Plant, with its 1,000 L/tick pipe caps.)

**The decision you face in 3D:** inventory-factory (TPT2-style) vs. spatial factory (Satisfactory-style). The inventory-factory is *dramatically* cheaper to build, easier to automate cleanly, and still satisfying — and you can stage a spatial system later as a separate building/area, exactly as TPT2 did. **Recommendation: start inventory-style, with physical machines in a walkable 3D space** — the player carries batches between visible, animated stations. You get the tangibility of a 3D factory without simulating conveyance. If the factory lands, a belts-and-pipes area becomes your expansion content.

---

## 3. The pain → automation arc (do not skip this)

TPT2's Factory is deliberately manual — drag items into slots, wait, extract — and the game *lets that become miserable* as chain depth × quantity grows. Then it sells the cure in stages:

| Stage | TPT2 mechanism | What it automates |
|---|---|---|
| 1. Manual | drag & drop, timers | nothing — teaches the graph |
| 2. Crude workers | gem-bought clickers (5 s → 0.5 s intervals) | single repetitive clicks |
| 3. In-factory automation | **Crafter** (scan items — *consuming them* — to learn their recipe), **Fabricator** (order N of an item, auto-built from "mass"), **Dissolve** (any item → mass) | whole recipes, on demand |
| 4. Full scripting | the Facility AI (50-line scripts, RAM-priced execution budget) | everything, including the factory |

Three lessons from TPT2's live history, all documented in community discussions:

1. **Build the automation API into the factory from day one.** TPT2's scripts automated the factory *badly* for a long time — "the Factory just has to remain a hassle until second floor" (Steam discussion) — because the factory predated clean script hooks; one player measured 6 hours of 1 ms auto-clicking to build a batch of boosters. Design every factory action as a callable function first and a UI gesture second, even if you don't expose scripting until later.
2. **The Crafter's scan-to-learn is worth stealing verbatim.** Learning a recipe by *sacrificing copies of the item* is elegant: it prices knowledge in the item's own value, creates a fresh sink for everything, and makes automation feel earned per-item rather than toggled globally.
3. **Dissolve (universal item → mass recycler) is the dead-stock insurance** for the whole item economy — the Factory's version of NGU's Infinity Cube. Every mistake and surplus stays convertible.

**Pacing the arc:** the misery must peak *just before* each relief stage unlocks. If automation arrives before the pain, it's a checkbox; if it arrives too long after, it's a refund. Tie stage 3 to your first prestige tier and stage 4 to a mid-game prestige, as TPT2 does (MT4).

---

## 4. Data model — the whole factory in five tables

The reason the Factory is emulable by a small team is that it's tiny as data:

```
MaterialFamily(id, name)                      // iron, copper, crystal...
Item(family, form, tier)                      // form ∈ {ore, dust, ingot, plate, rod, wire, ...}
Verb(id, name, animation)                     // smelt, crush, press, shape, cut, assemble
RecipeTemplate(verb, inForm[], outForm[],     // ONE row per verb, parameterized:
               timeFn = a·t + b,              //   press: ingot[t] → plate[t], t+1 sec
               countIn[], countOut[])
Machine(verb, tier)                           // speed = 2^(tier−1), slots = f(tier)
Producer(targetSystem, tier)                  // output = P₀ · 8^(tier−1) currency/sec
```

Everything else — the up-tier catalyst rule, the intake gate, the mastery shortcuts — is a handful of special-case recipes. Ten families × ten tiers × seven verbs ≈ 700 items and ~20 recipe *rows*. A single designer can tune this in a spreadsheet, which is exactly how it should feel.

---

## 5. Starter spec (copy-paste tuning values)

A concrete first version for a 3D game, using TPT2's verified shapes with rounded constants:

| Knob | Value | Source |
|---|---|---|
| Verbs | smelt, crush, press, shape, assemble (5) | TPT2 has ~9; 5 suffices at first |
| Families × tiers | 3 families × 6 tiers at launch | content lever, grow later |
| Recipe time | `t + 1` s baseline; heavy steps `3t`; capstones `10t` | wiki: Factory shapes |
| Crush-first bonus | crushed ore yields 2× ingots | wiki: Factory, verbatim |
| Intake gate | `t` distinct inputs, batch ≥ `12 · 5^(t−1)` | wiki: Factory shape |
| Up-tier | 8 lower + 1 higher → 2 higher; skill reduces to 4+1 | wiki: Factory, verbatim |
| Down-tier | 2 higher → 8 lower (lossy ~50%) | TPT2 has this; loss is recommended |
| Machine speed | `2^(tier−1)`, cost paid in own outputs, ×7/tier | wiki: Factory shape |
| Producer output | `P₀ · 8^(tier−1)` /sec into a target system | superlinear per wiki |
| Producer recipe | 1 mid-chain item from every verb + 1 capstone item | recommended |
| Automation stages | manual → hireling (interval clicks) → scan-to-learn autocrafter + recycler → scripting | TPT2's arc |

---

## 6. The five commandments, if you remember nothing else

1. **Verbs, not recipes** — players learn machines once; content is materials.
2. **Linear times, exponential speed** — the sawtooth of hurt-then-trivialize is the fun.
3. **Export generators, not goods** — the factory installs income streams into every other system, which is why it never dies.
4. **Catalytic up-tiers with a descent valve** — surplus always flows somewhere; hoards never rot.
5. **Design the pain, sell the cure, and build the API before the pain** — automation is the factory's own endgame, and it must be architecturally ready on day one.

---

*Written 2026-07-31. TPT2 constants cited from the community wiki (perfecttower2.com/wiki/Factory and related pages) via the research in the main design reference; recommendations are original tuning guidance for a new game.*
