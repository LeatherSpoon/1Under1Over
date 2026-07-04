# Field Research Expedition Loop Design

Date: 2026-04-21

## Goal

Shape the game around a Field Research Expedition Loop: the cyborg explores a terrestrial sci-fi planet, generates data from nearly every action, returns to a fully functional ship at the Landing Zone, manually offloads that data, and uses the ship computer's learning to grow Processing Power, unlock research, improve drones, craft gear, and reach farther environments.

The design should make exploration feel like the active heart of an incremental game. The number goes up because the ship understands the planet better, not because the player is tending an abstract factory.

## Non-Goals

- Do not treat the ship as crashed, broken, or helpless. It is functional infrastructure and the player's sanctuary.
- Do not make the factory loop only a hidden menu. Major ship and computer growth should eventually have visible world presence.
- Do not turn the game into a pure automation or logistics builder. Exploration remains the main active play.
- Do not expose PostgreSQL directly as an in-game database UI. The player sees a readable ship console, not admin tooling.
- Do not require every data source to be implemented in the first slice. The design defines the long-term loop.

## Player Fantasy

The player is a cyborg explorer operating from a landed, fully functional spaceship. The ship has compute infrastructure, fabrication, drone control, recovery systems, and a readable research console. What it lacks is planetary understanding.

The cyborg acts as the ship's field body. By walking, scanning, gathering, fighting, crafting, discovering landmarks, crossing terrain, surviving hazards, and entering new environments, the player collects field data. Returning to the ship and manually offloading that data is the reward ritual. The ship ingests the expedition, learns from it, updates its console, increases PP growth, completes research, and unlocks new ways to explore.

The long-term project is a large, complex computer built from ship infrastructure and expanded around the Landing Zone. It is fed by exploration rather than generic factory production.

## Core Loop

1. Prepare at the ship: heal, craft, equip, assign drones, review research needs, and choose expedition goals.
2. Explore a biome: move through the world, gather resources, scan entities, fight enemies, survive hazards, and discover locations.
3. Generate field data: every meaningful action creates telemetry and expedition payload.
4. Return to the ship: the player must physically come back to bank data.
5. Manually offload: the ship ingests the expedition and shows a readable summary.
6. Spend and unlock: PP, research progress, recipes, drone upgrades, stats, and environment gates update.
7. Push farther: the new capabilities make deeper or more dangerous expeditions possible.

The loop should support a simple risk/reward tension: staying out longer gathers richer data, but returning safely is required to bank it.

## Data Philosophy

Everything is data. The game should treat ordinary play as meaningful research input.

Primary data sources:

- Steps and distance traveled.
- Terrain crossed and traversal difficulty.
- Biomes entered and time spent in each.
- Resources discovered, gathered, depleted, and refined.
- Enemies encountered, scanned, damaged, defeated, escaped from, or defeated by.
- Combat actions, damage, dodges, FP gain, skills used, status effects, and turn timing.
- Landmarks, portals, anomalies, and hidden nodes discovered.
- Crafting recipes used and item quality produced.
- Tasks accepted, progressed, completed, or ignored.
- Hazard exposure, HP loss, recovery, poison, burn, shock, corrosion, and rescue events.

PostgreSQL can support this behind the scenes as a structured event and aggregation layer. Player-facing systems should present the results as ship learning, not raw database operations.

## Ship And Landing Zone

The ship is the player's stable home base. It supports:

- Manual data offload.
- Readable data console.
- PP spending and research unlocks.
- Crafting and fabrication.
- Equipment and loadout changes.
- Drone assignment and upgrades.
- Recovery, rescue return, and expedition preparation.

The Landing Zone should visibly change over time as the ship computer expands. Early upgrades can remain menu-driven, but major milestones should gain physical presence: memory banks, cooling arrays, processor pylons, relay towers, drone docks, fabrication extensions, and biome-specific research modules.

## Data Console

The ship contains a readable data console. It should feel like a sci-fi research interface built for the player, not a database client.

Console sections:

- **Expedition Summary**: data gathered since last offload, major events, notable discoveries, and conversion results.
- **Datasets**: terrain, enemies, resources, combat, biomes, anomalies, crafting, steps, and tasks.
- **Research Progress**: unlocks driven by accumulated data and PP investment.
- **Known World**: environments, landmarks, portals, resource zones, and hazards.
- **Patterns Learned**: readable insights such as "Scrapper timing model improved" or "Forest traversal model refined."
- **System Growth**: PP/sec, drone efficiency, scan quality, crafting unlocks, offload conversion, and environment access.

