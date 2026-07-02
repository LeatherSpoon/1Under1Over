/**
 * TelemetrySystem.js
 * Drop-in telemetry layer for the game. Tracks every meaningful player action
 * and game-state metric, then exports a structured JSON report per session.
 */

export class TelemetrySystem {

  constructor() {
    this._sessionId   = this._makeId();
    this._sessionStart = Date.now();
    this._lastTick    = Date.now();
    this._attached    = false;

    this.actions = {
      move_up:           0,
      move_down:         0,
      move_left:         0,
      move_right:        0,
      move_diagonal:     0,
      joystick_active:   0,
      gather_start:      0,
      gather_cancel:     0,
      gather_complete:   0,
      combat_enter:      0,
      combat_fight:      0,
      combat_skill_open: 0,
      combat_skill_use:  0,
      combat_items_open: 0,
      combat_item_use:   0,
      combat_run_attempt:0,
      combat_run_success:0,
      combat_victory:    0,
      combat_defeat:     0,
      panel_inventory:   0,
      panel_drone:       0,
      panel_equipment:   0,
      panel_pedometer:   0,
      panel_stat_sidebar:0,
      consumable_use_inv:0,
      stat_upgrade:      0,
      stat_upgrade_fail: 0,
      craft_start:       0,
      craft_complete:    0,
      drone_buy:         0,
      drone_assign:      0,
      drone_unassign:    0,
      drone_upgrade:     0,
      sync_status_change:0,
      sync_batch_success:0,
      sync_batch_fail:   0,
      transaction_retry: 0,
      tech_node_view:    0,
      tech_node_purchase_attempt: 0,
      tech_node_purchased: 0,
      mastery_xp_awarded: 0,
      mastery_level_gained: 0,
      ped_buy_pp_bonus:  0,
      ped_buy_track:     0,
      ped_place_track:   0,
      ped_buy_stat:      0,
      ped_unlock_zone:   0,
      equip_item:        0,
      unequip_item:      0,
      key_E:             0,
      key_T:             0,
    };

    this.session = {
      sessionId:              this._sessionId,
      startTime:              new Date(this._sessionStart).toISOString(),
      endTime:                null,
      durationSeconds:        0,
      totalDistanceTravelled: 0,
      totalStepsWalked:       0,
      combatsEntered:         0,
      combatVictories:        0,
      combatDefeats:          0,
      combatFlees:            0,
      totalDamageDealt:       0,
      totalDamageTaken:       0,
      totalSkillsUsed:        0,
      skillUsageBreakdown:    {},
      statusEffectsInflicted: {},
      rescueDroneActivations: 0,
      longestCombat_ms:       0,
      shortestCombat_ms:      Infinity,
      averageCombatDuration_ms: 0,
      _combatTimestamps:      [],
      ppEarnedTotal:          0,
      ppSpentTotal:           0,
      ppRateAtSessionEnd:     0,
      ppPerStepBonusPurchases:0,
      ppBonusPerStepAtEnd:    0,
      prestigesPerformed:     0,
      gatherCompletions:      0,
      gatherCancels:          0,
      resourcesCollected:     {},
      craftingCompletions:    0,
      craftingStarts:         0,
      recipiesCrafted:        {},
      speedTracksBought:      0,
      speedTracksPlaced:      0,
      zonesUnlocked:          [],
      statLevelsBoughtWithSteps: 0,
      dronesBought:           0,
      droneUpgrades:          0,
      droneAssignmentChanges: 0,
      syncStatusChanges:      [],
      syncBatchesSucceeded:   0,
      syncBatchesFailed:      0,
      syncLatencyMs:          [],
      syncMaxQueueLength:     0,
      techNodesPurchased:     {},
      masteryXpAwarded:       {},
      masteryLevelsGained:    {},
      transactionRejectReasons: {},
      uniquePanelsOpened:     new Set(),
      sessionIdleSeconds:     0,
      peakPPRate:             0,
      lowestHPReached:        Infinity,
      timesHPBelow25pct:      0,
      statUpgradeSequence:    [],
      firstCombatTime_s:      null,
      combatToGatherRatio:    0,
      decisionSpeed_ms:       [],
    };

    this._idleThreshold_ms  = 5000;
    this._lastInputTime     = Date.now();
    this._combatEnterTime   = null;
    this._combatFirstAction = false;
    this._ppSnapshot        = 0;
    this._prevDist          = 0;
    this._prevSteps         = 0;

    this._wireKeyboard();
    this._heartbeat = setInterval(() => this._tick(), 1000);

    console.log(`[Telemetry] Session ${this._sessionId} started.`);
  }

