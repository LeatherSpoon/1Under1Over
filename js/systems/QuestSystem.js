// ── QuestSystem.js ────────────────────────────────────────────────────────────
// Quest Hub: story chains + optional side quests.
// Replaces TaskSystem with selective-progression architecture:
//  - All chains run in parallel; each chain is sequential internally.
//  - Player chooses which quest to "track" in the HUD (defaults to first available).
//  - Side quests are drawn from a pool; player picks 1 to track at a time.
//  - PP rewards auto-granted on completion; onQuestComplete fires for toast.

// ── Story Quest Chains ────────────────────────────────────────────────────────

const CHAINS = [
  {
    id: 'firstContact',
    title: 'First Contact',
    icon: '🛸',
    subtitle: 'Get your bearings on an alien world.',
    quests: [
      {
        id: 'firstSteps',
        title: 'First Steps',
        desc: "Landing was perfect. The planet is not. Get moving and gather what you can.",
        reward: { pp: 25, label: '25 PP' },
        steps: [
          { id: 'walk50',    desc: 'Walk 50 steps' },
          { id: 'gather3',   desc: 'Gather 3 resources at the Landing Site' },
        ],
      },
      {
        id: 'survey',
        title: 'Survey the Landing Site',
        desc: 'Explore beyond the landing pad. Your next resources are underground.',
        reward: { pp: 50, label: '50 PP' },
        requires: 'firstSteps',
        steps: [
          { id: 'visitMine', desc: 'Travel to The Mine' },
          { id: 'gatherMine', desc: 'Gather a resource in The Mine' },
        ],
      },
    ],
  },

  {
    id: 'powerCore',
    title: 'Power Core',
    icon: '⚡',
    subtitle: 'Learn the Processing Power system.',
    quests: [
      {
        id: 'bootSequence',
        title: 'Boot Sequence',
        desc: 'Processing Power accumulates over time. Let it build up.',
        reward: { pp: 30, label: '30 PP' },
        steps: [
          { id: 'earn100pp', desc: 'Accumulate 100 PP' },
        ],
      },
      {
        id: 'capacityExpansion',
        title: 'Capacity Expansion',
        desc: 'Offloading sacrifices current PP for a permanent cap increase. Trade now to grow later.',
        reward: { pp: 75, label: '75 PP' },
        requires: 'bootSequence',
        steps: [
          { id: 'doOffload',  desc: 'Offload PP once to expand your cap' },
          { id: 'earn500pp',  desc: 'Accumulate 500 PP' },
        ],
      },
      {
        id: 'powerOverflow',
        title: 'Power Overflow',
        desc: 'Keep expanding. A larger cap means more PP available for upgrades.',
        reward: { pp: 200, label: '200 PP' },
        requires: 'capacityExpansion',
        steps: [
          { id: 'offload3x',   desc: 'Offload PP 3 times total' },
          { id: 'earn5000pp',  desc: 'Accumulate 5,000 PP' },
        ],
      },
    ],
  },

  {
    id: 'workshop',
    title: 'Workshop',
    icon: '🔧',
    subtitle: 'Master the crafting system.',
    quests: [
      {
        id: 'fieldFabrication',
        title: 'Field Fabrication',
        desc: 'Find the Fabricator station and craft your first tool. You\'ll need to upgrade Crafting first.',
        reward: { pp: 60, label: '60 PP' },
        steps: [
          { id: 'upgradeStatCrafting', desc: 'Upgrade the Crafting stat' },
          { id: 'gatherStoneCopper',   desc: 'Collect Stone ×1 and Copper ×1' },
          { id: 'craftTerrainCutter',  desc: 'Craft a Terrain Cutter' },
        ],
      },
      {
        id: 'armedTools',
        title: 'Toolkit Expansion',
        desc: 'A Rock Drill lets you extract ore from mine walls. A Harvest Blade speeds up gathering.',
        reward: { pp: 100, label: '100 PP' },
        requires: 'fieldFabrication',
        steps: [
          { id: 'craftRockDrill',    desc: 'Craft a Rock Drill' },
          { id: 'craftHarvestBlade', desc: 'Craft a Harvest Blade' },
        ],
      },
      {
        id: 'advancedFab',
        title: 'Advanced Fabrication',
        desc: 'Unlock Field Fabrication in the Tech Tree to access survival recipes.',
        reward: { pp: 250, label: '250 PP' },
        requires: 'armedTools',
        steps: [
          { id: 'purchaseFieldFab', desc: 'Unlock the Field Fabrication tech node' },
          { id: 'craftFirstAid',   desc: 'Craft a First Aid kit' },
        ],
      },
    ],
  },

  {
    id: 'mineOps',
    title: 'Mine Operations',
    icon: '⛏',
    subtitle: 'Extract ore from deep underground.',
    quests: [
      {
        id: 'intoTheRock',
        title: 'Into the Rock',
        desc: 'The Mine holds iron, carbon, and stone. Use a Rock Drill to break through ore veins.',
        reward: { pp: 80, label: '80 PP' },
        steps: [
          { id: 'drillRock',  desc: 'Drill a rock in The Mine' },
          { id: 'mineIron5',  desc: 'Collect Iron ×5 from mining' },
        ],
      },
      {
        id: 'deepDig',
        title: 'Going Deeper',
        desc: 'Research makes your mining more efficient. Unlock the tech and drill more.',
        reward: { pp: 175, label: '175 PP' },
        requires: 'intoTheRock',
        steps: [
          { id: 'drill10Total',    desc: 'Drill 10 rocks total' },
          { id: 'researchMining',  desc: 'Unlock Efficient Mining in the Tech Tree' },
        ],
      },
    ],
  },

  {
    id: 'combatProtocol',
    title: 'Combat Protocol',
    icon: '⚔',
    subtitle: 'Engage the hostile Scrapper units.',
    quests: [
      {
        id: 'firstBlood',
        title: 'First Blood',
        desc: 'Scrappers patrol these zones. Enter combat and defeat one.',
        reward: { pp: 40, label: '40 PP' },
        steps: [
          { id: 'defeatEnemy1', desc: 'Defeat 1 enemy' },
        ],
      },
      {
        id: 'armedCombat',
        title: 'Armed Combat',
        desc: 'Forge a weapon, equip it, then take the fight to the Scrappers.',
        reward: { pp: 120, label: '120 PP' },
        requires: 'firstBlood',
        steps: [
          { id: 'craftBasicBlade', desc: 'Craft a Basic Blade' },
          { id: 'equipBasicBlade', desc: 'Equip the Basic Blade' },
          { id: 'defeatEnemy5',    desc: 'Defeat 5 enemies total' },
        ],
      },
      {
        id: 'battleHardened',
        title: 'Battle-Hardened',
        desc: 'Keep fighting. Craft armor to boost your survivability.',
        reward: { pp: 350, label: '350 PP' },
        requires: 'armedCombat',
        steps: [
          { id: 'defeatEnemy25',   desc: 'Defeat 25 enemies total' },
          { id: 'craftBasicArmor', desc: 'Craft Basic Armor' },
        ],
      },
    ],
  },

  {
    id: 'footwork',
    title: 'On Your Feet',
    icon: '👟',
    subtitle: 'The pedometer turns every step into power.',
    quests: [
      {
        id: 'walkabout',
        title: 'Walkabout',
        desc: 'Motion is power. Walk around — the pedometer tracks every step.',
        reward: { pp: 20, label: '20 PP' },
        steps: [
          { id: 'walk200', desc: 'Walk 200 steps' },
        ],
      },
      {
        id: 'speedTrackIntro',
        title: 'Speed Tracks',
        desc: 'Place Speed Tracks on the ground to boost your movement. Open the Construct panel.',
        reward: { pp: 50, label: '50 PP' },
        requires: 'walkabout',
        steps: [
          { id: 'placeTracks5', desc: 'Place 5 Speed Tracks' },
          { id: 'buyTrack1',    desc: 'Purchase at least 1 Speed Track' },
        ],
      },
      {
        id: 'longDistanceRunner',
        title: 'Long Distance Runner',
        desc: 'Lay down the full free track allocation and keep walking.',
        reward: { pp: 150, label: '150 PP' },
        requires: 'speedTrackIntro',
        steps: [
          { id: 'place20',   desc: 'Place all 20 free Speed Tracks' },
          { id: 'walk1000',  desc: 'Walk 1,000 steps' },
        ],
      },
    ],
  },

  {
    id: 'droneFleet',
    title: 'Drone Fleet',
    icon: '🤖',
    subtitle: 'Deploy autonomous drones to gather for you.',
    quests: [
      {
        id: 'firstDeployment',
        title: 'First Deployment',
        desc: "Drone Alpha is ready. Assign it to gather a material, then send it on a zone mission.",
        reward: { pp: 60, label: '60 PP' },
        steps: [
          { id: 'assignDrone',  desc: 'Assign Drone Alpha to gather a material' },
          { id: 'sendMission',  desc: 'Send a drone on a zone mission' },
        ],
      },
      {
        id: 'expandFleet',
        title: 'Expand the Fleet',
        desc: 'Collect your mission loot, then invest in a second drone.',
        reward: { pp: 200, label: '200 PP' },
        requires: 'firstDeployment',
        steps: [
          { id: 'missionReturn',  desc: 'Collect a drone mission reward' },
          { id: 'unlock2ndDrone', desc: 'Unlock the 2nd drone' },
        ],
      },
    ],
  },

  {
    id: 'researchDivision',
    title: 'Research Division',
    icon: '🔬',
    subtitle: 'Unlock powerful passive upgrades via the Tech Tree.',
    quests: [
      {
        id: 'firstResearch',
        title: 'First Research',
        desc: 'The Tech Tree (TECH tab) has nodes that permanently improve your capabilities.',
        reward: { pp: 75, label: '75 PP' },
        steps: [
          { id: 'purchaseAnyTech', desc: 'Purchase any Tech Tree node' },
        ],
      },
      {
        id: 'branchOut',
        title: 'Branch Out',
        desc: 'Invest in multiple research directions. Unlock Combat Chip for passive strength.',
        reward: { pp: 225, label: '225 PP' },
        requires: 'firstResearch',
        steps: [
          { id: 'purchaseTech3',      desc: 'Purchase 3 Tech Tree nodes total' },
          { id: 'purchaseCombatChip', desc: 'Unlock the Combat Chip node' },
        ],
      },
    ],
  },

  {
    id: 'worldExplorer',
    title: 'World Explorer',
    icon: '🌍',
    subtitle: 'Discover the diverse biomes of this planet.',
    quests: [
      {
        id: 'verdantExpedition',
        title: 'Verdant Expedition',
        desc: 'The Verdant Maw is a jungle zone unlocked at 1,000 PP. Gather something there.',
        reward: { pp: 120, label: '120 PP' },
        steps: [
          { id: 'unlockVerdant', desc: 'Unlock the Verdant Maw (1,000 PP)' },
          { id: 'gatherVerdant', desc: 'Gather resources in the Verdant Maw' },
        ],
      },
      {
        id: 'coastalSurvey',
        title: 'Coastal Survey',
        desc: 'The Lagoon Coast holds rare silica and quartz. Unlock it at 9,000 PP.',
        reward: { pp: 300, label: '300 PP' },
        requires: 'verdantExpedition',
        steps: [
          { id: 'unlockLagoon', desc: 'Unlock Lagoon Coast (9,000 PP)' },
          { id: 'gatherLagoon', desc: 'Gather resources at the Lagoon Coast' },
        ],
      },
      {
        id: 'frozenFrontier',
        title: 'Frozen Frontier',
        desc: 'The Frozen Tundra is the most dangerous zone — and the most rewarding.',
        reward: { pp: 600, label: '600 PP' },
        requires: 'coastalSurvey',
        steps: [
          { id: 'unlockTundra', desc: 'Unlock the Frozen Tundra (25,000 PP)' },
          { id: 'gatherTundra', desc: 'Gather resources in the Frozen Tundra' },
        ],
      },
    ],
  },

  {
    id: 'transcendence',
    title: 'Transcendence',
    icon: '✦',
    subtitle: 'The landed ship holds the key to true power.',
    quests: [
      {
        id: 'shipAccess',
        title: 'Accessing the Ship',
        desc: 'Your ship is more than transport. Accumulate enough PP to bring its deeper systems online.',
        reward: { pp: 500, label: '500 PP' },
        steps: [
          { id: 'earn5000ppShip', desc: 'Accumulate 5,000 PP' },
          { id: 'visitShip',      desc: 'Visit the Spaceship zone' },
        ],
      },
      {
        id: 'firstAscension',
        title: 'First Ascension',
        desc: 'The Ascension Terminal lets you restart with permanent multipliers. Do it.',
        reward: { pp: 0, label: 'Ascension Bonus', special: true },
        requires: 'shipAccess',
        steps: [
          { id: 'openTerminal', desc: 'Open the Ascension Terminal' },
          { id: 'ascend',       desc: 'Complete your first Ascension' },
        ],
      },
    ],
  },
];

