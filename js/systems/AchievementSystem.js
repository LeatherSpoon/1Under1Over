// ── Achievement System ──────────────────────────────────────────────────────
// Tracks milestones and awards PP bonuses. Constant micro-goals for the player.

const ACHIEVEMENTS = [
  // PP milestones
  { id: 'pp_100',       label: 'Boot Sequence',      desc: 'Earn 100 PP',                 check: s => s.pp.ppTotal >= 100,                    reward: 25,   icon: '⚡' },
  { id: 'pp_1000',      label: 'Processor Online',    desc: 'Earn 1,000 PP',               check: s => s.pp.ppTotal >= 1000,                   reward: 100,  icon: '⚡' },
  { id: 'pp_10000',     label: 'Overclocked',         desc: 'Earn 10,000 PP',              check: s => s.pp.ppTotal >= 10000,                  reward: 500,  icon: '⚡' },
  { id: 'pp_100000',    label: 'Mainframe',           desc: 'Earn 100,000 PP',             check: s => s.pp.ppTotal >= 100000,                 reward: 2500, icon: '⚡' },

  // Combat
  { id: 'kill_1',       label: 'First Blood',         desc: 'Defeat 1 enemy',              check: s => s.gameStats.enemiesDefeated >= 1,       reward: 15,   icon: '⚔' },
  { id: 'kill_10',      label: 'Hunter',              desc: 'Defeat 10 enemies',           check: s => s.gameStats.enemiesDefeated >= 10,      reward: 50,   icon: '⚔' },
  { id: 'kill_50',      label: 'Veteran',             desc: 'Defeat 50 enemies',           check: s => s.gameStats.enemiesDefeated >= 50,      reward: 200,  icon: '⚔' },
  { id: 'kill_100',     label: 'Apex Predator',       desc: 'Defeat 100 enemies',          check: s => s.gameStats.enemiesDefeated >= 100,     reward: 500,  icon: '⚔' },
  { id: 'hit_50',       label: 'Hard Hitter',         desc: 'Deal 50+ in one hit',         check: s => s.gameStats.highestHit >= 50,           reward: 75,   icon: '💥' },
  { id: 'hit_200',      label: 'Devastating',         desc: 'Deal 200+ in one hit',        check: s => s.gameStats.highestHit >= 200,          reward: 300,  icon: '💥' },

  // Steps
  { id: 'steps_100',    label: 'First Steps',         desc: 'Walk 100 steps',              check: s => s.gameStats.totalStepsTaken >= 100,     reward: 10,   icon: '👟' },
  { id: 'steps_1000',   label: 'Trekker',             desc: 'Walk 1,000 steps',            check: s => s.gameStats.totalStepsTaken >= 1000,    reward: 50,   icon: '👟' },
  { id: 'steps_10000',  label: 'Marathon',             desc: 'Walk 10,000 steps',           check: s => s.gameStats.totalStepsTaken >= 10000,   reward: 250,  icon: '👟' },
  { id: 'steps_50000',  label: 'Unstoppable',         desc: 'Walk 50,000 steps',           check: s => s.gameStats.totalStepsTaken >= 50000,   reward: 1000, icon: '👟' },

  // Exploration
  { id: 'zones_3',      label: 'Explorer',            desc: 'Visit 3 zones',               check: s => s.gameStats.worldsDiscovered >= 3,      reward: 100,  icon: '🌍' },
  { id: 'zones_6',      label: 'Cartographer',        desc: 'Visit all 6 zones',           check: s => s.gameStats.worldsDiscovered >= 6,      reward: 500,  icon: '🌍' },

  // Crafting
  { id: 'craft_tool',   label: 'Toolsmith',           desc: 'Craft a tool',                check: s => Object.values(s.inventory.tools).some(v => v), reward: 30, icon: '🔧' },

  // Drones
  { id: 'drone_2',      label: 'Swarm Start',         desc: 'Own 2 drones',                check: s => s.drones.drones.length >= 2,            reward: 40,   icon: '🤖' },
  { id: 'drone_5',      label: 'Full Fleet',          desc: 'Own 5 drones',                check: s => s.drones.drones.length >= 5,            reward: 300,  icon: '🤖' },

  // Prestige
  { id: 'prestige_1',   label: 'First Offload',       desc: 'Offload PP once',             check: s => s.pp.prestigeCount > 0,                 reward: 50,   icon: '♻' },

  // Stats
  { id: 'stat_10',      label: 'Trained',             desc: 'Any stat to Lv 10',           check: s => Object.entries(s.statsSystem.stats).some(([k, st]) => k !== 'health' && st.level >= 10), reward: 100, icon: '📈' },
  { id: 'stat_25',      label: 'Specialist',          desc: 'Any stat to Lv 25',           check: s => Object.entries(s.statsSystem.stats).some(([k, st]) => k !== 'health' && st.level >= 25), reward: 500, icon: '📈' },

  // Survival
  { id: 'survivor',     label: 'Survivor',            desc: 'Kill 10 without dying once',  check: s => s.gameStats.enemiesDefeated >= 10 && s.gameStats.defeats === 0, reward: 200, icon: '🛡' },

  // Minigame
  { id: 'perfect_hit',  label: 'Bullseye',            desc: 'Get a PERFECT in the minigame', check: s => s._perfectHits > 0,                  reward: 75,   icon: '🎯' },

  // Ascension
  { id: 'ascend_1',     label: 'Transcendence',       desc: 'Ascend for the first time',   check: s => s.ascension && s.ascension.ascensionCount >= 1, reward: 0,    icon: '✦' },
  { id: 'ascend_3',     label: 'Reborn',              desc: 'Ascend 3 times',              check: s => s.ascension && s.ascension.ascensionCount >= 3, reward: 0,    icon: '✦' },

  // Extended PP milestones
  { id: 'pp_1m',        label: 'Supercomputer',       desc: 'Earn 1,000,000 PP',           check: s => s.pp.ppTotal >= 1000000,                        reward: 10000, icon: '⚡' },

  // Extended combat
  { id: 'kill_250',     label: 'War Machine',         desc: 'Defeat 250 enemies',          check: s => s.gameStats.enemiesDefeated >= 250,             reward: 1000, icon: '⚔' },
  { id: 'kill_500',     label: 'Unstoppable Force',   desc: 'Defeat 500 enemies',          check: s => s.gameStats.enemiesDefeated >= 500,             reward: 3000, icon: '⚔' },
  { id: 'hit_500',      label: 'Annihilator',         desc: 'Deal 500+ in one hit',        check: s => s.gameStats.highestHit >= 500,                  reward: 750,  icon: '💥' },

  // Extended steps
  { id: 'steps_100k',   label: 'Pilgrim',             desc: 'Walk 100,000 steps',          check: s => s.gameStats.totalStepsTaken >= 100000,          reward: 5000, icon: '👟' },

  // Crafting depth
  { id: 'craft_5',      label: 'Artisan',             desc: 'Craft 5 different tools',     check: s => Object.values(s.inventory.tools).filter(v => v).length >= 5, reward: 150, icon: '🔧' },

  // Resource gathering
  { id: 'gather_50',    label: 'Scavenger',           desc: 'Gather 50 resources',         check: s => (s.gameStats.resourcesGathered || 0) >= 50,     reward: 80,   icon: '⛏' },
  { id: 'gather_500',   label: 'Hoarder',             desc: 'Gather 500 resources',        check: s => (s.gameStats.resourcesGathered || 0) >= 500,    reward: 400,  icon: '⛏' },

  // Drone milestones
  { id: 'drone_10',     label: 'Drone Overlord',      desc: 'Own 10 drones',               check: s => s.drones.drones.length >= 10,                   reward: 1000, icon: '🤖' },

  // Stats depth
  { id: 'stat_50',      label: 'Master',              desc: 'Any stat to Lv 50',           check: s => Object.entries(s.statsSystem.stats).some(([k, st]) => k !== 'health' && st.level >= 50), reward: 2000, icon: '📈' },

  // Zone mastery — defeat enemies in every combat zone
  { id: 'all_zones_fought', label: 'Zone Clearer',   desc: 'Fight in all 5 combat zones', check: s => (s.gameStats.zonesWithKills || new Set()).size >= 5, reward: 800, icon: '🌍' },

  // Energy management
  { id: 'energy_empty', label: 'Running on Fumes',   desc: 'Deplete energy to 0',         check: s => (s.gameStats.energyDepleted || 0) >= 1,         reward: 25,   icon: '🔋' },

  // Prestige depth
  { id: 'prestige_5',   label: 'Cycle Master',       desc: 'Prestige 5 times',            check: s => (s.pp.prestigeCount || 0) >= 5,                 reward: 500,  icon: '♻' },

  // Minigame streak
  { id: 'mg_10',        label: 'Sharpshooter',       desc: 'Get 10 PERFECTs in minigame', check: s => s._perfectHits >= 10,                           reward: 300,  icon: '🎯' },
  
  // Mining milestones
  { id: 'mine_25',    label: 'Rock Breaker',    desc: 'Mine 25 wall blocks',         check: s => (s.gameStats.miningActions || 0) >= 25,   reward: 50,   rewardItems: { energyCell: 2 }, icon: '⛏' },
  { id: 'mine_100',   label: 'Excavator',       desc: 'Mine 100 wall blocks',        check: s => (s.gameStats.miningActions || 0) >= 100,  reward: 200,  rewardItems: { iron: 10, stone: 15 }, icon: '⛏' },
  { id: 'mine_500',   label: 'Tunnel Vision',   desc: 'Mine 500 wall blocks',        check: s => (s.gameStats.miningActions || 0) >= 500,  reward: 800,  rewardItems: { carbon: 5, quartz: 5 }, icon: '⛏' },
  { id: 'mine_1000',  label: 'Core Extractor',  desc: 'Mine 1,000 wall blocks',      check: s => (s.gameStats.miningActions || 0) >= 1000, reward: 2500, rewardItems: { gold: 3 }, icon: '⛏' },

  // Drilling milestones
  { id: 'stratum_10',   label: 'Deep Core',         desc: 'Reach Stratum 10',            check: s => s.drill && s.drill.currentStratum >= 10,             reward: 200,  icon: '🌋' },
  { id: 'stratum_20',   label: 'Mantle Seeker',      desc: 'Reach Stratum 20',            check: s => s.drill && s.drill.currentStratum >= 20,             reward: 500,  icon: '🌋' },
  { id: 'stratum_30',   label: 'Core Breach',        desc: 'Reach Stratum 30',            check: s => s.drill && s.drill.currentStratum >= 30,             reward: 1200, icon: '🌋' },
  { id: 'stratum_50',   label: 'Tectonic Master',    desc: 'Reach Stratum 50',            check: s => s.drill && s.drill.currentStratum >= 50,             reward: 3000, icon: '🌋' },
  { id: 'stratum_100',  label: 'Void Driller',       desc: 'Reach Stratum 100',           check: s => s.drill && s.drill.currentStratum >= 100,            reward: 10000, icon: '🌌' },
];

