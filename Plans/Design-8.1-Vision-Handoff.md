# 8.1 Vision Handoff — Processing Power (migration-aware)

*Written 2026-08-01 for the code side. This is the design of record for the 8.1 direction. It supersedes the retired `DESIGN-DECISIONS.md` and the "Design laws already settled" section of `Game-Brief.md` wherever they conflict. Companion: `Design-plan-8.1.md` (the living decisions log — Locked / Leaning / Open buckets). Read §14 Guards before writing any code.*

## 1. The vision in one breath

You are a **cyborg** engineer who landed on a portal-riddled planet **on purpose**, to build a great computer — and to keep building it for the life of the game. The computer eats **bits** (data); the world is made of **atoms** (materials, gear, stations); you are the converter between them, in both directions. The whole game is a *rhythm* played against a *ratchet*: the run layer (data, threads, boosts) resets and refills; the permanent layer (gear, stations, the computer's mind) only ever moves forward.

## 2. The flywheel — the one causal chain everything hangs on

The computer's permanent level sets the size of your run economy: your PP engine and your **Ichor** allocation pool — a substance that moves things, standing in for raw power and capability. PP is spent, transactionally, on discrete costs; Ichor is assigned, not spent — freely reassignable across channels at any time, so scarcity comes from the pool's size, not from a reallocation tax (see §4). You spend PP, assign Ichor, and commit your one physical body — real distances, real travel time — to reach materials out in the portal spokes. Materials feed stations; stations feed gear; **gear is your level**, and it's what lets you survive deeper spokes. Deeper spokes hold both the rarer atoms and the richer data — new environments and new creatures you haven't taught the computer about yet. Everything you do out there emits typed Data into a buffer whose learning rate visibly **tapers off**; when it slows, you **offload**. Bits bank into the computer permanently; atoms all stay where you built them. The computer levels up and pays out its three gifts (§5): a bigger pool, smarter automation, and **derived blueprints** — solutions to the exact problems your data described. Next run the world is effectively smaller and you are effectively bigger, so you reach farther, craft higher, and collect richer. Loop forever.

**The ship test:** every proposed mechanic must do at least one of — *gather bits, move atoms, or trade time* — or it doesn't ship. And nothing grows for free: positive growth is always billed to another account (§8). Any feature that fails both clauses is out of scope, no matter how clever.

## 3. The player is a cyborg

The player character is the walking embodiment of the contrast law — half atoms, half bits.

- **Atoms half: gear.** Crafted, worn, permanent. Gear tier is the headline level (Locked).
- **Bits half: implants/firmware.** The computer's presence in your body. The per-run Ichor pool is channeled through you; firmware improvements arrive as the computer grows.

This is why the two ladders (§6) overlap and mutually benefit rather than running parallel: the computer's growth literally upgrades part of *you*, and your body's reach is what collects the data that grows *it*. They are one organism on two substrates.

## 4. Currencies, resources, and the one law

- **PP (Processing Power)** — *bits in motion, spent.* The run-scoped flow currency and wallet: continuously generated, meant to be spent transactionally on discrete costs (crafting costs, blueprint unlocks, station upgrades) rather than hoarded. Resets at offload. Migrates from the live PP engine. Kept as-is (owner, 2026-08-01) — it's the game's actual title and it's diegetically the Computer's own currency, not stray jargon. *(Role clarified 2026-08-01: PP is explicitly the "spend" half of the currency stack — the NGU Gold analog — distinct from Ichor's "allocate" half below.)*
- **Data** — *bits at rest, not yet banked.* Collected in the world from everything you do, **typed by source** (environment / creature / material, at minimum — the taxonomy matters because blueprints key off it). Lives in a run buffer whose yield visibly tapers off the longer a run goes — plain diminishing returns, no hidden formula. Offloading banks it into the computer permanently. Kept as-is for the same reason as PP: the Computer is literally a computer, so it eating Data is the fiction working as intended.
- **Ichor** — *bits in motion, allocated, not spent.* *(named 2026-08-01, replacing the discarded "Threads"/"Bandwidth" working names; role clarified 2026-08-01. Status 2026-08-02: the name is PROVISIONAL — owner confirms Threads is dead and Ichor is better, but is not fully satisfied; keep auditioning, and do not bake any pool name into UI or code identifiers until it settles.)* The per-run allocation pool: a substance that moves things, standing in for raw power and capability. You *assign* it across channels — combat pace, gathering speed, crafting throughput, scanning — you never spend it down. Reassignment is free and instant, any time (the NGU Energy/Magic model: "portfolio rebalancing, not spending" — pulling Ichor from one channel returns it to the pool immediately). The opportunity cost comes from the pool's finite size, not from a tax on changing your mind. Pool resets at offload; the Computer's permanent level sets the cap. **Known gap, accepted for now (owner, 2026-08-01):** gear tier does not feed this pool — only the Computer does — so gear's payoff stays combat/survival-only. A two-pool split (one pool per cyborg half — gear-fed and Computer-fed) was considered and explicitly deferred; revisit if the single-pool version feels thin in play. **Contingent on in-fiction narration:** the name only lands if the game explains it — the first time the player has Ichor to assign, Al or the Computer should narrate what it is and what it does. Do not ship the term silently in a UI label with no diegetic introduction.
- **Atoms** — materials, gear, stations, buildings. Never reset. Sinks may only eat what the player chooses to feed them — never repossess.

The law in one line: **atoms stay, bits reset — and Data is the one-way valve from the run layer into permanence.**

## 5. The Computer — the brain that spawns solutions

A physical, growing structure near the Landing Site (make its growth *visible* — it's the game's biggest ratchet and should look like one). Suggested flavor, owner to confirm: **Al is, or becomes, the computer's mind** — the companion persona and the automation voice are the same character.

Three gifts, staged:

1. **Pool (early levels):** each level grows the per-run Ichor cap. *You, amplified.*
2. **Automation (mid+):** drones, waystations, route-running, auto-stations — literally compressing space and time. *The world, shrunk.*
3. **Blueprints (throughout — the signature feature):** the computer is a solution engine. Feed it enough typed data about a problem — a freezing biome, an armored creature — and it *derives* the schematic for the answer: frost lining, armor-piercing rounds, a new station design. **Recipes are not found; they are computed.** New environment → collect its data → the computer spawns the counter → craft it from local atoms at the right station → go deeper. This makes exploration and combat the same activity as progression: everything is R&D.

## 6. The two ladders, interlocked

The **gear ladder** (atoms): materials → stations → gear tiers. The **computer ladder** (bits): data → offloads → levels. Four interlocks keep neither climbing alone: the computer derives the blueprints the gear ladder needs; gear reaches the environments whose data the computer needs; implants (computer-side) multiply how fast your body collects; stations (gear-side) are where blueprints become objects.

## 7. Space × time — the world law

Movement is the point; this is the game's original addition to the NGU formula. One body, real distances, hub-and-spoke travel through the portal cave near the Landing Site. Spoke depth correlates with atom rarity *and* bit richness. Presence matters: the place you're standing runs hot (supervision bonus, richer data) while everything else idles. Prestige visibly refunds time — automation tiers shrink the world run over run.

**Migration note:** the live game's five World Gates sit in the Breach at the *bottom* of the mine; the vision wants portals in close proximity to the Landing Site. Elegant resolution (suggested, owner decides): keep the depth as an honest early-game travel cost, and make a shortcut to the gallery (lift, tram, tunnel) one of the computer's early automation gifts — the first taste of "prestige compresses space."

## 8. Sinks and sources

Positive growth billed to a different account keeps the game fun. Shapes on the table: overclocking (push one system past 100%, the heat throttles a *different* system); a power grid (industrializing starves the training rig unless generation grows); training that levels two stats while draining a third; voluntary shredding of crafted items for rare components. Hard rule: sinks eat only what the player feeds them.

## 9. Combat

Encounters happen in the 3D world but resolve in a **breakaway window** (Pokémon flow: meet it, the fight opens its own screen, you return). Resolution is **NGU-style time-based**; **no dodge/execution mechanic** (Locked). Gear sets your stats; the allocation pool (Ichor, name provisional — §4) can speed timers; wins pay materials plus creature data — which feeds blueprints, so *killing a creature teaches its counter*. The live creature roster and archetypes port as encounter content; the live stat-resolution engine likely survives mostly intact inside the window.

## 10. Crafting and industry

Early recipes at a plain workstation; advanced items demand special stations you build and unlock (Satisfactory-style, Locked). Rarity matters everywhere (Locked): schematics call for specific rarities, so common materials never go obsolete and advanced stations stay hungry for the rare stuff. Stations are atoms — permanent. The live production chain (nodes, hoppers, factory machines, processing, extractors, drones, assembly grid) is the strongest asset in the codebase for this vision: keep it and grow it into the station ladder.

## 11. RNG law

**Guaranteed floors, lucky tops** (Locked, amended 2026-08-01): gates always have a deterministic floor — counted attempts, pity, shards. An advertised low drop chance may ride on top: slot machine if you're lucky, progress bar if you're not. RNG is only ever upside. Troll odds live exclusively in the non-blocking flavor lane, never on progression.

## 12. Migration map — live system → 8.1 fate

Fates: **KEEP** (use as-is / extend), **TRANSFORM** (survives as the ancestor of a new concept), **PARK** (leave running, do not extend, decision later), **RETIRE**, **OPEN** (owner ruling required first).

| Live system | Fate | Notes |
|---|---|---|
| PP engine (rate × cap, multiplier chain) | KEEP | PP = bits in motion, the run engine; resets at offload (already true under Recompile). Whether the full multiplier chain survives as-is is Open. |
| Recompile + Archive Data + Ascension Terminal | TRANSFORM | Recompile → **Offload**; Archive Data → **banked Data**; the terminal's role moves to the Computer structure itself. |
| Compute board + Al modules | TRANSFORM | Direct ancestor of the **Ichor pool** + automation gifts; the "≥1 unit = runs unattended" gate maps cleanly to Ichor assignment, and the live board's freely-reassignable units already match Ichor's allocate-don't-spend rule. |
| Al (companion) | TRANSFORM | Suggested: Al is the computer's mind — companion and automation persona unify. Owner to confirm flavor. |
| Chapter Chain (level = chapter) | TRANSFORM | Headline level becomes **gear tier**; the chapter integer demotes to a story-progress tracker. Bosses stay. |
| Story bosses | KEEP | Beat-once encounters paying rare components + large data payouts. |
| Simulation Ladder | PARK | Infinite-climb identity not assumed under 8.1. Its deterministic auto-combat engine is the natural core for the combat window's auto-battle mode. |
| Tripartite board (rate/capacity/power) | PARK | Rebirth-scale investment likely folds into computer levels. Do not extend. |
| Skills/stats + trainers/holodeck (+ planned Phase F skill web) | OPEN | **Phase F is NOT assumed under 8.1.** Stats likely hang off gear + implants (cyborg). This is exactly where a handoff can derail — do not touch without an owner ruling. |
| In-world stat-toll combat | TRANSFORM | Moves into the breakaway window (§9). |
| Production chain (nodes → grid) | KEEP & GROW | Becomes the station ladder (§10). |
| Stocked-offline rule + away report | KEEP (leaning) | Harmonizes with time-as-commodity; not re-litigated. |
| Zones, portals, the Breach | KEEP | World already matches the vision; see the proximity note in §7. |
| Trials, codex/badge plans | PARK | Collection checklists are in the gene pool; the badge engine is not assumed. |
| Pedometer / step economy | KEEP | Fits the movement identity. |
| QC premium currency | OPEN | Monetization is an open question now — do not extend in either direction. |
| Offline buffer upgrades | KEEP (leaning) | |

## 13. Adoption order (suggested — every step leaves the game playable and save-migratable)

- **M0 — Vocabulary re-anchor.** Renames only: Recompile→Offload, Archive Data→Data. No mechanics change; makes every later diff read in 8.1 language. *(Amended 2026-08-02: the original "Compute→Threads" is void — Threads is dead, the pool's name is provisional (see §4), and §4 forbids shipping it without in-fiction narration, which a renames-only step can't provide. The Compute board keeps its live name until the final name + narration land together, M4 at the earliest.)*
- **M1 — Combat window.** Move fights into the breakaway UI with NGU-style timing; reuse rosters and the stat engine. Isolated system, high identity value.
- **M2 — Gear-as-level.** Gear tier becomes the headline level; chapter integer demoted.
- **M3 — The blueprint brain.** Data taxonomy (environment/creature/material) + the computer deriving schematics from data thresholds. The signature feature; taxonomy also underpins M4.
- **M4 — Ichor + offload rhythm.** Rework the pool as a true allocation (assign/reclaim, never "spent" — see §4's PP-vs-Ichor split) and narrate it in-fiction per §4; add the data taper (diminishing returns) so optimal offload timing becomes a visible strategic read.
- **M5 — Space compression.** Automation tiers as computer gifts (Breach shortcut, drone routes, waystations).
- **M6 — Sinks and sources pass.** Heat/overclock, power grid.
- **M7 — Cyborg framing + station ladder expansion.** Implants as the bits-half of the player; industry deepens.

Rationale: identity-visible changes first (M1/M2) prove the direction cheaply; the taxonomy lands before the systems that consume it; automation arrives only after the offload rhythm exists to reward.

## 14. Guards — read before coding

- **One source of truth.** This doc + `Design-plan-8.1.md`. The old `DESIGN-DECISIONS.md` is retired; `Game-Brief.md`'s "settled laws" are stale where they conflict (gear-as-level, real-money, the RNG wording, dailies).
- **The ship test** (§2). Gathers bits, moves atoms, or trades time — otherwise it's out of scope regardless of merit.
- **When ambiguous, be the most like NGU.** Owner's stated north star.
- **OPEN means owner.** Never resolve an OPEN item in code. Surface it in your plan and stop.
- **Every phase playable.** Each M-step ships with a working save migration; the live game never goes dark.
- **The Locked list** (full text in the log): gear-as-level; time-based breakaway combat; no dodge; guaranteed floors, lucky tops; Satisfactory-style stations; rarity everywhere; offload is the prestige; parked ship + cave portals.
- **Session vs. permanent.** If the owner floats an idea in a session, it's a Leaning until they say to lock it. Do not write session enthusiasm into permanent doctrine — that's the failure mode that killed the last log.
- **Currency re-evaluation (2026-08-01).** PP and Ichor were redundant as originally written — both described as "spent on session-scale everything." Fixed by splitting the verb, not just the name, on the model of NGU's Gold (flow, spent) vs. Energy/Magic (allocated, freely reclaimable — "portfolio rebalancing, not spending"): PP is now explicitly the spend currency, Ichor the allocate currency, and reassigning Ichor is free and instant — no cost to changing your mind, matching NGU's model exactly. A two-pool split (mirroring NGU's Energy/Magic, one pool per cyborg half) was considered and explicitly declined for now; the resulting gap — gear tier doesn't feed the Ichor pool, only the Computer does — is accepted, not fixed, and should be revisited if gear investment feels disconnected from session capability in practice.
- **Terminology pass (2026-08-01).** Computer-science jargon layered onto the adventure fantasy was reviewed on purpose, term by term — not a blanket rename. PP and Data stay: both are diegetically the Computer's own vocabulary, not stray jargon, and PP is the game's title. The allocation pool is renamed Threads→**Ichor**, on the condition that it's narrated in-fiction the first time the player has it to spend (see §4) — a name alone doesn't teach a mechanic. "Buffer," "firmware," "R&D," and "automation" all read fine to a layman and stay. "Saturation curve" was too technical and is now plain "tapers off" / "diminishing returns." "Cache" was too much of a stretch and becomes "waystation." Any new system name proposed from here forward should get the same term-by-term scrutiny, not a rubber stamp.
