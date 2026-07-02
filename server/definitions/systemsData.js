// ── Systems definition data ───────────────────────────────────────────────────
// Server-side authoritative copies of content defined in client JS systems.
// Adding a new achievement/augment/codex entry here + re-running db:seed
// makes it available to all players without a code deploy.

export const ACHIEVEMENTS = [
  // PP milestones
  { id: 'pp_100',       label: 'Boot Sequence',      description: 'Earn 100 PP',                  icon: 'lightning', rewardPP: 25,    rewardItems: {} },
  { id: 'pp_1000',      label: 'Processor Online',   description: 'Earn 1,000 PP',                icon: 'lightning', rewardPP: 100,   rewardItems: {} },
  { id: 'pp_10000',     label: 'Overclocked',         description: 'Earn 10,000 PP',               icon: 'lightning', rewardPP: 500,   rewardItems: {} },
  { id: 'pp_100000',    label: 'Mainframe',           description: 'Earn 100,000 PP',              icon: 'lightning', rewardPP: 2500,  rewardItems: {} },
  { id: 'pp_1m',        label: 'Supercomputer',       description: 'Earn 1,000,000 PP',            icon: 'lightning', rewardPP: 10000, rewardItems: {} },
  // Combat
  { id: 'kill_1',       label: 'First Blood',         description: 'Defeat 1 enemy',               icon: 'sword',     rewardPP: 15,    rewardItems: {} },
  { id: 'kill_10',      label: 'Hunter',              description: 'Defeat 10 enemies',            icon: 'sword',     rewardPP: 50,    rewardItems: {} },
  { id: 'kill_50',      label: 'Veteran',             description: 'Defeat 50 enemies',            icon: 'sword',     rewardPP: 200,   rewardItems: {} },
  { id: 'kill_100',     label: 'Apex Predator',       description: 'Defeat 100 enemies',           icon: 'sword',     rewardPP: 500,   rewardItems: {} },
  { id: 'kill_250',     label: 'War Machine',         description: 'Defeat 250 enemies',           icon: 'sword',     rewardPP: 1000,  rewardItems: {} },
  { id: 'kill_500',     label: 'Unstoppable Force',   description: 'Defeat 500 enemies',           icon: 'sword',     rewardPP: 3000,  rewardItems: {} },
  { id: 'hit_50',       label: 'Hard Hitter',         description: 'Deal 50+ in one hit',          icon: 'explosion', rewardPP: 75,    rewardItems: {} },
  { id: 'hit_200',      label: 'Devastating',         description: 'Deal 200+ in one hit',         icon: 'explosion', rewardPP: 300,   rewardItems: {} },
  { id: 'hit_500',      label: 'Annihilator',         description: 'Deal 500+ in one hit',         icon: 'explosion', rewardPP: 750,   rewardItems: {} },
  // Steps
  { id: 'steps_100',    label: 'First Steps',         description: 'Walk 100 steps',               icon: 'steps',     rewardPP: 10,    rewardItems: {} },
  { id: 'steps_1000',   label: 'Trekker',             description: 'Walk 1,000 steps',             icon: 'steps',     rewardPP: 50,    rewardItems: {} },
  { id: 'steps_10000',  label: 'Marathon',            description: 'Walk 10,000 steps',            icon: 'steps',     rewardPP: 250,   rewardItems: {} },
  { id: 'steps_50000',  label: 'Unstoppable',         description: 'Walk 50,000 steps',            icon: 'steps',     rewardPP: 1000,  rewardItems: {} },
  { id: 'steps_100k',   label: 'Pilgrim',             description: 'Walk 100,000 steps',           icon: 'steps',     rewardPP: 5000,  rewardItems: {} },
  // Exploration
  { id: 'zones_3',      label: 'Explorer',            description: 'Visit 3 zones',                icon: 'globe',     rewardPP: 100,   rewardItems: {} },
  { id: 'zones_6',      label: 'Cartographer',        description: 'Visit all 6 zones',            icon: 'globe',     rewardPP: 500,   rewardItems: {} },
  { id: 'all_zones_fought', label: 'Zone Clearer',    description: 'Fight in all 5 combat zones',  icon: 'globe',     rewardPP: 800,   rewardItems: {} },
  // Crafting
  { id: 'craft_tool',   label: 'Toolsmith',           description: 'Craft a tool',                 icon: 'wrench',    rewardPP: 30,    rewardItems: {} },
  { id: 'craft_5',      label: 'Artisan',             description: 'Craft 5 different tools',      icon: 'wrench',    rewardPP: 150,   rewardItems: {} },
  // Drones
  { id: 'drone_2',      label: 'Swarm Start',         description: 'Own 2 drones',                 icon: 'robot',     rewardPP: 40,    rewardItems: {} },
  { id: 'drone_5',      label: 'Full Fleet',          description: 'Own 5 drones',                 icon: 'robot',     rewardPP: 300,   rewardItems: {} },
  { id: 'drone_10',     label: 'Drone Overlord',      description: 'Own 10 drones',                icon: 'robot',     rewardPP: 1000,  rewardItems: {} },
  // Prestige
  { id: 'prestige_1',   label: 'First Offload',       description: 'Prestige once',                icon: 'recycle',   rewardPP: 50,    rewardItems: {} },
  { id: 'prestige_5',   label: 'Cycle Master',        description: 'Prestige 5 times',             icon: 'recycle',   rewardPP: 500,   rewardItems: {} },
  // Stats
  { id: 'stat_10',      label: 'Trained',             description: 'Any stat to Lv 10',            icon: 'chart',     rewardPP: 100,   rewardItems: {} },
  { id: 'stat_25',      label: 'Specialist',          description: 'Any stat to Lv 25',            icon: 'chart',     rewardPP: 500,   rewardItems: {} },
  { id: 'stat_50',      label: 'Master',              description: 'Any stat to Lv 50',            icon: 'chart',     rewardPP: 2000,  rewardItems: {} },
  // Survival
  { id: 'survivor',     label: 'Survivor',            description: 'Kill 10 without dying once',   icon: 'shield',    rewardPP: 200,   rewardItems: {} },
  // Minigame
  { id: 'perfect_hit',  label: 'Bullseye',            description: 'Get a PERFECT in the minigame',icon: 'target',    rewardPP: 75,    rewardItems: {} },
  { id: 'mg_10',        label: 'Sharpshooter',        description: 'Get 10 PERFECTs in minigame',  icon: 'target',    rewardPP: 300,   rewardItems: {} },
  // Ascension
  { id: 'ascend_1',     label: 'Transcendence',       description: 'Ascend for the first time',    icon: 'star',      rewardPP: 0,     rewardItems: {} },
  { id: 'ascend_3',     label: 'Reborn',              description: 'Ascend 3 times',               icon: 'star',      rewardPP: 0,     rewardItems: {} },
  // Resource gathering
  { id: 'gather_50',    label: 'Scavenger',           description: 'Gather 50 resources',          icon: 'pickaxe',   rewardPP: 80,    rewardItems: {} },
  { id: 'gather_500',   label: 'Hoarder',             description: 'Gather 500 resources',         icon: 'pickaxe',   rewardPP: 400,   rewardItems: {} },
  // Energy
  { id: 'energy_empty', label: 'Running on Fumes',    description: 'Deplete energy to 0',          icon: 'battery',   rewardPP: 25,    rewardItems: {} },
  // Mining
  { id: 'mine_25',   label: 'Rock Breaker',  description: 'Mine 25 wall blocks',    icon: 'pickaxe', rewardPP: 50,   rewardItems: { energyCell: 2 } },
  { id: 'mine_100',  label: 'Excavator',     description: 'Mine 100 wall blocks',   icon: 'pickaxe', rewardPP: 200,  rewardItems: { iron: 10, stone: 15 } },
  { id: 'mine_500',  label: 'Tunnel Vision', description: 'Mine 500 wall blocks',   icon: 'pickaxe', rewardPP: 800,  rewardItems: { carbon: 5, quartz: 5 } },
  { id: 'mine_1000', label: 'Core Extractor',description: 'Mine 1,000 wall blocks', icon: 'pickaxe', rewardPP: 2500, rewardItems: { gold: 3 } },
  // Drilling
  { id: 'stratum_10',  label: 'Deep Core',      description: 'Reach Stratum 10',  icon: 'volcano', rewardPP: 200,   rewardItems: {} },
  { id: 'stratum_20',  label: 'Mantle Seeker',  description: 'Reach Stratum 20',  icon: 'volcano', rewardPP: 500,   rewardItems: {} },
  { id: 'stratum_30',  label: 'Core Breach',    description: 'Reach Stratum 30',  icon: 'volcano', rewardPP: 1200,  rewardItems: {} },
  { id: 'stratum_50',  label: 'Tectonic Master',description: 'Reach Stratum 50',  icon: 'volcano', rewardPP: 3000,  rewardItems: {} },
  { id: 'stratum_100', label: 'Void Driller',   description: 'Reach Stratum 100', icon: 'galaxy',  rewardPP: 10000, rewardItems: {} },
];