  attach(systems) {
    if (this._attached) return;
    this._attached = true;
    this._sys = systems;

    const { combat, crafting, drones, player } = systems;

    if (combat) {
      const _origStart = combat.startCombat.bind(combat);
      combat.startCombat = (enemy) => {
        this._onCombatStart(enemy);
        _origStart(enemy);
      };

      const _origFight = combat.fight.bind(combat);
      combat.fight = () => {
        this._onCombatFirstAction();
        this.track('combat_fight');
        _origFight();
      };

      const _origSkill = combat.useSkill.bind(combat);
      combat.useSkill = (key) => {
        this._onCombatFirstAction();
        this.track('combat_skill_use');
        this.session.totalSkillsUsed++;
        this.session.skillUsageBreakdown[key] = (this.session.skillUsageBreakdown[key] || 0) + 1;
        _origSkill(key);
      };

      const _origItem = combat.useItem.bind(combat);
      combat.useItem = (key) => {
        this._onCombatFirstAction();
        this.track('combat_item_use');
        _origItem(key);
      };

      const _origRun = combat.tryRun.bind(combat);
      combat.tryRun = () => {
        this._onCombatFirstAction();
        this.track('combat_run_attempt');
        _origRun();
      };

      const _origEnd = combat.onCombatEnd;
      combat.onCombatEnd = (won, fled) => {
        this._onCombatEnd(won, fled);
        if (_origEnd) _origEnd(won, fled);
      };

      if (systems.stats) {
        const _origTake = systems.stats.takeDamage.bind(systems.stats);
        systems.stats.takeDamage = (amount) => {
          const effective = _origTake(amount);
          this.session.totalDamageTaken += effective;
          const hp     = systems.stats.currentHP;
          const maxHp  = systems.stats.maxHP;
          if (hp < this.session.lowestHPReached) this.session.lowestHPReached = hp;
          if (hp / maxHp < 0.25) this.session.timesHPBelow25pct++;
          return effective;
        };
      }

      const _origRescue = combat.onRescue;
      combat.onRescue = () => {
        this.session.rescueDroneActivations++;
        if (_origRescue) _origRescue();
      };

      if (typeof combat._applyStatus === 'function') {
        const _origApply = combat._applyStatus.bind(combat);
        combat._applyStatus = (type) => {
          this.session.statusEffectsInflicted[type] = (this.session.statusEffectsInflicted[type] || 0) + 1;
          _origApply(type);
        };
      }

      if (typeof combat._dealDamageToEnemy === 'function') {
        const _origDeal = combat._dealDamageToEnemy.bind(combat);
        combat._dealDamageToEnemy = (dmg) => {
          this.session.totalDamageDealt += dmg;
          _origDeal(dmg);
        };
      }
    }

    if (crafting) {
      if (typeof crafting.startCraft === 'function') {
        const _origCraft = crafting.startCraft.bind(crafting);
        crafting.startCraft = (recipeKey) => {
          this.track('craft_start');
          this.session.craftingStarts++;
          return _origCraft(recipeKey);
        };
      }
      const _origComplete = crafting.onCraftComplete;
      crafting.onCraftComplete = (recipe) => {
        this.track('craft_complete');
        this.session.craftingCompletions++;
        if (recipe && recipe.id) {
          this.session.recipiesCrafted[recipe.id] = (this.session.recipiesCrafted[recipe.id] || 0) + 1;
        }
        if (_origComplete) _origComplete(recipe);
      };
    }

    if (drones) {
      if (typeof drones.buyNewDrone === 'function') {
        const _origBuy = drones.buyNewDrone.bind(drones);
        drones.buyNewDrone = () => {
          this.track('drone_buy');
          this.session.dronesBought++;
          return _origBuy();
        };
      }

      if (typeof drones.assignDrone === 'function') {
        const _origAssign = drones.assignDrone.bind(drones);
        drones.assignDrone = (id, mat) => {
          this.track('drone_assign');
          this.session.droneAssignmentChanges++;
          return _origAssign(id, mat);
        };
      }

      if (typeof drones.unassignDrone === 'function') {
        const _origUnassign = drones.unassignDrone.bind(drones);
        drones.unassignDrone = (id) => {
          this.track('drone_unassign');
          this.session.droneAssignmentChanges++;
          return _origUnassign(id);
        };
      }

      if (typeof drones.upgradeDroneEfficiency === 'function') {
        const _origUpgrade = drones.upgradeDroneEfficiency.bind(drones);
        drones.upgradeDroneEfficiency = (id) => {
          this.track('drone_upgrade');
          this.session.droneUpgrades++;
          return _origUpgrade(id);
        };
      }
    }

    if (systems.pp) {
      const _origSpend = systems.pp.spend.bind(systems.pp);
      systems.pp.spend = (cost) => {
        const ok = _origSpend(cost);
        if (ok) this.session.ppSpentTotal += cost;
        return ok;
      };

      if (typeof systems.pp.prestige === 'function') {
        const _origPrestige = systems.pp.prestige.bind(systems.pp);
        systems.pp.prestige = () => {
          const result = _origPrestige();
          if (result) this.session.prestigesPerformed++;
          return result;
        };
      }
    }

    if (systems.pedometer) {
      const ped = systems.pedometer;

      if (typeof ped.buyPPBonus === 'function') {
        const _origBuyBonus = ped.buyPPBonus.bind(ped);
        ped.buyPPBonus = () => {
          const ok = _origBuyBonus();
          if (ok) { this.track('ped_buy_pp_bonus'); this.session.ppPerStepBonusPurchases++; }
          return ok;
        };
      }

      if (typeof ped.buyTrack === 'function') {
        const _origBuyTrack = ped.buyTrack.bind(ped);
        ped.buyTrack = () => {
          const ok = _origBuyTrack();
          if (ok) { this.track('ped_buy_track'); this.session.speedTracksBought++; }
          return ok;
        };
      }

      if (typeof ped.buyStatLevel === 'function') {
        const _origBuyStat = ped.buyStatLevel.bind(ped);
        ped.buyStatLevel = (name, stats) => {
          const ok = _origBuyStat(name, stats);
          if (ok) { this.track('ped_buy_stat'); this.session.statLevelsBoughtWithSteps++; }
          return ok;
        };
      }

      if (typeof ped.unlockZone === 'function') {
        const _origUnlock = ped.unlockZone.bind(ped);
        ped.unlockZone = (zone) => {
          const ok = _origUnlock(zone);
          if (ok) { this.track('ped_unlock_zone'); this.session.zonesUnlocked.push(zone); }
          return ok;
        };
      }
    }

    if (systems.stats) {
      if (typeof systems.stats.levelUp === 'function') {
        const _origLevelUp = systems.stats.levelUp.bind(systems.stats);
        systems.stats.levelUp = (statName, ppSystem) => {
          const ok = _origLevelUp(statName, ppSystem);
          if (ok) {
            this.track('stat_upgrade');
            this.session.statUpgradeSequence.push({ stat: statName, t: this._elapsed() });
          } else {
            this.track('stat_upgrade_fail');
          }
          return ok;
        };
      }
    }

    console.log('[Telemetry] Attached to game systems.');
  }

