import { CONFIG } from '../config.js';

export class CombatSystem {
  constructor(statsSystem, ppSystem, inventorySystem) {
    this.stats = statsSystem;
    this.pp = ppSystem;
    this.inventory = inventorySystem;

    // Trade-off modifier hook (set from main.js via modifiers.onChange). 1 = neutral.
    this.damageMult = 1;
    // Permanent multiplier from boss trophies + completed challenges (set from main.js). 1 = neutral.
    this.permDamageMult = 1;
    // Enemy rage ramp — compounds per enemy attack while rageRamp archetypes fight.
    this._rageMult = 1;

    this.active = false;
    this.enemy = null;
    this._enemyInterval = null;
    this._fpInterval = null;
    this._windupTimer = null;
    this._graceActive = false;
    this._graceTimer = null;

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
    this.onPlayerHit = null; // fn({type:'hit'|'dodge', dmg, absorbed}) — damage floater
    this.onBossDefeated = null; // fn(archetype) — wired to BossSystem in main.js
  }

  startCombat(enemy) {
    if (this.active) return;
    this.active = true;
    this.enemy = enemy;
    this.enemyCurrentHP = enemy.maxHP;
    this.playerEffects = [];
    this._rageMult = 1;

    this._log(enemy.boss ? `☠ ${enemy.name} — ZONE BOSS — blocks your path!` : `A wild ${enemy.name} appears!`);
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

    // Opening grace — the enemy holds its first attack until the player acts
    // (or the grace elapses), so the combat transition never costs free hits.
    this._graceActive = true;
    this._graceTimer = setTimeout(() => this._endGrace(), CONFIG.COMBAT_GRACE_MS);
  }

