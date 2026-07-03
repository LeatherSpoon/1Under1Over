// ── Challenge System ────────────────────────────────────────────────────────
// NGU-style challenge runs: start a challenge, play under its restriction
// until you hit its goal, earn a permanent multiplier. Breaking the
// restriction fails the run (restart any time — completion is what's
// permanent). One challenge active at a time; each completes once.
//
// Restrictions are enforced by event notifications from main.js's existing
// callback wiring: notify('statUpgrade' | 'enemyDefeated' | 'defeated' |
// 'offload' | 'ascension' | 'craft'). Goals are polled in update().

export const CHALLENGES = [
  {
    id: 'pacifist',
    label: 'Pacifist Protocol',
    desc: 'Grow PP capacity to 400 without defeating a single enemy.',
    restriction: 'No enemy kills (world or simulator)',
    forbidden: ['enemyDefeated'],
    goal: { type: 'ppCap', value: 400 },
    reward: { type: 'ppRate', mult: 1.10, label: '+10% PP rate' },
  },
  {
    id: 'spartan',
    label: 'Spartan Frame',
    desc: 'Complete an Offload without buying a single stat level.',
    restriction: 'No stat upgrades',
    forbidden: ['statUpgrade'],
    goal: { type: 'offload', value: 1 },
    reward: { type: 'gather', mult: 1.15, label: '+15% gather speed' },
  },
  {
    id: 'ironCyborg',
    label: 'Iron Cyborg',
    desc: 'Grow PP capacity to 600 without ever being defeated in combat.',
    restriction: 'No combat defeats',
    forbidden: ['defeated'],
    goal: { type: 'ppCap', value: 600 },
    reward: { type: 'damage', mult: 1.15, label: '+15% combat damage' },
  },
  {
    id: 'luddite',
    label: 'Luddite Run',
    desc: 'Defeat 15 enemies without crafting anything.',
    restriction: 'No crafting',
    forbidden: ['craft'],
    goal: { type: 'kills', value: 15 },
    reward: { type: 'ppRate', mult: 1.10, label: '+10% PP rate' },
  },
  {
    id: 'sprinter',
    label: 'Sprint Circuit',
    desc: 'Complete two Offloads within 20 minutes of starting this challenge.',
    restriction: 'Beat the clock — 20 minutes',
    forbidden: [],
    timeLimit: 20 * 60, // seconds
    goal: { type: 'offload', value: 2 },
    reward: { type: 'drone', mult: 1.20, label: '+20% drone efficiency' },
  },
];

export class ChallengeSystem {
  constructor(ppSystem) {
    this.pp = ppSystem;
    this.completed = new Set();   // challenge ids (permanent)
    this.activeId = null;
    this._elapsed = 0;            // seconds since start (for timeLimit)
    this._progress = 0;           // event-counted goals (kills, offloads)

    this.onComplete = null;       // fn(challengeDef)
    this.onFail = null;           // fn(challengeDef, reason)
  }

  get challenges() { return CHALLENGES; }
  get active() { return CHALLENGES.find(c => c.id === this.activeId) || null; }

  // Permanent reward multipliers, product over completed challenges
  _rewardMult(type) {
    let m = 1;
    for (const c of CHALLENGES) {
      if (this.completed.has(c.id) && c.reward.type === type) m *= c.reward.mult;
    }
    return m;
  }
  get ppMultiplier()     { return this._rewardMult('ppRate'); }
  get gatherMultiplier() { return this._rewardMult('gather'); }
  get damageMultiplier() { return this._rewardMult('damage'); }
  get droneMultiplier()  { return this._rewardMult('drone'); }

  start(id) {
    const c = CHALLENGES.find(x => x.id === id);
    if (!c || this.completed.has(id) || this.activeId) return false;
    this.activeId = id;
    this._elapsed = 0;
    this._progress = 0;
    return true;
  }

  abandon() {
    this.activeId = null;
    this._elapsed = 0;
    this._progress = 0;
  }

  /** Event feed from main.js wiring. Fails the run on forbidden events, counts goal events. */
  notify(event) {
    const c = this.active;
    if (!c) return;
    if (c.forbidden.includes(event)) {
      const failed = c;
      this.abandon();
      if (this.onFail) this.onFail(failed, `Restriction broken: ${failed.restriction}`);
      return;
    }
    if (c.goal.type === 'kills' && event === 'enemyDefeated') this._progress++;
    if (c.goal.type === 'offload' && event === 'offload') this._progress++;
  }

  /** Poll goal + time limit; call once per frame. */
  update(delta) {
    const c = this.active;
    if (!c) return;

    if (c.timeLimit) {
      this._elapsed += delta;
      if (this._elapsed > c.timeLimit) {
        const failed = c;
        this.abandon();
        if (this.onFail) this.onFail(failed, 'Time limit expired');
        return;
      }
    }

    let done = false;
    if (c.goal.type === 'ppCap') done = this.pp.ppCap >= c.goal.value;
    else done = this._progress >= c.goal.value;

    if (done) {
      this.completed.add(c.id);
      this.activeId = null;
      if (this.onComplete) this.onComplete(c);
    }
  }

  /** Progress readout for the panel: { current, target, pct } */
  progressFor(c) {
    if (!c) return null;
    const target = c.goal.value;
    const current = c.goal.type === 'ppCap'
      ? Math.min(target, Math.floor(this.pp.ppCap))
      : this._progress;
    return { current, target, pct: Math.min(100, (current / target) * 100) };
  }

  get timeRemaining() {
    const c = this.active;
    if (!c || !c.timeLimit) return null;
    return Math.max(0, c.timeLimit - this._elapsed);
  }

  serialize() {
    return {
      completed: [...this.completed],
      activeId: this.activeId,
      elapsed: this._elapsed,
      progress: this._progress,
    };
  }

  deserialize(data) {
    if (!data) return;
    this.completed = new Set(data.completed || []);
    this.activeId = data.activeId || null;
    this._elapsed = data.elapsed || 0;
    this._progress = data.progress || 0;
  }
}
