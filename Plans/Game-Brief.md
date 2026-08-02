# Processing Power — Game Brief (for design & ideation sessions)

*A design-language snapshot of the whole game, written for conversations that need to understand it **without reading code** — paste this into a chat session before ideating. Companion docs: `Plans/Design-plan-8.1.md` (the design log of record — Locked / Leaning / Open buckets) and `Plans/Design-8.1-Vision-Handoff.md` (the synthesized 8.1 vision). Written 2026-07-31 from the live game, laws re-anchored to 8.1 on 2026-08-02; if it contradicts the game, the game wins.*

## The game in one breath

**Processing Power** is a browser-based 3D idle RPG — a toon-shaded, ink-outlined world in an ATLA/Ghibli register, watched from a fixed orthographic camera. You and **Al**, your AI companion, set down on a world stitched together by **Ancient World Gates**. Processing Power (PP) is both the engine and the wallet; your *level* is the latest **chapter** you've crossed, and chapters are bosses — hand-fought story bosses in the 3D world, and Simulation Ladder wardens that Al re-climbs for you each rebirth. It is a "busy game," not a pure idle: offline, **only what you stocked keeps running**, so logging out is a puzzle you set up first.

## The four loops, smallest to largest

1. **Minute loop (hands-on):** walk the world — gather nodes, dig the mine, fight creatures, craft, talk to stations on your ship. Active play is never gated or taxed.
2. **Session loop:** short check-ins clear bottlenecks (reallocate Compute, restock hoppers, run a 5-minute field hunt for Override Keys to unstall the ladder) — plus one long session chasing the **momentum knee**, where rebirth yield visibly accelerates and the game "mathematically whispers *now is a good time*."
3. **Run loop — Recompile (rebirth):** resets only the run layer (PP pool, cap, ladder position) and pays **Archive Data** — watermarked so pushing a new personal best always pays extra and resetting only ever gains. Archive buys permanent amplifiers.
4. **Forever layer:** story chapters, skills, gear, materials, codex discoveries, Archive shop levels, and (planned) badge points never reset. Nothing you collect is ever dead.

## The systems, in design language

