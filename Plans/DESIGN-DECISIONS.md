# Design Decisions Log

*Every interview answer and standing decision gets one line here, recorded the moment it's made. Format: decision — why — source game/doc. Newest rounds at the bottom. Started 2026-07-19.*

## Standing decisions (pre-interview, from memory + specs)

- **Game identity: "busy game," not 100% idle** — rewards strategic systems set in motion before logging off — (owner, 2026-07-18 session)
- **PP is flow-with-bottlenecks** — no ambient "machines emit PP/s"; growth via deliberate chokepoints + big boss/challenge rewards — (owner, 2026-07-18)
- **Tripartite legs stay (rate/capacity/power); power = sink-effectiveness** — power has no meaning until sink systems exist; don't rename yet — (owner, 2026-07-18)
- **Tripartite curve: invested^0.35 for 1h–24h band; live-session momentum ×min(4, 1+0.5/hr), never offline** — session maintenance deserves acceleration — (NGU cited, 2026-07-18)
- **Factory à la TPT2**: stock a machine with items, it develops until materials run out, online AND offline — (TPT2, 2026-07-18)
- **Training areas = holodeck model, real NGU-style costs** (advanced programs de-level a third stat; no gentle floor) — (NGU + RuneScape mats, 2026-07-18/19; v1 shipped)
- **Combat PP issues ON HOLD** (flat 45–2000 rewards, over-cap clamp race) — documented, not to be fixed yet — (owner, 2026-07-18)
- **Endgame_Test god save = feature testing only, never balance analysis** — (owner, 2026-07-18)
- **NGU-feel roadmap spec on file** (docs/superpowers/specs/2026-07-07-ngu-feel-roadmap-design.md, status: draft) — 7 phases: story bible/Al companion → endless Ladder → allocation pools (tripartite replacement) → inventory merge grid → pirate raid/titans → challenges+economy tuning. **Tension to resolve in interview:** roadmap Phase 3 replaces tripartite; the later 2026-07-18 decision fixed and kept it.

## Round 0 — kickoff message (2026-07-19)

- **Heavy interest: NGU Idle** — (owner kickoff message)
- **Heavy interest: Crashlands** — (owner kickoff message)
- **Honorable mention: RuneScape** — (owner kickoff message)
- **TPT2: specifically the Mine and the Factory** — not the rest of TPT2 — (owner kickoff message)
- **Wants the *shared* features across these games** — patterns common to NGU/Crashlands/RS/TPT2-mine-factory, not one game's identity wholesale — (owner kickoff message)

## Round A — what each game earns its place for (2026-07-19)

- **NGU: ALL FOUR pillars wanted** — multiplier chain (every system emits one visible multiplier), rebirth cadence & math (live prestige number + time-shaped sessions), allocation juggling (capped assignable pools), long-horizon ladders (repeatable challenges, infinite push) — (NGU)
- **Crashlands: craft-to-explore loop + collection checklists** — crafting the next tier is why you enter the next biome; finite completable logs as first-class goals — (Crashlands)
- **Crashlands: gear-as-level REJECTED** — the equipment staircase will not be the level system, despite tier multipliers/slots existing in code — (owner choice)
- **Crashlands: friction-deletion NOT selected** — no wholesale QoL audit mandate; frictions stay unless individually decided (busy-game identity keeps some deliberate) — (owner choice)
- **RuneScape: ALL FOUR pillars wanted** — skills on one shared curve (game already has the 1.08 curve unbranded), faucet/sink discipline, drop & pity taxonomy, no-reset milestone stacking — (RuneScape)
- **Roadmap treatment: FRESH SYNTHESIS, roadmap is input only** — the 2026-07-07 NGU-feel roadmap is one source among seven; synthesis may contradict it (e.g. pools vs tripartite decided on merits) — (owner choice)
- **⚠ Tension to resolve in Round C:** NGU rebirth cadence AND RS no-reset milestones both selected — need to decide which layers reset and which only count up.

