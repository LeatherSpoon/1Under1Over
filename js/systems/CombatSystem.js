import { CONFIG } from '../config.js';

export class CombatSystem {
  constructor(statsSystem, ppSystem, inventorySystem) {
    this.stats = statsSystem;
    this.pp = ppSystem;
    this.inventory = inventorySystem;

    // Trade-off modifier hook (set from main.js via modifiers.onChange). 1 = neutral.
    this.damageMult = 1;

    this.active = false;
    this.enemy = null;
    this._enemyInterval = null;
    this._fpInterval = null;
    this._windupTimer = null;

    // Status effects on player: { type, remainingTicks }
    this.playerEffects = [];

    // Callbacks wired by CombatUI / main.js
    this.onLog = null;
    this.onFPUpdate = null;
    this.onHPUpdate = null;
    this.onCombatEnd = null;
    this.onStatusUpdate = null;
    this.onRescue = null;
    this.onWindup = null;   // fn(isCharging) — called for swinger wind-up
    this.onBurstStart = null; // fn() — for burst attacker animation
  }

  startCombat(enemy) {
    if (this.active) return;
    this.active = true;
    this.enemy = enemy;
    this.enemyCurrentHP = enemy.maxHP;
    this.playerEffects = [];

    this._log(`A wild ${enemy.name} appears!`);
    this._emitHP();

    // FP accumulation
    this._fpInterval = setInterval(() => {
      if (!this.active) return;
      let fpMult = 1;
      for (const eff of this.playerEffects) {
        if (eff.type === 'shock') fpMult *= (1 - CONFIG.STATUS_EFFECTS.shock.fpSlowPct);
      }
      this.stats.tickFP(CONFIG.FP_TICK_MS / 1000 * fpMult);
      if (this.onFPUpdate) this.onFPUpdate(this.stats.currentFP, this.stats.maxFP);
    }, CONFIG.FP_TICK_MS);

    // Enemy attack pattern
    this._scheduleNextAttack();
  }

  _scheduleNextAttack() {
    if (!this.active) return;
    const enemy = this.enemy;
    const interval = enemy.attackInterval;

    if (enemy.attackPattern === 'windup') {
      // Show charge ring for the first 2/3 of the interval, then hit
      const windupTime = Math.floor(interval * 0.67);
      const hitDelay = interval - windupTime;

      this._windupTimer = setTimeout(() => {
        if (!this.active) return;
        this._log(`${enemy.name} winds up for a massive strike!`);
        if (enemy.setCharging) enemy.setCharging(true);
        if (this.onWindup) this.onWindup(true);

        this._enemyInterval = setTimeout(() => {
          if (!this.active) return;
          if (enemy.setCharging) enemy.setCharging(false);
          if (this.onWindup) this.onWindup(false);

          const dmg = this.stats.takeDamage(enemy.damage);
          this._log(`${enemy.name} SLAMS! You take ${dmg} damage!`);
          if (enemy.statusEffect && Math.random() < 0.3) this._applyStatus(enemy.statusEffect);
          this._tickStatusEffects();
          this._emitHP();
          if (this.stats.currentHP <= 0) {
            this._endCombat(false);
          } else {
            this._scheduleNextAttack();
          }
        }, hitDelay);
      }, windupTime);

    } else if (enemy.attackPattern === 'burst') {
      // Wait full interval, then fire 3 hits at 150ms apart
      this._enemyInterval = setTimeout(() => {
        if (!this.active) return;
        this._log(`${enemy.name} initiates burst sequence!`);
        if (this.onBurstStart) this.onBurstStart();
        const hits = enemy.getAttackSequence();
        let aliveDuringBurst = true;

        for (const hit of hits) {
          setTimeout(() => {
            if (!this.active || !aliveDuringBurst) return;
            const dmg = this.stats.takeDamage(hit.damage);
            this._log(`${enemy.name} hits for ${dmg}!`);
            if (enemy.statusEffect && Math.random() < 0.3) this._applyStatus(enemy.statusEffect);
            this._tickStatusEffects();
            this._emitHP();
            if (this.stats.currentHP <= 0) {
              aliveDuringBurst = false;
              this._endCombat(false);
            }
          }, hit.delay);
        }

        // Schedule next after burst completes
        const burstEnd = hits[hits.length - 1].delay + 400;
        setTimeout(() => {
          if (this.active && aliveDuringBurst) this._scheduleNextAttack();
        }, burstEnd);
      }, enemy.attackInterval);

    } else {
      // Rusher — simple repeating attack
      this._enemyInterval = setTimeout(() => {
        if (!this.active) return;
        const dmg = this.stats.takeDamage(enemy.damage);
        this._log(`${enemy.name} attacks! You take ${dmg} damage.`);
        if (enemy.statusEffect && Math.random() < 0.3) this._applyStatus(enemy.statusEffect);
        this._tickStatusEffects();
        this._emitHP();
        if (this.stats.currentHP <= 0) {
          this._endCombat(false);
        } else {
          this._scheduleNextAttack();
        }
      }, enemy.attackInterval);
    }
  }

  // ── Status Effects ─────────────────────────────────────────────────────────
  _applyStatus(type) {
    const def = CONFIG.STATUS_EFFECTS[type];
    if (!def) return;
    if (this.playerEffects.find(e => e.type === type)) return;
    this.playerEffects.push({ type, remainingTicks: def.durationTicks });
    this._log(`You are afflicted with ${def.label}!`);
    if (this.onStatusUpdate) this.onStatusUpdate(this.playerEffects);
  }

