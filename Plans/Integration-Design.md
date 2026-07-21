# Processing Power — Integration Design (Phase 3)

*Written 2026-07-19. Executes every decision in `Plans/DESIGN-DECISIONS.md` against the Phase 1 inventory (`Plans/ProcessingPower-Systems-Inventory.md`). Formulas steal shapes and constants from the six references in `Plans/`, rescaled to this game's numbers. Where the interview ended early, the remaining calls are made here and marked ⚖ — each is one line to veto.*

---

## 0. The game in one paragraph

**Your level is the latest chapter you've crossed.** Chapters are bosses: beat-once **Story Bosses** in the 3D world (stat toll + readable telegraphs) and repeatable **Simulation Ladder wardens** that Al runs autonomously and you re-climb each **Recompile** (rebirth). Skills level RS-style from *doing* plus idle trainers, each emitting exactly one multiplier into the NGU chain; PP is the engine (rate · cap · power) and the wallet. When the ladder stalls, a 5-minute field run harvests deterministic Override Keys to unblock it. Offline, **only what you stocked runs** — logging out is a puzzle, and the buffer that limits it is upgradeable. No dailies, no streaks, ever: momentum math and rebirth pacing are the only cadence. Nothing you collect is ever dead — every discovery feeds one forever-growing badge multiplier.

## 1. Calls made without asking (⚖ veto any line)

| # | Call | Basis |
|---|---|---|
| G1 | **Al IS the automation** — every automation feature ships as an Al capability module; no scripting editor | Owner organically made Al the ladder operator (Round E); bounded build cost |
| G2 | **Chapters unlock the right to buy each module; PP/materials price it** | "Bosses unlock progression throughout the game" + flow-with-bottlenecks needs sinks |
| G3 | **One Compute pool governs automation** (the allocation-juggling home); tripartite stays untouched as the slow investment layer | Keeps the 2026-07-18 keep-tripartite decision AND delivers the NGU juggling pillar; two boards, two frequencies: tripartite = rebirth-scale, Compute = session-scale |
| H1 | **No real-money anything.** QC stays earned-only, keeps buying time/capacity, never power | Nothing in the codebase monetizes; NGU-AP philosophy already encoded |
| H2 | **Content cadence assumes solo dev**: generated ladder bands (creature roster × rank prefixes) carry retention; authored zones/bosses are the rare treat | Sustainable patch model |
| H3 | **Hold-PP zone gates are removed**, not demoted — a gate that rewards *hoarding* PP is at war with a sink economy; step-spend stays as the walking-identity alternate | Flow-with-bottlenecks |
| H4 | **Direct PP→stat-level purchase retires** once trainers unlock; trainers + use-XP are the only level paths (implant siphon becomes the flagship PP sink) | RS "you level what you do" + NGU energy-training; purchase undermines both |

---

## 2. The Chapter Chain (spine)

One integer, `chapter`, indexes the game (NGU: "one integer indexes the entire game"; its boss ladder grew ×5–×10 per boss and *only the product of every system* could climb it — same job here).

- **Rungs:** interleaved. Story Bosses are chapters **S1–S6** (existing six: Scrap Tyrant → The Unmaker), fought manually in 3D, **beat-once forever**. Sim wardens are chapters **W10, W20, W30…** (every 10th ladder tier), re-climbed each Recompile.
- **Two numbers, one identity:** `highestChapterEver` (the watermark — your *level*, never resets, shown as "Chapter 14: The Static Wastes") and `currentRunTier` (resets at Recompile).
- **Everything re-keys to `highestChapterEver`:** tab unlocks (replacing `prestigeCount` gates), zone portals (replacing hold-PP gates — H3), Al module availability (G2), new-system wake-ups (FAPI staggered per-prestige wake-up pattern: each early Recompile also introduces one system, so the first three Recompiles each feel novel).
- **Migration:** existing saves grant `highestChapterEver = f(bosses defeated, prestigeCount)` such that nothing currently unlocked ever re-locks.

Proposed gate table (v1, tune freely):

