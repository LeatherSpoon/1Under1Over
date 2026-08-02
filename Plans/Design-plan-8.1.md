# Design Plan 8.1

*Started fresh 2026-08-01. The old log (`DESIGN-DECISIONS.md`) is retired — it stopped being trustworthy. Session-level "let's run with this for now" calls got written down as permanent doctrine, and a few landed exactly backwards from what I actually think (it says gear-as-level was REJECTED — I like gear-as-level). This doc starts over, keeps the language casual, and has ground rules so that doesn't happen again. The synthesized vision for the code side lives in `Design-8.1-Vision-Handoff.md`.*

## Ground rules for this log

Three buckets, and they are not interchangeable:

- **Locked** — I said to lock it, or I said "never" / "always" about it myself. These don't move unless I explicitly unlock them.
- **Leaning** — current best thinking. Free to evolve; next session can overturn a leaning without ceremony.
- **Session notes** — stuff we tried or kicked around in one sitting. Interesting, not binding.

Nothing gets promoted to Locked just because I sounded excited in one session. If I want something locked, I'll say so. And keep it in plain words — if a line needs a glossary, rewrite the line.

## The game, in plain words

You fly your ship to a planet — on purpose. Parked, not crashed. You set up at your Landing Site, and you're here for one big reason: to build a large computer, and to keep building and growing it for the whole life of the game.

Close to the Landing Site is a cave, and inside the cave are portals to different environments. That's how you travel: step through, and you're somewhere new.

It's a 3D adventure game that rewards exploration, combat, crafting, and gathering — with idle-game growth running underneath all of it. The computer is the idle heart. As it progresses it starts helping you, using what it's learned from the data you collect between sessions. When you're ready to prestige, you **offload** your data into the computer and start a new run. The computer keeps everything it learned.

More vision facts, straight from me (2026-08-01):

- **The player character is a cyborg** — half atoms (gear), half bits (implants/firmware). That's why the gear ladder and the computer ladder overlap and mutually benefit instead of running parallel.
- **The computer is the brain that spawns solutions.** Feed it enough data about a problem — a hostile environment, a tough creature — and it derives blueprints for the answer. Recipes are computed, not found.


## The gene pool

I like all six of the games I keep design references for — that's why the references exist. Steal freely from all of them. What each one's famous for around here (flavor, not commitments):

- **NGU Idle** — time-based combat, gear-as-level, rebirth pacing, finite allocation with real opportunity cost, number-go-up joy
- **Crashlands** — craft-to-explore, gear-as-level, collection checklists
- **RuneScape** — skills, drops, long-haul goals that never reset
- **The Perfect Tower 2** — the Mine and the Factory; stock a machine and walk away
- **FAPI** — generous prestige where resetting only ever gains
- **Idle Spiral** — layered growth math

**North star (owner, 2026-08-01): when in doubt, be the most like NGU.** There was so much to enjoy there. What this game adds that NGU didn't have: *space, and its relationship with time* — the player has to move to accomplish missions, travel time is a real cost, and the world is not tabs on a spreadsheet.

## Locked (as of 2026-08-01)

- **Gear-as-level.** Gear tier is a core measure of progression, the Crashlands/NGU way. (The old log had this exactly backwards.)
- **Combat is time-based, in its own window.** NGU-style time-based combat, and it happens in a breakaway window off the 3D world — Pokémon-style: you run into something out in the world, the fight opens its own screen, you fight, you come back.
- **No dodge/execution mechanic.** Combat is stats and timing, never player reflexes. (The breakaway window makes this natural anyway.)
- **Guaranteed floors, lucky tops.** *(amended 2026-08-01, replaces the plain "deterministic unblockers" wording)* Gates always have a guaranteed floor — counted attempts, pity, shards. An advertised low drop chance may ride on top: slot machine if you're lucky, progress bar if you're not. The RNG is only ever upside; the floor makes it a progress bar under the hood. Troll odds are allowed only in the non-blocking flavor lane (NGU joke-item energy), never on progression.
- **Crafting stations, Satisfactory-style.** Early recipes get made at a plain workstation; more advanced items need special stations you have to build and unlock. Industrializing is part of the fantasy.
- **Rarity matters everywhere.** Resources span the full range of rarity, and schematics/blueprints/recipes call for specific rarities — common materials stay useful for common recipes, and the rare stuff is what the advanced stations are hungry for.
- **Offload is the prestige.** You dump your collected data into the computer to start a new run, and the computer's accumulated learning is what carries forward and compounds.
- **Ship parked, not crashed. Portals live in the cave near the Landing Site.** World facts, not up for drift.

