# Processing Power — Game Analysis

## What This Game Is

**Processing Power** is a browser-based 3D idle RPG built with Three.js, rendered in an orthographic top-down view with toon shading and bold outlines (Avatar/Ghibli-inspired aesthetic). You play a cyborg who landed perfectly on an alien planet and must explore, gather, craft, fight, and build — all while a core number ("Processing Power" / PP) ticks up passively and can be spent, offloaded, or ascended.

The game is entirely client-side (ES6 modules, no build step). An optional Node.js + PostgreSQL server syncs saves.

---

## Games It's Emulating

### 1. **NGU Idle** (4G) — Primary Inspiration
The DNA is unmistakable:
- **PP = EXP** — a single number that grows over time and is spent on everything
- **Offload = Rebirth** — sacrifice current PP for permanent cap growth (prestige layer 1)
- **Ascension = Sadistic mode rebirth** — reset cap progress for permanent multipliers (prestige layer 2)
- **Tripartite Allocation** — mirrors NGU's "Energy / Magic / Resource" split, routing a passive flow into Capacity / Power / Rate.
- **Optimization Console (Mathematician)** — paid analysis window revealing ROI, very reminiscent of NGU's "Calculator"
- **Modifiers** — trade-off toggles (max 2 active) — echoes NGU's "Beard" or "Wish" trade-off systems
- **Quantum Crystals / TimeWarp** — premium currency drip for skip/boost, similar to NGU's "AP" system
- **Achievement milestones** — every 5th achievement awards a crystal, just like NGU's AP-per-milestone model  ———— I am not aware of the crystal reward ————

### 2. **Melvor Idle**
- The walk-around-and-gather loop with energy costs, tool requirements, and crafting mastery tracks feels very Melvor-like
- Zone-locked gathering with specific tool requirements (Harvest Blade, Dive Tool, Cryo-Pick) parallels Melvor's skill-gated content
- Crafting Mastery XP tracks per recipe category

### 3. **Pokémon** (Combat Only)
- The combat window is explicitly Pokémon-style: player sprite back-facing, enemy facing, HP bars, FP ring (like a PP gauge), Fight / Skills / Items / Run menu
- Turn-based with auto-attacking enemies on timers rather than strict turns

### 4. **Factorio / Satisfactory** (Lite)
- Factory System, Constructor, Assembly Matrix, Extractor, Processing Nodes, Refinery — this is a lightweight automation pipeline
- Construction mode with a snap-to-grid tile placement system

### 5. **Cookie Clicker / Idle Champions** (Drone System)
- Drones are classic idle-game "workers" — assign to gather, send on timed missions, collect loot
- Upgrade efficiency, unlock more drones, exponentially scaling costs

---



---

## What's Missing (The NGU Gap)

These are systems NGU Idle has that Processing Power either lacks entirely or has only in embryonic form:

### 🔴 Critical Missing (Core to NGU's Loop)

1. **Adventure Mode / Idle Adventure** — NGU's adventure zone is a full auto-battling zone progression where you idle through enemies for drops to power other systems. Processing Power has manual walk-to-enemy combat but no idle combat zone grind where you AFK and enemies die automatically while you accumulate drops. The auto-combat toggle exists but is only usable during active manual encounters.

2. **Number Growth Visualization** — NGU's magic is watching numbers go up with satisfying visual feedback. PP grows silently in a corner. There's no graph, no animation, no "numbers going brrr" moment. No running tallies of "PP gained this session," no speed comparisons.

3. **Multiple Parallel Resource Bars** — NGU has Energy, Magic, and Resource 3 as three independently managed bars, each with their own cap/speed upgrades that you split across features. Processing Power has only PP. The Tripartite system is close but it's a single passive flow, not three independent currencies you actively manage.

4. **Omitted**

5. **Idle Skill Training** — NGU lets you dump energy/magic into skills that train over time (Attack, Defense, Block, etc.). Processing Power's stats are PP-bought level-ups, not time-invested training. There's no "assign energy to train Strength for 4 hours" mechanic.

### 🟡 Important Missing (Depth & Retention)

6. **Boss Fights / Boss Milestones** — NGU's bosses gate meaningful progression. Processing Power has 3 enemy archetypes (Rusher, Swinger, Burst) but no bosses, no boss rush, no boss-tied unlocks. ————I need many more archetypes———

7. **Titans / Mega-Boss Scaling** — NGU's Titans are long-term goals. No equivalent exists.

8. **Equipment Merging / Item Management** — NGU has equipment slots where you boost items by merging copies. Processing Power has crafted equipment but no merge, no leveling, no set bonuses, no legendary items.

9. **Wishes / Long-Term Goals** — NGU's wish system is a massive long-term sink. No equivalent exists.

10. **Hacks / Endgame Systems** — NGU's hack system is another endgame currency layer. Nothing similar here.

11. **Challenges** — NGU's challenges (Basic, No Rebirth, Troll, etc.) add variety and permanent bonuses. No challenge system exists.

12. **Inventory Merging / Auto-Merge** — NGU's inventory management is a game-within-a-game. Processing Power's inventory is a flat material bag.

13. **Yggdrasil / Fruit Tree System** — Periodic harvesting mechanic (eat fruit for bonuses). No equivalent.

14. **Blood Magic / Ritual System** — Sacrifice resources for specific bonuses. The offload system is close conceptually but much simpler.