// ── Side Quest Pool ───────────────────────────────────────────────────────────

const SIDE_QUESTS = [
  // Gathering
  { id: 'sq_copper10',    cat: 'Gathering',    icon: '🪨', title: 'Copper Run',         desc: 'Collect Copper ×10.',         reward: { pp: 30 },  steps: [{ id: 'copper10',   desc: 'Collect Copper ×10' }] },
  { id: 'sq_iron10',      cat: 'Gathering',    icon: '🪨', title: 'Iron Stockpile',     desc: 'Collect Iron ×10.',           reward: { pp: 40 },  steps: [{ id: 'iron10',     desc: 'Collect Iron ×10' }] },
  { id: 'sq_fiber10',     cat: 'Gathering',    icon: '🌿', title: 'Fiber Haul',         desc: 'Collect Fiber ×10.',          reward: { pp: 25 },  steps: [{ id: 'fiber10',    desc: 'Collect Fiber ×10' }] },
  { id: 'sq_timber8',     cat: 'Gathering',    icon: '🪵', title: 'Timber Supply',      desc: 'Collect Timber ×8.',          reward: { pp: 30 },  steps: [{ id: 'timber8',    desc: 'Collect Timber ×8' }] },
  { id: 'sq_quartz5',     cat: 'Gathering',    icon: '💎', title: 'Quartz Cache',       desc: 'Collect Quartz ×5.',          reward: { pp: 50 },  steps: [{ id: 'quartz5',    desc: 'Collect Quartz ×5' }] },
  // Combat
  { id: 'sq_kill10',      cat: 'Combat',       icon: '⚔', title: 'Hunter',             desc: 'Defeat 10 enemies.',          reward: { pp: 80 },  steps: [{ id: 'kill10',     desc: 'Defeat 10 enemies' }] },
  { id: 'sq_kill25',      cat: 'Combat',       icon: '⚔', title: 'Veteran',            desc: 'Defeat 25 enemies.',          reward: { pp: 200 }, steps: [{ id: 'kill25',     desc: 'Defeat 25 enemies' }] },
  { id: 'sq_kill50',      cat: 'Combat',       icon: '💥', title: 'War Machine',        desc: 'Defeat 50 enemies.',          reward: { pp: 400 }, steps: [{ id: 'kill50',     desc: 'Defeat 50 enemies' }] },
  // Steps
  { id: 'sq_steps500',    cat: 'Exploration',  icon: '👟', title: 'Half Kilometer',     desc: 'Walk 500 steps.',             reward: { pp: 35 },  steps: [{ id: 'steps500',   desc: 'Walk 500 steps' }] },
  { id: 'sq_steps5k',     cat: 'Exploration',  icon: '👟', title: 'Iron Legs',          desc: 'Walk 5,000 steps.',           reward: { pp: 150 }, steps: [{ id: 'steps5000',  desc: 'Walk 5,000 steps' }] },
  { id: 'sq_steps25k',    cat: 'Exploration',  icon: '🏃', title: 'Marathon',           desc: 'Walk 25,000 steps.',          reward: { pp: 600 }, steps: [{ id: 'steps25000', desc: 'Walk 25,000 steps' }] },
  // Crafting
  { id: 'sq_ration3',     cat: 'Crafting',     icon: '🍖', title: 'Field Kitchen',      desc: 'Craft 3 Rations.',            reward: { pp: 30 },  steps: [{ id: 'ration3',    desc: 'Craft Ration ×3' }] },
  { id: 'sq_energyCell',  cat: 'Crafting',     icon: '🔋', title: 'Energy Reserve',     desc: 'Craft an Energy Cell.',       reward: { pp: 45 },  steps: [{ id: 'energyCell1',desc: 'Craft an Energy Cell' }] },
  { id: 'sq_repairKit',   cat: 'Crafting',     icon: '🔩', title: 'Field Repair',       desc: 'Craft a Repair Kit.',         reward: { pp: 60 },  steps: [{ id: 'repairKit1', desc: 'Craft a Repair Kit' }] },
  { id: 'sq_antidote',    cat: 'Crafting',     icon: '💉', title: 'Antidote Stock',     desc: 'Craft an Antidote.',          reward: { pp: 55 },  steps: [{ id: 'antidote1',  desc: 'Craft an Antidote' }] },
  // Stats
  { id: 'sq_stat5',       cat: 'Stats',        icon: '📈', title: 'Quick Learner',      desc: 'Level any stat to 5.',        reward: { pp: 60 },  steps: [{ id: 'statLv5',    desc: 'Level any stat to 5' }] },
  { id: 'sq_stat10',      cat: 'Stats',        icon: '📈', title: 'Specialist',         desc: 'Level any stat to 10.',       reward: { pp: 150 }, steps: [{ id: 'statLv10',   desc: 'Level any stat to 10' }] },
  { id: 'sq_stat25',      cat: 'Stats',        icon: '📊', title: 'Expert',             desc: 'Level any stat to 25.',       reward: { pp: 500 }, steps: [{ id: 'statLv25',   desc: 'Level any stat to 25' }] },
  // Power
  { id: 'sq_pp1000',      cat: 'Power',        icon: '⚡', title: 'Power Surge',        desc: 'Accumulate 1,000 PP.',        reward: { pp: 50 },  steps: [{ id: 'pp1000',     desc: 'Accumulate 1,000 PP' }] },
  { id: 'sq_offload5',    cat: 'Power',        icon: '♻', title: 'Recurring Revenue',  desc: 'Offload PP 5 times.',         reward: { pp: 200 }, steps: [{ id: 'offload5',   desc: 'Offload PP 5 times' }] },
  // Drones
  { id: 'sq_drones3',     cat: 'Drones',       icon: '🤖', title: 'Mini Swarm',         desc: 'Own 3 drones.',               reward: { pp: 150 }, steps: [{ id: 'drones3',    desc: 'Own 3 drones' }] },
  { id: 'sq_drones5',     cat: 'Drones',       icon: '🤖', title: 'Full Fleet',         desc: 'Own 5 drones.',               reward: { pp: 300 }, steps: [{ id: 'drones5',    desc: 'Own 5 drones' }] },
  // Research
  { id: 'sq_tech3',       cat: 'Research',     icon: '🔬', title: 'Researcher',         desc: 'Purchase 3 tech nodes.',      reward: { pp: 175 }, steps: [{ id: 'tech3',      desc: 'Purchase 3 tech nodes' }] },
  { id: 'sq_tech6',       cat: 'Research',     icon: '🔬', title: 'Lead Scientist',     desc: 'Purchase 6 tech nodes.',      reward: { pp: 400 }, steps: [{ id: 'tech6',      desc: 'Purchase 6 tech nodes' }] },
];

