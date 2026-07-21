// All tunable game constants in one place.

export const CONFIG = {
  // Camera
  FRUSTUM_SIZE: 20,
  CAMERA_OFFSET: { x: 0, y: 18, z: 7 },
  CAMERA_LERP: 0.08,

  // Player
  BASE_MOVE_SPEED: 3.5,
  STEP_LENGTH: 0.5,          // world units per step

  // PP System
  INITIAL_PP_RATE: 1.0,      // PP per second
  INITIAL_PP_CAP: 150,       // starting max PP
  OFFLOAD_CAP_MULTIPLIER: 4, // capGain = floor(sqrt(pp) * multiplier * fillFraction) — see PPSystem.offload
  PP_PER_STEP: 0.25,         // PP gained per step (increased from 0.05)

  // Stats
  STAT_UPGRADE_BASE_COST: 15,
  STAT_UPGRADE_COST_SCALE: 1.08, // cost = base * level * scale^(level-1) — mirrored in server/services/transactionService.js

  // Derived stat formulas
  BASE_MAX_HP: 50,            // base HP before health level scaling
  MAX_HP_PER_LEVEL: 10,      // maxHP = 50 + health.level * 10
  BASE_MAX_FP: 100,
  FP_PER_FOCUS_LEVEL: 50,    // maxFP = 100 + focus.level * 50
  BASE_FP_RATE: 5,           // FP per second
  FP_RATE_PER_LEVEL: 2,      // fpRate = 5 + focusRate.level * 2
  BASE_DAMAGE: 2,            // damage = strength.level * 2

  // Combat
  FP_TICK_MS: 100,           // FP accumulation interval
  ENEMY_ATTACK_MS: 2000,     // Scrapper attacks every 2s
  SCRAPPER_DAMAGE: 4,        // base damage from Scrapper
  SCRAPPER_AGGRO_RADIUS: 1.0,
  SCRAPPER_HP: 40,
  SCRAPPER_PP_REWARD: 15,
  RUN_BASE_CHANCE: 0.5,
  COMBAT_GRACE_MS: 1500,     // enemy holds its first attack until the player acts (or this elapses)

  // FP costs and damage multipliers
  SKILLS: {
    jab:            { fp: 20,  mult: 2, label: 'Jab' },
    heavyHit:       { fp: 100, mult: 4, label: 'Heavy Hit' },
    kineticDriver:  { fp: 200, mult: 5, label: 'Kinetic Driver' },
    ballisticLunge: { fp: 300, mult: 6, label: 'Ballistic Lunge' },
    ionBeam:        { fp: 500, mult: 7, label: 'Ion Beam' },
    scan:           { fp: 100, mult: 0, label: 'Scan' },
  },

  // Environment
  GROUND_SIZE: 80,
  LANDING_PAD_RADIUS: 2.5,
  TREE_COUNT: 18,
  FOREST_RADIUS: 14,
  MOUNTAIN_POS: { x: -18, z: -18 },

  // Enemy patrol
  SCRAPPER_PATROL_RADIUS: 6,
  SCRAPPER_PATROL_WAIT: [1000, 3000], // ms range

  // Pedometer shop
  PEDOMETER_PP_BONUS_BASE_COST: 50,   // steps cost
  PEDOMETER_PP_BONUS_AMOUNT: 0.10,    // PP/step increase per purchase
  PEDOMETER_TRACK_BASE_COST: 100,     // steps cost per track (fixed, no scaling)
  PEDOMETER_TRACK_SPEED_BONUS: 0.3,   // speed added per track (stackable)
  PEDOMETER_STAT_BASE_COST: 200,      // steps cost for first stat level purchase
  PEDOMETER_ENV_UNLOCK: {             // step cost to unlock zones (alternative to PP gate)
    verdantMaw: 2000,
    lagoonCoast: 15000,
    frozenTundra: 8000,
  },

  // Energy
  BASE_MAX_ENERGY: 100,
  ENERGY_REGEN_RATE: 2,     // energy per second (passive regen)
  ENERGY_COST_GATHER: 8,    // per resource node gather
  ENERGY_COST_TREE: 12,     // per tree clear
  ENERGY_COST_ROCK: 15,     // per rock drill
  ENERGY_COST_PLANT: 5,     // per seed plant

  // Gathering
  BASE_GATHER_TIME: 2.0,    // seconds
  GATHER_INTERACT_RADIUS: 2.0,
  GATHER_SPEED_PER_LEVEL: 0.08, // 8% faster per gatherSpeed level above 1

  // Combat Simulator (Spaceship sparring rig)
  COMBAT_SIM_RATE: 0.3,     // PP-equivalent XP/s banked into each of STR and DEF while enabled

  // Training Chamber (Spaceship holodeck sim programs)
  TRAINING_BASE_XP_RATE: 0.5,        // PP-equivalent stat XP/s per 1x leg at program level 1
  TRAINING_UPGRADE_RATE_BONUS: 0.25, // +25% XP rate per program level above 1

  // Environments PP unlock thresholds
  ENV_UNLOCK: {
    landingSite: 0,
    mine: 0,
    verdantMaw: 1000,
    lagoonCoast: 9000,
    frozenTundra: 25000,
    depths: 2000,
  },

  // Status effects
  STATUS_EFFECTS: {
    burn:      { label: 'Burn',      tickDamage: 3, durationTicks: 5 },
    shock:     { label: 'Shock',     fpSlowPct: 0.5, durationTicks: 4 },
    corrosion: { label: 'Corrosion', defenseReduction: 3, durationTicks: 6 },
    poison:    { label: 'Poison',    tickDamage: 2, durationTicks: 8 },
  },

  // Tripartite Allocation — three legs that split passive PP investment.
  // CAPACITY -> multiplies current-run ppCap. POWER -> adds PP/s. RATE -> multiplies offload capGain.
  // Power curve (invested^exp * scale) so bonuses keep growing over hundreds of
  // hours — the old log1p curve effectively finished on day one. Scales are
  // anchored to match the old curve at ~1 hour of even-split investment (~600).
  TRIPARTITE_FLOW_RATE: 0.5,         // virtual investment units routed into legs per second
  TRIPARTITE_CURVE_EXP: 0.35,        // shared exponent — bonus term = invested^exp * scale
  // Session momentum: maintaining a live session ramps investment flow (a player
  // grinding a wall online earns acceleration; offline flow stays throttled at
  // 50% with no momentum). momentum = min(MAX, 1 + sessionHours * PER_HOUR).
  TRIPARTITE_MOMENTUM_PER_HOUR: 0.5,
  TRIPARTITE_MOMENTUM_MAX: 4,
  TRIPARTITE_CAPACITY_SCALE: 0.027,  // capMult = 1 + invested^exp * scale
  TRIPARTITE_POWER_SCALE: 0.034,     // added PP/s = invested^exp * scale
  TRIPARTITE_RATE_SCALE: 0.041,      // offload rateMult = 1 + invested^exp * scale
  TRIPARTITE_ZONE_BONUS: {
    landingSite: { leg: 'power',    mult: 1.5 },
    mine:        { leg: 'rate',     mult: 1.5 },
    verdantMaw:  { leg: 'capacity',   mult: 1.5 },
  },

  // Terrain types
  TERRAIN: {
    grass:  { speedMult: 1.0, hpCost: 0 },
    forest: { speedMult: 0.5, hpCost: 0, minSpeed: 3 },
    swamp:  { speedMult: 0.6, hpCost: 0.5 },  // HP per second
    rock:   { speedMult: 0.8, hpCost: 0 },
    water:  { speedMult: 0.3, hpCost: 1.0 },
  },
};