## Round B — progression spine (2026-07-19, in progress)

- **Spine = skill web × PP engine (dual)** — PP stays the engine/wallet (rate·cap·power legs); identity comes from an RS-style skill web on the shared 1.08 curve, each skill emitting one multiplier into the NGU chain — (RS + NGU hybrid)
- **Bosses are the most important chapters the player crosses — bosses unlock progression throughout the game** — elevates BossSystem clearance from alternate path toward primary gate; NGU's highest-boss-number structure — (NGU; owner emphasis)
- **"The level is the most modern scene" — CONFIRMED** as: the player's headline "level" = the latest chapter/boss-scene crossed (furthest boss beaten is the real level, NGU's highest-boss number) — (NGU)
- **Round B closed 2026-07-19 — owner: "what if I like all of them? Emphasis on number 2":**
  - **THE BOSS CHAIN IS THE SPINE (emphasized)** — one unified boss chain gates zones, tabs, and system unlocks; expedition wardens + future titans fold into the SAME chain (maximal form recorded; owner may veto the fold-in); hold-PP/step gates demoted to alternates or removed — (NGU highest-boss structure; owner emphasis)
  - **Skill XP: BOTH clocks** — RS-style use-XP from doing (fast, active) + existing idle trainers implant/holodeck/sim (slow, idle) on the same skills — (RS + FAPI two-clock pattern; fits busy-game identity)
  - Unified spine statement: *skills (doing+training) × PP engine (rate·cap·power) grow → next boss falls → new chapter unlocks more systems → repeat. Level = chapter reached.*

## Round C — prestige & resets (2026-07-19, closed)

