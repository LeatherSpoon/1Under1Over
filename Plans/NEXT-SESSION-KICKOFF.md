# Next-Session Kickoff: Integrating the Reference Library into My Game

*This file is the handoff from a previous Claude session (2026-07-19). That session reverse-engineered six games into design references. This session's job: analyze my current game, interview me about what I want to borrow, and synthesize an integration design. Read this whole file before doing anything.*

---

## Context

I'm building a **3D game** with incremental/RPG progression. I love the math and logic these games use. Six design references were produced — three from fully decompiled source, three from verified research. Each is a chaptered markdown doc with formulas, constants, per-system "Borrowable Design Lessons," a closing "Distilled Playbook," and a "what this game adds to the series" note.

## The reference library

| Doc | Role in the synthesis |
|---|---|
| `E:\Games\steamapps\common\NGU IDLE\NGU-Idle-Design-Reference.md` | The multiplier-chain core: one-system-one-multiplier, rebirth NUMBER math, EXP economy |
| `E:\Games\steamapps\common\Farmer Against Potatoes Idle\FAPI-Design-Reference.md` | Content lifecycle at scale: death-as-harvest, 3-layer prestige, exponent shops, economy sunsetting |
| `E:\Games\steamapps\common\Idle Spiral\IdleSpiral-Design-Reference.md` | The engine skeleton: parameter blackboard, softcap library, composed resets, closed-form math |
| `E:\Games\steamapps\common\RuneScape\RuneScape-Design-Reference.md` | Identity & economy: shared XP curve, skill web, drop/pity taxonomy, faucet/sink engineering |
| `E:\Games\steamapps\common\The Perfect Tower II\PerfectTower2-Design-Reference.md` | Automation & structure: combat as resource pump, many-verbs-one-wallet town, scripting as endgame |
| `E:\Games\steamapps\common\Crashlands\Crashlands-Design-Reference.md` | The integration layer for 3D feel: gear-as-level, friction-deletion methodology |

Consult these docs for details during synthesis — don't re-read all six upfront; the Pattern Index below is the working summary.

## Mission for this session (in order)

### Phase 1 — Analyze my current game FIRST

My game's project lives at: **`<FILL IN PATH>`** (I'll tell you when I start the session — engine, folder, and any design docs).

Produce a systems inventory of what my game has *today*, in the same format as the references: for each existing system — what it is, its math/curves (read the actual code), interconnections, pacing — plus an explicit **gap map**: which pattern categories from the Pattern Index my game currently has no answer for (progression spine? prestige? economy sinks? retention cadence? automation?). Write it to a markdown doc in my game's folder. Keep judgment neutral in Phase 1 — inventory first, opinions later.

### Phase 2 — Interview me (after Phase 1, not before)

Then interview me about what I found impressive across the six games and what fits my game. Rules:

- **Small batches**: 3–4 questions max per round, one theme per round. Use the structured-question UI where available, with concrete pattern options (from the Pattern Index, cited to their game) rather than open-ended "what do you like?" — but always let me answer freely too.
- **Anchor each round in Phase 1 findings**: "your game currently has X; NGU does A, RuneScape does B, TPT2 does C — which direction appeals?"
- **Record every answer immediately** in `DESIGN-DECISIONS.md` next to the Phase 1 doc (one line per decision: choice, why, source game). The previous session nearly ran out of context — never keep decisions only in chat.
- Suggested rounds (adapt based on Phase 1): (A) core fantasy & which reference game resonates most; (B) progression spine; (C) prestige/reset appetite — including "no resets" as a legitimate RuneScape-style answer; (D) session shape — active/idle balance, offline, cadence; (E) combat's role and integration; (F) itemization & loot psychology; (G) automation ambitions; (H) scope & lifecycle (years of updates? monetization? none?).

### Phase 3 — Synthesize