// ── QuestSystem class ─────────────────────────────────────────────────────────

export class QuestSystem {
  constructor() {
    // Build runtime state for chains
    this._chains = CHAINS.map(chain => ({
      ...chain,
      quests: chain.quests.map(q => ({
        ...q,
        steps: q.steps.map(s => ({ ...s, done: false })),
        _status: 'locked', // 'locked' | 'available' | 'active' | 'done'
      })),
    }));

    // Build runtime state for side quests
    this._sidePool = SIDE_QUESTS.map(sq => ({
      ...sq,
      steps: sq.steps.map(s => ({ ...s, done: false })),
      _status: 'available', // 'available' | 'active' | 'done'
    }));

    // Which quest the player is tracking in the HUD (chainId:questId, or null for auto)
    this.trackedQuestKey = null; // e.g. 'powerCore:bootSequence'
    // Which side quest is tracked (sq id, or null)
    this.trackedSideId = null;

    // Counters for cross-step checks
    this._counters = {
      steps: 0,
      pp: 0,
      offloads: 0,
      enemiesDefeated: 0,
      drillCount: 0,
      ironFromMine: 0,
      gatherLanding: 0,
      techPurchases: 0,
      missionRewards: 0,
      droneCount: 1,
      // Crafting counts
      craftedRation: 0,
      craftedEnergyCell: 0,
      craftedRepairKit: 0,
      craftedAntidote: 0,
      // Materials cumulative high-water-mark
      copperPeak: 0,
      ironPeak: 0,
      fiberPeak: 0,
      timberPeak: 0,
      quartzPeak: 0,
    };

    // Callbacks
    this.onUpdate = null;              // fn() — HUD refresh
    this.onQuestComplete = null;       // fn({ title, reward }) — toast
    this.onGrantPP = null;             // fn(amount) — PP reward disbursement

    this._initStatuses();
  }

