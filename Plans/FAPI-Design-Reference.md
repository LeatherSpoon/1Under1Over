# Farmer Against Potatoes Idle — Systems & Math Design Reference

*Reverse-engineered from the game's decompiled C# source (the `decompiled/` folder next to this file — 306 files from `Assembly-CSharp.dll`) for design study. All formulas and constants come from the actual code, rewritten in math notation. Intended use: borrowing ideas for a new 3D game — not reproducing FAPI.*

---

## The Big Picture

FAPI is the biggest and most system-dense of the decompiled games in this series (its code is ~3× NGU's), and its design is a masterclass in *managing sprawl*: how to run 15+ parallel subsystems, three prestige layers, and years of content without the whole thing collapsing. The load-bearing ideas:

1. **Death is the harvest.** A run ends by clearing an area or dying — and *either* pays skulls, the death-upgrade currency, scaled by depth (per-area multipliers grow from 2 to 12,000). An anti-stall enrage (enemy damage ramps +10%/s referenced to *your* max HP after a timeout) guarantees every stalemate converts to a death and thus a payout. Dying isn't failure; it's the collection event.

2. **The signature damage formula makes progress two-dimensional.** `damage_applied = damage · FE / (100 + EnemyMaxHP)` — the divisor is enemy max HP, so time-to-kill scales with the *square* of enemy HP, and Fighting Efficiency (FE) is a second, separately-purchased lever that linearizes it. Meanwhile crit/evade/drop percentages are *area-normalized*: each area defines threshold constants (×20–30 per difficulty step), so raw stats only matter relative to where you stand — percent stats never trivialize new content.

3. **The composition grammar: add within a system, multiply between systems, *exponentiate* between prestige layers.** Every global bonus is a product of 15–30 source terms, then 2–4 exponent layers on top (town, portal, souls: `B^(1+0.01n)`). The soul shop's flagship items sell *exponents on the whole aggregate* — when your multiplier is 10¹⁰⁰, one +0.01 exponent level is worth ×10¹⁰⁰·⁰¹ — the one SKU that stays worth buying for the game's entire lifetime.

4. **Three nested prestige loops with zero reset anxiety.** Reincarnation (minutes–hours) → Ascension (days) → Transcendence (weeks). Prestige currency is *derived from your peak, not banked*: `RP = f(highest level this cycle)`, watermarked so resetting never loses shop progress. Each layer pays the layer below a visible scalar (×(A+1) on RP, +25%/A on timer multipliers); milestone auto-grants skip re-grinding (areas auto-clear, QoL auto-maxes); the top layer keeps tunable percentages per subsystem ("keep 10% per 4 transcendences, cap 50%").

5. **Economies get *sunset*, not rebalanced.** At Ascension 30 the potato economy is frozen — its multiplier replaced by its endgame constant — and Sweet Potatoes take over; at 40, skulls become Skull Powder. And each subsystem's per-ascension compounding `1.05^(A−k)` starts at a different k (potatoes k=1, pets k=8, cards k=11, mining k=13…), so every ascension "wakes up" the next system. This is how a game runs 15 systems for years: retire old grinds at full value, stagger new ones.

6. **RNG is deterministic underneath.** Equipment, worms, pets, minerals — everything runs on pity counters (typically forced at ~2–2.5× expected attempts), and offline progress *actually simulates* 24 h of combat (expectation-collapsed) then banks the rest as bulk ticks for the factory systems only. Randomness is flavor; income is predictable, and therefore exactly simulatable.

## Contents

1. **The Multiplier Chain, Currencies, Big Numbers & Save State** — the keystone architecture
2. **Core Battle Loop, Waves & Death Upgrades** — dying as the harvest event
3. **Real-Time Combat Resolution** — ticks, class skills, buffs & debuffs
4. **The Battle Talent Tree** — the 500 KB node graph and its design grammar
5. **Dimensional Portal Floors & Subclass Talent Trees**
6. **Prestige Layers: Ascension, Reincarnation & Transcendence**
7. **Souls & the Soul Shop** — selling exponents; monetization with governors
8. **Pets** — collection, dual leveling clocks, team combos
9. **Cards** — charge-based leveling, temp/perma split
10. **Equipment, Drops, Inventory & Artifacts** — affix-count rarity, pity, prestige governors
11. **Farming, Cow Factory, Worms & the Production Economy**
12. **Mining Outposts & Miners** — procedural nodes, depletion decay
13. **The Grasshopper Contagion System** — zero-sum worker allocation
14. **Side Systems** — expeditions, challenges, minigames, seasons, achievements
15. **Distilled Playbook** — the transferable patterns, collected

---

## The Multiplier Chain, Currencies, Big Numbers & Save State

### 1. What this system is

FAPI is an idle-RPG where a farmer auto-battles potato monsters across 81 areas. Every subsystem (equipment, pets, cards, worms, cow factory, farming, mining, town, expeditions, prestige shops) exists to feed one central object: `BonusesFunction.cs`, a hub that recomputes ~40 named global multipliers (`PotatoesBonusesBD`, `PlayerExpBonusesBD`, `DeathPerkBonusesBD`, …) each of which scales one currency's income or one combat stat. The core loop is: kill potatoes → earn 5–10 parallel currencies → spend them in subsystem shops → those shops multiply the currencies again. Everything is stored in one flat, serializable `PlayerData` class, and all large values use the BreakInfinity `BigDouble` type.

### 2. The math

**Number model (BigDouble).** A struct of `double mantissa` (normalized to [1,10)) + `long exponent`. Effective range ≈ 10^±9.2×10¹⁸ with 17 significant digits (`MaxSignificantDigits = 17`, equality tolerance 1e-18) — precision is *relative*: `X + 1` is a no-op once X > ~1e17, which the game embraces (all income is batched, never incremented by 1). Display (`Form.cs`): full digits below 10^9; then user-selectable letter suffixes (K, M, B, T, Qa … Vi = 10^63, then `eN`), pure scientific, or engineering (mantissa·10^{3k}); above exponent 100 000 decimals are dropped. Leaderboards store `log10(value)` as a plain double — a neat trick for ranking unbounded numbers.

**The composition grammar.** Every global bonus is built the same way — a *product of 15–30 independent source terms*, then 2–4 *exponent layers* on top:

```
B = Π (source terms)                                — multiplicative core
B ← B^(TotalBoni_i)  ^(1 + townBuilding)            — prestige exponent layers
B ← B^(1 + 0.02·soulPotion)  ^(1 + 0.01·soulLevel)  — paid/soft-premium exponents
```

Source-term archetypes (real constants, from `PotatoesBonusesCalc` and siblings):

| Archetype | Shape | Example constants |
|---|---|---|
| Battle/perk shop | `1 + L·0.02·(1+0.05·L_meta·M_skull)·M_potatoUp` | potato 0.02/level, EXP 0.02, confection 0.01, residue 0.0025 |
| Talent-tree nodes | `1 + 0.2·ΣNodes · 1.05^n₁ · 1.1^n₂ · 1.5^n₃` | small nodes additive, amplifier nodes exponential |
| Cow shop | `1.01^L` (compounding) | nearly every stat has one |
| Soul shop | `1.25^min(L, cap)` | cap grows with Ascensions (below) |
| Reinc shop p.3 | `1 + 0.02L·(1+0.01A)·(1.01+0.0001A)^L` | linear·exponential hybrid |
| Per-ascension | `1.05^(A−k) · (1 + 0.25(A−k))` | k staggered per system (see §4) |
| Reinc-level ladder | `1 + max(0, RL−T)·(a + b·Asc)·(1+ε)^min(RL−T−1, 3000)` | e.g. potato: T=25, a=0.015, b=0.00075, ε=0.0005 |
| Milk/Calcium invest | see below | log-power softcaps |
| Flat multipliers | pets, cards, expeditions, assembler, equipment, artifacts | one function call each |

Additive stacking exists only *inside* a source (node sums, combo counts); *between* sources everything multiplies. Damage itself: attributes `Base = 5 + (classGain + attrBonus)·(Level−1)`, `STR ← Base·(1+equip)·talents`, then damage is soft-dampened `Dmg ← Dmg^0.6` in nerf-challenges, and Fighting Efficiency (the damage-vs-enemy-HP mediator, `dmg_applied ∝ Dmg·FE/(100+EnemyHP)`) is hard-capped at **1e8**.

**Sink-investment softcaps.** Dumping milk `m` into a stat gives (potato variant):
`1 + (1.475^{log_{3.25}(m+1)}/2·0.1 − 0.1) · (1+0.01·brewLvl) · (log_{2.75}(c+1)/3.25 + 1) · (1+0.005·fermentLvl)`
Since `1.475^{log_{3.25} m} = m^{0.33}`, this is a cube-root-ish curve on invested currency, with per-stat tuning (perk: `m^{0.30}/5`; worm qty: `m^{0.12}/12`). Late-game stats (pet damage) use **double-log** curves gated behind thresholds: active only above 1e60 milk, `1.045^{log_{max(1.0008, log_{1.0008}x − 10)} x}` — near-flat DR so an infinite sink never explodes.

**Prestige currency (Reincarnation Points).**
`RP_base = ⌊(ΔRL/5 + challengeRP)·(Asc+1) + ascGrant⌋`, and the banked total is a **high-watermark**: `RP_total = max(RP_total, RP_base + bestBonusEverSeen)` — you can respec freely, never lose progress. Lifetime RP feeds back as an S-curve meta-bonus:
`(1 + min(5·10⁵, 100·(1.01^{min(2000, RP−250)} − 1))/100) · max(1, 1.01^{log_{1.02}(RP−250) − 341})` — exponential ramp → log-slowdown → cap.

**Run-timer bonuses** (anti-reset-spam): reincarnation bonus is 0 below 900 s, then piecewise `t/7200`, `1+(t−7200)/14400`, `2+(t−21600)/43200`, all ×1.5 (×2 hard mode)·(1+0.25·Asc). Farming prestige: 0 below 1800 s, `t/86400`, then `1+(t−86400)/(172800+0.5(t−86400))` — asymptote 3.

**Event currency** grants an *exponent*, not a multiplier: `EventMulti = base^{500(1−e^{−p_eff/450})}`, `p_eff = points·(1−e^{−n/11})·(1+0.1·MP)` where n = ascensions since the boosted system unlocked. With base 1.01 that caps at 1.01⁵⁰⁰ ≈ 145×; ramp-in over ~11 ascensions prevents event rewards from nuking early games.

**Deterministic "RNG".** Drops are pity-driven: equipment every `100/dropChance` kills; worms have `pityTarget = round(2.5·10000/min(10000, wormChance))` with offline needing only 75% of it; larva `round(250/larvaChance)`. Randomness is flavor; income is predictable and thus simulatable.

**Offline model** (`OfflineMath.cs` + `GameTimer.cs`): on load, `offline = min(now − TimeSaved, 864 000 s)` (10-day credit cap). Combat is *actually simulated* for at most 24 h: waves of 10 pooled enemies, 50 attack rounds each, using precomputed effective stats (`Dmg·(1+critChance)`, `HP·(1+evade)`); once a steady state is detected the loop extrapolates by ×44 per cycle instead of simulating. Time beyond 24 h is banked into `Delta100ms` (cap +2×10⁹ s) and burned as bulk ticks for economy systems only (milk, plants, mining, pets, expeditions) — combat gets 24 h, factories get everything. The online loop is the same machine: real `deltaTime` accumulates into a 0.02 s tick bucket and a 1 s bucket, with 100× chunk processing when a backlog exists — one code path for online, tab-out, and offline.

**Save state.** One `[Serializable] PlayerData` (~1 000+ flat fields: ints, doubles, BigDoubles, fixed `int[180]` per-area progress arrays, `Node[]` talent arrays) → `JsonUtility.ToJson` → append salted-SHA hash (tamper check) → GZip → `fapi-save.txt` (+ a *separate* file for NG+ mode). Autosave: local every 30 s, cloud every 1800 s; save-time reseeds RNG; loading refuses saves from a newer build (`Version ≥ 10570` gate) and runs `ChangeOnNewBuild` migrations. Bonuses are **never saved** — only inputs (levels, counts); the entire multiplier web is recomputed on load across five staggered frames (`UpdateEveryStatsBonuses` 1–5).

### 3. Interconnections — the currency graph

| Currency | Earned from | Spent on / feeds |
|---|---|---|
| Potatoes → Sweet Potatoes (Asc 30+) | kills | battle upgrades (auto-bought) |
| Class EXP | kills | levels → attributes → dmg/HP |
| Skulls/Perks → Skull Powder (Asc 40+) | stage-based on death/clear ×4 on boss areas | perk upgrades |
| Worms, Poop, Larva, Silk, Residue | kill pity | worm-feeding stat levels (18 tracks) |
| Milk, Calcium, Brew/Ferment EXP | cow factory timers (30 s→3 s, 60 s→3 s via log ladders on ReincLevel) | invest-sinks into any stat (softcapped above) |
| Whack score, Potato Skins (capped) | minigame | whack shop |
| Reinc EXP → ReincLevel | reincarnating | unlocks the threshold ladder (T=25…16 000) |
| Reinc Points | ΔRL/5·(Asc+1), watermarked | reinc shops incl. REP3 |
| Ascension Points, Souls, Soul Potions | ascending / achievements / IAP | soul shop (×1.25/level, level-capped by Asc) & exponent potions |
| Pet/Expedition tokens, Cards, Renown, Minerals, Fries/Protein/Seeds, Gems | respective subsystems | cross-boost *other* systems' multipliers |

Every subsystem's output multiplies several *other* systems' income (pets boost potatoes, cards boost pets, town exponentiates milk…), so the chain is a dense directed graph, not a tree — and the exponent layers (portal, town, soul) sit above all of it.

### 4. Pacing & gating

- **Ascension milestones hard-swap economies**: at Asc 30 the potato multiplier is *frozen at 1* and replaced by Sweet Potatoes; the old battle-upgrade term becomes a constant (EXP 2.5e9, FightEff 5e6, DeathPerk 15e6, Milk 2.5e6, WormQty 160…). At Asc 40 perks → Skull Powder (constants 1e7, 3e4, 1e6…). Old grinds are retired at full value instead of scaling forever.
- **Staggered per-ascension compounding**: each system's `1.05^(A−k)·(1+0.25(A−k))` starts at a different k (potato/EXP k=1, perk k=3, poop/whack k=5, milk/brew k=7, pets k=8, item rating k=9, cards k=11, mining k=13/15, fries k=16, outposts k=18) — every ascension "wakes up" the next subsystem.
- **ReincLevel threshold ladder** (T = 25, 50, 100, 250, 500, 1000, 2000, 3500, 5000, 6500, 8000, 9500, 11000, 12500, 14000, 16000) drip-feeds new bonus lines from one number the player is always growing; each line's exponential rider is capped at 3000 levels past T.
- **Monetization throttle**: soul-shop level cap = 1 (Asc<10), `2+⌊(A−10)/5⌋`, then `10+⌊(A−50)/10⌋` — paying can't outrun progression.

### 5. Borrowable design lessons

1. **One aggregation hub, recomputed from inputs** — never serialize derived stats; a single `RecalcAll()` staged over a few frames makes 40 systems tractable and save-migration trivial.
2. **Multiply between systems, add within a system, exponentiate between prestige layers** — this grammar keeps every purchase feeling meaningful while letting late layers (an exponent of 1.01 on a 1e300 bonus) dwarf everything without new UI numbers.
3. **Watermarked prestige currency** (`max(total, base+bestBonus)`) plus free respec removes reset anxiety entirely.
4. **Pity-based determinism instead of RNG** makes offline progress exactly simulatable — the 24 h combat sim + banked bulk-tick split is directly reusable in a 3D game where combat is expensive but factories are cheap.
5. **Timer-shaped prestige rewards** (0 below 15–30 min, linear to a knee, asymptotic after) tune optimal run length without hard rules.
6. **Sunset old grinds by constant-substitution at milestones** — replacing a whole upgrade tree with its endgame constant (and a new currency) is cheaper than rebalancing it, and reads as a fresh start to the player.

Key files: `decompiled/BonusesFunction.cs` (all aggregation formulas), `decompiled/PlayerData.cs` (full save schema), `decompiled/OfflineMath.cs` + `decompiled/GameTimer.cs` (offline/tick model), `decompiled/SaveManager.cs` (JSON+hash+GZip persistence), `decompiled/BreakInfinity/BigDouble.cs` + `decompiled/Form.cs` (number model/formatting), `decompiled/ReincarnationMain.cs` (RP formula), `decompiled/SoulMain.cs` (soul-level cap).

---

## Core Battle Loop, Waves & Death Upgrades

### 1. What the system is

FAPI's core loop is a side-scrolling auto-battler: potatoes walk toward the farmer, he auto-attacks on a timer, and each kill pays three currencies (potatoes → battle upgrades, class EXP → levels, and a chance at equipment). A run ends in one of two ways — the player clears all stages of an area, or **dies** — and *either* ending pays the prestige-lite currency "skulls," which buy Death Upgrades. Dying is therefore not a failure state but the primary harvest event: you push as deep as possible, die, spend skulls, and re-enter stronger. Everything is area-normalized: enemy stats, crit/evade caps and attack-speed all reference per-area constants, so raw numbers only matter relative to where you're standing.

### 2. The math

**Damage mitigation — the signature formula.** Every hit (player→enemy) is scaled by Fighting Efficiency (FE, base 100, hard-capped at 1e8):

- `damageApplied = hitDamage · FE / (100 + EnemyMaxHP)` — crits multiply further by `CritDmg = 1.5 + 0.3·(class big-nodes)`.

Because the divisor *is enemy max HP*, time-to-kill ∝ `MHP²·Boss/(Dmg·FE)`. Damage needed to progress scales with the **square** of enemy HP, and FE is a second, separately-purchased lever that linearizes it. (EnemyStats.TakeDamage, BonusesFunction.FightingEfficiencyCalc.)

**Player stats** (PlayerStats.cs; `w` = attribute weight `5 + 2·(skill-nodes)·…`):

| Stat | Base formula (before ~30 global multipliers) |
|---|---|
| Attack | `(70 + STR·w + 0.2·LCK·w)` |
| Max HP | `(350 + 5·CON·w + LCK·w)` |
| Regen /s | `(2 + CON·w/10 + LCK·w/50)` (1 s tick; also triggers on evade with a 0.5 s ICD once unlocked) |
| Crit/Evade raw | `(DEX or AGI)·w/30 + LCK·w/150 + 2.5` |
| Attack speed | `2 + 0.05·PerkAtkSpdLevel`, divided by the area's `AttackSpdModifier`, capped ×10; clicking adds +0.02/click up to ×1.5, decaying over ~500 s |

Both Attack and HP share the battle-upgrade factor `(1 + 0.02·L_upg·(1 + 0.05·L_perkMeta·skullBonus)·potatoBonus)` — the two upgrade layers multiply *each other*.

**Percent-stat softcaps (area-normalized).** Each area defines `CritModifier` (≈1 at area 1-Easy, 1e6 by area 17, 1e19 by area 50, ×20–30 per difficulty step). With threshold `T = 0.1·CritModifier` and cap `Limit = 25`(+talents):

- below: `finalCrit% = 0.2·Limit·(raw/T)`
- above: `finalCrit% = min(Limit, 0.2·Limit + (2.5·Limit/100)·log₁.₅(raw/T))`

i.e. you get 5% at threshold and +0.625 pp per further ×1.5 of raw stat — the cap needs ~1.5³² ≈ 430,000× the threshold. Evade is identical; item drop uses `T = 0.25·DropModifier`, `final% = min(1, 0.25 + 0.05·log₁.₅(ratio))·DropLimit` with `DropLimit ≈ 1%`, plus a pity counter that accumulates `DropChance` per miss and forces a drop at 250 (≈2.5× the expected wait).

**Enemy generation** (OfflineMobStats.GetMobStats). For area band with base `H₀, D₀`, area step `r`, stage growth `g`, difficulty `d`:

`MHP = H₀·r^(a−a₀)·g_H^stage·eliteMult·U(0.75,1.25)·k_H^(d−1)·0.99^{PerkPotatoHP}·(0.8 if Asc>4)` (damage analogous, roll U(0.5,1.5)). Representative bands:

| Areas | H₀ | ×/area | g_H | D₀ | ×/area | g_D | k_H, k_D per difficulty |
|---|---|---|---|---|---|---|---|
| 1–8 | 250→175k | manual | 1.01–1.02 | 1.25·stage→350k | manual | 1.01–1.03 | 12·2.5, 75·6 |
| 10–17 | 2e6 | 3.9 | 1.015 | 1.5e7 | 9.4 | 1.03 | 12·2.5, 60·6 |
| 19–26 | 5e11 | 3.17 | 1.0145 | 1e16 | 6.4 | 1.0235 | 12·2.5, 60·6 |
| 28–36 | 5e16 | 7 | 1.025 | 1e23 | 40 | 1.047 | 49, 1600 |
| 46–54 | 2.5e32 | 21 | 1.039 | 5e53 | 441 | 1.079 | 441, 441² |
| 55–63 | 1e51 | 1e8 | 1.28 | 8e90 | 1e16 | 1.64 | 1e12, 1e24 |
| 64–72 | 1e160 | 1e24 | 2 | 1e320 | 1e48 | 4 | 1e36, 1e72 |
| 79–81 | 1e2500 | 1e1250 | 1e16 | 1e5000 | 1e2500 | 1e32 | 1e1750, 1e3500 |

Rewards grow far slower: `potato = P₀·1.5^(a−a₀)·1.01^stage`, EXP ≈ half that; difficulty only multiplies rewards ×1.5^(d−1) (×25–500 late). Boss areas (every 9th) use ~2–3× stage exponents.

**Elites & bosses.** Each spawn has a 40% roll; area-unlocked affix checks each pass at 33%: Fast (+0.6 spd, −0.2 stats), Strong/Shield (+0.6 stats), Poison (DoT = dmg/10), Slow, Stun, Crit-disable, Evade-disable — modifiers stack additively, clamped to speed [0.2, 2.5], stats [0.5, 2.0], each adding +0.1–0.3 reward. Bosses (stage%25==0 in boss areas): HP ×5 (`BossModifier`) ×1.5, attack interval ÷5, drop ×1.5, skulls ×4. **Anti-stall enrage:** after `10·min(3,Boss)` s, every 1 s enemy damage does `D += PlayerMaxHP·0.0002·difficulty; D ×= 1.1` — any stalemate converts to a death (and thus a skull payout) within a minute or two.

**Wave pacing.** Stage target = `100·difficulty` per area; kills per stage `= max(StageKillRequired − PerkRequired − bonuses, StageKillMinimum)` with `StageKillRequired = base(area) + step·2^(d−1)` (area 1: 5·2^(d−1); area 50: 265+20·2^(d−1); minimum 5, 20 in boss areas). Spawn interval `= max(0.5 + AreaSpawnMod − (L_respawn+bonus)/50, 0.25)·U(0.5,1.5)` s, batch size `clamp(1 + L_qty − AreaSpawnCountMod, 1, 5)`, on-field cap `20 + L_max`.

**Battle upgrades (potato-bought, reset on Ascension).** All 19 follow `Cost(L) = [(B + B/10·L)·(g₀ + L/k)^L · R]^{0.99^{townLvl}}`— linear-times-exponential with an *accelerating* base:

| Upgrade (effect +2%/lvl unless noted) | B | g₀ | k |
|---|---|---|---|
| Attack, HP+Regen | 100 | 1.01 | 10000 |
| Potato gain | 500 | 1.011 | 7500 |
| Class EXP | 1000 | 1.012 | 5000 |
| Fighting Efficiency | 2500 | 1.012 | 5000 |
| Skull gain | 25000 | 1.024 | 2500 |
| …late tiers (worms→reinc pts) | 1e6→1e46 | 1.15→1.61 | 2500→500 |

`R` halves per death-perk price-reduction level and ×0.75 per challenge completion.

**Death upgrades (skulls).** Earned on *every* run end (death or map switch) with stage>5: `skulls = ⌊stage · SkullBonus · (1 + 0.25·(d′−1)) · (4 if boss area)⌋`, where `SkullBonus = 1.5·PerkZoneModifier·(1 + 0.02·L)·(~25 more multipliers)` and `PerkZoneModifier` is a per-area constant (2, 3, 4, 5, 7, 10, 15, 25, 50 for world 1; 100→450 for areas 10–20; 12,000 by area 50) — deeper death = exponentially more skulls. Cost shapes are deliberately varied:

| Perk | Cost | Effect |
|---|---|---|
| Attack; HP+Regen | `(1+L/10)·1.003^L` (near-linear!) | ×(1+0.02L) each |
| Attack speed | `2·2^L` | +0.05 attacks/s |
| Crit / Evade | `(10+10L)·(1.02+L/1000)^L` | raw ×1.05^L |
| Drop | `(25+25L)·1.75^L` | ×1.1^L |
| Meta "upgrade-the-upgrade" ×9 | `(5+5L)·1.02^L`… | +5% to a potato upgrade's per-level value |
| Spawn qty / required / respawn / max | `500·100^L` / `(L+1)·500·1.5^L` / `250·1.5^L` / `1000·2.2^L` | +1 per batch / −1 kill per stage / −0.02 s / +1 cap |
| Enemy Atk↓ / HP↓ (cap 150) | `500·1.25^L·1.25^{max(0,L−50)}` | enemy stat ×0.99^L (→ ×0.22) |

**Offline simulation (OfflineMath).** Offline time is clamped to 10 days, of which 24 h is simulated; the excess feeds a banked "time credit" (`Delta100ms`). The sim collapses randomness into expectations: `Dmg_eff = Dmg·(1+crit)`, `HP_eff = MaxHP·(1+evade)`, `Regen_eff = Regen·(1+evade)`. Mobs come in packs of ≤10; per tick the pack loses `Dmg_eff·FE/(100+MHP)/max(atkPeriod,0.2)` and deals `n·EnemyDmg/max(interval,0.05)`; 50 ticks without resolution = stalemate, run over. Run duration is spawn-limited: `T += n/batchSize·spawnInterval`. Then **closed-form extrapolation**: while `49·T_run + 750 ≤ remaining`, grant **44×** one run's rewards (potatoes, EXP, skulls, expected drops `⌊kills/(100/dropChance)⌋·45`, worm pity at 0.75× target) and advance the clock `49·T + 750` — an intentional ~10% efficiency haircut plus 750 s overhead per block, max 100 blocks. Offline deaths demote one area if you die before stage 3.

### 3. Interconnections

Kills → potatoes → battle upgrades (attack/HP/FE/economy) → deeper stage at death → skulls (scaled by depth × per-area PerkZoneModifier) → death perks that both boost stats *and* multiply the potato-upgrade layer (meta-perks), which loops back into deeper runs. Class EXP from the same kills drives levels (`ExpToLevel(L) = 50·L·(1.01 − 0.0001·reducer)^L`), and levels gate which death perks may be bought at all. Equipment drops feed attribute multipliers (STR/CON/DEX/AGI/LCK) that are the *bases* of every combat formula. Tension: potatoes are spent across 19 competing upgrade tracks; skulls across ~28; drop/crit/evade investment is wasted if the area's normalizer has outgrown it.

### 4. Pacing & gating

Battle upgrades unlock by reaching stage X of area Y (HP at 1-5, EXP at 1-50, FE at 2-25, skull-gain at 3-50, …, area 37-50 + 8 ascensions for the last). Death perks unlock purely by class level: 5, 10, 250, 750 … 12,500 (+ ascension counts late). Difficulty tiers gate on clears (Medium: clear 2-8-50; Hard: 4-3-50 + 7 ascensions). Hard **stat-check walls** sit at world bosses and areas 75/78: e.g. area 45 requires `PlayerDmg ≥ 2.5e52·105000^(d−1)`, area 72 requires `1e850·(1e650)^(d−1)`. Early game grows fast (stage growth 1.01–1.02, near-linear costs); walls come from per-area jumps (×3.9 → ×7 → ×21 → ×1e8 → ×1e1250) that outpace stage grinding, forcing prestige-layer engagement. At Ascension 30/40 the entire potato/skull layer is frozen at fixed multipliers (2.5e9 / 1e8) and replaced by the next-tier currencies.

### 5. Borrowable design lessons

1. **Death as payday, not punishment** — awarding the meta-currency `depth × zone-multiplier × 4-on-boss` on every run end makes "push until you die" the optimal, emotionally-positive loop; the enrage timer (`+0.02%·maxHP/s, ×1.1 compounding`) guarantees runs end, so the loop never stalls.
2. **Divide damage by enemy max HP** (`FE/(100+MHP)`) — making effective TTK ∝ HP²/(Dmg·FE) creates a second mandatory damage stat and keeps one-shotting old zones cheap while new zones stay steep.
3. **Area-normalized softcaps** — rating percent stats (crit/evade/drop) against a per-zone constant with a log return above threshold (`5% + 0.625pp per ×1.5`) lets those stats stay relevant for hundreds of hours without ever revising the 25% cap.
4. **Sell the battlefield, not just the player** — perks that raise spawn rate/batch size, cut kills-per-stage, and *debuff enemy stats globally* (0.99^L, capped ×0.22) feel qualitatively different from +2% damage and directly buy throughput.
5. **Two multiplying upgrade layers** — cheap prestige "meta-perks" that boost the *per-level value* of the resettable layer (`0.02 → 0.02·(1+0.05L)`) make each prestige visibly super-linear without touching base formulas.
6. **Expected-value offline with a haircut** — simulate one real run with EV-folded RNG (crit/evade → flat multipliers, drops → pity/expectation), then pay 44 runs per 49-run-plus-750 s block: cheap to compute, deterministic, and keeps active play strictly ~10% better than idling.

---

## Real-Time Combat Resolution: Ticks, Class Skills & Debuffs

### 1. What it is

This is FAPI's moment-to-moment combat resolver: the player character stands on a 2D battlefield, auto-attacking potato enemies in an overlap circle. `BattleMain` owns the attack cadence timer, the damage multiplier stack from class-skill buffs, and all player-side status effects (poison, slow, stun, crit/evade disable). `BattleGameOver` owns what happens on knockdown: converting the failed run into "skull" prestige currency and auto-restarting. Death is deliberately a *reward event*, not a fail state — you die, bank perk currency, and respawn at full HP ~15 s later.

### 2. The math

**Attack cadence.** An accumulator advances every frame while not stunned: `Δ += dt · AutoSpeedBonus`. A swing fires (and Δ resets) when

```
Δ ≥ (1 + 0.5·Slow) / min(AttackSpeed / AreaAtkSpdModifier, portal ? 10 : 5)
```

so effective APS = `min(AtkSpd/AreaMod, 5)` (10 in the portal dungeon), stretched ×1.5 while Slowed. Base `AttackSpeed = 2.0`. `AreaAtkSpdModifier` is a per-region attack-speed *tax*: `base + 0.5·2^n` with base ∈ {0.5, 0.75, 1.0, 1.25} by world tier (OfflineMobStats.cs) — later zones demand ever more raw speed stat to stay at the 5 APS cap. `AutoSpeedBonus` is a click-frenzy: +0.02 per mouse click, capped at 1.5×, decaying to 1.0 over `500·(1+0.2·u₁)·(1+4·u₂)` seconds (u = purchased upgrades); it resets on death unless a permanence upgrade is owned.

**Damage per swing** (AoE — every enemy inside radius `Screen.width/5.5` takes full damage):

```
D = PlayerDmg × max(1, (1+0.1·(B₄+B₇))·Farmer) × max(1, (1+0.05·(B₁₈+B₂₁))·Smasher) × max(1, (1+0.1·(B₃₂+B₃₅))·Hoer)
```

where `Bᵢ` are BigNode talent counts and each `SkillOn` flag ∈ {0,1} (the `max(1,·)` neutralizes inactive buffs). The Smasher buff is **consumed by the swing** — zeroed immediately after damage is computed. On the enemy side the hit resolves as `HP −= D · FightingEfficiency/(100 + EnemyMaxHP) · (crit ? CritDmg : 1)`.

**Class skills** — each class converts a different combat event into a buff, gated on having ≥1 point in that class's two big talent nodes:

| Class | Trigger | Effect | Duration |
|---|---|---|---|
| Farmer | successful evade | dmg ×(1+0.1·(B₄+B₇)) | 0.5·(B₄+B₇) s; refreshed per evade |
| Smasher | any non-stage-clearing kill | next swing ×(1+0.05·(B₁₈+B₂₁)) | one hit |
| Hoer | crit (replaces crit dmg that hit) | dmg ×(1+0.1·(B₃₂+B₃₅)) | 0.5·(B₃₂+B₃₅) s |
| Harvester | crit (keeps crit dmg) | worm drop chance up | B₄₆+B₄₉ **kills** (decrements per kill) |
| Rancher | evade | milk gain up | B₆₀+B₆₃ s |
| Freeloader | item drop | item-rating up | 10·(B₇₄+B₇₇) s |

Quirk: buff timers tick in a prioritized if/else chain (Farmer → Hoer → Harvester → Rancher → Freeloader), so a higher-priority active buff pauses the countdown of lower ones. Farmer's evade-proc still takes the enemy hit and its debuffs — the class trades avoidance for offense.

**Debuffs** (rolled per enemy hit via `ApplyDebuffToFarmer`, only from mobs carrying the matching affix; affixes spawn with ~33% chance and grant the mob +30% stats *and* +30% rewards):

| Debuff | Proc | Effect | Duration | Reapply lockout |
|---|---|---|---|---|
| Poison | 20% | `EnemyDmg/10` per 0.1 s tick → 5× EnemyDmg total | 5 s (50 ticks) | 5 s |
| Slow | 0.5% | attack interval ×1.5 | 15 s | 15 s |
| Stun | 0.5% | attack accumulator frozen | 1 s | 10 s |
| Crit-disable | 5% | player cannot crit | 5 s | 10 s total (5 s debuff + 5 s grace) |
| Evade-disable | 5% | player cannot evade | 5 s | 10 s total |

Poison ticks only while HP > 5 but can still deliver the killing blow, triggering the full death path.

**Death payout** (`GetSkull`, only for stage > 5, with anti-exploit guards against ascension/offline timing):

```
Skulls = ⌊Stage × DeathPerkBonus × (1 + 0.25·d) × (Area mod 9 = 0 ? 4 : 1)⌋
```

`d = Difficulty−1` for difficulties 1–3; on endless difficulty d ∈ {1.15, 2.15, 3.15, 4.15} by endless-progress thresholds (<125, <225, <325, ≥325). After Ascension 40 the same formula pays a second-tier currency (Skull Powder). Auto-restart fires after `15 − upgrades` seconds; restart fully heals, increments a `DayPassed` counter (feeds reincarnation conditions), and keeps a rolling 15-run average-gains log.

### 3. Interconnections

`PlayerDmg`, crit/evade chances, and `FightingEfficiency` flow in from the stat system (STR/DEX/AGI chains); `BigNode` counts flow in from the class talent tree. Outputs are unusual: three of six class skills buff *economy* systems (worms, milk, item rating), not damage — combat RNG events pump the idle economy. Skulls feed the death-perk prestige shop, which loops back into `DeathPerkBonus`, compounding future deaths.

### 4. Pacing & gating

Attack rate is triple-gated: a hard 5 APS ceiling, a regional divisor growing ~2^n, and an active-play frenzy worth up to +50%. Debuff lockout timers (5–15 s) cap status-effect uptime regardless of enemy density. The 15 s death timer plus 2 s restart sets the minimum cycle time of the die-and-earn loop; boss areas (every 9th) paying 4× skulls steer where players choose to die.

### 5. Borrowable design lessons

- **Make death a payout, not a punishment**: `Stage × bonus × difficulty` skulls on knockdown turns wipes into deliberate farming decisions — ideal for a 3D game where dying deep in a dungeon banks currency proportional to depth.
- **Class identity via event-to-buff conversion**: every class listens to a different RNG event (evade/crit/kill/drop) and buffs a different subsystem — cheap to implement, huge build diversity.
- **Consumable one-hit buffs** (Smasher) reward attack *timing* in an otherwise idle game.
- **Reapplication lockouts instead of resist stats**: fixed immunity windows (poison 5 s, slow 15 s) bound worst-case debuff uptime with zero balance math.
- **Regional attack-speed tax** (`min(spd/areaMod, cap)`) keeps a capped stat meaningful forever: the cap is constant, but staying at it requires growth.
- **Risk-tagged elites**: affix mobs with +30% stats *and* +30% rewards make dangerous spawns desirable rather than merely annoying.

Sources: `E:/Games/steamapps/common/Farmer Against Potatoes Idle/decompiled/BattleMain.cs`, `BattleGameOver.cs`, with trigger/debuff context from `EnemyStats.cs` and cadence inputs from `PlayerStats.cs`, `OfflineMobStats.cs`.

---

## The Battle Talent Tree

### 1. What It Is

FAPI's Battle Talent tree is a single giant graph of ~462 nodes (342 small, 84 big, 36 giant) shared across the game's six combat classes. Players earn talent points passively from class levels, spend them one node at a time along adjacency-gated paths radiating from class-specific root nodes, and the whole tree is wiped and refunded automatically on every prestige (Reincarnation or Ascension). Because prestige happens constantly, the game layers on loadouts and an auto-spender that replays your recorded build in the exact order you originally bought it — the tree evolves from a decision system into an automation system as the player matures.

### 2. The Math

**Point income.** Points come from three faucets, all level-derived rather than currency-derived:

$$P_{total} = \underbrace{\lfloor L_{current}/10 \rfloor}_{\text{this run}} + \underbrace{\sum_{c=1}^{6}\lfloor L_{c,highest}/100 \rfloor}_{\text{permanent}} + \underbrace{P_{challenge}}_{\text{fixed rewards}}$$

$$P_{available} = P_{total} - P_{invested}$$

Class EXP to reach level $n$ is $50\,n \cdot (1.01 - 0.0001\,R)^n$ ($R$ = a purchasable formula-reducer), so the per-run faucet is exponentially throttled while the permanent faucet (1 pt per 100 highest-ever levels, per class) rewards playing all six classes.

**Node archetypes and costs.** Every node is one of six data shapes:

| Archetype | Cost/level | Max level | Typical effect | Count |
|---|---|---|---|---|
| Small T1 | 1 pt | 5 | +2 stat/lvl or +10–20%/lvl | 252 (42×6) |
| Small T2 | 5 pt | 1 | ×1.05 or ×1.10 to a whole category | 90 (15×6) |
| Big T1 | 5 pt | 3 | resource/drop bonuses (+1 worm, +0.3× crit, +25% milk) | 54 (9×6, incl. 12 class ultimates) |
| Big T2 | 15 pt | 1 | ×1.05–1.10 category multipliers | 30 (5×6) |
| Giant T1 | 25 pt | 1 | +25% reincarnation EXP or +1 class attribute | 18 (3×6) |
| Giant T2 | 25 pt | 1 | ×1.10 ALL stats / ALL bonuses, or ×1.5 one category | 18 (3×6) |

Full tree = exactly **3,720 points** (each class can only buy its own 2 "ultimate" Big nodes, excluding the other 10). When $P_{total} \ge 3720$, the game silently auto-completes and freezes the tree (`isMaxxed`) — the system retires itself.

**Effect aggregation.** Each bonus category $k$ is computed as an additive base times stacked multiplicative T2 layers:

$$B_k = \Big(\sum_{i \in S_k} \text{lvl}_i \cdot b_k\Big) \cdot 1.05^{\,n_{T2small}} \cdot 1.10^{\,n_{T2cluster}+G_4+G_6} \cdot 1.5^{\,n_{T2giant}}$$

with real per-level bases $b_k$: stats (STR/DEX/AGI/LCK) = 2 flat, CON = 10 flat, Potato gain = +20%, class EXP / fighting efficiency / death-perk / confection EXP / worm chance = +10%, worm/larva quantity = +1, drop chance & milk & brew EXP & dungeon damage = +25%, reincarnation EXP = +25% per giant node. Each stat category draws from exactly 24 small nodes spread over all six class regions (max additive base $= 24 \times 5 \times 2 = 240$ flat), then up to 8 T2-small (×1.05 each), 7 ×1.10 sources, and 2 ×1.5 giants: peak multiplier $\approx 1.05^8 \cdot 1.1^7 \cdot 1.5^2 \approx 6.5\times$. The flat stat base is further scaled by an external multiplier $NodeBase = (1+u_1)(1+u_2)(1+C_8)$ from upgrades and a challenge reward.

**Adjacency and gating.** The tree is a hand-authored adjacency list (≈380 explicit edges). A node is purchasable iff:

- it is a class root (2 per region) and `CurrentClass == c`, **or**
- any listed neighbor is at **max level** (small ≥5, T2 ≥1, big ≥3) — partial investment does not open paths;
- T2 nodes additionally require a spend threshold: $P_{invested} \ge 500 + 15\,n_{smallT2} + 30\,n_{bigT2}\cdot\text{lvl} + 50\,n_{giantT2}$ — i.e., the gate starts at 500 and **rises with every T2 node you buy**, forcing broad T1 investment between elite picks;
- the T2 region is also invisible until class level 3,000 is reached on that class (per-class cosmetic cloud unlock).

Class ultimates (e.g., Farmer's: +10% ulti power and +0.5 s duration per level across its 2 nodes) require the matching class, making ~2% of each region class-exclusive while the other 98% is shared.

**Respec and loadouts.** There is no paid respec: `ResetTalentTree()` zeroes everything and refunds all points, and it is called only by the two prestige resets. Loadouts (2 per class, unlocked via soul-shop/minigame-shop purchases) store three things: the aggregated bonus vector (for preview UI), the node levels, and — critically — the **purchase order** (`NodeOrder`, an incrementing timestamp per node). The auto-spender ticks every 0.05 s, walks the saved order index `CurrentNodeOrder`, and re-buys each node to cap as points allow (backing off to a 10 s tick when starved, 60 s when done). Auto-save overwrites slot 1 whenever the current build has more points invested than the stored one.

### 3. Interconnections

Upstream, the tree consumes nothing but levels — its "currency" is progress itself, so it never competes with the potato/worm/skull economies. Downstream, every category lands as one `(1 + B_k)` factor inside the game's enormous multiplier products in `BonusesFunction.cs` (e.g., `PotatoesBonusesBD` multiplies ~30 factors; the talent term is one of them). Notably, talent-boosted **class EXP** feeds back into leveling, which feeds back into talent points — a deliberate self-accelerating loop. Fighting Efficiency shows the game's softcap pattern: after all multipliers, $FE \to FE^{0.6}$ above a threshold and hard-caps at $10^8$, so the talent's linear +10%/level contribution is tamed globally rather than locally. Reincarnation-EXP giants (+25% each, 12 total = +300%) directly accelerate the prestige layer that resets the tree — talents invest in their own respawn speed.

### 4. Pacing & Gating

- **Early:** at level 10 you buy your first 1-pt node; roots force you through your class's doorway, and the >=max-level adjacency rule makes every step a 5-point commitment (you can't dribble 1 point into each of ten nodes to unlock everything).
- **Mid:** the 500-invested T2 wall plus the level-3000 cloud is the big mid-game gate; the escalating threshold (+15/+30/+50 per T2 buy) stretches T2 acquisition across many prestiges.
- **Cross-region play:** hand-placed bridge edges (e.g., node 51↔13, 145↔Giant 3, 31↔Giant 9) let any class tunnel into other classes' regions, so late-game builds span the whole board.
- **Late:** permanent points (1 per 100 highest level per class) gradually dwarf per-run points; at 3,720 total the system auto-maxes and gracefully exits the decision space. One challenge mode (Challenge 8) disables the tree entirely and rewards a permanent doubling of talent base stats — the system's own absence is used as difficulty.

### 5. Borrowable Design Lessons

1. **Pay talent points with progress, not loot.** Deriving points from `floor(level/10)` plus a permanent `floor(highest/100)` per class keeps the tree free of economy tension and makes alt-class play strictly additive — ideal for a 3D RPG with multiple weapon/class tracks.
2. **Escalating spend-gates for elite nodes.** "Invested ≥ 500 + 15 per elite already owned" is a one-line formula that forces breadth-before-depth and auto-stretches elite acquisition without any manual level requirements per node.
3. **Three node sizes, six archetypes.** Cheap 5-level additive fillers, single-purchase multiplicative T2s (×1.05/×1.10/×1.5), and expensive 1-shot giants create a legible visual grammar: node size = cost = impact. The additive-base-times-multiplicative-layers formula keeps every point mattering while making deep paths feel exponential.
4. **Adjacency requires MAX, not touch.** Requiring neighbors at full level turns pathing into real opportunity cost (5 points per step) and prevents 1-point "unlock sprinting" — a much stronger topology than the usual ≥1 rule.
5. **Record purchase order, replay as automation.** Saving the order of buys (not just the final build) turns loadouts into deterministic replay scripts for a free-respec prestige loop — the elegant end state of any "reset your skill tree every prestige" design, and directly portable to any game with frequent rebirths.
6. **Let the system retire itself.** Auto-completing the tree once income exceeds its total cost (3,720) converts a solved chore into a milestone, cleanly handing the spotlight to newer systems instead of leaving stale clicking.

---

## Dimensional Portal floors and subclass talent trees

### 1. What it is

The Dimensional Portal (unlocked at Ascension 20, FAPI's second prestige layer) is an alternate combat mode: instead of fighting through the normal world map, the player picks a **floor** of an infinite tower and grinds it. Portal kills pay *nothing* from the normal economy — no potatoes, no class EXP, no equipment — instead they pay **subclass EXP** (levels one of 6 subclasses, one per base class: Agronomist/Demolisher/Digger/Reaper/Cowboy/Scrounger) and **Seeds** (1,000,000 Seeds auto-convert to 1 Mega Seed, the PortalShop currency). Subclass levels emit passive bonuses in 22 "channels" back into the whole game, and past level 750 they generate talent points for a second, per-class talent tree with loadouts.

### 2. The math

**Floor combat frame.** Entering the portal force-kills the player and loads pseudo-area 1000. One floor = 25 stages × 20 kills = **500 kills**, with fixed spawn parameters (normal-mode spawn upgrades are disabled: modifiers set to 99999):

| Parameter | Portal value |
|---|---|
| Mobs per spawn / spawn interval | 20 / 1.95 s |
| Attack-speed cap | 10/s (vs 5/s in normal world) |
| Enemy attack-speed modifier | steps 3.5 → 7.5 across floors 0→1000 (+0.25–1.0 per 100 floors) |
| Enemy crit/evade resist | `min(20·(10¹⁰·F)^⌈F/100⌉, 10³⁰⁰)` — a hyper-exponential floor wall |
| Auto-floor | on clear: `F++`, `maxFloor = max(maxFloor, F)`; manual entry allows any `F ≤ maxFloor` |

**Subclass EXP per kill** (only while alive; F = current floor):

`EXP = ⌊(7.5F)^(1 + F/(600 − min(F/2, 300))) · EXPBoni⌋`

The exponent rises from ~1 to `1 + F/300` (fixed denominator 300 once F ≥ 600), so income is polynomial-of-growing-degree: F=100 → 750^1.18, F=600 → 4500³ ≈ 9×10¹⁰.

**EXP to next level** (L = subclass level). Base is a triangular-number cost times a piecewise slope, all raised to a growing power:

`Need(L) = ⌈( L(L+1)/2 · (150 + a(L)) )^p(L)⌉`, with `p(L) = 1 + n(L)/(750 − m(L))`

| L range | a(L) (additive slope) | n(L) | m(L) |
|---|---|---|---|
| < 300 | 0 | L | ⌊L/50⌋ |
| 300–499 | L/350 | L | ⌊L/50⌋ |
| 500–749 | L/200 | L | 10 + (L−500)/250 |
| 750–2000 | 3.75 + 0.15(L−750) | L | 11.5 |
| 2001–3500 | 191.25 + 0.03(L−2000) | 2000 + 0.35(L−2000) | 11.5 |
| > 3500 | **10¹⁵⁰** (hard wall) | — | — |

Cost is ~10¹⁵ at L=750, ~10³³ at L=2000, ~10⁴¹ at L=3500, then effectively infinite — a *disguised level cap*.

**Seeds per kill** (catch-up shaped): for F ≤ 500, `(F + 49 + max(50 − F/10, 0)) · SeedBoni · t` where post-Transcendence `t = 1 + (1 − F/500)²` (up to 2× on low floors); for F > 500 only `(549 + (F−500)/10) · SeedBoni` — income flattens hard past 500, so climbing is for EXP/pride, not Seeds.

**Bonus channels — the dual flat/exponent design.** Each subclass owns 6 of 22 channels (a hand-built dictionary; e.g. Agronomist: Potatoes, HealthyPotatoes, PetRank, WormQty, MinerExp, Fries). Slot *i* unlocks at subclass level 150·i (0/150/.../750), and its effective level is lagged: `n = L − max(150·i − shopReduction − 1, 0)`. Every channel produces **two numbers**:

- **FlatBoni** — a multiplier inside the target resource's normal multiplier product. Typical shape: `(r^n − 1)(1 + c·n/100) + k·min(n, 50)`, e.g. Milk/Brewing/WormQty: r=1.1, c=0.075, k=5; PetExp/PetRank: r=1.02, c=0.045, k=0.5. Exponential in level, then raised to `1 + (Asc−20)·0.01`.
- **TotalBoni** — an **exponent applied to the entire aggregated bonus**: final gain = `(Π all other multipliers · FlatBoni)^TotalBoni`. Shape: `base + 0.1·log_b(n·(1 + (Asc−20)·k))` with per-channel base/b/k, e.g. Milk: `1.0065 + 0.1·log₁₅₀₀(n·(1+0.0145(Asc−20)))` — logarithmic, so it creeps from ~1.005 toward a **soft cap at 1.2**: any excess above 1.2 is multiplied by 0.0001, and post-Transcendence the whole excess-over-1 is pre-scaled ×0.575.
- Four **global channels** (PetExpDmg/Residue/ItemRating/CardPower) key off the *sum of all six subclass levels* S, gated at S = 500/1250/2500/4250 (e.g. flat = `(1.00088^(S/2) − 1)(1 + 0.00039·S) + 1.03·min(S/100, 50)`), rewarding leveling every class, not just your main.
- Channel 0 (Potatoes) and 1 (Skull) **switch currency and get renerfed** when Ascension 30/40 replaces those economies (e.g. Potato flat drops from `(1.05^n−1)(...)+1.15·min(n,50)` to `1.00035^n + 0.01·min(n,100)`).

**Talent trees.** At subclass level > 735, one point per 15 levels: `points = ⌊(L−735)/15⌋` (first at 750; cap 3500 ⇒ **184 points/class**). Each node has designer-set `(Bonus B, Increment I)`; with n points assigned:

`bonus(n) = (1 + B·n)^(1 + I·n)` if B < 1, else `(B·n)^(1 + I·n)`

— compounding in both base and exponent, so specializing accelerates. The counterweight is a **rotation lockout**: assigning a point to node X sets a counter `nextAt = 5/10/20` by node tier (1/2/3), and every point spent in *any other* node decrements it by 1; X can't take another point until it hits 0. A tier-3 node therefore demands 20 points elsewhere between its own points. Nodes unlock when all parent nodes hold ≥1 point; resets are free; 3 saved loadouts per class replay an *ordered* assignment list; at Asc ≥ 50 (post-Transcendence) new points auto-replay the saved order.

### 3. Interconnections

Feeds in: `EXPBoni` and `SeedBoni` are themselves products of ~12 other systems (pets, cards, expeditions, buildings, PortalShop, soul shop, artifacts, the talents' own bonuses 40/41/57). Feeds out: FlatBoni multiplies and TotalBoni *exponentiates* 22 core resource pipelines in BonusesFunction (potatoes, skulls, milk, mining, pet EXP, card power...), and Seeds fund the PortalShop, which loops back to buff portal EXP/Seed gain and unlock-lag reduction. Tension: portal time is mutually exclusive with normal farming — you sacrifice all direct income to grow permanent exponents.

### 4. Pacing & gating

Ascension 20 unlock; ascension count then scales every channel (`(Asc−20)` terms), so the feature strengthens with the outer prestige loop. Per-subclass drip-feed: new channel every 150 levels, talents at 750, EXP curve kinks at 300/500/750/2000, wall at 3500; account-wide sum gates at 500/1250/2500/4250. Only the active class's subclass earns EXP, forcing class rotation.

### 5. Borrowable design lessons

- **Split every bonus into flat multiplier + capped global exponent.** A `gain = (product)^(1+ε)` channel stays meaningful at any magnitude, and the 1.2 soft cap keeps it from eating the game.
- **Rotation lockout on talent points** (spend N elsewhere before repeating a node, N by tier) forces broad builds without hard caps — elegant anti-degenerate-stacking.
- **Ordered-list loadouts**: storing the *sequence* of point assignments (not the final state) makes undo, partial application at low level, and auto-replay of respec trivial.
- **A grind mode that pays in exponents, not currency**, creates a real strategic choice between immediate income and permanent scaling.
- **Disguised cap via cost cliff** (a(L)=10¹⁵⁰ past 3500) ends a curve without a "MAX" wall players resent.
- **Catch-up shaped drops** — `1 + (1−F/500)²` on low floors after prestige — respects the reset without flattening the climb.

---

## Prestige Layers: Ascension, Reincarnation & Transcendence

### 1. What the system is

FAPI stacks three nested prestige loops on top of a hack-and-slash idle combat game. **Reincarnation** (minutes-to-hours cadence) resets your character — level, class, talents, worms, in-run perks — and converts run performance into permanent Reincarnation EXP/levels and Reincarnation Points (RP). **Ascension** (days cadence) resets the whole Reincarnation layer — reinc levels, RP shop, area progress — and mints Souls (permanent shop currency) and Ascension Points (perk picks). **Transcendence** (weeks-to-months cadence) resets almost everything including Ascension count, in exchange for a passive "generator" multiplier engine, a higher difficulty tier, and partial-retention schedules that make each cycle faster. `NewGameScript.cs` is the baseline hard reset each layer selectively avoids.

### 2. The math

**Layer 1 — Reincarnation.** Gate: run timer ≥ 900 s; after 3 reincarnations (or 1 ascension) the gate collapses to 2 s. EXP banked on reincarnating, with `L` = character level, `P` = best wave progress, `C` = total Confection levels:

> `ReincEXP = L · 1.001^min(L,1000) · max(1, log₅L − 2) · max(1, 0.5 + L/2000) · (1 + P/5000) · (1 + clamp(½·log₂(C/5·10⁶) + 1, 0, C/5·10⁶)) · TimerMult · OtherMult`

Timer multiplier (t = run seconds; 0 below 900 s): piecewise `t/7200` up to 2 h, `1 + (t−7200)/14400` up to 6 h, else `2 + (t−21600)/43200`, then `× 1.5 · (1 + 0.25·Asc)`. Linear-with-flattening slopes reward ~2–12 h runs without hard caps.

Reinc level-up cost: `Req(ℓ) = [(5 + 5ℓ) · min(1.0025, 1.00005 + ℓ/500000)^min(ℓ,3000) · 1.001^max(ℓ−3000,0) · (1 + clamp((ℓ−1500)/1000, 0, 1))]^k` — near-linear early, gently exponential past ~1500, harder past 3000; two late-game shops multiply it by `0.95^x` / `0.975^y` reducers (floor 0.01). Reinc level pays **tiered scaling bonuses**: Attack & HP-regen = `ℓ·(2 + 0.1·Asc)% · 1.0005^min(3000,ℓ)`; then 16 more bonuses unlock at thresholds 26, 51, 101, 251, 501, 1001, 2001, 3501, 5001, 6501, 8001, 9501, 11001, 12501, 14001, 16001 — each `(ℓ − threshold+1)·rate·g^min(3000, ℓ−threshold)` with rate decaying down the table (1.5%→1%→0.5%→0.1%→0.05%→0.01%→0.0025% per level, always `+5%·Asc` relative) and growth g stepping 1.0005→1.00025→1.0002→1.00015.

**Reincarnation Points** are *derived, not banked*: `RP_base = ⌊((ReincLevel − LastAscLevel)/5 + 5_challenge) · (Asc + 1)⌋` (+ `(ReincLevel − Req)/50` spillover on the first ascension). `Current = max-recorded(RP_base·bonusMult) + last-ascension leftover + expedition RP − invested`. Since RP derives from your highest level, reincarnating never loses shop progress — no punishment for pressing the button.

**RP Shop.** Pages 1–2: one-shot QoL at flat prices (autos 5 RP; price-reduction: cost `1+level`, cap 3, effect `100·(1 − 0.5^level)%`; residue slots `5 + 10·level`, cap 3). Page 3: 19 repeatable multipliers priced `B · r^level`:

| Unlock (Asc >) | Pairs | Base B | Ratio r |
|---|---|---|---|
| 0 | Attack, HP | 1 | 1.05 |
| 1 | Potato, Class EXP | 2 | 1.05 |
| 2 | Skull, Confection | 3 | 1.10 |
| 3 | Poop, Whack | 4 | 1.10 |
| 4 | Item Rating, Milk | 5 | 1.15 |
| 5 | Brew, Larva | 25 | 1.20 |
| 7 | Calcium, Fermenting | 50 | 1.25 |
| 9 | Pet Dmg, Pet EXP | 1000 | 1.40 |
| 11 | Residue, Card Power | 5000 | 1.50 |

Effect per line: `2%·level · (1 + 0.01·U) · (1.01 + 0.0001·U)^level`, where U = "Upgrade All" meta-upgrade (cost `(5+5U)·1.2^U·max(1, 1.5^(U−40))`) — a mildly compounding percent so deep levels stay relevant.

**Layer 2 — Ascension.** Gate: `ReincLevel ≥ Req(A)` (A = ascensions done):

| A | Requirement |
|---|---|
| 0 | 2,500 |
| 1–12 | `⌈(3000 + 750A) · min(1.1, 1.05 + 0.01A)^A⌉` |
| 13–17 | flat: 46,200 / 53,000 / 67,500 / 95,000 / 112,500 |
| 18–35 | `⌈130,000 · 1.125^(A−18)⌉` |
| 36+ | `⌈962,800 · 1.15^(A−35)⌉` (late shops sell % reductions) |

Alternative: after 24 h (86,400 s) you may "restart" the ascension with **no rewards** — an escape hatch from soft-locks. Minimum 15 s anti-misclick timer. Mint on ascending: `Souls += ⌊1000·(1 + 0.01A)⌋` (post-Transcendence: base drops to `1000 − 100·min(T,5)`), Souls being the permanent QoL-shop currency that survives everything. **Ascension Points** = `A + bonuses`, spent on 23 pick-again-each-ascension perks costing 1–4 AP (breeding/milking timers, "poop persists through reinc", auto-buyers, take-away automation…); two perks become permanently free at A = 6 and A = 9. Ascension resets reinc level/EXP, RP totals (leftover current RP carries once), character, worms, perks, and area progress — but grants a **head start**: areas auto-cleared to 10/19/28/37/46 at A > 2/4/6/8/14, and page-1/2 RP-shop QoL is auto-granted at max from A ≥ 3/5/6/8/9. Challenge modes, Hard difficulty (A ≥ 7), and two "evolutions" (A30, A40) hang off count milestones. Beyond A ≥ 20 ascension mutates into a 24 h-cooldown perk-respec loop.

**Portal Shop** (Mega Seeds from the Dimensional Portal subclass tower; `10⁶ seeds → 1 Mega Seed`; seeds tick every 60 s: `(n + 49 + max(50 − n/10, 0)) · SeedBoni · 425 · catchup` for max floor n ≤ 500, catchup `= 1 + (1 − n/500)²` post-Transcendence). 27 bonus categories, each with 3–4 sub-upgrades. Cost is **linear**: `price = priceMulti · (level+1)`, with priceMulti spanning 5 → 300,000 and per-level effects like +5%/+7.5% or flat +1 (extra Ascension Point, extra builder). Gating is by Ascension milestone (A20 → A100-tiers unlock; `UnlockUpgrades()` fires every 5th ascension), so the linear-cost shop is paced by the layer above it, not by its own curve.

**Layer 3 — Transcendence.** Gate: `AscensionCount ≥ 65 + 2T` (T done so far; content-capped at T = 5). Resets ascension count, RP page 3, subclasses, dungeon (`maxFloor = min(50·T′, 500)`), farming, expeditions, cards, mining, towns, whack minigame, pet ranks, both prestige-material shops, and all aggregate multipliers. Keeps Souls, artifacts (capped `50·T`), special pets. Head start: restart at `AscensionCount = T + 3`, Eternal difficulty unlocked, and **retention schedules** — e.g. Portal-shop levels keep `min(10%·(⌊(T′−7)/4⌋+1), 100%)` once T′ ≥ 7; farming shop keeps up to 50% from T′ ≥ 3; expedition shop from T′ ≥ 4; whack shop `10%·(⌊(T′−2)/2⌋+1)` from T′ ≥ 2; towns up to 50% from T′ ≥ 8. Its unique reward is the **Generator**: charge `m(t) = 1 − e^(−kt)`, `k = −ln(0.03)/T_max`, `T_max = 1,814,400 s (21 days) − 43,200·⌊T/3⌋`, feeding seven multipliers such as ExpeditionToken `= 1 + (5 + 0.35T)·m·amp` and Protein `= 1 + (7.5 + 0.55T)·m·amp`, all amplified by `amp = 1 + 0.05·(A − 5)` — the passive engine grows with *current-cycle* ascensions, marrying the layers.

### 3. Interconnections

Upward: character level/wave/Confection → ReincEXP; reinc level → RP → shop multipliers → faster runs; reinc level ≥ threshold → Ascension → Souls + AP + head starts; ascension count → Transcendence. Downward: each layer multiplies the layer below — Asc count boosts reinc timer mult (`+25%/A`), reinc-level bonus rates (`+5% relative/A`), RP yield (`×(A+1)`), and generator amp; Transcendence boosts seed catchup and retention. Tension: RP is shared between one-shot QoL and repeatable stats; AP forces picking ~a third of 23 perks; ascending sacrifices a mature reinc economy for Souls.

### 4. Pacing & gating

First reinc ≈ 15 min; first ascension at reinc level 2,500 (a day or two); A1–12 requirement grows ~×1.1–1.3 per step, then two exponential regimes (1.125×, 1.15×) form the mid/late walls; first Transcendence needs 65 ascensions. RP shop rows unlock one ascension at a time (Asc > 0…11), giving every ascension a visible new toy. Head-start tables (areas, auto-granted QoL, starting AscCount = T+3) shrink repeat time each cycle; the 21-day generator and 24 h perk-reset convert the endgame from grind to schedule.

### 5. Borrowable design lessons

- **Derive prestige currency from peak, not spend a bank** — `RP = f(highest level this cycle)` means resetting never loses shop progress, killing prestige anxiety. Ideal for an RPG where players fear losing builds.
- **Let the layer above pay the layer below a scalar** — `×(A+1)` on RP, `+0.25·A` on timer mult, `+5%·A` on per-level rates: every big prestige visibly accelerates every small one, in one multiplication.
- **Milestone auto-grants replace re-grinding** — auto-maxing early QoL upgrades and auto-clearing zones at count thresholds keeps resets fresh; only the frontier is replayed.
- **Two gates per reset: performance OR time** — reach the level requirement, or wait 24 h for a no-reward restart; nobody soft-locks, and the timer alternative never outcompetes playing well.
- **Percentage-retention schedules for the top layer** — "keep 10% per 4 transcendences, capped 50%" is a tunable knob per subsystem, far finer than binary keep/lose flags.
- **Time-charged exponential generator** — `1 − e^(−kt)` over 21 days gives a top-layer bonus that is huge on commitment, front-loaded enough to feel immediate, and self-capping without a hard wall.

---

## Souls & the Soul Shop

### 1. What it is

Souls are FAPI's hybrid premium currency: earnable in meaningful quantities through normal play (mainly by Ascending, the first prestige layer) and also sold for real money. They are spent in a Soul Shop with four tabs — temporary potions, permanent stat "items," permanent QoL/automation "idlers," and cosmetics. The loop: prestige → collect ~1,000 souls → buy permanent shop levels that both multiply and *exponentiate* your core production stats → prestige faster → repeat. Soul purchases survive all Ascension resets, making the shop the game's account-level meta-progression track.

### 2. The Math

**Balance is a ledger, not a stored number.** Recomputed on every transaction:

$$\text{Total} = \text{Free} + \text{Premium} + \text{Coupon} + \text{Overflow} + \textstyle\sum_i \text{Bags}_i \cdot V_i - \text{Spent}$$

**Soul income (Free souls):**

| Source | Formula / amount |
|---|---|
| Ascension (primary) | $\lfloor(1000 - 100\cdot\min(T,5))\cdot(1 + 0.01A)\rfloor$, $A$ = ascension count, $T$ = Transcendence |
| Quests | $100$ or $500 \times (1+0.01A)$ |
| Season/league reward tiers | 1,000 per tier; season game-mode imports 10% of main-save Free souls |
| Coupon codes / events / challenges | flat 250–10,000 |
| Watch ad (mobile) | 100 |

Note the shape: income grows +1%/ascension (mild catch-up), but each Transcendence (the second prestige) *taxes* it −100/ascension down to a floor of 500 (−50%). IAP bags: \$0.99→2,000, \$4.99→10,500, \$9.99→22,000, \$24.99→57,500, \$49.99→120,000, \$99.99→250,000 souls — value improves monotonically from ~2,020 to 2,500 souls/\$.

**Every distinct cost-curve shape in the shop:**

| Shape | Formula | Used for |
|---|---|---|
| Flat consumable | $c\cdot q$, $c\in\{250,500\}$ | Potions (unlimited qty) |
| Clamped linear | $\text{Cost}(n{\to}n{+}1)=B\cdot\min(4,\,n{+}1)$, $B\in\{10\text{k},15\text{k},20\text{k},25\text{k},50\text{k}\}$ | All repeatable power items |
| Intro discount | level 1 costs 7,000 (vs 10,000) or 12,000 (vs 15,000) on select items | first-taste anchoring |
| Pure linear, hard-capped | $\text{Cost}(n)=100(n{+}1)$, $n<40$ (all 40 slots = 82,000 total) | Inventory slots |
| Flat one-time | 1,000 (input presets) or 10,000 / 7,000-discounted (automation unlocks); loadout slots capped at 2–12 | QoL idlers |

So a repeatable item costs $1B, 2B, 3B, 4B, 4B, 4B, \dots$ — price growth *stops* at 4×. Pacing is instead controlled by a separate **level cap** driven by prestige count:

$$\text{cap}(A)=\begin{cases}1 & A<10\\ 2+\lfloor (A-10)/5\rfloor & 10\le A<50\\ 10+\lfloor (A-50)/10\rfloor & A\ge 50\end{cases}\qquad \text{cap}_{\text{transc. items}}=3\cdot\mathbb{1}[T\ge1]$$

You may buy past the cap; excess levels display red "Limited" and the *effective* level is $n_{\text{eff}}=\min(n,\text{cap})$ — pre-buying is never wasted, it activates as you ascend.

**Effect scaling — the exponent trick (most important formula).** For the four flagship items (Potato Digger, Class-EXP Leech, Perking/Skulls, and their late-game variants), let $M$ be the fully-aggregated production multiplier from *all other systems* (a BigDouble product of ~30 terms). With effective level $n$:

$$M' = \left(M \cdot 1.25^{\,n}\right)^{1+0.01n}$$

The $1.25^n$ term is a normal multiplier; the $(1+0.01n)$ **exponent on the entire aggregate** is where the value lives — when $M=10^{100}$, one level is worth $\times 10^{100\times0.01}=\times10$; at $10^{1000}$ it's $\times10^{10}$. The tooltip honestly prices this as an equivalent multiplier: $\text{bonus}\% = 1.25^{\max(1,n)}\cdot M^{0.01\max(1,n)}\cdot 100 - 100$. At Ascension 30/40 the potato/skull economies are replaced by sweet-potato/skull-powder tiers; the *same purchased levels* transfer, with the linear part downgraded $1.25^n \to 1.1^n$ (the exponent part stays), keeping old purchases relevant in the new economy.

**Potions.** Each purchase is a token; using $q$ tokens adds $3600q$ seconds to that buff's timer (duration stacks, strength doesn't). While the timer runs, the buff sets $b=0.5$ and applies both flatly and as an exponent to its stat aggregate:

$$M' = \big(M\cdot(1+b)\big)^{1+0.02b} = (1.5M)^{1.01}$$

e.g. Attack/HP: $\text{Dmg}' = \text{Dmg}^{1.01}$ on top of ×1.5 — again amplifying with total progress, so a 250-soul potion is useful at hour 10 and hour 1,000. Timers tick offline (optional toggle), and offline catch-up processes at 100 s/tick. Twelve potion types exist at 250 (Atk/HP, Pet EXP, Grasshopper) or 500 souls (everything else).

**Representative flat-effect items** (clamped-linear costs, effect per level $n$): Like-A-Worm +10% worm spawn chance; Golden Clover $\times1.25^n$ expedition resources; Old Clock −25% card recharge (base 43,200 s); Gem Drop Chance (Transcendence-only, $B{=}25$k) +15% artifact drop weight and shrinks the miss-range by factor $(1.26-0.025n)$; Increased MP (Transcendence-only, $B{=}50$k) feeds +0.1n and +0.075n into the event-point saturation curves $500(1-e^{-p/450})$ and $(1-e^{-p_s/150})$.

### 3. Interconnections

Souls are fed by every reward faucet: ascension prestige, quests, challenges, seasons, events, coupons, ads, IAP. They feed *everything*: the four flagship items exponentiate the potato/EXP/skull aggregates that in turn drive combat stats, prestige-point gain, and thus soul income itself — a deliberately closed loop with ~5–10 ascensions per item level as the governor. Resource tension is threefold: (a) power items (10k–50k) vs. automation QoL (7k–10k) vs. cheap consumable potions — early players must choose between permanent and temporary; (b) buying over-cap now vs. banking; (c) Transcendence trades −10%..−50% soul income per ascension for access to the two Transcendence-exclusive items and deeper content. Souls persist through Ascension but reset to 0 in new game modes (hardcore etc.), where the intro discounts are also disabled.

### 4. Pacing & Gating

Shop sections unlock progressively: base items immediately; worm/perk items at Area 5; cow items at Area 18; pet items at Area 20; then Ascension milestones 1, 3, 5, 6, 10, 12, 20 each reveal a new shelf (poop/collector → expedition → phoenix/larva → cards/premium → auto-labor → mining/town → subclass); Transcendence reveals the last two. Early game: first quests fund potions (250–500); first item (~7k, discounted) lands around ascension 4–6. Mid game: the cap curve is the wall — before A10 every item is stuck at level 1; A10–50 grants one level per 5 ascensions; after A50, one per 10. Since price freezes at $4B$, late-game item levels cost a constant 40k–200k souls while income/ascension only creeps up 1%/A — a soft nudge toward the \$-bags whose per-dollar value increases with pack size. The starter pack (75% off: \$19.99→\$4.99) exists only during the first 48 h of *played* time on the main mode and vanishes forever — a textbook conversion window.

### 5. Borrowable Design Lessons

1. **Sell exponents, not multipliers.** A shop level granting $X^{1+0.01n}$ on an aggregate stat auto-scales with every future system, so one SKU stays worth buying for the game's whole lifetime — no power-creep re-pricing needed.
2. **Decouple price from pacing.** Freeze cost growth ($\min(4,n{+}1)$) and gate availability with a prestige-count level cap instead; spending stays predictable while progression speed stays under designer control.
3. **Let over-cap purchases persist but clamp.** "Limited" levels that activate on the next prestige eliminate buyer's remorse and pre-sell future progression.
4. **Bank duration, not stacking strength.** Consumables that add +1 h to a timer (flat +50% & ^1.01 while active) let players stockpile for big sessions without balance-breaking stacking.
5. **Tax premium income at deeper prestige layers.** Reducing souls/ascension by 10% per Transcendence (floor 50%) keeps the currency scarce for veterans without punishing new players or raising prices.
6. **Ledger-based balances.** Recomputing `Total = Σ sources − Spent` from immutable counters makes the premium currency audit-proof against save corruption and simplifies refunds/migrations (e.g., the 10%-carryover into seasonal modes).

---

## Pets: Collection, Leveling & Team Bonuses

### 1. What It Is

FAPI's pet system is a 144-entry collection meta-layer. Pets drop as rare captures from ordinary gameplay (one roll per enemy killed in each world area, or per hour spent on an "expedition"), and once owned they are slotted into two parallel teams: a **farm team** (max 12 slots: 6 "ground" + 6 "air") whose pets passively gain levels over real time and emit dozens of economy-wide multipliers, and **expedition teams** (5 pets each) that are sent away on long timers to generate currencies, rank XP, and more pet captures. Duplicate captures don't stack inventory — they auto-"promote" the pet (a per-pet prestige that buffs its bonuses), so the collection loop never dead-ends.

### 2. The Math

**Capture (drop) model.** Every pet has a hand-tuned rarity number `N` = expected kills (or expedition-hours) to capture. Per kill the game rolls `u ~ U[0, N·B)` and captures if `u < 1` (offline batches of `q` kills use threshold `0.05 + 0.95q`), so:

```
P(capture per kill) = 1 / (N · B)
Pity: guaranteed capture after CaptureCurrent ≥ 2 · N · B attempts   (tracked per pet)
```

`B` is a global *divisor stack* — every capture-related upgrade multiplies into the denominator:

```
B = 1 / [ (1+0.25·kepoSouls)(1+0.10·ascensions)(1+0.05·expeShopLvl)(1+0.05·WAP)
          (1+0.05·cowShop)(1+0.20·farmShopUniques)(1+0.01·seasonLvl·(1+0.01·s2)) · … ]
```

Representative `N` values (structure, not exhaustive):

| Source | Example N (attempts) | Attempt unit |
|---|---|---|
| First world pets (area 20) | 100,000 – 250,000 | kills in that area |
| Late world pets (areas 73–81) | ~10⁷–10⁸ | kills |
| Expedition pets | 15,000 – 300,000 | hours (fractional rolls per completed hour) |
| Portal pets (floors) | 10⁸ – 2.5×10¹⁰, ÷ portal bonus `1 + 0.5·min(⌊excessFloors/50⌋, 3)` | kills |
| Event pets | fixed 2,000,000 (ignores B) | kills |

A save-migration later divided pity by `(1 + 0.1·areaIndex)` — an explicit "later content pities faster" rebalance.

**Duplicate = promotion (star-up).** On capturing an already-owned pet (or spending 1 Pet Token, or paying `⌈N·B⌉` Potato Skins / Space Candy — i.e., *buying a duplicate at exactly the expected-drop price*):

```
promotion += 1,  capped at 10 + portalShopExtension
each bonus: Gain = baseGain · (1 + 0.01·promotion),  Power = basePower · (1 + 0.01·promotion)
```

At max promotion the pet leaves the drop pool entirely (no wasted rolls). Potato Skins drop 1/kill (cap 10⁸); Space Candy accrues 1/expedition-hour (cap 25,000).

**Leveling (farm team, pure time).** Equipped pets gain XP every second with no feeding cost:

```
XP/sec = 1 · GlobalPetLevelExpMult · (1 + 0.02·Rank) · (0.5 if also on expedition)
LevelCost(L) = (20 + 20L) · 1.002^L      (rarity 1; bases 25/30/35 for rarity 2/3/4)
               × 1.008^(L−10000) beyond L = 10,000   (wall softener purchasable: −2%/level)
```

Rarity (1–4) affects *only* XP cost; a late-game shop upgrade lets higher rarities use the cheap curve.

**Ranking (expedition team, pure time).** Rank XP arrives only when an expedition completes:

```
RankXP = ⌊hours · (1 + petTimeBonus) · 4 · GlobalPetRankExpMult⌋
RankCost(r) = (r + 20) · 1.005^r · [1.02^(r−300) beyond r = 300]
```

**Bonus payout curves.** Each pet carries 3–12 bonuses from a shared table. Standard farm bonuses compound **exponentially in level**:

```
bonus = (1 + g)^Level − 1,  then × (1 + 0.02·Rank)
```

| g per level | Bonus examples |
|---|---|
| 0.005 | potatoes, class XP, confection XP, poop, whack score |
| 0.0025 | skulls, milk, worm qty, larva qty/eff |
| 0.001 | item rating, calcium, fermenting, larva eff |
| 0.0005 | reincarnation XP, residue |
| 1.5×10⁻⁵ | card power / card XP |

Eight later-game bonus IDs (healthy potato, protein, grasshopper, mining ×2, town renown, portal XP/seeds) instead use a **log-softcapped** curve that converts exponential level growth into polynomial bonus growth, e.g. healthy potato (ID 23):

```
bonus = (1 + (24 + 1.15^max(0, log₁.₁L − 45))^(1+0.005·promo) · 0.01)
        · (1 + 1.15^max(0, log₁.₁Rank − 45) · 0.01) − 1
```

Since `1.15^(log₁.₁ L) = L^1.466`, past level ≈ 73 (=1.1⁴⁵) these grow ~`L^1.47` — deliberate containment of the strongest bonuses. Variants swap constants (24→9 or 7; 1.15→1.125/1.085/1.075/1.055; coefficient 0.01→0.00025…).

**Expedition-side bonuses** are flat per-pet `Power` values (no level scaling): +5% to a specific reward stream (potatoes, skulls, tokens…), +2.5% card power/XP/reinc points, +5% expedition time credit, **+10% team damage**. They only count while that pet is on the team.

**Team damage & synergy.**

```
PetDungeonDamage = baseDmg · 5 · (1 + 0.05·Rank)
TeamDamage = Σ pets · Synergy · (1 + Σcombo dmg) · (1 + timeBonus) · GlobalPetDmgMult
Synergy = 0.25·(#pets) + 0.25·(both types present) + 0.25·(≥2 of each type)   → max 1.75×
```

**Expedition payouts** (per completion, `h` = hours, cap by chosen length):

```
resource_i = (farm's recorded avg earning of i per hour) · h · (1+timeBonus) · 0.25
             · (1+petBonus_i) · (1+effBonus) · Synergy · ExpeditionResourceMult
tokens = h · Synergy · ResourceMult · (1+petTokenBonus) · TokenMult · (×3 in NG+)
reincPoints = 0.0005 · highestRP · h · Synergy · …
```

Rewards index off *your own farm's hourly average* — expeditions are a fractional mirror of active play, never a replacement.

**Hidden set combos.** ~115 predefined 2–3 pet sets; if all members are equipped simultaneously the combo activates (with a discovery notification the first time). Farm combos give additive utility knobs: +1 potato spawn, +3 fewer-potatoes, +3% spawn speed, +1 min rarity, +1 base residue, +5 drop cap. Expedition combos give +10% each to reward, pet damage, breeding/milk timers, etc., aggregated as `×(1 + 0.1·activeCombos)` in the global multiplier functions.

### 3. Interconnections

Pets are the widest multiplier fan-out in the game: the 12 farm slots feed ~40 distinct global streams (potatoes, class XP, skulls, worms/poop/larva, milk, residue, whack, brewing, calcium, fermenting, cards, healthy potato, mining, town, portal). Expeditions feed **Expedition Tokens** — the currency for the expedition shop that upgrades the pet system itself (extra ground slot 75, air slot 300, +1 concurrent expedition `50·5^n`, auto-restart 500, capture chance +5%/lvl) — plus reincarnation points, cards, mining outposts, and artifact gems. In return, pet XP/rank/damage/capture multipliers are themselves fed by nearly every other prestige layer (soul shop `1.25^lvl`, ascension count `(1+0.25·A)`, equipment, cards, cow shop `1.01^lvl`, milk/calcium log-softcapped boosts). Tension: a pet on both farm team and expedition levels at 50% speed; capture-targeting forces you to farm specific areas; skins/candy caps force periodic spending.

### 4. Pacing & Gating

Pets unlock at world area 20 (~first prestige territory); each subsequent area holds exactly one new pet, each expedition holds two (second gated behind deeper rooms). Early captures take ~10⁵ kills, but ascension count alone divides that by `1+0.1·A`, so every macro-prestige mechanically accelerates collection — the collection is designed to be finished over many prestige cycles, not one. Level walls: exponential 1.002 base is gentle until the explicit L=10,000 wall (`×1.008^excess`); ranks wall at 300 (`×1.02^excess`); ranks are ~4/hour so rank is the long-horizon stat. Event pets (fixed 2M, no bonuses applied) are annual-participation trophies. In NG+ modes pets relock but recapture deterministically at fixed milestones (stage 50 of their area / 10·n expedition rooms) — replays skip the RNG entirely.

### 5. Borrowable Design Lessons

1. **Price duplicates at the drop's expected value.** FAPI sells a promotion for exactly `⌈N·B⌉` of a 1-per-kill currency — a self-balancing pity shop that needs no separate tuning as drop bonuses change.
2. **Hard pity = 2× expected attempts, tracked per collectible.** Bounded worst-case (and a visible "attempts so far" counter) turns brutal RNG into a progress bar.
3. **Make duplicates the star-up path and retire maxed items from the pool.** Collection RNG never rolls dead once a pet is finished — every drop is either new or an upgrade.
4. **Split Level (cheap, active-slot, exponential payoff) from Rank (slow, away-team, linear payoff).** Two clocks on one unit means both dispatch systems stay relevant forever, and the 50%-XP overlap penalty creates a real either/or choice.
5. **Convert exponential growth to polynomial via `k^max(0, log_b(L) − c)`.** FAPI's softcap trick (`L^1.47` past level ~73) lets one formula serve levels 1 to 10⁶ without a hard cap — ideal for endgame stats that must keep ticking but never dominate.
6. **Index idle rewards to the player's own recorded active rates.** Expeditions pay 25% of your farm's measured hourly earnings — offline/away income automatically scales with progression and can never outcompete playing.
7. **Hidden team-composition combos with discovery notifications.** Cheap content (a list of ID-triples + a flat +10%) that converts a stat-optimal loadout problem into an experimentation minigame and rewards community knowledge-sharing.

---

## Cards: Charge-Based Leveling with Temp/Perma Power

### What it is and the core loop

Cards are a passive-collection layer earned from FAPI's pet-expedition (idle dungeon) system. Each of ~30 cards targets one specific global stat (damage, healthy-potato gain, exp, etc.). Running an expedition against a card's zone drips "Power" and "card EXP" into that card every hour; Power directly sets the card's multiplier, but most of it is **temporary** and wiped by the Ascension prestige. The player's counterplay is a slow-regenerating **Charge** resource (one every ~12 h) that converts a slice of temporary Power into **permanent** Power that survives all resets — a drip-fed "bank your progress" decision.

### The math

**Power → bonus.** Every card multiplier has the form (from `CardData.TempBonus`):

- Tier 1 (20 base cards): `TempBonus(P) = 1 + 1.2^(log_b P) · c` — equivalently `1 + c · P^k` with `k = ln 1.2 / ln b`.
- Tier 2 (cards 20–25): same with growth base 1.1 (or 1.09/1.08) and log base 7–9.
- Tier 3 (cards 26–29, internal IDs 38–41): pure logarithm, `TempBonus(P) = 1.05 + c · log_b P`.

| Tier | log base b | growth per ×b power | effective exponent k | coeff c range | example |
|---|---|---|---|---|---|
| Early (IDs 1–20) | 1.3–1.55 | ×1.2 | 0.42–0.70 | 0.001–0.02 | ID 1: `1 + 1.2^(log₁.₃P)·0.018` |
| Mid (IDs 23–35) | 7–9 | ×1.1 / 1.09 / 1.08 | 0.035–0.049 | 0.0045–0.18 | ID 23: `1 + 1.1^(log₇P)·0.18` |
| Late (IDs 38–41) | 10–40 | additive | — (log-linear) | 0.0002–0.0005 | ID 38: `1.05 + log₁₀P·0.0005` |

**Permanent bonus** uses the identical formula with the coefficient halved: `PermaBonus(P_perma) = 1 + (c/2)·(same power/log term)` — except tier-3 cards, where perma is `1 + c'·log_b P` with `c'` ≈ 0.8× the temp coefficient and no flat 1.05.

**Level amplifier and final bonus.** Card levels multiply the *excess* over 1:

`FinalMult = 1 + (TempBonus · PermaBonus − 1) · (1 + L·q)`, with `q = 0.02` normally, `0.0025` for slots 26–27, `0.001` for slots 28–29. So each level = +2% of the card's whole bonus, and temp × perma stack multiplicatively before amplification.

**EXP curve.** `ExpNeeded(L) = 1000 · (1 + E)^L`, where E (`ExpExpo`) is 0.05 for all 20 base cards, then 0.75, 1.15, 1.5, 1.75, 2.25, 2.55 for the mid cards, and 10⁵, 5·10⁵, 10⁸, 10¹⁰ for the four late cards (whose first requirements are seeded at 10²⁰⁰, 10²⁵⁰, 10³²⁰, 10⁴⁵⁰). Base cards grow +5%/level; late cards need 5–10 extra orders of magnitude of EXP per level — effectively hard log-walls. Level-ups run through a bulk-approximation routine (spend `exp/10⁵` to mass-buy levels, then loop the remainder), a cheap way to handle offline dumps of 10³⁰⁰ EXP.

**Acquisition rate.** While a team fights, per second: `CardPowerGain += 0.01·(1+DungeonTimeBonus)·CardPowerMult` and `CardExpGain += 0.03·(...)·CardExpMult`; a card payout only fires if the cycle length ≥ 3590 s. So baseline ≈ **36 Power and 108 EXP per hour**, everything else comes from the two global multiplier chains.

**Charge economy.** `MaxCharge = 2 + soul-shop levels (+ expedition-shop levels)`. Regen timer:

`T = 43200 s · (1 − 0.25·SoulOldClock) · (1 − 0.01·WAP) − 3600·RelicBonus`, ticking up to 1.6× faster with six pet combos (+10% each). Spending one charge on a card does:

- `P_perma += P_temp · r_perma`, `P_temp ×= (1 − r_temp)`
- `r_temp = (0.025 + 0.0025·(shop levels)) · 0.9^(reduction upgrades)`
- `r_perma = (0.025 + 0.0025·(shop levels)) · 1.1^(reduction upgrades)`

At base it's a symmetric 2.5% skim; upgrades make it asymmetric in the player's favor (lose ×0.9ⁿ less temp, bank ×1.1ⁿ more perma). The UI previews before/after and colors the result green/red — transfers *can* be net-negative early because perma's coefficient is halved.

### Interconnections

Inbound: expeditions (source of Power/EXP), pets (gain bonuses, dungeon efficiency, combo-driven charge speed), the CardPower/CardExp global multipliers (fed by soul shop 1.25^lvl, Ascension count `1.05^(A−11)·(1+0.25(A−11))`, Reincarnation levels past 14 000, equipment, cow shop, artifacts — then raised to a further exponent `TotalBoni[n]` from the potato layer). Outbound: `GetCardBonus(slot, id)` is spliced into ~30 aggregate formulas in `BonusesFunction` (damage, healthy potatoes, exp, drop chains), plus achievements (charge-spent and total-card-level tiers) and leaderboards. Tension: expedition teams are shared — an hour farming one card is an hour not farming another resource.

### Pacing and gating

Cards start hidden (`Found = 0`) until first drop. Ascension zeroes all temp Power; below Ascension 15 it also zeroes card levels/EXP, after which levels become permanent — a mid-game QoL milestone. Two early cards are retired from the UI at Ascension 30/40 as their stats become obsolete. The 12 h charge timer and 2-charge cap make banking a scarce, roughly-daily decision; late cards' log formulas plus 10²⁰⁰⁺ EXP seeds ensure they mature over months, not days.

### Borrowable design lessons

1. **Temp/perma split with a metered converter** — earn big numbers fast, but banking them past prestige costs a timed resource; gives resets sting without feeling punitive.
2. **Same formula, halved coefficient for the permanent track** — perma is strictly worse per point, so temp farming stays relevant every cycle.
3. **Per-card sublinear exponents (P^0.7 → P^0.04 → log P) as a rarity ladder** — one template, three feels: snowbally early cards, steady mid, prestige-proof trickle late.
4. **Level as a percentage amplifier of the bonus, not a bonus itself** (`×(1+0.02L)`) — EXP and Power stay orthogonal inputs that multiply, doubling the reasons to engage.
5. **Upgrades that skew an exchange rate** (0.9ⁿ loss vs 1.1ⁿ gain) — turning a symmetric tax into a favorable trade is a satisfying, cheap-to-implement shop line.
6. **Preview-with-color on irreversible spends** — showing the before/after multiplier (red if negative) protects players from wasting a 12-hour resource.

---

## Equipment, Drops, Inventory & Artifacts

### 1. What the system is

FAPI's itemization is a fully procedural gear treadmill layered on an idle combat game. Killing enemies in 81 zones rolls chances to drop equipment for six slots (weapon, hat, shield, gloves, chest, shoes); every item is a bag of stat "lines" whose count *is* its rarity tier (T0 Trash → T26 Galactic). Unwanted gear is scrapped into tier-matched enhancement materials that level ("refine") kept gear; a single scalar — **Item Rating**, the sum of a piece's line powers — is the universal gear-power currency. A second, later-game collection layer, **Artifacts** (gems socketed into an upgradeable Jewel), converts *drop counts* rather than single drops into permanent multipliers.

### 2. The math

**Drop roll & pity.** On each kill: drop if `U(0,100) ≤ c`; otherwise a pity counter accumulates `+c`, forcing a drop at `≥ 250` (i.e. after ~2.5× the expected kill count). The chance `c` itself is soft-capped against a per-area requirement `R` (Luck-driven raw chance `L`):

- `L < R`: `c = 0.25·Limit·(L/R)` (linear ramp to 25 % of the area cap)
- `L ≥ R`: `c = Limit · min(0.25·Limit + 0.05·log₁.₅(L/R), 1)` — past the requirement, every ×1.5 more Luck buys only +0.05 pp, hard-capped at `AreaDropLimit` % per kill.

The same shape (×20 scale) governs **bonus chance** `q`, the per-line probability used in rarity rolls below.

**Item generation.** Zone `a` defines a base power `P(a)`, a stat pool (grows ~1 stat per 3 zones, from 1 stat at zone 1 to 28 by zone 81), and a refine-cost bracket `RefineMulti = ⌈a/9⌉` ∈ 1..9:

| Zone | 1 | 9 | 18 | 27 | 36 | 45 | 54 | 55 | 63 | 72 | 81 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| P | 25 | 250 | 1.5k | 5k | 20k | 45k | 130k | 500k | 1e7 | 1.2e9 | 1e10 |

Note the deliberate ×3.8 cliff at zone 55 and super-exponential late curve. Effective power = `P · IRB · 2^d`, where `IRB` is the global Item Rating multiplier (a product of ~25 other systems) and `d` = difficulty−1 (in endless mode, d = 0/1/2/3 at endless stage <125 / ≥125 / ≥225 / ≥325 — grinding one zone deeper re-buys the difficulty doubling).

Each line rolls `p ~ U(P·m, P)` with `m = MinRating = 0.5 + 0.01·(upgrade levels) + 0.02·(5 farm-shop buys)` — the roll *floor* is itself an upgrade track from 50 % toward 100 % (RNG-variance reduction as purchasable QoL). After completing Challenge 10, all lines share one roll (variance removed entirely).

**Rarity = line count.** The item's slot grants an implicit primary stat (weapon→STR, shield→CON, hat→DEX, shoes→AGI, gloves→LCK, chest→STR+CON, two lines). Secondary lines are drawn without replacement from the zone pool: the first `MinRarity` lines are guaranteed (MinRarity is a sum of ~25 upgrade/challenge/pet sources — the rarity *floor* rises all game), then each further line succeeds with probability `q/100`, stopping on first failure — a geometric tail above the floor. `Rarity = #secondary lines`, capped by pool size. Every 9th (boss) zone appends one guaranteed bonus line (+1 rarity) with power `k·m·IRB·2^d` for zone constants k = 250 … 1e10.

**Stat conversion (the real balancing lever).** Raw power `p` never applies directly; each stat has its own diminishing-returns shape `B(p)`:

| Stat | B(p) | Effective shape |
|---|---|---|
| STR/CON/DEX/AGI/LCK | p<100: 0.005p; else 0.5·log₅p − 0.93 | logarithmic |
| Potato / Class EXP | 0.001·p | linear |
| Skulls / Confection EXP | 0.0005·p | linear |
| Reincarnation EXP | 0.02·1.1^(log₁.₅p) | = 0.02·p^0.235 |
| Milk | 0.003·1.2^(log₁.₅p) | ≈ p^0.45 |
| Card Power | 0.0035·1.04^(log₂.₅₁p) | ≈ p^0.043 |
| Renown (endgame) | 0.01 + 1.00075^(max(1, log₁₀p − 200)) − 1 | flat until p≈10²⁰⁰, then exp |

The `x^(log_b p)` idiom is a tunable power law `p^(ln x / ln b)` — two knobs per stat to fit any growth rate. Endgame stats ship a flat base plus an exponent that only wakes up hundreds of orders of magnitude in, future-proofing drops.

**Enhancement (refining).** Effect: every line power ×`(1 + 0.05·(ℓ + ℓ_free))` — +5 %/level, unbounded. Cost of level ℓ: `ℓ·2^⌊ℓ/10⌋ · RefineMulti · (1−0.04u₁)(1−0.04u₂)` in materials of the item's tier — linear-times-doubling every 10 levels. Free levels: `10·(ascension buys) + 4·(4 farm buys)`. Scrapping yields `(1+lvl)(1+cowShop)` materials of the item's tier; materials up-convert at ratio `20 − (upgrades + 5·soulAuto + 0.5·[ascended] + 0.05·(5 farm))` :1, with optional auto-cascade.

**Ascension governor.** From Ascension 11, each line is multiplied by `min(1, BestIR_thisAscension / TotalIR_item)` — a lucky or carried-over item is throttled to the best rating you have *re-earned* this prestige, silently un-throttling as you progress. Multiplayer reward items invert generation: all lines equal `BestIR·(1+bonus)/nLines` — a deterministic "fair" item.

**Inventory.** `MaxSlots = 10 + 5·Challenge1 + 4 shop sources` (30/page, 3 pages). Below-floor drops auto-scrap at full value; when full, drops auto-recycle at fraction `0.25 + 0.25·SoulReclaimer + 0.05·WAPScrapper`, and optional filter slots keep the running top-N by (rarity, rating), scrapping the displaced worst. Sorting, band-highlighting, auto-conversion are all purchasable QoL unlocks.

**Artifacts (gems + Jewel).** ~31 gems, each with rarity 0–4, a source list (world zones, farm plants, portal floors, expeditions) and per-kill chance `PPM/10⁷ · (1+0.15·dropUpgrades) · milestoneMults`. Mass/offline kills use expected value: `E = kills·Σchanceᵢ`, split proportionally; fractional remainders bank as *Fragments* (guaranteed at 1.0, else rolled) — no drop is ever truly lost. Owning `n` copies of a gem gives, with early-boost `ν(n) = 1 + 4e^(−n/80)` (first copies worth 5×, decaying by n≈400):

- Currency gems: `bonus = n·Gain·(1 + n/(n+2500)·ν(n))` — quasi-linear.
- Multiplier gems: `bonus = (Gain^(r·min(n,75) + max(0,n−75) − 1) − 1)·ν(n)`, rarity exponent `r ∈ {3.5, 3, 2.5, 2, 1.5}` — first 75 copies count 1.5–3.5×, later copies 1×; two stats get extra knees at n=1500 (0.25×) and 2000 (0.1×).

Count milestones per rarity (e.g. common 250/500/1k/2k/4k; rarest 50/100/250/500/1k) multiply or exponentiate Gain, the final bonus, or the gem's own drop chance. The **Jewel** holds tier+2 sockets; tiers 1–6 cost Transcendence counts {1,2,3,5,7} plus escalating multi-currency bundles (residue 2.5e50 → 2.5e500!) and give +10 %/tier to all socketed gems. Collection itself pays: total gems `N` grants Reinc-EXP mult piecewise-linear with five flattening knees (1+0.09N up to N=100; …; 650+0.00025(N−111100) past 111k) and Item Rating mult = `(ReincEXP)^(1+N/100000)`.

### 3. Interconnections

Item Rating is the hub: `IRB` (multiplying every drop's power) is a product of ~25 systems — pets, cards, worms, expeditions, soul shop, reincarnation level, artifacts — so *every* subsystem indirectly buys better gear. Gear pays back outward: base combat stats plus economy lines feeding potato/EXP/skull/pet/card/mining/etc. rates. Materials create tension: scrap-vs-keep, and the 20:1 conversion pyramid makes low-tier farming perpetually relevant. At Ascension 30/40 the potato and skull stat lines are deprecated and replaced in the pool (and max rarity drops by 1 each) — gear literally re-specs as prestige layers obsolete old currencies.

### 4. Pacing & gating

Rarity access is zone-gated by table (max T1 in zones 1–3 rising to T28 at 81); the rarity *floor* (guaranteed lines) is upgrade-gated, so old zones auto-trash into materials rather than loot. Power walls: the log soft-cap on drop/bonus chance past area requirement; the zone-55 ×3.8 power cliff; the Ascension-11 rating governor forcing re-earning after each prestige. Artifacts unlock only at Transcendence ≥ 1 (third prestige layer), with individual gems gated by higher Transcendence, and Jewel tiers pacing socket count across ~7 transcensions.

### 5. Borrowable design lessons

1. **Rarity = number of rolled affixes, with an upgradeable guaranteed floor.** One integer drives name, color, drop math and filtering, and "min rarity" upgrades convert dead drops into currency instead of clicks — ideal for a 3D game where pickup spam is expensive.
2. **Per-stat response curves via `p^(ln x/ln b)`.** Feed every stat one shared raw power, then shape each with a two-knob power law — you can rebalance any bonus without touching drop tables.
3. **Expected-value drops with fragment banking.** For offline/AoE kills, distribute `kills × Σchance` proportionally and bank fractions; rare drops become deterministic over time with zero perceived unfairness.
4. **Accumulating pity (`Σ missed chance ≥ 250`)** scales automatically with the player's actual drop chance — no separate pity tuning per zone.
5. **A prestige governor (`min(1, BestThisRun/ItemRating)`)** lets players keep gear across resets while forcing re-progression — sidesteps both hard item wipes and trivializing carryover.
6. **Collection-as-stat (Artifacts):** duplicates feed count-based curves with early-boost decay (`1+4e^(−n/80)`), knee'd exponents, and count milestones — every drop is progress forever, and the *set total* paying a meta-bonus rewards breadth as well as depth.

---

## Farming, Cow Factory, Worms & the Production Economy

### 1. What it is

FAPI's "second screen" is a web of five idle production chains that run parallel to combat: **Farming** (plant crops on timed plots → Healthy Potatoes → prestige into French Fries → Protein), the **Cow Factory** (spend Worms on cows → Milk → Residue → allocate Milk into stat-boost pools), **Worm Breeding** (combat drops Worms → Worms passively excrete Poop → Poop levels "confections" that buff everything), the **Assembler** (spend Protein on 31 assembly lines whose bonuses multiply nearly every other system), and the **Town** (spend mined minerals on real-time-gated buildings that grant *exponent* bonuses). Nothing here is cosmetic: every chain terminates in multipliers on combat, pets, cards, or the other chains.

### 2. Farming math

**Plants & plots.** 9 plant tiers, 12 plots. Plant *i* has base grow time *T᛫* = {30s, 120, 300, 900, 3600, 21600, 86400, 432000, 3.24M s} and unlock cost (Healthy Potatoes) {0, 5e3, 1e6, 1e22, 1e38, 1e74, 1e175, 1e380, 1e600}. Plot unlock costs: {0, 1e5, 1e8, 1e15, 1e28, 1e45, 1e70, 1e125, 1e225, 1e575, 1e1200, 1e2500}. Effective grow time = max(10, ⌊T / GrowSpeed / 1.02^Improve⌋). The chain **cascades**: each plant tier passively produces the tier below it; tier 1 produces the base currency:

- ΔHealthyPotato = (P₁output · Δt · HealthyPotatoBonus)^(1 + 0.01·k), k = count of 4 late one-time shop buys.
- Idle output: `TotalCreatedOutput = TotalCreated × ManualBonus × Π(1.25^lvl…) × 1.02^Improve` — production is proportional to lifetime amount created (compounding quadratic-ish growth).
- **Manual-harvest coupling**: `ManualBonus = max(1, (1 + 0.05·(1+0.02·FormulaLvl))^log₁.₂₅(ManuallyCreated))` — clicking harvests multiplies idle output forever.
- Per-harvest yield = ⌊(1+Rank)·1.05^Rank⌋ · 1.02^Improve; plant EXP needed at rank r = 10 + 5r·1.05^r (harvests grant EXP → ranks; all reset on prestige).
- **Improvement** (max 250, +2%/lvl to yield, speed, EXP, output) costs 10·2^lvl of that plant's *ManuallyCreated stock* — spending it also shrinks ManualBonus. Real tension.

**Fries prestige.** Unlocks at HealthyPotatoTotal ≥ 1e16; requires ≥ 30 min in run. With H = log₁₀(HP_total):

> Fries = ⌊((H − 15.75) · (36 − min(H, 31)) · 1.15^(H−16) · FriesBonus · TimerBonus)^(1+0.01·u)⌋

The (36 − min(H,31)) term makes gains *fade* between 1e31–1e36, an intentional decelerator. **Time-served bonus**: 0 below 30 min; t/86400 up to 1× at 24h; then 1 + (t−86400)/(172800 + 0.5·(t−86400)) — asymptote 3×. Short runs are exponentially punished (if TimerBonus < 1 it becomes an *exponent* past the wall). **Softwall at 1e600 fries**: excess is raised to the 0.35 power.

**Downstream trickle currencies** (both derived from *total* fries, no extra reset):
- Grasshoppers: cumulative count where nth costs 2250 + (n+1)(n+2)/2·250·1.025ⁿ total fries (triangular × mild exponential).
- Protein/sec (FF ≥ 1e10): ((log₅FF − 13.48) · 1.1^(log₁₀FF − 8) · ProteinBonus)^(1+0.03·u) — logarithmic in fries, so protein income is smooth while fries explode.

**Farming shop** — two currencies, two signature cost shapes:

| Upgrade (currency) | Effect/lvl | Cost(L) | Cap |
|---|---|---|---|
| Total Production (HP) | ×1.25 | 1e8·(100·max(1,1.05^(L−50)))^L | — |
| Grow Speed (HP) | +5% speed | 1e10·500^L | — |
| Rank EXP (HP) | +10% | 1e15·250^L | — |
| Manual Formula (Fries) | +2% | 2+2L·(1.025+L/800)^L | 3500 |
| HP Earning (Fries) | ×1.1 | 1+L·(1.015+0.00075L)^L | 4000 |
| Fries Earning (Fries) | ×1.05 | (5+L)·(1.075+3L/800)^L | 2500 |
| Fries→HP synergy (Fries) | +1% | (10+2L)·(1.025+L/800)^L | 3500 |
| Grasshopper Dmg (Fries) | ×1.1 | (150+25L)·(1.5+0.02L)^L | 2000 |
| Contagion HP (Fries) | ÷1.25 | (500+100L)·(2+0.04L)^L | 300 |
| Protein (Fries) | ×1.1 | (1e9+2e8L)·(1.75+0.03L)^L | 1500 |
| Assembler cost (Fries) | ÷1.25 | (2.5e9+5e8L)·(2.25+0.05L)^L | 250 |

Note the FAPI signature: cost ratio itself grows with level — `(a + bL)^L` — a "soft cap without a cap." Auto-plot / keep-plot are fixed ladders (15…1e265 / 2…1e225). The **unique shop** is ~100 one-time buys at hand-placed prices (100 → 5e17+ fries) granting ×2/×3/×5/×6 multipliers early, then *exponent* upgrades (^1.01 each, stacking additively in the exponent) late. Crucially, `HealthyPotatoBonus` contains `(1 + FF_total · (0.1 + 0.01·SynergyLvl))` — the prestige currency directly multiplies base production at +10%/fry, so each prestige visibly accelerates the next.

### 3. Cow Factory (Worms → Milk → Residue → Calcium)

Cow #c costs (Worms): `(100+100c)·2^c` for c < 5, else `(1000+1000c)·1.15^c`. Every MilkTimer seconds (30s base, shrinking to 3s via a piecewise log of Reincarnation level, e.g. `max(3, 30 − (log₂(RL+1)·4.5 − 40.3))`), Milk += cows × MilkBonus. Every 20 milk ticks (→10 at Ascension >14) drops Residue = ⌊ResidueBonus⌋ — the **shop currency**, with cost curves `base·(r + 0.0002L)^L` (base 10–600, r 1.05–1.09) buying small per-level bonuses (+1% milk, +1% cards, +0.25 residue, etc.).

Milk itself is **allocated, not spent** — freely movable among 14 stat pools (Attack, HP, Potato, ClassExp, Perk, Confection, Whack, Poop, WormQty, LarvaQty, HealthyPotato, PetRankExp, GrasshopperDmg, PetDmg). Pool value M converts to a bonus logarithmically with a *drifting base* (built-in softcap), e.g. Attack:

> boost = (1.5^(log_b(M+1)) · 0.1 − 0.1) · (1 + 0.01·BrewLvl) · (log₂.₅(Ca+1)/3 + 1) · (1 + 0.005·FermLvl), b = max(3, 2.2228·1.001^(log₁₀(M+1)))

Weaker stats use gentler curves (Potato: 1.475^(log₃.₂₅M)/2; Whack/Poop: 1.4^(log₄M)/10; Worm/LarvaQty: 1.2^(log₄.₅M)/12). Each pool nests **three prestige-free sub-layers**: pool ≥ 25e3 unlocks *Brewing* (EXP/s = 1.25^(log₂(M−25e3+1))·BrewBonus; level cost e.g. (100+100L)·1.0015^L); BrewLvl ≥ 250 generates *Calcium*/s = (BrewLvl−249)·CalciumBonus, multiplying the pool bonus; paired Calcium ≥ 1e11 unlocks *Fermenting* (EXP/s = 2^(log₁₀Ca)/2048·FermBonus, cost (1000+1000L)·1.01…1.6^L). Late-tier brew costs jump to 1e25·1.35^L and 1e70·1.4^L — data-driven pacing per stat pair.

### 4. Worm Breeding

Worms drop from kills after zone-5 progress ≥ 50: base chance 0.01% per kill (roll ≤ WormChance out of 10000) with a **pity counter** at 2.5× expected kills; drop qty = WormQtyBonus. Worms are never consumed by breeding: every BreedingTime (60s → 3s via reincarnation log curve) **Poop += Worms × PoopBonus**; each tick also rolls Larva (0.1% base, pity at 250/chance ticks, qty = LarvaQtyBonus).

Poop is *allocated* (like milk) across 16 "confections"; EXP/s = allocated poop × ConfectionExpBonus (levels capped at 50/s). Each level grants a small uncapped additive bonus (Attack +0.1%/lvl, Potatoes/ClassExp +0.25%/lvl, Milk +0.1%/lvl, Residue +0.05%/lvl…). Costs are nearly linear with a whisper of exponential: Attack `1000+50L`; CritChance `(5000+250L)·1.001^L`; Reincarnation `(5e6+2.5e5L)·1.025^L`; late tiers start at 1e40–1e51. **Larva divide costs**: cost /= (1 + Larva·0.1·LarvaEff) — a second allocatable sub-resource per confection. Worms also buy Cows, bridging the two factories.

### 5. Assembler & Town

**Assembler** (Protein sink): 31 lines; line n unlocks when *total levels across all lines* ≥ {0, 10, 30, 75, 125, 175, 250, …, 4450} — spending anywhere unlocks everywhere. Cost(L) = Base·(1+L)·(1 + e + 0.02·e·L)^L ÷ FriesCostReduction, with (Base, e) from (100, 0.1) to (1e650, 30), LevelMax 100–300. Each line carries 3–6 bonuses unlocking at line-level 0/25/50/75/100/150; bonus = (1+g)^(L−start+1), g = 0.002–1.25 — one purchase currency, dozens of cross-system multipliers.

**Town** (Ascension ≥ 12): 17 buildings costing 2–3 mineral types; cost = (B + 0.2·B·L)·0.4^slot·(1 + c·0.95^slot)^L with **two-stage cap**: extra ×(1.02+0.002·(L−SC))^(L−SC) past softcap (10–100) and ×(1.5+0.1·(L−HC))^(L−HC) past hardcap (25–250). Leveling also takes **real time**: BaseTime(1h–12h)·(1+0.25L)·(1+d)^L, d = 0.01–0.1, reducible via TownBuildFaster. Bonuses are mostly (1 + β·(1+Renown))^L, and several are applied as **exponents** on other systems (HealthyPotato^(1+b₇), Milk^(1+b₄), Poop^(1+b₃)). The Trade Center recharges a deal every 3h; deals swap resources at ±25% randomized rates and grant ~10 Renown; rank cost = 50·1.2^r (extra ^1.2 past 35), 5.9e5·1.0372^(r−50) past 50, ×1.15^(r−100) past 100; each rank boosts all building effects (+10%/rank ≤ 50, then heavily diminished).

### 6. Interconnections & tension

Combat kills → Worms → (Cows ∥ breeding Poop/Larva) → Milk/Residue/Calcium → boosts to Attack/HP/Potato/EXP and back into Farming (HealthyPotato, GrasshopperDmg pools). Farming → Fries → Grasshoppers (lab buffs farming) + Protein → Assembler → multipliers on *everything*, including milk, poop, and town. Town exponentiates farming and cow output; farming's unique shop buys town build speed. Tensions: milk/poop are zero-sum allocations across 14–16 pools; plant Improvement eats the manual-harvest stock that fuels ManualBonus; fries buy either farm power or cross-game utility; short vs 24h+ prestige timing.

### 7. Pacing & gating

Gates are almost all **total-resource thresholds**, not purchases: Fries prestige at 1e16 HP; unique shop at 1e3 FF; Grasshoppers at 2.5e3 FF; Protein/Assembler at 1e10 FF; brewing at 25e3 milk; fermenting at 1e11 calcium; worms at mid-game combat zone; Town at Ascension 12. Early curves are gentle (1.0015–1.05 ratios, log-shaped conversions); walls come from `(a+bL)^L` costs, the (36−min(logH,31)) fade, and the 1e600^0.35 softwall. Timers compress with meta-progress (30s→3s milk, 60s→3s breeding) so old systems stay relevant without rebalancing.

### 8. Borrowable design lessons

1. **Allocate, don't spend**: milk/poop pools you can freely re-slot turn one income stream into a constant optimization puzzle with zero regret cost.
2. **Log-conversion with drifting base** (`1.5^(log_b M)`, b rising with M) gives smooth diminishing returns that never need hard caps.
3. **Escalating-ratio costs** `(a + bL)^L` create organic walls — the growth *rate* grows, so no fixed cap ever feels arbitrary.
4. **Manual action compounds idle**: a permanent multiplier from lifetime manual harvests (exponent = log₁.₂₅ of clicks) rewards touching the game without requiring it.
5. **Nested mini-prestige inside a subsystem** (milk → brew levels → calcium → ferment) delivers three unlock beats per stat with no reset.
6. **Prestige currency feeds base production directly** (+10% potatoes per total fry) — makes each reset's payoff legible in the very first minute of the next run.
7. **Real-time build gates with softcap/hardcap cost stages** (Town) pace a late-game sink across weeks while renown (a trade minigame) rebates the grind.

---

## Mining Outposts & Miners

### 1. What it is

Unlocked at Ascension 12 (the game's ~12th prestige reset), this is a passive strip-mining economy. Expeditions (offline timed missions) randomly discover **outposts** — procedurally rolled ore deposits with a level, grade, density, and hardness. You assign one of five **miners** to each outpost; every second it converts a fraction of the deposit into one of five mineral currencies (Stone, Brass, Iron, Gold, Platinum), slowing down as the deposit depletes, until the outpost empties and self-deletes. Minerals buy miner upgrades, town buildings, and late-game artifacts.

### 2. The math

**Outpost drops (double pity).** When an expedition of `H = floor(hours)` completes, an outpost drops if
`roll < H × C × (1 + 0.01·Pity) × (1.5 if ASC perk)`, where base `C = 1% + shop bonuses (+1%/lvl, +5% farming uniques)`. On a miss, `Pity += H` (each failed hour permanently adds +1% relative chance); on a hit, `Pity = 0`. A second counter guarantees quality: every drop decrements `NextDecentOutpostPity` (starts at `15 − shop reductions`); when it reaches 1, the next outpost is a fixed "decent" roll (Level 6+bonuses, Grade 2, Density 70, Hardness 30) and the counter resets. You can hold at most `OutpostLimit` outposts (base 5, +~9 across four shops).

**Outpost stat rolls.**
- `Level = U{1..10} + LevelBonuses` (bonuses from a global upgrade, expedition perks, shops)
- `Grade`: geometric coin-flips, `P(g) = 0.5^(g+1)` for g = 0..3, `P(4) = 0.0625`; an ascension perk adds +1 (cap 4). Grade determines mineral variety: **Grade+1 mineral types** (1–5).
- `Density, Hardness = U{1..99}` — density scales quantity, hardness scales speed. Independent axes.

**Mineral-type selection with explicit pity.** Weighted sampling without replacement, Grade+1 draws, weights:

| Mineral (ID) | Base weight | Level scaling |
|---|---|---|
| Stone (1) | 100 | ×(1.004 − 0.0002·shop)^Level |
| Brass (2) | 50 | ×(0.995 + 0.0002·shop)^Level × TypeBonus |
| Iron (3) | 25 | same |
| Gold (4) | 12.5 | same |
| Platinum (5) | 6.25 | same, all capped at Stone's weight |

Each weight also gets `+ MineralPity[i]`. After every generation: minerals **present** reset their pity to 0; minerals **absent** accumulate `Pity_i += weight_i × 0.25` (Stone only ×0.1). So a rare mineral's effective weight grows ~25% of its base per consecutive miss — an elegant self-scaling pity that preserves relative rarity.

**Quantity per mineral.**
`Q(ID) = 4000 × 0.2^(ID−1) × 0.907·1.025^Density × 1.055^Level × 1.01^max(0,Level−50) × B_qty × 0.9^(ID−1)`
Each rarity tier holds 5× less ore, and global quantity bonuses are damped ×0.9 per tier. Density spans ~×0.93 to ×10.4.

**Mining tick (fraction of each mineral's total mined per second, hard-capped at 10%/s):**
`tick = min(0.1, D × 2·10⁻⁷ / (0.907·1.025^H_eff) × P^0.4256 × 0.95^Level × 0.975^max(0,Level−50))`
- `P^0.4256` is `1.65^log₃.₂₅(P)` — miner power feeds speed through a **power-law softcap** (10× power → ~2.66× speed).
- `H_eff = Hardness × (1−0.01·shopA)(1−0.01·shopB)(1−0.01·shopC)` — three stacking hardness reducers.
- **Depletion decay** `D = 0.56 × 1.031^d`, `d = min(100, %LeftToMine + "improved mining" shop levels)`: a full outpost mines at ×11.9, a near-empty one at ×0.56 — a 21× slowdown ramp. Shop bonuses shift the curve right, keeping late-depletion speed high.
- Note the level tension: quantity grows `1.055^L` while tick shrinks `0.95^L`, so income/sec is nearly flat (`1.00225^L`) but outpost lifetime grows ~5.3%/level — higher-level outposts are bigger, slower reservoirs.

**Per-second gain:** `ΔM_i = Q_total,i × tick × S × (1 + SoulPotion) × (1 + 0.005·MinerLevel)`, where the specialization `S = 1.25 + 0.01·U₃` applies conditionally per miner: M1 on Stone/Brass, M2 while ≥50% remains, M3 while <50%, M4 if Hardness ≥ 50, M5 if Hardness < 50. Miners 2–5 unlock at town-building levels 25/75/170/320 — and town buildings cost minerals, closing the loop.

**Miner growth.** `Power = (100 + 2·U₀·(1+0.002·U₄)) × (1 + 0.01·(1+0.002·U₄))^U₁ × B_power × (1 + 0.01·Level)`. EXP accrues 1/sec mined, ×`(1+0.02·(1+0.002·U₄))^U₂ × B_exp`; level cost `100 × (1.05 + 0.001·ℓ)^ℓ` — an exponential whose **base itself grows**, a slow-motion wall. U₄ is a meta-upgrade boosting the other four by +0.2%/level.

**Costs.** Per-miner upgrades cost mineral `i` at `base × rate^level` — (100, ×1.15) Stone, (50, ×1.2) Brass, (25, ×1.35) Iron, (10, ×1.5) Gold, (5, ×1.75) Platinum — rarer currency = cheaper base but steeper growth; all reduced by `0.9^max(0,Asc−17) × 0.98^G₃`. Five **global** upgrades are paid in five *other* subsystems' currencies (potatoes, perk points, wreck points, worm poop, milk) at hyper-exponential cost `c₀ × (k·1.25^n)^n`, later swapping to prestige currencies with gentler piecewise curves (e.g. `1.025^n`, then `1.00097^n`, then `1.05^n`).

### 3. Interconnections

Inputs: expedition hours (drop rolls), ~8 external shops (drop chance, hardness reduction, pity floor, mineral-type chance), ascension count (implicit +2%·(Asc−15) power, +5%·(Asc−18) quantity, ×0.9^(Asc−17) prices), pets/cards/equipment/artifacts via `MiningPowerBonuses`. Outputs: 5 mineral currencies → miner upgrades (internal sink), town buildings (which unlock miners 2–5 and grant global boni), and artifact rerolls. Tension: spending minerals on miners accelerates mining; spending on town unlocks breadth.

### 4. Pacing and gating

Gated at Ascension 12; a scripted tutorial outpost (fixed Level 5/Grade 1) teaches the loop. Early: 1 miner, 1–2 outposts, hour-scale depletion. Mid: pity guarantees ~1 decent outpost per 15, town levels stagger miner unlocks at 25/75/170/320. Late: Level > 50 outposts hit a second decay knee (`×1.01` qty vs `×0.975` speed → net `0.985^L`), an ascension perk converts upgrades to free-of-charge auto-buys every 120s, and a 300s cron checks for a jackpot "God Outpost" (Grade > 4, Density > 90, Hardness < 10 — effectively unreachable, reserved design space).

### 5. Borrowable design lessons

1. **Weight-proportional pity** (`pity += weight × 0.25` on miss, reset on hit) keeps rare drops rare while bounding drought length — better than flat pity because it preserves the rarity hierarchy. Ideal for 3D loot chests or resource-node spawning.
2. **Two-axis node rolls (Density = size, Hardness = speed)** make procedurally spawned resource nodes comparable but never identical — players learn to triage, and conditional specialists (your M4 "hard-rock" miner) create assignment gameplay.
3. **Power-law speed conversion** `speed ∝ Power^0.43` lets raw stats inflate exponentially (fed by the whole multiplier chain) while output stays controlled — a clean firewall between prestige inflation and a paced subsystem.
4. **Depletion decay** (`0.56 × 1.031^{%left}`) front-loads each node's yield: assigning a worker feels instantly rewarding, finishing feels like diminishing returns — nudging players to rotate rather than camp.
5. **Cross-currency upgrade taxes**: pricing this system's global upgrades in five *other* systems' currencies forces engagement breadth and gives dead currencies a late-game sink.
6. **Guaranteed-quality counter** ("every 15th drop is decent, shops shrink the 15") sells pity reduction as a purchasable upgrade — monetizing/rewarding RNG mitigation rather than RNG itself.

---

## The Grasshopper Contagion System

### 1. What it is

Grasshoppers are a worker resource earned automatically as the farming layer's Fries currency grows. The player splits a shared grasshopper pool across 12 "contagions" — permanent boss-bars, each tied to one production stat. Assigned grasshoppers deal continuous DPS to a contagion's HP; every time the bar is emptied the contagion gains a level, its HP re-scales upward, and its level feeds a compounding multiplicative bonus to a specific resource (fries income, plant production, EXP, protein, worms, milk...). It is an idle "allocate-and-forget" layer: no clicking, just portfolio rebalancing.

### 2. The math

**Earning grasshoppers** (auto-granted when lifetime Fries passes thresholds; cumulative cost of the L-th grasshopper):

`Cost(L) = round(2250 + 250 · (L+1)(L+2)/2 · 1.025^L)` Fries — quadratic (triangular number) × mild exponential, so the pool grows roughly with log of Fries.

**Damage per second of a contagion with G assigned grasshoppers:**

`DPS = (G · D)^(1 + 0.05·u_dmg)`, where `D` = global GrasshopperDamageBonus and `u_dmg ∈ [0..4]` counts owned unique farming-shop upgrades. Max exponent **1.20** — note the exponent wraps the whole product, so both raw bodies and the multiplier stack get superlinear returns. (Quirk: offline ticks compute `(G·D·Δt)^exp`, putting time inside the power.)

`D` itself is a ~20-term multiplier chain (assembler, pet, card, expedition, soul shop `1.25^lvl`, ascension `1.05^(A−5)·(1+0.25(A−5))`, milk/calcium log-softcapped boosts, etc.), finally raised to a potion exponent: `D ← D^TotalBoni`.

**Contagion HP at level L:**

`HP(L) = [ BaseHP·(1+L) · (1 + max(0, log₁₀L)·E)^L / max(1, R) ]^(1 − 0.01·u_hp)`

- `E` = per-contagion HPExpo (table below), `u_hp ∈ [0..3]` shop upgrades (min exponent 0.97).
- `R` = ContagionHPReduction = AssemblerBonus × `1.25^shopLevel` × unique-shop multiplier — a *divisor* on HP, the main long-term catch-up lever.
- Shape: for L < 10 the log term is ≤ 0 or tiny, so HP is nearly **linear** (`≈ BaseHP·(1+L)`); past L ≈ 10 the `(1+log₁₀L·E)^L` term makes HP **superexponential** — the per-level growth ratio itself climbs as L grows. Since the reward ratio per level is constant (below), each contagion has a built-in soft asymptote where marginal levels stop being worth grasshoppers.

**Reward per contagion:** `Bonus(L) = (1 + b/100)^L` — clean compounding, constant ratio `1 + b/100` per level.

**Level-up:** carryover damage rolls into the next level, capped at **3 level-ups per tick** (excess damage discarded) — an anti-snowball clamp for offline returns.

**The 12 contagions** (unlock = lifetime Fries):

| # | BaseHP | E (HPExpo) | b (bonus/lvl) | Unlock | Feeds |
|---|--------|-----------|---------------|--------|-------|
| 1 | 100 | 0.05 | 10% | start | Healthy-potato chance |
| 2 | 500 | 0.25 | 2.5% | 5,000 | Fries earnings |
| 3 | 2,000 | 0.10 | 2.5% | 10,000 | Plant rank EXP |
| 4 | 10,000 | 0.15 | 5% | 50,000 | Plant total production |
| 5 | 1e5 | 0.50 | 1% (÷) | 1e6 | Plant grow time (divisor) |
| 6 | 1e7 | 0.15 | 2.5% | 1e9 | Healthy-potato (again) |
| 7 | 1e10 | 0.35 | 1% | 1e13 | Manual production |
| 8 | 1e15 | 0.50 | 1% | 1e20 | Protein earnings |
| 9 | 1e20 | 0.02 | 5% | 1e25 | Potato bonuses + player EXP |
| 10 | 1e25 | 0.02 | 5% | 1e30 | Death perks + confection EXP |
| 11 | 1e30 | 0.02 | 5% | 1e35 | Worm + larva quantity |
| 12 | 1e35 | 0.02 | 5% | 1e40 | Poop + milk bonus |

Design of the table: powerful bonuses pair with punishing E (contagion 5/8: E=0.5, b=1%), while late unlocks pair huge BaseHP with tiny E=0.02 and generous b=5% — the entry fee is the wall, not the leveling. Contagions 9–10 get **re-skinned descriptions at Ascension 30/40** ("potato evolution"), repurposing existing slots for late-game bonuses instead of adding UI.

### 3. Interconnections

Inputs: Fries totals (grasshopper count + unlocks), a dozen systems into `D` (pets, cards, souls, ascension, brewing), fries-shop into `R` and both exponents. Cross-currency synergy: two permanent shops boost GH damage jointly — `(1 + 0.5·(1 + 0.02·SkullLvl))^SweetLvl` (one currency sets the exponent, the other inflates the base). Outputs: 12 separate multiplicative feeds into the farming/production chain, which loops back into Fries → more grasshoppers. Tension: one shared pool, zero-sum assignment across 12 targets; levels reset to 0 on Transcendence (the top prestige) but persist through Fries prestige.

### 4. Pacing & gating

Unlocks span 5e3 → 1e40 Fries — early contagions arrive minutes apart, late ones weeks apart. Each contagion's own life: fast linear levels (L<10), then the superexponential HP ramp forces attention elsewhere; external multipliers (`R`, `D`, exponent upgrades) periodically re-open stalled bars.

### 5. Borrowable design lessons

- **Linear-then-superexponential HP** `(BaseHP·(1+L))·(1+log₁₀L·E)^L` gives every track a satisfying sprint and a natural personal wall without hard caps — great for per-stat training in a 3D RPG.
- **Constant-ratio reward vs. accelerating cost** guarantees each track's ROI decays, making portfolio rebalancing (not maxing one stat) the core decision.
- **One knob per contagion (E)** tunes an entire track's lifespan; pair strong bonuses with high E to price them.
- **Exponent-upgrades over multipliers** (`DPS^1.20`, `HP^0.97`) feel dramatically stronger late and are cheap to implement.
- **Zero-sum worker allocation** onto always-visible progress bars is an ideal idle verb for a 3D game: assign minions to visible world targets.
- **Sibling shops** (Sweet Potatoes: base 500–10,000, cost `B·(1+(r₀+L·Δr)·red)^L` — a growth rate that itself grows per level; Skull Powder mirrors at half base cost) show how two prestige currencies can share one 14-upgrade template yet interlock via base-vs-exponent synergy.

---

## Side Systems: Expeditions, Challenges, Minigames, Seasons & Achievements

FAPI surrounds its core combat/prestige loop with a "retention ring": timer-based pet expeditions, rule-modifier challenges, a twitch minigame with its own two economies, a seasonal league, live community boss events, and a tiered achievement grid. Every one of them converts a different player behavior (waiting, sacrificing, clicking, competing, collecting) into permanent multipliers that feed back into the main loop.

### 1. Expeditions — the offline mission engine

**Loop.** You assemble teams of 5 pets, send them into one of 30 themed expeditions for a player-chosen duration of 1–24 h (`slider+1 × 3600 s`). While away, the team deals passive damage to an endless "room" ladder; on collection you get resources, cards, pet-capture rolls, and two dedicated currencies. Up to 4 concurrent expeditions (base 1, +3 from shop).

**Room HP ladder** (per-expedition ID, base HP `H₀`, growth `g`): for a standard early expedition,

- `HP(r) = H₀(1 + 0.05(r−1)) · (1+g)^(r−1)`, with a second factor `(1+g·s)^(r−250)` after room 250, where `s = 1 − 0.0025·(reduction upgrades)` is a *purchasable scaling softener*.
- Later expeditions multiply in `(1+g·s·(ID−17))^r`; four "burst" expeditions use triangular scaling `(1 + g·s·r(r+1)/2)^(r−1)`; each expedition also has a hard "wall room" (e.g. room 2,500–200,000) after which an extra `(1+0.05(1+0.01Δr))^Δr` layer kicks in.
- `H₀` spans **100 → 1e3000** across the 30 expeditions; `g` from 0.01 to 4.5. Each room cleared raises that expedition's permanent bonus: `mult = (1+BonusPower)^(rooms−1)` with `BonusPower` typically 0.05 (0.001–1.0 range), one expedition being linear (`rooms−1`).

**Damage & rewards.** Damage ticks every 60 s: `dmg = t · (TeamDmg · PetDamageBonuses / 3600) · (1+petGain) · (1+timeBonus) · synergy`. Rewards on collect, with `h` = hours:
- Reincarnation Points: `⌊RP_highest · 0.0005 · h · synergy · resBonus · (1+petGain)⌋` — 0.05% of your best prestige stat per hour, self-scaling forever.
- Expedition Tokens: `h · synergy · resBonus · (1+petGain) · tokenBonus · (×3 in NG+)`.
- Resource payouts are **sampled from your own farm rates**: every 15 min the game snapshots your current potato/EXP/skull/etc. income into a running average, then pays `avg/hour · RewardTime · 1.25ish` modifiers — expeditions literally pay "what you'd have earned," so they never outpace or trivialize the main loop.
- Pet rank EXP: `⌊h · (1+timeBonus) · 4 · rankExpBonus⌋`; card power `+0.01/s` and card EXP `+0.03/s` while away (cards only if run ≥ ~1 h).
- Outpost drop: roll `U(0,100) < h · dropChance · (1+0.01·pity) · 1.5?`; pity accumulates by hours on failure; every 15th outpost (minus reductions) is guaranteed "decent."
- **Early-cancel gives 50% of elapsed time** — no punishing total loss.

**Gating.** Expeditions unlock sequentially by room count of the previous one (Exp1 r5 → Exp2, r10 → Exp3 … five at "room 50" each late), and Expeditions 25–30 gate on Ascension 30/35/40/45/50/55. Cannot collect until 2 min into a prestige run (anti-exploit).

**Expedition Shop** (~40 upgrades, token-priced): geometric costs `C(L) = C₀·k^L` with small k for long tails — e.g. Pet Damage `25·1.25^L` (max 20, +5%/lvl), Attack/HP `10·1.09^L` (max 60, ×1.05^L), scaling-reduction `500·1.05^L` (max 40), extra expedition slot `50·5^L` (max 3), QoL one-offs (auto-restart 500, extra resource 500). Some late upgrades use *accelerating* bases: `5000·(1.15+0.001L)^L`. Shop rows unlock by Ascension count (6 → 40), so the same currency stays relevant for hundreds of hours.

### 2. Challenges — self-imposed handicaps for permanent unlocks

Ten normal challenges: restart a prestige run under a ruleset (no X, nerfed Y) and reach a target area. Rewards on first completion:

| Tier (C1–4 / C5–6 / C7–8 / C9 / C10) | Talent pts | Reinc pts | Perma-worms | Souls (once ever) |
|---|---|---|---|---|
| C1–4 | 5 | 5·(Asc+1) | +1 drop, +5 worms | 1000 |
| C5–6 | 10 | 10·(Asc+1) | +2, +10 | 1000 |
| C7–8 | 20 | 20·(Asc+1) | +3, +15 | 1500 |
| C9 / C10 | 0 | 30/50·(Asc+1) | +10, +50 | 2000 |

Each also grants a unique permanent perk (inventory slots, stun-on-crit, cow prices paid in worms, etc.). Two safety valves: **rewards scale with Ascension count** (worth re-doing after each mega-prestige), and `WinChallengeOnAscension()` **auto-completes challenge N once you exceed Ascension N** — a catch-up mechanic that erases stale chores. On quitting/finishing, "Begone" credit backfills all area progress below your challenge-best, so challenge time is never wasted. Repeatable "IF" challenges (play a specific class, ~15% target) each add a stacking `+15%` to a paired resource per completion, with a 9-step cycle display; they're disabled after Ascension 3 and folded into an automatic path.

### 3. Whack/Wreck-a-Potato — the twitch minigame with two shops

30-s (base) whack-a-mole: potatoes pop on a 15-cell grid, spawn window `WreckPotatoSpeed = 2 s` (turns red at 65% — clicking late costs points). Scoring, with `P = 10 + 2·shopLvl` and `B = max(WhackScoreBonus, AscensionWhackBonus)` (multiplier from *outside* systems):
- Hit: `+P·B·M`; gold potato (10% base): `+5·P·B·M`; miss/late `−(P/2)·B·M`; clicking a green decoy `−2.5P·B·M`. Combo `+1`/hit, `M = 1 + ⌊combo/10⌋·startMult`, combo cap `10 + 10·shopLvl` (max 25,000 lvls!). Protection charges (max 5) eat one mistake each.
- Play gate: one game per **300 s**; auto-complete pays `max(200, 25–75% of best score)`; a second timer auto-plays every 900 s (reducible to ~300 s) — the minigame gracefully automates itself out of being a chore.
- Post-game buff roulette: one random buff from a pool of 14, `+25% +5%/lvl` to attack/HP/potatoes/EXP/etc.; duration `max(120 s, log₁.₀₂(score+1) − 200)` — **buff length grows with the log of score**, and one slot pays flat Souls (premium-ish currency) with a daily cap `500·(1+0.01·Asc)` at 50/game.
- Score is also a **currency**: the Whack shop's ~35 upgrades ladder from `2500·(L+1)·1.5^L` (game length) through `5000·10^L` (buff potency) to absurd endgame sinks — `1e75·10000^L` (expedition scaling −0.25%), `1e300·(1e15·1e5^L)^L`, up to `1e2500`-scale — a single minigame currency that stays purchasable across the game's entire ~1e3000 number range.

### 4. Seasons/Leagues & community events

**League** = a time-boxed alternate save (fixed window, e.g. Apr 16 – Jul 30) you can hot-swap into (60 s switch cooldown). A 43-step milestone track keyed to `(AscensionCount, ReincarnationLevel)` thresholds — RL 100→2250 at Asc 0, then 0/250/…/3500 at Asc 1, etc., designed via `RL_target = (3000 + 750·asc)·min(1.1, 1.05+0.01·asc)^asc · pct` — pays mostly **1000 Souls per step** plus cosmetics and pet tokens into your *main* save. When the season ends you may **transfer 10% of earned Souls + all purchased packs** to the main save — a soft-reset sandbox with skin-in-the-game.

**Community boss event** (server-driven): energy 1/300 s, seasonal boss ladder (bossMax 120), dual reward tracks — *personal* damage thresholds and *community* tiers — paying potions, reinc EXP, pet tokens, souls, golden potatoes, and Event Points. Event Points feed the core stats as `Atk/HP × 1.01^points · (1 + 0.01·specialPoints)` — a compounding permanent bonus for participating.

### 5. Achievements — a 1152-point stat tax rebate

~47 cumulative counters (kills, worms, milk, expedition hours, trades…), each with bronze/silver/gold thresholds spaced roughly ×100–×1e6 apart (e.g. potatoes earned 1e6/1e12/1e24), plus dozens of hidden exploration achievements with a "show hint" button. Tiers award **3/6/12 achievement points** (total pool 1152). The payoff is a single elegant rule: **Attack, HP, and HP-regen are all multiplied by `1 + 0.005 · totalPoints`** — up to ×6.76 at completion — plus per-counter side effects (each pet captured: `Atk × min(1.1, 1+0.01·Asc)^pets`).

### Borrowable design lessons

1. **Pay expeditions in "your own income per hour," not fixed tables.** Snapshotting live farm rates every 15 min makes timed missions permanently balanced with zero tuning — ideal for a 3D game's send-companion-away system.
2. **Let one minigame currency span the whole game.** Whack score costs run 2.5e3 → 1e2500; the toy from hour one is still the endgame's best shop because sinks keep scaling.
3. **Score→log→buff-duration coupling.** `duration = max(floor, log₁.₀₂(score))` rewards skill without letting buffs explode; convert any skill-check into buff *time*, not buff *power*.
4. **Auto-complete stale challenges on prestige.** `if Ascension > N: challenge N auto-clears` respects veterans' time while keeping content meaningful for fresh players.
5. **Sequential unlock ladders with visible next-goal ("reach room 50 to unlock next")** give the timer system its own progression fantasy independent of the main game.
6. **Achievement points as a flat global stat multiplier (`1+0.005n`)** makes every miscellaneous counter quietly load-bearing — collectors get power, min-maxers get a checklist, and the formula costs one line.
7. **Seasons as parallel saves with a 10% transfer** delivers fresh-start excitement without threatening the main save's sunk progression.

---

## Distilled Playbook

Each section carries its own lessons; these are the cross-cutting ones — with an eye to what FAPI adds *beyond* the NGU and Idle Spiral blueprints.

### The core loop

- **Make failure the harvest.** Every run-end — death included — pays the meta currency, scaled exponentially by depth, and an enrage mechanic guarantees the loop always closes. For a 3D action-incremental this is the single best pattern here: push, die, spend, re-enter.
- **Two-lever kill math.** `dmg·FE/(100+EnemyHP)` makes required damage quadratic in enemy HP with a second purchasable stat (FE) that linearizes it — progress always has two shops to visit, and walls can be tuned by either curve.
- **Area-normalize percent stats.** Crit/evade/drop rates are computed against per-area thresholds; a stat that's capped in the zone you farm is back near zero in the next zone. Percentages become renewable content instead of one-time purchases.
- **Timer-shaped prestige rewards** (zero below 15–30 min, linear to a knee, asymptotic after): tunes optimal run length with a curve, not a rule — same philosophy as NGU's rebirth dividers, gentler shape.

### Prestige architecture

- **Derive prestige currency from peak, watermarked** — `max(recorded, f(best level this cycle))` means pressing the reset button never costs shop progress. Kills prestige anxiety dead.
- **Each layer pays the layer below a scalar** (×(A+1), +25%/A, +5% relative/A): one multiplication makes every big reset visibly accelerate every small one.
- **Milestone auto-grants over re-grinds:** auto-clear zones, auto-max early QoL at count thresholds — only the frontier is ever replayed.
- **Two gates per reset: performance OR time** (reach the requirement, or a 24 h no-reward restart). Nobody soft-locks; the timer never outcompetes playing well.
- **Percentage-retention schedules** for the top layer ("keep 10%·⌊(T−7)/4⌋, cap 100%") — a per-subsystem tuning knob far finer than keep/lose flags.
- **Sunset economies by constant-substitution.** Freeze a mature system's multiplier at its endgame constant and swap in a successor currency — cheaper than rebalancing, reads as a fresh start.
- **Stagger per-ascension compounding starts** (`1.05^(A−k)`, different k per system) so each prestige wakes up the next subsystem — a content-release schedule encoded in one exponent.
- **Time-charged generator** (`1 − e^(−kt)` over 21 days) as a top-layer passive: front-loaded enough to feel immediate, self-capping without a wall.

### The math toolkit

- **Sell exponents, not multipliers, at the top of the stack.** `M^(1+0.01n)` on an aggregate auto-scales with every future system — one SKU, lifetime relevance. (Potions do it too: ×1.5 and ^1.01 while active, banked as *duration*, not stacked strength.)
- **Sink softcaps via log-powers:** invested currency m yields ~m^0.33 (per-stat tunable exponents 0.12–0.33), with double-log curves gated behind 1e60 thresholds for infinite sinks — number always goes up, balance never breaks.
- **Escalating-ratio costs** `(a + b·L)^L` — the growth *rate* itself grows, creating organic walls with no arbitrary cap.
- **Convert exponential to polynomial with `k^max(0, log_b(L) − c)`** — one formula serves levels 1 to 10⁶.
- **Log-conversion with a drifting base** (`1.5^(log_b M)`, b rising with M) for smooth diminishing returns on unbounded inputs.
- **Log-leaderboards:** store log₁₀(value) as a plain double to rank unbounded BigDouble scores.

### RNG, drops & collections

- **Pity everywhere, at ~2–2.5× expected attempts,** tracked per collectible with a visible counter; accumulate `Σ missed chance` so pity auto-scales with the player's actual drop rate. Weight-proportional pity preserves the rarity hierarchy.
- **Expected-value drops with fragment banking** for offline/AoE kills — rare drops become deterministic over time with zero perceived unfairness.
- **Rarity = number of rolled affixes,** with an upgradeable guaranteed floor that auto-converts dead drops to currency.
- **Prestige governor on gear:** `min(1, BestThisRun/ItemRating)` lets players keep items across resets while forcing re-progression — same trick as NGU's boss-fraction gating, independently invented.
- **Two clocks per collectible** (pet Level: cheap/active/exponential vs. Rank: slow/away-team/linear, with an XP-overlap penalty) keeps both engagement modes relevant forever.
- **Temp/perma split with a metered converter** (cards): earn big numbers fast, but banking them past prestige costs a timed resource — resets sting without punishing.

### Idle & economy design

- **Index idle rewards to measured active rates.** Expeditions snapshot your farm's live hourly income and pay 25% of it — away-income is permanently balanced with zero tuning.
- **Manual action compounds idle:** a permanent multiplier from lifetime manual harvests (`(1+ε)^log₁.₂₅(clicks)`) rewards touching the game without requiring it.
- **Cross-currency taxes:** pricing one system's upgrades in five other systems' currencies forces breadth and gives stale currencies late-game sinks.
- **One minigame currency spanning the whole game** (whack scores from 2.5e3 to 1e2500): the hour-one toy stays endgame-relevant because sinks keep scaling.
- **Achievements as a flat global multiplier** (`1+0.005n`) — every counter quietly load-bearing, one line of code.

### Monetization with governors (study this even if you never monetize)

- **Decouple price from pacing:** cost growth freezes at 4× while a prestige-count level cap gates effectiveness — spending stays predictable, progression speed stays designer-controlled, and paying can't outrun playing.
- **Over-cap purchases clamp, never waste** ("Limited" levels activate on future prestiges) — pre-selling progression without buyer's remorse.
- **Tax premium income at deeper layers** (−10% souls per Transcendence, floored) to keep the currency scarce for veterans without raising prices for newcomers.
- **Ledger balances** (`Total = Σ sources − Spent` from immutable counters) for audit-proof currencies — same pattern as Idle Spiral's Spiral Points.

### What FAPI adds to the series

NGU shows the multiplier-chain architecture; Idle Spiral shows the math library and self-pacing resets; RuneScape shows identity and economy. FAPI's unique contribution is **operational scale**: the grammar for *sprawl* (multiply between systems, exponentiate between layers), the lifecycle tools for content (economy sunsetting, staggered wake-ups, retention schedules), anxiety-free prestige (watermarked currencies, auto-grants), and the most complete deterministic-RNG/pity toolkit of the four games. If your 3D incremental is meant to run for years of updates, FAPI's patterns are the ones that keep it manageable.

---

*Generated 2026-07-19 by decompiling and reading `Assembly-CSharp.dll` (306 source files, BreakInfinity BigDouble numbers). Formulas paraphrased from code into math; where tooltips and code disagree, the code wins.*