| Gate | Old key | New key |
|---|---|---|
| TECH / IMPLANT / DATA tabs | prestige ≥ 1 | Chapter S1 |
| Verdant Maw | hold 1,000 PP | S1 (steps alternate stays) |
| ALLOC / OPT tabs | prestige ≥ 2 | W10 |
| Depths | hold 2,000 PP | S2 |
| TRIALS tab | prestige ≥ 3 | W20 |
| Lagoon / Tundra | hold 9k / 25k PP | S3 / S4 (steps alternates stay) |
| Compute board (new) | — | S2 |
| Recompile (new) | — | W10 |

## 3. The Simulation Ladder (rework of `ExpeditionSystem`)

Keep the deterministic model — it's already the right skeleton. Make it infinite:

- **Tier math:** `enemyHP(t) = 30 × 1.18^t` · `threat(t) = 10 × 1.15^t` · `ppPerKill(t) = 6 × 1.14^t` (cap-clamped as today). Continuity: t = 0 matches today's tier 0; t ≈ 40 matches today's tier 6 (20k HP), so current content maps to the first four bands. `killRate = playerDPS / enemyHP(t)`; idle-safe iff `maxHP + defense×10 ≥ 5 × threat(t)` (unchanged).
- **Bands of 10**, themed from the existing creature roster with rank prefixes (organic ladder: Juvenile → Adult → Alpha → Elder → Apex → Primeval). A band = data entry, no new art.
- **Wardens (chapters W10, W20…):** HP = 8 × band enemyHP. Attempting one costs **Override Keys** (§4). Beating it: chapter crossed, band below becomes farmable, Archive payout (§5).
- **Autokill farms:** any band whose warden is beaten *this run* can be farmed — aim the ladder at tier T: deterministic `drops/hr = killRate(T) × dropTable(band)`. Runs offline **only if Compute is assigned** (§7) — aiming the farm is a core pre-logout move.
- **Death-as-harvest (FAPI):** a failed warden attempt pays `⌊0.25 × wardenArchiveValue × damageDealtFraction⌋` Archive shards. Pushing your limit is never a zero.
- **Scale check:** at tier 100, HP ≈ 4.6e8, PP/kill ≈ 3.9e6 — comfortably inside doubles and the existing 1e33 formatter for years of content.

## 4. Override Keys — field combat's job

The ladder stalls only at wardens; the unstall path is **deterministic, never RNG** (owner law):

- Each band maps to a field creature family (serpendrill band → serpendrills, etc.). Warden W(t) requires `keys(t) = 3 + ⌊t/20⌋` keys; **1 key per 5 kills** of that family in the 3D world (a visible counter, RS hard-pity taken to its limit).
- Field kills of the matching family *also* drop that band's boost items and schematic fragments (§9) — the 5-minute field run pays three ways.
- Story Bosses need no keys (they gate themselves by being hard).

## 5. Recompile & Archive Data (rebirth rework — absorbs Ascension)

**Recompile** (at the existing Ascension Terminal) is THE rebirth. **Offload stays** exactly as-is: the fast inner loop (cap growth, in-run), self-terminating as its √-yield flattens — Idle Spiral's composed-reset shape: offload ⊂ Recompile.

- **Resets:** PP pool, base cap → 150, ladder position → 0, farms un-clear, keys clear.
- **Never resets:** skills, gear, materials, story chapters, unlocked systems, Archive, badge points, tripartite investment, QC.
- **The live NUMBER (NGU):** shown recomputing every frame on the terminal and the HUD once past W10:

  `ArchiveNext = ⌊ tiersClimbed/5 × (1 + chaptersCrossedThisRun) × M(run) ⌋`

  — FAPI's `ΔRL/5 × (Asc+1)` shape with chapters as the amplifier. `M(run)` is **the momentum knee** (owner's "the game mathematically whispers *now is a good time*"): `M = 1` until `runHours ≥ 2 OR tiersClimbed ≥ 10`, then `M = min(4, 1 + 0.5 × (runHours − 2))` — deliberately the same constants as the existing tripartite momentum so one concept serves both (synthesis note from Round D discharged). The UI literally whispers: the number turns gold when M activates.
