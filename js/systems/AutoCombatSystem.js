// ── Auto-Combat System ──────────────────────────────────────────────────────
// When enabled, automatically fights enemies the player walks into.
// Uses priority: best affordable skill > basic fight.

export class AutoCombatSystem {
  constructor(combatSystem, statsSystem) {
    this.combat = combatSystem;
    this.stats = statsSystem;
    this.enabled = false;
    this._tickTimer = 0;
    this._actionInterval = 0.8; // seconds between auto-actions
  }

  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  /**
   * Call every frame while combat is active.
   */
  update(delta) {
    if (!this.enabled || !this.combat.active) return;

    this._tickTimer += delta;
    if (this._tickTimer < this._actionInterval) return;
    this._tickTimer = 0;

    const fp = this.stats.currentFP;
    const skills = [
      { key: 'ionBeam',        fp: 500 },
      { key: 'ballisticLunge', fp: 300 },
      { key: 'kineticDriver',  fp: 200 },
      { key: 'heavyHit',       fp: 100 },
      { key: 'jab',            fp: 20 },
    ];

    for (const skill of skills) {
      if (fp >= skill.fp) {
        this.combat.useSkill(skill.key);
        return;
      }
    }

    this.combat.fight();
  }
}