export class AchievementSystem {
  constructor() {
    this.unlocked = new Set();
    this._pending = [];
    this._checkTimer = 0;
    this._perfectHits = 0;  // tracked here for the minigame achievement
    this.onUnlock = null;
  }

  static get ALL() { return ACHIEVEMENTS; }

  /**
   * @param {number} delta
   * @param {object} systems - { pp, statsSystem, gameStats, inventory, drones, ascension }
   */
  update(delta, systems) {
    this._checkTimer += delta;
    if (this._checkTimer < 0.5) return;
    this._checkTimer = 0;

    // Inject _perfectHits into systems so check functions can read it
    systems._perfectHits = this._perfectHits;

    for (const ach of ACHIEVEMENTS) {
      if (this.unlocked.has(ach.id)) continue;
      try {
        if (ach.check(systems)) {
          this.unlocked.add(ach.id);
          if (ach.reward > 0) systems.pp.ppTotal += ach.reward;
          if (ach.rewardItems && systems.inventory) {
            for (const [mat, qty] of Object.entries(ach.rewardItems)) {
              systems.inventory.addMaterial(mat, qty);
            }
          }
          this._pending.push(ach);
          if (this.onUnlock) this.onUnlock(ach);
        }
      } catch (_) {}
    }
  }

  recordPerfect() { this._perfectHits++; }

  popPending() { return this._pending.shift() || null; }

  get totalUnlocked() { return this.unlocked.size; }
  get totalAchievements() { return ACHIEVEMENTS.length; }

  serialize() {
    return { unlocked: [...this.unlocked], perfectHits: this._perfectHits };
  }

  deserialize(data) {
    if (!data) return;
    this.unlocked = new Set(data.unlocked || []);
    this._perfectHits = data.perfectHits || 0;
  }
}