- **Watermark bonus (FAPI):** first time a run's peak tier exceeds `bestTierEver`, pay `+2 × (newBest − oldBest)` bonus Archive. Re-reaching old peaks pays the base formula only; **no Archive is ever lost, respec is free.**
- **Archive shop** (replaces the AP shop; existing AP converts 1 AP → 3 Archive; the three dead AP multipliers die officially):

| Item | Effect | Cost curve |
|---|---|---|
| PP Amplifier | +0.25× globalMultiplier /lvl | `1+⌊n(n+1)/2⌋` (old AP curve) |
| Combat Amplifier | ×1.15 permDamageMult /lvl (**now real**) | same |
| Harvest Amplifier | ×1.15 gatherMult /lvl (**now real**) | same |
| Compute Amplifier | +0.10 Compute unit output /lvl | same |
| Offline Buffer | +12 h offline cap /lvl (base 12 h → 72 h+) | `5 × 2^n` |
| Deep Archive (late, W50+) | badge multiplier exponent `(1+BP/10k)^(1+0.005n)` | `100 × 3^n` — FAPI's forever-SKU: sells exponents at the top of the stack |

- **Challenges (later patch):** NGU template on this skeleton — Archive reset to 1, race to a target chapter under a ban (No-Offload, Pacifist Field, Blind-Al), permanent reward per completion, escalating target per repeat. The existing 6 one-shot trials keep their rewards and become the tutorial tier of TRIALS.

## 6. The skill web (stats → skills, use-XP added)

Keep all 14 stats as the skill list (no destructive merge — smaller diff), branded as the skill web with **two clocks per skill** (FAPI two-clock pattern): use-XP (fast, active) + trainers (slow, idle — implant/holodeck/sim unchanged). Same curve everywhere, now called XP: `xpToLevel(L) = ceil(15 × L × 1.08^(L−1))`.

**Use-XP map** (RS: you level what you do — baseline constants, all tunable):

| Action | XP → skill |
|---|---|
| Damage dealt | ×0.5 → strength |
| Damage taken | ×1.0 → defense · ×0.3 → constitution |
| Kill bonus | enemyMaxHP × 0.1 → strength |
| Gather/drill complete | 4 → gatherSpeed (8 for tool-gated nodes) |
| Craft complete | baseTime × 2 → crafting · ×1 → craftingSpeed |
| 100 steps | 3 → speed · 1 → agility |
| Energy spent | ×0.5 → energyCap |
| FP spent | ×0.05 → focus · dodge landed: 5 → dexterity |
| Codex discovery | 25 → perception |

**Dead stats get jobs** (rather than deletion): dexterity → +0.4% player dodge/lvl; perception → +0.5% drop & fragment find/lvl; crafting → −1% merge-copy cost/lvl (cap −50%). Every skill now emits **exactly one multiplier** — the NGU discipline — and the ALLOC panel gains a breakdown table showing each skill's emission (Idle Spiral's keyed blackboard: per-source breakdowns come free once modifiers are named — the `setModifier(key)` registry already works this way).

**Total Level** = Σ levels, displayed beside the chapter. Milestones at 100/250/500/1000/2000: +2 Compute cap, +1 drone, +12 h buffer, +500 badge points, +1 Archive exponent level.

**H4 migration:** the STAT panel's buy button becomes "route implant" (implant unlocks at S1 instead of prestige 1); early-game compensator: implant siphon starts at 40% efficiency before W10 so the first hour still levels briskly.

## 7. Compute — Al's attention (the allocation board)

The NGU juggling pillar, unified with the Pre-Logout Puzzle (G3):

- **Pool:** starts at 4 units at S2. Assign units to autonomous systems; **a system runs unattended (including offline) iff ≥ 1 unit is assigned** — this single rule *is* "only what you stocked runs." Withdrawal instant and lossless (NGU allocated-not-consumed).
- **Destinations (compete for units):** Ladder Farm (aim tier T) · each Factory line · Processing bank · Drone routes · Holodeck program · Overflow Routing (§8). Extra units past the first: `output × (1 + 0.25 × extra × (1 + 0.5 × tripartitePowerBonus))` — the tripartite power leg finally has its formal meaning: **power multiplies what Compute does** (power = sink-effectiveness, everywhere).
- **Cap upgrades:** +2 units for `500 × 2.5^n` PP (the drone-cost curve — proven pacing). Unit output: Archive shop's Compute Amplifier.
- **UI:** allocation board with +/−/MAX per row and a live rate preview ("+38 alloy/hr", "farm T22: +1.1k shards/hr") — the roadmap's board UI, reused for Compute.
- **Al modules** (G1+G2 — chapter unlocks right-to-buy, PP+materials price): S1 *Key Tracker* (band↔family hints) · S2 *Overflow Routing* · S3 *Farm Director* (auto-advance farm tier when safe) · S4 *Foreman* (factory auto-restock from bags) · W30 *Triage* (auto-shred filters, auto-boost rules). Each module ships with Al teaching lines — the roadmap's teaching layer rides along.