- **PP engine:** rate × cap, multiplied by a live chain every system feeds (rebirth amplifiers, boss trophies, challenge rewards, factory ring…). A **tripartite investment board** (rate / capacity / power) is the slow, rebirth-scale layer; *power = sink-effectiveness* everywhere.
- **Chapter Chain (the spine):** one integer. Odd rungs are the seven beat-once **story bosses** (Scrap Tyrant → the Unmaker, plus later additions); even rungs are **Sim Wardens** (W10, W20…), infinite past the story. Chapters gate tabs, zones, and the right to buy Al's modules. Zone gates are never "hold X PP" — hoarding fights the sink economy.
- **Simulation Ladder:** infinite deterministic auto-combat Al runs from the ship. Bands of 10 tiers reuse the field creature roster with rank prefixes. Wardens gate each band and cost **Override Keys**, minted deterministically from field kills of that band's creature family (5 kills = 1 key — the unstall path is never RNG). Failed pushes salvage fragments (death-as-harvest); cleared bands become aimable farms.
- **Compute (Al's attention):** the session-scale allocation board. Assign units to ladder / drones / extractors / holodeck / processing / factory lines; **≥1 unit = the system runs unattended and offline at full rate, 0 units = dormant**. Al capability modules (Key Tracker, Overflow Routing, Farm Director, Foreman; more planned) are chapter-unlocked, PP-and-materials priced. Al IS the automation — no scripting editor, ever.
- **Skills/stats:** 14 stats on one shared curve, leveled by idle trainers today — the neural implant siphons PP income into a stat; holodeck programs train two stats while *de-leveling* a third (real costs, NGU-style). The previously planned Phase F skill web is **NOT assumed under 8.1** — stats likely hang off gear + implants (the cyborg frame), but that needs an owner ruling first.
- **Production:** resource nodes with tool gates → crafting queue → factory machines fed from per-machine hoppers → processing chains → passive extractors → drones with mission queues → a 5×5 spatial assembly grid. All of it obeys the stocked-offline rule.
- **Combat:** stat-toll encounters against archetyped creatures (armor, dodge, status effects, rage ramps; bosses get a phase 2). Difficulty is the toll, not execution — an action/dodge layer is **explicitly vetoed**. Field combat's job is to *feed* the ladder (keys, drops, XP), never to be a multiplier you feel bad for ignoring.
- **Trials, codex, extras:** constrained challenge runs pay permanent multipliers; the codex logs every discovery (planned: a badge-point engine where every entry feeds one forever-growing multiplier); a pedometer makes walking an identity (step-spends are the alternate zone unlock); **Quantum Crystals** are the premium-shaped currency — earned only, never bought, and they buy time/capacity, never power.
- **Offline:** stocked systems resolve at full rate for up to the buffer (12 h base, upgradeable to days); dormant systems say so in the away report, which is how the game teaches the pre-logout puzzle. No dailies, no streaks, no calendar anything — ever.

## The world (16 zones and counting)

Hub: the **Landing Site** — meadow, survivor camp (Mara & Finch), your delta-wing ship the **Starwing** (walk in through the rear cargo ramp), a mine adit in the mountain's foot. The **Spaceship interior** holds every "console" station: fabricator, offload, charging, drone monitor, mastery, combat rig, the holodeck training chamber, and the Ascension Terminal where Recompile lives.

- **The Mine** — dig-anywhere procedural cave that re-rolls every delve; its deepest chamber is **the Breach**, a gallery of five Ancient World Gates.
- **The Depths** — the cave's lower stack; home of the Unmaker.
- **Verdant Maw** — bioluminescent night jungle: a plant-folk NPC hamlet (Elder Sylva, Bram, Sprig — enterable homes), a canopy level climbed via the Hometree's helical ramp and walked across branch bridges, a four-river northern expanse that phases from teal night into the warm amber **Emberglade** sanctum.
- **Frozen Tundra** → **Glacial Hollow** (ice cavern, the Rimefather) → **Meltwater Rift** (ice-to-ember junction cavern with two thresholds: the still-sealed **Sunken Door**, and the **Ember Chasm** down to…)
- **The Cinderforge** — volcanic forge-maze where the World Gates were cast; Great Anvil sanctum; a Forgemaster golem who is only a statue, *for now*.
- **Atlantis** — drowned city beyond the Breach, opened by the Unmaker's clearance; its back-door chamber holds the gate to **the Labyrinth** — an ancient stone maze whose Minotaur is also only a statue, *for now*.
- **Lagoon Coast**, three NPC home interiors, and small door-zones round out the count.

Fauna: ~20 rigged, animated creatures in per-zone packs (each zone has a native roster with distinct combat mechanics); lore is delivered through codex entries that auto-discover on first visit. The larger story arc (the "Kernel Heist") is deliberately parked.

## Design laws — the 8.1 Locked list (owner, 2026-08-01)

The log of record is `Plans/Design-plan-8.1.md`; only its **Locked** bucket is doctrine. (The old `DESIGN-DECISIONS.md` is retired — several of its "laws" were recorded backwards. This section previously carried four of those inversions; they're corrected below.)

- **Gear-as-level.** Gear tier is a core measure of progression, the Crashlands/NGU way. *(The old "gear-as-level rejected" was exactly backwards.)*
- **Combat is time-based, in a breakaway window** — NGU-style resolution in its own screen, Pokémon flow: meet it in the 3D world, fight opens its own screen, return.
- **No dodge/execution mechanic.** Stats and timing, never player reflexes.
- **Guaranteed floors, lucky tops.** Gates always have a deterministic floor (counted attempts, pity, shards); an advertised low drop chance may ride on top. RNG is only ever upside; troll odds live only in the non-blocking flavor lane. *(Replaces the stricter "deterministic unblockers, never RNG walls".)*
- **Crafting stations, Satisfactory-style.** Plain workstation early; advanced items demand special stations you build and unlock.
- **Rarity matters everywhere.** Schematics call for specific rarities; commons never go obsolete.
- **Offload is the prestige.** You dump collected data into the computer to start a new run; its accumulated learning carries forward.
- **Ship parked, not crashed; portals live in the cave near the Landing Site.** World facts.

Now **open, not settled** (the old log had these as hard vetoes — they weren't): monetization ("no real-money anything" was a session mistake), dailies/streaks/calendar cadence, skills/stats under 8.1 (Phase F is NOT assumed — owner ruling required), the multiplier chain's structure, Al's identity. When in doubt on anything else, the owner's north star: **be the most like NGU** — this game's original addition is space × time (one body, real distances).

The six reference-game studies (NGU Idle, FAPI, Idle Spiral, RuneScape, The Perfect Tower 2's mine/factory, Crashlands) remain the gene pool — steal their *shared* patterns, not any one identity.

## Where the build stands (2026-07-31)

Integration phases A–E are shipped (honest multiplier chain, infinite ladder, Recompile + Archive, Chapter Chain, Compute + stocked offline — save v14; the Generation Engine's buildable computer landed 2026-08-02, save v15). **The 8.1 direction is adopted (2026-08-02):** the build order is now the handoff doc's M0–M7 adoption ladder (vocabulary re-anchor → combat window → gear-as-level → blueprint brain → Ichor + offload rhythm → space compression → sinks → cyborg framing), each step playable and save-migratable. Phase F (skill web) and Phase G (loot layer) from the old Integration plan are NOT assumed — see the migration map in `Plans/Design-8.1-Vision-Handoff.md` §12 for every live system's fate. Recent months were a world-and-art sprint: 16 zones, native creature packs, vertical terrain, the asset pipeline below.

Open hooks the world already foreshadows: the Sunken Door zone, a Forgemaster boss + chapter rung, a Minotaur boss, a sink for the ladder's banked Archive Fragments, glacier scene-swaps (overlook, sub-glacial gallery), repeatable NGU-style challenges, the Kernel Heist arc.

## Production realities (what the code side makes cheap or expensive)

Ideas land differently depending on what the engine already does well. Solo dev + AI sessions; wiring checklists are enforced by tests, so the well-trodden paths are genuinely fast:

**Cheap (days or less):** a new zone (routine checklist — recent zones ship in a session, including tests); new creatures, bosses, NPCs, and props (an AI text/image-to-3D → Blender pipeline turns a described creature into a rigged, animated, in-game model reliably); new panels/tabs; new materials, recipes, drop tables, codex lore; vertical/multi-level terrain (ramps, canopies, glacier shelves are now ordinary); maze/interior/door zones; reworking live systems (save migrations are routine).

**Expensive or off the table:** real-time action combat (combat is stat-resolution, and the dodge veto stands); physics (no jumping/falling — elevation is walkable surfaces); camera changes (the fixed ~46° orthographic view is the art's foundation — everything is composed and judged at that pitch; players get zoom only); multiplayer (client-authoritative, server is an optional sync layer — every design must stand fully offline in a browser tab); anything leaning on shadows or photoreal lighting (toon + glow is the language, and night zones rely on it).

**Useful ambient facts:** runs in a plain browser tab with no build step, phone play is a supported target (perf budgets are actively managed); the number formatter is comfortable to ~1e33, so exponential ladders have years of headroom; deterministic math is preferred everywhere (seeded generation, closed-form offline resolution).

## What to give a chat session, and when

- **Always:** this brief + `Plans/Design-plan-8.1.md` (the log of record) + `Plans/Design-8.1-Vision-Handoff.md`.
- **Progression/economy ideation:** add `Plans/Integration-Design.md` (formulas and gate tables — still the reference for the live systems' math, but its phase plan is superseded by the 8.1 migration map).
- **Deep dives on request:** the six reference-game studies (`Plans/*-Design-Reference.md`, big files — name the one you need); `Plans/ProcessingPower-Systems-Inventory.md` (code-level formulas and wiring health); codex/lore text (ask a code session to dump it).
- **Not useful for ideation:** `CLAUDE.md` / `STATUS.md` (implementation-facing), and the `*_compact.txt` source dumps (those are the actual code, for coding sessions only).