  track(actionId) {
    this._lastInputTime = Date.now();
    if (this.actions[actionId] !== undefined) {
      this.actions[actionId]++;
    } else {
      this.actions[actionId] = 1;
    }
  }

  trackMovement(keysDown, player, touchInput = null) {
    this._lastInputTime = Date.now();
    const up    = keysDown.has('KeyW') || keysDown.has('ArrowUp');
    const down  = keysDown.has('KeyS') || keysDown.has('ArrowDown');
    const left  = keysDown.has('KeyA') || keysDown.has('ArrowLeft');
    const right = keysDown.has('KeyD') || keysDown.has('ArrowRight');

    if (up)    this.actions.move_up++;
    if (down)  this.actions.move_down++;
    if (left)  this.actions.move_left++;
    if (right) this.actions.move_right++;
    if ((up || down) && (left || right)) this.actions.move_diagonal++;
    if (touchInput?.isMoving) this.actions.joystick_active++;
  }

  trackGather(event, materialKey = null) {
    this._lastInputTime = Date.now();
    if (event === 'start')    { this.track('gather_start'); }
    if (event === 'cancel')   { this.track('gather_cancel');   this.session.gatherCancels++; }
    if (event === 'complete') {
      this.track('gather_complete');
      this.session.gatherCompletions++;
      if (materialKey) {
        this.session.resourcesCollected[materialKey] =
          (this.session.resourcesCollected[materialKey] || 0) + 1;
      }
    }
  }