Only after the interview: write an **integration design doc** mapping chosen patterns onto my game — concrete systems with actual formulas (steal constants and curve shapes from the references, adjusted to my game's scale), interconnection diagram, and a prioritized build order (what to prototype first and why). Flag conflicts between chosen patterns explicitly and propose resolutions.

## Pattern Index (the cheat sheet)

The distilled cross-game catalog. Cite the source doc for details.

**Progression spines** (pick one, hybridize carefully)
- Multiplier-chain core: tiny stat core, every system emits exactly one multiplier; add within category, multiply across (NGU)
- Gear-as-level: no XP; crafted equipment staircase, stats ~2× per 4 levels; quality RNG as narrow garnish band (Crashlands)
- Parallel skills on one shared exponential curve (~doubling per 7 levels), total level as portfolio score, no classes (RuneScape)
- Visible-number: the resource literally rendered as geometry/scale; upgrades buy equation coefficients incl. exponents (Idle Spiral)

**Prestige & resets**
- Live-updating prestige number the player watches grow; piecewise time-penalty enforcing session cadence by math (NGU)
- Peak-derived, watermarked prestige currency — resetting never loses shop progress (FAPI)
- Composed reset supersets; inner loops self-terminate via matched cost/payoff exponents; prestige accrued as a rate (∛r/s), not a snapshot (Idle Spiral)
- Checklist prestige (different every tier), resources refunded over 4 h, late "resets" that only count up + purchasable divisors (TPT2)
- No resets at all: milestone stacking on one counter — cap, virtual levels, cap raises as content patches (RuneScape)
- Layer-above-pays-layer-below scalars; milestone auto-grants; performance-OR-time gates; % retention schedules; economy sunsetting + staggered per-prestige system wake-ups (FAPI)
- Sell permanent upgrades for temporary handicaps (challenges); ban a pillar, reward that pillar; reward exponents late (NGU)

**Currencies & economy**
- Allocated-not-consumed workforce pools, free reclaim (NGU) · event-sourced permanent currency at flat prices (NGU EXP) · log-spaced ×10 QoL ladder · soft premium currency buying capacity/time, never power, with prestige-gated caps (NGU AP / FAPI Souls)
- Sell exponents, not multipliers, at the top of the stack: M^(1+0.01n) (FAPI)
- One universal drop + per-system exchange rates as the unlock schedule; many-verbs-one-wallet (TPT2)
- Faucet/sink engineering: NPC price floors (alch), quantity throttles not price clamps, rent-not-own gear, universal disassembly shredder, tax-velocity-and-delete (RuneScape)
- Time-denominated untradeable tokens (1/min) + rotating 5× spotlight to revive dead content (RuneScape)
- Log-scale sink rewards: tier = ⌊log₁₀(spent)⌋ survives 70 orders of magnitude (NGU Money Pit)

**Curve toolkit** (steal shapes, not themes)
- √t: level time ∝ (L+1), closed-form invertible (all three idles) · log t: cost ×1.0078^L + milestone jumps m^⌊L/T⌋ with T reducible by *other* systems (NGU hacks)
- Fixed clocks (≥4 h/level, inputs^0.17 resist brute force) · income-equilibrium drains (drain ∝ g^L vs income) (NGU)
- Continuity-preserving softcaps: 1+βL then 1+βB^(1−α)L^α; or the three-primitive library: linear-then-log / -asymptote / -root (Idle Spiral)
- Caps that convert (excess becomes a new multiplier) · escalating-ratio costs (a+bL)^L · sink softcaps m^0.33 · double-log for infinite sinks (FAPI)
- Log-cost boosts of stored energy (boost = log₁₀(E)×base; sell a better log base) · ×1.5 duplicate pricing, full refund · exponential greed tax 1.5^(n−1) (TPT2)

**Combat**
- Idle baseline + manual 3–6× multiplier; attention is spent, never required (NGU) · autokill thresholds turn bosses into farms (NGU) · 1.05^floor infinite tower with provable optimal floor (NGU ITOPOD)
- Death-as-harvest: every run-end pays the meta currency, enrage guarantees closure; two-lever kill math dmg·FE/(100+HP); area-normalized % stats (FAPI)
- Per-boss rewrites of the PLAYER's stat block, not boss AI; degenerate stat lines as archetypes; reward wheel + throughput-neutral batching (Idle Spiral)
- Telegraphs orthogonal to stats; all side-damage as % of main DPS; death = time never power; difficulty raises enemy damage not HP (Crashlands)
- Ratio hit chance H = Aff·a/d; all gear stats generated from one tier function; classes as tier offsets (RuneScape)

**Itemization & RNG**
- Merge-to-level (L₁+L₂+1) + cap-fill two-axis growth; collection log as bonus engine; boss-fraction gating min(progress/req,1) (NGU) — same idea as FAPI's prestige governor
- Pity everywhere at ~2–2.5× expected, Σ-missed-chance auto-scaling; expected-value offline drops with fragment banking; rarity = affix count (FAPI)
- The pity taxonomy: soft (capped numerator growth), hard only for progression blockers, decrementing denominators, drop-sharding √n, player-priced rates (Telos) (RuneScape)
- Elites superset base loot + exclusively drop tier-up currency; one design three named bands; companions scale with player, tier-gate only bonuses; finite collection checklists (Crashlands)
- Two clocks per collectible (cheap/active vs slow/idle) (FAPI pets) · temp/perma split with metered converter (FAPI cards)

**Automation & QoL**
- Design the pain, sell the cure — staged: manual → crude workers → full scripting; sell compute (RAM=throughput, CPU=research) not toggles; portable scripts = free community endgame (TPT2)
- Friction-deletion rules: delete frictions that aren't decisions, keep ones that are; every deletion needs a named compensator; one bold deletion dictates architecture; tools as permanent knowledge (Crashlands)
- Index idle rewards to measured active rates (25% of live hourly) (FAPI) · offline in closed form, min(time, affordable), itemized away-report (NGU)

**Retention cadence**
- Stacked daily/weekly/monthly with banked grace (5–30 periods); pull-based not push; no login streaks — the RS3 2026 rollback verdict (RuneScape)
- Weekly catch-up aimed at the weakest stat (Tears of Guthix) · achievements as weighted badges → one linear multiplier (1+BP/10k) with {1,3}×10^k threshold ladders (NGU/RS)
- Lifetime counters with slowly growing exponents (reward^(1.1+0.01·log₁₀ n)) — no streaks, everything counts forever (TPT2) · first-kill spikes with ÷10 repeats (TPT2)
- Cross-mode/cross-game perks: counters in one context minting content in another (Crashlands perk_def)

**Engineering**
- Doubles + explicit saturation caps at type boundaries, or BigDouble; log₁₀ for leaderboards · serialize RNG states; version-ladder save migrations; server-time check (NGU/FAPI)
- Keyed add-then-multiply parameter blackboard — per-source breakdowns free (Idle Spiral) · ledger currencies (Σearned − Σspent), retroactive multipliers + exact respecs (IS/FAPI) · latch achievements; closed-form bulk-buy; fixed-tick sim enables closed-form offline (all)

## How I'll start the session

I'll open a new session **in my game's project folder** and paste something like:

> Read `E:\Games\steamapps\common\NGU IDLE\NEXT-SESSION-KICKOFF.md` and follow its mission. My game is in this folder — engine: `<engine>`. Start Phase 1.