## Leanings (current best thinking — free to evolve)

*From the 2026-08-01 temperance-vs-permanence ideation, then synthesized in `Design-8.1-Vision-Handoff.md`:*

- **The contrast law: atoms stay, bits reset.** Tangible things — gear, stations, buildings, fabricated schematics, the computer itself — persist forever. Informational things — the run's collected data, calibrations, temporary boosts, the computer's working memory — are what you offload. Prestige is banking, not losing: the run buffer empties into the permanent archive. The player never watches something they built get deleted; they watch a meter they filled get cashed. Data is the one-way valve from the run layer into permanence.
- **The session set is a finite allocation pool: Ichor — allocated, never spent.** *(named 2026-08-01; role clarified 2026-08-01 after re-evaluating against PP — see the currency re-evaluation note below)* Each run the computer grants a pool of Ichor — a substance that moves things, standing in for power and capability — sized by the computer's *permanent* level. You assign it across growth channels — combat pace, gathering speed, crafting queues, scanning — and reassignment is free and instant, any time: pulling Ichor out of one channel returns it to the pool immediately (NGU's Energy/Magic model — "portfolio rebalancing, not spending"). The opportunity cost is the pool's finite size, not a tax on changing your mind. This is deliberately distinct from **PP**, which is the spend currency (flow, depletes, meant to be spent on discrete costs — the NGU Gold analog). Pool and assignments reset at offload; permanent computer growth buys the cap. **Known gap, accepted for now:** gear tier does not currently feed this pool — only the Computer does — so gear's payoff stays combat/survival-only. A two-pool split (one per cyborg half, gear-fed and Computer-fed) was considered and explicitly deferred; revisit if the single-pool version feels thin in play. **Contingent on in-fiction narration:** the name only works if the game explains it — first encounter with Ichor should have Al or the Computer narrate what it is and does.
- **Data saturation whispers "offload now."** Early in a run the computer learns fast from this configuration of you; late in a run yields decay because it's seen it all. A visible taper — returns thinning out, not a formal "curve" — makes optimal offload timing a strategic read, the way NGU's math whispers rebirth timing. Fresh run = fresh learning rate, and the smarter computer makes each climb faster.
- **The computer's three gifts, staged.** Early levels grow the Ichor pool (you, amplified); mid+ levels unlock automation tiers (the world, shrunk); and throughout, it derives blueprints from typed data (the signature R&D loop — killing a creature teaches its counter).
- **Your body is the spatial allocation.** You can only be in one place; presence matters (the place you're standing runs hot — supervision bonus, richer data — while everything else runs idle). Distance is a price tag: cave hub and spokes, with the good nodes deep in each spoke, so time-to-reach and haul capacity are real costs.
- **Prestige compresses space.** The computer's permanent help shrinks the world over successive offloads — drone routes, waystations, eventually portal shortcuts. Each rebirth the world is a little smaller because the computer learned your routes. Time-as-commodity is the thing prestige visibly refunds.
- **Sinks and sources keep it fun — positive growth billed to a different account.** Shapes on the table: overclocking (push one system past 100%, the heat throttles a *different* system); a power grid (industrializing starves the training rig unless generation grows); NGU-style training that levels two stats while draining a third; voluntary sacrifice (shred crafted items for rare components). Rule of thumb: sinks eat what the player chooses to feed them, never repossess — equipment stays permanent as a category.
- **The ship test.** Every proposed mechanic must gather bits, move atoms, or trade time — or it doesn't ship. And nothing grows for free.

## Open — deliberately not decided

- **Monetization.** The old "no real-money anything" veto was a session mistake — I didn't like the direction at the time, but I'm open to the possibility of making a profit from this game. Nothing is designed yet; just don't treat "free forever" as law.
- **Dailies / streaks / calendar cadence.** The old log had a hard "never." That veto was not re-confirmed in the 8.1 reset — treat it as open until I say otherwise.
- **Skills/stats under 8.1.** The live game's 14 stats + trainers, and the previously planned skill web, are NOT assumed. Stats likely hang off gear + implants (cyborg), but this needs my ruling before any code work. *(2026-08-02: worthy of an entire ideation session — earmarked; kickoff brief ready at `Plans/Ideation-Kickoff-Skills-Stats.md`.)*
- **The multiplier chain.** PP stays the run engine; whether the live multiplier-chain structure survives as-is is undecided. *(2026-08-02: also worthy of an entire ideation session — earmarked; kickoff brief ready at `Plans/Ideation-Kickoff-Multiplier-Chain.md`.)*
- **Al's identity — narrowed (owner, 2026-08-02): AL WILL PERSIST. I WILL FIND A WAY.** Al staying is not in question; what's still my flavor call is the *how* — companion, the computer's mind, or both unified.
- **Portal proximity.** Live gates sit deep in the mine; the vision wants them close. Suggested resolution: keep depth as an early travel cost, make the shortcut an early automation gift. Mine to confirm.
- **Everything else from the old synthesis.** Chapter chain, Simulation Ladder, tripartite board, badge engine, QC: parked per the migration map in the handoff doc. Any of it can earn its way back on merit, but none of it is assumed.
- **Ichor's single-pool gap.** Gear tier doesn't feed the Ichor allocation pool under the current one-pool design (see Leanings) — a two-pool split (one per cyborg half) was considered and declined for now. Revisit if gear investment feels disconnected from session capability in practice.
- **The pool's final name — ruled "Ichor for now" (owner, 2026-08-02).** Threads is dead for good. Ichor is the working name — use it in docs and design freely; a better name can still displace it before it ships to players, and the narration contingency stands regardless (the game explains it in-fiction the first time the player has it, so no silent UI label).

## Corrections ledger (old log → truth)

- "Crashlands: gear-as-level REJECTED" → wrong; I like it, and it's an NGU feature too. Now Locked the other way.
- "No real-money anything" → session mistake; I'm open to profit. Now an open question.
- "Deterministic unblockers" (no RNG ever on gates) → too strict; NGU's advertised-odds-with-guaranteed-counter is the better law. Lock amended to "guaranteed floors, lucky tops."
- *(add lines here as more inversions turn up)*

## Session notes

*(newest at the bottom; nothing here is binding)*

- **2026-08-01 — temperance vs permanence ideation.** Produced the atoms/bits contrast law, the allocation pool concept, data saturation as offload rhythm, body-as-spatial-allocation, prestige-compresses-space, and the sinks/sources shapes (all filed as Leanings). Amended the unblockers Lock to allow NGU-style lucky-or-guaranteed odds. Declared NGU the north star, with space×time as this game's original addition.
- **2026-08-01 — vision alignment + handoff synthesis.** Owner corrected the frame: two currency layers (PP-like engine + Data), the computer as a blueprint-deriving solution engine, and the player as a cyborg (gear = atoms half, implants = bits half — the two ladders are one organism). Wrote `Design-8.1-Vision-Handoff.md`: the flywheel, the ship test, a system-by-system migration map (KEEP/TRANSFORM/PARK/OPEN), the M0–M7 adoption order, and guards for the code side.
- **2026-08-01 — currency re-evaluation.** PP and Ichor were redundant as designed — both read as "spent on everything." Resolved by splitting the verb: PP spends (flow currency, NGU Gold analog), Ichor allocates (reclaimable pool, NGU Energy/Magic analog) with free, instant reassignment. Considered and declined, for now: splitting Ichor into two pools mirroring the cyborg's atoms/bits halves (one gear-fed, one Computer-fed) — kept as one pool, Computer-fed only, with the resulting gear-has-no-allocation-payoff gap accepted as a known limitation to revisit later.
- **2026-08-01 — terminology pass.** Went through the handoff doc's computer-science vocabulary term by term rather than a blanket sweep. Kept PP and Data (both diegetically the Computer's own words, and PP is the title). Renamed the allocation pool Threads→**Ichor** after three rounds of naming ("a substance that moves things, standing in for power and capability") — contingent on the game narrating what it is the first time the player has it to spend. Kept "buffer," "firmware," "R&D," and "automation" (all read fine to a layman). Simplified "saturation curve" to plain "tapers off"/"diminishing returns," and swapped "cache" for "waystation."
- **2026-08-02 — Ichor check-in (adoption session).** Threads confirmed no-good; Ichor is better but not fully satisfying — the pool's name moves to the Open bucket (still auditioning). Practical consequence for M0: the vocabulary re-anchor ships **Recompile→Offload and Archive Data→Data only**; the Compute board keeps its live name until the final name and its in-fiction narration land together (M4 at the earliest). This also resolves the handoff's stale "Compute→Threads" line in §13.
- **2026-08-02 — feedback-queue rulings (adoption session, round 2).** The pool is **Ichor for now** (working name, displaceable, narration contingency stands — M0's narrowed scope unchanged). **Skills/stats** and **the multiplier chain** each earmarked for their own dedicated ideation session rather than a quick ruling. **Al will persist** — "I will find a way"; the how is still mine. Portal proximity, monetization, dailies, the single-pool gap, and the Landing-Site buildable-ground scarcity: all deliberately skipped for now, still in the queue.