  trackPanelOpen(panelName) {
    this._lastInputTime = Date.now();
    const key = `panel_${panelName}`;
    this.track(key);
    this.session.uniquePanelsOpened.add(panelName);
  }

  trackPP(ppTotal, ppRate) {
    const delta = ppTotal - this._ppSnapshot;
    if (delta > 0) this.session.ppEarnedTotal += delta;
    this._ppSnapshot = ppTotal;
    if (ppRate > this.session.peakPPRate) this.session.peakPPRate = ppRate;
  }

  trackSyncStatus(status, queueLength = 0) {
    this.track('sync_status_change');
    this.session.syncStatusChanges.push({
      status,
      queueLength,
      t: this._elapsed(),
    });
    this.session.syncMaxQueueLength = Math.max(
      this.session.syncMaxQueueLength,
      queueLength
    );
  }

  trackSyncBatch(ok, count = 0, latencyMs = 0) {
    this.session.syncLatencyMs.push(latencyMs);
    this.session.syncMaxQueueLength = Math.max(
      this.session.syncMaxQueueLength,
      count
    );

    if (ok) {
      this.track('sync_batch_success');
      this.session.syncBatchesSucceeded++;
    } else {
      this.track('sync_batch_fail');
      this.session.syncBatchesFailed++;
    }
  }

  trackTransactionRetry(reason = 'unknown') {
    this.track('transaction_retry');
    this.session.transactionRejectReasons[reason] =
      (this.session.transactionRejectReasons[reason] || 0) + 1;
  }

  trackTransactionRejected(reason = 'unknown') {
    this.trackTransactionRetry(reason);
  }

  trackTechNode(event, techNodeId) {
    if (event === 'view') this.track('tech_node_view');
    if (event === 'purchase_attempt') this.track('tech_node_purchase_attempt');
    if (event === 'purchased') {
      this.track('tech_node_purchased');
      if (techNodeId) {
        this.session.techNodesPurchased[techNodeId] =
          (this.session.techNodesPurchased[techNodeId] || 0) + 1;
      }
    }
  }

  trackMastery(event, trackId, payload = {}) {
    if (event === 'xp_awarded') {
      this.track('mastery_xp_awarded');
      if (trackId) {
        this.session.masteryXpAwarded[trackId] =
          (this.session.masteryXpAwarded[trackId] || 0) + (payload.xp || 0);
      }
    }
    if (event === 'level_gained') {
      this.track('mastery_level_gained');
      if (trackId) {
        this.session.masteryLevelsGained[trackId] =
          (this.session.masteryLevelsGained[trackId] || 0) + 1;
      }
    }
  }

  trackPosition(totalDist, totalSteps) {
    const distDelta  = Math.max(0, totalDist  - this._prevDist);
    const stepsDelta = Math.max(0, totalSteps - this._prevSteps);
    this.session.totalDistanceTravelled += distDelta;
    this.session.totalStepsWalked       += stepsDelta;
    this._prevDist  = totalDist;
    this._prevSteps = totalSteps;
  }