export const AUGMENTATIONS = [
  { id: 'reinforcedFrame',   label: 'Reinforced Frame',   category: 'Survivability', description: '+50 Max HP. Subdermal plating reinforces your chassis.',          costPP: 500,  statEffects: { hp: 50 } },
  { id: 'titaniumPlating',   label: 'Titanium Plating',   category: 'Survivability', description: '+3 Defense. Ablative nano-layer reduces incoming damage.',         costPP: 700,  statEffects: { defense: 3 } },
  { id: 'adaptiveShielding', label: 'Adaptive Shielding', category: 'Survivability', description: '+6 Defense. Dynamic field shifts to match threat vectors.',        costPP: 1200, statEffects: { defense: 6 } },
  { id: 'servoLegs',         label: 'Servo Legs',         category: 'Mobility',      description: '+0.3 Move Speed. Hydraulic assist cuts ground time.',              costPP: 400,  statEffects: { speed: 0.3 } },
  { id: 'capacitorArray',    label: 'Capacitor Array',    category: 'Mobility',      description: '+30 Max Energy. High-density cells extend operational range.',     costPP: 600,  statEffects: { energy: 30 } },
  { id: 'combatTargeting',   label: 'Combat Targeting',   category: 'Combat',        description: '+15 flat damage. Targeting overlay improves strike precision.',    costPP: 900,  statEffects: { damage: 15 } },
  { id: 'neuralLink',        label: 'Neural Link',        category: 'Efficiency',    description: 'Gather re-prompt delay drops from 1.5s to 0.3s.',                  costPP: 800,  statEffects: { special: 'hintCooldownReduction' } },
  { id: 'overclockModule',   label: 'Overclock Module',   category: 'Efficiency',    description: '+5 Crafting Speed levels. Fabrication routines run in parallel.',  costPP: 1000, statEffects: { special: 'craftingSpeedBonus', amount: 5 } },
];