  // ── Status initialisation ────────────────────────────────────────────────

  _initStatuses() {
    for (const chain of this._chains) {
      for (let i = 0; i < chain.quests.length; i++) {
        const q = chain.quests[i];
        if (q.done) { q._status = 'done'; continue; }
        if (i === 0) {
          q._status = 'available';
        } else {
          const prev = chain.quests[i - 1];
          q._status = (prev.done || prev._status === 'done') ? 'available' : 'locked';
        }
      }
    }
  }

  _recomputeStatuses() {
    for (const chain of this._chains) {
      for (let i = 0; i < chain.quests.length; i++) {
        const q = chain.quests[i];
        if (q._status === 'done') continue;
        if (i === 0) {
          if (q._status === 'locked') q._status = 'available';
        } else {
          const prev = chain.quests[i - 1];
          if (prev._status === 'done' && q._status === 'locked') {
            q._status = 'available';
          }
        }
      }
    }
  }

  // ── Public query ─────────────────────────────────────────────────────────

  getChains() { return this._chains; }
  getSidePool() { return this._sidePool; }

  /** Returns the quest object that should show in the HUD MAIN slot. */
  getTrackedChainQuest() {
    if (this.trackedQuestKey) {
      const [chainId, questId] = this.trackedQuestKey.split(':');
      const chain = this._chains.find(c => c.id === chainId);
      const q = chain?.quests.find(q => q.id === questId);
      if (q && q._status !== 'done') return { chain, quest: q };
    }
    // Auto: first non-done quest across chains
    for (const chain of this._chains) {
      for (const q of chain.quests) {
        if (q._status === 'available' || q._status === 'active') return { chain, quest: q };
      }
    }
    return null;
  }

