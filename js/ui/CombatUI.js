import { SkillsMenu } from './SkillsMenu.js';

const CIRCUMFERENCE = 2 * Math.PI * 40; // r=40 matches SVG

export class CombatUI {
  constructor(combatSystem, statsSystem, entityManager, player, inventorySystem, ppSystem) {
    this.combat = combatSystem;
    this.stats = statsSystem;
    this.entityManager = entityManager;
    this.player = player;
    this.inventory = inventorySystem;
    this.pp = ppSystem;

    this.overlay = document.getElementById('combat-overlay');
    this.skillsMenu = document.getElementById('skills-menu');
    this.itemsMenu = document.getElementById('items-menu');
    this.itemsList = document.getElementById('items-list');
    this.logEl = document.getElementById('combat-log');
    this.statusEl = document.getElementById('status-effects');

    this.enemyHPFill = document.getElementById('enemy-hp-fill');
    this.enemyHPText = document.getElementById('enemy-hp-text');
    this.playerHPFill = document.getElementById('player-hp-fill');
    this.playerHPText = document.getElementById('player-hp-text');
    this.fpRingFill = document.getElementById('fp-ring-fill');
    this.fpText = document.getElementById('fp-text');
    this.enemyNameEl = document.getElementById('enemy-name');

    this.skillsMenuObj = new SkillsMenu(combatSystem, statsSystem);

    // Expose to global so HTML onclick attributes can reach it
    window.combatUI = this;

    // Wire combat system callbacks
    combatSystem.onLog = (msg) => this._appendLog(msg);
    combatSystem.onFPUpdate = (cur, max) => this._updateFP(cur, max);
    combatSystem.onHPUpdate = (pHP, pMax, eHP, eMax) => this._updateHP(pHP, pMax, eHP, eMax);
    combatSystem.onCombatEnd = (won, fled) => this._onCombatEnd(won, fled);
    combatSystem.onStatusUpdate = (effects) => this._updateStatus(effects);
  }

  show(enemy) {
    const archetypeLabel = {
      rusher:  'SCRAPPER',
      swinger: 'BRUTE [Wind-Up]',
      burst:   'GLITCH [Burst]',
    };
    this.enemyNameEl.textContent = archetypeLabel[enemy.archetype] || enemy.name;
    this._clearLog();
    this._updateHP(
      this.stats.currentHP, this.stats.maxHP,
      enemy.maxHP, enemy.maxHP
    );
    this._updateFP(0, this.stats.maxFP);
    this._updateStatus([]);
    this.overlay.hidden = false;
    this.skillsMenu.hidden = true;
    this.itemsMenu.hidden = true;

    // Wire wind-up / burst callbacks
    this.combat.onWindup = (isCharging) => this._showWindupWarning(isCharging);
    this.combat.onBurstStart = () => this._showBurstWarning();
  }

  _showWindupWarning(isCharging) {
    const logEl = this.logEl;
    if (isCharging) {
      const warn = document.createElement('div');
      warn.className = 'log-line windup-warn';
      warn.style.cssText = 'color:#ffaa00;font-weight:bold;animation:pulse 0.4s infinite alternate;';
      warn.textContent = '⚠ BRUTE winding up...';
      warn.id = 'windup-warn';
      logEl.appendChild(warn);
    } else {
      const el = document.getElementById('windup-warn');
      if (el) el.remove();
    }
  }

  _showBurstWarning() {
    const warn = document.createElement('div');
    warn.className = 'log-line burst-warn';
    warn.style.cssText = 'color:#00ff88;font-weight:bold;';
    warn.textContent = '⚡ GLITCH initiating burst...';
    this.logEl.appendChild(warn);
    while (this.logEl.children.length > 5) this.logEl.removeChild(this.logEl.firstChild);
  }

  hide() {
    this.overlay.hidden = true;
  }

  // ── Button handlers ────────────────────────────────────────────────────────
  onFight() {
    if (!this.skillsMenu.hidden || !this.itemsMenu.hidden) return;
    this.combat.fight();
  }

  onSkills() {
    this.skillsMenu.hidden = false;
    this.itemsMenu.hidden = true;
    this.skillsMenuObj.update(this.stats.currentFP);
  }

  closeSkills() {
    this.skillsMenu.hidden = true;
  }

  onItems() {
    this.itemsMenu.hidden = false;
    this.skillsMenu.hidden = true;
    this._buildItemsList();
  }

  closeItems() {
    this.itemsMenu.hidden = true;
  }

  onRun() {
    if (!this.skillsMenu.hidden || !this.itemsMenu.hidden) return;
    this.combat.tryRun();
  }

  // ── Items list ─────────────────────────────────────────────────────────────
  _buildItemsList() {
    this.itemsList.innerHTML = '';
    const items = this.inventory.getConsumableList();
    if (items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'no-items';
      empty.textContent = 'No items.';
      this.itemsList.appendChild(empty);
      return;
    }
    for (const item of items) {
      const btn = document.createElement('button');
      btn.className = 'action-btn item-btn';
      btn.innerHTML = `<span class="item-name">${item.label}</span><span class="item-qty">x${item.count}</span>`;
      btn.onclick = () => {
        this.combat.useItem(item.key);
        this._buildItemsList(); // refresh
      };
      this.itemsList.appendChild(btn);
    }
  }

  // ── Status effects display ─────────────────────────────────────────────────
  _updateStatus(effects) {
    if (!this.statusEl) return;
    this.statusEl.innerHTML = '';
    for (const eff of effects) {
      const badge = document.createElement('span');
      badge.className = `status-badge status-${eff.type}`;
      badge.textContent = eff.type.toUpperCase();
      badge.title = `${eff.remainingTicks} ticks remaining`;
      this.statusEl.appendChild(badge);
    }
  }

  // ── Internal update methods ────────────────────────────────────────────────
  _updateHP(pHP, pMax, eHP, eMax) {
    const pPct = Math.max(0, pHP / pMax) * 100;
    const ePct = Math.max(0, eHP / eMax) * 100;
    this.playerHPFill.style.width = pPct + '%';
    this.playerHPText.textContent = `${Math.ceil(pHP)} / ${pMax}`;
    this.enemyHPFill.style.width = ePct + '%';
    this.enemyHPText.textContent = `${Math.ceil(eHP)} / ${eMax}`;
  }

  _updateFP(cur, max) {
    const ratio = Math.min(1, cur / max);
    this.fpRingFill.style.strokeDashoffset = CIRCUMFERENCE * (1 - ratio);
    this.fpText.textContent = `${Math.floor(cur)} FP`;
    if (!this.skillsMenu.hidden) {
      this.skillsMenuObj.update(cur);
    }
  }

  _appendLog(msg) {
    const line = document.createElement('div');
    line.className = 'log-line';
    line.textContent = msg;
    this.logEl.appendChild(line);
    while (this.logEl.children.length > 4) {
      this.logEl.removeChild(this.logEl.firstChild);
    }
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  _clearLog() {
    this.logEl.innerHTML = '';
  }

  _onCombatEnd(won, fled) {
    setTimeout(() => {
      this.hide();
      this.player.isInCombat = false;
      this.entityManager.combatEnded();
      if (!won && !fled) {
        this.player.teleportTo(0, 0);
      }
    }, 1200);
  }
}