export const CODEX_ENTRIES = [
  // Materials
  { id: 'copper',         category: 'Material', label: 'Copper',          flavor: 'A highly conductive metal. Common throughout the sector.' },
  { id: 'timber',         category: 'Material', label: 'Timber',          flavor: 'Dense fibrous wood. Burns slow, builds strong.' },
  { id: 'stone',          category: 'Material', label: 'Stone',           flavor: 'Compressed mineral aggregate. Ubiquitous on terrestrial worlds.' },
  { id: 'iron',           category: 'Material', label: 'Iron',            flavor: 'Ferrous alloy. The backbone of any frontier operation.' },
  { id: 'carbon',         category: 'Material', label: 'Carbon',          flavor: 'Crystalline carbon matrix. Prized by fabricators.' },
  { id: 'quartz',         category: 'Material', label: 'Quartz',          flavor: 'Silicon dioxide crystals. Resonant in energy systems.' },
  { id: 'silica',         category: 'Material', label: 'Silica',          flavor: 'Refined sand particulate. Essential for circuit fabrication.' },
  { id: 'fiber',          category: 'Material', label: 'Fiber',           flavor: 'Organic polymer strands. Lightweight and remarkably tensile.' },
  { id: 'silver',         category: 'Material', label: 'Silver',          flavor: 'Lustrous noble metal. Rare in these coordinates.' },
  { id: 'gold',           category: 'Material', label: 'Gold',            flavor: 'Dense precious metal. High conductivity, higher value.' },
  { id: 'resin',          category: 'Material', label: 'Resin',           flavor: 'Organic binding compound. Adhesive and heat-resistant.' },
  { id: 'epoxy',          category: 'Material', label: 'Epoxy',           flavor: 'Two-part polymer sealant. Bonds most known alloys.' },
  { id: 'seed',           category: 'Material', label: 'Seed',            flavor: 'A preserved growth embryo. Life finds a way.' },
  { id: 'circuitWire',    category: 'Material', label: 'Circuit Wire',    flavor: 'Salvaged from combat units. High-gauge conductive filament.' },
  { id: 'ironSpike',      category: 'Material', label: 'Iron Spike',      flavor: 'A crude but effective projectile. Battlefield scrap.' },
  { id: 'powerCore',      category: 'Material', label: 'Power Core',      flavor: 'Compact energy cell ripped from a hostile unit. Handle with care.' },
  { id: 'armorPlate',     category: 'Material', label: 'Armor Plate',     flavor: 'Harvested from a decommissioned combat chassis.' },
  { id: 'burstCapacitor', category: 'Material', label: 'Burst Capacitor', flavor: 'Stores high-voltage charges. Unstable if damaged.' },
  { id: 'logicChip',      category: 'Material', label: 'Logic Chip',      flavor: 'Microcircuit array. The mind of a machine, reduced to salvage.' },
  { id: 'titanium',       category: 'Material', label: 'Titanium',        flavor: 'Extracted from The Depths. Lightweight, near-indestructible. Rarely found near the surface.' },
  { id: 'tungsten',       category: 'Material', label: 'Tungsten',        flavor: 'Dense heavy metal from deep strata. Heat-resistant. Industrial-grade cutting edge.' },
  // Enemies
  { id: 'rusher',  category: 'Enemy', label: 'Rusher',  flavor: 'Fast-moving bipedal combat unit. Prioritizes aggression over defense. Minimal shielding.' },
  { id: 'swinger', category: 'Enemy', label: 'Swinger', flavor: 'Heavily armored melee fighter. Wind-up attacks carry lethal momentum. Patience wins.' },
  { id: 'burst',   category: 'Enemy', label: 'Burst',   flavor: 'Ranged energy emitter. Volatile capacitor banks power its salvos. Stay mobile.' },
  // Crafted
  { id: 'terrainCutter',    category: 'Crafted', label: 'Terrain Cutter',    flavor: 'A powered cutting blade. Clears terrain efficiently. Mind the durability.' },
  { id: 'chargingStation',  category: 'Crafted', label: 'Charging Station',  flavor: 'Personal energy restoration module. Plug in, power up, move out.' },
  { id: 'storageContainer', category: 'Crafted', label: 'Storage Container', flavor: 'Modular storage unit. More space, fewer trips back to base.' },
  { id: 'energyCell',       category: 'Crafted', label: 'Energy Cell',       flavor: 'Field-synthesized power reserve. 50 units of clean energy, on demand.' },
  { id: 'ration',           category: 'Crafted', label: 'Ration',            flavor: 'Compressed nutrient block. Keeps you operational between skirmishes.' },
  { id: 'firstAid',         category: 'Crafted', label: 'First Aid Kit',     flavor: 'Trauma kit for field wounds. Stops bleeding, restores function.' },
];

