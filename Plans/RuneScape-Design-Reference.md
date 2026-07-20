# RuneScape — Systems & Math Design Reference

*A design study of RuneScape 3 (with Old School RuneScape contrasts where instructive), written for borrowing ideas about progression, EXP, economy, and character improvement for a new 3D game. Unlike the idle-game references in this series, RuneScape's logic runs server-side and cannot be decompiled from the client in this folder — so every formula below was instead verified against the RuneScape Wiki (the de facto specification of the game, maintained to remarkable precision by its community). Sections cite the wiki page each formula came from; anything unverifiable is marked as such.*

---

## The Big Picture

RuneScape is the longest-running case study in progression design there is — 25 years of one persistent world, and its systems have been through experiments (and public rollbacks) that no other live game documents as well. The architecture rests on a few big ideas:

1. **One exponential curve, 29 parallel tracks, no classes.** Every skill shares the same XP table: cost per level grows ×2^(1/7) ≈ ×1.104, doubling every 7 levels — which is why "level 92 is half of 99" is community folklore. A character *is* the vector of 29 skill levels; Total level sums the portfolio into one status number. The strategic core of the game is simply: *which exponential do I push next?*

2. **Time is the real currency.** Every skill requirement is secretly a time requirement priced by the curve — a designer writes "needs level 87" and has thereby written "+2 weeks." XP *rates* also grow with unlocks, so the felt pace stays far flatter than the cost curve; the pain concentrates exactly where methods plateau, which is where the milestones (99, 120, 200M) sit.

3. **Progression without prestige.** There is no rebirth. Instead, milestones stack on a single counter: cap at 99, keep counting virtual levels, hard-cap XP at 200M, then raise the real cap years later (99 → 110 → 120) as a content patch. The counter never resets; the *meaning* of the counter is re-leveraged instead.

4. **An engineered player economy.** The Grand Exchange throttles quantity (buy limits), never price; High Alchemy gives every item an NPC price floor; a 2% transaction tax and death/repair fees scale sinks with wealth; Invention's disassembly turns the entire 20-year item database into destroyable fuel. Endgame gear degrades — power is *rented*, not owned.

5. **RNG the player can negotiate with.** Slayer sells you dials for your own mission RNG (skip/block/prefer). Drop systems form a whole taxonomy of pity: soft pity (capped numerator growth), hard guarantees for progression blockers only, decrementing denominators, drop-sharding to cut variance, and Telos — a boss where the player literally *prices their own drop rate* by choosing difficulty and banking unclaimed loot.

6. **The retention stack — and its rollback.** RS3 built the maximal daily/weekly/monthly cadence layer ("Dailyscape") plus a paid XP lootbox, then in 2026 deleted most of it and published why. The end-state spec — pull-based events, accumulating banked stock instead of missable dailies, monetizing time and access but never the XP curve — is the version worth copying from day one.

## Contents

