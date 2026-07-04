// ── Challenge System ────────────────────────────────────────────────────────
// NGU-style constrained runs. Start a challenge from the TRIALS panel; play
// under its constraint until the goal is met (or the constraint breaks).
// Completing a challenge grants a small permanent multiplier. Each challenge
// completes once. One challenge active at a time.
//
// Event hooks are wired in main.js at the existing wrap points:
//   recordStatUpgrade, recordOffload, recordEnemyDefeated, recordSteps,
//   recordMaterialCount, recordExpeditionKills, tick (per-frame PP/time).

const CHALLENGE_DEFS = [
  {
    id: 'silentGrowth', label: 'Silent Growth',
    desc: 'Offload at least 200 PP without buying a single stat upgrade.',
    reward: { type: 'ppRate', mult: 1.05, label: '+5% PP rate' },
  },
  {
    id: 'pacifistCore', label: 'Pacifist Core',
    desc: 'Reach 500 PP without defeating any enemy in the field.',
    reward: { type: 'ppCap', mult: 1.05, label: '+5% PP cap' },
  },
  {
    id: 'sprintCompile', label: 'Sprint Compile',
    desc: 'Offload at least 50 PP within 5 minutes of starting.',
    reward: { type: 'damage', mult: 1.10, label: '+10% damage' },
  },
  {
    id: 'ironPilgrimage', label: 'Iron Pilgrimage',
    desc: 'Walk 2,000 steps during a single challenge run.',
    reward: { type: 'ppRate', mult: 1.05, label: '+5% PP rate' },
  },
  {
    id: 'hoarderProtocol', label: 'Hoarder Protocol',
    desc: 'Hold 30 units of any single material at once.',
    reward: { type: 'ppCap', mult: 1.10, label: '+10% PP cap' },
  },
  {
    id: 'remoteWar', label: 'Remote War',
    desc: 'Destroy 100 enemies via Expedition while the challenge runs.',
    reward: { type: 'damage', mult: 1.15, label: '+15% damage' },
  },
];

const SPRINT_WINDOW_S = 300;

export class ChallengeSystem {
  constructor(ppSystem) {
    this.pp = ppSystem;
    this.activeId = null;
    this.completed = new Set();
    this._run = null; // { startedAt, steps, expeditionKills }
    this.onComplete = null; // fn(def) — toast + recompute in main.js
    this.onFail = null;     // fn(def, reason)
  }

  static get CHALLENGE_DEFS() { return CHALLENGE_DEFS; }

  getDef(id) { return CHALLENGE_DEFS.find(c => c.id === id) || null; }
  get activeDef() { return this.activeId ? this.getDef(this.activeId) : null; }
  isCompleted(id) { return this.completed.has(id); }

  start(id) {
    const def = this.getDef(id);
    if (!def || this.completed.has(id) || this.activeId) return false;
    this.activeId = id;
    this._run = { startedAt: Date.now(), steps: 0, expeditionKills: 0 };
    return true;
  }

  abandon() {
    this.activeId = null;
    this._run = null;
  }

  /** Progress descriptor for the panel: { text, pct } or null. */
  progress() {
    if (!this.activeId || !this._run) return null;
    const elapsed = (Date.now() - this._run.startedAt) / 1000;
    switch (this.activeId) {
      case 'silentGrowth':
        return { text: 'Offload ≥200 PP (no stat upgrades)', pct: Math.min(1, this.pp.ppTotal / 200) };
      case 'pacifistCore':
        return { text: `${Math.floor(this.pp.ppTotal)} / 500 PP`, pct: Math.min(1, this.pp.ppTotal / 500) };
      case 'sprintCompile': {
        const left = Math.max(0, SPRINT_WINDOW_S - elapsed);
        return { text: `Offload ≥50 PP — ${Math.ceil(left)}s left`, pct: Math.min(1, elapsed / SPRINT_WINDOW_S) };
      }
      case 'ironPilgrimage':
        return { text: `${this._run.steps} / 2000 steps`, pct: Math.min(1, this._run.steps / 2000) };
      case 'hoarderProtocol':
        return { text: 'Stack 30 of one material', pct: 0 };
      case 'remoteWar':
        return { text: `${this._run.expeditionKills} / 100 expedition kills`, pct: Math.min(1, this._run.expeditionKills / 100) };
    }
    return null;
  }

  // ── Event hooks ────────────────────────────────────────────────────────────

  recordStatUpgrade() {
    if (this.activeId === 'silentGrowth') this._fail('Stat upgrade purchased');
  }

  recordOffload(taken) {
    if (this.activeId === 'silentGrowth' && taken >= 200) this._complete();
    if (this.activeId === 'sprintCompile' && taken >= 50 &&
        (Date.now() - this._run.startedAt) / 1000 <= SPRINT_WINDOW_S) {
      this._complete();
    }
  }

  recordEnemyDefeated() {
    if (this.activeId === 'pacifistCore') this._fail('Enemy defeated');
  }

  recordSteps(steps) {
    if (!this._run) return;
    this._run.steps += steps;
    if (this.activeId === 'ironPilgrimage' && this._run.steps >= 2000) this._complete();
  }

  recordMaterialCount(maxCount) {
    if (this.activeId === 'hoarderProtocol' && maxCount >= 30) this._complete();
  }

  recordExpeditionKills(kills) {
    if (!this._run) return;
    this._run.expeditionKills += kills;
    if (this.activeId === 'remoteWar' && this._run.expeditionKills >= 100) this._complete();
  }

  /** Call periodically (per HUD tick is fine). */
  tick() {
    if (!this.activeId || !this._run) return;
    if (this.activeId === 'pacifistCore' && this.pp.ppTotal >= 500) this._complete();
    if (this.activeId === 'sprintCompile' &&
        (Date.now() - this._run.startedAt) / 1000 > SPRINT_WINDOW_S) {
      this._fail('Time expired');
    }
  }

  // ── Rewards ────────────────────────────────────────────────────────────────

  /** Product of completed-challenge multipliers of a given type. */
  multFor(type) {
    let m = 1;
    for (const def of CHALLENGE_DEFS) {
      if (this.completed.has(def.id) && def.reward.type === type) m *= def.reward.mult;
    }
    return m;
  }

  get ppRateMult() { return this.multFor('ppRate'); }
  get damageMult() { return this.multFor('damage'); }

  /** (Re-)apply cap-side rewards. Rate/damage are folded in by main.js. */
  applyBonuses() {
    this.pp.setCapMultiplier('challenges', this.multFor('ppCap'));
  }

  _complete() {
    const def = this.activeDef;
    if (!def) return;
    this.completed.add(def.id);
    this.activeId = null;
    this._run = null;
    this.applyBonuses();
    if (this.onComplete) this.onComplete(def);
  }

  _fail(reason) {
    const def = this.activeDef;
    if (!def) return;
    this.activeId = null;
    this._run = null;
    if (this.onFail) this.onFail(def, reason);
  }

  serialize() {
    return {
      completed: [...this.completed],
      activeId: this.activeId,
      run: this._run ? { ...this._run } : null,
    };
  }

  deserialize(data) {
    if (!data) return;
    this.completed = new Set(data.completed || []);
    this.activeId = data.activeId || null;
    this._run = data.run ? { ...data.run } : null;
  }
}