- **Boss chain splits: STORY BOSSES vs SIMULATION LADDER** — story bosses are beat-once narrative chapters (protect the narrative); a repeatable boss-rush ladder ("Simulation Ladder" — owner's term) is what rebirth re-climbs (preserve the NGU speedrun loop) — (NGU re-climb + owner synthesis)
- **Never resets: skills, unlocked systems, and a peak-derived WATERMARKED prestige currency** — FAPI Souls model: prestige currency derives from peak, shop progress never lost, resetting only ever gains — (RS no-reset skills + FAPI watermark)
- **Resets (implied complement): run-state — PP pool/cap and Simulation Ladder progress** — the re-climb is real but only touches the run layer — (NGU)
- **Rebirth yield gets a MOMENTUM MULTIPLIER past a threshold of run time or ladder progression** — "the game mathematically whispers 'now is a good time'": a visible knee makes optimal session length a strategic target instead of vibes-based resetting — (NGU cadence math; owner's design language)

## Round D — session shape & offline (2026-07-19, closed)

- **Rhythm: short check-ins + one long session** — check-ins clear bottlenecks/reallocate/dump extractors (flow-with-bottlenecks demands it); the long session chases the momentum knee and cashes out a big Simulation Ladder push — (owner; NGU)
- **Momentum is anchored to rebirth yield** (owner reaffirmed Round C: "tripartite momentum, which we anchored to rebirths") — *synthesis note: unify the existing tripartite session momentum (×4 @ 6h) with the new rebirth-yield momentum into one session-momentum concept*
- **Offline: "ONLY WHAT YOU STOCKED RUNS" — the Pre-Logout Decision** — un-set-up systems go dormant; drones run exactly the queued missions; production layer runs only if input/output flows were configured (TPT2 factory queues); logging off is an active puzzle ("enough raw material flowing to keep sinks at max effectiveness for 8 h?"). Kills the flat 50% haircut ("mobile game penalty"). "Scientist/Manager identity" — (TPT2; owner)
- **Offline cap SCALES WITH PROGRESSION** — start 8–12 h; purchasable "Offline Buffer"/"Data Cache" upgrades push it to 3+ days late-game — *synthesis note: natural QC/premium-shaped sink — capacity/time, never power (NGU AP philosophy; QC already obeys this)* — (owner)
- **Calendar cadence: NONE** — no dailies, weeklies, or streaks ever; "momentum multipliers and rebirth pacing ARE the cadence"; progression fully decoupled from the real-world clock. Lifetime counters stay/expand (TPT2 number-go-up without dictating playtime) — (owner; TPT2; RS streak-rollback verdict)

## Round E — combat's role (2026-07-19, closed)

- **Field combat FEEDS the ladder (not a multiplier on it)** — no NGU flat active-multiplier ("makes players feel sub-optimal if they look away"); manual combat is a surgical bottleneck-breaker: the autonomous Simulation Ladder stalls at walls; short manual field runs harvest "telemetry data"/"override keys" that unblock it. Matches check-in rhythm: log in → diagnose stall → 5-min field run → idle engine roars back — (owner synthesis; flow-with-bottlenecks)
- **Al adopted as the Simulation Ladder's diegetic operator** — owner invoked Al unprompted ("Al can run the Simulation Ladder autonomously") — roadmap's companion carries over into the fresh synthesis in this role — (roadmap-as-input, confirmed by use)
- **Story bosses: HYBRID feel** — stats are the toll to survive the encounter's unavoidable baseline; execution (readable broad western-anime telegraphs, dodging by moving) dictates the cost of the clear; perfect play beats the chapter boss earlier than the spreadsheet suggests, clumsy hands idle another day and over-level — (Crashlands telegraphs × incremental stat-checks)
- **Autokill farms: ADOPTED** — cleared warden tiers become auto-battle farms; aiming the ladder at a farmed tier is part of the Pre-Logout Puzzle — (NGU autokill; TPT2 stocking)
- **Death-as-harvest: ADOPTED** — failed ladder pushes still deposit watermark prestige currency; "pushing is never wasted," prevents over-conservative play — (FAPI)

## Round F — itemization & loot (2026-07-19, closed)

- **Gear is CRAFTED (a)** — each biome's materials craft that biome's gear staircase; drops supply rare components only (boss hearts, creature parts, schematic fragments). Owner later referenced "the Two Lanes decision" — read as the split *within* (a): crafted staircase + dropped rare components, not dropped gear — (Crashlands craft-to-explore × RS components)
- **Merge & boost ADOPTED; "the inventory is accepted friction"** — player merges duplicates (NGU L+1 model) with boost consumables; slot-pressure inventory accepted as decision-rich friction — *synthesis note: with gear crafted, merge fodder = deliberately crafted duplicate copies → crafting becomes an endless material sink; exact merge domain (gear copies vs components) to be specified in synthesis* — (NGU)
- **Override keys are DETERMINISTIC, never RNG** — "kill 5 specific field enemies → 1 key"; the unstall path must never be gated by bad luck or the game feels broken — (owner; RS hard-pity-for-blockers taken to its limit)
- **Chase items use DROP-SHARDING** — 1/1000 whole-item rolls become ~10 guaranteed "schematic fragments"; slot machine → visible progress bar; fits the sci-fi theme — (RS √n sharding)
- **Collection log: BADGE-POINT SYSTEM, growing forever** — every codex entry adds weighted points into one global linear multiplier (1 + BP/10k shape); junk drops still tick boxes → "turns trash into permanent account value"; grows with every content patch as the evergreen veteran prestige metric — (RS + NGU achievement math)

## Rounds G/H — closed by owner ("I want action. Not constant inquisition.") — calls delegated to synthesis (2026-07-19)

Made in `Plans/Integration-Design.md` §1, each vetoable with one line:
- **G1: Al IS the automation** (capability modules, no scripting editor) — (owner made Al the ladder operator in Round E)
- **G2: chapters unlock the right to buy modules; PP/materials price them** — (boss-gated progression + sink economy)
- **G3: ONE Compute pool is the allocation-juggling home; tripartite untouched** as the slow investment layer — (keeps 2026-07-18 decision AND the NGU pillar)
- **H1: no real-money monetization; QC stays earned, time-not-power**
- **H2: solo-dev content cadence — generated ladder bands carry retention**
- **H3: hold-PP zone gates REMOVED (hoarding fights the sink economy); steps stay as alternate**
- **H4: direct PP→stat purchase retires; trainers + use-XP are the only level paths**

## Executive calls RATIFIED by owner (2026-07-19)

- Automation modules over scripting editor — "keeps focus on macro-management and routing" ✔
- Hold-PP gate deletion — "can't run flow-with-bottlenecks if gating incentivizes pinching the hose" ✔
- Stat-purchase retirement — "solidifies the dual-engine identity" ✔
- No real-money anything — "exactly the soul this project needs" ✔

## Build vetoes (2026-07-19)

- **Corrosion stays cosmetic** — owner: "Do not include Corrosion." The defense-reduction wiring was reverted; corrosion remains a visual debuff with no mechanical effect, by decision (no longer a wiring gap). ✔ Phase B proceed ordered.

## Phase 3 complete

`Plans/Integration-Design.md` (2026-07-19) — full synthesis: Chapter Chain spine, infinite Simulation Ladder (×1.18/tier), deterministic Override Keys, Recompile + watermarked Archive Data with the momentum-knee live NUMBER, skill web with use-XP map, Compute allocation board, stocked-offline/hoppers, crafted-gear merge economy, badge engine, 7-phase build order (A: trust the chain → B: ladder first).

## Build vetoes (2026-07-20)

- **No dodge mechanic, ever** — owner: "I am not interested in a dodge mechanic. Please do not recommend it again." Cuts §11's telegraph/dodge execution layer; story bosses stay stat-toll fights with their existing phase2 behaviors. Phase D closed complete with the Chapter Chain (v13); next phase is E. Standing veto — do not re-propose. ✔

## Phase E build calls (2026-07-20) — each vetoable

- **Strong Compute gating** — once the board unlocks (S2 / level 3), a destination with 0 units is paused online AND offline ("runs unattended iff ≥1 unit"); attended play is never gated (manual PROCESS clicks, chamber training, gathering, offload). Pre-S2 everything behaves as v13. — (§7 text + "setup quality, not presence")
- **No-rug-pull seeding** — the pool auto-seeds ONCE at first unlock or v13 load: 1 unit each to ladder → drones → extractors → holodeck, only where actually in use. Verified against the v2 god save (seeded exactly `{drones:1}`). ✔
- **Board lives in ALLOC** under the tripartite sliders — two boards, two frequencies, one console; no 14th tab. — (G3)
- **Offline buffer base 24h → 12h** (§5/§9 spec) offset by stocked systems running at 100% (Round D kills the 50% haircut); implant + tripartite keep 50% offline — they are flow/investment layers, not compute destinations.
- **Overflow choke = `PPSystem.deposit()`** — update/steps/ladder/offline clamps route spill through it; **combat's raw `+=` stays untouched** (combat-PP hold, §12) — its excess converts on the next update clamp instead. Conversion needs module + ≥1 unit on the overflow row + an implant target (target-switch zeroing makes untargeted banking hostile).
- **Compute Amplifier** (+0.10/lvl) multiplies the whole unit-output factor.
- **Hoppers are per-material capacity** 20×2^n at 250×3^n PP; **manual machines stock too** (TPT2 "stock the machine" is the model, manual or auto); v13 migration auto-stocks each running automated line once from the bag. Foreman = online auto-restock.
- **Processing bank: the queue IS the stock** (inputs consumed at enqueue); active job + queue now serialize — the §12 "queue loss on reload" chore-friction fixed as a bug. ✔
- **Drone queue** 3 deep +1/efficiency past 3; recall clears the queue; queued missions resolve offline under the drones gate.
- **Deferred out of E**: output buffers (§9 — outputs keep flowing to the shared bag; input hoppers are the gating mechanic), storage-cap sink (§8 — not in the §13 E ship list; extractor rows honestly report "storage full"), Triage module (W30 — needs the Phase G shredder).
