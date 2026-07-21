# Crashlands — Systems & Design Reference

*A design study of Crashlands (2016, Butterscotch Shenanigans), written for borrowing ideas about progression, crafting, and friction design for a new 3D game. The game is a GameMaker build (`data.win`) that can't be decompiled with local tools, so this reference was researched against the community wikis, Butterscotch's own extensive design writing (dev blogs, GDC talks, interviews — they documented their reasoning unusually well), platform reviews, and two readable data files that ship with the game (`perk_def.json`, `ui_text_en.json`), with inline citations throughout. Confidence is flagged where sources thin out.*

*Crashlands is the outlier in this reference series: it isn't an incremental at all. It's here because it answers a question the idle games can't — **how much of a crafting RPG can you delete and still have a game?** — and because its progression spine (gear as level) is the cleanest alternative to XP ever shipped.*

---

## The Big Picture

1. **Gear is the level.** No XP, no character levels. Power lives entirely in crafted equipment on a clean exponential: item levels step +2 per crafting tier, and stats **double every 4 levels** (~×1.19/level — verified from wiki stat tables: 51 DPS at level 1 → 9,309 at level 33). That's incremental-game math expressed as discrete, craftable objects: the power curve is a *staircase* whose steps are crafting checkpoints, with zero power gained from time spent fighting.

2. **Quality is garnish, level is the axis.** Craft-time rarity rolls span a deliberately narrow band (Acceptable 105.5% → Legendary/Ludicrous 122% of white) — replayable excitement that never replaces the deterministic staircase. Two valves cap the RNG: legendaries are fixed recipes, and the Juiceforge upgrades an Excellent item to the ceiling for a fixed price — a purchasable pity system.

3. **Recipes are the loot.** Monsters drop ingredients and *recipes*, never finished gear — mid-development, Butterscotch rebuilt the whole unlock flow around drip-fed recipe drops after playtesters skipped 350 recipes granted in bulk. Crafting is the sole power faucet, so loot excitement and crafting never compete.

4. **The friction-deletion ledger.** Infinite self-sorting inventory, auto-pickup, tools-as-permanent-knowledge (craft an axe once, harvesting is hands-free forever), self-managing quest items. The methodology matters more than any single deletion: *delete frictions that aren't decisions, keep frictions that are* (workstation trips stayed — "home" must mean something), and give every deletion a named compensator (storage scarcity → recipe quantity × acquisition danger). One deletion cascaded into the architecture: infinite inventory is what forced gear-as-level.

5. **One creature, three bands.** Every species ships as Normal → Powerful → Epic named variants (+size grades), stretching one art asset across a 13-level band; elites drop everything below *plus* the exclusive Essence that upgrades your tamed pet of that species — your companion grows only by hunting its scarier kin. Pets' combat stats scale with the player forever; only buff magnitudes are tier-gated, so no favorite ever becomes obsolete.

6. **Skill and stats stay orthogonal.** All combat difficulty lives in readable ground telegraphs and positioning; all side-damage (bombs 75–300%, gadgets 70–100%) is priced as *percent of weapon DPS* so nothing ever obsoletes; death costs a walk, never power. Higher difficulties raise enemy *damage* far more than HP — punishing misreads harder instead of making fights longer.