15. **NGU Energy/Magic Attacks** — Post-rebirth persistent upgrades tied to the energy bars. Processing Power's Tripartite is the closest analog but lacks the depth.

### 🟢 Nice to Have (Polish & Story)

16. **Story / Narrative** — You mention wanting more story. Currently there's a quest system with light flavor text but no actual narrative, no characters, no dialogue, no plot twists. The sci-fi premise should be a deliberate landing on an alien planet; the hook is why this cyborg arrived, what the portal-linked realms are doing, and what the planet is processing.

17. **NPC Dialogue / Characters** — No NPCs beyond enemies. No quest-givers, no merchants, no companions. 

18. **Lore Delivery** — The Codex has short flavor blurbs but no readable logs, no data pads, no environmental storytelling.

19. **Visual Feedback for Progression** — No base-building visual changes, no world transformation as you progress, no "before/after" moments.



---

## What I'd Suggest

### For Immediate Impact (You Can Do Now)

1. **Idle Adventure Zone** — Add a zone where combat auto-runs. Player picks a difficulty tier, enemies spawn on a timer, auto-combat kills them, drops accumulate. This is the #1 NGU-like feature missing.

2. **PP Growth Visualization** — Add a session stats panel: PP/s graph, total PP earned this session, time played, a big satisfying number counter with comma separations and color pulses when milestones hit.

3. **Boss System** — Gate zone progression behind bosses. Each zone's final enemy should be a boss with unique mechanics. Defeating a boss permanently unlocks bonuses.

4. **Challenge System** — "Complete Offload → Ascension without upgrading Strength" for permanent small multipliers. These add massive replayability.

5. **OMITTED**

### For Medium-Term Development

6. **Story System / Narrative Engine** — Write a narrative layer: data log entries found while exploring, NPC radio transmissions that play during idle periods, a main story about why you landed on this planet and what's on this planet. The cyborg/alien-planet premise supports a Mass Effect meets NGU vibe. ———— I like your contribution of Mass Effect. I was also thinking along the lines of Stargate since the realms are tied together via portals; but I don't want it's lore just the overarching concept————

7. **Equipment Merge/Upgrade System** — Let players combine duplicate gear for stat boosts. Add set bonuses. Add rarity tiers with visual indicators.

8. **Third Prestige Layer** — After Ascension, add a "Transcendence" or "Synthesis" layer that resets ascension progress for a fundamentally new mechanic (new resource type, new zone type, new combat dimension).

9. **Idle Skill Training** — Let players assign PP-per-second into individual stats to train them over time, rather than lump-sum purchases. This is core NGU and it's deeply satisfying.

10. **Wish / Long-Term Goal System** — Ultra-expensive permanent upgrades that take hours/days of PP investment. Gate endgame content behind them.

---

## What to Brief a More Capable AI Model On

If you're handing this to a more capable model for deep planning, here's what they should focus on:

### Architecture & Scaling
- **The callback wiring in [main.js] is already 500+ lines** of monkey-patching (`_orig` pattern). This needs a proper event bus / mediator pattern before adding more systems.
- **Save system versioning** — Currently at v4+, but adding more systems means more migration paths. Plan a proper schema migration strategy.
- **The [Environment.js] is 1,300+ lines.** Zone logic was partially extracted to `js/scene/zones/` but the base class is still massive. Continue the extraction.

### Game Design (NGU Parity)
- **Map out all NGU systems** and score Processing Power against each one. Prioritize by "engagement impact × implementation cost." The model should read NGU's wiki thoroughly.
- **Design the Energy/Magic/Resource 3 equivalent** — How do three independent currency bars map to the sci-fi theme? (Compute / Bandwidth / Storage? Processing / Memory / I/O?)
- **Design the Adventure Mode idle loop** — Auto-combat zone with scaling difficulty, drop tables, boss gates, idle progress calculation.
- **Plan prestige layers 3, 4, and 5** — Each should introduce a fundamentally new mechanic, not just bigger multipliers.

### Story & Narrative
- **Write a story bible** — Who is the cyborg? Why did they land here? What's on this planet? What's the endgame revelation? Plan 5-10 "Acts" that unlock as the player progresses through prestige layers.
- **Design an NPC system** — Radio contacts, AI companions, hostile faction leaders. Each should tie into a system (a merchant NPC → unlock shop, a researcher NPC → unlock tech tree branches).
- **Environmental storytelling** — Each zone should have discoverable lore (data pads, probe logs, alien ruins) that piece together the planetary mystery.

### Content Pipeline
- **Enemy archetype expansion** — Only 3 types exist. Plan 10-15 archetypes with unique mechanics, status effects, and drop tables.
- **Equipment crafting tree** — Map out Basic → Good → Rare → Epic progression paths for all 8 equipment slots. Design set bonuses.
- **Zone content density** — Most zones are open areas with scattered nodes. Plan meaningful POIs, mini-dungeons, hidden areas.

### Technical Debt
- **Event system** to replace the `_orig` monkey-patching
- **Module-level state management** (currently everything held in closure in `main.js`)
- **Performance profiling** — 8 zones × GLB models × particles = potential frame drops on mobile
- **Test coverage** — Only one test file exists (`tests/runAll.test.js`). Plan unit tests for core systems.