  /** Returns the tracked side quest, or null. */
  getTrackedSideQuest() {
    if (!this.trackedSideId) return null;
    return this._sidePool.find(sq => sq.id === this.trackedSideId) || null;
  }

  setTrackedQuest(chainId, questId) {
    const key = `${chainId}:${questId}`;
    this.trackedQuestKey = (this.trackedQuestKey === key) ? null : key;
    this._notify();
  }

  setTrackedSide(sqId) {
    this.trackedSideId = (this.trackedSideId === sqId) ? null : sqId;
    this._notify();
  }

  // For backward-compat: return { label, steps } like TaskSystem did
  currentSequenceForDisplay() {
    const tracked = this.getTrackedChainQuest();
    if (!tracked) return { label: null, steps: [] };
    const { chain, quest } = tracked;
    return {
      label: `${chain.icon} ${quest.title}`,
      steps: quest.steps.map(s => ({ desc: s.desc, done: s.done })),
    };
  }

  // ── Internal step completion ──────────────────────────────────────────────

  _completeChainStep(chainId, questId, stepId) {
    const chain = this._chains.find(c => c.id === chainId);
    if (!chain) return false;
    const quest = chain.quests.find(q => q.id === questId);
    if (!quest || quest._status === 'done') return false;
    const step = quest.steps.find(s => s.id === stepId);
    if (!step || step.done) return false;

    step.done = true;
    quest._status = 'active';

    if (quest.steps.every(s => s.done)) {
      quest._status = 'done';
      this._recomputeStatuses();
      this._grantReward(quest, chain.title);
      // Clear tracked key if it was this quest
      if (this.trackedQuestKey === `${chainId}:${questId}`) {
        this.trackedQuestKey = null;
      }
    }
    this._notify();
    return true;
  }