The console should be legible and rewarding. It can include counts, bars, charts, log entries, and short machine-learning flavored summaries, but it should avoid overwhelming the player with raw telemetry.

## Processing Power And Research

Processing Power is the ship computer's usable understanding and compute capacity. It remains the main number and can grow passively, but expedition data is the primary accelerant.

Offloading data can produce two reward channels:

- **Immediate PP**: a satisfying number-go-up payout.
- **Research progress**: longer-term unlocks that prevent the loop from becoming only PP/sec optimization.

PP and research can affect:

- Character stats: Strength, Health, Defense, Constitution, Dexterity, Agility, Perception, Focus Rate, Focus, Speed, Crafting, and Crafting Speed.
- Ship systems: offload conversion, passive PP/sec, dataset analysis, scan quality, and console capabilities.
- Drones: gathering speed, range, resource targeting, biome operation, rescue reliability, and efficiency.
- Crafting: recipes, crafting speed, item tiers, and tool/weapon fabrication.
- Environment access: portals, terrain handling, hazard resistance, biome-specific analysis, and traversal tech.
- Visible infrastructure: major computer modules around the Landing Zone.

## Exploration

Exploration should be broad and generous. The player should always feel that movement and observation matter, even without a formal objective.

Environments support different research identities:

- **Landing Site**: tutorial and safe baseline data. Grassland, forest perimeter, ship infrastructure, early resources.
- **Mine**: resource density, portal access, constrained movement, stronger material progression.
- **Verdant Maw**: dense jungle, visibility pressure, poison or corrosion hazards, biological datasets.
- **Lagoon Coast**: islands, water-adjacent traversal, silica/glass/quartz opportunities, ranged or amphibious enemy data.
- **Frozen Tundra**: cold exposure, slower traversal, survival pressure, thermal system research.

Biomes should not only provide new materials. They should teach the ship new categories of planetary behavior.

## Tasks

Tasks act as expedition suggestions generated by the ship, not as the only valid way to progress.

Examples:

- Scan a Scrapper twice.
- Cross dense forest terrain for a certain distance.
- Gather quartz or carbon.
- Map the forest edge.
- Survive poison and return to offload.
- Find a portal signal in the Mine.
- Defeat an enemy using a specific combat style.
- Test a crafted item in the field.

Tasks provide bonus rewards and direction, but free exploration still generates data and PP.

## Combat

Combat remains a Pokemon-style cutaway window when the player approaches an aggro NPC. Combat is both risk and research.

Combat data sources:

- Enemy type encountered.
- Whether the enemy was scanned.
- Damage dealt and received.
- Skills used and FP spent.
- Dodge, initiative, and run outcomes.
- Status effects applied or suffered.
- Fight duration and result.

Scanning should be a valuable bridge between combat and research. A scanned enemy becomes a richer dataset subject, improving offload rewards and enabling console insights.

Combat actions keep their current direction:

- Fight: spammable 1x Strength damage.
- Skills: FP-based attacks and Scan.
- Items: healing, repair, antidote, and future combat consumables.
- Run: escape chance based on Agility relationship.

## Drones

Drones are the idle layer and should feel like ship-controlled assistants rather than the main character replacement.

Drone roles:

- Gather assigned materials over time.
- Improve efficiency through PP and research.
- Become better in biomes where the ship has more data.
- Rescue the player back to the Landing Zone when HP reaches the rescue threshold.
- Eventually support offload-adjacent infrastructure, such as local relays or sample retrieval, without replacing the manual offload ritual.

Drones should benefit from exploration data. For example, scanning a region's resources can improve drone yield there.

## Offload Ritual

Manual offload is a deliberate reward moment at the ship.

Expected flow:

1. Player returns to the ship or ship console interaction zone.
2. Offload action becomes available.
3. Console shows a short expedition ingestion sequence.
4. Expedition Summary lists key data gained.
5. PP and research progress are applied.
6. New unlocks or recommendations are shown.
7. Field payload resets for the next expedition.

The offload should feel safe, satisfying, and informative. It is the moment the game says, "That trip mattered."

## Architecture

The current project already has systems that map well to this design:

- `PPSystem`: owns PP totals and passive growth.
- `PedometerSystem`: tracks steps and movement rewards.
- `TaskSystem`: can evolve into ship-generated expedition objectives.
- `ScanSystem`: supports enemy/resource/environment observation.
- `CombatSystem` and `CombatUI`: produce combat telemetry.
- `DroneSystem`: supports idle material gathering and future research-based efficiency.
- `CraftingSystem` and `InventorySystem`: support material and recipe progression.
- `StatsSystem`: supports PP/stat progression.
- `Environment`: owns biomes, resources, hazards, terrain, and landmarks.
- `HUD`: can host initial console/offload UI before a dedicated ship interior view exists.