  finalise() {
    clearInterval(this._heartbeat);
    this._removeKeyboard();

    const now = Date.now();
    const dur = Math.round((now - this._sessionStart) / 1000);

    if (this._sys) {
      const { pp, pedometer, stats } = this._sys;
      if (pp)        { this.session.ppRateAtSessionEnd       = +pp.ppRate.toFixed(3); }
      if (pedometer) { this.session.ppBonusPerStepAtEnd      = +(pedometer._ppBonusPerStep || 0).toFixed(4); }
      if (stats)     { this.session.lowestHPReached          = Math.ceil(this.session.lowestHPReached === Infinity ? (stats.currentHP) : this.session.lowestHPReached); }
    }

    this.session.endTime         = new Date(now).toISOString();
    this.session.durationSeconds = dur;

    const combats = this.session.combatsEntered;
    const gathers = this.session.gatherCompletions;
    this.session.combatToGatherRatio = gathers > 0 ? +(combats / gathers).toFixed(2) : combats;

    const durations = this.session._combatTimestamps;
    if (durations.length > 0) {
      this.session.averageCombatDuration_ms = Math.round(durations.reduce((a,b) => a+b, 0) / durations.length);
    }
    if (this.session.shortestCombat_ms === Infinity) this.session.shortestCombat_ms = 0;

    this.session.uniquePanelsOpened = [...this.session.uniquePanelsOpened];
    delete this.session._combatTimestamps;

    const report = {
      meta: {
        version:    '1.0.0',
        exportedAt: new Date().toISOString(),
        sessionId:  this._sessionId,
      },
      actions: { ...this.actions },
      session: { ...this.session },
      derived: this._computeDerived(),
    };

    this._persist(report);
    console.log('[Telemetry] Session finalised:', report);
    return report;
  }

  exportJSON() {
    const sessions = this._loadAll();
    const blob = new Blob([JSON.stringify(sessions, null, 2)], { type: 'application/json' });
    this._download(blob, `telemetry_${Date.now()}.json`);
  }

  exportCSV() {
    const sessions = this._loadAll();
    if (!sessions.length) { alert('No telemetry data yet.'); return; }

    const flatFields = [
      'meta.sessionId', 'meta.exportedAt',
      'session.startTime', 'session.endTime', 'session.durationSeconds',
      'session.totalDistanceTravelled', 'session.totalStepsWalked',
      'session.combatsEntered', 'session.combatVictories', 'session.combatDefeats', 'session.combatFlees',
      'session.totalDamageDealt', 'session.totalDamageTaken', 'session.totalSkillsUsed',
      'session.ppEarnedTotal', 'session.ppSpentTotal', 'session.ppRateAtSessionEnd', 'session.peakPPRate',
      'session.gatherCompletions', 'session.gatherCancels',
      'session.craftingStarts', 'session.craftingCompletions',
      'session.dronesBought', 'session.droneUpgrades',
      'session.sessionIdleSeconds', 'session.lowestHPReached',
      'session.combatToGatherRatio',
      'derived.playstyle', 'derived.efficiencyScore', 'derived.survivalRate',
      'derived.engagementScore',
    ];

    const get = (obj, path) => {
      return path.split('.').reduce((o, k) => (o !== undefined ? o[k] : ''), obj) ?? '';
    };

    const header = flatFields.join(',');
    const rows   = sessions.map(s => flatFields.map(f => {
      const v = get(s, f);
      return typeof v === 'string' && v.includes(',') ? `"${v}"` : v;
    }).join(','));

    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' });
    this._download(blob, `telemetry_${Date.now()}.csv`);
  }