export const ZONES = [
  { id: 'landingSite', label: 'Landing Site',       ppUnlock: 0,     displayOrder: 0 },
  { id: 'mine',        label: 'The Mine',            ppUnlock: 0,     displayOrder: 1 },
  { id: 'depths',      label: 'The Depths',          ppUnlock: 2000,  displayOrder: 2 },
  { id: 'verdantMaw',  label: 'Verdant Maw',         ppUnlock: 1000,  displayOrder: 3 },
  { id: 'lagoonCoast', label: 'Lagoon Coast',        ppUnlock: 9000,  displayOrder: 4 },
  { id: 'frozenTundra',label: 'Frozen Tundra',       ppUnlock: 25000, displayOrder: 5 },
  { id: 'spaceship',   label: 'Spaceship Interior',  ppUnlock: 0,     displayOrder: 6 },
  { id: 'workspace',   label: 'Workspace',           ppUnlock: 0,     displayOrder: 7 },
];

export const STAT_DEFINITIONS = [
  { id: 'strength',     label: 'Strength',    displayOrder: 0  },
  { id: 'health',       label: 'Health',      displayOrder: 1  },
  { id: 'defense',      label: 'Defense',     displayOrder: 2  },
  { id: 'constitution', label: 'Constitution',displayOrder: 3  },
  { id: 'dexterity',    label: 'Dexterity',   displayOrder: 4  },
  { id: 'agility',      label: 'Agility',     displayOrder: 5  },
  { id: 'perception',   label: 'Perception',  displayOrder: 6  },
  { id: 'focusRate',    label: 'Focus Rate',  displayOrder: 7  },
  { id: 'focus',        label: 'Focus',       displayOrder: 8  },
  { id: 'crafting',     label: 'Crafting',    displayOrder: 9  },
  { id: 'craftingSpeed',label: 'Craft Speed', displayOrder: 10 },
  { id: 'speed',        label: 'Speed',       displayOrder: 11 },
  { id: 'energyCap',    label: 'Max Energy',  displayOrder: 12 },
];