1. **The XP Curve & Skill Leveling** — the master formula and cap architecture
2. **Combat Math** — damage, accuracy ratios, tier-generated gear
3. **The 29-Skill Web** — gather → process → consume, and the attention premium
4. **Slayer** — weighted task RNG the player pays to edit
5. **Drops, Rarity & Bad-Luck Protection** — the pity-system taxonomy
6. **The Grand Exchange & Economy Design** — faucets, sinks, floors, and bonds
7. **Quests, Requirements & Achievement Gating** — the requirement DAG as content
8. **Live-Game Cadence** — dailies, DXP, monetization, and the 2026 rollback
9. **Minigame Token Economies** — points-per-hour currency design
10. **Farming & the Player-Owned Farm** — real-time timers as an embedded idle game
11. **Invention** — item XP, disassembly, and perk RNG (RS3's incremental layer)
12. **Distilled Playbook** — the transferable patterns, collected

---

## The XP Curve & Skill Leveling

### 1. What the system is

RuneScape 3 is a sandbox MMO whose entire character sheet is 29 independent skills (Mining, Magic, Cooking, Slayer, etc.), each leveled by repeatedly performing that skill's actions for experience points (wiki: Skills). There are no character levels and no classes: "the character" is just the vector of 29 skill levels, plus a Total level that sums them. Every skill runs on the same global XP-to-level table, so leveling any skill feels identical in rhythm; what differs is the content each level unlocks. The loop: perform action → gain fixed XP → cross a threshold → level up → unlock better actions/tools that grant more XP per hour → repeat.

### 2. The math

**The master curve.** Total XP required to reach level L (verified, wiki: Experience):

$$xp(L) = \left\lfloor \frac{1}{4} \sum_{n=1}^{L-1} \left\lfloor n + 300 \cdot 2^{n/7} \right\rfloor \right\rfloor$$

The per-level increment is therefore approximately:

$$\Delta xp(L \to L+1) \approx \frac{L + 300 \cdot 2^{L/7}}{4}$$

Check against the table: ΔXP(98→99) = (98 + 300·2¹⁴)/4 = 1,228,824.5, and the actual table gap is 1,228,825 (wiki: Experience/Table).

Two components: a **linear term** L/4 (only matters below ~level 20, keeps the very first levels non-zero) and a **geometric term** 75·2^(L/7) with per-level ratio 2^(1/7) ≈ 1.10409 — i.e., each level costs ~10.4% more than the last, and cost **doubles every 7 levels** (wiki: Experience). Because a geometric series is dominated by its tail (sum ≈ last term × r/(r−1) ≈ 10.6 × the final level's cost), total XP inherits the same doubling: **level L−7 always requires half the XP of level L**. Hence the famous fact: level 92 (6,517,253 XP) is almost exactly half of level 99 (13,034,431 XP) (wiki: Experience/Table).

**Verified anchor values (regular curve)** (wiki: Experience/Table):

| Level | Total XP | % of 99 |
|---|---|---|
| 2 | 83 | ~0% |
| 10 | 1,154 | 0.009% |
| 30 | 13,363 | 0.1% |
| 50 | 101,333 | 0.78% |
| 70 | 737,627 | 5.7% |
| 80 | 1,986,068 | 15.2% |
| 85 | 3,258,594 | 25.0% |
| 90 | 5,346,332 | 41.0% |
| 92 | 6,517,253 | 50.0% |
| 99 | 13,034,431 | 100% |
| 110 | 38,737,661 | — |
| 120 | 104,273,167 | — |
| 126 (virtual max) | 188,884,740 | — |

**The cap architecture.** Every skill's XP counter hard-caps at **200,000,000** (stored server-side as a 32-bit int of 2,000,000,000 — XP is tracked in tenths) (wiki: Experience). But trainable level caps vary per skill: 8 skills cap at 99, 8 at 110, 13 at 120, for a maximum Total level of 8·99 + 8·110 + 13·120 = **3,232**, requiring a minimum of 1,720,370,164 XP (wiki: Total level, as of the July 2026 Construction expansion). Above a skill's cap, **virtual levels** keep displaying on the same curve up to 126 (200M XP lands you past virtual 126). So one XP number carries four milestone tiers: 99 → 110/120 → virtual levels → 200M.

**The elite curve (Invention).** Elite skills use a different, unpublished formula; the wiki stores it as a data table (wiki: Module:Experience/elitedata). Verified values:

| Level | Elite XP | Regular XP | Ratio |
|---|---|---|---|
| 2 | 830 | 83 | 10.0× |
| 20 | 65,209 | 4,470 | 14.6× |
| 50 | 2,100,917 | 101,333 | 20.7× |
| 99 | 36,073,511 | 13,034,431 | 2.77× |
| 120 | 80,618,654 | 104,273,167 | 0.77× |
| 150 (virtual max) | 194,927,409 | — | — |

The shape is the point: elite skills are **front-loaded** (level 2 costs 10× more, so early elite levels feel substantial rather than trivial) but **flatter in the tail** — reaching 120 costs ~23M less XP than a regular 120 skill (wiki: Invention training). The elite virtual-level table was clearly tuned so that level 150 (194.9M) lands just under the 200M cap — the cap and the curve terminate together. Elite skills also halve fixed-XP rewards from lamps/quests (wiki: Elite skills), preventing the flatter tail from being trivialized by stockpiled rewards.

**Contrast:** Old School RuneScape uses the identical curve but caps all 24 skills at 99, max Total level 2,376 (OSRS wiki: Skills) — same math, one fewer prestige tier.

### 3. Interconnections

The XP curve is the substrate every other system prices against. **Inbound:** every content system (quests, minigames, daily challenges, XP lamps) pays out in curve-denominated XP, which lets designers award "one level's worth at level 60" as a concrete number. **Outbound:** skill levels gate equipment tiers, quest requirements, area access, and other skills — Invention literally requires 80 Smithing + 80 Crafting + 80 Divination to unlock (wiki: Elite skills), making three skills' curves the on-ramp to a fourth. Constitution starts at level 10 rather than 1 (wiki: Skills), pre-seeding survivability. The core tension is **attention allocation**: 29 parallel identical curves mean the player constantly chooses which exponential to push, and Total level converts that portfolio into a single status/prestige number that rewards breadth over depth.

### 4. Pacing & gating

Early game is nearly free: level 2 costs 83 XP (a handful of actions), levels 1–50 cost 0.78% of a 99, and 1–80 is still only 15.2%. The wall is entirely in the tail — the last 8 levels (92–99) are literally half the grind. Critically, the *felt* cadence stays flatter than the curve because **XP rates grow alongside XP costs**: higher levels unlock faster methods, better tools, and denser content, so hours-per-level rises far more gently than the 10.4%-per-level cost curve implies. Cadence pain concentrates only where methods plateau while costs keep doubling — which is exactly where RS3 places its prestige milestones (99, 120, 200M). Level caps double as content-release valves: Jagex has repeatedly raised caps (99→110→120 per skill over the years, per wiki: Total level's history) to re-open a finished exponential without touching the formula.

### 5. Borrowable design lessons

1. **One global curve, many parallel tracks.** A single memorable table across all skills makes progression legible and lets folklore form ("92 is half of 99") — cross-skill intuition is a free tutorial. Reuse one curve; differentiate skills by content, not math.
2. **Geometric cost, geometric income.** Cost ratio ~1.104/level with doubling every 7 works because XP/hr also scales with unlocks; design the *rate* curve and *cost* curve as a pair, and place your prestige goals where rates plateau so the wall is intentional, not accidental.
3. **Linear + exponential hybrid.** The `n + 300·2^(n/7)` structure gives near-instant early levels (dopamine on-ramp) without making them literally free, then hands off smoothly to the exponential. Cheaper than piecewise curve stitching.
4. **Stack milestones on one number.** Cap at 99 but keep counting: virtual levels, a hard XP ceiling (200M), and later cap raises (110/120) all reuse the same counter. You get prestige tiers with zero reset mechanics and zero new currencies.
5. **Reshape, don't rescale, for late-game skills.** Invention's curve is 10× steeper at level 2 but cheaper at 120 — front-loading cost makes an endgame skill feel weighty immediately while keeping its true cap reachable. When adding a "prestige skill," bend the exponent rather than multiplying the whole table.
6. **Total level as a portfolio score.** Summing parallel curves into one number creates a breadth incentive, a social status metric, and a matchmaking/gating handle — and it makes "which exponential do I push next?" the game's core strategic question.

---

## Combat Math: Damage, Accuracy, Defence & Gear Tiers

### 1. What the system is

RuneScape 3 is a tick-based MMO where combat power comes from two independent tracks: trainable skill levels (Attack, Strength, Magic, Ranged, Defence, Constitution — most now capped at 110–120) and a strictly tiered equipment ladder (tier 1–95+). Every weapon and armour stat is generated by shared closed-form functions of its tier, and every attack is resolved as a single accuracy check (hit chance = an affinity-scaled ratio of attacker accuracy to defender armour) followed by a damage roll drawn from an ability-specific percentage band of your "ability damage" stat. The result is a fully deterministic stat pipeline — level + tier in, damage-per-second out — with RNG confined to two well-bounded rolls.

### 2. The math

**Two master cubics generate almost everything.** Verified against worked values on the wiki (f(99) = 1212, f(120) = 1902; tier-90 weapon accuracy 2458; tier-60 tank body armour 260):

- Level curve: `f(x) = x³/1250 + 4x + 40` — used for accuracy from your attacking skill and for the Defence level's contribution to armour rating (wiki: Hit chance).
- Gear curve: `F(t) = 2.5·f(t) = t³/500 + 10t + 100` — used for weapon accuracy and (via slot multipliers) armour ratings (wiki: Equipment tier).

The cubic term means growth accelerates: at level 50 the cubic supplies only 25% of f (80 of 320); at 99 it supplies 64% (776 of 1212). Late levels matter more per level than early ones.

**Weapon stats from tier** (wiki: Equipment tier). Accuracy is speed-agnostic: `⌊F(t)⌋`. Damage scales with speed so slower weapons hit harder per swing:

| Speed | Main-hand dmg | Off-hand dmg | Two-hand dmg |
|---|---|---|---|
| Fastest | ⌊9.6t⌋ | ⌊4.8t⌋ | ⌊14.4t⌋ |
| Fast | ⌊12.25t⌋ | ⌊6.125t⌋ | ⌊18.375t⌋ |
| Average | ⌊14.9t⌋ | ⌊7.45t⌋ | ⌊22.35t⌋ |

Off-hand = ½ main-hand; two-hand = 1.5× main-hand — so dual-wield (mh + oh) and 2h are exactly damage-equivalent, a deliberate parity.

**Ability damage** (the stat that ability percentages multiply) for a melee main-hand (wiki: Ability damage):

`AD_mh = ⌊2.5·g(S)⌋ + ⌊9.6·min(t_mh, S) + b⌋`

where S = Strength level, t = weapon tier, b = equipment damage bonus (from power armour, etc.). Off-hand is half the same expression with the off-hand's tier; two-hand is `⌊2.5·g(S)⌋ + ⌊1.25·g(S)⌋ + ⌊14.4·min(t, S) + 1.5b⌋` (i.e., 1.5×). Ranged is identical with `min(t, a)` — a = ammunition tier — and Magic uses `min(t, s)` — s = spell tier. So effective weapon power is a three-way min over weapon tier, consumable/spell tier, and level: upgrading only one input does nothing.

The level function g was reworked in March 2026 from linear `g(level) = level` (the long-standing "2.5 damage per level") to a log curve:

`g(level) = 145 · ln(1 + 0.6·level/145) / ln(1.6)` (wiki: Ability damage)

Note the anchor: g(145) = 145 exactly; the curve is concave with slope ≈1.28 at level 1 tapering to ≈0.80 at 145. Damage per level is front-loaded, and raising skill caps (99 → 110 → 120) no longer compounds linearly — a power-creep valve.

Each ability then defines a uniform damage band as percentages of AD (e.g., the ability Rend rolls 135%–165% of AD, uniformly distributed) (wiki: Ability damage). Damage floors are high; whiffed "successful" hits don't exist.

**Hit chance** (wiki: Hit chance):

`H% = Aff × (a / d) + m`, capped at 100%

- `a = f(skill level) + F(weapon tier)` (accuracy)
- `d = armour stat + f(Defence level)` (armour rating)
- `Aff` = affinity, the hit chance when a = d. Versus NPCs: **90** attacking the target's specific weakness, **70** for the favoured triangle style, **60** neutral (Necromancy is always 60), **50** against the resisted style. Versus players: base **55**, shifted up to ±10 by the armour class the target wears — roughly an 18% relative accuracy swing, which *is* the combat triangle's implementation (wiki: Combat triangle). Below 1% computed hit chance you always miss.

Defence in RS3 is therefore pure avoidance scaling — armour rating never subtracts damage. Mitigation lives elsewhere: tank armour adds a separate flat PvM damage-reduction percentage (e.g., 1.2% on a tier-60 body) (wiki: Armour). Defensively, armour rating counts at 110% against the style it is strong against and 90% against the style it is weak to (wiki: Armour).

**Armour and the three-class tradeoff** (wiki: Equipment tier, Armour). Slot armour = multiplier × F(t): head 0.20, body 0.23, legs 0.22, hands/feet 0.05 each (full set ≈ 0.75·F(t)). The three armour classes are then defined *by tier offset on the same curve* — an elegant trick:

| Class | Armour rating | Life points | Damage bonus b |
|---|---|---|---|
| Tank | full F(t) multipliers | head 10t, body 15t, legs 15t, hands/feet 5t; shield 35(t−69) for t ≥ 70 | 0 |
| Power | = tank armour of tier (t − 5) | 0 | head 0.25t, body 0.375t, legs 0.3125t, hands/feet 0.15625t (set: 1.25t) |
| Hybrid | = tank armour of tier (t − 15) | 0 | 0 (no style penalty) |

Verified worked example at t60 body: tank 260 / 900 LP; power 226 (= 0.23·F(55)) / +22 damage; hybrid 168 (= 0.23·F(45)) (wiki: Armour).

**Life points**: 100 × Constitution level, i.e., 1,000 at the starting level 10, 9,900 at 99, plus gear LP (wiki: Life points).

**Combat level** (wiki: Combat level):

`CB = [ 1.3 × max(Att+Str, 2·Mag, 2·Rng, 2·Nec) + Def + Const + ⌊Pray/2⌋ + ⌊Summ/2⌋ ] / 4`, max 152.

Only your *best* offensive style counts — you're rated by your strongest build, not the sum. (The 2012 EoC experiment `max(offences) + Def + 2`, cap 200, was reverted after player backlash — number legibility has nostalgia value.)

### 3. Interconnections

Combat consumes and is fed by nearly everything: gathering/artisan skills (Smithing, Crafting, Fletching) manufacture the tiered gear; Herblore makes the potions that boost effective levels; ammunition and runes tie Ranged/Magic damage to consumable supply lines via the `min(t, a)` cap; Constitution XP accrues automatically as a fraction of combat XP, so the HP pool self-scales. The attention tension is the tank/power choice: damage bonus b feeds directly into AD, while tank gear feeds only survivability — high-skill players buy DPS with the armour-rating equivalent of five tiers. Affinity creates a loadout-vs-encounter tension: gear swaps for a 90-affinity weakness can outvalue a tier upgrade.

### 4. Pacing & gating

Gear is gated by hard level requirements roughly matching tier, and the `min(tier, level)` term soft-gates any bypass. Early game: linear terms dominate both cubics, so levels come fast and feel steady. Mid-late: the cubic accuracy term takes over, so each level and tier step widens the gap — tier 90 weapons have 2.24× the accuracy of tier 70 (2458 vs 1486), which against high-armour bosses is the difference between 60% and near-floor hit chance. The walls are therefore accuracy walls, not damage walls: content is tuned so d outscales a until you bring the next tier or the right affinity. The 2026 log damage curve then flattens the very top so cap raises don't explode DPS.

### 5. OSRS contrast: the alternative max-hit design

Old School's melee formula (OSRS wiki: Maximum melee hit): `Effective Str = ⌊(⌊(Str + potion) × prayer⌋ + style + 8) × void⌋` with style +3 aggressive / +1 controlled / 0 otherwise, void ×1.1; then `Max hit = ⌊0.5 + EffStr × (StrBonus + 64)/640⌋`. Damage on a successful accuracy roll spans 0 to max (roughly uniform; distribution detail unverified here). Contrast: OSRS uses small legible integers (max hits ~1–60), *additive* gear bonuses with no tier formula, and brutal variance including 0-damage "hits"; RS3 uses thousands-scale numbers, formula-generated gear, and tight ability bands with high damage floors. OSRS feels like dice; RS3 feels like a DPS machine.

### 6. Borrowable design lessons

1. **Generate all gear stats from one tier function** (`t³/500 + 10t + 100` style): a single tunable curve guarantees no dead items, trivial content scaling, and lets classes be expressed as tier offsets (power = tank − 5 tiers).
2. **Make hit chance a ratio, not a subtraction**: `H = Aff × a/d` never fully zeroes out, scales symmetrically at every power level, and one constant (affinity) cleanly encodes rock-paper-scissors and weakness targeting.
3. **Split avoidance (armour) from mitigation (flat % on tank gear only)** — it makes the defensive tradeoff purchasable and legible instead of burying it in one opaque stat.
4. **Gate damage by `min(weapon, consumable, level)`** — three coupled upgrade tracks force players to engage the whole economy, not one slot.
5. **Anchor your level curve at a fixed point** (g(145) = 145) and bend it logarithmic above the original cap — you can raise level caps later without redoing all content tuning.
6. **Enforce loadout parity by construction** (2h = 1.5× main-hand = dual-wield total) so weapon *style* is a preference, and only *tier* is progression.

---

## The 28-Skill Web: Gathering, Processing, and Skill Interlocks

*(Naming note: the "28 skills" of classic RS3 is now 29 — Necromancy (2023) joined the roster. Counts below use the current, wiki-verified 29.)*

### 1. What it is

RuneScape 3 has no classes. Every character can train all 29 skills — 9 combat, 7 gathering, 8 artisan/production, 4 support, plus the "elite" skill Invention (wiki: Skills). Each skill levels independently from 1 (Constitution starts at 10) by repeating its verb: mine rock, gain Mining XP. The core loop is a production web: gathering skills pull raw materials from the world, artisan skills process them into gear and consumables, and combat burns those consumables, dropping loot and currency that feed back into the web via a player-driven marketplace.

### 2. The math

**The master XP curve.** All 28 regular skills share one curve. Total XP required for level `L` (wiki: Experience):

```
xp(L) = ⌊ (1/4) · Σ(n=1 → L−1) ⌊ n + 300·2^(n/7) ⌋ ⌋
```

Closed-form approximation: `xp(L) ≈ 720·2^(L/7) + L(L−1)/8 − 795`. The per-level increment is `≈ 75·2^(L/7)`, so cost grows by a factor of `2^(1/7) ≈ 1.10409` (+10.4%) per level — **XP-per-level doubles every 7 levels** (wiki: Experience). This is the load-bearing constant of the whole game: because rates from better methods/tools also roughly double as you progress, the *felt* pace stays near-constant while raw numbers explode. Consequences: level 2 costs 83 XP; level 92 sits at almost exactly half the XP of 99, so "the last 7 levels are half the grind" is a designed truth players quote to each other.

**Milestone table (regular skills, verified — wiki: Experience):**

| Level | Total XP | Notes |
|---|---|---|
| 2 | 83 | derived from formula |
| 99 | 13,034,431 | classic mastery; skillcape unlock |
| 110 | 38,737,661 | new cap for 8 skills |
| 120 | 104,273,167 | master cape; ≈8× the 99 total |
| ~126–127 | 200,000,000 | hard XP cap per skill |

**Elite curve.** Invention uses a separate, flatter-then-steeper curve: 36,073,511 XP at 99; 80,618,654 at 120; 194,927,409 at 150, just under the 200M cap (wiki: Experience; Master cape). It unlocks only at level 80 in Smithing, Crafting, *and* Divination (wiki: Elite skills) — a skill whose entry fee is progress in three other skills.

**Mastery pricing (wiki: Cape of Accomplishment; Master cape; Max cape):**

| Reward | Requirement | Cost |
|---|---|---|
| Skillcape + emote + perk | Level 99 in that skill | 99,000 coins |
| Trimmed skillcape | A *second* level 99 | free, automatic |
| Master cape | 104,273,167 XP (virtual 120 counts) | 120,000 coins |
| Max cape | 99 in all 29 skills (total level ≥ 2,871) | 2,871,000 coins |

Every skillcape carries a small mechanical perk — Cooking's cape stops food burning, Agility's prevents obstacle failure, Magic's swaps spellbooks at banks (wiki: Cape of Accomplishment). Mastery is thus cosmetic-first, utility-second: enough perk to justify wearing, not enough to be mandatory.

**The attention premium — same skill, verified rates at level 99:**

| Skill | Low-intensity method | Rate | High-intensity method | Rate | Premium |
|---|---|---|---|---|---|
| Fishing | Ghostly sole ("lobby-timer AFK") | ~90–100k XP/h | Fishing Frenzy (continuous clicking on moving spots) | 285k+ XP/h | ~3× |
| Fishing | Menaphos bank-side fishing, relaxed | ~85k XP/h base | Crystallise fly fishing (recast spell every 30s + prayer upkeep) | up to 118k XP/h (mid-levels) | ~1.4× |
| Woodcutting | Choking ivy ("less effort and attention") | up to ~126k XP/h base | Crystal trees, actively played with boosts | 133k base, 200k+ boosted | ~1.6× |

(wiki: Pay-to-play Fishing training; Pay-to-play Woodcutting training.) The pattern is deliberate: for most skills there is an AFK floor at roughly 1/3 to 2/3 of the active ceiling. Players self-select an engagement level; second-monitor play is a supported mode, not an exploit.

### 3. Interconnections

The web is triadic — **gather → process → consume**:

- Mining → Smithing → weapons/armour → consumed by combat (degradation) and by Invention.
- Woodcutting → Fletching (bows/ammo) and Firemaking (Cooking fuel) and Construction (planks).
- Fishing → Cooking → food, the healing resource combat burns constantly.
- Farming → Herblore → potions; combat drops the seeds and herbs that restart the loop.
- Combat drops charms → Summoning; bones → Prayer; everything → coins.
- **Invention sits on top as the sink**: it levels by *disassembling and destroying* finished items into components, giving the entire web a demand floor and fighting inflation.

The Grand Exchange (auction house) decouples the chains: you never need to gather your own inputs. This creates RS3's most instructive axis — **buyable vs earned skills**. Herblore, Construction, Prayer, and Summoning convert coins into XP at very high rates (buy inputs, click through them); Agility, Slayer, Dungeoneering, and Thieving produce untradeable progress that money cannot accelerate. Wealth from combat therefore flows into buyable skills, while time-anchored skills protect prestige — a 120 Slayer means time served, a 120 Herblore may mean money spent. The attention tension is real: with one character and 29 tracks, every hour is an opportunity-cost decision across the whole web, which is exactly what makes total level a meaningful score.

### 4. Pacing and gating

- **Early game is an unlock firehose**: the exponential curve means levels 1–30 cost trivially little (level 30 is under 14k XP vs 13.03M for 99), and each few levels opens a new tree, ore, or fish. New players hit a dopamine beat every session.
- **Mid game (50–92)**: unlock density drops; method choice and the AFK/active tradeoff become the content.
- **Late game walls are explicit and quotable**: 92 = halfway to 99; 99 → 120 is another ~7× the 99 total; 200M is the collector's terminal wall.
- **Ceilings are a live-ops lever**: caps were raised in stages — most skills 99; eight gathering/artisan skills (Mining, Smithing, Woodcutting, Fletching, Firemaking, Runecrafting, Crafting, Hunter) now cap at 110; eleven skills including Slayer, Herblore, Farming, Archaeology, Invention, and Necromancy cap at 120 (wiki: Skills). Before a cap is raised, levels 100–120 exist as **virtual levels** — prestige numbers with no unlocks — so the master cape at virtual 120 gives the grind a target years before content fills it in (wiki: Master cape).
- **Cross-skill gates**: quests and elite skills demand breadth (Invention's triple-80 gate), pulling specialists back across the web.

### 5. Borrowable design lessons

1. **One exponential to rule them all**: a single shared curve with a fixed per-level ratio (`2^(1/7)`) makes every skill's pacing legible and lets one balancing constant tune the whole game — pair it with method rates that scale similarly so felt progress stays flat.
2. **Price attention, not just time**: offer an idle floor at ~1/3 of the active ceiling *within the same skill* (90k AFK vs 285k active Fishing). One system serves both idle-game and engaged players — ideal for a 3D incremental.
3. **Make combat the universal consumer**: food, potions, and ammo burned in combat give every production chain permanent demand; add an Invention-style disassembly skill that levels by destroying goods as your economy's sink.
4. **Split money-convertible from time-anchored tracks**: let currency accelerate some skills but firewall a few as pure time-served, so prestige signals survive a player-driven economy.
5. **Sell mastery back to the player as identity**: a cape at the cap with an emote and a *minor* perk, auto-trimmed on the second mastery, plus a max cape for all-caps — cheap-to-build goals with enormous gravity, rewarding both depth and breadth.
6. **Ship virtual levels before real ceilings**: let counters run past the cap (virtual 100–120, 200M terminal), then convert virtual range into a real cap raise later — the grind is future-proofed and cap raises become content patches.

---

## Slayer task system (assignment weighting, points economy, block/skip lists)

### 1. What it is

Slayer is RuneScape's mission-generator skill: instead of grinding any monster freely, the player visits a "Slayer master" NPC who rolls a random assignment — "kill N of monster X" — from a weighted table. Killing the assigned monster grants Slayer XP (on-task only) on top of normal combat XP; finishing the task pays **Slayer points**, a currency spent on permanent unlocks, consumables, and — crucially — on editing the RNG itself (skipping, blocking, or favoring specific tasks). The loop converts an open-ended combat grind into an endless chain of bounded, varied session goals with a meta-economy layered on top.

### 2. The math

**Assignment roll.** Each master has a task list where every eligible task carries an integer weight. The probability of rolling task *i* is:

```
P(i) = w_i / S,   where S = Σ w_j over all tasks the player is ELIGIBLE for
```

Ineligible tasks (too low Slayer/combat level, missing quest, toggled off, or blocked) are removed from S before the roll — so restricting your own pool concentrates probability on what remains. The wiki's worked example: five eligible tasks with weights 12, 10, 9, 7, 8 → S = 46 → probabilities 26.1%, 21.7%, 19.6%, 15.2%, 17.4% (wiki: Slayer assignment).

**Player-tunable randomness.**

| Lever | Cost | Effect on the roll |
|---|---|---|
| Skip/cancel current task | 30 pts | Reroll now; same task can recur |
| Block a task type | 100 pts | w_i removed from S permanently (until unblocked) |
| Prefer a task type | 100 pts | ≈2× weight on the primary roll |
| Extend current task | 30 pts | +20% kill count on the active task |

Block and prefer share one slot pool: **1 slot per 50 quest points, max 8 slots at 400 QP** (wiki: Slayer assignment) — so list capacity is itself gated by progression in a *different* system (quests). Blocking task *i* multiplies every remaining task's probability by S/(S−w_i). Derived from the verified costs: a 100-point block breaks even against 30-point skips after ~3–4 avoided rolls of that task, so blocking is the amortized option for high-weight hated tasks.

**Points payout.** Points per completed task depend on which master assigned it, with streak bonuses: **every 10th task pays 5× base, every 50th pays 15× base** (the 50th supersedes the 10th). No points until 5 tasks have been completed, and without the quest *Smoking Kills* all payouts are halved (rounded down) (wiki: Slayer points). Verified table (wiki: Slayer points; Slayer Master):

| Master | Combat req | Slayer req | Base *b* | 10th (5b) | 50th (15b) |
|---|---|---|---|---|---|
| Turael/Spria | — | — | 0 (no streak count) | — | — |
| Jacquelyn | — | — | 1 | 5 | 15 |
| Vannaka | 30 | — | 2 | 10 | 30 |
| Mazchna | 50 | — | 4 | 20 | 60 |
| Chaeldar | 75 | — | 10 | 50 | 150 |
| Sumona | 90 | 35 | 12 | 60 | 180 |
| Duradel | 100 | 50 | 15 | 75 | 225 |
| Kuradal | 110 | 75 | 18 | 90 | 270 |
| Morvran | 120 | 85 | 20 | 100 | 300 |
| Laniakea | 120 | 90 | 22 | 110 | 330 |
| Mandrith | 120 | 95 | 22 | 110 | 330 (ignores block/prefer lists) |

Derived long-run income: per 50 tasks you get 45·b + 4·5b + 15b = 80b, i.e. **average 1.6b per task** — the streak system silently adds +60% to point income for never breaking the chain. Points cap at 64,000 (wiki: Slayer points).

**Old School contrast.** OSRS extends the milestone ladder: 5× every 10th, 15× every 50th, **25× every 100th, 35× every 250th, 50× every 1,000th** task (wiki OSRS: Slayer reward point) — deeper long-horizon hooks for a slower game. OSRS also pays a risk premium: the Wilderness (PvP-zone) master Krystilia pays 25 base vs. Duradel's 15.

**Shop structure.** Spending splits into permanent unlocks (e.g. learn slayer-helmet crafting 400 pts, broad-arrow fletching 300 pts, helmet upgrade tiers 100–1,000 pts), repeatables (ushabti 20 pts), and consumables (broad ammo bundles 35 pts) (wiki: Slayer points).

### 3. Interconnections

Combat stats feed Slayer (you must kill the targets); Slayer feeds back as a **content gate orthogonal to quest/level gates**: many monsters simply cannot be damaged without the Slayer level — e.g. Legiones at 95, The Magister at 115, with the skill capped at 120 (wiki: Slayer) — and those monsters hold exclusive drops, so Slayer level gates the economy too. Quest points gate block/prefer slots; the *Smoking Kills* quest gates full point income; masters are gated by combat + Slayer + quests. Turael/Spria act as a free escape valve: they'll reassign anyone, but pay 0 points and their tasks don't count toward streaks — a "free skip" priced in opportunity cost rather than currency. The core attention tension: spend points on power now (unlocks) vs. on shaping future RNG (blocks/prefers), and train at the highest-paying master vs. the master whose task pool you've tuned.

### 4. Pacing and gating

Early game is a deliberate trickle: 1–4 points per task, halved pre-quest, nothing for the first 4 tasks — the economy only opens up once the player commits. Mid-game (Chaeldar→Duradel) multiplies income 5–15× and introduces the block/prefer metagame as points become spendable. Late game masters (Morvran, Laniakea, Mandrith) sit behind 120 combat and 85–95 Slayer — the walls are the master requirements themselves, plus marquee monsters at 95/115 Slayer. Income scales ~22× from first paying master to last, so the same 100-point block costs a newcomer ~50 tasks but a veteran ~3: RNG-tuning is cheap exactly when players have earned strong preferences.

### 5. Borrowable design lessons

1. **Weighted mission table with subtractive rolls** — `P(i)=w_i/S` over *eligible* tasks means every unlock/block automatically renormalizes; no rebalancing pass needed when content is added.
2. **Sell the players their own RNG dials** — skip (cheap, transient), block (expensive, permanent), prefer (expensive, positive). Players pay to remove frustration, which makes randomness feel like agency instead of punishment; price the levers so blocking amortizes over ~3–4 skips.
3. **Streak multipliers on top of base pay** (5×/15× at 10/50; OSRS adds 25×/35×/50× at 100/250/1,000) — a +60% average income that players experience as jackpot moments, and a retention chain they're loath to break.
4. **Pay-grade ladder of mission givers** — same loop, 22× payout spread, gated by two stats plus quests; lets one system serve level 3 and endgame players without separate content.
5. **Escape valve priced in opportunity cost** — a free reroll source that pays nothing and skips streak credit avoids hard-locking frustrated players without devaluing the paid skip.
6. **Gate capacity, not just content, across systems** — block-list slots bought with *quest* points cross-links progression tracks, giving old content new purchasing power.

---

## Drops, Rarity & Bad-Luck Protection

### 1. What the system is

Every killable monster in RuneScape carries a weighted loot table rolled independently on each kill; rare "unique" items (best-in-slot gear, pets, cosmetics) sit at denominators from 1/50 to 1/5,000+. The core loop: kill → roll table(s) → sell/equip loot → use power gains to kill harder monsters with richer tables. RS3 (the modern client) layers *bad-luck mitigation* — dry-streak-aware rate improvements — and wearable *luck tiers* on top of the raw RNG; Old School RuneScape mostly keeps rolls memoryless and instead channels completionist energy into clue scrolls and the collection log. Drop denominators are the game's economy supply valves, so both games treat them as carefully as XP curves.

### 2. The math

**Why pity exists — the memoryless tail.** For an independent drop at rate 1/D, P(still dry after n kills) = (1 − 1/D)^n ≈ e^(−n/D): ~36.8% of players are dry at n = D, 13.5% at 2D, 5% at 3D (osrs wiki: Drop rate explicitly states rolls are independent, with bad-luck mitigation as the named exception). Every mitigation system below is a way of truncating that exponential tail.

**Table architecture.** Classic tables are slot-weight rolls with power-of-two denominators — the 1/128 convention. The OSRS rare drop table shows the shape: from a monster's RDT access roll, 20/128 hits the gem sub-table and 15/128 the mega-rare sub-table; the gem table itself has a 1/128 escalator to mega-rare, a 63/128 "nothing" slot, and entries like uncut sapphire at 32/128 (osrs wiki: Rare drop table). RS3's version nests three tables: gem → rare at 1/128, rare → super-rare at 4/64, with super-rare holding items like Hazelmere's signet ring at ≈1/6,400 effective (wiki: Rare drop table). The design pattern: **per-monster table + shared global rare table**, so any qualifying kill anywhere can pay out the same jackpot.

**Luck tiers (wiki: Luck).** Four tiers of wearable luck, each gating which content it touches:

| Tier | Example item | Scope & effect |
|---|---|---|
| 1 | Ring of Luck | Slayer monsters ≤ lvl 50; better RDT access; +1% easy clue rewards |
| 2 | Ring of Wealth | Adds lvl 51–80; prunes junk (molten glass) off the rare table |
| 3 | Ring of Fortune | Adds lvl 81–120; prunes more junk; hard clues |
| 4 | Luck of the Dwarves | All bosses; rare→super-rare improves 4/64 → 4/52; unlocks tier-4-only items (Vecna skull 8/640) |

Note the mechanism: luck rarely multiplies your rate directly — it *removes bad outcomes from the table* (OSRS Ring of Wealth deletes the 63/128 gem-table "nothing", turning 32/128 sapphire into 32/65) or *shifts you to a better sub-table*. Rarity stays legible; junk shrinks.

**Soft pity — capped numerator growth (boss pets)** (wiki: Boss pets). Universal RS3 pet formula:

P(K) = (1 + min(⌊K/T⌋, 9)) / D,  with threshold T ≈ D/5

Every T kills, the numerator ticks up by 1, capped at 10/D — a maximum 10× improvement, never a guarantee. Example: General Graardor's pet is base 1/5,000 with T = 1,000; at 5,000 kills you roll 6/5,000 ≈ 1/833. The tail now decays ten times faster past 1.8D kills, so "3× dry" horror stories effectively vanish while the item stays rare.

**Hard pity — guaranteed-at-N (mostly progression items).** RS3 reserves guarantees for lore/quest-adjacent drops: King Black Dragon's *Last riders* book rises after 1,000 kills and is guaranteed at 2,000 solo; Dragonkin logs are guaranteed at 200/400/600/800 kills; Zamorak's signature rewards improve after 10+ dry kills at ≥100% enrage (wiki: Bad luck mitigation). OSRS, despite its reputation, does the same for blockers: Vorkath's head (1/50) guaranteed on kill 50; Kalphite Queen head (1/128) guaranteed (tattered) at kill 256; Hunters' rumour uniques guaranteed at 2× the denominator; the clue Mimic guaranteed by the 25th elite / 10th master casket (osrs wiki: Bad luck mitigation).

**Decrementing denominator.** Pyramid Plunder's Sceptre of the gods starts at 1/625 (1/480 with boosts) and every failed attempt reduces the denominator by 1, floored at 1/20 (wiki: Bad luck mitigation). Cheap to implement, monotone, and invisible until players datamine it.

**Ramping numerator with post-drop reversion.** OSRS Thread of Elidinis scales 1/10 → 3/10 across 15 raid completions, then reverts to 1/50 after your first — front-loaded generosity for the item you *need*, rarity restored for duplicates (osrs wiki: Bad luck mitigation).

**Variance reduction by sharding.** The Venator bow drops as 5 shards at 1/100 each instead of one 1/500 drop: identical mean (500 kills), standard deviation shrunk by √5 (osrs wiki: Bad luck mitigation).

**Player-priced rarity — Telos** (wiki: Telos, the Warden). The signature RS3 formula, where players *choose* their drop rate via enrage e (difficulty %) and kill streak s (banked, unclaimed loot):

P(unique) = min( 1/15, (1000 + 25·(e + l) + 300·s) / 1,000,000 ),  l = 25 with tier-4 luck else 0

Base 1/1,000; +1/1,000 per 40 enrage; +1/1,000 per ~3.33 streaked kills; hard cap 1/15. Sub-100% enrage kills eat heavy penalty multipliers, pushing players up the difficulty ladder. Elegantly, tier-4 luck is priced *in enrage units* (worth exactly +25e).

**Completionist layer.** OSRS's collection log tracks 1,911 slots / 1,706 unique drops across bosses, raids, clues, and minigames, with cosmetic rank tiers at fixed logged-item counts up to ~90% of obtainable slots (osrs wiki: Collection log). Skilling pets get a 200M-XP mercy multiplier (15× in OSRS; RS3 adds +200 virtual levels to the pet roll — wiki: Bad luck mitigation).

### 3. Interconnections

Drops are the input side of the entire player economy: denominators set Grand Exchange supply, and the shared rare drop table lets designers inject liquidity (gems, key halves, resources) game-wide through one tunable object. Slayer assignments gate *which* tables you may farm, tying drop access to a separate skill's progression. Clue scrolls drop *from* monster tables and open a second nested lottery, chaining RNG systems. Tensions: luck rings occupy the ring slot, so equipping tier-4 luck trades combat stats (kills/hour) for per-kill rate — throughput vs. variance; per-boss pity accrual makes switching bosses feel like abandoning sunk progress; Telos streaking stakes your entire unclaimed loot pile on the next kill, converting drop RNG into push-your-luck.

### 4. Pacing & gating

Early game: generous rates and small denominators (Har-Aken's pet at 1/200, threshold 40). Endgame: 1/1,000–1/5,000 uniques where pity thresholds (T ≈ D/5) and luck tiers do the pacing. Luck tiers gate by content level (tier 1 caps at level-50 slayer; only tier 4 touches bosses), giving the luck system its own upgrade ladder. Hard-pity guarantees cluster at 1–2× the denominator and only on progression-critical items; pure-chase items (pets, super-rares) cap at 10× soft pity or none. The walls are deliberate: with no pity, ~5% of players sit beyond 3× rate — OSRS accepts that for prestige items (a natural Twisted-bow-owner scarcity) and patches it only where dryness blocks quests or content entry. Telos replaces a wall with a slope: rate scales linearly with self-selected difficulty from 1/1,000 to a 1/15 ceiling.

### 5. Borrowable design lessons

1. **Per-source tables + one shared global rare table.** A single tunable jackpot table reachable from any qualifying kill makes all content lottery-relevant and gives you one lever for economy-wide injection.
2. **Soft pity as capped numerator growth** — P = (1 + min(⌊K/T⌋, 9))/D with T = D/5. No timers, no per-player state beyond a kill counter, tail truncated 10×, rarity mystique intact.
3. **Segment pity by item purpose:** hard guarantees (at 1–2× denominator) for progression blockers; soft pity for prestige; none for economy-defining chase items. One pity policy for everything flattens the reward texture.
4. **Sell luck as table-pruning, not multipliers.** Removing "nothing"/junk slots (32/128 → 32/65) feels tangible, keeps published rates honest, and lets luck items gate exclusive entries per tier.
5. **Let players price their own drop rate** with a Telos-style linear formula over chosen difficulty and banked risk: P = min(cap, base·(1 + e/40 + s/3.33)). Turns RNG from something endured into a wager players author — and denominate luck bonuses in the same difficulty units.
6. **Shard big drops** (5 × 1/100 instead of 1/500) when you want the same average grind with √n less variance — ideal for mid-tier gear where dryness churns players.

---

## The Grand Exchange & Economy Design

### 1. What the system is

The Grand Exchange (GE) is RuneScape 3's centralized, asynchronous auction house: players post buy or sell offers for almost any tradeable item, and the server matches compatible offers automatically — no direct player contact, no haggling, no auction UI browsing. Around it, Jagex operates a deliberate mesh of **faucets** (monster gold drops, alchemy spells that convert items to coins) and **sinks** (a sales tax, death-reclaim fees, equipment repair, item-destroying crafting) so the currency and item supply don't inflate without bound. The economy is the game's real endgame loop: kill/gather → sell on GE → buy upgrades → kill/gather faster. Bonds bolt real-money trading onto this loop in a controlled, taxed form.

### 2. The math

**Order matching and price discovery.** Each member gets 8 concurrent offer slots (3 for free players). An offer is seeded at the item's *guide price* and can be nudged with ±5% / ±20% buttons or set to any custom price (wiki: Grand Exchange). Matching favors whoever concedes: a buy at 110 matched against a sell at 100 executes, with the buyer refunded the spread. Guide prices are recalculated from recent traded prices and volume — Jagex has never published the exact algorithm, and low-volume items may only reprice every few days (wiki: Grand Exchange). Historically the GE hard-clamped daily price movement of the guide price; those price restrictions were removed in February 2011, so today the only hard throttle is quantity, not price. The per-4-hour limit in the mission brief now applies to **buy limits**, not price movement.

**Buy limits (supply throttle).** Each item has a purchase cap per rolling 4-hour window, started at first purchase (wiki: Grand Exchange):

| Item class | Buy limit / 4 h |
|---|---|
| Common metal armour (bronze–rune) | 100, shared across pieces |
| Dragon armour | 10, shared across set |
| God Wars Dungeon uniques | 1 |
| Bonds | 150 |

This makes market cornering slow and expensive without touching prices at all.

**GE tax (transactional gold sink).** Since 9 Jan 2023, RS3 withholds 2% of every sale price; items under 50 coins and bonds are exempt (wiki: Grand Exchange):

$$T = \lfloor 0.02 \cdot p \rfloor \text{ per item sold}$$

OSRS's version is instructive: introduced at 1% (Dec 2021), raised to 2% (May 2025), **capped at 5,000,000 coins per item**, with floor-rounding meaning sub-50-coin items are naturally untaxed. Critically, part of OSRS tax revenue funds an automated **item sink**: Jagex deletes a fixed, item-specific quantity per week, buying only with collected tax (wiki: Grand Exchange tax, OSRS). Tax converts trade velocity directly into deflationary pressure.

**High Level Alchemy (NPC price floor).** Level 55 Magic; consumes 1 nature rune + 5 fire runes; yields coins equal to 60% of the item's fixed internal value (not its GE price); grants 65 Magic XP per 5-tick (3 s) cast (wiki: High Level Alchemy). With fire runes free from an elemental staff, alching is profitable whenever:

$$P_{GE}(item) < 0.6 \cdot V_{item} - P_{GE}(nature)$$

Below that threshold, demand from alchemisers is effectively infinite (they buy any quantity, destroy the item, mint coins), so every item's market price has a floor at approximately $0.6 V - P_{nature}$. Note this is *also a gold faucet* — coins are created from nothing — so the floor mechanism inflates currency while deflating item supply.

**Death costs (wealth-scaled sink).** On death, the 3 most valuable carried items are reclaimed free (raisable to 5 by active effects); the rest are held by an NPC at (wiki: Death (mechanic)):

$$C_{reclaim} = \max(0.001 \cdot v_{stack},\ 100) \text{ coins per stack}$$

where $v$ uses GE price for tradeables. Die again before reclaiming and unclaimed items shift to overflow storage at **1%** of value (10× penalty), capped at 50 items with the cheapest destroyed first. Gravestone unlocks reduce the fee by 1–5%. The sink scales with the wealth you risk, not a flat fine.

**Equipment repair (usage-metered sink with a skill discount).** High-end gear degrades with combat time and is repaired for coins. At a player-owned armour stand (wiki: Repair):

$$C_{repair} = C_{base} \cdot \left(1 - \frac{S}{200}\right)$$

where $S$ is Smithing level (0.5% off per level, ~50% at cap with boosts); NPC repair charges full $C_{base}$. This gives a non-combat skill direct economic value.

**Invention disassembly (mass item sink).** Disassembling destroys the item permanently and rolls materials against a hidden per-item level $l$: junk chance is linear in $l$ for levels 1–74, roughly quadratic for 75–89, and zero at 90+; augmented gear at item level 4+ never yields junk and at level 9+ yields 4× materials; XP per item is $x = \max(\lfloor 0.03 \cdot l \cdot g \rfloor, 0.1)$ with goodness $g \in \{1, 10\}$ (wiki: Disassemble). Because components are consumed for perks and inventions, this creates *permanent, repeatable* demand that eats mid-tier item gluts — the single biggest item sink in RS3.

**Bonds (legitimized RMT + gold sink).** A bond is bought from Jagex for real money and redeemed for 14 days of membership (2 → 29 days, 3 → 45, 20 → 12 months) or 195 RuneCoins each (wiki: Bond). Sold once on the GE, it becomes untradeable; restoring tradeability costs **10% of its GE value** (~11.6M at a ~116M price). Bonds are exempt from GE tax, have a 150 buy limit, and are always kept on death. Effect: gold buyers pay Jagex instead of black-market sellers, gold sellers receive membership instead of cash, and the 10% re-trade fee skims coins out of circulation on resale.

### 3. Interconnections

Faucets in: monster coin drops, alchemy (items → coins), quest/minigame rewards. Sinks out: 2% GE tax, death reclaim, repair, construction costs (the game literally sells a vanity furniture piece named "Gold sink" for 100,000,000 coins — wiki: Gold sink), bond re-trade fees. Item supply in: drops, gathering, crafting; item supply out: alchemy, disassembly, degrade-to-dust gear, overflow-storage destruction on death. Every combat upgrade purchase funds a gatherer/crafter, whose materials come from skilling time — so the GE is the transmission converting *any* player's time into *any other* player's progress. Tension: alching an item versus selling it versus disassembling it is a constant three-way price comparison, and it self-balances because each option's payoff moves with the others.

### 4. Pacing and gating

Early game: tiny cash stacks, sub-50-coin trades untaxed, deaths nearly free (min 100 coins, best 3 items free) — the economy is invisible. Mid game: buy limits start binding on consumables; repair and death fees become noticeable line items; alch floors define which drops are "worth picking up." Late game: the economy *is* the wall — best-in-slot gear costs hundreds of millions to billions, degradation makes owning it a running cost (a rent, not a purchase), and the 2% tax plus 0.1% death fees mean wealth decays unless actively earned. Bonds gate real-money shortcutting behind a market price that players collectively set.

### 5. Borrowable design lessons

1. **Floor via NPC buyback, ceiling via NPC vendor.** Give every item a fixed vendor value; instant-sell at $0.6V$ (minus a consumable cast cost) floors prices, NPC stock at a markup ceilings them. A single-player market simulation only needs prices to random-walk between these bounds.
2. **Throttle quantity, not price.** Per-window buy limits (4-hour caps) prevent degenerate hoarding/cornering while letting prices float freely — far less frustrating than clamped prices.
3. **Tax velocity, and spend the tax on deletion.** A 2% transaction fee that rounds down (auto-exempting cheap trades) plus OSRS's trick of using tax revenue to buy-and-delete gluts is a self-tuning sink: more trading → more deflation.
4. **Make sinks proportional to wealth-at-risk.** Death at $\max(0.001v, 100)$ with the top-3 items free punishes hubris, never poverty — new players feel safe, rich players feel stakes.
5. **Rent, don't sell, endgame power.** Degradation with $C_{base}(1 - S/200)$ repair makes top gear a recurring cost and gives a crafting skill permanent relevance — ideal for an incremental where numbers must always have somewhere to go.
6. **Add a shredder with output demand.** Disassembly (destroy item → components → permanent upgrades, with junk chance falling as item level rises) converts loot floods into progression fuel and props up prices of otherwise-dead mid-tier items.

---

## Quests, Requirements & Achievement Gating

### 1. What the system is

RuneScape 3 has no main campaign. Instead it ships ~276 self-contained quests (44 free, 232 members) (wiki: Quests), 29 trainable skills, and 4,157 checklist achievements (wiki: Achievement), all cross-linked by requirements: quest B needs quest A plus Thieving 63; achievement C needs quest B plus an area unlock. The player's real activity is navigating this requirement graph toward self-chosen aggregate goals — the Quest point cape ("did every quest"), Max cape ("every skill at 99"), and Completionist cape ("did everything") — each of which is a single wearable badge that compresses hundreds of sub-goals into one number. The design insight worth studying: *the requirements themselves are the content structure* — a DAG the player traverses freely, not a linear campaign.

### 2. The math

**The gate currency: XP.** Every skill requirement is secretly a time requirement, priced by the experience curve (wiki: Experience):

```
xp(L) = ⌊ (1/4) · Σ_{n=1}^{L-1} ⌊ n + 300 · 2^(n/7) ⌋ ⌋
```

The dominant term grows by ×2^(1/7) ≈ ×1.1041 per level, so **XP cost doubles every 7 levels** (derived from the formula above). Verified anchor values:

| Level | Cumulative XP | Ratio to 99 |
|---|---|---|
| 50 | 101,333 | 0.008 |
| 99 (baseline mastery) | 13,034,431 | 1.0 |
| 110 (expanded cap) | 38,737,661 | ≈2.97 |
| 120 (extended cap) | 104,273,167 | ≈8.0 |
| Hard cap | 200,000,000 per skill | ≈15.3 |

A quest that demands level L costs the player `xp(L) / R` hours at training rate R — so designers tune wall height purely by picking the level number, knowing +7 levels ≈ double the time. A consequence of the doubling curve: the XP midpoint of 1→99 sits at level 92 (≈6.52M of 13.03M), i.e. **half the grind lives in the last 7% of levels**.

**Quest points: a breadth currency.** Each quest awards 0–10 quest points, up to a current total of 473 QP; notably QP is *not* proportional to difficulty (easy Gunnar's Ground gives 5, hard Dealing with Scabaras gives 1) (wiki: Quest points). QP is then used as a fuzzy aggregate gate — "have done roughly this much questing, we don't care which":

| QP threshold | Gates (wiki: Quest points) |
|---|---|
| 33 | Champions' Guild, start Dragon Slayer |
| 44 | Tears of Guthix (weekly XP reward) |
| 56 | complete Heroes' Quest |
| 101 | Swan Song |
| 108 | Legends' Quest |
| 176 | Recipe for Disaster finale |
| 300 | Helmet of Trials |
| 473 (max) | Quest point cape |

Mathematically a QP gate is a soft-OR over the whole quest set: 176 QP means "any subset of quests summing to 176," giving freedom of route while still forcing breadth.

**The cape ladder — telescoping meta-goals** (each row strictly contains the previous in practice):

| Badge | Requirement summary | Min total XP |
|---|---|---|
| Quest point cape | All 276 quests / 473 QP; implied min total level 2,209; steepest single skill reqs ≈ Necromancy 95, Slayer 87; plus 85 in *any one of* Crafting/Runecrafting/Smithing/Invention (wiki: Quest point cape) | — |
| Max cape | Level 99 in all 29 skills; min total level 2,871 (wiki: Max cape) | 401,037,579 |
| Master quest cape | 307 lore requirements: all quests, miniquests, post-quest content, most lore books (wiki: Master quest cape) | — |
| Completionist cape | 102 bundled achievements: all quests, all area tasks, all music, all skills at their *current* cap — 99 baseline, but 110 in Mining/Smithing/Firemaking/Woodcutting/Fletching/Runecrafting/Crafting and 120 in Dungeoneering/Slayer/Farming/Herblore/Archaeology/Invention/Necromancy/Thieving/Attack/Strength/Ranged/Magic (wiki: Completionist cape) | 1,720,370,164 |
| Trimmed completionist | An 86-achievement superset group incl. Master quest cape (wiki: Trimmed Completionist Cape) | — |

Note the ratios: Comp cape's 1.72B XP ≈ 132 "99-equivalents" and ≈4.3× the Max cape's floor. Raising a cap from 99→120 multiplies that skill's cost by 8 — Jagex's standard lever for re-opening "finished" skills.

**Area tasks: tiered regional checklists.** Twelve geographic regions each carry Easy/Medium/Hard/Elite tiers (plus a Beginner tier only in the tutorial region) (wiki: Achievement). Example, Ardougne: 23 easy / 16 medium / 17 hard / 5 elite tasks; each tier upgrades one reward item (Ardougne cloak 1→4) with stacking, region-local perks — tier 1 unlimited monastery teleports and stall-theft bonus, tier 2 +10 flat pickpocket success and 700 weekly noted essence, tier 3 bank teleport and 1,050 essence, tier 4 unlimited farm teleports and daily summoning restore — plus lamps totaling 236,500 XP across the set (wiki: Ardougne achievements). Rewards make *the region itself faster*, so completing a place mechanically deepens your relationship with it.

**Achievement score.** All 4,157 achievements award 5–75 RuneScore each (792 award 0), max 45,545 — a parallel, power-free leaderboard number spanning nine categories (Skills, Exploration, Area Tasks, Combat, Lore, Activities, Completionist, Feats, Group Ironman) (wiki: Achievement).

### 3. Interconnections

Quests are the graph's *hub nodes*: they consume skill levels (XP earned in the skilling loop) and QP (earned from other quests), and emit XP lamps, area unlocks, teleports, and gear that feed back into skilling and combat. Area tasks consume both quests and skill levels and emit region-local economy boosts (weekly resource deliveries, teleport networks) that feed skilling efficiency. The capes consume everything and emit status plus genuinely strong utility (the comp/quest capes are real tier-75 hybrid gear with teleport perks — the trophy is also a tool). Attention tension is deliberate: quest skill requirements yank players out of quest mode into skilling mode for hours ("I need Slayer 87 before I can continue this story"), which converts narrative motivation into grind tolerance — the quest is the *reason*, the skill is the *timer*.

### 4. Pacing & gating

Early game is dense with cheap unlocks: sub-50 levels cost trivial XP (101,333 total for level 50 — under 1% of a 99), and dozens of quests are immediately startable, so the new player clears several graph nodes per session. Mid-game, the exponential curve bites: the requirement web thins to a handful of famous walls — the 85-90+ skill requirements on late Grandmaster quests, the 176-QP Recipe for Disaster gate, elite area tasks. Endgame pacing inverts entirely: the comp cape's 120s mean the *last* skill levels cost more than the entire rest of the account. Crucially, both quest and comp capes **unequip themselves when new content raises the bar** (wiki: Quest point cape; Completionist cape) — completion is a *subscription state*, not a permanent achievement, which converts every content patch into a retention event for the most invested players. The Dec 2022 removal of quest difficulty labels (wiki: Quests) is also telling: Jagex concluded a scalar "difficulty" was less honest than the requirement list itself — requirements *are* the difficulty rating.

### 5. Borrowable design lessons

1. **Price gates in time via one exponential curve.** A single `xp(L) ∝ 2^(L/7)` table lets every designer place a "+2 weeks" wall by writing one integer; players learn to feel the curve intuitively.
2. **Add a breadth currency alongside specific prerequisites.** QP-style gates ("any 176 points") force wide engagement without prescribing a route — an OR-gate over your whole content set, cheap to implement, huge for player agency. Include explicit OR-requirements too (RS3's "85 in any one of four skills").
3. **Compress goal stacks into telescoping badges.** Quest cape ⊂ Max cape ⊂ Comp cape gives every player horizon a single number to chase; each badge should be *usable gear*, not just cosmetic, so status and utility reinforce each other.
4. **Make completion revocable.** Auto-unequipping the badge when new requirements ship turns "done" players into your most reliable day-one consumers of new content.
5. **Pay regional checklists in regional speed.** Tiered task rewards that accelerate the same area (teleports, local success bonuses, weekly passive deliveries) create place attachment and make the reward self-demonstrating.
6. **Let requirements be the difficulty UI.** Skip abstract star ratings; show the DAG. Players trust "needs Slayer 87 + quest X" more than "Hard," and planning a route through visible requirements is itself satisfying gameplay.

---

## Live-Game Cadence: Dailies, Weeklies, DXP & Monetization

### 1. What the system is

RuneScape 3 is a subscription MMO whose retention layer is a stack of repeatable, time-gated activities layered over the core skilling grind: daily challenges and daily-capped resource activities, weekly minigames, monthly events, quarterly Double XP festivals, and (until 2026) a paid lootbox called Treasure Hunter that sold XP directly. The community named the resulting play pattern "Dailyscape" — a 30–60 minute chore route run before "real" play. Crucially, in January–March 2026 Jagex deleted most of this layer (Treasure Hunter removed, dailies converted to on-demand or accumulating weekly stock), making RS3 a rare documented case of a live game building the maximal retention stack *and then publishing its rollback rationale* — both halves are borrowable data.

### 2. The math

**Daily challenges** (wiki: Daily challenge; Challenge System). Three challenges assigned per day, hard reset 00:00 UTC; reward = a large-lamp-equivalent XP payout scaling with the level the skill had *at assignment*:

| Level | Challenge XP |
|---|---|
| 1 | 265.2 |
| 120 | 51,566 |
| F2P modifier | ×0.75 |

Pre-overhaul: reroll cost 10 vis wax; extension cost 25 vis wax for 2× length, 2× XP, 2× weekly-track progress; a weekly track paid 7 reward tiers at 3 challenges per tier, resetting Wednesdays. All of this was removed March 16, 2026.

**Tears of Guthix** (wiki: Tears of Guthix (minigame)). Weekly, Wednesday 00:00 UTC hard reset. Eligibility gate: ≥100,000 XP or ≥1 quest point earned since last visit. Collection time `t = QP × 0.6 s` (one game tick per quest point; ~27 s at the 44-QP minimum, 284 s at max, 314 s with quest-cape perk), harvesting ≈1 tear/s. XP goes to the player's **lowest-level skill**:

`XP/tear = 6 × L_lowest`, capped at 180 (L≥30), or 300 with the ornate bowl upgrade (cap L50).

**Penguin Hide and Seek** (wiki: Penguin Hide and Seek; Penguin points). Weekly hard reset: 12 disguised penguins hidden world-wide (6 worth 1 pt, 6 worth 2 pts by remoteness), +1 pt polar bear, +3 pt Shadow Realm penguin (quest-gated). Points bank to a **cap of 250** and spend on lamps costing 1/2/4/8 points (small/medium/large/huge) at a constant XP-per-point rate that scales with skill level (exact multiplier not stated on the wiki page — unverified), or 10,000 coins per point.

**Guthixian Cache** (wiki: Guthixian Cache). Divination minigame capped at 100 points/session; XP per 100 points scales from ~47 XP/pt at level 35 to ~367 XP/pt at level 99. Capping grants three 10%-chance economy buffs. Post-overhaul it triggers when players deposit 800 memories into a rift (player-pulled) instead of spawning hourly (server-pushed).

**Sinkholes** (wiki: Sinkholes). Spawns hourly at :30, lasts 15 minutes, participation capped at 2/day (soft reset — the new day's allowance requires a relog after 00:00). Rewards: Dungeoneering lamp scaled by level and match performance, plus tokens = 5% of the lamp XP, rounded up.

**Rune Goldberg Machine** (wiki: Rune Goldberg Machine; removed Mar 2026). Daily 3-slot rune-combination puzzle producing **vis wax**, max 100/day = 30 (slot 1, same rune for all players — community-solved daily) + 30 (slot 2, one of three) + 40 (slot 3, per-player random). Rune cost per attempt started at 300–2,000 runes by type and escalated +0.5% per attempt. Vis wax then fed aura extensions and daily-challenge rerolls/extensions — a daily currency whose sink was *upgrading other dailies*.

**Double XP Live** (wiki: Double XP Live). Runs ~4×/year. Each event opens a **10-day calendar window** containing a **48-hour personal timer** that ticks only while logged in and can be toggled against actual play. Multipliers: 2.0× for members (1.5× for Invention and Archaeology), 1.2× F2P; excluded: quest XP, lamps, Ironman accounts.

**Treasure Hunter** (wiki: Treasure Hunter; live Feb 2014 – Jan 19, 2026). Key-based lootbox paying XP lamps/stars, protean (no-material) training items, cash, cosmetics. Free keys/day: 1 (F2P) / 2 (member) / 3 (Premier); earned keys from quests (2 each) and daily challenges (1 each). Cash prices and published odds:

| Keys | USD | | Rarity | Odds |
|---|---|---|---|---|
| 15 | $5.99 | | Common | 58.68% |
| 35 | $11.99 | | Fairly common | 24.56% |
| 75 | $23.99 | | Uncommon | 10.36% |
| 200 | $59.99 | | Rare | 6.23% |
| 450 | $119.99 | | Super rare | 0.15% |

**Membership** (wiki: Membership). Base subscription $14.99/month, $131.88/year (~$10.99/mo); redeemable via tradeable **bonds** (1 bond = 14 days), letting rich players pay with in-game gold while another player pays Jagex cash — monetization of time, not power.

### 3. Interconnections

The cadences deliberately cross-feed: dailies produced vis wax → vis wax extended/rerolled daily challenges → challenges paid TH keys → TH paid proteans and lamps → which players *hoarded for DXP* (with lamps pointedly excluded from the 2× to cap the stack). Tears of Guthix reads your whole account (lowest skill) and quest state (timer = QP); Penguins read world geography and reward exploration of dead content. The attention tension was the design: every cadence wanted its slice of the session, and the currency links meant skipping one daily (Goldberg) degraded another (challenges). Membership sat underneath everything as the access layer; TH sat on top as the acceleration layer — and the two monetization philosophies eventually collided.

### 4. Pacing & gating

Reset taxonomy (wiki: Repeatable events): daily 00:00 UTC, weekly Wednesday 00:00 UTC, monthly on the 1st — with an explicit **hard vs soft** distinction (hard = flips at the tick; soft = flips on your next logout/login, forgiving sessions that straddle midnight). Early-game, dailies are a huge fraction of progression (a level-1 challenge lamp ≫ an hour of manual training); late-game they decay to garnish (51.5k XP vs multi-million-XP level costs at 120), so the cadence layer front-loads momentum and back-loads habit. Gates are cheap but meaningful: quest points scale Tears time; a 100k-XP-since-last-visit check blocks pure login farming; Shadow Realm penguin needs quest unlocks. The wall the system hit was cumulative, not individual: each daily was 2–10 minutes, but the *sum* became a mandatory pre-game tax, and Jagex's own Dailyscape Overhaul notes name the failure modes — chore-list play, FOMO from missable timers, and daily rewards outcompeting core training (wiki: Update:Patch Notes: Dailyscape Overhaul). The fix pattern: convert push to pull (caches on demand), convert daily caps to **accumulating stock** (shops moved from daily limits to 7-day accumulation at 5× quantity; crystal tree blossom banks up to 30 days), and delete daily login incentives outright.

### 5. Borrowable design lessons

1. **Stack cadences, but give every one a banked-grace buffer.** Daily/weekly/monthly layers create multiple return triggers, but each needs a miss-forgiveness reservoir — penguin points bank to 250, DXP is 48h inside a 10-day window, post-overhaul shops accumulate 7 days of stock. Rule of thumb: a missed period should *defer* reward, never *destroy* it; cap the bank at ~5–30 periods so lapsed players return to a jackpot, not a spreadsheet of losses.

2. **Aim weekly rewards at the player's weakest stat.** Tears of Guthix's `6 × lowest level` (cap 180/tear) is an automatic catch-up mechanic that nudges players into neglected systems and keeps builds rounded without any UI nagging.

3. **Personal timer inside a wide window beats a fixed event weekend.** DXP's 48-in-240-hours structure delivers festival energy and revenue spikes on a quarterly cadence while respecting schedules — no one's 2× hours burn while they're at work. For an incremental, this maps cleanly onto boosted-production windows.

4. **Make one daily a shared community puzzle.** The Goldberg machine's slot structure — one global answer solved socially, one personal random slot — turned a solo chore into a daily out-of-game coordination ritual (Reddit threads, Discord bots). Mixed shared/private RNG is nearly free to build and manufactures community.

5. **Sell time and access, never the progression curve.** The 12-year TH experiment versus OSRS's bonds-only refusal is a natural A/B test with a verdict: XP-for-money devalued the XP curve badly enough that Jagex amputated a revenue stream to restore integrity (wiki: Treasure Hunter; Update:Initial FAQ: Treasure Hunter, MTX Reductions & Integrity Roadmap). Subscription + tradeable time-vouchers (bonds) monetized the same whales without corroding the numbers everyone else grinds for.

6. **Design pull-based, accumulation-first "dailies" from day one.** RS3's endpoint after 12 years — player-triggered events, multi-day accumulating caps, soft resets, no login streaks — is the spec a new game should start with: the retention math of cadence without the FOMO tax that eventually forces an expensive public rollback.

---

## Minigame/activity reward shops and token economies (points-per-hour currency design)

### 1. What the system is

RuneScape 3 runs dozens of optional group activities ("minigames") and side-systems, each paying out its **own untradeable point currency** — Pest Control pays commendations, Slayer tasks pay Slayer points, and a meta-currency (thaler) accrues from playing *any* rotating "spotlighted" minigame. Each currency is spendable only at a curated NPC shop attached to that activity, pricing a mix of one-time unlocks, gear, and repeatable consumables. Because points are untradeable and earn at a roughly fixed rate per game or per minute, every shop price is implicitly a price in *hours of that specific activity*, fully insulated from the player-driven gold economy.

### 2. The math

**Pest Control (earn side)** — points per victory scale with lander difficulty, gated by combat level; a participation floor prevents leeching (wiki: Pest Control):

| Lander | Combat req | Points/win |
|---|---|---|
| Novice | 35+ | 2 |
| Intermediate | 70+ | 3 |
| Veteran | 100+ | 4 |

Reward eligibility requires ≥ 5,000 damage dealt in the round; repairing a barricade counts as 500 (wiki: Pest Control). Hard cap: 1,000 stored points (wiki: Void Knight commendation points).

**Pest Control (spend side)** — points convert to combat XP by a quadratic-in-level formula (wiki: Commendation Rewards):

```
Exp_per_point = ⌊ Level² × N ⌋ ,  Level ≥ 25
N = 80/400 (0.2)     Attack, Strength, Defence, Constitution
N = 77/400 (0.1925)  Ranged, Magic
N = 26/500 (0.052)   Prayer, Summoning
```

So one point yields 125 XP at level 25 but 1,960 XP at level 99 (melee). Bulk-spend bonus: +1% XP when redeeming 10 points at once, +10% for 100 at once (wiki: Pest Control). Shop anchors: void helm 200 pts, top/robe 250 each, gloves/deflector 150; repeatable sinks: herb pack 30, mineral/seed pack 15 (wiki: Commendation Rewards).

**Slayer points** — per-task payout scales with master difficulty, with streak multipliers of **×5 every 10th task** and **×15 every 50th** (wiki: Slayer points): Vannaka 2/10/30, Chaeldar 10/50/150, Kuradal 18/90/270, Laniakea 22/110/330. The first 5 tasks pay nothing, and full rates require the Smoking Kills quest (half, rounded down, without it). Spend side mixes agency purchases (cancel task 30, block 100, prefer 100) with permanent unlocks (slayer helmet crafting 400, ring crafting 300).

**Thaler (meta-currency)** — earned purely per unit time in any of 13 supported minigames: **1 thaler / 5 min** normally, **1 thaler / min** while that minigame holds the spotlight — a 5× attention multiplier; partial time carries over between games (wiki: Thaler). The spotlight rotation has 27 slots over 81 days (3 days per slot), with popular games weighted 2–3 slots. Shop anchors (wiki: Stanley Limelight Traders): whip/bow recolour unlocks 20, ring imbues 180, silverhawk down ×10 for 35, silverhawk boots 750, magic notepaper ×100 for 500, TzRek-Jad pet 1,200. Since thaler is time-denominated, every price is *literally* a playtime price: 35 thaler of down = 35 spotlight minutes; the Jad pet = 20 spotlight hours. There's even a lossy reverse exchange — a 3,355-thaler decorative set resells for 290 Castle Wars tickets (wiki: Thaler).

### 3. Interconnections

Each token shop imports value from elsewhere and exports it back: Pest Control consumes combat stats (lander gating) and food, and exports combat XP plus void armour that feeds bossing. Slayer points consume Slayer tasks (themselves the game's main combat-XP driver) and export *control over the task RNG itself* (block/prefer/extend), a self-referential feedback loop. Thaler sits above all of it, importing raw minutes from any minigame and exporting items originally exclusive to specific minigame shops — so one hour of the currently spotlighted game substitutes for grinding a dead one. The tension is attention allocation: point currencies can't be traded, so every reward demands *your* hours in *that* activity, competing directly with GP/hour moneymaking.

### 4. Pacing and gating

Early game: low-level landers and easy Slayer masters pay 2–4× less per unit than endgame tiers, and the 5-task / Smoking Kills gates delay Slayer income entirely. The Pest Control XP-per-point curve grows as L², while RS3's XP-to-next-level curve grows exponentially (~×1.104 per level) — so points get absolutely more valuable but relatively weaker late, keeping the activity useful without dominating training. Walls are deliberate: the 1,000-point cap plus the 100-point bulk bonus creates a spending cadence band (bank ≥100 for the +10%, spend before 1,000); Slayer's ×5/×15 milestones punish master-hopping and reward streaks; thaler's 5× spotlight rate makes off-rotation grinding feel 80% wasteful, herding population into whichever game is live so matches actually fill.

### 5. Borrowable design lessons

1. **Denominate meta-currency in time, not kills** — thaler's 1/min rate makes every shop price an honest hours-of-play price and auto-normalizes across activities of wildly different intensity.
2. **Untradeable currencies are inflation-proof sinks** — prices set at launch stay balanced forever because no market can arbitrage them; ideal for incremental games with runaway number growth.
3. **Split shops into one-time unlocks + repeatable consumables** — unlocks (void set, slayer helm) give a finite ladder; consumables (herb packs, notepaper, XP) keep the currency valuable after completion.
4. **Milestone multipliers (×5 per 10th, ×15 per 50th) buy loyalty cheaply** — streak bonuses cost little average yield but strongly discourage abandoning an activity mid-cycle.
5. **Scale currency-to-XP quadratically against an exponential level curve** — rewards visibly grow with player level yet naturally sunset as a fraction of total progress, avoiding a permanent optimal strategy.
6. **Use a rotating rate multiplier to resurrect dead content** — a scheduled 5× earn-rate spotlight concentrates the playerbase and re-prices old activities' rewards through one meta-shop instead of rebalancing each economy individually.

---

## Farming real-time growth timers and Player-Owned Farm (asynchronous/offline progression)

**What it is.** Farming is RuneScape's only continuous real-time system: you plant a seed in one of ~40 fixed world patches, and it grows on a wall-clock timer — online, offline, doesn't matter — until you return to harvest. Play collapses into short "runs" (teleport a circuit of herb patches in ~5 minutes, come back 80 minutes later), making it an idle/appointment game embedded in an MMO. The Player-Owned Farm (POF) extends this into animal husbandry: creatures grow through life stages over hours-to-days, breed on probabilistic timers, pass heritable traits to offspring, and passively generate produce. Design intent: convert *elapsed time* rather than *attention* into progress, giving a reason to log in on a cadence the player chooses.

**The math — crop timers.** Growth is not per-player: patches advance at fixed wall-clock "growth stage windows" anchored to midnight UTC, on a cycle length per crop class — herbs/allotments on short cycles up to 640-minute cycles for elder trees (wiki: Farming). A crop needs N stage-ticks to mature, so total time = N × cycle. Herbs: 4 stages × 20 min = 80 min (wiki: Ranarr seed). The spread of one system across three orders of magnitude of wall time is the key design move:

| Crop class | Approx. stage cycle | Total maturity |
|---|---|---|
| Herbs | 20 min | 80 min (wiki: Ranarr seed) |
| Trees | ~40-min windows | hours (wiki: Farming) |
| Fruit trees | ~80-min windows | ~half a day (wiki: Farming) |
| Elder trees | 640-min windows | multiple days (wiki: Farming) |

**Disease and mitigation.** At each growth tick a crop can become diseased *instead of* advancing; diseased crops halt until cured, and can die. Exact RS3 rates aren't published, but OSRS documents the shared model (wiki: OSRS Disease (Farming)): per-cycle disease chance is a per-crop constant out of 128 — herbs 27/128 (~21.1%), fruit trees 18/128, maples 13/128, magic trees 9/128 — and compost tiers multiply it down: compost −50%, supercompost −80%, ultracompost −90%, floored to the nearest 1/128, with a hard floor of 1/128. Probability of clean maturation:

P(no disease) = (1 − p)^n, e.g. fruit tree + ultracompost: (1 − 2/128)^4 ≈ 93.9%

Alternatively, paying a nearby NPC gardener a fee in produce makes disease impossible for that crop (wiki: Farming) — a deterministic insurance option priced against the probabilistic one.

**Harvest yield ("lives").** Harvestable patches use a lives system: base 3 harvest lives, +1/+2/+3 for compost/super/ultra (wiki: Farming). Each pick rolls a chance to *save* a life:

ChanceToSave = (StatRandom + 1)/256, where
StatRandom = ⌊low·m_low⌋·(99 − lvl)/98 + ⌊high·m_high⌋·(lvl − 1)/98

with per-crop low/high constants, level interpolation across 1–99, and multiplicative gear modifiers (magic secateurs +10%). Expected total yield (wiki: Farming):

E[yield] = (Lives − 1) / ((1 − ChanceToSave)(1 − p_outfit)) + 1/(1 − ChanceToSave)

So compost buys *both* risk reduction and yield floor — one consumable, two knobs.

**POF math.** Animals advance egg → child → adolescent → adult → elder on offline wall-clock timers, no feeding required to grow; totals range from 60 min (rabbits) through 2,520 min (chinchompas) to 10,080 min — a full week — for dragons (wiki: Player-owned farm). Breeding: each species has a success chance and check cycle (rabbit 40%/5 min; dragon 80%/1,000 min), giving a geometric wait with mean ≈ cycle/p, plus **pity**: five consecutive failures forces a success. Non-breeding pens multiply cycle length ×1.5/×2/×3 (small/medium/large). Upkeep is the attention hook: each animal eats 1 food/hour; fed animals gain 5–9% happiness/health, starved ones decay −10%/hour, and low stats cut breeding odds and scale produce/XP down to a 10% floor. Traits occupy 3 slots, drawn from 78, stack across parents, and include maintenance-cancelling combos (Immune + Joyful = zero upkeep). Rare-collectible layer: shiny offspring at base 1/1,000, pushed by trait stacking (+2%/+3%/+5%) up to 20% for a shiny parent pair, worth +25% XP (wiki: Player-owned farm).

**Interconnections.** Farming consumes seeds (combat drops, Thieving), compost (Herblore/produce), teleports (Magic); it feeds Herblore (herbs → potions), Cooking, and POF food, while POF outputs beans (its closed shop currency), manure → compost, and permanent account buffs. The tension is attention-shaped, not resource-shaped: runs are high XP/minute but near-zero XP/hour if you camp — Farming *wants* to be interleaved with other skills.

**Pacing & gating.** Early levels come fast from short-cycle allotments; mid-game shifts to daily tree runs (huge lump XP, day-long timers); POF gates species by level (chickens 28 → dragons 92) and pens by Construction. Walls are calendar walls, not grind walls — you cannot brute-force a week-long dragon; elapsed days are the currency.

**Borrowable lessons.**
1. **Anchor growth ticks to global wall-clock windows, not plant-time** — synchronizes player check-ins into predictable routines and makes "runs" schedulable.
2. **Ship one timer system at three timescales (minutes/hours/days)** — short loops teach, long loops retain; players self-select cadence.
3. **Sell risk mitigation twice: probabilistic (compost, −50/−80/−90%) and deterministic (payment)** — pricing certainty against expected value is an interesting decision every plant.
4. **Make the yield floor and the risk knob the same consumable** — compost's dual effect makes a boring input feel mandatory-but-rewarding.
5. **Pity-timer stochastic breeding (forced success after 5 fails)** — keeps geometric waits bounded so long-cycle RNG never feels unbounded.
6. **Let upkeep be optional but breed-out-able** — traits that cancel feeding turn maintenance itself into a progression axis: the idle game gradually idles harder.

---

## Invention: Item XP, Disassembly & Perks (RS3's Incremental Layer)

### 1. What the system is

Invention is RuneScape 3's "elite skill": a crafting-adjacent progression layer unlocked only after heavy investment elsewhere (level 80 Crafting, Divination, and Smithing, unboostable — wiki: Invention). Its core loop: attach an "augmentor" to gear so the *item itself* gains XP while you fight or gather; then either **disassemble** the leveled item (destroying it for a huge burst of Invention XP plus components) or **siphon** it (keeping the item, taking less XP). Components feed **gizmos**, which roll semi-random **perks** — permanent stat mods with RNG-rolled ranks. The masterstroke is that *any* item in the 20-year item database can be disassembled into components, converting the entire legacy economy into fuel for the new skill.

### 2. The math

**2a. Elite skill XP curve.** Regular RS3 skills use the classic exponential curve (wiki: Experience):

$$xp(L) = \left\lfloor \tfrac{1}{4} \sum_{n=1}^{L-1} \left\lfloor n + 300 \cdot 2^{n/7} \right\rfloor \right\rfloor$$

Invention uses a separate elite curve — flatter than exponential at the top, heavier in the middle. I could not verify the closed form on the wiki, but the verified milestone totals show the shape (wiki: Experience/Table):

| Level | Regular skill XP | Elite skill XP |
|---|---|---|
| 50 | 101,333 | 2,100,917 |
| 99 | 13,034,431 | 36,073,511 |
| 120 (cap) | 104,273,167 | 80,618,654 |
| 150 (virtual) | ~2.9B | 194,927,409 |

Key property: halfway to 99 is level **84** for Invention vs level **92** for regular skills (wiki: Invention) — the elite curve is much closer to polynomial than exponential, so late levels stay attainable (120 elite < 120 regular). Fixed XP rewards (lamps) are halved for elite skills (wiki: Elite skills).

**2b. Item XP (equipment levels 1–20).** Augmented gear earns item XP as a fixed *fraction of the base XP the player earns* (wiki: Equipment experience): two-handed weapons ~9% of base combat XP; one-handed weapons, shields, body, and legs ~4.5% each; skilling tools range from ~3.2% (Thieving) to ~28.8% (Archaeology). Cumulative item XP thresholds (wiki: Equipment experience):

| Item level | 2 | 3 | 4 | 5 | 9 | 10 | 12 | 15 | 20 |
|---|---|---|---|---|---|---|---|---|---|
| Cum. XP | 1,160 | 2,607 | 5,176 | 8,285 | 28,761 | 40,120 | 81,960 | 232,755 | 972,440 |

**2c. Extraction: disassemble vs siphon.** Invention XP extracted from a leveled item, tier-80 gear baseline (wiki: Equipment experience):

| Item level | Disassemble XP | Siphon XP |
|---|---|---|
| 4 | 54,000 | 9,000 |
| 5 | 108,000 | 27,000 |
| 10 | 540,000 (max) | 270,000 |
| 12 | — | 540,000 (max) |

Siphon = disassembly value at (item level − 2); it caps at item level 12 while disassembly caps at 10 (wiki: Equipment siphon). Gear tier scales the payout linearly, +1.5% per tier above 80 (wiki: Equipment experience / Disassemble):

$$XP = XP_{base} \times \left(1 + 0.015 \times (\text{Tier} - 80)\right)$$

This creates the signature optimization decision: disassembling a level-10 item yields max XP but destroys expensive gear; a siphon (craftable at 27 Invention from 50 simple parts + 5 dextrous + 5 precious components, ~157k coins — wiki: Equipment siphon) yields the same XP at level 12 while keeping the item. Grace notes: siphoning at level 9 is slightly better XP/hour at higher siphon cost, siphons have a 50% recovery chance at item levels 13–15 and are never consumed at 16+ (wiki: Equipment siphon).

**2d. Disassembly economy.** Every disassemblable item has a category-determined material count (e.g. melee helm 6, body 8, boots 4; smithables yield 4 components per bar used — wiki: Disassemble). For each material slot: roll junk chance; if not junk, roll on the item's material distribution. Junk chance by the item's "disassembly level" *L* (wiki: Junk):

$$J = \begin{cases} 100 - 1.1L & 1 \le L \le 74 \\ \text{lookup, } 4.2\% \to 0.3\% & 75 \le L \le 89 \\ 0 & L \ge 90 \end{cases}$$

(Ammunition halves L first.) Nine research unlocks reduce junk multiplicatively — 1% at Invention 34 scaling to 20% at 105 — applied as $\hat{J} = \lfloor J \cdot g(r) \cdot 1000\rfloor / 1000$, with $g(r)$ from 1.0 down to 0.80 (wiki: Junk). Base disassembly XP is tiny — $\max(\lfloor 0.03 \cdot l \cdot g\rfloor, 0.1)$ with g = 10 for "good" item categories, else 1 (wiki: Disassemble) — the real XP lives in augmented gear (which also never rolls junk at item level 4+). Bulk QoL: up to 60 items per action, 1.2s per batch (wiki: Disassemble).

**2e. Perk generation (the RNG crafting engine).** Gizmos hold 5 material slots (9 for ancient gizmos); common materials cost 5 units per slot, everything else 1 (wiki: Perks). The documented algorithm (wiki: Calculator:Perks):

1. Each material contributes, per perk it can generate, a value of $base + random(0, roll)$; contributions to the same perk sum across materials.
2. Roll the **invent budget**: $\sum_{i=1}^{5} random\!\left(0,\ \lfloor \text{level}/2 \rfloor + 20\right)$ — five uniform rolls (a sixth for ancient gizmos), floored at your Invention level if the sum rolls lower. At level 120 each roll is uniform on [0, 80], so the budget approximates a bell curve with mean ≈ 200, max 400 (derived from the verified formula).
3. Each perk's summed value maps to a rank via per-perk **thresholds**; each rank has a **cost**. Example — Precise: thresholds 50 / 80 / 130 / 170 / 210 with costs 35 / 65 / 120 / 160 / 195 for ranks 1–5 (wiki: Calculator:Perks).
4. Sort candidate perk-ranks ascending by cost; walk them, and whenever budget > cost, generate that perk and subtract its cost. Stop after 2 perks.
5. In ancient gizmos, non-ancient materials have base and roll multiplied by 0.8 — better perks demand the rarer ancient components (wiki: Calculator:Perks).

Perk effects are linear per rank — e.g. Precise adds +1.5% of max damage to minimum damage per rank, max rank 5 (6 in ancient gizmos) (wiki: Precise). So player power comes from stacking central-limit-theorem dice: material sums vs. a budget distribution that grows with level.

### 3. Interconnections

Invention **consumes**: the entire item database (disassembly fuel — dead content became demand), Divination energy (divine charges power augmented gear, a continuous upkeep drain), Smithing/Crafting output, and GP via the Grand Exchange (component prices repriced thousands of items). It **feeds**: combat power (perks are among the largest DPS multipliers in the game), skilling efficiency (tool perks), and itself (siphons and gizmos are Invention products). The attention tension is elegant: item XP accrues *passively during whatever you were already doing*, but harvesting it forces an active choice — destroy gear (max XP), siphon (pay consumables, keep gear), or keep leveling to 20 for perk-viability bragging and better siphon economics.

### 4. Pacing & gating

- **Entry wall**: three level-80 prerequisites make Invention a mid/late-game reward — an elite skill as a prestige layer, not a starting mechanic.
- **Research gates**: equipment level caps unlock stepwise — cap 5 at Invention 4, 10 at 27, 15 at 60, 20 at 99 (wiki: Equipment experience) — so the harvest loop itself deepens with progress.
- **Early game is glacial, then explodes**: pre-27 you disassemble raw items for trivial XP; once siphons and level-10 caps unlock, XP arrives in 100k–500k+ lumps per item cycle. The elite curve's front-loaded middle (36M to 99) is tuned for exactly these lump sizes.
- **Junk as a soft gate**: low-level items are mostly junk (level-1 items: 98.9% junk), pushing players up the item-tier ladder for efficient component farming.
- **RNG gate at the top**: max-rank perk combos (e.g. Precise 6 + Eruptive 2 from 5 Precise + 4 Armadyl components in an ancient gizmo) effectively require level 120 plus boosts (wiki: Precise) — the grind continues past "max" through probability, not thresholds.

### 5. Borrowable design lessons

1. **Make items XP-bearing containers.** A passive accumulator (item XP as a % of player XP) that must be actively *harvested* converts existing play into a new currency with zero added attention cost until the interesting decision point.
2. **Destroy-vs-siphon is a great economic valve.** Max payout for destruction, slightly-worse payout for preservation at a consumable cost — one knob that lets players self-select between economy-sink and convenience.
3. **Turn your whole item database into fuel.** A universal "disassemble anything" verb retroactively gives every drop, craft, and vendor trinket a floor value and revives dead content — the cheapest content multiplier imaginable.
4. **Use a second XP curve shape for late-game skills.** A polynomial "elite" curve (halfway at 84/99, cheaper 120 than the exponential) lets you set high level caps without exponential despair.
5. **Roll crafted-item quality as dice-sum vs. budget.** Summing per-ingredient (base + uniform roll) against a level-scaled budget with rank thresholds gives smooth, analyzable RNG where both ingredients and character level matter — and top outcomes stay rare without hard locks.
6. **Gate the harvester, not just the harvest.** Unlocking higher item-level caps (5→10→15→20) through the skill itself makes the passive layer's ceiling a progression reward in its own right.

---

## Distilled Playbook

Each section ends with its own lessons; this is the cross-cutting shortlist — what RuneScape uniquely teaches, especially where it *differs* from the idle-game blueprint (NGU-style multiplier chains).

### Progression identity

- **One shared curve beats many bespoke ones.** A single memorable XP table across every skill makes pacing legible, lets folklore form ("92 is half of 99"), and gives designers one constant to tune. Differentiate skills by *content and verbs*, never by math.
- **Milestones without resets.** Virtual levels past the cap, a hard XP ceiling, cap raises as content patches, and telescoping badges (skill cape ⊂ max cape ⊂ completionist cape) extract prestige-tier value from one counter with zero reset mechanics. This is the anti-rebirth: worth considering as a *layer* even in a game that also has prestige.
- **Character = portfolio.** No classes; one character owns every track; Total level scores breadth. The core strategic question becomes allocation of attention across parallel exponentials — the same tension NGU builds with its shared Energy pool, achieved here with nothing but a sum.
- **Price attention, not just time.** For every skill, an AFK method earns ~1/3–2/3 of the active ceiling. Idle play is a supported mode with an honest discount, not an exploit — the single most transferable idea for a 3D incremental.

### Economy

- **Floor and ceiling every item with NPC math.** Fixed vendor value × 0.6 (minus a cast cost) = automatic price floor; NPC stock at markup = ceiling. A single-player economy only needs prices to move inside these bounds to feel alive.
- **Rent endgame power.** Degradation + repair fees (discounted by a crafting skill) make top gear a running cost, giving currency somewhere to go forever and production skills permanent relevance.
- **Ship a universal shredder.** "Disassemble anything into components" gives every item a floor value, revives dead content, and creates permanent demand — the cheapest content multiplier in the game's history.
- **Tax velocity; delete with the proceeds.** A 2% trade tax that funds automated item deletion converts market activity directly into deflation — self-tuning.

### RNG design

- **Sell players their own RNG dials.** Skip (cheap, transient), block (expensive, permanent), prefer (positive bias): randomness experienced as agency. Price blocks so they amortize over ~3–4 skips.
- **Segment pity by purpose.** Hard guarantees at 1–2× the denominator for progression blockers; soft pity (numerator +1 per D/5 kills, capped ×10) for prestige chases; none for economy-defining items. One pity policy for everything flattens the reward texture.
- **Let players price their own drop rate.** Telos's linear formula over chosen difficulty and banked-loot streak turns RNG into a wager the player authors — push-your-luck as an endgame drop mechanic.
- **Shard big drops** (5 × 1/100 instead of 1/500): same mean, √5 less variance, far less churn on mid-tier chase items.

### Structure & content

- **The requirement DAG is the campaign.** Show requirements instead of difficulty ratings; add a breadth currency (quest points: "any subset summing to 176") as an OR-gate over the whole content set; let players route themselves.
- **Make completion revocable.** The completionist cape unequips itself when new content raises the bar — your most invested players become guaranteed day-one consumers of every patch.
- **Pay regional checklists in regional speed** (teleports, local bonuses, weekly deliveries) — completing a place deepens the player's relationship with that place. Purpose-built for a 3D world.
- **Denominate side-currencies in time** (1 token/min) and keep them untradeable: every shop price is an honest hours-of-play price, inflation-proof forever, with a rotating 5× spotlight to herd population and resurrect dead activities.

### Live cadence (the 2026 verdict)

- **Banked grace everywhere:** a missed day defers reward, never destroys it (point banks, 48-h DXP timer inside a 10-day window, 7-day accumulating shop stock). Cap banks at ~5–30 periods so lapsed players return to a jackpot.
- **Pull, don't push:** player-triggered events over hourly server spawns; no login streaks. RS3 needed 12 years and a painful public rollback to arrive at this spec — start there.
- **Aim weekly catch-up rewards at the player's weakest track** (Tears of Guthix: XP × lowest skill level) — automatic build-rounding with zero UI nagging.
- **Monetize time and access, never the curve.** The Treasure Hunter experiment vs. OSRS's bonds-only refusal is a natural A/B test whose verdict was amputating the revenue stream: XP-for-money corrodes the thing everyone else is grinding for.

### What RuneScape adds to the idle-game references

NGU-style games generate depth by *stacking multiplier systems on one character loop*; RuneScape generates it by *widening the character into a portfolio and letting an economy connect players' time*. For a single-player 3D incremental, the most fertile hybrid is: an idle-style multiplier core, RuneScape's skill-web identity (parallel tracks with gather→process→consume interlocks), its attention-premium pricing (AFK floor ≈ 1/3 of active ceiling), its pity taxonomy on drops, and its banked-grace cadence layer — with the economy simulated between NPC floors and ceilings.

---

*Compiled 2026-07-19 from the RuneScape Wiki (runescape.wiki) and Old School RuneScape Wiki (oldschool.runescape.wiki); formulas verified against the cited wiki pages at time of writing. The client in this folder (NXT, `bin/win64` + js5 caches) contains assets only — all game logic is server-side, which is itself the final design lesson: an MMO's math lives where players can't decompile it, and RuneScape's is public anyway because the community rebuilt it empirically.*