  clearAll() {
    localStorage.removeItem('telemetry_sessions');
    console.log('[Telemetry] All session data cleared.');
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  _onCombatStart(_enemy) {
    this.track('combat_enter');
    this.session.combatsEntered++;
    this._combatEnterTime   = Date.now();
    this._combatFirstAction = false;

    if (this.session.firstCombatTime_s === null) {
      this.session.firstCombatTime_s = this._elapsed();
    }
  }

  _onCombatFirstAction() {
    if (!this._combatFirstAction && this._combatEnterTime) {
      const dt = Date.now() - this._combatEnterTime;
      this.session.decisionSpeed_ms.push(dt);
      this._combatFirstAction = true;
    }
  }

  _onCombatEnd(won, fled) {
    if (won)  { this.track('combat_victory'); this.session.combatVictories++; }
    if (fled) { this.track('combat_run_success'); this.session.combatFlees++; }
    if (!won && !fled) { this.track('combat_defeat'); this.session.combatDefeats++; }

    if (this._combatEnterTime) {
      const dur = Date.now() - this._combatEnterTime;
      this.session._combatTimestamps.push(dur);
      if (dur > this.session.longestCombat_ms)  this.session.longestCombat_ms  = dur;
      if (dur < this.session.shortestCombat_ms) this.session.shortestCombat_ms = dur;
      this._combatEnterTime = null;
    }
  }

  _computeDerived() {
    const s = this.session;
    const a = this.actions;

    const totalCombatActions = a.combat_fight + a.combat_skill_use + a.combat_item_use;
    const skillRatio   = totalCombatActions > 0 ? a.combat_skill_use / totalCombatActions : 0;
    const itemRatio    = totalCombatActions > 0 ? a.combat_item_use  / totalCombatActions : 0;
    const droneRatio   = (a.drone_assign + a.drone_upgrade) / Math.max(1, s.durationSeconds / 60);

    let playstyle = 'Explorer';
    if (s.combatVictories > 10 && skillRatio > 0.4)   playstyle = 'Tactician';
    else if (s.combatVictories > 10 && skillRatio < 0.1) playstyle = 'Brawler';
    else if (s.gatherCompletions > s.combatsEntered * 2) playstyle = 'Gatherer';
    else if (droneRatio > 2)                           playstyle = 'Industrialist';
    else if (s.ppSpentTotal > s.ppEarnedTotal * 0.9)   playstyle = 'Optimizer';

    const activeMins = Math.max(1, (s.durationSeconds - s.sessionIdleSeconds) / 60);
    const efficiencyScore = Math.min(100, Math.round((s.ppEarnedTotal / activeMins) / 10));

    const survivalRate = s.combatsEntered > 0
      ? +(s.combatVictories / s.combatsEntered * 100).toFixed(1)
      : 100;

    const skillDependence = totalCombatActions > 0 ? +skillRatio.toFixed(2) : 0;

    const stepsToBonus = s.ppPerStepBonusPurchases;
    const economyGrade =
      stepsToBonus >= 5  ? 'S' :
      stepsToBonus >= 3  ? 'A' :
      stepsToBonus >= 1  ? 'B' : 'C';

    const systemsUsed = [
      s.combatsEntered > 0,
      s.gatherCompletions > 0,
      s.craftingCompletions > 0,
      s.dronesBought > 0,
      s.ppPerStepBonusPurchases > 0,
      s.statUpgradeSequence.length > 0,
      s.uniquePanelsOpened?.length > 2 || s.uniquePanelsOpened?.size > 2,
      s.prestigesPerformed > 0,
    ].filter(Boolean).length;
    const engagementScore = Math.round((systemsUsed / 8) * 100);

    const speeds = s.decisionSpeed_ms;
    const avgDecisionSpeed_ms = speeds.length > 0
      ? Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length)
      : null;

    const combatPattern =
      s.combatFlees > s.combatVictories    ? 'Avoidant'   :
      s.combatDefeats > s.combatVictories  ? 'Struggling' :
      skillRatio > 0.5                     ? 'Calculated' :
      itemRatio  > 0.3                     ? 'Resourceful': 'Aggressive';

    return {
      playstyle,
      efficiencyScore,
      survivalRate,
      skillDependence,
      economyGrade,
      engagementScore,
      avgDecisionSpeed_ms,
      combatPattern,
    };
  }

  _tick() {
    const now = Date.now();
    if (now - this._lastInputTime > this._idleThreshold_ms) {
      this.session.sessionIdleSeconds++;
    }
    if (this._sys?.pp) {
      this.trackPP(this._sys.pp.ppTotal, this._sys.pp.ppRate);
    }
  }

  _wireKeyboard() {
    const handler = (e) => {
      this._lastInputTime = Date.now();
      if (e.code === 'KeyE') this.track('key_E');
      if (e.code === 'KeyT') { this.track('key_T'); this.track('ped_place_track'); this.session.speedTracksPlaced++; }
    };
    window.addEventListener('keydown', handler);
    this._keyHandler = handler;
  }

  _removeKeyboard() {
    if (this._keyHandler) window.removeEventListener('keydown', this._keyHandler);
  }

  _persist(report) {
    try {
      const existing = this._loadAll();
      existing.push(report);
      const trimmed = existing.slice(-50);
      localStorage.setItem('telemetry_sessions', JSON.stringify(trimmed));
    } catch (e) {
      console.error('[Telemetry] Failed to persist session:', e);
    }
  }

  _loadAll() {
    try {
      return JSON.parse(localStorage.getItem('telemetry_sessions') || '[]');
    } catch {
      return [];
    }
  }

  _download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  _makeId() {
    return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  }

  _elapsed() {
    return Math.round((Date.now() - this._sessionStart) / 1000);
  }
}