  _tickStatusEffects() {
    for (let i = this.playerEffects.length - 1; i >= 0; i--) {
      const eff = this.playerEffects[i];
      const def = CONFIG.STATUS_EFFECTS[eff.type];
      if (def.tickDamage) {
        this.stats.currentHP = Math.max(1, this.stats.currentHP - def.tickDamage);
        this._log(`${def.label} deals ${def.tickDamage} damage!`);
      }
      eff.remainingTicks--;
      if (eff.remainingTicks <= 0) {
        this.playerEffects.splice(i, 1);
        this._log(`${def.label} wears off.`);
      }
    }
    if (this.onStatusUpdate) this.onStatusUpdate(this.playerEffects);
  }

  _clearStatusEffects() {
    this.playerEffects = [];
    if (this.onStatusUpdate) this.onStatusUpdate(this.playerEffects);
  }

  hasStatus(type) { return this.playerEffects.some(e => e.type === type); }
  removeStatus(type) {
    this.playerEffects = this.playerEffects.filter(e => e.type !== type);
    if (this.onStatusUpdate) this.onStatusUpdate(this.playerEffects);
  }

  // ── Player actions ─────────────────────────────────────────────────────────
  fight() {
    if (!this.active) return;
    const dmg = Math.floor(this.stats.damage * this.damageMult);
    this._dealDamageToEnemy(dmg);
    this._log(`You attack for ${dmg} damage!`);
  }

  useSkill(skillKey) {
    if (!this.active) return;
    const skill = CONFIG.SKILLS[skillKey];
    if (!skill) return;

    if (skillKey === 'scan') {
      if (!this.stats.spendFP(skill.fp)) { this._log('Not enough FP!'); return; }
      this._log(`Scan: ${this.enemy.name} — HP ${this.enemyCurrentHP}/${this.enemy.maxHP}, ATK ${this.enemy.damage}, Pattern: ${this.enemy.attackPattern}`);
      if (this.onFPUpdate) this.onFPUpdate(this.stats.currentFP, this.stats.maxFP);
      return;
    }

    if (!this.stats.spendFP(skill.fp)) { this._log('Not enough FP!'); return; }
    const dmg = Math.floor(this.stats.damage * skill.mult * this.damageMult);
    this._dealDamageToEnemy(dmg);
    this._log(`${skill.label}! You deal ${dmg} damage.`);
    if (this.onFPUpdate) this.onFPUpdate(this.stats.currentFP, this.stats.maxFP);
  }

  useItem(itemKey) {
    if (!this.active || !this.inventory) return;
    const result = this.inventory.useConsumable(itemKey, this.stats, this.pp);
    if (!result) { this._log('No item to use!'); return; }
    this._log(`Used ${result.label}!${result.healed > 0 ? ` +${result.healed} HP.` : ''}${result.ppBoosted ? ' PP rate boosted!' : ''}${result.ppGranted > 0 ? ` +${result.ppGranted} PP.` : ''}`);
    if (result.cured) {
      this.removeStatus(result.cured);
      this._log(`${result.label} cured ${result.cured}!`);
    }
    this._emitHP();
  }

  tryRun() {
    if (!this.active) return;
    const chance = CONFIG.RUN_BASE_CHANCE + (this.stats.agility - 1) * 0.05;
    if (Math.random() < chance) {
      this._log('You got away safely!');
      this._endCombat(false, true);
    } else {
      this._log("Can't escape!");
    }
  }

  // ── Internal ───────────────────────────────────────────────────────────────
  _dealDamageToEnemy(dmg) {
    this.enemyCurrentHP = Math.max(0, this.enemyCurrentHP - dmg);
    this._emitHP();
    if (this.enemyCurrentHP <= 0) {
      this._log(`${this.enemy.name} defeated!`);
      this._endCombat(true);
    }
  }

  _endCombat(won, fled = false) {
    if (!this.active) return;
    this.active = false;

    clearInterval(this._fpInterval);
    clearTimeout(this._enemyInterval);
    clearTimeout(this._windupTimer);
    this._fpInterval = null;
    this._enemyInterval = null;
    this._windupTimer = null;

    if (this.enemy && this.enemy.setCharging) this.enemy.setCharging(false);

    this._clearStatusEffects();

    if (won) {
      const pp = this.enemy.ppReward;
      this.pp.ppTotal += pp;
      this._log(`Victory! +${pp} PP`);
      this._rollDrops(this.enemy.archetype);
      this.enemy.die();
    } else if (!fled) {
      this._log('Rescue drone activated! Returning to base...');
      this.stats.rescueDrone();
      if (this.onRescue) this.onRescue();
    }

    this.stats.resetFP();
    if (this.onFPUpdate) this.onFPUpdate(0, this.stats.maxFP);
    if (this.onCombatEnd) this.onCombatEnd(won, fled);
  }

  _rollDrops(archetype) {
    const DROP_TABLES = {
      rusher:  [{ mat: 'circuitWire',    label: 'Circuit Wire',    chance: 0.60 },
                { mat: 'ironSpike',      label: 'Iron Spike',      chance: 0.30 }],
      swinger: [{ mat: 'powerCore',      label: 'Power Core',      chance: 0.40 },
                { mat: 'armorPlate',     label: 'Armor Plate',     chance: 0.20 }],
      burst:   [{ mat: 'burstCapacitor', label: 'Burst Capacitor', chance: 0.60 },
                { mat: 'logicChip',      label: 'Logic Chip',      chance: 0.30 }],
    };
    const table = DROP_TABLES[archetype] || [];
    for (const { mat, label, chance } of table) {
      if (Math.random() < chance) {
        this.inventory.addMaterial(mat, 1);
        this._log(`Dropped: ${label}`);
      }
    }
  }

  _log(msg) { if (this.onLog) this.onLog(msg); }
  _emitHP() {
    if (this.onHPUpdate) {
      this.onHPUpdate(this.stats.currentHP, this.stats.maxHP, this.enemyCurrentHP, this.enemy.maxHP);
    }
  }
}