7. **The catalog is a meta-game.** The BscotchID cross-game perk system (ground truth: this folder's `perk_def.json`) mints rewards *across the studio's other games* — beat a Crashlands boss, and a vendor in Quadropus Rampage starts selling that boss's weapon. Achievements as cross-product marketing and retention, built from nothing but counters and reward tables.

## Contents

1. **Gear as Level** — progression without XP
2. **Crafting, Workstations & Recipes** — the tech tree as quest structure
3. **Combat** — telegraphs, damage types, gadgets & the death penalty
4. **Creatures, Taming & the Tier System** — one design, three bands
5. **World Structure, Quests & Pacing** — biome bundles and the staircase economy
6. **The QoL-First Philosophy** — the friction-deletion ledger & cross-game perks
7. **Distilled Playbook** — the transferable patterns, collected

---

## Gear as Level: Progression Without XP

### 1. What it is

Crashlands (2016) is a top-down crafting action-RPG in which the player character has no experience points, no skill points, and no character level. Your power level *is* the item level of the gear you have crafted and equipped — weapons, armor pieces, and trinkets. The loop: explore a biome → harvest materials (tools are passive knowledge, harvesting is one tap) → recipes drop as loot from the things you break → craft higher-level gear at workstations → now-survivable enemies yield the next tier's materials → repeat, with story quests marching you across three biomes. Steam's own feature copy states the thesis plainly: "Become more powerful through creating ever-more-amazing items!" (Steam: About This Game).

### 2. Mechanics & math

**Item level is the power scalar.** Equipment comes in odd-numbered levels stepping +2 per crafting tier (1, 3, 5 … 33), and stats roughly **double every 4 levels** (two tiers). Documented examples: a white Level 5 helmet gives 141 HP vs. 288 HP at Level 9; a Level 1 sword deals 51 DPS vs. 192 DPS at Level 9 (wiki: Level (Crashlands), bscotch.wiki.gg). That is a compounding ~19%/level curve — exponential growth, the same math family incrementals live in, just expressed through discrete craftable objects.

**Level bands track world/story progression** (wiki: Level):

| Biome | Creature/gear level band |
|---|---|
| Savanna | 1–9 |
| Bawg | 11–21 |
| Tundra | 23–33 |

Each creature family spans six variants (three sizes plus "powerful" and "epic"), each +2 levels — so the biome itself is a graded ramp, not a flat zone.

**Quality is rolled at craft time.** Every non-legendary weapon/armor craft rolls a rarity (wiki: Item Qualities (Crashlands); fandom: Items (Quality)):

| Quality | Color | Armor props | Weapon props | Stat value vs. white |
|---|---|---|---|---|
| Normal | White | 3 | 4 | 100% |
| Acceptable | Green | 4 | 5 | 105.5% |
| Satisfying | Blue | 4 | 5 | 111% |
| Excellent | Pink | 5 | 6 | 116.5% |
| Legendary / Ludicrous | Orange | 5 | 6 | 122% |

Tier names confirmed against the install's `E:/Games/steamapps/common/Crashlands/ui_text_en.json` (contains "Acceptable", "Satisfying", "Excellent", "Ludicrous", "Legendary"). Weapons always carry one more property than armor. Roll probabilities per quality are **not publicly documented** — treat the odds as unknown; the fandom wiki adds that a legendary property is ~3.8x a white property's power (moderate confidence, single source). Properties draw from a pool of combat riders — crit chance, burn chance, vampire (leech) chance, turbo (attack-speed proc), move speed, plus elemental damage-over-time flavors like Coldness/Toxicity; e.g., The Butterfly legendary: 2 attacks/sec, 240 DPS, 4 random stats including 12.20% crit (wiki: The Butterfly).

**Two determinism valves cap the RNG.** Legendary items are fixed recipes from boss/rare ingredients — never rolled. And the late-game **Juiceforge** upgrades an Excellent item to Ludicrous for a fixed cost (13 Crystallized Juice in story mode, 11 in hardcore) (wiki: Item Qualities) — effectively a pity system: gamble on cheap re-crafts, or pay a known price for the ceiling.

**Level-gap curves are the gate.** Enemies 4+ levels below your weapon take bonus damage (+10% and up); enemies above you impose 30–60% damage reduction by gap, and creatures 6+ levels above your gear present ~8x effective HP (wiki: Level). Crucially, **bosses scale to the highest gear tier you have *ever* equipped**, not your current loadout — deliberately down-leveling cannot trivialize them (wiki: Level).

**Fish weapons** are the alternate channel: one legendary fish-weapon per biome (Wobblygong, Jackagong, Bonkagong) caught rather than crafted, and the **Megagong** — the game's strongest weapon — comes from a quest chain ending in the Megagong Lure trinket (wiki: Fishing, Megagong Lure). Fishing is a sidegame whose payout is top-tier *gear*, keeping even off-loop activities denominated in the one power currency.

### 3. Interconnections

Gear-as-level sits downstream of everything: harvesting (fed by tools-as-knowledge — tools are permanent unlocks, never equipped or consumed), recipe drops, workstations, and boss ingredient drops. It feeds combat viability, biome access, and boss difficulty (via the highest-ever-tier scaling). Two design tensions are worth noting. First, monsters drop *ingredients and recipes, never finished gear* — Butterscotch redesigned mid-development so recipes themselves drop as loot, restoring the Find → Break → Build loop after playtests showed players skipping 350+ recipes to rush stations (BScotch on Game Developer: "How we unbroke our crafting system"). Crafting is therefore the *sole* power faucet; loot excitement and crafting never compete. Second, RNG quality vs. player agency: the craft-time gamble creates slot-machine re-craft appeal, and the Juiceforge/legendary recipes exist precisely to drain frustration out of that gamble.

### 4. Pacing & gating

The power curve is a **staircase, not a slope**. You gain zero power for time spent fighting; you gain a discrete chunk each time a crafting checkpoint is reached (~17 gear levels across the game). Walls sit at biome seams — the jump from Savanna's cap (9) to Bawg's floor (11) forces a full regear — and at workstation unlocks, which are story/boss-gated. The level-gap DR/HP curves make gates *soft*: you can poke above your band at a steep cost, or farm below it fast, but 8x HP at +6 levels is a wall in practice. The dev-stated rationale is their anti-friction philosophy rather than a single "why we cut XP" post (none was found — I'm reconstructing from their statements): Sam Coster calls the series a "thrival" game that "asks you to build on strengths rather than manage weaknesses" (Coster, Game Rant interview), and the whole design (infinite self-managing inventory, auto-retrieved tools) strips every system that isn't explore-fight-craft. Cutting XP follows directly: with no XP, *time cannot substitute for progression content* — you cannot over-grind past the designer's intended power band, so difficulty tuning at every story beat is exact, and there is no "grind 10 more levels" advice, only "go craft the next set." The cost: power is flat between crafts, which the quality-roll ladder, trinkets, and gadgets exist to fill with micro-upgrades.

### 5. Borrowable design lessons

1. **Make the power scalar an item, not a bar.** One number ("gear level") with ~2x-per-4-levels exponential scaling gives incremental-style growth while keeping every upgrade a tangible, craftable *thing* — perfect for a 3D incremental/RPG where you want visible avatar change per tier.
2. **Split deterministic level from randomized quality, and sell a pity valve.** Level = guaranteed staircase; quality roll = cheap replayable excitement; Juiceforge-style fixed-cost upgrade = frustration cap. An incremental can price the pity valve in a prestige currency.
3. **Scale gatekeepers to highest-ever power.** Ratcheting boss difficulty to peak-ever gear kills sandbagging exploits — directly applicable to incremental boss/prestige checks where players min-max stat snapshots.
4. **Drop knowledge, not gear.** Making recipes the loot keeps crafting the only power faucet and turns every kill into a possible *systemic* unlock — in an incremental hybrid, let drops unlock automations and multiplier slots rather than raw stat items.
5. **Gate with curves, not walls.** Published-feel DR/HP penalties by level gap (30–60% DR, ~8x HP) let players over-reach for a price, which reads as fairness instead of an invisible fence.
6. **Denominate side-modes in the main currency.** Fishing's jackpot is the best *weapon* in the game — optional systems should pay out in the one number players already care about, not a parallel currency that fragments motivation.

Sources: [Level (Crashlands) — bscotch.wiki.gg](https://bscotch.wiki.gg/wiki/Level_(Crashlands)), [Item Qualities (Crashlands) — bscotch.wiki.gg](https://bscotch.wiki.gg/wiki/Item_Qualities_(Crashlands)), [Items (Quality) — Crashlands Fandom wiki](https://crashlands.fandom.com/wiki/Items_(Quality)), [The Butterfly — Crashlands wiki](https://crashlands.fandom.com/wiki/The_Butterfly), [Fishing — Crashlands Fandom wiki](https://crashlands.fandom.com/wiki/Fishing), [Megagong Lure — Crashlands Fandom wiki](https://crashlands.fandom.com/wiki/Megagong_Lure), [How we unbroke our crafting system — Game Developer (BScotch)](https://www.gamedeveloper.com/design/how-we-unbroke-our-crafting-system), [Crashlands — Steam store page](https://store.steampowered.com/app/391730/Crashlands/), [Crashlands 2 creative director on survival mechanics — Game Rant](https://gamerant.com/crashlands-2-survival-game-genre-inventory-loot-crafting/).

---

## Crafting, Workstations & Recipes as the Quest Structure

### 1. What the system is

Crashlands has no XP, no skill trees, and no character levels in the traditional sense. The entire progression spine is a chain of ~19 crafting workstations spread across three biomes (Savanna → Bawg → Tundra): each station unlocks a band of recipes, those recipes produce the gear that *is* your level, and the resources those recipes demand pull you into progressively harder territory. The loop is: explore/fight → harvest resources (which also drop recipe *schematics*) → craft the next station and gear at your base → use that gear to reach the next resource tier. Story quests are threaded through this loop as the delivery mechanism for key schematics and boss encounters — "Quest givers often hold special recipes for powerful items... they are always the source of your encounters with Bosses" (BScotch blog: Crashlands, The Manual).

### 2. Mechanics & math

**The workstation tech tree.** Stations are crafted *at the previous station*, forming a strict chain. Community-documented unlock order (wiki: ULTAMATE GUIDE / Workstations — high confidence, corroborated across fandom and bscotch.wiki.gg):

| Biome | Main-chain stations (in order) | Side stations |
|---|---|---|
| Savanna | BS SSSS SS5 (crashed-ship starter) → Sawmill → Skinnery → Stoneshaper → Chemworks → Squathe → Fishiminea → Crystal Kiln | Kiln, Hearth, Water Pump |
| Bawg | Jollyscope → Jackweaver → Bioloom → Compressor → Centrifuge → Granvil | Cauldron, Thrombopump |
| Tundra | Shredbasket → Gastropestle → Tumbler → Burnchurn → Refinery → Foundry | Pressure Cooker, Slurrifier, Bagpump |

Each station is themed to an input material — Sawmill "builds items produced from logs, sawdust, and sticks" (wiki: Sawmill), Stoneshaper works flatstone, the Foundry (final station) works Lonsdaleite and Crystine into endgame gear and epic pets (wiki: Foundry). Station recipes are meaningful sinks: the Stoneshaper costs 27 Flatstone + 29 Logs + 5 Wompit Sinew and a 10-second craft (wiki.gg: Stoneshaper). Crafts take real time and stations run independently — the manual explicitly tells players to "run stations in parallel" (BScotch blog: The Manual), a light idle-production layer.

**Recipe acquisition — the deliberately redesigned part.** In alpha, building a station dumped its full recipe list at once ("OMG 34 NEW RECIPES I AM GOING TO VOMIT"), which players found alternately boring and overwhelming and which incentivized rushing stations. BScotch's documented fix (BScotch/Gamasutra: "How We Unbroke Our Crafting System"): a new station reveals only "a few key recipes at first — just enough to give the player some gameplay direction"; the rest arrive as **schematic drops from harvesting and combat**, so recipes became loot inside the find/break loop rather than a lump-sum reward for building. Critically, schematic drops appear keyed to your station state — players report that owning the latest station makes its schematics drop even from old-biome resources, and "if you get a new schematic but don't see it in any of your workstations... you need the next workstation. Quests usually lead to a workstation schematic" (wiki: ULTAMATE GUIDE). Drop-rate constants are not publicly documented — treat the *mechanism* as verified, the *numbers* as unknown.

**Tools are knowledge, not items.** Four tool families — Saws, Pickaxes, Fishing Rods, Trowels — gate resource access by tier (Saws: T1 Sawgrassaw → T2 Blastique Saw → T3 Jacksaw → T4 Sawstache → T5 Spinesaw; Pickaxes: Basic Pickaxe → Shellfinger Pick → Clikkax → Shirkbeak Pick) (wiki: Tier, Tools). Once crafted, a tool is never equipped, never selected, never breaks: it passively adds harvest capability to your normal attacks, and clicking a node once auto-harvests it ("Just click ONCE... Flux will keep smacking it" — BScotch blog: The Manual). A tool craft is effectively a permanent account-level unlock flag wearing an item costume.

**The level math it feeds.** Character level is derived entirely from equipped gear. Gear tiers advance level in +2 steps, and stats **double every two tiers (four levels)** — exponential scaling under the hood. Biome creature bands: Savanna L1–9, Bawg L11–21, Tundra L23–33 (wiki.gg: Level — medium-high confidence; formula phrasing is community-derived). So the crafting chain above is, literally, the level curve: ~19 stations ≈ 33 levels.

**Inventory as enabler.** None of this works without infinite, self-managing inventory — born from Adam Coster's "what if you never had to manage your inventory?" moment; they scrapped the inventory screen and surface materials only in crafting context (GDC 2017 postmortem, "The Last Game I Make Before I Die," via gamedeveloper.com). Zero-friction hoarding is what lets recipes demand 27-of-this, 29-of-that without pain.

### 3. Interconnections

Feeds in: combat (creature drops + schematics), harvesting (resources + schematics), quests (schematics, station unlocks, boss access), infinite inventory (frictionless stockpiling). Feeds out: gear (= level = combat power), tools (= map access), stations (= next recipe band), pets and base items. The elegant closure: better gear kills higher-band creatures → whose drops are the ingredients for the next station → which unlocks the recipes that consume those drops. Tension: because schematic drops track your station state, exploration never goes stale — but the same coupling means a player who misses a quest-gated station perceives a content drought ("do more quests and it will show up" is the wiki's stock answer), and side-station clutter (Cauldron, Thrombopump, etc.) can obscure the critical path.

### 4. Pacing & gating

Three nested gates: (a) **hard story gates** — biome transitions require questline completion, e.g. Grandmammy's long questline at the Creeping Rift opens the Bawgaporter to the Bawg, and Hewgodooko is the Savanna capstone boss whose defeat pays out schematics (wiki: Biome walk throughs, ULTAMATE GUIDE); (b) **tool gates** — each biome's resources need that biome's tool tiers, so a new biome briefly re-runs the "can't harvest yet" arc; (c) **soft stat gates** — the +2/doubling level math makes fighting one band up painful and two bands up suicidal, without any explicit "you must be level X" wall. Walls land at biome boundaries by design; within a biome, pacing is smoothed by drip-fed schematics rather than recipe dumps.

### 5. Borrowable design lessons

1. **Make stations the level curve.** For an incremental/RPG hybrid: let crafting/production tiers *be* character level — it converts "grind XP" into "acquire, automate, and spend resources," which is exactly the verb set incrementals are good at.
2. **Recipes as loot, drops keyed to tech state.** Drip recipes from the harvesting loop, filtered by the player's current station — old zones stay rewarding, and every drop is guaranteed near-term relevant. Ideal for prestige layers: re-visiting early content with new drop tables.
3. **Tools as permanent knowledge flags.** One-time crafts that permanently upgrade a global verb (harvest, mine, fish) — no toolbars, no durability, no re-equipping. In an incremental this maps perfectly to unlock-style upgrades and costs nothing in UI.
4. **Stations craft the next station.** The tech tree consuming its own outputs (Skinnery builds Stoneshaper) makes each tier a tangible capstone purchase — a natural "milestone buy" for incremental pacing.
5. **Reveal 3 recipes, not 34.** Lump-sum unlocks overwhelm and get optimized into rushing; drip-feed preserves direction. Any game with big unlock trees should stage reveals inside the play loop.
6. **Delete inventory friction before scaling recipe costs.** Infinite auto-sorted inventory is the load-bearing QoL decision that lets material costs grow freely — an incremental with big-number costs should treat storage limits as a deliberate mechanic or remove them entirely, never as incidental friction.

Sources: [BScotch blog: Crashlands, The Manual](https://blog.bscotch.net/post/crashlands-the-manual/) · [BScotch/Game Developer: How We Unbroke Our Crafting System](https://www.gamedeveloper.com/design/how-we-unbroke-our-crafting-system) · [GDC 2017 postmortem via Game Developer](https://www.gamedeveloper.com/design/video-the-last-game-i-make-before-i-die-a-i-crashlands-i-postmortem) · [wiki: Workstations](https://crashlands.fandom.com/wiki/Workstations) · [wiki: ULTAMATE GUIDE](https://crashlands.fandom.com/wiki/ULTAMATE_GUIDE) · [wiki: Sawmill](https://crashlands.fandom.com/wiki/Sawmill) · [wiki: Foundry](https://crashlands.fandom.com/wiki/Foundry) · [wiki: Tier](https://crashlands.fandom.com/wiki/Tier) · [wiki: Tools](https://crashlands.fandom.com/wiki/Tools) · [wiki.gg: Stoneshaper](https://bscotch.wiki.gg/wiki/Stoneshaper_(Crashlands)) · [wiki.gg: Level](https://bscotch.wiki.gg/wiki/Level_(Crashlands)) · [wiki: Biome walk throughs](https://crashlands.fandom.com/wiki/Biome_walk_throughs)

---

## Combat: Telegraphs, Damage Types & Gadgets

### 1. What it is

Crashlands is a top-down crafting ARPG in which all combat is positional: every creature attack paints a "telegraph" (a shape on the ground) that solidifies as the hit becomes imminent, and the player dodges by *walking out of the shape* — there is no stats-based dodge, no stamina, and (in CL1) no dodge-roll button. The player's offense is a single auto-swinging equipped weapon whose headline stat is DPS, supplemented by activated gadgets, thrown bombs, and consumables on a hotbar. The loop: read telegraphs → reposition → land swings in the safe windows → harvest the corpse → craft a higher-level weapon that ends fights faster. The devs stated the goal was combat that is "accessible, allow for player mastery," and distinct from harvesting (BScotch blog: "Randomly Interesting Combat," Pre-Beta Devlog #2).

### 2. Mechanics & math

**Telegraph system.** CL1 telegraphs were "mostly just rectangles and circles" (BScotch blog: Crashlands 2 "Hand-to-Pan Combat," which retrospectively describes CL1 and adds arbitrary shapes plus a dodge-roll in the sequel). To fix combat going stale ~4 hours in, the devs added *randomized variance* rather than complexity: attack-placement "wobble" and secondary moves (e.g., a Glutterfly randomly firing 1-shot vs. 3-shot bursts; Wompits doing one or two stomps) (BScotch devlog #2). This is the key trick: difficulty lives in *reading*, not in hit/miss RNG.

**Weapon structure.** Three archetypes, one crafted per workstation tier since the v1.3 "COMBOver" patch (36 weapons added): Swords = fast attack speed + Bleed; Hammers = slow heavy hits + Stun; Axes = mid speed + Berserk (attack-speed frenzy, axe-exclusive) (BScotch blog: COMBOver patch notes). The displayed stat is DPS; per-swing damage = DPS ÷ Attacks/Sec (wiki: Status Effects lists both as stats). White-quality weapon DPS by level (wiki: Level — high confidence, wiki-tabulated):

| Level | Example weapon | DPS | Level | Example armor (helm) | HP |
|---|---|---|---|---|---|
| 1 | Sawgrass Sword | 51 | 1 | Loghat | 39 |
| 9 | Pearlscale Sword | 192 | 9 | Pearlhat | 288 |
| 17 | Tentaclax | 528 | 17 | Throak Headguard | 1,074 |
| 25 | Fursmasher | 1,995 | 25 | Smat | 5,070 |
| 33 | Redpoker | 9,309 | 33 | Redhat | 28,188 |
| 37 | The Megagong | 17,937 | 37 | Juicejockey VacuHelm | 68,055 |

Stats **double roughly every 4 levels** (2 workstations) — a clean exponential (~1.19×/level). Item quality is a tight multiplier band: Acceptable 105.5%, Satisfying 111%, Excellent 116.5%, Legendary/Ludicrous 122% of white (wiki: Level). Quality is a bonus roll, never the progression axis.

**Damage types & statuses.** Five damage channels — physical, fire, poison, electric, ice — each with a matching Resist and Power stat, plus proc statuses (Bleed, Acid = amplified physical taken, Stun, Freeze, Burn, Shock, Vampire, Berserk, Turbo, Time Warp) that roll as affixes on gear (wiki: Status Effects). The COMBOver patch added hidden **combos**: gadget/trinket effects that amplify when the target already has a status (e.g., Blo-Pipe poison hits harder on bleeding targets) (BScotch blog: COMBOver).

**Gadgets, bombs, consumables — all scale off player DPS.** Bombs deal 75–300% of your DPS (Stickybomb 75%, Gravelbomb 200%, The Slurricane 300% poison) (wiki: Bombs). Devices like the Flamethrower/Nematoblaster deal 100% of DPS as typed damage; Shock Guard 70%; Laser Leash 75% (wiki: Gadgets and Devices). Utility gadgets grant invincibility (DBot), time-slow (Chrono Shifter), battle teleport (Spacetime Folder), or heal 50% of *missing* HP (Life Enforcer). Four passive **trinket** slots add procs/resists (Baconband: 0.25% max-HP regen/sec; Safety Gogs: +10% crit) (wiki: Trinkets).

**Healing model.** No innate regen. Healing comes from: raw foods and crafted potions restoring flat HP that scales ~3 orders of magnitude across the game (Baconweed 81 HP → Pipey Healing Potion 125,060 HP), 20-minute elixirs (Elixir of Longevity: 0.5% max HP per 2s), vampire procs, and the regen trinket (wiki: Consumables, Trinkets). Consumables sit on a shared "eating" cooldown (the Eating Speed stat reduces it), and a hotbar slot "automagically equip[s] whatever is your best healing item" (BScotch blog: COMBOver) — QoL removing menu friction mid-fight.

**Death penalty — famously lenient.** On death you warp to your base and leave a gravestone holding only the last handful (~6) of resources picked up since leaving home; walk back and reclaim (wiki: General Tips; AppUnwrapper walkthrough). Gear, progress, and the infinite inventory are untouched. Death costs *time*, never *power*.

### 3. Interconnections

Combat is the bridge between crafting and progression: creatures drop the components for the next workstation's gear, and since gear *is* level (no XP), killing→crafting→killing is the whole engine. Everything secondary (bombs, gadgets, poisons) scaling off weapon DPS means one upgrade lifts the entire kit — no side-system falls behind. Tension: because enemy viability is keyed to your **highest-ever-equipped weapon level** (color-coded threat: red = 3+ levels above, white = 5+ below), and bosses auto-level to that same watermark, equipping a new weapon is a one-way ratchet (wiki: Level). Pets tank and enable gadget synergies (Swapscope position-swap, Laser Leash).

### 4. Pacing & gating

Three biomes are level bands: Savanna creatures start at levels 1–9, Bawg 11–21, Tundra 23–33; each species' variants (normal/powerful/epic) step +2/+4 levels (wiki: Level). Soft walls are mathematical, not hard-gated: enemies 4+ levels below you take +10% damage, enemies above you impose 30–40% damage reduction rising with the gap, so a +6-level creature has ~8× your-tier HP behind ~60% mitigation — "nearly impossible" (wiki: Level). Bosses can be outgeared for at most +25% bonus damage on lower difficulties. Difficulty ladder: Exploration / Normal / Challenging / Insane→renamed **Ludicrous** in v1.3; one community test measured Challenging at +25% enemy HP and +100% enemy damage vs. Normal, and on Ludicrous "most things will kill you with one hit" (Steam discussion: "Difficulty to play on?" — moderate confidence, player-measured; exact multipliers per mode are not officially documented). **Hardcore** is a separate unlockable remix mode: one life, minimal dialogue, faster/cheaper crafting, recipes drop from creatures, leaderboard score (BScotch blog: COMBOver). Note the design: higher difficulty raises *enemy damage* far more than HP — punishing telegraph mistakes harder rather than making fights longer.

### 5. Borrowable design lessons

1. **Scale consumables/side-damage as % of main DPS, not flat values.** In an incremental with exponential numbers, "Gravelbomb = 200% of DPS" never obsoletes; flat-damage items die within one doubling cycle.
2. **Put difficulty in readable telegraphs, mistakes in positioning.** Action skill stays orthogonal to the stat treadmill — vital for a 3D incremental/RPG where numbers, not reflexes, should decide the *floor* but play decides the *ceiling*.
3. **Cheap variance beats new mechanics for longevity.** Attack wobble + randomized secondary moves stretched creature freshness across long crafting gaps at near-zero content cost (BScotch devlog #2).
4. **Death = time, never power.** Gravestone with a few recent pickups, respawn at base; players stay bold. In an incremental, never tax accumulated currency on death.
5. **Exponential gear (2×/4 levels) + narrow quality band (105–122%).** Progression axis is loud and deterministic; RNG is a garnish players chase but never need — a clean template for gear-as-level.
6. **Auto-equip best heal, shared eat-cooldown.** One balancing knob (cooldown) instead of inventory micromanagement; QoL as a design feature, not a concession.

---

## Creatures, Taming & the Powerful/Epic Tier System

### 1. What the system is

Crashlands has 19 creature species spread across three sequential biomes (6 Savanna, 6 Bawg, 7 Tundra), and every one of them is simultaneously three things: an enemy with a telegraphed attack pattern, a loot source whose body parts are the crafting economy's primary input, and a tameable pet (wiki: Creatures). Creatures occasionally drop eggs; you craft the egg into an incubator, wait out a hatch timer (~5 minutes), slap it, and name the baby that pops out (wiki: Taming, Egg). The tamed pet fights beside you, grants passive stat buffs ("Symbiosis"), and can be "Embiggened" through two upgrade tiers — Normal → Powerful → Epic — mirroring the three wild variants of its own species. Butterscotch's stated intent was that "each creature provides a unique combat challenge and, once mastered, an equally unique pet" (BScotch blog: The Creatures of Crashlands).

### 2. Mechanics & math

**The tiered-variant trick.** Every species exists in three named tiers — the wiki's tables title the columns literally **Normal / Powerful / Epic** (wiki: Creatures) — and each tier gets a unique name and palette, not just a stat multiplier: Wompit → *Sterling Wompit* → *Womplord*; Vomma → *Tempered Vomma Momma* → *Sightless Vomma*; Lyff → *Dueven Lyff Broh* → *Max Lyff*. Within a tier there are also size grades (Wompit / Wompit Heifer / Wompit Bull). The Wompit page documents the resulting level ladder (wiki: Wompit):

| Variant | Tier | Level | Notable drops |
|---|---|---|---|
| Wompit / Heifer / Bull | Normal | 1 / 3 / 5 | Leather, Bone, Sinew, Toenail (+Intact Heart at Heifer+) |
| Sterling Wompit Heifer / Bull | Powerful | 7 / 9 | all above + **Sterling Wompit Essence** |
| Womplord | Epic | 13 | all above + **Womplord Essence** |

So one art asset (recolored, rescaled, renamed) covers levels 1–13 of a progression band. Powerful and Epic variants are rarer world spawns and behave differently: a normal Wompit only aggros if you harvest Sawgrass near it, while Sterling and Womplord variants aggro on proximity (wiki: Wompit) — the tier is telegraphed by behavior, not just color. Higher tiers drop everything the base drops **plus** tier-exclusive Essence, making them straightforward loot piñatas worth hunting. Exact spawn rates and HP/damage values per tier are not publicly documented; treat the level ladder as the reliable skeleton (confidence: high on structure/names/drops, low on hidden combat constants).

**Taming.** Eggs drop only from the **largest** variant of a species (e.g., Wompit Bull), never from bosses, and each species' egg can be obtained once (wiki: Egg) — taming is a per-species collection checklist, not a repeatable gacha. Notably, an early dev-blog design had a skill-based capture minigame (subdue, then a "circle of love" timing game; failure enraged the creature) (BScotch blog: The Creatures of Crashlands); the shipped game scrapped that for the frictionless egg-drop model — a very on-brand QoL simplification.

**Pet upgrades.** Each pet is upgraded via two species-specific **Creature Catalyst** craftables — e.g., Wompit Garter (→Powerful) then Wompogo Stick (→Epic); Slurb: Magnetic Bracelet then Trampoline (wiki: Creature Catalyst). Crucially, each catalyst requires **Essence dropped only by the wild variant of the next tier up** (wiki: Taming) — to make your pet Powerful, you must hunt Powerful wilds.

**Symbiosis (pet buffs).** The walking pet grants a themed percentage buff package that scales with tier, with documented values (wiki: Symbiosis). Representative rows:

| Pet | Buff theme | Normal | Powerful | Epic |
|---|---|---|---|---|
| Wompit | Toughness / Bicep Power | 7% / 3% | 8.5% / 4% | 10% / 5% |
| Glutterfly | Poison proc / Poison Power | 3% / 10% | 4% / 15% | 5% / 20% |
| Snorble | Berserk/sec | 1.5% | 2% | 2.5% |
| Gallum | Creature Hunting / Elec Resist | 75% / 7% | 125% / 8.5% | 150% / 10% |
| Gulanti | Treasure Hunting / Shock | 75% / 3% | 125% / 4% | 150% / 5% |

Note the curve shape: combat buffs step gently (7 → 8.5 → 10), utility buffs step steeply (75 → 125 → 150). Epic is roughly 1.4–2× Normal — meaningful, never mandatory. Meanwhile pet **combat stats scale with the player**, so a day-one pet remains endgame-viable (crashlands.net); only the buff magnitudes are tier-gated.

**Pets as producers.** A stationed pet can be "Fed" to produce a species-exclusive crafting ingredient (Wompit Milk) obtainable no other way (wiki: Taming) — pets are also idle resource generators.

### 3. Interconnections

Creatures are the hub of the whole economy. Creature parts (leather, bone, sinew) feed the crafting system, and since Crashlands has no XP — gear *is* level — creatures effectively feed the leveling system itself. Essence from rare variants feeds pet upgrades; pet symbiosis feeds back into combat power; two pets (Gallum, Gulanti) feed the loop itself by boosting creature-finding and treasure-finding. Tensions: only one pet walks with you at a time, forcing a choice between combat buffs, sustain, and farming utility; and upgrading a pet requires fighting the scarier wild version of the same species — your companion's growth is gated by your mastery of its kin, a elegant thematic and mechanical rhyme.

### 4. Pacing & gating

Species are banded by biome, and biomes are story/tier-gated, so each new region delivers 6–7 new attack patterns, new parts, and new pets as a bundled content drop. Within a biome, the Normal→Powerful→Epic ladder restates the same creatures at levels ~1–5, ~7–9, and ~13, stretching each species across the biome's whole lifespan. The walls: Powerful/Epic spawns are rare (essence farming is the grind), catalysts need additional crafted components, and the one-egg-per-species rule makes each taming event a landmark rather than a farm. Egg drops being "occasional" and restricted to max-size variants means taming naturally arrives mid-band, after you can reliably kill Bulls.

### 5. Borrowable design lessons

1. **One design, three bands.** A rename + recolor + behavior tweak (proximity aggro) turns one creature into levels 1–13 of content. For a 3D incremental, this is the cheapest content multiplier available — and named variants (*Womplord*, not "Wompit Lv.13") make repetition feel like discovery.
2. **Elites drop the upgrade currency, superset the base loot.** Higher tiers drop everything below plus an exclusive Essence, so hunting elites is never a tradeoff. In an incremental, make rare spawns the *only* source of a tier-up currency: it converts random grind into targeted hunts.
3. **Scale companions with the player; tier-gate only the bonus kit.** No pet ever becomes obsolete, so emotional investment is never punished — vital in long-horizon incremental games where deprecating a player's favorite unit is churn fuel.
4. **Companions as swappable multiplier slots.** Symbiosis is effectively an equippable buff loadout with a personality attached — combat multipliers step ~1.4×, utility multipliers ~2×, and utility pets (loot-find, creature-find) give idle-optimizers a farming loadout distinct from the fighting loadout.
5. **Strict-scarcity collection (one egg per species) as the retention meta.** A finite, visible checklist of 19 landmarks paces the whole game; incremental hybrids should keep the *collection* finite even when the numbers are infinite.
6. **Companions double as generators.** Stabled/fed pets producing exclusive crafting inputs is a ready-made idle layer: active play catches them, idle play milks them.

---

## World Structure, Quests & Pacing Without Levels

*Sourcing note: this chapter's dedicated research agent was interrupted by an API session limit, so unlike the other chapters it is written from general knowledge of the game, cross-checked against the verified facts in the neighboring chapters (biome level bands, boss watermark scaling, recipe drip-feed). It deliberately avoids precise numbers the other chapters don't corroborate.*

### 1. What the system is

Crashlands' world is one continuous, procedurally-arranged overworld on the planet Woanope, split into three biomes — Savanna, Bawg, Tundra — that function as hard progression bands (gear/creature levels 1–9, 11–21, 23–33, per the verified tables in the Gear chapter). The story spine is simple and load-bearing: delivery-woman Flux Dabes crash-lands, and recovering her packages while foiling the alien Hewgodooko drives her through all three biomes, fighting a mid-boss arc in each. Around that spine hang NPC side-quest chains per biome, and the whole thing paces 30–50 hours of play with no XP bar anywhere.

### 2. How pacing works without levels

The game replaces the XP curve with three interlocking gates:

- **Biome walls are resource walls.** Each biome's gear requires that biome's materials, and its creatures start ~2 levels above the previous biome's cap — the verified level-gap math (30–60% damage reduction upward, ~8× effective HP at +6 levels) makes entering early painful but not forbidden. The wall is a curve, not a fence.
- **Recipes are the quest rewards.** Story and side quests dole out workstation schematics and recipes, so narrative progress and power progress are the same object. A quest that "unlocks the Foundry" *is* a level-up.
- **Quantity is the time-cost knob.** With infinite inventory, the designers tune pacing by how *many* of a material a recipe wants and how dangerous its source is — scarcity of carrying was replaced by danger of acquisition.

The result is a staircase economy: bursts of power at each crafting checkpoint, with exploration, questing, and creature mastery filling the flats between steps.

### 3. Structural systems

- **Teleporter network.** Craftable/discoverable waypoints collapse travel once an area is mastered — the world stays large for discovery but small for logistics. Frictionless fast travel is the world-scale version of the game's QoL philosophy.
- **Base-building as expression, not necessity.** Workstations must live somewhere, which seeds a home base; infinite materials make building walls/floors pure creative play (the local `perk_def.json` confirms the studio leaned into this: perks for crafting 100 / 1,000 / 10,000 floors — a log-spaced ladder rewarding pure expression).
- **Quest design under QoL rules.** Because quest items self-manage and inventory never fills, fetch quests are tensioned by *where the thing is and what guards it*, not by carrying it home. Side chains introduce NPCs whose requests teach biome mechanics (new hazards, new creature behaviors) before the main story requires them.
- **The map as checklist.** Discovered resources, creatures, and quest-givers accumulate into a legible record of a biome's content; combined with the finite one-egg-per-species taming list, "have I finished this biome?" is always answerable — completion pressure with no completion percentage.

### 4. Interconnections & tension

The world layer is the delivery mechanism for every other system: biomes bundle new creatures (combat content), new materials (crafting content), new recipes (power content), and a boss arc (story content) into one package, which is why each biome transition feels like a sequel. The core tension is the one-way ratchet documented in the Combat chapter: bosses scale to your highest-ever gear, so over-farming a biome before its boss doesn't trivialize the fight — the world resists both rushing and grinding, funneling players into the intended band.

### 5. Borrowable design lessons

1. **Ship progression in biome-sized bundles.** New zone = new enemies + new materials + new recipes + boss arc, all sharing one level band — content drops feel like sequels, and the team can build them as vertical slices.
2. **Make quests hand out capability, not currency.** A recipe/schematic as a quest reward converts narrative into power directly — no XP middleman, no reward inflation.
3. **Tune pacing with quantity × danger, not storage.** In any game with generous inventory (which an incremental hybrid should have), recipe quantities and acquisition risk are cleaner time-cost knobs than carry limits.
4. **Collapse mastered space.** Cheap fast-travel to anywhere you've earned keeps a big 3D world from taxing the player twice — discovery is content, re-traversal is friction.
5. **Finite checklists over percentage bars.** One egg per species, one recipe list per biome, named rare variants — completion as a visible list of landmarks paces a long game better than a progress percentage ever does.

---

## The QoL-First Philosophy: Infinite Inventory & Friction Deletion

### 1. What It Is

Crashlands (2016) is a top-down crafting action-RPG in which you harvest resources from an alien world, craft gear at base workstations, and fight monsters — a Don't Starve-shaped game with every piece of administrative overhead surgically removed. Its defining design act was *deletion*: infinite self-sorting inventory, automatic pickup, automatic tool selection, self-managing quest items, and cross-platform cloud saves. The philosophy crystallized mid-development when Adam Coster complained about "digging through his inventory trying to find stuff" and the team asked "What if... you never had to manage your inventory?" — a change that, per the devs, "streamlined almost every other system within the game" (PocketGamer.biz: "The Making of Crashlands"; SuperPhillip Central interview, 2015). The studio later said flatly "we all hate inventory management in basically any game" and reframed the genre as a "thrival" game — thriving, not surviving (GameRant: Crashlands 2 interview).

### 2. The Mechanics: A Friction-Deletion Ledger

The productive way to study Crashlands is as a ledger — each row is a friction the genre treats as core gameplay, deleted, with a cost and a compensation. Mechanics below are well-documented (wiki, reviews, dev interviews); Crashlands publishes no formulas for them because most are binary design decisions, not tuned constants.

| Deleted friction | Replacement behavior | What the deletion cost | Compensating system |
|---|---|---|---|
| Inventory slots/weight | Infinite inventory; everything auto-collected, auto-sorted | Scarcity, loadout decisions, "trip planning" tension gone | Gating moved to *recipe tiers* and *biome walls*; quantity-based recipes (need 40x of a thing) restore time-cost without storage-cost |
| Manual pickup | Loot vacuums to the player | Micro-reward of clicking each drop | Juicy pickup VFX/sound; drops themselves stay visually loud |
| Tool switching | Tools are permanent *knowledge*: craft an axe once, Flux auto-equips the right tool per target; best weapon auto-selected in combat (TouchArcade review; PC Gamer review) | Loadout expression, durability economy, "wrong tool" tension | Weapon *choice* preserved where it matters (combat gear you craft is a real decision); harvesting gated by tool *tier*, not tool *possession juggling* |
| Quest-item babysitting | Quest items live in a self-managing log, never occupy player attention | Fetch quests lose inventory pressure | Fetch quests re-tensioned around *danger of acquisition* (the monster guarding it), not carrying capacity |
| Recipe/material bookkeeping | Craft menu shows needs vs. holdings anywhere; no memorization | "Discovery" of recipes as exploration reward | Recipes drip-fed by workstation tier and quest unlocks — discovery moved from UI archaeology to content pacing |
| Device lock-in | BscotchID (later Rumpus) cloud saves; one save moves phone↔PC↔Switch families of platforms (BScotch support: cloudsaves) | Non-trivial backend cost for a 3-person studio | They built the account platform themselves and amortized it across all their games |

**One friction deliberately kept:** crafting happens at base workstations, not from a pocket menu. That retained friction makes "home" mean something and creates the out-and-back loop rhythm. This is the tell that the philosophy is not "delete all friction" but "delete friction that isn't a decision."

**The BscotchID cross-game perk system** (ground truth: `E:/Games/steamapps/common/Crashlands/perk_def.json`) is QoL philosophy applied to *meta-progression across a studio's catalog*. Each perk is a counter (`goal`), earned in one `app`, with `rewards` that fire in *other* apps. Verified examples from the file:

| Perk (earned in) | Goal | Reward (in a different game) |
|---|---|---|
| "Cold Feet" — set foot in the Tundra (Crashlands) | 1 | Quantum Electrodongle powerup appears in Flop Rocket |
| "Gongin It" — acquire the Megagong (Crashlands) | 1 | Vendor sells the Megagong in Quadropus Rampage — the item literally migrates games |
| "Purple Fever" — wear full excellent armor (Crashlands) | 1 | Flux (Crashlands' protagonist) becomes a playable pilot in Roid Rage |
| "Duck Hunter" — destroy 200 space ducks (Flop Rocket) | 200 | Vendor sells Spaceducks in Quadropus Rampage |
| "Buddy System" — have 1 friend (BscotchID itself) | 1 | Unlock the Friendly Intern in Roid Rage |

Note the structural details: social actions are perks (friend counts, "ButterUp" gifting at 1/10/25/50), log-spaced grind ladders exist ("Craft 100/1,000/10,000 floors"), and `hideIfIncomplete` hides some perks until earned. Inbound flow exists too: four perks earned in BScotch's older mobile games unlock four hidden missions inside Crashlands (Steam guide: "How to unlock the hidden missions in Crashlands through Bscotch ID perks"). The file is fully localized (en/zh), confirming this was first-class content, not an afterthought.

### 3. Interconnections

Friction deletion is load-bearing for the rest of Crashlands' design. Infinite inventory *enables* gear-as-level: since you can't gate progression by scarcity of carrying capacity, power must live entirely in crafted equipment tiers — deleting inventory forced the deletion of XP. It also enables the "finger-painting" build mode (unlimited materials on hand means base-building is pure expression). The devs credit it with cross-platform parity: one streamlined UI "made both the mobile and PC versions of the game better" (PocketGamer.biz). The tension it creates: with no scarcity and no loadouts, the *only* remaining difficulty levers are combat execution and material acquisition risk — so creature design and biome danger carry all the weight. The perk system, meanwhile, converts each game's achievement layer into marketing and retention for every other game — the studio's catalog behaves as one connected meta-game.

### 4. Pacing & Gating

With storage and encumbrance gone, Crashlands paces entirely through: (a) three biome walls (Savanna → Bawg → Tundra), each a hard reset of resource and gear tiers; (b) workstation tiers that unlock recipe batches; (c) quest chains that dole out schematics; and (d) raw material quantities as the time-cost knob. Perk gating is counter-based with goals ranging from 1 (boss kills, biome entry) to 10,000 (floors crafted) — a classic short/medium/prestige spread (perk_def.json). The walls players actually hit are combat-power walls (undergeared for the next biome), never logistics walls — which is precisely the intent.

### 5. Borrowable Design Lessons

1. **Delete frictions that aren't decisions; keep frictions that are.** Inventory slots were bookkeeping, not choice, so they died; weapon crafting choice and workstation trips stayed. For an incremental/RPG hybrid: automate everything the player would do the same way every time (an incremental's core instinct anyway), and spend the reclaimed attention on real decisions.
2. **Every deletion needs a named compensator.** Crashlands moved scarcity from storage-space to recipe-quantity and biome-danger. Before deleting a friction, write down which system inherits its tension — if nothing does, the game flattens.
3. **Tools as permanent knowledge, not objects.** One-time crafts that permanently upgrade *capability* map perfectly onto incremental unlocks: "you can now harvest X, forever, hands-free" is an upgrade purchase, and it removes an entire class of UI.
4. **Let one deletion cascade.** Removing inventory forced out XP, durability, and storage UI, and forced in gear-as-level. Pick your boldest deletion first and let it dictate architecture, rather than trimming frictions one-by-one.
5. **Cross-game perks as a catalog-level prestige layer** (perk_def.json). For a studio or even a single game with multiple modes: achievements in one context minting content in another (items migrating, characters crossing over) is cheap to build (it's a counter + reward table) and makes every product advertise the others.
6. **Own the account/save layer early.** BscotchID/Rumpus made saves portable and perks possible; for an incremental — where players *live* in one save across devices — cloud-portable saves are near-mandatory QoL, and owning the identity layer is what unlocks lesson 5.

Sources: [PocketGamer.biz — The Making of Crashlands](https://www.pocketgamer.biz/the-making-of-crashlands/), [SuperPhillip Central — BScotch interview](https://www.superphillipcentral.com/2015/07/spc-interviews-butterscotch-shenanigans.html), [GameRant — Crashlands 2 not a survival game](https://gamerant.com/crashlands-2-survival-game-genre-inventory-loot-crafting/), [TouchArcade review](https://toucharcade.com/2016/01/20/crashlands-review/), [PC Gamer review](https://www.pcgamer.com/crashlands-review/), [BScotch support — cloud saves](https://www.bscotch.net/support/crashlands/cloudsaves), [Steam guide — hidden missions via BscotchID perks](https://steamcommunity.com/sharedfiles/filedetails/?id=1972346117), [GDC — Crashlands: Design by Chaos](https://gdcvault.com/play/1025089/-Crashlands-Design-by), and local file `E:/Games/steamapps/common/Crashlands/perk_def.json`.

---

## Distilled Playbook

Each chapter carries its own lessons; these are the cross-cutting ones — with an eye to what Crashlands adds *beyond* the incremental games in this series.

### The progression spine

- **Make the power scalar an item, not a bar.** Exponential growth (~2× per 4 levels) expressed as discrete crafted objects gives incremental-style math with tangible, visible avatar change per tier — the natural progression spine for a 3D game where you want power to be *seen*.
- **Deterministic staircase + narrow RNG band + purchasable pity.** Level is guaranteed; quality (105–122%) is a cheap re-craft gamble; the Juiceforge caps frustration at a fixed price. Three layers, each doing one job.
- **Drop knowledge, not gear.** Recipes as loot keeps crafting the only faucet and makes every kill a possible *systemic* unlock. In an incremental hybrid: let drops unlock automations, multiplier slots, and recipes — never raw stat items that compete with your crafting economy.
- **Scale gatekeepers to highest-ever power.** Boss difficulty ratcheted to peak-ever gear kills sandbagging — directly applicable to any game where players could game a snapshot.
- **Gate with curves, not fences.** Published-feel penalties by level gap (30–60% DR, ~8× HP at +6) let players over-reach for a price; it reads as fairness, not an invisible wall.

### The friction methodology (the big one)

- **Delete frictions that aren't decisions; keep frictions that are.** The test for every system: would the player ever meaningfully choose differently? If not, automate or delete it. Workstation trips stayed *because* "where is home" is a decision.
- **Every deletion needs a named compensator.** Write down which system inherits the deleted tension (storage scarcity → recipe quantity × acquisition danger). If nothing inherits it, the game flattens.
- **Let one bold deletion dictate architecture.** Infinite inventory forced out XP, durability, and storage UI, and forced in gear-as-level. Pick the boldest deletion first; don't trim frictions one at a time.
- **Tools as permanent knowledge.** "You can now harvest X, forever, hands-free" is an upgrade purchase and a UI deletion in one — this *is* an incremental unlock, shipped in an ARPG in 2016.

### Content economics

- **One design, three named bands.** Recolor + rename + behavior tweak stretches one creature across 13 levels — and *Womplord* feels like discovery where "Wompit Lv. 13" would feel like padding. The cheapest content multiplier in this whole reference series.
- **Elites superset base loot and exclusively drop the tier-up currency.** Hunting rares is never a tradeoff, and random grind becomes targeted hunts.
- **Companions scale with the player; tier-gate only their bonus kit.** Never deprecate a player's favorite — emotional investment is retention.
- **Ship progression in biome-sized bundles** (enemies + materials + recipes + boss arc in one level band): content drops that feel like sequels, buildable as vertical slices.
- **Finite checklists over percentage bars:** one egg per species, one recipe list per biome — completion as visible landmarks.

### Combat that coexists with big numbers

- **Price all side-damage as % of main DPS.** Bombs at 200% of DPS never obsolete across a 350× power curve; flat-damage consumables die within one doubling. Mandatory pattern for any exponential-power game with an action layer.
- **Difficulty in reading, mistakes in positioning.** Telegraphs keep action skill orthogonal to the stat treadmill: numbers set the floor, play sets the ceiling.
- **Cheap variance over new mechanics:** attack wobble and randomized secondary moves stretched creature freshness across long crafting flats at near-zero cost.
- **Death = time, never power.** Respawn at base, walk back for a handful of recent pickups. Players stay bold, and no accumulated currency is ever taxed.

### Meta & platform

- **Cross-game (or cross-mode) perks:** counters earned in one context minting content in another — items migrating, characters crossing over. Cheap to build (a counter + a reward table, per this folder's `perk_def.json`) and every product advertises the others. For a single 3D game: let game *modes* cross-pollinate this way.
- **Own the account/save layer early.** Cloud-portable saves are near-mandatory for a game players live in across devices, and owning identity is what makes cross-context perks possible.

### What Crashlands adds to the series

The five incremental references teach systems to *add*; Crashlands teaches what to *subtract*. Its two gifts to your 3D game: **gear-as-level** — the cleanest progression spine for a game where power should be visible on the avatar, mathematically identical to an incremental's exponential but physically embodied — and the **friction-deletion methodology**, which is really an incremental-design instinct (automate the repetitive, spend attention only on decisions) applied rigorously to an action-RPG. A 3D incremental/RPG hybrid should read this document as the *integration layer*: NGU/FAPI/TPT2 supply the number engines, Crashlands supplies the rules for how those engines feel in a hand-crafted 3D world without drowning the player in bookkeeping.

---

*Compiled 2026-07-19 from the Crashlands community wikis (crashlands.fandom.com, bscotch.wiki.gg), Butterscotch Shenanigans' dev blogs, GDC talks and interviews, platform reviews, and local ground-truth files (`perk_def.json`, `ui_text_en.json`). The game itself is GameMaker bytecode (`data.win`) not decompilable with local tools; the World Structure chapter is general-knowledge-based (its research agent was interrupted) and marked accordingly.*