  _completeSideStep(sqId, stepId) {
    const sq = this._sidePool.find(s => s.id === sqId);
    if (!sq || sq._status === 'done') return false;
    const step = sq.steps.find(s => s.id === stepId);
    if (!step || step.done) return false;

    step.done = true;
    sq._status = 'active';

    if (sq.steps.every(s => s.done)) {
      sq._status = 'done';
      this._grantReward(sq, sq.title);
      if (this.trackedSideId === sqId) this.trackedSideId = null;
    }
    this._notify();
    return true;
  }

  _grantReward(quest, sourceTitle) {
    if (quest.reward?.pp > 0) {
      this.onGrantPP?.(quest.reward.pp);
    }
    this.onQuestComplete?.({
      title: quest.title || sourceTitle,
      reward: quest.reward,
    });
  }

  _notify() {
    this.onUpdate?.();
  }

  // ── Event recording (public API) ──────────────────────────────────────────

  recordSteps(total) {
    this._counters.steps = total;
    if (total >= 50)    this._completeChainStep('firstContact',  'firstSteps',         'walk50');
    if (total >= 200)   this._completeChainStep('footwork',      'walkabout',          'walk200');
    if (total >= 1000)  this._completeChainStep('footwork',      'longDistanceRunner', 'walk1000');
    // Side quests
    if (total >= 500)   this._completeSideStep('sq_steps500',  'steps500');
    if (total >= 5000)  this._completeSideStep('sq_steps5k',   'steps5000');
    if (total >= 25000) this._completeSideStep('sq_steps25k',  'steps25000');
  }

  recordPP(total) {
    this._counters.pp = total;
    if (total >= 100)  this._completeChainStep('powerCore',     'bootSequence',      'earn100pp');
    if (total >= 500)  this._completeChainStep('powerCore',     'capacityExpansion', 'earn500pp');
    if (total >= 5000) this._completeChainStep('powerCore',     'powerOverflow',     'earn5000pp');
    if (total >= 5000) this._completeChainStep('transcendence', 'shipAccess',        'earn5000ppShip');
    // Side quest
    if (total >= 1000) this._completeSideStep('sq_pp1000', 'pp1000');
    // World explorer unlocks (unlock = first visit to zone means PP was >= threshold)
    // — handled via recordZoneVisit
  }

  recordOffload(totalOffloads) {
    this._counters.offloads = totalOffloads;
    if (totalOffloads >= 1) this._completeChainStep('powerCore', 'capacityExpansion', 'doOffload');
    if (totalOffloads >= 3) this._completeChainStep('powerCore', 'powerOverflow',     'offload3x');
    if (totalOffloads >= 5) this._completeSideStep('sq_offload5', 'offload5');
  }

  recordGather(zone, materials) {
    if (zone === 'landingSite') {
      this._counters.gatherLanding++;
      if (this._counters.gatherLanding >= 3) {
        this._completeChainStep('firstContact', 'firstSteps', 'gather3');
      }
    }
    if (zone === 'mine') {
      this._completeChainStep('firstContact', 'survey', 'gatherMine');
    }
    if (zone === 'verdantMaw') {
      this._completeChainStep('worldExplorer', 'verdantExpedition', 'gatherVerdant');
      // Unlock step (visited = unlocked by definition)
      this._completeChainStep('worldExplorer', 'verdantExpedition', 'unlockVerdant');
    }
    if (zone === 'lagoonCoast') {
      this._completeChainStep('worldExplorer', 'coastalSurvey', 'gatherLagoon');
      this._completeChainStep('worldExplorer', 'coastalSurvey', 'unlockLagoon');
    }
    if (zone === 'frozenTundra') {
      this._completeChainStep('worldExplorer', 'frozenFrontier', 'gatherTundra');
      this._completeChainStep('worldExplorer', 'frozenFrontier', 'unlockTundra');
    }

    // Side quests: material accumulation (high-water-mark)
    if (materials) this._checkMaterialSideQuests(materials);
  }