  _endGrace() {
    if (!this._graceActive) return;
    this._graceActive = false;
    clearTimeout(this._graceTimer);
    this._graceTimer = null;
    if (this.active) this._scheduleNextAttack();
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

          const dmg = this._enemyStrike(enemy.damage);
          this._log(`${enemy.name} SLAMS! You take ${dmg} damage!`);
          if (enemy.statusEffect && Math.random() < 0.3) this._applyStatus(enemy.statusEffect);
          this._tickStatusEffects();
          this._afterEnemyAttack();
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
            const dmg = this._enemyStrike(hit.damage);
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
          if (this.active && aliveDuringBurst) {
            this._afterEnemyAttack();
            this._emitHP();
            this._scheduleNextAttack();
          }
        }, burstEnd);
      }, enemy.attackInterval);

    } else {
      // Melee — simple repeating attack
      this._enemyInterval = setTimeout(() => {
        if (!this.active) return;
        const dmg = this._enemyStrike(enemy.damage);
        this._log(`${enemy.name} attacks! You take ${dmg} damage.`);
        if (enemy.statusEffect && Math.random() < 0.3) this._applyStatus(enemy.statusEffect);
        this._tickStatusEffects();
        this._afterEnemyAttack();
        this._emitHP();
        if (this.stats.currentHP <= 0) {
          this._endCombat(false);
        } else {
          this._scheduleNextAttack();
        }
      }, enemy.attackInterval);
    }
  }

  /** Apply one enemy hit to the player, including rage ramp and FP drain. */
  _enemyStrike(baseDamage) {
    const enemy = this.enemy;
    const dmg = this.stats.takeDamage(Math.round(baseDamage * this._rageMult));
    if (enemy.fpDrainOnHit > 0 && this.stats.currentFP > 0) {
      this.stats.currentFP = Math.max(0, this.stats.currentFP - enemy.fpDrainOnHit);
      this._log(`${enemy.name} siphons your Focus!`);
      if (this.onFPUpdate) this.onFPUpdate(this.stats.currentFP, this.stats.maxFP);
    }
    return dmg;
  }

  /** Post-attack effects: rage ramp compounds, regenerators recover HP. */
  _afterEnemyAttack() {
    const enemy = this.enemy;
    if (!enemy) return;
    if (enemy.rageRamp > 0) {
      this._rageMult *= enemy.rageRamp;
    }
    if (enemy.regenOnAttack > 0 && this.enemyCurrentHP > 0 && this.enemyCurrentHP < enemy.maxHP) {
      this.enemyCurrentHP = Math.min(enemy.maxHP, this.enemyCurrentHP + enemy.regenOnAttack);
      this._log(`${enemy.name} regenerates ${enemy.regenOnAttack} HP.`);
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

  /**
   * Resolve one player attack against the enemy: dodge check, then armor.
   * Returns damage dealt (0 on a dodge).
   */
  _playerAttack(rawDmg) {
    const enemy = this.enemy;
    if (enemy.dodgeChance > 0 && Math.random() < enemy.dodgeChance) {
      this._log(`${enemy.name} phases through your attack!`);
      if (this.onPlayerHit) this.onPlayerHit({ type: 'dodge' });
      return 0;
    }
    const dmg = Math.max(1, rawDmg - (enemy.armor || 0));
    if (enemy.armor > 0 && dmg < rawDmg) {
      this._log(`${enemy.name}'s armor absorbs ${rawDmg - dmg}.`);
    }
    this._dealDamageToEnemy(dmg);
    if (this.onPlayerHit) this.onPlayerHit({ type: 'hit', dmg, absorbed: rawDmg - dmg });
    return dmg;
  }

  fight() {
    if (!this.active) return;
    this._endGrace();
    const raw = Math.floor(this.stats.damage * this.damageMult * this.permDamageMult);
    const dmg = this._playerAttack(raw);
    if (dmg > 0) this._log(`You attack for ${dmg} damage!`);
  }

  useSkill(skillKey) {
    if (!this.active) return;
    this._endGrace();
    const skill = CONFIG.SKILLS[skillKey];
    if (!skill) return;

    if (skillKey === 'scan') {
      if (!this.stats.spendFP(skill.fp)) { this._log('Not enough FP!'); return; }
      this._log(`Scan: ${this.enemy.name} — HP ${this.enemyCurrentHP}/${this.enemy.maxHP}, ATK ${this.enemy.damage}, Pattern: ${this.enemy.attackPattern}`);
      if (this.onFPUpdate) this.onFPUpdate(this.stats.currentFP, this.stats.maxFP);
      return;
    }

    if (!this.stats.spendFP(skill.fp)) { this._log('Not enough FP!'); return; }
    const raw = Math.floor(this.stats.damage * skill.mult * this.damageMult * this.permDamageMult);
    const dmg = this._playerAttack(raw);
    if (dmg > 0) this._log(`${skill.label}! You deal ${dmg} damage.`);
    if (this.onFPUpdate) this.onFPUpdate(this.stats.currentFP, this.stats.maxFP);
  }

  useItem(itemKey) {
    if (!this.active || !this.inventory) return;
    this._endGrace();
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
    this._endGrace();
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

    // Boss phase 2 — trigger once when HP crosses the threshold
    const e = this.enemy;
    if (e.boss && e.phase2 && !e._enraged && this.enemyCurrentHP > 0 &&
        this.enemyCurrentHP <= e.maxHP * e.phase2.at) {
      e._enraged = true;
      const p = e.phase2;
      if (p.damageMult)   e.damage = Math.round(e.damage * p.damageMult);
      if (p.intervalMult) e.attackInterval = Math.max(400, Math.round(e.attackInterval * p.intervalMult));
      if (p.dodge)        e.dodgeChance = Math.max(e.dodgeChance, p.dodge);
      if (p.regen)        e.regenOnAttack = Math.max(e.regenOnAttack, p.regen);
      this._log(`⚠ ${e.name} ENRAGES — its pattern shifts!`);
    }

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
    clearTimeout(this._graceTimer);
    this._fpInterval = null;
    this._enemyInterval = null;
    this._windupTimer = null;
    this._graceTimer = null;
    this._graceActive = false;

    if (this.enemy && this.enemy.setCharging) this.enemy.setCharging(false);

    this._clearStatusEffects();

    if (won) {
      const pp = this.enemy.ppReward;
      this.pp.ppTotal += pp;
      this._log(`Victory! +${pp} PP`);
      this._rollDrops(this.enemy.archetype);
      if (this.enemy.boss && this.onBossDefeated) this.onBossDefeated(this.enemy.archetype);
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
    const table = CombatSystem.DROP_TABLES[archetype] || [];
    for (const { mat, label, chance, qty } of table) {
      if (Math.random() < chance) {
        this.inventory.addMaterial(mat, qty || 1);
        this._log(`Dropped: ${label}${(qty || 1) > 1 ? ` ×${qty}` : ''}`);
      }
    }
  }

  static get DROP_TABLES() {
    return {
      serpendrill: [{ mat: 'ferrous_ore',    label: 'Ferrous Ore',     chance: 0.55 },
                    { mat: 'quartz',         label: 'Quartz',          chance: 0.30 }],
      reptlar:     [{ mat: 'synthetic_resin', label: 'Synthetic Resin', chance: 0.50 },
                    { mat: 'carbon_biomass', label: 'Carbon Biomass',  chance: 0.30 }],
      hardlizzy:   [{ mat: 'armorPlate',     label: 'Armor Plate',     chance: 0.55 },
                    { mat: 'titanium',       label: 'Titanium',        chance: 0.25 }],
      cavecrab:    [{ mat: 'alloy_bar',      label: 'Alloy Bar',       chance: 0.50 },
                    { mat: 'tungsten',       label: 'Tungsten',        chance: 0.30 }],
      // Bosses — guaranteed hauls
      boss_landing: [{ mat: 'powerCore',   label: 'Power Core',   chance: 1, qty: 3 },
                     { mat: 'circuitWire', label: 'Circuit Wire', chance: 1, qty: 5 }],
      boss_mine:    [{ mat: 'armorPlate',  label: 'Armor Plate',  chance: 1, qty: 3 },
                     { mat: 'steel_ingot', label: 'Steel Ingot',  chance: 1, qty: 2 }],
      boss_verdant: [{ mat: 'synthetic_resin', label: 'Synthetic Resin', chance: 1, qty: 3 },
                     { mat: 'carbon_biomass',  label: 'Carbon Biomass',  chance: 1, qty: 4 }],
      boss_lagoon:  [{ mat: 'logicChip',   label: 'Logic Chip',   chance: 1, qty: 4 },
                     { mat: 'silica',      label: 'Silica',       chance: 1, qty: 5 }],
      boss_tundra:  [{ mat: 'titanium',    label: 'Titanium',     chance: 1, qty: 3 },
                     { mat: 'tungsten',    label: 'Tungsten',     chance: 1, qty: 3 }],
      boss_depths:  [{ mat: 'quantum_processor_ring', label: 'Quantum Processor Ring', chance: 1, qty: 1 },
                     { mat: 'powerCore',   label: 'Power Core',   chance: 1, qty: 5 }],
    };
  }

  _log(msg) { if (this.onLog) this.onLog(msg); }
  _emitHP() {
    if (this.onHPUpdate) {
      this.onHPUpdate(this.stats.currentHP, this.stats.maxHP, this.enemyCurrentHP, this.enemy.maxHP);
    }
  }
}
