# Idle Spiral — Systems & Math Design Reference

*Reverse-engineered from the game's decompiled C# source (the `decompiled/` folder next to this file: `domain/` holds the clean game model, `game/` the Unity layer, `idlelibrary/` the shared idle-game engine) for design study. All formulas and constants come from the actual code, rewritten in math notation. Intended use: borrowing ideas for a new 3D game — not reproducing Idle Spiral.*

---

## The Big Picture

Idle Spiral is the most *literally mathematical* game in this reference series: the resource is geometry, the upgrades are coefficients, and the endgame collectibles are famous parametric curves named after mathematicians. Under the theming sits some of the cleanest idle-game engineering of the three decompiled games. The load-bearing ideas:

1. **The number is the picture.** The spiral's radius *is* the main currency R — the game renders the polar point of your resource state every frame, and the growth law is displayed as live LaTeX: `Δr = A·ω^e + k`. Upgrades buy the equation's coefficients — including its *exponents* — so additive vs. multiplicative vs. exponential investment is legible and thematic. Buying spin speed visibly makes the spiral whirl faster.

2. **A three-deep composed reset stack.** Omega soft prestige (wipes r; gated at r ≥ 1000·10^(L(L+1)/2), paying ω both a multiplier *and* an exponent level — payoff 1.25^(L²+L)) sits inside Prestige (banks a continuously *accruing* pending currency, dp/dt = ∛r/100 000 — prestige as a flow, not a snapshot) inside Tornado (tier ladder ×1000 r per tier). Each layer's wipe-list literally contains the previous layer's, built from composed Reset objects — and challenges *reuse the Tornado reset as their entry fee*.

3. **Lifetime playtime is banked into prestige.** Every Tornado banks hours played into H(h), a piecewise factor whose *marginal rate rises* (1%/h → 1.5%/h → 1.6%/h) — every hour ever played permanently strengthens every future reset. Prestige rewards compound three sources: tier × lifetime hours × log(best sub-currency bank).

4. **A curve zoo balanced by three audited softcaps.** Effects across the whole game route through three primitives — linear-then-log (LogDecay), linear-then-asymptote (Decay), linear-then-root (RootDecay), each identity below a threshold T. Dozens of bonuses, two constants each, zero bespoke math. Alongside: triangular costs giving closed-form √t leveling, exact O(1) bulk-buy on all three cost classes, and Basel-series and Hill-curve actives in the reactor for variety.

5. **Combat that rewrites *you*, not the boss.** Enemies don't get gimmick AI — each swaps in a different stat-block for the *player* (log-transforms your ATK, substitutes your economy variables for your combat stats, zeroes normal hits so only crits count). Rewards come from a visible 21-slot wheel whose contents are rerollable RNG; batching modes (÷V attack speed, ×V rewards) are throughput-neutral chunking that doubles as lag control.

6. **Ledger-style meta-currency.** Spiral Points are never stored — the balance is recomputed as (Σ earned) × tornado-multiplier − (Σ spent), so late prestige *retroactively* multiplies everything ever earned. Spendables are derived (`available = sources − consumed`), making full respec exact by construction. Daily RNG is seeded per day (save-scum-proof); achievements latch (`ever true`), so resets can't steal rewards.

## Contents

1. **The Spiral** — geometry as currency, parameters & upgrade shops
2. **Currencies & Producers** — R, Z, line banks, Exp, scavenger mode, the offline-boost identity
3. **Base Prestige & Omega Soft Prestige** — the inner reset loops
4. **Tornado, Reactor & Challenges** — the outer prestige and its engine layer
5. **Equations I** — the collectible curve gallery, lap leveling, milestones
6. **Equations II** — acquisition, drop rates, effect curves
7. **Spiral Designs** — cosmetics with teeth (wear ≠ activate)
8. **Battle** — waves, upgrades, the 21-slot reward wheel
9. **Enemies as Stat-Block Rewrites** — crits, combos, per-enemy rewards
10. **Raid Boss Prototype** — roulette-drawn math-symbol allies (unshipped)
11. **Theory & Loot** — the chained research layer
12. **Meta Systems** — achievements, story, dailies & the number engine
13. **Distilled Playbook** — the transferable patterns, collected

---

## The Spiral: Geometry as Currency, Parameters & Upgrades

### 1. What it is & core loop

Idle Spiral renders one literal spiral on screen: an angle θ constantly winds around the origin while a radius **r** grows every second. That radius *is* the primary currency, labeled R ("distance"/spiral length). The player buys upgrades — priced in R itself, in prestige points P, or in the second currency Z — that raise the coefficients of the on-screen growth equation `Δr = A·ω^e + k`, which the game displays as live LaTeX. The loop: R grows → spend R on coefficient upgrades → Δr/sec increases → hit prestige thresholds → earn P/Z to buy permanent coefficient upgrades → repeat with a bigger equation.

### 2. The math

**Spiral geometry (game/Spiral.cs).** The rendered vertex at any moment is the polar point of the current currency values — geometry is a pure *visualization of the resource state*, not simulated separately:

- Normal: `(x, y, z) = (R·cos θ, R·sin θ, Z)` — radius = R currency, depth = Z currency.
- "Equation mode" (rose curve): `(x, y) = (R·cos(kθ)·cos θ, R·cos(kθ)·sin θ)`.
- Sphere challenge: `(R·cos θ·cos 0.1t, R·cos θ·sin 0.1t, sin θ)`.

Angular speed per frame: `Δθ = 0.002 · θ₀ · ω`, with `θ₀ = 10` (ParametersPresenter.initialTheta), so `Δθ = 0.02·ω` rad/frame; a new line vertex is committed each time θ advances `> 0.05` rad (`maxVertexDeltaTheta`). ω is the same upgradeable parameter that appears in the income formula — buying "spin speed" visibly makes the spiral whirl faster.

**Income formula (domain/DistanceMultiplier.cs).** Per second:

```
ΔR/sec = (A_used · ω^E + k) · (1 + 0.5·L_mult if line-timer active)
```

where `E` = omegaExponent parameter (starts 1), and:

- `A = a + b·c·d·e·f·g` (composite coefficient; in the "poorMath" challenge the product degrades to a **sum** `a + b+c+d+e+f+g`)
- After first prestige, `A_used = ΣA` via the **recurrence** (ReccurenceMultiplier): `A₀ = A`, `Aᵢ = u·Aᵢ₋₁·I + v`, `ΣA = m · Σᵢ₌₀^{n−1} Aᵢ`, with the "integral" unlock `I = 2α^{β+1}/(β+1)` (i.e. ∫₀^α 2x^β dx; I = 1 before unlock). Displayed in-game as `A_i = ∫₀^α 2x^β·u·A_{i−1} dx + v`.
- `k` is an additive term with its own **exponent** channel: every Parameter computes `value = (base)^{exp}` where `base = init·mults + produced` and `exp` defaults to 1 (IdleLibrary/Parameter.cs) — so the exponentK upgrade literally raises k to a power.
- Second currency: `ΔZ/sec = γ·Ω + δ`. Tornado prestige threshold: `R ≥ 999·10¹²`.

**Cost curves.** Two primitives (idlelibrary): `ExponentialCost: cost(L) = c₀·b^L` (bulk-buy uses the closed-form geometric sum `c₀(b^{L₂}−b^{L₁})/(b−1)` and max-affordable solves `L = log_b((b−1)N/c₀ + b^{L₁})`), and `FixedCost` (flat price forever). The base R-shop uses a signature trick: growth factors are entered as `1.3^{0.1}` etc. (`root10`), i.e. **the price multiplies by the stated factor only every 10 levels** — very smooth early scaling.

**R-cost upgrades (reset on prestige):**

| Upgrade | cost(L) | Effect |
|---|---|---|
| k | 1 · 1.1^L | k += L |
| a | 10 · 1.3^{L/10} | a += 0.1L |
| b…g | 10²…10⁶ · (1.5, 2, 2.5, 3, 4, 4.5)^{L/10} | each += 0.01L |
| ae11 | 10⁴ · 10^L | a–e ×(1+0.01L) |
| logk | 10⁴ · 10^L | a ×(1 + 0.1L·log₁₀(k+1)) |
| beMul | 10¹² · 10^L | a ×((b+…+g)/6)·(1+0.1L) |
| rAll | 10¹⁸ · 10^L | ΔR ×(1 + Σ(all R-upgrade levels)/10⁴)·(1+0.1L) |

**P-cost (permanent) upgrades:**

| Upgrade | cost(L) | Effect | Cap |
|---|---|---|---|
| parmA | 10 · 1.5^L | a += 1L | — |
| parmB…G | 10²…10⁷ · 1.5^L | += 0.1L | — |
| parmK | 10 · 10^L | k += 10L | — |
| exponentK | 10⁷ · 10^L | k exponent += 0.1L | 5 (→ k^1.5) |
| u | 10 · 10^L | u += L | 5 (+unlocks) |
| v | 1 · 2^L | v += 10L | 999 |
| n | 1 · 5^L | n += L | 5 (+unlocks) |
| α / β | 10²¹·1.25^L / 10²⁴·1.4^L | += 0.01L | 400 each |

**Z-cost upgrades:** γ, δ, Ω: `100·2^L`, += 0.1L. a_mul…g_mul: `10³…10⁹·10^L`, ×(1+0.1L). z_multiplier: `1·1.5^L`, ΔR ×(1 + (1+0.1L)·log₁₀(Z+1)/5), cap 10000 — a cross-currency feedback softened by log. m: `10¹²·1000^L`, += L, cap 10. Late RPG hooks: attack speed `10¹⁰·10^L` (×1+0.001L), rare drop `10¹⁵·250^L`, non-raid debuff `10³⁰·100000^L` (×0.99^L).

**Spiral Point meta-shop (InfiniteSpiralDomain).** Spiral Points = achievement points (SP = gained·tornadoMult − spent), and the whole shop is **freely refundable** (`RefundAllUpgrades` zeroes consumption). All prices are FixedCost (flat per level):

| Item | Cost/level | Max L | Effect |
|---|---|---|---|
| a–g, k | 30 | 100 | ×(1+0.01L) each |
| atk, def | 30 | 50 | ×(1+0.01L) |
| critical / offline reward | 200 | 100 | +0.1%/L (add) / ×(1+0.01L) |
| super crit | 1000 | 50 | +0.1%/L |
| equation slot | 1000 | 2 | +1 slot |
| mega crit, loot progress | 100000 | 50 | +0.1%/L |
| Autobuyers (k, a, b…e, all, u/v/n, prestige-all) | 10–500 one-time | — | automation |
| Auto-uncommon/rare loot, rarity lock | 1000–2000 one-time | — | QoL |
| Spiral designs 1–17 (cosmetic unlocks) | 300–2000 one-time | — | new skins |

**Design leveling (SpiralUpgrade.cs).** Each cosmetic skin also has active/passive power tracks bought with SP: `cost = c₀·1.5^L` with effect ×(1+0.01L) for early skins (c₀ = 10⁵…10¹¹, one tier per order of magnitude), switching to `c₀·10^L` with a 0.1 effect modifier (×(1+0.001L)) for endgame skins (c₀ = 10¹²…10¹⁵) — cosmetics double as a parallel stat ladder.

### 3. Interconnections

R feeds everything: it buys its own accelerators (self-referential spending tension — spend R now vs. bank it toward the 999T tornado threshold), converts to P on prestige (`P ≈ (R/10⁵)^{1/3}` via cubic_root=3, denominator=10⁵ parameters), and gates challenge/battle content. Z (earned from battle) buys multiplicative sidegrades and the log-coupled z_multiplier that feeds back into ΔR. Achievement/Spiral Points come from achievements + tornado prestige and buy automation, respec-able parameter boosts, and skins. Every subsystem (battle crits, loot, theory, designs) writes into the *same* `ParameterContainer` of ~130 named parameters through stacked add/mul/exponent multiplier channels — a single global blackboard.

### 4. Pacing & gating

Early game: root10 cost curves mean a-upgrades cost 10, 10.27, 10.55… — dozens of buys per minute. Layers are price-gated by orders of magnitude (b at 10², g at 10⁶, beMul at 10¹², rAll at 10¹⁸, nonraid debuff at 10³⁰), each with a lock screen showing "R = cost" as the unlock condition (UPGRADE.UnlockCondition uses **max R ever reached**, so unlocks never re-lock). Hard caps (u ≤ 5, n ≤ 5, exponent ≤ +0.5, α/β ≤ 400) are walls that later systems raise (`u_and_v_limit`, `n_limit` parameters) — caps as content. Recurrence (n>1) is prestige-gated; the integral form is tornado-gated; automation is SP-gated at trivial prices (10–500) so QoL arrives with the first achievement bursts.

### 5. Borrowable design lessons

1. **Make the resource literally visible as geometry** — radius = currency means every purchase changes the picture instantly; in a 3D game, let tower height / territory radius / creature size *be* the number.
2. **Upgrade the equation, not the number** — exposing `Δr = A·ω^e + k` and selling its coefficients (including an exponent channel) makes multiplicative vs. additive vs. exponential choices legible and thematic.
3. **Tenth-root cost factors** (`b^{L/10}`) give ultra-smooth early cadence while retaining exponential discipline; pair with closed-form geometric-sum bulk-buy for cheap max-buy math.
4. **Flat-cost, fully-refundable meta shop** — FixedCost + one-click respec turns the SP shop into a loadout system, not a ratchet; great for RPG builds.
5. **Cross-currency log coupling** — `ΔR ×(1 + c·log₁₀(Z+1))` rewards the second currency without letting it dominate; a robust softcap idiom.
6. **One parameter blackboard with add/mul/exponent/independent channels per stat** — every system registers labeled multipliers into shared parameters, making 100+ interlocking bonuses tractable and debuggable.

Key sources: `E:/Games/steamapps/common/Idle Spiral/decompiled/domain/DistanceMultiplier.cs`, `domain/ReccurenceMultiplier.cs`, `domain/UpgradeContainer.cs`, `domain/InfiniteSpiralDomain.cs`, `domain/SpiralUpgrade.cs`, `domain/IdleLibrary/Parameter.cs`, `idlelibrary/IdleLibrary/ExponentialCost.cs`, `game/Spiral.cs`, `game/SpiralGetter.cs`.

---

## Currencies & Producers: R, Z, Lines, Exp, Scavenger Mode & Offline Boost

### What it is and the core loop

Idle Spiral's economy is built on one abstract base producer, `DistanceDomain`: a big-number that ticks up every frame/second at a computed rate, tracking lifetime total, max balance, and max rate ever reached. Its two subclasses are **R** (spiral length, the main currency, spent on everything) and **Z** (a late-game "reactor" currency). Around them sit tactical modifiers: a rechargeable **Line Number** boost bank, a battle **Exp** stat currency, throughput levers (**Scavenger/Nuke** modes), a stored **offline boost**, and a shared **MilestoneService** that converts lifetime counters into permanent stat multipliers. The loop: R accrues passively → the player spends banked Lines and offline boost to burst it → milestones from battling/designing feed multipliers back into the rate.