  _checkMaterialSideQuests(materials) {
    const update = (key, counterKey, threshold, sqId, stepId) => {
      const v = materials[key] || 0;
      if (v > this._counters[counterKey]) this._counters[counterKey] = v;
      if (this._counters[counterKey] >= threshold) this._completeSideStep(sqId, stepId);
    };
    update('copper', 'copperPeak', 10, 'sq_copper10', 'copper10');
    update('iron',   'ironPeak',   10, 'sq_iron10',   'iron10');
    update('fiber',  'fiberPeak',  10, 'sq_fiber10',  'fiber10');
    update('timber', 'timberPeak',  8, 'sq_timber8',  'timber8');
    update('quartz', 'quartzPeak',  5, 'sq_quartz5',  'quartz5');

    // Chain quest: stone+copper for terrain cutter
    if ((materials.stone || 0) >= 1 && (materials.copper || 0) >= 1) {
      this._completeChainStep('workshop', 'fieldFabrication', 'gatherStoneCopper');
    }
    // Mine iron milestone
    if ((materials.iron || 0) >= 5) {
      this._completeChainStep('mineOps', 'intoTheRock', 'mineIron5');
    }
  }

  recordDrill(zone) {
    if (zone === 'mine') {
      this._counters.drillCount++;
      this._completeChainStep('mineOps', 'intoTheRock', 'drillRock');
      if (this._counters.drillCount >= 10) {
        this._completeChainStep('mineOps', 'deepDig', 'drill10Total');
      }
    }
  }

  recordStatUpgrade(statName, newLevel) {
    // crafting stat upgrade
    if (statName === 'crafting') {
      this._completeChainStep('workshop', 'fieldFabrication', 'upgradeStatCrafting');
    }
    // Side quests: max level across all stats
    if (newLevel >= 5)  this._completeSideStep('sq_stat5',  'statLv5');
    if (newLevel >= 10) this._completeSideStep('sq_stat10', 'statLv10');
    if (newLevel >= 25) this._completeSideStep('sq_stat25', 'statLv25');
  }

  recordCraftComplete(recipeId) {
    // Chain: workshop
    if (recipeId === 'terrainCutter') this._completeChainStep('workshop', 'fieldFabrication', 'craftTerrainCutter');
    if (recipeId === 'rockDrill')     this._completeChainStep('workshop', 'armedTools',        'craftRockDrill');
    if (recipeId === 'harvestBlade')  this._completeChainStep('workshop', 'armedTools',        'craftHarvestBlade');
    if (recipeId === 'firstAid')      this._completeChainStep('workshop', 'advancedFab',       'craftFirstAid');
    // Chain: combat
    if (recipeId === 'basicBlade')    this._completeChainStep('combatProtocol', 'armedCombat',    'craftBasicBlade');
    if (recipeId === 'basicArmor')    this._completeChainStep('combatProtocol', 'battleHardened', 'craftBasicArmor');
    // Side quests: cumulative crafts per recipe
    if (recipeId === 'ration') {
      this._counters.craftedRation++;
      if (this._counters.craftedRation >= 3) this._completeSideStep('sq_ration3', 'ration3');
    }
    if (recipeId === 'energyCell') {
      this._counters.craftedEnergyCell++;
      if (this._counters.craftedEnergyCell >= 1) this._completeSideStep('sq_energyCell', 'energyCell1');
    }
    if (recipeId === 'repairKit') {
      this._counters.craftedRepairKit++;
      if (this._counters.craftedRepairKit >= 1) this._completeSideStep('sq_repairKit', 'repairKit1');
    }
    if (recipeId === 'antidote') {
      this._counters.craftedAntidote++;
      if (this._counters.craftedAntidote >= 1) this._completeSideStep('sq_antidote', 'antidote1');
    }
  }

  recordEquipItem(recipeId) {
    if (recipeId === 'basicBlade') {
      this._completeChainStep('combatProtocol', 'armedCombat', 'equipBasicBlade');
    }
  }

  recordEnemyDefeated(total) {
    this._counters.enemiesDefeated = total;
    if (total >= 1)  this._completeChainStep('combatProtocol', 'firstBlood',       'defeatEnemy1');
    if (total >= 5)  this._completeChainStep('combatProtocol', 'armedCombat',      'defeatEnemy5');
    if (total >= 25) this._completeChainStep('combatProtocol', 'battleHardened',   'defeatEnemy25');
    // Side quests
    if (total >= 10) this._completeSideStep('sq_kill10', 'kill10');
    if (total >= 25) this._completeSideStep('sq_kill25', 'kill25');
    if (total >= 50) this._completeSideStep('sq_kill50', 'kill50');
  }

  recordTrackPlaced(total) {
    if (total >= 5)  this._completeChainStep('footwork', 'speedTrackIntro',      'placeTracks5');
    if (total >= 20) this._completeChainStep('footwork', 'longDistanceRunner',   'place20');
  }

  recordTrackPurchased(_totalOwned) {
    // Any purchase >= 1 counts
    this._completeChainStep('footwork', 'speedTrackIntro', 'buyTrack1');
  }

  recordTrackRemoved(_total) {
    // no quest steps for removal currently
  }

  recordDroneAssigned() {
    this._completeChainStep('droneFleet', 'firstDeployment', 'assignDrone');
  }

  recordDroneDispatched() {
    this._completeChainStep('droneFleet', 'firstDeployment', 'sendMission');
  }

  recordDroneMissionComplete() {
    this._counters.missionRewards++;
    this._completeChainStep('droneFleet', 'expandFleet', 'missionReturn');
  }