## 8. PP engine & economy plumbing

- **Tripartite: untouched** (2026-07-18 decision stands — ^0.35 curve, momentum, presence). Its `powerBonus` consumer list is now formal: holodeck rate (exists) · implant rate (add) · Compute extras (§7) · Overflow Routing rate (below).
- **Caps convert (FAPI):** over-cap PP no longer evaporates — with Overflow Routing (S2 module), overflow converts at `25% × (1 + powerBonus)` into the implant's XP bank. **This retires the on-hold kill-PP clamp race as a side effect**: kill PP over cap becomes training instead of nothing. (The flat 45–2,000 kill rewards themselves stay flat — kills' real pay is keys/drops/XP now.)
- **Stack caps become a sink:** material cap `99 × 2^storageLevel`, upgrade priced in PP + the *stored* material (TPT2 sell-the-cure; ends silent voiding of passive production).
- **Shredder (RS disassembly):** any gear/component → shards + first-time badge tick. Shards feed boosts and merge subsidies. "Turns trash into permanent account value" — owner's law, mechanized.
- **Sink portfolio after this design:** implant siphon (flow), Compute cap (2.5^n), storage (2^n), hoppers (3^n), Al modules (flat, chapter-metered), Archive shop (super-linear), merge copies (2^L), buffers, boosts. PP finally has somewhere to *go* at every scale — the flow-with-bottlenecks identity realized.

## 9. Production, factory, offline (TPT2 layer)

- **Hoppers everywhere:** Factory machines *and* Processing Nodes get input hoppers (base 20 items) + output buffers; stocked machines run online **and offline** while fed (the decided TPT2 model; replaces pull-from-shared-inventory). Hopper size `20 × 2^n`, cost `250 × 3^n` PP.
- **Extractors:** installing a unit *is* stocking — enable the existing dead `applyOfflineTime` path, gated on 1 Compute unit for the whole extractor bank.
- **Drones:** mission **queue** (3 deep, +1 per efficiency tier past 3) so pre-logout can load a night of routes.
- **Offline resolution:** at boot, simulate stocked systems in closed form for `min(awayTime, offlineBuffer)`; un-stocked systems report "DORMANT — no compute assigned" in the away report (the report teaches the puzzle). The 24 h flat cap is gone; base buffer 12 h.

## 10. Gear, merge, collection (the loot layer)

- **Crafted staircase (Round F):** each biome adds a gear set (weapon/offhand/body first; fill the empty slots one biome at a time) priced in that biome's materials + *dropped rare components* (creature parts — the resurrected dead-fallback recipes finally ship). Tier multiplier by biome: Landing 1.0 → Tundra/Depths 3.0 (the unused Basic/Good/Rare/Epic ladder, at last).
- **Merge (NGU, "accepted friction"):** two identical items → mergeLevel+1, stat = `floor(base × tierMult × 1.15^mergeLevel)`, cap ML5 (= 32 crafted copies for a maxed piece — crafting becomes an endless material sink; crafting skill discounts copy cost §6).
- **Boosts:** field/ladder drops; each item's boost cap `10 × 2^mergeLevel`, +1%/boost (NGU cap-fill second axis).
- **Grid:** gear + components live in a 24→64-slot grid (upgrades PP+mats); materials stay in bags. Overflow auto-shreds via Triage filters (W30) — pressure without punishing sleep.
- **Schematic fragments (sharded chase, Round F):** big chase items = 10 fragments, never whole drops. Fragment chance per matching kill `p₀ × (1 + 0.5 × missedExpected)` (FAPI Σ-missed soft pity) with `p₀` tuned so a set ≈ 3–5 farming hours.
- **Badge engine (Round F):** every codex entry carries weight (common 10 / uncommon 25 / rare 100 / boss 250 / chapter 500); `badgeMult = 1 + BP/10,000` on PP rate (one clean target), exponentiable late via Deep Archive (§5). The codex grows every patch, forever, and **no drop is ever dead** — junk still ticks boxes.