### The math

**R production.** `dR/dt = M_shared(0) + M_independent(0)` — two additive multiplier pipelines summed. The base term registered by `DistanceMultiplier`:

`dR/dt = A_used · Ω_geo^(ωExp) + k`, then `× (1 + 0.5·λ · [line timer active])`

where `A_used = A` normally but `ΣA` (recurrence-relation value) once parameter n > 1; `A = a + (b·c·d·e·f·g)` normally, degrading to `A = a + (b+c+d+e+f+g)` in the *poorMath* challenge (products become sums — an elegant challenge nerf). `λ` = upgradeable `line_number_multiplier`. In the Logarithm challenge (kind 22) the whole rate is crushed: `dR/dt → log₁₀(dR/dt) · (1 + 0.001·LI_kills)`, where LI kills earned during the challenge slowly claw the rate back.

**Displayed vs stored R.** `R.Number = storedCurrency + PeriodicalMultiplier(0)`. Challenges exploit this virtual offset: the Drain challenge registers `offset(t) = B·(1 − 0.001·t)` — a bonus that decays to zero at t = 1000 s and then goes negative, draining effective R without touching the save value.

**Z production.** `dZ/dt = γ·Ω + δ` with base values γ = 0.1, δ = 0, Ω = 0; Ω gains a flat +0.1 only once Tornado-prestige tier ≥ 1 — so Z literally cannot flow until the second prestige layer is entered. During the Sphere challenge, `ZCurrencyManager` swaps Z's backing store for a `NullCurrency` (all gains/spends void), cleanly suspending a whole economy via the strategy pattern.

**Line Number bank** (constructed as `LineNumberDomain(300, 5, 3.0)`):

| Constant | Value |
|---|---|
| Interval per line | 300 s |
| Max lines / min | 5 / 1 |
| Refill speed | 3 × `line_number_refill` param |
| Active effect | rate × (1 + 0.5·λ) |

Inactive: `dτ/dt = 3·ρ`; every 300 accumulated → +1 line (base full recharge = 500 s). Active: τ counts down in real time, one line consumed per 300 s, up to 25 minutes of boost per bank. `AutoLineNumber` re-triggers the timer whenever the bank is full — a purchasable QoL automation.

**Exp.** `E_available = E_earlyTest + battleRewards[30] + M_independent − E_consumed`. Available Exp is *derived*, never stored: spending only increments `E_consumed`, making refunds/respec trivially exact. (Amusing bug: the early-release grant checks `≥36 000 s → 500` *first*, so the 2 000 and 5 000 tiers at ≥360 000/≥1 800 000 s are unreachable.)

**Scavenger mode** (unlocked when attack progress ≥ 10 per frame — i.e. the attack-speed hard cap is hit): pick `V ∈ {1, 10, 50, 100, 1000, 10000}` per enemy (or any custom V > 1):

`attackSpeed × 1/V, allRewards × V, lootProgress × V`

Expected throughput is unchanged; variance and per-kill packet size scale by V — it converts wasted over-cap attack speed into fewer, fatter kills. Separate **Nuke mode** sets kills-per-attack ∈ {1, 10, 50, 100, 1K, 10K, 100K}; both are forced to 1 inside challenges flagged `IsNukemodeLocked`.

**Offline boost.** Accrue 10 pts per offline second; while toggled on, burn 190 pts/s and multiply the global tick ×20. Check the identity: T offline seconds → 10T pts → 10T/190 s of boost → extra progress = (20−1)·(10T/190) = **exactly T seconds**. Offline time is refunded 1:1, but compressed into a 19×-shorter active burst the player chooses when to fire. `BattleOfflineBonus` separately simulates combat over the absence: `rewardMultiple = simulatedKills / max(#rewardTypes, 1) / max(1, difficultyBonus)`. Dev `TimeWarp(s)` just calls `ProduceBySecond(s)` on R, Z, and prestige points.

**MilestoneService** (shared engine): given `(counter, [threshold, targetParam, type, value]…)`, it registers each reward as a *conditional multiplier* — `active ⇔ counter ≥ threshold` — directly into the global parameter container. Battle table: 28 tiers on total kills, 100 → 3×10⁷ (roughly 1-2-3-4-5 ×10ⁿ spacing), rewards mostly small (`atk +50`, `×1.05 offline reward` every other tier, `×1.1 exp`, `×1.25 atk/def/hp`). Design table: 14 tiers on designs-unlocked 10→35, `×1.1` to spiral parameters a…g, γ, δ, `×1.5 k`. Equation table keys off Σ equipment levels.

**Time-fed passives** (Bonfire/Railway/Glass): each accrues raw *equipped seconds* and maps through the shared soft-cap `f(x) = x` if `x ≤ T`, else `T + ln(1 + 0.1(x−T))`:

| Passive | Input x | T | Effect |
|---|---|---|---|
| Bonfire | t / 7 776 000 s (90-day units) | 4 | ×(1+f) mul |
| Railway | (t · #equippedEquations) / 25 920 000 s | 2 | +(1+f) add |
| Glass | t / 518 400 000 s | 0.05 | +f (tiny %) add |

Months-scale linear growth, then logarithmic — permanent but never dominant.

### Interconnections

Kills feed the battle milestone counter, Exp (`battleRewards[30]`), and Logarithm-challenge recovery; milestones feed combat stats and spiral parameters a–g, closing the loop into `dR/dt`. Scavenger tension: ×V rewards vs ÷V attack speed means burst kills for milestones/exp but slower, riskier fights. Lines trade a finite bank against always-on rate; offline boost trades stored time against when you want ×20.

### Pacing and gating

Z is hard-gated behind Tornado prestige (Ω = 0 until tier 1). Scavenger gates behind *capping* attack speed — a stat-wall converted into an unlock. Milestone spacing (linear early, decade-spaced late) delivers dense early dopamine and sparse late chase goals. Passives are month-scale drips with log soft-caps, ensuring set-and-forget never outpaces active play.

### Borrowable design lessons

1. **One producer base class** (rate, total, max, max-RPS) — every currency gets stats, offline warp, and reset behavior for free.
2. **Displayed = stored + virtual offset** — lets challenges/events drain or inflate a currency without corrupting saves.
3. **Derived spendables** (`available = Σsources − consumed`) — exact free respecs by construction.
4. **The offline identity** `(speedup−1)·gainRate = burnRate` — refund offline time 1:1 but as a player-triggered burst; feels generous, costs nothing.
5. **Throughput-neutral chunking** (Scavenger's ×V/÷V) — converts a hard stat cap into a strategic granularity choice instead of dead progression.
6. **Data-driven conditional-multiplier milestones** — one 60-line service turns any lifetime counter into a permanent-reward track; adding a track is just a table.

---

## Base Prestige & Omega Soft Prestige: The Inner Reset Loops

### What it is and the core loop

Idle Spiral's main currency is `r`, the length of a growing spiral. Below the big "Tornado" tier sit two nested resets. **Omega soft prestige** is the inner, fast loop: reach a length threshold, reset your spiral and its in-run upgrades, and gain one Omega level that permanently (within the run-family) accelerates spiral growth. **Base Prestige** is the outer loop: it banks a continuously-accruing pending currency `p` into spendable **P points** (a permanent upgrade shop), while wiping the spiral *and your Omega count*. Play alternates: grind a few Omega levels until the next one is unreachable, then Prestige, rebuy, repeat.

### The math

**P-point gain is a flow, not a snapshot.** Pending prestige accrues every second (`ProducedPrestigePoint.ProduceBySecond`, `PrestigePoint.func`):

- dp/dt = δp · max(r, 0)^(1/c) / D, with δp = 1.0 (base; multiplied by battle rewards), c = `cubic_root` = 3, D = `prestigePoint_demoninator` = 100,000.
- So **dp/dt = ∛r / 100,000 per second** (the UI literally renders "Δp = ∛r / 100000" as LaTeX).
- On Prestige: P += p_pending; p_pending → 0; prestigeNum++; dailyPrestige++; timeSincePrestige → 0. Max/total P are tracked for stats. There is **no minimum threshold** — Prestige is always allowed unless the active challenge sets `CannotPrestige`.

Both `D` and `c` are built as tunable `Parameter`s (an `UpgradeKind.prestigepoint_denominator` even exists in the enum) but nothing registers modifiers on them — they ship as constants.

**Omega gate — triangular-number exponents.** The L-th soft prestige (current count L) requires:

- **r ≥ 1000 · 10^(L(L+1)/2)**

| L (current) | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|---|
| required r | 10³ | 10⁴ | 10⁶ | 10⁹ | 10¹³ | 10¹⁸ | 10²⁴ | 10³¹ | 10³⁹ |

**Omega payoff — multiplier and exponent at once.** SoftPrestige registers two effects:

- ω-multiplier: **×1.25^L** (multiplicative on ω, base ω = 1)
- omegaExponent: **+1 per level** (additive, base 1)

Spiral growth uses ω^E inside the per-second distance multiplier (`DistanceMultiplier`): dr/dt-multiplier = A_used · ω^E + k. So Omega's contribution is (1.25^L)^(1+L) = **1.25^(L²+L)** — the payoff exponent is quadratic in L, deliberately mirroring the quadratic cost exponent. Numerically: cost grows as 10^(0.5·L(L+1)) while payoff grows as 10^(0.097·L(L+1)); the gap widens ~×10^(0.4·(L+1)) per level, so the inner loop always stalls after a few levels and hands off to a P reset. ω also drives the literal spin rate of the on-screen spiral (0.002·θ·ω), so power gains are visible motion.

**Reset hierarchy (composed sets, from `IdleSystem.SetProperty`):**

| Tier | Wipes | Keeps |
|---|---|---|
| Omega soft prestige | r + all r-bought upgrades | Omega count (+1), P, p-shop, pending p |
| Base Prestige | the above + Omega count (→ 0, or → `softPrestigeSkip` if the skip toggle is on) | P, p-shop levels |
| Tornado | the above + P currency, prestigeNum, pending p + all P-bought upgrades | Tornado-tier goods |

`softPrestigeSkip` (base 0) gains +`skipNumber` per qualifying completed challenge (`ISkipSoftprestige`), letting Omega restart at level N after a Prestige — bought-back friction removal. Challenges can also set `CannotSoftPrestige`/`CannotPrestige` to lock either loop as a handicap.

**What P buys** (all `ExponentialCost`: cost(L) = base · ratio^L; effects add to spiral-formula parameters and persist through P/Omega resets):

| Upgrade | Base cost | Ratio | Effect/level | Cap |
|---|---|---|---|---|
| u | 10 | ×10 | +1 to u | 5 + limit-upgrades |
| v | 1 | ×2 | +10 to v | 999 |
| n (spiral arms) | 1 | ×5 | +1 to n | 5 + limit-upgrades |
| perm A | 10 | ×1.5 | +1.0 to A | — |
| perm B–G | 10²…10⁷ | ×1.5 | +0.1 each | — |
| perm K | 10 | ×10 | +10 to k | — |
| exponent K | 10⁷ | ×10 | +0.1 to k's exponent | 5 |
| α | 10²¹ | ×1.25 | +0.01 to α | 400 |
| β | 10²⁴ | ×1.4 | +0.01 to β | 400 |

The assigned Tornado-shop pieces (`z_omega`, `bOmegaUpgrade`, `dOmegaUpgrade`) spend the z-spiral currency at **cost 100·2^L** for **+0.1/level** to Ω, γ, δ respectively — same shop pattern, one tier up.

### Interconnections

Feeds in: r (both the p-rate and the Omega gate read spiral length); battle rewards multiply δp; challenge completions multiply ω (×(1+0.1·level)), add +0.1·level to omegaExponent, and grant Omega-skip. Feeds out: P powers the permanent parameter shop that defines your next runs' r growth; Omega count is the dominant in-family growth term; prestigeNum/dailyPrestige feed achievements and stats. Tension: pending p keeps accruing at ∛r, but pushing r higher for the next Omega level means delaying the P bank — and Prestiging surrenders all Omega levels.

### Pacing & gating

First Omega at r = 1000 (minutes into a run); story beats fire on the first three Omega prestiges. P is meaningful once dp/dt is non-trivial: at r = 10⁹ you earn 0.01 p/s (first shop items cost 1–10 p), at r = 10¹⁵, 1 p/s. Early walls are Omega thresholds (10⁶ → 10⁹ → 10¹³); mid-game walls are the ×10-ratio P upgrades; α/β (10²¹/10²⁴ base, 400 levels) are the long-tail sink. Automation is gated one tier up: auto-Prestige (player types a pending-p threshold) and auto-Omega (fires instantly when eligible) both require Tornado unlocks.

### Borrowable design lessons

1. **Accrue prestige currency as a rate (∝ r^(1/3)/const), not a reset-time snapshot** — "when to reset" becomes a rate-vs-rate judgment, idle time always pays, and offline progress is the same integral.
2. **Root-compress the meta currency** — the cube root maps ~45 orders of magnitude of run currency onto ~15 of prestige currency, keeping shop prices legible for the whole game.
3. **Match a quadratic-exponent cost to a quadratic-exponent reward** (10^(L(L+1)/2) gate vs 1.25^(L(L+1)) payoff) — the inner loop self-terminates without hard caps and naturally schedules the outer reset.
4. **Pay soft resets in both base and exponent of one term (ω and E in ω^E)** — hyper-multiplicative growth makes each single level feel transformative; in an RPG, let rebirth raise a stat's multiplier *and* the power it's raised to.
5. **Sell skip tokens, not just numbers** — challenge rewards that let the inner reset restart at level N convert side content into permanent friction removal.
6. **Build resets as composed supersets** (`Reset(reset_inner, nextSystem)`) — each tier's wipe-list literally contains the previous tier's; trivially auditable and makes inserting a new tier a one-line change.

---

## Prestige: Tornado, Reactor & Challenges

### 1. What the system is

Idle Spiral's outer progression sits on a three-deep reset stack. The **Tornado** is the game's "big" prestige: when the spiral's radius `r` (the core currency) passes a threshold, the player wipes the spiral, all r-bought upgrades, the inner prestige layer, and all prestige-point upgrades in exchange for a permanent **tier** `T` that multiplies everything and unlocks new content. **Challenges** are constraint runs entered *through* a tornado-grade reset: play the wiped game under a handicap, hit a goal, earn a small permanent multiplier per completion. The **Reactor** is not a reset at all — it is a persistent engine (unlocked alongside tornado tiers) where the player *allocates their per-second `z` income* into eight reactors that convert throughput into stat buffs and slowly gain their own levels.

### 2. The math

**Layer stack (from `IdleSystem.SetProperty`, nested `Reset` objects):**

| Layer | Resets | Persists |
|---|---|---|
| Soft prestige | `r`, r-costed upgrades | everything else |
| Prestige (Ω) | above + soft-prestige state | prestige points `P` |
| Tornado | above + prestige layer + P-costed upgrades | tier `T`, banked hours, banked max-`P`, challenge levels, reactor state |
| Challenge entry | executes the full Tornado reset (no tier gained) | same as Tornado |

**Tornado thresholds** (`TornadoPrestige`): first tornado requires `r ≥ 999×10¹²`; afterward the button is always available, but a tier is only gained if the next threshold was reached this run:

- `Threshold(T) = 9.99×10¹⁴ · 1000^T · c`, where `c = 1 − 0.1·L_drain` (Drain challenge, max L=5 → half cost).

**Tornado reward** (`TornadoPrestigeReward.ApplyEffect`). Three factors compound: tier, lifetime playtime, and best prestige-point bank. With `H(h)` the hour factor, `P* = AccumulatedMaxP`, `Q = 1 + 0.1·log₁₀(P*+1)`:

- `Δr, Δz multiplier = (1 + 0.5T) · (1 + H) · Q` (multiplicative)
- `Regen while resting = (1 + 0.1T) · (1 + H) · Q`
- Equation coefficient `a`: `+0.2·T·H·Q` (additive to its multiplier)
- Coefficients `b,c,d,e`: `+0.02·T·H·(1 + 0.01·log₁₀(P*+1))`
- Spiral-point gain: `×(1 + 0.01T)`; rare drop `×(1 + 0.01·min(T,100))`; attack speed `×(1 + 0.005·min(T,100) + clamp(0.01(T−100), 0, 10))`

**Hour factor** — piecewise on banked hours `h` (banked at every tornado/challenge: `AccumulatedHour += timeSinceTornado/3600`):

```
H(h) = 0.01h                              h ≤ 100
     = 0.01h + 0.005(h−100)               100 < h ≤ 1000
     = 0.01h + 0.005(h−100) + 0.001(h−1100)   h > 1000
```

Note the marginal rate *rises* (1%/h → 1.5%/h → 1.6%/h): lifetime playtime never stops paying.

**Reactor** (`ReactorContainer`, `Reactor`, `ZForReactor`). The player allocates value `v` of their `Δz`/sec income into a reactor; the allocation is literally subtracted from `z` income (`z gain += −Σv`), creating a hard opportunity cost. Allocation is capped: `Cap = (C₀ + g·ℓ_up) · z_reactor_cap`, where the capacity upgrade costs `z`: `Cost(ℓ) = B·f^ℓ`. Each reactor also has a passive **reactor level** `L` fed by `EXP += v·dt·z_reactor_exp`, with linear requirement `k·(L+1)` — i.e., passive power accrues at the rate you keep the reactor filled.

| Reactor | C₀ (cap) | g /lvl | B (cost) | f | max ℓ | EXP req k |
|---|---|---|---|---|---|---|
| r | 100 | 100 | 100 | 1.5 | 99 | 1,000 |
| line | 500 | 500 | 1,000 | 1.5 | 99 | 2,000 |
| equation | 1,000 | 1,000 | 3,000 | 1.5 | 199 | 5,000 |
| battle | 5,000 | 5,000 | 7,500 | 1.5 | 199 | 10,000 |
| crit | 10⁹ | 10⁹ | 10¹⁰ | 1.75 | 199 | 10¹⁰ |
| s-crit | 10¹⁵ | 10¹⁵ | 10¹⁶ | 2.0 | 199 | 7.5×10¹⁶ |
| study | 10¹² | 10¹² | 10²⁴ | 2.25 | 199 | 10¹⁴ |
| loot | 10¹⁵ | 10¹⁵ | 10³⁰ | 2.5 | 199 | 10¹⁶ |

Active effects (of allocated `v`) use deliberately varied curves: `Δr ×(1+0.01v)` (linear); line count `×(1+0.01v^1.8/25000)`; equation speed `×(1+0.01v^1.5/20000)`; HP/ATK/DEF `×(1+0.01v³/10¹⁴)` (cubic!); crit chance `+0.01·Σ_{k=1}^{n} k^{−1/2}`, `n=⌊v/10⁹⌋` (diverging slowly); super-crit `+0.01·⌊v/(2×10¹⁶)⌋` (step); study `×(1 + 3v²/(10²⁴+v²))` (Hill/sigmoid, saturates at ×4); loot `×(1+Σ_{k=1}^{n} k^{−2})`, `n=⌊v/(2×10¹⁵)⌋` — a Basel-sum hard-capped at `1+π²/6 ≈ 2.645`. Passive effects use two library soft-caps: `LogDecay_{θ,b}(x) = x` for `x≤θ`, else `θ + ln(1+b(x−θ))`; and `RootDecay_{θ,ρ}(x) = x` for `x≤θ`, else `θ^{1−1/ρ}·x^{1/ρ}` (e.g., battle passive: `1 + RootDecay_{5,2.5}(0.1L)`; r passive: `1 + LogDecay_{2,0.5}(0.001L)`).

**Challenges** (`ChallengeContainer`, `ChallengeManager`). Starting one triggers `tornado.OnChallenge()` (full reset, hours banked, no tier). Success ⇒ `level++` and eject; fail/cancel ⇒ eject with nothing. Most cap at 5 levels; Basic 10, Fury 6, Root/Frenzy 9, infinite Gluttony 11. Some forbid all prestiges during the run (SinSpiral, Drain, NoRebirth). Sample goals: Basic `r ≥ 9.99×10¹⁴·10^L`; Drunk `r ≥ 10⁶·9.99×10¹⁴·1000^L`. Per-level permanent rewards (all from `ApplyEffect`): Basic `Δr ×(1+0.5L)`; SlowSpiral `ω ×(1+0.1L)`; Drain tornado cost `−10%/L`; Gluttony ATK/HP/DEF `×(1+0.2L)` +×2 ATK on completion; Sinkhole `Δr ×(1 + ln(t/13+1)/ln(10−L))` (a *time-since-prestige* ramp whose log base shrinks with level); PoorMath `Δr ×(a·b·c·d·e·f·g)^{1/11}` (self-referential); late "Professor" challenges add `+0.01L` to the *exponents* of parameters b/c/d/e — exponent inflation as the endgame reward tier.

### 3. Interconnections

Tornado tiers are the master unlock key (see §4) and multiply `Δr`, `Δz`, equation coefficients, combat, drops, and spiral points. The reward formula pulls from the layer below (`log₁₀ P*` from prestige points) and from real time (banked hours), so the tornado layer feeds on both sub-layer engagement and lifetime commitment. Challenges consume a tornado reset (tension: a challenge run is a run not spent tiering) and pay back into base rates, combat, and even tornado cost itself (Drain). The Reactor taxes live `Δz` income — every point allocated is `z` not spent on upgrades — while sphere-challenge levels buff reactor EXP (`×2`) and caps (`+5%/L`), tying constraint runs back into the engine.

### 4. Pacing & gating

First tornado at `r = 999T`; each tier costs ×1000 more `r`, but rewards grow superlinearly (linear tier term × hour factor × log-P term), so early tiers come in quick succession, then settle into a rhythm. Tiers 1–45 unlock something nearly every single tier — challenges at T1/3/5/7/9/11/14/15/18/20/24/31/38, automation at T2 (auto-Ω) and T6 (auto-prestige), the equation system at T4, new enemies at T8/12/16/25/30/41, reactors 5–8 at T23/26/33/35, crit at T17, super-crit at T37. Then the ladder deliberately stretches: infinite challenges at T45–85 every 5 tiers, "Another Spiral" at T100, FixPoint at T120. Per-tier attack speed switches from +0.5% to +1% past T100 — a small acceleration exactly where the wall grows.

### 5. Borrowable design lessons

- **Bank real playtime into the prestige multiplier** (`H(h)` with rising marginal brackets): every hour ever played permanently strengthens each reset — retention math the player can feel, immune to reset regret.
- **Make prestige gain compound three sources** (tier × lifetime time × log of best sub-currency): the player always has three levers to improve the next reset, so no single stalled system stalls the loop.
- **Reset-as-entry-fee challenges**: reusing the top reset as the price of admission for constraint runs gives one mechanic double duty and makes each challenge a genuine strategic trade against tiering.
- **Income allocation, not stockpile spending** (Reactor): buffs that subtract from a *rate* create a continuously felt opportunity cost and a satisfying "engine tuning" minigame — ideal for a 3D game where allocation can be spatial.
- **A curve zoo with shared soft-cap primitives**: linear, power, cubic, step, Hill, and convergent-series actives, all passively capped by two reusable functions (`LogDecay`, `RootDecay`) — variety for the player, two audited formulas for the designer.
- **One-unlock-per-tier ladder, then spaced spikes**: granting a named unlock at nearly every early tier (challenge, enemy, automation) turns an exponential cost wall into a visible menu of "next thing I get," then intentionally widens spacing (every 5, then 15–20 tiers) as endgame stamina develops.

---

## Equations I: The Curve Gallery, Lap Leveling & Milestones

### 1. What it is

The "Equations" (a.k.a. Spiral Equipment) system is a collectible gallery of ~24 famous parametric curves — hypotrochoids, Lissajous figures, a heart curve, torus knots, even a Klein bottle — each named after a mathematician (Thales, Hypatia, Gauss, Poincaré…). Each unlocked curve you "equip" is literally drawn on screen and traces laps automatically; every completed lap is a level, and each curve's level feeds a permanent multiplier to one specific stat (HP, ATK, crit, offline rewards, prestige constants…). Curves themselves drop as rare loot from specific bosses, so the loop is: fight boss → collect its signature equation → equip it in a limited slot → let it spin laps forever → its level buffs your build.

### 2. The math

**Lap/leveling engine (triangular cost curve).** Each curve is a `TimerForEquation(s, c)` with speed divisor `s` and cost step `c`. Progress accumulates at

- rate = `equation_speed / s` per second (base `equation_speed` ≈ 1, heavily multiplied later)
- cumulative progress required for level `L`: `P(L) = (c/2) · L(L+1)` — lap `n` costs `≈ c·n`
- level from progress (closed form): `L = ⌊(√(1 + 8P/c) − 1)/2⌋`, fractional part drives the on-screen lap angle `θ = 2π·frac(L)`
- time to next lap: `t_next = L·c·(1 − frac)/rate`, so `L(t) ≈ √(2·rate·t/c)` — levels grow with **√time**, an automatic self-slowing curve with no hard cap.

**Per-curve constants and bonuses** (`SpiralEquipmentContainer.cs`; L = level):

| Curve (buffs) | s | c | Bonus formula |
|---|---|---|---|
| thales (HP), Hypatia (DEF), archimedes (ATK) | 10/30/60 | 2/6/12 | `1 + 0.04L` (+0.001/L extra past L=1000) |
| pythagoras (crit dmg) | 120 | 24 | `1 + 0.05L` (+0.001/L past 1000) |
| euclides (crit) | 100 | 20 | `1 + log₁₀(0.1L + 1)` |
| eratos (atk speed) | 100 | 10 | `1 + log₁₀(L + 1)` |
| Aryabhata (super-crit) | 300 | 60 | `1 + log₁₀(0.05L + 1)` |
| brahmagupta (**equation_speed itself**) | 100 | 10 | `1 + log₁₀(L + 1)` |
| khuwarizmi/omar/bhaskara/madhava (HP/ATK/DEF/EXP drop mult) | 100 | 70 | `1 + 0.01L` (+0.0001/L past 1000) |
| Alhazen / Pascal (reactor EXP / cap) | 100 | 50/85 | `1 + LogDecay(0.001L; T=0.8/0.1, b=0.3)` |
| Riemann / Kurt (all designs active/passive) | 200/300 | 500/1000 | `1 + LogDecay(10⁻⁵L; T=0.01, b=0.9)` |
| Diophantus (all battle rewards) | 350 | 300 | `1 + LogDecay(0.001L; T=0.5, b=0.3)` |
| Schrodinger (math₂) / Maxwell (combo) | 400/500 | 400/500 | `1 + LogDecay(0.001L or 10⁻⁵L; T=3/1, b=0.5)` |
| William (omega) | 1000 | 1000 | `1 + LogDecay(10⁻⁶L; T=0.03, b=0.5)` |
| Andre…Gabriel (spiral constants a–g, 7 curves) | 750 | 500 | `1 + RootDecay(10⁻⁴L; T=3, k=3)` |
| Kolmogorov (constant k, **exponent-level**) | 3000 | 3000 | adds `RootDecay(10⁻⁴L; T=1, k=3.5)` to the *exponential* multiplier |
| your_spiral (non-raid debuff) | 100000 | 100000 | `1 − min(RootDecay(10⁻⁴L; T=0.1, k=3.5), 0.9)` |
| gauss / poincare / cantor (mega-crit/-dmg) | 10⁶/10⁵/10⁵ | 10⁶/10⁵/10⁵ | `1 + LogDecay(10⁻⁵L; T=0.01, b=0.9)` |

**Softcap primitives** (idlelibrary `Formula.cs`): `LogDecay(x; T,a,b) = x` if `x ≤ T`, else `T + a·ln(1 + b(x−T))`; `RootDecay(x; T,k) = x` if `x ≤ T`, else `T^(1−1/k)·x^(1/k)`. Linear until threshold, then log/k-th-root — every late-game curve bonus passes through one of these.

**Milestones** (`EquationMilestone.cs`): total level Σ across all curves hits 20 thresholds {10, 20, 30, 40, 50, 100, 200, …, 50000}; odd ones multiply `equation_speed`, even ones `offline_battle_reward`, values ramping ×1.01 → ×1.07. Full completion compounds to ≈ ×1.39 each.

**Slots**: simultaneously running curves = `1 + equation_slot`, where `equation_slot` gains +1 from each of ~7 challenge completions and additive levels from an Infinite Spiral upgrade.

**Geometry gallery** (what actually renders): hypotrochoid `x=(R−r)cos(Nθ)+d·cos(N(R−r)θ/r)` with period normalizer `N = lcm(R,r)/R` and amplitude normalized by `X(0)`; EquationB family `x=(cos(at)−cosʲ(bt))/2, y=(sin(ct)−sinᵏ(dt))/2`; Lissajous `x=a·sin(at+δ), y=b·sin(bt)`; heart `x=16sin³t, y=13cos t−5cos 2t−2cos 3t−cos 4t`; rose `r=a·cos((n/d)θ)` (full trace at `θ=2πd`); (p,q) torus knot scaled by `1/(R+r)`; piecewise Klein-bottle immersion at scale 0.15. The dev even shipped a brute-force tool (`CreateEquationData.cs`) enumerating all (a,b,c,d) ∈ [0,10)⁴ by GCD to bucket period classes. The `your_spiral` curve rolls per-player random frequencies in [1,10]² from a saved seed — a literally unique spiral per save.

### 3. Interconnections

Fed by: **battle** (boss-specific drop classes like `Tier1_Reward`→thales, `Alpha_NewReward`→archimedes; drops only exist at Tornado-prestige tier ≥ 4, else `EquationReward.MakeReward` substitutes an EXP reward worth 2→50,000, which is also the duplicate-drop consolation); **battle upgrades** 25–28 maxed hard-unlock curves 8–11, tornado-prestige unlocks grant Alhazen/Pascal (`EquationUnlock.cs`); `equation_speed` is multiplied by reactors, designs, loot (`+0.001·U(1,25)` rare drops), battle-reward #44 `1 + RootDecay(x; 3, 3.8)`. Feeds: nearly every combat stat, prestige-layer constants a–k, and — via brahmagupta and milestones — **itself**. Tension: limited slots force choosing which curves level now, and slower expensive curves compete with cheap fast ones for slot time.

### 4. Pacing & gating

Early curves (s=10, c=2) lap in seconds; endgame gauss (s=10⁶, c=10⁶) needs `n·10¹²/equation_speed` seconds per lap — intentionally absurd until multipliers compound. Walls: prestige-tier-4 gate on all drops, boss-kill RNG per curve, maxed-battle-upgrade gates, and the √time level curve itself. Linear bonuses (+4%/level) carry early curves; every post-midgame bonus is log/root-softcapped so no single curve dominates.

### 5. Borrowable design lessons

1. **Make progress literally visible as geometry** — a lap of a drawn curve = 1 level turns an abstract timer into a watchable, collectible art object; in 3D, orbiting sigils/constructs around the character would do the same.
2. **Triangular cost + continuous rate** gives √time growth with a closed-form inverse — cheap to compute offline progress exactly, no iteration.
3. **One curve buffs the system's own speed** (brahmagupta) — a contained feedback loop players love hunting for.
4. **Two reusable softcap primitives** (linear-then-log, linear-then-root with a threshold `T`) let you tune 20+ bonuses with just (T, b/k) pairs.
5. **Duplicates auto-convert to a scaled consolation currency** — RNG collection without dead drops.
6. **A per-player seeded "your_spiral"** — one procedurally unique collectible among fixed ones creates ownership at near-zero content cost.

---

## Equations II (Equipment): Acquisition, Drop Rates & Effect Curves

### 1. What it is

Idle Spiral's "equipment" is the **Equation system** (`SpiralEquipmentContainer`): 32 collectible mathematical curves, each named after a mathematician (Thales, Pythagoras, ... Gauss, Cantor). An equation is simultaneously a visual object (the curve literally gets drawn in the game, point-by-point) and a passive stat item. The player **equips** equations into a small number of slots; an equipped equation's timer fills continuously and converts into **levels**, and each equation's level drives one permanent stat multiplier (HP, ATK, crit, reward gain, etc.). The loop is: acquire equations from bosses/prestige → choose which few to slot → let them train over hours → their multipliers feed combat, which unlocks harder bosses that drop rarer equations.

There are no random stat rolls or rarity tiers on items — every equation is a unique, fixed-effect artifact; "rarity" is expressed entirely through drop rate and how slowly it levels.

### 2. The math

**Leveling (train-while-equipped).** Each equation has two constants: speed divisor `s` and cost slope `c`. While equipped, progress accumulates at

```
dP/dt = v / s        where v = equation_speed (global parameter, base 1.0)
```

Cumulative progress to reach level `L` is a **triangular-number curve** (cost of the L-th level is `c·L`, linear):

```
P(L) = (c/2) · L · (L+1)      ⇒      L(P) = ⌊(√(1 + 8P/c) − 1) / 2⌋
```

The fractional part is stored (shown as the spiral drawing itself; progress angle = `2π·frac`). Time from 0 to level `L` and asymptotic level over time:

```
T(L) = s·c·L(L+1) / (2v)          L(t) ≈ √(2vt / (s·c))
```

So each equation levels with **√t** — fast at first, self-decelerating forever, no hard cap. The product `s·c` is the item's effective "weight":

| Equation | s | c | s·c | Stat | Effect f(L) (multiplier) |
|---|---|---|---|---|---|
| thales | 10 | 2 | 20 | HP | `1 + 0.04L` (post-1000: `+0.001/L`) |
| Hypatia | 30 | 6 | 180 | DEF | same shape, 0.04 |
| archimedes | 60 | 12 | 720 | ATK | same shape, 0.04 |
| pythagoras | 120 | 24 | 2 880 | Crit dmg | `1 + 0.05L` (kink at 1000 → 0.001) |
| euclides | 100 | 20 | 2 000 | Crit chance | `1 + log₁₀(0.1L + 1)` |
| eratos | 100 | 10 | 1 000 | Attack speed | `1 + log₁₀(L + 1)` |
| Aryabhata | 300 | 60 | 18 000 | Super-crit | `1 + log₁₀(0.05L + 1)` |
| brahmagupta | 100 | 10 | 1 000 | **equation_speed** | `1 + log₁₀(L + 1)` (self-accelerating) |
| khuwarizmi/omar/bhaskara/madhava | 100 | 70 | 7 000 | HP/ATK/DEF/EXP reward | `1 + 0.01L` (kink 1000 → 0.0001) |
| Alhazen | 100 | 50 | 5 000 | Reactor EXP | `1 + LD(0.8, 0.3)(0.001L)` |
| Pascal | 100 | 85 | 8 500 | Reactor cap | `1 + LD(0.1, 0.3)(0.001L)` |
| Riemann / Kurt | 200/300 | 500/1000 | 1e5/3e5 | Design active/passive | `1 + LD(0.01, 0.9)(10⁻⁵L)` |
| Diophantus | 350 | 300 | 1.05e5 | ALL rewards | `1 + LD(0.5, 0.3)(0.001L)` |
| Schrodinger | 400 | 400 | 1.6e5 | Math-2 gain | `1 + LD(3.0, 0.5)(0.001L)` |
| Maxwell | 500 | 500 | 2.5e5 | Combo mult | `1 + LD(1.0, 0.5)(10⁻⁵L)` |
| William | 1000 | 1000 | 1e6 | Omega | `1 + LD(0.03, 0.5)(10⁻⁶L)` |
| Andre…Gabriel (7 items, stats a–g) | 750 | 500 | 3.75e5 | Alphabet stat | `1 + RD(3, 3)(10⁻⁴L)` |
| Kolmogorov | 3000 | 3000 | 9e6 | **k's exponent** | `+ RD(1, 3.5)(10⁻⁴L)` (additive to exponential multiplier) |
| your_spiral | 1e5 | 1e5 | 1e10 | Non-raid debuff | `1 − min(RD(0.1, 3.5)(10⁻⁴L), 0.9)` |
| gauss | 1e6 | 1e6 | 1e12 | Mega-crit | `1 + LD(0.01, 0.9)(10⁻⁵L)` |
| poincare / cantor | 1e5 | 1e5 | 1e10 | Mega-crit dmg | same LD |

Weight spread from first to last item: **20 → 10¹²**, absorbed by the growth of `equation_speed`.

**The two softcap primitives** (from `Formula.cs`, shared library):

```
LD(T, b)(x) = x                          if x ≤ T        (log decay)
            = T + ln(1 + b·(x − T))      if x > T

RD(T, r)(x) = x                          if x ≤ T        (root decay)
            = T^(1−1/r) · x^(1/r)        if x > T
```

Every late-game effect is `f(L) = 1 + LD/RD(k·L)`: **linear until a designed breakpoint, then logarithmic or r-th-root forever**. Examples: Diophantus gives +0.1%/level of all rewards, linear to +50% (L = 500), log after; Maxwell is linear to +100% at L = 100 000; Kolmogorov raises stat *k*'s exponent linearly until L = 10 000, then as `L^(2/7)` — an exponent buff kept deliberately sub-linear. The early HP/DEF/ATK items instead use a **slope kink**: slope 0.04 for 1000 levels (up to ×41), then slope 0.001 — a 40× nerf rather than a cutoff.

**Slots.** Equipped count = `base + equation_slot` (base 1 in domain logic, 2 in the selection UI). `equation_slot` starts at 0; +1 each from the Exponentiation challenge and from completing each of six infinite/prestige challenges, plus a variable-upgrade line (+1/level). Slot capacity is the scarcest resource in the system.

**Milestones.** Σ(all equation levels) crosses 20 thresholds — 10, 20, 30, 40, 50, 100, 200, 300, 400, 500, 1000, 2000, ..., 50 000 — alternating rewards ×(1.01→1.07) to `equation_speed` (odd) and offline battle reward (even). Total ≈ ×1.5 to both fully cleared.

**Acquisition & drop rates.** Thales/Hypatia are free. Equations 2–7 are boss-reward drops, but **only after the player reaches Tornado-prestige tier 4** — before that the reward table silently substitutes an EXP payout (2–50 000 EXP scaled by boss). Four mid items require maxing specific battle upgrades; two are direct prestige-tree unlocks. Endgame items are ultra-rare loot from Theory bosses:

| Item | Source boss | Per-kill drop chance |
|---|---|---|
| Andre…Gabriel (each) | Alphabetician | 10⁻⁵ |
| Kolmogorov | Alphabetician | 10⁻⁷ |
| gauss | AnotherSpiral | 10⁻⁷ |
| poincare | FixPoint | 10⁻⁴ |
| cantor | FixPoint | 10⁻⁸ (before drop-rate multipliers) |

Duplicates are impossible: each drop entry is removed from the table once owned. The `your_spiral` item generates its curve from a per-save random seed (`SpiralCurve(U(1,10), U(1,10))`) — every player's copy is a visually unique spiral.

### 3. Interconnections

**In:** `equation_speed` (fed by common loot drops of +0.001, brahmagupta's own effect `1+log₁₀(L+1)`, milestones, design bonuses) sets all leveling rates; challenges/prestige feed slots; bosses and Tornado prestige feed acquisition. **Out:** equations multiply nearly every other subsystem — core combat stats, reward multipliers, the Z-reactor, the Design system, combo, the a–g alphabet stats, and (Kolmogorov) an exponent itself. **Tension:** with ~32 items and only a handful of slots, the player constantly triages: train the stat needed *now* versus park long-horizon √t growers; and since unequipped items freeze, every slot-hour is an opportunity cost.

### 4. Pacing & gating

Early: two free items, small weights (s·c = 20–720), levels arrive in seconds-to-minutes; the linear 0.04/level region gives crisp ×41 power ramps. Mid: acquisition switches to achievement-style gates (max an upgrade line, clear challenges), weights grow 10³–10⁵, and the level-1000 slope kink plus LD breakpoints (L = 100–3000) form the walls. Late: 10⁻⁵–10⁻⁸ drop rates make *acquisition itself* the endgame chase, while weights of 10¹⁰–10¹² mean even owning gauss starts a months-long √t climb. The Tornado tier-4 gate cleanly hides the whole collectible layer from early players without separate content.

### 5. Borrowable design lessons

1. **Train-while-equipped with √t leveling.** `L(t) = √(2vt/(s·c))` from a linear cost slope gives every item an exciting start and a graceful, capless taper — no per-item balancing of caps needed, just pick one weight `s·c`. Ideal for a 3D game's "attuned relic" slots.
2. **Two-primitive softcap library.** Standardize all effects as `1 + LD(T,b)(kL)` or `1 + RD(T,r)(kL)`: the designer tunes exactly where linear growth ends (T/k levels) and how brutal the tail is (b or r). One audited formula, thirty balanced items.
3. **Slots as prestige/challenge rewards.** Making +1 equipment slot the trophy for hard optional content is a stronger motivator than raw stats — it multiplies *choice*, not just numbers.
4. **Milestones on the sum of all item levels.** Rewarding Σ levels (×1.01–1.07 to training speed) makes even off-meta items worth rotating in, and creates a self-accelerating meta-loop (equipment levels speed equipment leveling — as does brahmagupta, an item that buffs the leveling system itself).
5. **Uniqueness instead of rarity tiers.** Every drop is a named one-off, removed from the loot table once owned; "legendary" is expressed by a 10⁻⁷ chance and a 10⁶× training weight rather than an orange border. In a 3D game, pair this with each item having a distinct visible form (here: the literal curve geometry).
6. **A seeded personal item.** `your_spiral` rolls its shape from the save's RNG seed — a zero-cost "no two players have the same one" moment worth stealing for 3D (procedural weapon/companion geometry from the save seed).
7. **Late-substituting reward tables.** Before the unlock tier, rare drops silently become currency payouts — the loot table never feels empty, and the collectible layer reveals itself only when the player can use it.

---

## Spiral Designs & Effects

### 1. What the system is

"Designs" are 40 collectible skins for the spiral itself — the literal line the player grows. Each design re-textures/re-colors the spiral (and often swaps the whole background scene), but every skin is also a stat item: owning it grants a permanent **passive** bonus, and slotting it into a limited number of **active** slots grants a much larger bonus. The player separately chooses which design to *wear* (pure cosmetics, drives the renderer) and which to *activate* (drives the math), so fashion and function are decoupled. The loop: earn/buy/win designs → grow your collection for milestone rewards → juggle 1–3 active slots to match your current bottleneck (growth, combat, prestige currency, drops).

### 2. The math

**Core effect formula.** Every design effect is a multiplier (or flat add) registered on one of the game's global parameters. For non-DLC designs:

- Active (design is in a slot): `effect = base_A · G_A · E_A(id)`
- Passive (design is merely owned): `effect = base_P · G_P · E_P(id)`

where `G_A = design_active_all` and `G_P = design_passive_all` are global amps (both start at 1.0) and `E_A/E_P` are per-design amp hooks (default 1.0). **DLC designs replace `G` with a soft-capped `S(G)`** using the shared log-decay curve (`Formula.GetLogDecayCurve`, threshold 1.2, b = 0.1):

```
S(x) = x                          if x ≤ 1.2
S(x) = 1.2 + ln(1 + 0.1(x−1.2))   if x > 1.2
```

i.e. paid designs deliberately scale *worse* with global amps than earned ones — an anti-pay-to-win clamp.

**Full effect table** (× = multiplier, + = flat add; A = active/slotted, P = passive/owned):

| # | Design | Target parameter | Active | Passive |
|---|--------|------------------|--------|---------|
| 0–4 | normal (5 colors) | spiral coefficients a, b, c, d, e | ×1.1 | — |
| 5–7 | gradation ×3 | HP / ATK / DEF | ×1.5 | ×1.1 |
| 8 | gradation violet-pink | crit chance | ×1.05 | ×1.01 |
| 9 | gradation white-cyan | crit damage | ×1.2 | ×1.05 |
| 10 | circles white | regen while resting | ×3.0 | ×1.5 |
| 11, 12 | circles ×2 | regen-resting + DEF (or ATK) | ×1.5, ×1.3 | ×1.1, ×1.05 |
| 13 | dotted blue | line number mult | ×2.0 | ×1.25 |
| 14, 15 | dotted ×2 | line mult; +a,b,c (or d,e,f) | ×1.25 | ×1.1; ×1.05 each |
| 16–18 | stripe ×3 | v / reward ATK / reward DEF | +5.0 | +2.0 |
| 19 | sine green | reward EXP | +3.0 | +1.0 |
| 20 | sine white-red | reward EXP mult | ×1.1 | ×1.03 |
| 21 | sine orange-purple | HP, ATK, DEF (all three) | ×2.0 each | ×1.3 each |
| 25 | pi | Ω (prestige) | ×1.5 | ×1.2 |
| 26 | rects | reward EXP mult | ×1.05 | ×1.03 (no G_P amp) |
| 27 | rainbow (DLC-curve) | equation speed | ×2.0·S | ×1.5·S |
| 28 | kanji | δ; +1 equation slot | ×2.0 | +1 slot |
| 29 | rahmen | γ | ×1.5 | ×1.2 |
| 30 | lazer | Z-reactor EXP | ×1.5 | ×1.2 |
| 32, 33 | seigaiha / sippou | α / β | +0.025 | +0.01 |
| 34 | lame | enemy growth | ×0.9 (flat) | ×0.95 (flat, no amps) |
| 22 | snake (DLC) | super-crit chance | +0.16·S | +0.06·S |
| 23 | bubble (DLC) | rare drop | ×2.0·S | ×2.0·S |
| 24 | arrow (DLC) | attack speed | ×1.2·S | ×1.1·S |
| 31 | spaceShip (DLC) | ω | ×1.1·S | ×1.1·S |
| 35 | water (DLC) | line refill; atk speed; Z-cap | ×1.5·S | ×(1+0.25ρ)·S; ×1.25·S |
| 36 | bonfire (DLC) | reward-all | — | ×1.2·G_P·B(t) |
| 37 | mosaic (DLC) | +1 design slot; design_passive_all | ×1.1 | +1 slot |
| 38 | rail (DLC) | +2·G_P equation slots; atk speed | — | ×R(t)·S |
| 39 | glass (DLC) | mega-crit; rare loot; legendary | — | +0.01·S+Gl(t); ×(1+0.5·S); ×(1+0.25·S) |

**Time-grown DLC effects** (exp accrues in real seconds only while the design is slotted; all use `LDC_T(x) = x if x≤T else T + ln(1+0.1(x−T))`):

| Design | Effect formula | Time to softcap |
|--------|----------------|-----------------|
| bonfire | `B(t) = 1 + LDC₄(t / 90 days)` on reward-all | 360 days → ×~5 then log |
| rail | `R(t) = 1 + LDC₂(t_w / 300 days)`, `t_w` accrues ×(equipped-gear count)/s | 600 weighted days → ×3 |
| glass | `Gl(t) = LDC₀.₀₅(t / 6000 days)` added to mega-crit chance | +5% after 300 days |

**Water's ρ** = `x_value / Interval` — the live fill fraction of the current spiral line, so its attack-speed passive literally breathes with the geometry.

**Collection milestones** (count = number of designs owned): at 10/11/…/16 owned → ×1.1 to spiral coefficients a…g respectively; 17 → ×1.5 k; 18 → ×1.1 γ; 19 → ×1.1 δ; **20 → ×1.05 design_active_all; 25/30/35 → ×1.01 design_passive_all each** (the collection amps itself).

**Amp feeders**: `design_active_all` is also fed by the Riemann equation (`×(1 + LDC₀.₀₁(level·10⁻⁵))`, b = 0.9) and `design_passive_all` by the Kurt equation (same curve), plus mosaic's active ×1.1.

**Active slots**: `maxDesignCount` base = 1, +1 from mosaic passive, +1 from a Theory at level ≥ 100 → max 3. Activating pushes onto a FIFO: new design enters slot 0, older ones shift down and fall off.

Note: designs do **not** change the spiral's curve equation — polar-curve variety (Lissajous figures, etc.) lives in the separate Equation system; designs are skins-with-stats layered on whatever curve is drawn.

### 3. Interconnections

Designs touch nearly every subsystem: spiral growth coefficients (a–g, v, line count/refill), all combat stats (ATK/HP/DEF/crit/super/mega-crit/attack speed/regen), battle rewards (EXP, reward-ATK/DEF, reward-all, rare/legendary drops), four prestige-ish currencies (α, β, γ, δ, ω, Ω), the Equation minigame (speed, slots), and the Z-Reactor (EXP, cap). Inputs: designs 5–21 cost **Spiral Points** (Infinite Spiral shop, one-time costs 300/300/300/300/300 → 400×3 → 500×3 → 1000×3 → 2000×3, fully refundable via respec) — the *same* pool that buys automation QoL (1000–2000 each), creating a comfort-vs-power tension. Designs 25–34 are **challenge completion rewards** (nine restriction challenges: basic, drunk, SinSpiral, SlowSpiral, StraightLine, poorMath, no_rebirth, sinkhole, sphere). Nine more are paid Steam DLC.

### 4. Pacing & gating

Five plain-color designs are free from the first session (small ×1.1 taps on growth coefficients). The 17 shop designs gate on reaching the Infinite Spiral layer and earning points; their fixed costs step 300→2000, a gentle ~6.7× ladder rather than exponential. Challenge designs arrive mid-late game and carry the prestige-currency multipliers (Ω, γ, δ), tying build power to skill-gated content. Collection milestones (10→35 owned) convert breadth into power and require buying "useless" designs too. The time-grown DLC designs are month-scale slow burners with log softcaps — deliberately unable to warp balance, but rewarding loyalty. The 1→3 slot cap is the real wall: with 40 designs and 3 slots, choosing between ×2 all-combat (sine 21), ×2 line count (dotted 13), or ×1.5 Ω (pi) is a genuine per-phase decision.

### 5. Borrowable design lessons

1. **Cosmetics with teeth, wear ≠ activate.** Let players equip one skin for looks and different ones for stats — you sell fashion without forcing suboptimal play, and every skin stays relevant forever via passives.
2. **Own-for-passive / slot-for-active.** Every collected item grants a small permanent bonus; a tiny slot cap (1–3) gates the big versions. Collection feels lossless while loadout choice stays sharp.
3. **Two global amps that other systems feed.** `active_all` and `passive_all` knobs let late-game systems (equations, milestones) scale the *entire* wardrobe at once — cheap cross-system hooks with one parameter each.
4. **Softcap paid content with a log curve.** `S(x) = x` up to 1.2, then `1.2 + ln(1+0.1(x−1.2))`: DLC bonuses exist but can never compound out of control with global amps.
5. **Collection-count milestones that reward the collection system itself** (20 owned → +5% active amp): breadth becomes a progression axis, and dead items still buy power.
6. **Real-time "bonded" items** (bonfire/rail/glass exp in wall-clock seconds while equipped, log-capped at 90–600 day scales): a retention mechanic that creates attachment to specific gear without runaway numbers — perfect for a 3D game's companion or weapon-mastery system.

---

## Battle: Waves, Upgrades & Rewards

### 1. What it is

Battle is Idle Spiral's auto-combat RPG layer. The player's spiral fights one math-themed enemy at a time (16 total: Training Dummy, Kappa, Alpha… up to "Another Spiral" and "FixPoint"); ally and enemy trade timed attacks, and every kill pays out one slot from a 21-slot randomized reward wheel of **permanent** stat gains. Clearing all 21 slots increments that enemy's *difficulty*, which exponentially rescales the same enemy — so each enemy is its own infinite wave ladder. Rewards feed both battle stats (HP/ATK/DEF/crit) and the core spiral-growth parameters (a, b, c, d, e, k, γ, δ, Ω), making battle a permanent multiplier engine for the rest of the game.

### 2. The math

**Ally base stats** (`ParameterContainer`): HP 100, ATK 10, DEF 1, regen 0/s, crit rate 0.05, crit dmg ×2, super-crit 0 (dmg ×5), mega-crit 0 (dmg ×10⁶), attack speed 1.0. Everything scales via registered add/mul multipliers from rewards, upgrades, and milestones.

**Attack timing** (physics tick Δt = 0.02 s): progress/frame = 0.5·Δt·AS, so *attack period = 2/AS seconds* (base: one hit per 2 s). Progress/frame is hard-capped at 10 → max ≈ 500 attacks/s (AS effectively capped at 1000).

**Damage & crit tiers** (`AllyAttack`, `NormalOnAttack`): one uniform roll n ∈ [0, 10000); check mega → super → crit in order (rate·10⁴ > n). Damage dealt = max(0, X − DEF_enemy) where

- normal: X = ATK; crit: X = ATK·CD; super: X = ATK·CD·SCD; mega: X = ATK·CD·SCD·MCD — tiers stack *multiplicatively* (base ×2, ×10, ×10⁷).

**Enemy base stats** (`EnemyContainer`, HP / ATK / DEF / attacks·s⁻¹):

| Enemy (order) | HP | ATK | DEF | AS |
|---|---|---|---|---|
| Training (0) | 100 | 3 | 1 | 0.3 |
| Kappa (1) | 7×10³ | 50 | 30 | 0.5 |
| Alpha (2) | 10⁵ | 10³ | 200 | 0.5 |
| Beta (3) | 10⁸ | 10⁴ | 10³ | 0.1 |
| Pi (4) | 10¹⁰ | 10⁵ | 10⁴ | 0.05 |
| Gamma (5) | 5×10¹⁴ | 10⁶ | 10⁵ | 0.03 |
| Napier (6) | 2.718×10¹⁸ | 2.718×10⁸ | same | 0.027 |
| VarMan (7) | 1.23×10²² | 0 | 1.23×10¹⁰ | 1.0 |
| Penta (8) | 5.555×10²³ | 5.55×10¹⁵ | same | 0.5 |
| Fibanomnom (9) | 1.12×10³⁸ | 5×10²⁰ | 1.3×10²¹ | 0.5 |
| QuantumQuark (10) | 4×10⁴⁰ | 4.4×10⁴⁰ | same | 0.25 |
| SuperPi (11) | 10⁵⁰ | 10³⁵ | 10³⁰ | 0.25 |
| LineIntegral (12) | 10⁴ | **10⁴⁵** | 50 | 0.4 |
| Alphabetician (13) | 10³⁵ | 10³⁵ | 10³¹ | 0.07 |
| AnotherSpiral (14) | 10¹²⁵ | 10⁷⁵ | 10⁷⁵ | 0.5 |
| FixPoint (15) | 10¹⁵⁰ | 10¹⁵⁰ | 10¹⁵⁰ | 0.5 |

Note the archetype breaks: VarMan (ATK 0 = pure punching bag), LineIntegral (tiny HP, one-shot ATK — dodge/HP check inverted into "you must out-DPS its cadence").

**Difficulty scaling** (`NormalDifficultyApplication`), D = difficulty, g = enemy_growth_reduction (starts 1.0):

- HP(D) = HP₀ · (1+0.05g)^D · (hpReduction/100)  (hpReduction starts 100; an upgrade subtracts 0.1/level)
- ATK(D) = ATK₀ · (1+0.03g)^D,  DEF(D) = DEF₀ · (1+0.01g)^D

Math skill M shrinks g: g-factor = 1 − 0.5·M/5×10⁴ for M < 5×10⁴, else 0.1 + 1.000018326^(−M) (continuous at M=5×10⁴, asymptote 0.1 → up to −90% growth), further multiplied by (1 − DecayCurve₀→0.9(M₂·10⁻⁶)) from a second math stat.

**Reward wheel** (`NewReward` + per-enemy subclasses): 21 slots; slots 1–20 drawn from a seeded weighted lottery P(i)=wᵢ/Σw, slot 21 is a fixed *Equation piece* (feeds the study system). Rarities: common/uncommon/rare. Example weights — Tier 1: hp w=3000, atk w=400, k_mul w=50, a_mul w=11, regene w=10, b/c/d/e_mul & exp w=1 each; Pi tier: flat +500·rand(1, 10+bonus) ATK/DEF at w=10⁴. Free reroll of the wheel (reseeds), plus "reroll until uncommon/rare" buttons — a slot-machine layer on deterministic grinding.

**Difficulty reward bonus** (multiplies every drop): B(D) = (0.98 + 2/(1 + 99·e^(−1.9956·D/200)))·R_mul + R_add — a logistic ramp from ≈1.0 at D=0 to 2.98 as D→∞ (midpoint ≈ D=460); a late QoL upgrade pins it at 2.98.

**Nuke modes** (`PerformanceBattleProgress`): batch factors N ∈ {10, 50, 100, 1K, 10K, 100K}. Attack speed is multiplied by 1/(21·N), but each kill grants the *entire* 21-reward set ×N and D += N. Same throughput, 21·N× fewer simulation events — lag control disguised as a power feature.

**Battle upgrades** (`BattleUpgrades`): 62 upgrades, all cost = C₀·1.05^level, paid in battle EXP (itself a battle drop — closed loop). Representative rows:

| C₀ | Max lvl | Effect per level |
|---|---|---|
| 10 | 100 | HP/ATK/DEF/regen ×(1+0.01L) |
| 100 | 10 | flat +1 to hp/atk/def/exp *reward drops* |
| 200 | 50 | +0.001 crit rate |
| 1,000 | 100 | HP/ATK/DEF ×(1+0.05L) (then 10⁶: 0.10L; 10⁹: 0.20L; 10¹⁶: 0.25L; 10³⁰: 0.40L) |
| 10,000 | 50 | **+1 max level to upgrades #0–23** (meta-cap raise) |
| 10⁷ | 50 | +1 max level to upgrades #25–41 |
| 5×10⁹ | 50/100 | super-crit +0.001, SC dmg ×(1+0.01L) |
| 10³⁵ | 10 | mega-crit +0.0001 |

**Softcaps on stacked lifetime rewards** (`BattleRewardContainer`): with RootDecay(t,r): f(x)=x if x≤t else t^(1−1/r)·x^(1/r):

- Attack-speed reward x: mult = 1+x for x<4, else (17.5x+55)^{1/3} (continuous: both give 5 at x=4).
- Rare-drop chance x: 1 + min(2,x) + 0.05·min(262, x−2) + 0.001·max(0, x−262) — slope 1 → 1/20 → 1/1000.
- RootDecay applied per stat: (3,9) attack-speed₃, (3,3.8) equation speed, (9,3.8) study, (2,4.5) loot, (1,3.5) rare₂, (0.5,5) combo, (0.1,7) non-raid debuff (capped at −90%).

**Combo** (`EffectAttack`): ATK ×(1 + n·CM)·CC^⌊log₁₀(n+1)⌋ where n = consecutive hits (×N under nuke), reset on death/enemy switch.

**Kill milestones** (`BattleMilestone`): global kill count → 28 thresholds from 100 to 3×10⁷ (e.g. 100: +50 ATK; 2,000: crit dmg ×1.1; 50,000: ATK ×1.25; alternating with offline-battle-reward ×1.05 each). **Spiral points**: 0.001·(order+1) SP per kill, hard daily cap 100 SP. Resting regen = 1 + 0.001·MaxHP·regenRest per second.

### 3. Interconnections

In: spiral prestige unlocks battle (2 soft resets) and enemies 5+ (Tornado-prestige unlock items); EXP drops fund battle upgrades. Out: permanent multipliers to the spiral equation parameters (a–g, k up to ×3 stacked tiers, γ, δ, Ω), equation pieces to the study system, loot-system speed/rarity multipliers, spiral points, and enemy-growth-reduction (battle feeding battle). Tension: EXP is one pool across 62 upgrades; time-per-enemy competes with which permanent bonuses you farm; reroll gambles wheel quality against grinding now.

### 4. Pacing & gating

Enemy 1–3 unlock at 100/500/1000 kills of the previous enemy; the rest gate behind prestige layers. Base-stat gaps of 10²–10¹⁵ between tiers force players back to the spiral game to earn multipliers before each new enemy — battle is deliberately *not* self-sufficient. Within an enemy, (1.05)^D HP growth walls each ladder within a few hundred difficulty until Math skill (−up to 90% growth) and the logistic ×2.98 reward ramp are farmed. Auto-restart unlocks at 10,000·(order+1) kills per enemy; nuke batching turns late-game farming from seconds-per-kill into 10⁵ kills per swing. Early cadence: one 2-second attack, kill in ~4 hits; late: 500 attacks/s equivalents fully automated.

### 5. Borrowable design lessons

1. **Reward-wheel-per-kill instead of loot tables**: every kill deterministically advances a visible 21-slot cycle whose *contents* are the RNG (rerollable) — players gamble once per cycle setup, then grind with full information. Great fit for a 3D arena where the wheel is diegetic (altar slots, rune ring).
2. **Difficulty as a per-enemy dial, not a global wave count**: each boss keeps its own infinite (1+k·g)^D ladder with different exponents for HP/ATK/DEF (5/3/1%) — HP outruns damage, so walls feel like "need more DPS," never one-shot deaths.
3. **Meta-upgrades that raise other upgrades' caps** (10k-cost "+1 max level to upgrades 0–23") — converts a finite shop into a layered long-term sink without new content.
4. **Piecewise-continuous softcaps** ((17.5x+55)^{1/3} matched to 1+x at x=4; slope-break tables 1→0.05→0.001) — stacking rewards never becomes worthless, but never breaks the sim; the curves are C⁰-continuous so players never see a cliff.
5. **Batching as a player-facing feature**: nuke mode trades attack animation rate 1/(21N) for ×N bulk rewards — identical math, 10⁵× less CPU; essential pattern for a 3D game where entity count is the real constraint.
6. **Stat-archetype enemies via degenerate stat lines** (ATK 0 tank-check, 10⁴⁵-ATK/10⁴-HP glass cannon): with only four stats you get qualitatively different fights — cheaper than bespoke mechanics and it teaches players to read the stat screen.

---

## Enemies as Stat-Block Rewrites: Crits, Combos & Per-Enemy Rewards

### What it is

Idle Spiral's battle mode pits one persistent "Ally" (the player's fighter, statted from upgradeable global parameters) against a roster of ~16 math-themed named enemies. Both sides fill an attack gauge each 0.02 s tick and swing when it reaches 1. The twist: the game does not tune enemies by giving them gimmick AI — instead, **each enemy swaps in a different stat-block for YOUR character**, rewriting your ATK/DEF/crit/attack-speed formulas for that fight. Kills roll a deterministic, seeded loot table unique to that enemy, whose drops are permanent additive character upgrades.

### The math

**Attack timing.** Progress per 0.02 s tick: ally `Δp = 0.02 · 0.5 · s · m_nuke`, capped at `Δp ≤ 10` (i.e., max 500 attacks/s; a UI flag fires at the cap). Enemy `Δp = 0.02 · v` where `v` is its listed speed, so `v` = attacks/sec. In the Root challenge the manager hard-overrides the ally to `Δp = 0.02/5` — exactly **one attack per 5 s**, ignoring all speed bonuses.

**Three-tier crit cascade.** One roll `u ~ U{0…9999}` checked top-down: Mega if `u < 10⁴·p_M`, else Super if `u < 10⁴·p_S`, else Crit if `u < 10⁴·p_C` (effective chances are therefore nested differences). Damage stacks multiplicatively up the tiers:

| Tier | Damage | Base rate | Base mult |
|---|---|---|---|
| Normal | ATK | — | ×1 |
| Critical | ATK·C | p_C = 0.05 | C = 2.0 |
| SuperCritical | ATK·C·S | param | param |
| MegaCritical | ATK·C·S·M — **except vs LineIntegral: ATK·M** | param | param |

**Combo (EffectAttack).** `ATK_final = ATK_base · (1 + n·k)` where `n` = hits landed this fight, `k` = Combo_Multiplier param (combo only accrues once k > 0). If compound param `c > 1`, multiply again by `c^⌊log₁₀(n+1)⌋` — a step-exponential every order of magnitude of combo count. (A `min(100, exponent)` cap is computed but its result is discarded — the intended cap is dead code.)

**Defense & HP.** Damage is linear subtraction: `dmg = hit − DEF`, fully blocked if ≤ 0. In-battle regen = `regene`/s (base 0); out of battle: `1 + 0.001·MaxHP·regene_resting` HP/s (base resting mult 1), so rest heals ~0.1 %/s of max. `NumberOfAttacksWithstood` increments per survived hit, resets to 0 on death — the win condition for Fortitude.

**Enemy base stats** (scaled by a difficulty factor at spawn):

| Enemy | HP | ATK | DEF | Atk/s | Gimmick |
|---|---|---|---|---|---|
| training | 100 | 3 | 1 | 0.3 | none |
| kappa | 7e3 | 50 | 30 | 0.5 | none |
| a / b | 1e5 / 1e8 | 1e3 / 1e4 | 200 / 1e3 | 0.5 / 0.1 | none |
| pi / gamma | 1e10 / 5e14 | 1e5 / 1e6 | 1e4 / 1e5 | 0.05 / 0.03 | none |
| napier | 2.718e18 | 2.718e8 | 2.718e8 | 0.027 | flavor constants |
| penta | 5.555e23 | 5.55e15 | 5.55e15 | 0.5 | 10-slot loot |
| VarMan | 1.2345e22 | **0** | 1.2345e10 | 1 | harmless piñata |
| Fibanomnom | 1.123e38 | 5e20 | 1.3e21 | 0.5 | slows your attack: `×min(1, 1/(100·E))`, E = nonraid_debuff·debuff_fiba |
| SuperPi | 1e50 | 1e35 | 1e30 | 0.25 | **normal hits deal 0** (crit-only), your crit rates ×(1−nonraid_debuff) |
| QuantumQuark | 4e40 | 4.444e40 | 4.444e40 | 0.25 | enemy_growth_reduction applies |
| LineIntegral | **1e4** | **1e45** | 50 | 0.4 | your ATK/DEF → `log_a(x)`, `a = max(2, 1000·d)`; crit/super rates zeroed, only Megas |
| Alphabetician | 1e35 | 1e35 | 1e31 | 0.07 | your stats **become spiral variables**: HP=a, ATK=b, DEF=c, p_C=log₁₀(d+1)/100, C=1+log₁₀(e+1)/100, p_S=log₁₀(f+1)/100, S=1+log₁₀(g+1)/100; speed ×(1+logdecay(Ω-term)) |
| AnotherSpiral | 1e125 | 1e75 | 1e75 | 0.5 | ATK ×(1+log₁₀ r), speed ×(1+log₁₀(z)/100)·(1+logdecay) |
| FixPoint | 1e150 | 1e150 | 1e150 | 0.5 | endgame wall |

**Challenge stat-swaps** (replace the ally block globally): **Root** — HP=ATK=DEF=`√((HP+ATK+DEF)/3)`, 5 s attack lock; **Frenzy** — ATK forced to 1 with all crits zeroed (only combo scaling can kill); **Fortitude** — ATK=0, MaxHP=`10·regene` (pure survival: withstand N hits); **Fury** — the *enemy* survives lethal blows at 1 HP up to `challenge level` times (kill it `level+1` times over). Challenge ladders reuse the boss ladder at fixed difficulty: Root 9801/39601 (=99², 199²), Frenzy 10 000, Fury 500/25 000, Gluttony 200→400 then 1e5, Fortitude 1e5 with withstand counts 50→200.

**Reward tables.** Each kill fills 21 slots (Pentagram: 10) by weighted lottery over that enemy's candidate list — pick i with `P = w_i/Σw` — the final slot always a themed "Equation" reward (Thales, Archimedes, Pythagoras, Euclid, Riemann, Schrödinger…). Magnitudes are seeded rolls, so a board is deterministic. Flat-stat drops escalate ~×10 per boss tier: Tier1 ATK +U(1,3) → Beta +20·U(1,5) → Pi +500·U(1,10) → Napier +5000·U(1,10) → SuperPi +4e5·U(1,40) → QQ +2e8 → LI +3e9 → FixPoint +1e11·U(1,20). Rare low-weight picks gate meta-systems: crit *chance* only from Fibanomnom — **self-softcapping**: +1e-4 until banked total ≥ 0.05, then +1e-5 (equation_speed likewise drops ×100 after 10 banked); combo and mega-crit rate only from FixPoint (weight 1 vs ~5e7 total ≈ 1-in-50M per slot); loot% from LineIntegral.

### Interconnections & tension

Battle stats are ordinary `ParameterContainer` entries, so spiral-economy upgrades, challenges and battle drops all compound into one sheet; drops feed back into spiral variables (a…g multipliers), closing the loop. Tension: Alphabetician grades your *economy* stats as combat stats; LineIntegral log-crushes raw power so only mega-crit investment matters; Frenzy voids raw ATK so only combo matters.

### Pacing & gating

Enemy HP jumps ~3–5 orders of magnitude per tier (1e2→1e150), while drops scale only ~×10 per tier — each new enemy is a wall farmed via the previous one's rewards. Gimmick enemies are checkpoint exams for specific subsystems (crit build → SuperPi; mega-crit → LineIntegral; balanced stats → Root; combo → Frenzy; survival/regen → Fortitude).

### Borrowable design lessons

1. **Swap the player's stat-block per boss, not the boss's AI** — one decorator per enemy re-derives your sheet (log-transform, variable-substitution, stat-averaging); cheap to build, forces build diversity in a 3D RPG.
2. **Nested one-roll crit tiers with multiplicative stacking** — a single RNG roll and cascading thresholds gives three excitement tiers and clean "invest in rate vs mult" knobs.
3. **Self-softcapping drops** — halve/hundredth a drop's value once the banked total passes a threshold; farming stays rewarding without runaway snowballing.
4. **Deterministic seeded loot boards** — rerolling the seed, not each item, makes loot auditable and enables "reroll the board" as a purchasable feature.
5. **Rest-vs-fight regen split** (`0.1 %·MaxHP/s` only out of combat) — makes downtime a real resource and HP investment double-duty.
6. **Survival-count win conditions** — tracking "attacks withstood, reset on death" turns tank stats into a first-class victory path, not just a defensive tax.

---

## Raid Boss Prototype: Roulette-Drawn Math-Symbol Allies

### 1. What it is

`Domain.RaidBoss` is a self-contained boss-fight mode, separate from Idle Spiral's main `BattleCtrl`/`Ally`/`Enemy` combat: a single **RaidBoss** with an HP/ATK/DEF/attack-speed stat block fights a party drawn onto a **12-slot roulette wheel**. Each wheel slot holds a "symbol ally" — a math symbol (∧, ≡, ∫) with its own stats and a signature action — and only the wedge under the pointer acts. Every time the current ally takes its action, the wheel advances one slot, so the fight is a rotating turn order over a randomly-drawn 12-symbol sequence. Important caveat for the reader: this namespace is a **prototype in this build** — `UnlockManager.IsRaidBossUnlocked()` is hard-coded `true`, no code instantiates `RaidBoss` with live constants, and only 3 of 15 declared symbol IDs are implemented.

### 2. The math

**Tick model.** Both boss and allies use an attack-progress accumulator on Unity's fixed timestep (Δt = 0.02 s):

- `progress += AttackProgressPerFrame` each fixed frame; act when `progress ≥ 1`, then `progress −= 1` (looped, so overshoot banks extra actions).
- Allies: `AttackProgressPerFrame = Δt / T_action` with `T_action = 0.5 s` for every implemented symbol → **1 action per 0.5 s** while on the pointer.
- Boss: `AttackProgressPerFrame` is a free constructor parameter (attack period `T_boss = Δt / p`).

**Damage (`NormalOnAttack`)** — flat-subtraction with a hard block floor:

> dmg = ATK_attacker − DEF_defender;  applied only if dmg > 0 (else fully blocked). HP clamps to [0, MaxHP].

**Symbol ally stat table** (`SymbolAllyFactory`):

| Symbol | LaTeX | MaxHP | ATK | DEF | Period | Action |
|---|---|---|---|---|---|---|
| Logical-and (LAnd) | `\wedge` | 1000 | 10 | 1 | 0.5 s | Plain hit: `max(0, 10 − DEF_boss)` |
| Integral (Int) | `\int` | 1000 | 15 | 3 | 0.5 s | Heals boss +15, then hits for `15 · n − DEF_boss`, where `n = |{prev, next} \ {∫}|` = count of *distinct* neighbor symbol types different from itself, n ∈ {0, 1, 2} |
| Equivalence (Equiv) | `\equiv` | 1200 | 30 | 50 | 0.5 s | No damage; heals the **next** wheel slot by 30 HP |

**The integral's neighborhood math.** ∫ literally "integrates over its neighbors": damage scales with the symbol diversity of the adjacent wedges. With the 12 slots drawn i.i.d. uniform over 3 active types (`SymbolRouletteReRoller.ReRoll`: `slot_i ~ U{active roster}`, `RoleRouletteNumber = 12`):

> P(n=0) = 1/9, P(n=1) = 6/9, P(n=2) = 2/9 ⇒ E[n] = 10/9 ≈ 1.11

so an average ∫ hit is ≈ 16.7 pre-DEF while gifting the boss 15 HP — net-positive only on diverse wheels against a low-DEF boss. The +15 boss heal reads as either an "integration constant" cost mechanic or a prototype bug; it is unmistakably in the code (`target.CurrentHp += Atk` before the attack).

**Wheel mechanics** (`RouletteSymbolAllyContainer`): `Progress` advances (mod 12) every time the current ally's accumulator fires — advance is tied to *acting*, not to kills. Dead allies (HP = 0) skip their action but still pass the turn. Prev/next accessors wrap modulo 12. Notable prototype quirk: the factory creates **one shared instance per symbol type**, and the re-roller fills 12 slots with references to those 3 objects — so all ∧ wedges share one HP pool, and ≡ healing "the next slot" can heal every copy of that type at once.

**Boss AI**: none — it auto-attacks the pointer ally for `ATK_boss − DEF_ally` on its own timer. Against the stat table, DEF spread (1 / 3 / 50) makes ≡ a wall that fully blocks any boss with ATK ≤ 50 while ∧ and ∫ are paper.

### 3. Interconnections

Inbound: the mode's only hook into the wider game is the UI unlock (`ButtonsUIUnlock` → `IsRaidBossUnlocked()`, currently always-on; sibling gates like Theory require the Tornado-prestige layer, implying this was slated for that tier). It reuses the core combat kernel (`IBasicStats`, `NormalOnAttack`, `DamageRecord`) shared with the main battle mode. Outbound rewards are **not implemented** — no loot, currency, or bonus flows out yet. Internal tension is real, though: wheel composition is the strategic resource. ≡ produces no damage but sustains the wheel; ∫ needs diverse neighbors and taxes you with boss healing; ∧ is the reliable baseline. Since a re-roll redraws all 12 slots uniformly, the intended loop is clearly "re-roll for a good adjacency pattern, then fight."

### 4. Pacing & gating

As shipped: no gate (debug-true unlock), no boss constants, no win/lose handler beyond HP clamping — pacing was never tuned. The skeleton implies the intended cadence: 0.5 s ally turns, wheel lap every 6 s, boss speed as the difficulty dial, and content growth via the 12 unimplemented symbol IDs (∨, ∀, ∃, ∬, ∭, ∂, ∼, ∠, ker, Im, Hom, Aut) slotting into `ActiveSymbolAllyContainer` as an expanding roster — meaning the *draw pool*, not levels, is the progression axis.

### 5. Borrowable design lessons

- **Roulette-as-party-order**: drawing your combat rotation onto a visible wheel turns party composition into a slot-machine pull with tactics on top — cheap randomness, high readability, natural re-roll monetization/currency sink.
- **Adjacency-scaling abilities** (∫'s neighbor-diversity multiplier) make a random layout *matter*: players re-roll for patterns, not just for rarity — free strategic depth from one integer.
- **Advance-on-action, not on-kill**: rotating the active fighter every fixed beat (dead slots skip but still pass) keeps pacing metronomic and makes wheel composition, not micro, the skill expression.
- **Flat ATK − DEF with a full-block floor** creates crisp breakpoints ("this tank is immune until boss ATK > 50") — great for a 3D RPG where gear thresholds should feel binary and legible.
- **Support units that heal the *next* slot** couple healing to turn order — positioning a healer before your tank is a puzzle, not a stat check.
- **Theming stats through notation** (each ally IS a LaTeX symbol whose mechanic puns on its meaning — ∫ integrates neighbors, ≡ equalizes HP) shows how to make abstract math read as character identity; in a 3D game, the same trick works with runes, glyphs, or elements whose *mechanic mirrors the icon*.

Key files: `E:\Games\steamapps\common\Idle Spiral\decompiled\domain\Domain.RaidBoss\` (all 14 files), damage kernel `E:\Games\steamapps\common\Idle Spiral\decompiled\domain\NormalOnAttack.cs`, unlock stub `E:\Games\steamapps\common\Idle Spiral\decompiled\domain\UnlockManager.cs`, empty UI shell `E:\Games\steamapps\common\Idle Spiral\decompiled\game\SymbolContentMono.cs`.

---

## Theory & Loot: the Research Layer

### 1. What it is

Theory is Idle Spiral's mid/late-game research layer, bolted onto the battle mode. Ten "theories," each themed as a famous formula (Pythagoras → Euler's identity → r = θ), passively accumulate *study progress* like EXP bars; leveling one grants a permanent stat multiplier, one Formula Fragment (a research currency), and — critically — the level of theory *i* is the base study speed of theory *i+1*, chaining the whole tab into a cascade. In parallel, killing battle enemies fills per-enemy *loot progress* bars; each fill banks a loot box, and opening boxes rolls per-item Bernoulli tables that pay out theory materials, currencies, permanent micro-stat drops, and one-time unique unlocks. Loot feeds theories, theories feed combat and the core spiral variables, and both feed loot speed back into itself.

### 2. The math

**Curve library.** Three reusable softcap primitives (identity below a threshold `T`, tamed above it):

| Curve | Formula for x > T (x ≤ T returns x) | Behavior |
|---|---|---|
| LogDecay `D_log(T,a,b)` | `T + a·ln(1 + b(x−T))` | linear → logarithmic |
| Decay `D_exp(T,Y,s)` (s=e default) | `Y − (Y−T)·s^(T−x)` | linear → hard asymptote at Y |
| RootDecay `D_root(T,n)` | `T^(1−1/n) · x^(1/n)` | linear → n-th root |

**Study progress per second.** Multipliers resolve as `(base + Σadds) × Πmuls`:

- `P₀ = (1 + study_progress_add) × study_progress`
- `Pᵢ = (Lᵢ₋₁ + study_progress_add) × study_progress × (1 + D_log(0.5, 0.3, 1)(0.01·mᵢ))` for i ≥ 1, where `mᵢ` = held materials of tier i (50 materials = ×1.5, log beyond).

**EXP to next level:** `Eᵢ(L) = cᵢ · 1.4^L` with base costs c₁…c₉ = 5e3, 1.5e4, 4.5e4, 1.35e5, 3e5, 1.5e6, 6e6, 6e6, 6e7. Theory 0 has no EXP bar — it is bought directly with Inspiration:

- `Cost₀(L) = 10 · 1.25^L` for L ≤ 40, then `10·1.25⁴⁰ (≈75,232) + 10,000·L`
- Materials stack on top: L 21–30 needs `L+1` of mat₀; 31–40 adds mat₁; 41–50 adds mat₂; L > 50 switches to `2L+1` each of mat₁, mat₂, mat₃.

**Theory effects** (per level L; each theory also multiplies one core spiral variable a–g, γ, Ω by `1 + 0.1·D_log(200)(L)` — i.e. up to ×21 linearly, log after):

| # | Theory | Signature effect |
|---|---|---|
| 0 | Pythagorean | study_progress AND loot_progress ×`(1 + 0.0005L² + 0.0095L)` for L ≤ 91; `6 + 0.1(L−91)` after — quadratic self-acceleration flattening to linear |
| 1 | Square sum | ATK/DEF/HP ×`(1 + D_log(200)(L))` |
| 2 | Gravity | attack speed ×`(1 + 0.005·D_log(250,1,0.2)(L))` |
| 3 | i² = −1 | super-crit ×`(1 + D_exp(0.3, 0.35)(0.01L))` — asymptote +35% |
| 4 | Gaussian integral | uncommon drop ×`(1 + D_log(0.1,1,0.2)(0.015L))` |
| 5 | Gamma fn | non-raid debuff ×`(1 − D_exp(0.5, 0.9, 1.2)(0.05L))` — up to −90% |
| 6 | Euler identity | loot crit +`D_log(0.1,1,0.2)(0.01L)` (additive chance) |
| 7 | Golden ratio | combo mult +`D_root(0.05, 5.5)(10⁻⁵·L)` — linear to L=5000 |
| 8 | Fourier/Laplace | legendary chance ×`(1 + D_log(0.075,1,0.18)(0.01L))` |
| 9 | r = θ | Ω variable; **+1 max spiral design slot at L ≥ 100** |

**Fragments & upgrades.** Total fragments = loot drops + Σ all theory levels (every level-up is +1, retroactively). The upgrade shop:

- *Exchanges* (FixedCost — price never scales): 10/20/30/50/100/300/500/1000/2000 fragments buy 1 material of tiers 0–8 per purchase; tier 9 costs 10¹⁵.
- *Material upgrades* (LinearCost `a + b·k`, max level 10): +1 fragment per drop (1+3k of mat₀); study ×(1+0.25k) (5+5k mat₀); loot progress ×(1+0.1k) (1+3k mat₁); debuff ×0.95^k (3+4k mat₁); inspiration loot ×(1+0.05k) (1+3k mat₂); rare drop ×(1+0.01k) (3+5k mat₂); math₂ ×(1+0.02k) (1+3k mat₃); shard chance ×(1+0.05k) (3+6k mat₃); ExponentialCost `20·10^k` rare ×(1+0.02k), `100·10^k` combo ×(1+0.1k) (mat₄).
- *QoL* (Inspiration): 10³ = "level all" button; 10⁶ = auto-level Theory 0 (≈100 levels/s batched); 10²⁰ = loot rate pinned to max.

**Loot generation.** Killing *n* enemies at difficulty *d*:

`progress += n × (1 + D_exp(8, 10, 1.15)(d/10⁴)) × loot_progress_multiplier`

so difficulty scaling caps at ×11. Boxes per bar-fill: `⌊exp/R⌋ × (1 + loot_critical)`, where required progress R = 10⁶ (most enemies), 10⁹ (Alphabetician), 10²⁰ (AnotherSpiral); up to 9999 boxes bank while idle. Opening rolls **every table entry independently**: item drops if `U(0,1) ≤ rate × rarity_mult`, with rarity_mult = the loot_common/uncommon/rare/legendary parameters (all theory/upgrade-boostable). Mass opening is O(1): with N > 10⁴ boxes, roll 10⁴ times and multiply quantities by `N/10⁴`.

**Sample tables** (rate, amount): early boss VarMan — Inspiration 100% ×5, SpiralPoint 10% ×3, Fragment 5%, attack-speed shard 0.3% (+0.0001 permanent), material 0.1%. Unique named equations sit at 10⁻⁵ down to 10⁻⁸ (Cantor) and are *removed from the table once obtained*, fattening remaining odds. Permanent shard totals are softcapped on read, not on drop: attack speed gets `+D_root(1,2)(Σ)` then a second stage `×(1 + D_log(1,1,1.02)(·))`; equation speed `×(1 + D_log(2,1,1.2)(Σ))`; Fibonacci debuff `×(1 − D_exp(0.3,0.8,1.2)(Σ))`; r/z spiral-growth drops are uncapped `×(1+Σ)`.

### 3. Interconnections

Battle kill-count is the sole input to loot; loot outputs *every* theory input (Inspiration = T0's level currency, materials = T0's gate + upgrade currency + per-theory speed boost, Fragments = exchange currency). Theories output backwards into battle (ATK/DEF/HP/attack-speed/crit/debuff), sideways into loot itself (drop-rate, loot-crit, legendary, loot-progress — a deliberate self-feeding flywheel), and upward into the core game via the nine spiral-formula variables and the T9 design slot. Loot-progress is also a kitchen-sink parameter fed by ~6 other systems (reactor, scavenger, dailies, battle upgrades, infinite layer). Tensions: materials are triple-purposed (T0 costs vs. upgrades vs. passive speed from *holding* them — spending materials literally slows the theory that consumes them); Inspiration is torn between T0 levels and QoL unlocks.

### 4. Pacing & gating

Early: only T0 moves (base +1 progress); each T0 level quadratically accelerates all study AND loot, so the first ~40 levels snowball fast on cheap 1.25^L costs. The chain gate (`Pᵢ ∝ Lᵢ₋₁`) means deep theories are literally frozen until shallow ones have levels — a free, self-explaining unlock sequence. Walls: material requirements at T0 L>20 (forces loot engagement), the cost-regime switch at L=40 (exponential → linear+flat, converting a hard wall into a grind), the effect-curve break at L=91 (quadratic → linear), 1.4^L EXP on theories 1–9, per-effect softcaps clustering at L ≈ 200–250, and lottery gates (10⁻⁵–10⁻⁸ uniques) that rarity multipliers turn into a farmable stat. T9's design slot at exactly L100 is a headline long-term goal.

### 5. Borrowable design lessons

1. **Chain research speed to the previous node's level, not a binary unlock.** `Pᵢ = Lᵢ₋₁ × global` makes every old node permanently relevant and paces new content automatically — great for a 3D skill-tree where shrines/stations visibly "power" the next one.
2. **Ship a three-curve softcap library** (`linear→log`, `linear→asymptote`, `linear→root`) and route *every* bonus through it. Idle Spiral balances ~30 effects with three functions and per-effect constants; you get tunable feel (hard cap for crit, soft log for damage) with zero bespoke math.
3. **Softcap accumulated loot on read, not on drop.** Shards always drop and always count up (number goes up = dopamine), but the derived bonus is `D_root/D_log(total)` — farming never feels wasted yet never breaks balance.
4. **Independent per-item Bernoulli tables + remove-once-obtained uniques.** Multi-drops feel generous, rarity multipliers become meaningful upgrades, and deleting found uniques from the table is invisible bad-luck protection.
5. **Batch-and-scale mass opening** (roll 10⁴ times, multiply quantities by N/10⁴): keeps offline/AFK loot O(1) while preserving variance texture — essential for any idle-adjacent 3D game with kill-driven drops.
6. **Switch cost regimes instead of walling** (`1.25^L` → linear at L40; quadratic effect → linear at L91): exponential creates the wall, the regime change converts it into a long grind lane — the player feels breakthrough, the designer keeps control.

---

## Meta Systems: Achievements, Story, Dailies & the Number Engine

### 1. What This System Is

This is Idle Spiral's "meta ring": the layer wrapped around the core spiral-growing loop. ~100 achievements watch every other system and pay out **Spiral Points** (the game's meta currency) when milestones latch; a **daily lottery** grants 3 free pulls per day that permanently accrue small bonuses; a **33-beat story** fires narrative interludes on prestige milestones; and underneath everything sits a shared **IdleLibrary number engine** — one BigDouble-based value type, one multiplier pipeline, three reusable cost curves with closed-form bulk-buy math, and a three-function softcap library that the entire game draws from.

### 2. The Math

#### 2.1 Achievement conditions — banded threshold ladders

Achievements are built from 7 condition primitives (`domain/AchievementManager.cs`, `idlelibrary/IdleLibrary/*Achievement.cs`). The list is organized as **repeating cycles of ~17 achievements**, each cycle re-testing the same stats at escalated thresholds:

| Stat tracked | Cycle 1 | Cycle 2 | Cycle 3 | Cycle 4 | Cycle 5 |
|---|---|---|---|---|---|
| Spiral length R | 10³ | 10⁹ | 10¹⁵ | 10²⁷ | 10³⁶ |
| Max R/sec ever reached | 10³ | 10⁶ | 10¹² | 10²⁴ | 10³³ |
| Upgrade k level | 100 | 500 | 1000 | 2000 | 5000 |
| Upgrade a–g levels | 100 | 300 | 500 | 1000 | 2000–10000 |
| Omega (soft) prestige count | 1 | 3 | 5 | 7 | 10 |
| Prestige-point stock | — | 100 | 10⁴ | 10⁶ | 10⁹ |
| Tornado prestige count | 1 | 2 | 5 | 10 | 15 |
| Currency z | 100 | 10³ | 10⁵ | 10⁷ | 10⁹ |
| Boss i defeated | i=0 | i=1 | i=2 | i=3 | i=4 |

Note the deliberate ratio: the R-per-second target is always ~3 orders of magnitude below the R-total target, so both pop within the same session.

After the ladder come **predicate achievements** (arbitrary `Func<bool>`): all seven core upgrades at even levels; all odd; levels equal to the primes (2,3,5,7,11,13,17); levels equal to Fibonacci (1,1,2,3,5,8,13); "own upgrade 23 ≥ 5 while 21 and 22 are 0" and its inverse; lifetime totals (Σ levels of upgrade 0 ≥ 10⁶). Plus behavioral ones: **NoClick** (no input for 3600 s), **CurrentTheta** (spiral wound past θ ≥ 730π, i.e. 365 full turns), and math-joke targets (parameter ω ≥ 3, parameter e ≥ 2.718).

Claim logic (`Achievement.CanCalim`): the condition is **latched** — `isConditionMetOnce` sticks at true the first frame the condition holds, so the reward stays claimable even if the stat later resets (essential in a prestige game). Progress UI: `ratio = min(1, current/required)`.

#### 2.2 Rewards — a recomputed ledger, not a stored balance

Each achievement pays a flat Spiral Point bounty by index band:

$$SP_i = \begin{cases}30 & i \le 17\\ 40 & 18 \le i \le 34\\ 50 & 35 \le i \le 51\\ 60 & 52 \le i \le 68\\ 70 & 69 \le i \le 85\\ 100 & i \ge 86\end{cases}$$

The spendable balance is **never stored**; it is recomputed every read (`AchievementPoint.cs`):

$$SP_{avail} = \max\Big(0,\ \big(\textstyle\sum_{unlocked} SP_i + G\big)\cdot M_{tornado}\Big) - (C_{upgrades} + C_{shop})$$

where G = all non-achievement grants (daily pulls, offline bonus, ads, battle, DLC flat grants of 500/500/500/1000/1000/1500, purchases, tweet bonus) and M_tornado is a multiplier parameter from the tornado-prestige layer — meaning a late-game prestige **retroactively multiplies every Spiral Point you ever earned**, because the gained side of the ledger is recomputed while the consumed side stays fixed.

#### 2.3 Daily lottery (`DailySpiral.cs`, `DailyProgress_Mono.cs`, `DailyAction.cs`)

| Parameter | Value |
|---|---|
| Pulls per day | 3 (+2 with Daily DLC) |
| Spiral Points per pull | uniform int [1, 40); ×1.5 with DLC |
| Attack-speed bonus per pull | uniform [0.0001, 0.001] → +0.01%–0.1%, **permanent** |
| Loot-progress (LPM) bonus per pull | uniform [0.0001, 0.001], **permanent** |
| Day rollover check | date key Y·10⁴ + M·10² + D compared every 10 min |
| RNG | seeded `RandomState(daily_seed)`; reseeded once per day |

The bonuses are additive accumulators applied as `×(1 + Σbonus)` multipliers registered on the shared parameter pipeline (`RegisterDailyBonus.cs`). Expected lifetime accrual after d days: E[SP] = 60d, E[attack-speed] ≈ +0.165%·d. Because the seed is stored in the save and fixed for the day, **pull results are predetermined — save-scumming is impossible**. The UI literalizes the theme: each pull draws Δθ = ⅔π of a 3D spiral (EquationC, pitch 0.05), so 3 pulls complete exactly one loop per day.

#### 2.4 Story gating (`StoryManager.cs`, `StoryProgress.cs`)

33 beats, all triggered by prestige milestones: intro at first launch; beats on 1st/2nd/3rd omega prestige (`softPrestigeNum ≥ 0/1/2`), first full prestige, first tornado prestige; then tier2…tier27 fire when `tornadoPrestigeTier ≥ 1…26`. `ProgressStory` back-fills all earlier flags, so a player who skips ahead never sees stale beats out of order. Pure fade-in text over blackout; no rewards — story is a **cadence marker for prestige tiers**, not an economy.

#### 2.5 The number engine

- **Representation:** BreakInfinity `BigDouble` (mantissa+exponent, range ≫ 10³⁰⁸) for anything that grows; plain `double`/`long` in the save for bounded stats.
- **Value pipeline** (`NUMBER`, `Multiplier`): every stat resolves as
  $$v = \big(base + \textstyle\sum add_j\big)\cdot \textstyle\prod mul_k$$
  where each contribution is a **keyed lambda** registered by whatever system grants it. Keys enable per-source stat breakdowns in UI (`GetMultipliersFromKey`) and idempotent re-registration on load. Every `NUMBER` also tracks `TotalNumber` and `MaxNumber` automatically — achievements hook these for free.
- **Formatting** (`UsefulMethod.tDigit`): three user-selectable notations. Normal notation uses a 103-entry suffix table (K, M, B, T, Qa … C, Uc — through centillion, ~10³⁰⁶): with $n=\lfloor\log_{1000}v\rfloor$, display $v/1000^n$ at precision F2/F1/F0 as the head crosses 1/10/100, plus suffix. Engineering notation snaps exponents to multiples of 3.
- **Prestige escrow** (`ProducedPrestigePoint`): pending points accrue into `TempNumber` (per second: `multiplier(f())`); only `OnPrestige()` moves Temp → spendable. The "you'd earn X if you reset now" pattern as a reusable class.

#### 2.6 Generic cost curves with closed-form bulk buying

All upgrades share three `ICost` classes, each shipping exact max-affordable math (no loops):

**Exponential** — $C(L)=C_0 f^L$; total from level L to M: $\frac{C_0(f^M-f^L)}{f-1}$; max affordable with bankroll N:
$$L^* = \Big\lfloor \log_f\!\Big(\frac{(f-1)N}{C_0} + f^L\Big)\Big\rfloor$$

**Linear** — $C(L)=C_0+sL$; max affordable via the quadratic root:
$$L^* = \Big\lfloor \frac{\sqrt{4C_0^2+4C_0 s(2L-1)+s\,(s(1-2L)^2+8N)}-2C_0+s}{2s}\Big\rfloor$$

**Fixed** — constant cost; $L^* = L + \lfloor N/C\rfloor$.

#### 2.7 The softcap library (`Formula.cs`) — three shapes, one contract

Each returns identity below threshold T, then bends:

| Curve | Formula (x > T) | Behavior |
|---|---|---|
| Decay | $f(x)=D-(D-T)\,s^{T-x}$, s = e default | hard asymptote at D |
| Log decay | $f(x)=T+a\log_{base}(1+b(x-T))$ | unbounded but logarithmic |
| Root decay | $f(x)=T^{1-1/r}\,x^{1/r}$ | power softcap, continuous at T |

#### 2.8 Save scope (`DTO.cs`)

One flat `[Serializable]` class: parallel `long[]`/`bool[]`/`double[]` arrays **indexed by enums and sized by `Enum.GetValues(...).Length`** at load (with `Array.Resize` migration, so adding an enum member auto-migrates old saves). Contents: level arrays, unlock flags, monotone ledgers (`totalR`, `maxR`, `*Gained`/`*Consumed` pairs), timers (`totalTime`, `timeSincePrestige/TornadoPrestige/OmegaPrestige`), RNG seeds (`MySpiralSeed`, `daily_seed`, `enemy_seeds[]`), and dated one-shot migration booleans (`isSteamRestored20230901`…). Achievements reserve 200 slots though ~100 exist — headroom for updates.

### 3. Interconnections

**Inputs:** achievements observe literally every system (spiral length R, R/s, z, upgrade levels, all three prestige counters, battle kills, spiral angle θ, input idleness, parameters ω and e). Dailies and story only read unlock state and prestige tiers. **Outputs:** Spiral Points buy spiral-design active/passive upgrades and shop items; daily pulls also feed combat (attack speed) and the loot/theory layer (LPM). **Tension:** one SP pool, two sinks (`achievementPointConsumed` vs `spiralPointsConsumedFromShop`) — cosmetic-ish design upgrades compete with power. The tornado multiplier on gained-SP creates a deliberate loop: prestige deeper → all past achievements retroactively worth more → afford the next design tier.

### 4. Pacing & Gating

Early cycle-1 targets (R = 10³, level 100, one prestige) fall in the first session; each subsequent cycle demands ~10⁶–10¹²× more, mirroring the main game's exponential pace so a fresh batch of ~17 achievements "ripens" per major progression phase. Reward bands rise only 30→100 (~3.3×) while requirements rise ~10³³× — meta currency is intentionally **decoupled from inflation**, staying meaningful because SP sinks are also flat-priced. Daily attack-speed/LPM lines are greyed out until battle/theory unlock, previewing future systems. Story tiers 2–27 are pinned 1:1 to tornado prestige tiers — a narrative breadcrumb every deep-reset wall.

### 5. Borrowable Design Lessons

1. **Ship a softcap library, not ad-hoc caps** — three curves (asymptote / log / root) behind one "identity-below-T" contract lets you tune every runaway stat in your RPG with a shape choice and two constants.
2. **Recompute meta currency as (Σ earned) × multiplier − Σ spent** — storing the ledger instead of the balance makes late-game "all past earnings retroactively boosted" multipliers trivial and exploit-proof.
3. **Latch achievement conditions (`isConditionMetOnce`)** — in any game with resets, "ever true" not "currently true" prevents prestige from stealing earned rewards.
4. **Keyed add-then-multiply pipeline on every stat** — `(base + Σadd)·Πmul` with string-keyed lambda sources gives free per-source stat breakdowns and auto-tracked Total/Max for achievements.
5. **Daily rewards as permanent accrual, seeded per day** — tiny bonuses that never reset (+0.01–0.1%/pull) make streaks feel like character growth, and a per-day RNG seed kills save-scumming without server checks.
6. **Closed-form bulk-buy on every cost curve** — deriving L* algebraically (log for geometric, quadratic root for arithmetic) makes "Buy Max" exact and O(1), which matters once numbers are 10³⁰⁰.
7. **Threshold ladders in repeating cycles** — re-testing the same ~17 stats at ×10³–10¹² steps guarantees each progression phase delivers a full wave of dopamine without authoring new content.

---

## Distilled Playbook

Each section carries its own lessons; these are the cross-cutting ones — with an eye to what Idle Spiral adds *beyond* the NGU-style blueprint.

### Presentation (the signature move)

- **Make the resource literally visible as geometry.** Radius = currency, laps of a drawn curve = item levels, three daily pulls = exactly one loop of a 3D spiral. Every purchase changes the picture *now*. In a 3D game: let tower height, territory radius, orbiting sigils, or creature size *be* the number.
- **Upgrade the equation, not the number.** Showing `Δr = A·ω^e + k` as live math and selling its coefficients — with exponent channels as premium upgrades — makes growth-shape choices legible. "Professor" challenges that add +0.01 to an *exponent* are the endgame reward tier for a reason.
- **Mechanics that mirror their icon.** The ∫ ally integrates over its neighbors; ≡ equalizes HP; the brahmagupta curve speeds up the curve system itself. Theming stat effects on the symbol's meaning makes abstract systems memorable.

### Reset-stack architecture

- **Build resets as composed supersets.** Each tier's wipe-list contains the previous tier's (`Reset(inner, …)`), so inserting a new layer is a one-line change and the persistence table is auditable by construction.
- **Accrue prestige currency as a rate, not a snapshot** (dp/dt = ∛r/const): idle time always pays, "when to reset" becomes rate-vs-rate, and offline progress is the same integral. Root-compress the meta currency (∛ maps ~45 orders of magnitude onto ~15) to keep shop prices legible forever.
- **Match cost and payoff exponents so inner loops self-terminate.** Omega's gate grows as 10^(L(L+1)/2) while its payoff grows as 1.25^(L²+L) — the loop always stalls after a few levels and *schedules the outer reset naturally*, no hard cap needed.
- **Pay soft resets in both base and exponent of one term** (ω and E in ω^e): each level feels transformative. And **sell skip tokens** (challenge rewards that let the inner loop restart at level N) — friction removal as a permanent prize.
- **Bank lifetime playtime into the prestige multiplier with rising marginal brackets** — retention math the player can feel, immune to reset regret.
- **Reuse the top reset as challenge entry fee** — one mechanic, double duty, and every challenge run is a genuine strategic trade against tiering.

### The math toolkit (steal this wholesale)

- **Three softcap primitives behind one contract** (identity below T, then log / asymptote / r-th root): the entire game's ~30 late-game effects are balanced with shape choice + two constants each. Make the curves C⁰-continuous at the joins so players never see a cliff.
- **Triangular cost + continuous rate = √t leveling with a closed-form inverse** — every item gets an exciting start and a capless graceful taper, and offline progress is exact algebra, not simulation.
- **Closed-form bulk-buy on every cost class** (geometric sum inversion for exponential, quadratic root for linear): "Buy Max" is exact and O(1) even at 10³⁰⁰.
- **Tenth-root cost factors** (price ×b only every 10 levels) for ultra-smooth early cadence with exponential discipline intact.
- **Softcap accumulated drops on read, not on drop** — shards always count up (dopamine intact), the derived bonus is tamed. Self-softcapping drops (value ÷10 past a banked threshold) do the same on the supply side.
- **The offline identity:** accrue 10 pts/offline-second, burn 190 pts/s for ×20 speed — refunds offline time *exactly* 1:1, but as a player-triggered burst. Feels generous, costs nothing.

### Combat & content

- **Swap the player's stat-block per boss instead of writing boss AI.** One decorator per enemy (log-crush raw stats, substitute economy variables, crit-only rules) is cheap to build and forces build diversity — each boss is a checkpoint exam for one subsystem.
- **Degenerate stat lines make archetypes free:** ATK-0 piñata, 10⁴⁵-ATK/10⁴-HP glass cannon — four stats, qualitatively different fights.
- **Reward wheel over loot table:** a visible 21-slot cycle whose contents are the RNG (rerollable), then deterministic grinding with full information. Gamble once per setup, not per kill.
- **Throughput-neutral batching as a feature** (÷V speed, ×V rewards, D += V): converts a hard stat cap into a granularity choice *and* solves entity-count lag — essential for a 3D game.
- **Chain research speed to the previous node's level** (Pᵢ ∝ Lᵢ₋₁): old nodes stay permanently relevant and new content self-paces with zero unlock logic.
- **Cosmetics with teeth, wear ≠ activate:** own-for-passive, slot-for-active, collection-count milestones that amp the collection itself — and log-softcap the paid (DLC) items so money can't compound.

### Engineering

- **One keyed add-then-multiply parameter blackboard** (`(base + Σadd)·Πmul`, string-keyed lambda sources, ~130 params): every system plugs into every stat, per-source breakdowns are free, and Total/Max tracking gives achievements hooks for nothing.
- **Ledger meta-currency:** store Σ earned and Σ spent, recompute the balance — retroactive multipliers and exact respecs fall out for free.
- **Latch achievements; seed daily RNG; enum-indexed save arrays with auto-resize migration** — three small patterns that prevent whole bug classes in a prestige game.

### What Idle Spiral adds to the series

NGU shows how to stack *many systems* into one multiplier chain; FAPI shows layered prestige at scale; Idle Spiral's unique contributions are **presentation as mechanics** (the number is the picture), **the disciplined math library** (three softcaps + closed forms everywhere, clearly built by one engineer who refactored aggressively), and **self-terminating reset pacing** via matched cost/payoff exponents. For a 3D incremental, its playbook is the one to copy for *engine architecture* — the parameter blackboard, softcap library, and composed resets are exactly the skeleton a new game wants.

---

*Generated 2026-07-19 by decompiling and reading `Assembly-CSharp.dll`, `IdleSpiralDomain.dll`, and `IdleLibrary.dll`. Formulas paraphrased from code into math; where tooltips and code disagree, the code wins. One section (Raid Boss) documents an unshipped prototype found in the source — dead code is often a free design document.*