  recordDroneCount(total) {
    this._counters.droneCount = total;
    if (total >= 2) this._completeChainStep('droneFleet', 'expandFleet', 'unlock2ndDrone');
    if (total >= 3) this._completeSideStep('sq_drones3', 'drones3');
    if (total >= 5) this._completeSideStep('sq_drones5', 'drones5');
  }

  recordTechPurchase(nodeId, totalOwned) {
    this._counters.techPurchases = totalOwned;
    // Any node first
    this._completeChainStep('researchDivision', 'firstResearch',  'purchaseAnyTech');
    if (nodeId === 'fieldFabrication') {
      this._completeChainStep('workshop',         'advancedFab',   'purchaseFieldFab');
    }
    if (nodeId === 'efficientMining') {
      this._completeChainStep('mineOps', 'deepDig', 'researchMining');
    }
    if (nodeId === 'combatChip') {
      this._completeChainStep('researchDivision', 'branchOut', 'purchaseCombatChip');
    }
    if (totalOwned >= 3) this._completeChainStep('researchDivision', 'branchOut', 'purchaseTech3');
    // Side quests
    if (totalOwned >= 3) this._completeSideStep('sq_tech3', 'tech3');
    if (totalOwned >= 6) this._completeSideStep('sq_tech6', 'tech6');
  }

  recordZoneVisit(zone) {
    if (zone === 'mine') {
      this._completeChainStep('firstContact',  'survey',         'visitMine');
    }
    if (zone === 'spaceship') {
      this._completeChainStep('transcendence', 'shipAccess',     'visitShip');
    }
    // World explorer: mark "unlock" step as complete when zone is visited
    if (zone === 'verdantMaw') {
      this._completeChainStep('worldExplorer', 'verdantExpedition', 'unlockVerdant');
    }
    if (zone === 'lagoonCoast') {
      this._completeChainStep('worldExplorer', 'coastalSurvey', 'unlockLagoon');
    }
    if (zone === 'frozenTundra') {
      this._completeChainStep('worldExplorer', 'frozenFrontier', 'unlockTundra');
    }
  }

  recordZoneAction(zone, action) {
    if (zone === 'spaceship' && action === 'ascensionTerminal') {
      this._completeChainStep('transcendence', 'firstAscension', 'openTerminal');
    }
  }

  recordAscension() {
    this._completeChainStep('transcendence', 'firstAscension', 'ascend');
  }

  recordMaterialAdded(materials) {
    // Chain: workshop collect stone+copper
    if ((materials.stone || 0) >= 1 && (materials.copper || 0) >= 1) {
      this._completeChainStep('workshop', 'fieldFabrication', 'gatherStoneCopper');
    }
    // Chain: mine iron
    if ((materials.iron || 0) >= 5) {
      this._completeChainStep('mineOps', 'intoTheRock', 'mineIron5');
    }
    // Side quests material peaks
    this._checkMaterialSideQuests(materials);
  }

  // ── Persistence ───────────────────────────────────────────────────────────

  serialize() {
    return {
      chains: this._chains.map(chain => ({
        id: chain.id,
        quests: chain.quests.map(q => ({
          id: q.id,
          _status: q._status,
          steps: q.steps.map(s => ({ id: s.id, done: s.done })),
        })),
      })),
      sidePool: this._sidePool.map(sq => ({
        id: sq.id,
        _status: sq._status,
        steps: sq.steps.map(s => ({ id: s.id, done: s.done })),
      })),
      trackedQuestKey: this.trackedQuestKey,
      trackedSideId: this.trackedSideId,
      counters: { ...this._counters },
    };
  }

  load(data) {
    if (!data) return;
    // Chains
    for (const savedChain of (data.chains || [])) {
      const chain = this._chains.find(c => c.id === savedChain.id);
      if (!chain) continue;
      for (const savedQ of (savedChain.quests || [])) {
        const q = chain.quests.find(q => q.id === savedQ.id);
        if (!q) continue;
        q._status = savedQ._status || q._status;
        for (const savedStep of (savedQ.steps || [])) {
          const step = q.steps.find(s => s.id === savedStep.id);
          if (step) step.done = !!savedStep.done;
        }
      }
    }
    // Side pool
    for (const savedSq of (data.sidePool || [])) {
      const sq = this._sidePool.find(s => s.id === savedSq.id);
      if (!sq) continue;
      sq._status = savedSq._status || sq._status;
      for (const savedStep of (savedSq.steps || [])) {
        const step = sq.steps.find(s => s.id === savedStep.id);
        if (step) step.done = !!savedStep.done;
      }
    }
    if (data.trackedQuestKey !== undefined) this.trackedQuestKey = data.trackedQuestKey;
    if (data.trackedSideId   !== undefined) this.trackedSideId   = data.trackedSideId;
    if (data.counters)                       Object.assign(this._counters, data.counters);
    this._recomputeStatuses();
    this._notify();
  }
}