Recommended new or expanded modules:

- `DataEventSystem`: records structured field events from movement, combat, gathering, scanning, crafting, tasks, and environment interactions.
- `OffloadSystem`: aggregates current expedition data, converts it into PP/research rewards, and resets the expedition payload.
- `ResearchSystem`: tracks dataset progress and unlock conditions.
- `ShipConsoleUI`: renders expedition summaries, datasets, known world, research progress, and learned patterns.
- `ShipBaseSystem`: tracks visible Landing Zone computer infrastructure milestones.

The first implementation should keep boundaries simple. Existing systems can emit concise events into `DataEventSystem`; `OffloadSystem` consumes the current expedition event summary; `ShipConsoleUI` displays the readable result.

## Data Flow

1. During exploration, systems emit events such as `step`, `terrain_crossed`, `resource_gathered`, `enemy_scanned`, `combat_ended`, `item_crafted`, `task_completed`, and `landmark_discovered`.
2. `DataEventSystem` stores the current expedition payload in memory and optionally forwards structured records to PostgreSQL integration when available.
3. The HUD or ship interaction prompts the player to return and offload.
4. `OffloadSystem` aggregates the payload into dataset progress, PP rewards, research progress, and console summary rows.
5. `PPSystem`, `ResearchSystem`, `DroneSystem`, `CraftingSystem`, `StatsSystem`, and environment gates receive the resulting unlock or reward updates.
6. `ShipConsoleUI` displays the expedition summary and persistent datasets.
7. The current expedition payload clears after a successful offload.

## PostgreSQL Integration

PostgreSQL should be treated as durable telemetry and analytics support, not as required for every frame of gameplay.

Useful tables or concepts:

- Expedition sessions.
- Event records.
- Dataset aggregates.
- Offload summaries.
- Research unlock history.
- Environment discovery history.
- Enemy observation history.

The game should still degrade gracefully if the database is unavailable during local development: keep field payload in memory, show console summaries, and avoid blocking moment-to-moment play. Database write failures should be reported in developer logs and surfaced to the player only if persistence is truly required.

## Error Handling

- If no field data exists, offload should show a calm "no new data" state and avoid granting rewards.
- If PostgreSQL is unavailable, the game should continue with in-memory expedition data for the session.
- If a data event has missing optional metadata, aggregate the fields that are present and skip the rest.
- If reward conversion fails, do not clear the expedition payload until rewards are safely applied.
- If a console summary cannot render a dataset, show the remaining sections rather than failing the whole console.

## Testing

Focused automated tests should cover:

- Recording movement, gathering, scan, combat, task, and discovery events into an expedition payload.
- Aggregating an expedition payload into dataset progress.
- Converting offload results into PP and research progress.
- Clearing expedition data only after a successful offload.
- Preserving expedition data when reward application fails.
- Handling a disabled or unavailable PostgreSQL adapter without breaking offload.

Manual smoke test:

- Start a new session at the Landing Site.
- Walk, gather at least one resource, scan or fight one enemy, and complete or progress one task.
- Return to the ship.
- Trigger manual offload.
- Confirm the console shows an expedition summary.
- Confirm PP or research progress changes.
- Confirm the next expedition starts with a cleared field payload.
- Run `npm test`.

## First Implementation Slice

The smallest valuable slice is:

1. Add an in-memory expedition event payload.
2. Record steps, resource gathering, enemy scan/combat result, and task completion as field data.
3. Add a ship/HUD offload action available at the Landing Zone.
4. Convert offload data into PP and simple dataset counters.
5. Add a readable console panel with Expedition Summary and Datasets.
6. Keep PostgreSQL optional behind a small adapter or integration boundary.

This slice proves the core identity without requiring every biome, visible infrastructure module, or full research tree.

## Later Expansion

- Ship interior or dedicated ship console view.
- Visible Landing Zone computer infrastructure stages.
- Biome-specific research trees.
- Richer enemy scan encyclopedia.
- Offload animations and ingestion sequence.
- PostgreSQL-backed historical console queries.
- Adaptive ship-generated tasks based on missing datasets.
- Drone efficiency tied to discovered resource and terrain datasets.
- Portal unlocks driven by anomaly research.