## 11. Story bosses (hybrid feel)

**VETOED 2026-07-20** — owner: "I am not interested in a dodge mechanic. Please do not recommend it again." The telegraphed-AoE / dodge-by-moving execution layer is cut (original design in git history). Story bosses stay stat-toll fights with their existing phase2 behaviors; tuning difficulty via damage rather than HP remains good practice. Phase D therefore completed with the Chapter Chain (v13).

## 12. Conflicts & resolutions (explicit)

| Conflict | Resolution |
|---|---|
| NGU rebirth ⟂ RS no-reset | Split spine: story chapters + skills + Archive never reset; ladder + PP re-climb (Round C) |
| Roadmap pools ⟂ keep-tripartite | Tripartite intact (investment layer); the juggling game lives in Compute (G3) |
| Hold-PP gates ⟂ sink economy | Gates removed; chapters gate, steps remain the alternate (H3) |
| Busy-game ⟂ idle genre | Only-what-you-stocked offline + momentum knees: activity is *setup quality*, not presence (Round D) |
| Friction-deletion rejected ⟂ merge grid added | Distinguish decision-friction (kept: merge, hoppers, keys) from chore-friction (fixed as bugs: queue loss on reload, silent 99-voiding, dead upgrades) |
| Kill-PP on hold ⟂ economy rework | Untouched directly; Overflow Routing makes the clamp race moot (§8) |
| Al from a roadmap that's "input only" | Al re-enters through the automation door the owner opened in Round E; story arc (Kernel Heist) stays out of scope here |

## 13. Build order

Each phase = one save-version bump, tests extended (`runAll`), one playtest. Sized for solo-dev sessions.

| Phase | Ships | Save | Why this order |
|---|---|---|---|
| **A. Trust the chain** | Wire or delete every dead emitter (3 AP multis → wire as interim, they migrate in C; pedometer PP-bonus; mastery bonus; Minimalist drawback; dunkraza drops; 2 dead achievements; corrosion stays cosmetic — owner veto); serialize craft queue; fix warp-boost persistence | v9→v10 | Everything after composes multipliers — the chain must be honest first. Small, pure-fix diff |
| **B. Simulation Ladder** | Infinite tiers/bands/wardens, keys, farms, death-harvest shards; expedition UI → ladder UI | v11 | The spine's demand side; self-contained rework of one system |
| **C. Recompile + Archive** | Rebirth loop, live NUMBER + momentum knee UI, watermark, Archive shop, AP migration | v12 | Needs B's ladder to re-climb |
| **D. Chapter Chain** | `highestChapterEver`, re-keyed gates/tabs/zones, chapter HUD identity (story-boss telegraphs vetoed — §11) | v13 | Needs B+C rungs live before re-gating |
| **E. Compute + stocked offline** | Compute board, Al modules, hoppers, extractor offline, drone queues, offline buffer, away-report rework | v14 | Pairs with B's farms; delivers the Pre-Logout Puzzle |
| **F. Skill web** | Use-XP hooks, dead-stat jobs, Total Level + milestones, retire stat purchase, breakdown panel | v15 | Touches every interaction site — riskiest diff, wants the stable base above |
| **G. Loot layer** | Biome gear sets, merge/boost, grid, shredder, badge engine, fragments | v16 | Pure content+systems layer on a finished spine |

**Start with A+B.** A is a health pass the codebase needs regardless; B is the single change that makes the game *feel* like the design — an endless wall with a visible next warden.

*Post-G backlog (explicitly deferred): repeatable challenges (§5), Kernel Heist story arc & cutscenes, pirate zone/titans, Mathematician re-grounding on the real multiplier registry, telemetry upload.*
