import { formatBig, formatRate, formatDuration } from '../util/NumberFormat.js';
import { CONFIG } from '../config.js';
import { AL_MODULES } from '../systems/ComputeSystem.js';

// Compact number formatting for big idle-RPG values (PP, Steps, etc.)
function abbrevNum(n) {
  if (!isFinite(n)) return '∞';
  const abs = Math.abs(n);
  if (abs < 10000) return Math.floor(n).toLocaleString();
  const units = ['', 'K', 'M', 'B', 'T', 'aa', 'bb', 'cc', 'dd', 'ee', 'ff'];
  let i = 0; let v = n;
  while (Math.abs(v) >= 1000 && i < units.length - 1) { v /= 1000; i++; }
  return v.toFixed(v < 10 ? 2 : v < 100 ? 1 : 0) + units[i];
}

// Progressive tab disclosure — deeper consoles come online as milestones land.
// Conditions must be monotonic (a tab never re-locks) and derive from state
// that already persists in saves; nothing extra is serialized.
const TAB_UNLOCKS = [
  { tab: 'tech-panel',         label: 'TECH',      unlocked: (h) => (h.prog?.chapters?.level ?? 0) >= 1 },
  { tab: 'implant-panel',      label: 'IMPLANT',   unlocked: (h) => (h.prog?.chapters?.level ?? 0) >= 1 },
  { tab: 'data-panel',         label: 'DATA',      unlocked: (h) => (h.prog?.chapters?.level ?? 0) >= 1 },
  { tab: 'allocation-panel',   label: 'ALLOC',     unlocked: (h) => (h.prog?.chapters?.level ?? 0) >= 2 },
  { tab: 'optimization-panel', label: 'OPT',       unlocked: (h) => (h.prog?.chapters?.level ?? 0) >= 2 },
  { tab: 'challenges-panel',   label: 'TRIALS',    unlocked: (h) => (h.prog?.chapters?.level ?? 0) >= 4 },
  { tab: 'expedition-panel',   label: 'FIELD OPS', unlocked: (h) => (h.gameStats?.enemiesDefeated ?? 0) >= 1 },
];

// Colored CSS icons for each item type — avoids emoji, uses styled rectangles/circles
const INV_ICONS = {
  // Materials (square icons)
  copper:    { bg:'#6a3008', border:'#cc7722', label:'Co', r:'2px' },
  timber:    { bg:'#3a1a08', border:'#8b5a2b', label:'Wd', r:'2px' },
  stone:     { bg:'#3a3a3a', border:'#888888', label:'St', r:'2px' },
  iron:      { bg:'#1a2530', border:'#4a6677', label:'Fe', r:'2px' },
  carbon:    { bg:'#0a0a0a', border:'#444444', label:'C',  r:'50%' },
  quartz:    { bg:'#2a1040', border:'#9977cc', label:'Qz', r:'2px' },
  silica:    { bg:'#0a2a3a', border:'#4499bb', label:'Si', r:'50%' },
  fiber:     { bg:'#0a2808', border:'#449930', label:'Fb', r:'8px' },
  silver:    { bg:'#2a3540', border:'#99aabb', label:'Ag', r:'50%' },
  gold:      { bg:'#502e00', border:'#ddaa00', label:'Au', r:'50%' },
  titanium:  { bg:'#0a1e38', border:'#3366aa', label:'Ti', r:'2px' },
  tungsten:  { bg:'#1a2028', border:'#445566', label:'W',  r:'2px' },
  resin:     { bg:'#3a1a00', border:'#aa6622', label:'Rn', r:'50% 50% 0 50%' },
  seed:      { bg:'#0a2808', border:'#44aa22', label:'Sd', r:'50%' },
  epoxy:     { bg:'#1a2230', border:'#445577', label:'Ep', r:'2px' },
  elastomer: { bg:'#141428', border:'#4444aa', label:'El', r:'2px' },
  magnet:    { bg:'#280a14', border:'#aa3355', label:'Mg', r:'2px' },
  glass:     { bg:'#0a2a38', border:'#66aacc', label:'Gl', r:'2px' },
  lumber:        { bg:'#241408', border:'#7a5030', label:'Lb', r:'2px' },
  // Enemy drop materials
  circuitWire:   { bg:'#0a1a10', border:'#22cc66', label:'CW', r:'2px' },
  ironSpike:     { bg:'#1a1a22', border:'#6688aa', label:'IS', r:'2px' },
  powerCore:     { bg:'#1a0a28', border:'#aa44ff', label:'PC', r:'50%' },
  armorPlate:    { bg:'#1a2020', border:'#667788', label:'AP', r:'2px' },
  burstCapacitor:{ bg:'#2a1a00', border:'#ffaa22', label:'BC', r:'50%' },
  logicChip:     { bg:'#001a2a', border:'#0088ff', label:'LC', r:'2px' },
  // Factory Raw
  silica_sand:           { bg:'#1a1e12', border:'#aabb66', label:'SS', r:'2px' },
  ferrous_ore:           { bg:'#221111', border:'#aa5555', label:'FO', r:'2px' },
  carbon_biomass:        { bg:'#0a1505', border:'#33aa33', label:'CB', r:'50%' },
  // Factory Refined
  silicon_wafer:         { bg:'#002b36', border:'#2aa198', label:'SW', r:'2px' },
  steel_ingot:           { bg:'#222233', border:'#93a1a1', label:'SI', r:'2px' },
  synthetic_resin:       { bg:'#2c1505', border:'#cb4b16', label:'SR', r:'50%' },
  // Factory Components
  logic_processor:       { bg:'#001122', border:'#00aaff', label:'LP', r:'3px' },
  mechanical_servo:      { bg:'#112211', border:'#aaff00', label:'MS', r:'3px' },
  energy_capacitor:      { bg:'#220022', border:'#ff00aa', label:'EC', r:'50%' },
  // Factory Modules
  quantum_processor_ring:{ bg:'#10001a', border:'#bb00ff', label:'QR', r:'50%' },
  exo_servo_harness:     { bg:'#1a1a00', border:'#ffee00', label:'EH', r:'2px' },
  aegis_capacitor_bank:  { bg:'#001a1a', border:'#00ffee', label:'AB', r:'2px' },
  // Consumables (circle icons)
  ration:        { bg:'#221400', border:'#886622', label:'Ra', r:'50%' },
  firstAid:      { bg:'#280008', border:'#cc2233', label:'HP', r:'50%' },
  repairKit:     { bg:'#000a28', border:'#3355aa', label:'RK', r:'50%' },
  antidote:      { bg:'#002010', border:'#339966', label:'An', r:'50%' },
  ironPatch:     { bg:'#0a1228', border:'#4466aa', label:'IP', r:'50%' },
  signalFlare:   { bg:'#280800', border:'#cc5522', label:'SF', r:'50%' },
  energyCell:    { bg:'#002018', border:'#22aaaa', label:'EC', r:'50%' },
  overchargeCell:{ bg:'#001a28', border:'#00ffcc', label:'OC', r:'50%' },
  dataCache:     { bg:'#0a0028', border:'#8844ff', label:'DC', r:'50%' },
  // Tools (square with notch style)
  terrainCutter:    { bg:'#0a200a', border:'#33aa55', label:'TC', r:'3px' },
  chargingStation:  { bg:'#001a10', border:'#22aa66', label:'CS', r:'3px' },
  storageContainer: { bg:'#0a1a1a', border:'#33aaaa', label:'ST', r:'3px' },
  rockDrill:        { bg:'#1a1008', border:'#887755', label:'RD', r:'3px' },
  harvestBlade:     { bg:'#0a1a04', border:'#55aa33', label:'HB', r:'3px' },
  diveTool:         { bg:'#001828', border:'#2288cc', label:'DT', r:'3px' },
  cryoPick:         { bg:'#081018', border:'#66aacc', label:'CK', r:'3px' },
};

function _matLabel(key) {
  return key
    .replace(/_/g, ' ')                           // snake_case → space-separated
    .replace(/([a-z])([A-Z])/g, '$1 $2')          // camelCase → space-separated
    .replace(/\b\w/g, c => c.toUpperCase());      // title-case each word
}

// Items with hand-painted art in Assets/Inventory/icons/ (128px, generated from
// the 1024px originals in Assets/Inventory/). Keys not listed here fall back to
// the colored-label INV_ICONS style.
const ICON_IMG_KEYS = new Set([
  'armorPlate', 'burstCapacitor', 'carbon', 'circuitWire', 'copper',
  'elastomer', 'epoxy', 'ferrous_ore', 'fiber', 'glass', 'gold', 'iron',
  'ironSpike', 'logicChip', 'logic_processor', 'lumber', 'magnet',
  'powerCore', 'quartz', 'ration', 'resin', 'seed', 'silica',
  'silica_sand', 'silicon_wafer', 'silver', 'steel_ingot', 'stone',
  'synthetic_resin', 'timber', 'titanium', 'tungsten',
]);

function _makeIcon(key) {
  const def = INV_ICONS[key] || { bg:'#102210', border:'#336633', label: (key||'?').slice(0,2).toUpperCase(), r:'2px' };
  const el = document.createElement('span');
  el.className = 'inv-icon';
  el.style.borderColor = def.border;
  el.style.borderRadius = def.r;
  if (ICON_IMG_KEYS.has(key)) {
    el.classList.add('inv-icon-img');
    el.style.backgroundColor = def.bg;
    el.style.backgroundImage = `url('Assets/Inventory/icons/${key}.png')`;
  } else {
    el.style.background = def.bg;
    el.textContent = def.label;
  }
  return el;
}

export class HUD {
  constructor(statsSystem, ppSystem, pedometerSystem, inventorySystem, craftingSystem, droneSystem, equipmentSystem, gameStats, achievements, minigame, ascension, autoCombat, drillSystem, techTree = null, mastery = null, syncClient = null, factorySystem = null, codexSystem = null, augmentationSystem = null, optimization = null, assemblySystem = null, tripartite = null, extractorSystem = null, processingNodes = null, progression = null) {
    this.stats = statsSystem;
    this.pp = ppSystem;
    this.pedometer = pedometerSystem;
    this.inventory = inventorySystem;
    this.crafting = craftingSystem;
    this.drones = droneSystem;
    this.equipment = equipmentSystem;
    this.gameStats = gameStats;
    this.achievements = achievements;
    this.minigame = minigame;
    this.ascension = ascension;
    this.autoCombat = autoCombat;
    this.drill = drillSystem;
    this.techTree = techTree;
    this.mastery = mastery;
    this.syncClient = syncClient;
    this.factory = factorySystem;
    this.assembly = assemblySystem;
    this.extractor = extractorSystem;
    this.processing = processingNodes;
    this.codex = codexSystem;
    this.augmentations = augmentationSystem;
    this.opt = optimization || {}; // { mathematician, timeWarp, modifiers }
    this.tripartite = tripartite;
    this.prog = progression || {}; // { bosses, expedition, challenges, implant }
    this.questSystem = null; // set via setQuestSystem() after construction

    this.ppDisplay = document.getElementById('pp-display');
    this.ppAmount = document.getElementById('pp-amount');
    this.stepsAmount = document.getElementById('steps-amount');
    this.ppRate = document.getElementById('pp-rate');
    this.hpDisplay = document.getElementById('hp-display');
    this.energyDisplay = document.getElementById('energy-display');
    this.stepsDisplay = document.getElementById('steps-display');
    this.statList = document.getElementById('stat-list');
    this.gatherBar = document.getElementById('gather-bar');
    this.gatherFill = document.getElementById('gather-fill');
    this.gatherText = document.getElementById('gather-text');
    this.interactHint = document.getElementById('interact-hint');
    this.zoneLabel = document.getElementById('zone-label');
    this.drillPanel = document.getElementById('drill-panel');

    this._lastUpdate = 0;
    this._throttleMs = 100;
    this._toastQueue = [];
    this._toastActive = false;
    this._lastCraftingLevel = 1;

    // Session "number go up" tracking — PP earned since page load + cap-decile pulses
    this._sessionStart = Date.now();
    this._sessionPP = 0;
    this._lastPPTotal = null;
    this._lastPPDecile = -1;
    this._ppPulseTimer = null;

    // Data Core sampler — PP/s ring buffer for the growth graph (10 min @ 2s)
    this._ppSamples = [];
    this._lastSampleAt = 0;
    this._peakRate = 0;

    this._constructAddMode = true;

    this._buildStatList();
    this._refreshTabUnlocks({ silent: true });
    this._wirePanelToggles();
    this._wireAllocationSliders();
    this._wireStatsSidebar();
    this._wireStatisticsButton();
    this._wireMinigameButton();
    this._wireAchievementsButton();
    this._wireCodexButton();
    this._wireAugmentationsButton();
    this._wireAscensionButton();
    this._wireDrillButtons();
    this._wireConstructPanel();
    this._wireRateTooltip();
    this._wireEquipProximity();

    if (this.drill) {
      this.drill.onUpdate = () => this.refreshDrillUI();
    }

    // Wire crafting progress to live-update the progress bar
    this.crafting.onCraftProgress = (prog, dur) => {
      this._updateCraftProgressBar(prog, dur);
    };
  }

  // ── Progressive tab disclosure ───────────────────────────────────────────
  // Hides menu tabs whose systems haven't come online yet; shows an unlock
  // toast when a milestone reveals one. `silent` suppresses toasts (boot and
  // save-load passes, where unlocks aren't new to the player).
  _refreshTabUnlocks({ silent = false } = {}) {
    for (const def of TAB_UNLOCKS) {
      const btn = document.querySelector(`.menu-tab[data-tab="${def.tab}"]`);
      if (!btn) continue;
      const unlocked = def.unlocked(this);
      const wasHidden = btn.style.display === 'none';
      btn.style.display = unlocked ? '' : 'none';
      if (unlocked && wasHidden && !silent) {
        this.showAchievementToast({
          icon: '🖥',
          label: `${def.label} console online`,
          desc: 'A new tab is available in the menu.',
          reward: 0,
        });
      }
    }
  }

  // ── Equipment proximity glow ──────────────────────────────────────────────
  _wireEquipProximity() {
    const panel = document.querySelector('.equip-svg-panel');
    if (!panel) return;
    const slots = panel.querySelectorAll('.equip-slot-box');
    panel.addEventListener('mousemove', (e) => {
      const pr = panel.getBoundingClientRect();
      const mx = (e.clientX - pr.left) / pr.width;
      const my = (e.clientY - pr.top)  / pr.height;
      slots.forEach(slot => {
        const sr = slot.getBoundingClientRect();
        const cx = (sr.left + sr.width  / 2 - pr.left) / pr.width;
        const cy = (sr.top  + sr.height / 2 - pr.top)  / pr.height;
        const t = Math.max(0, 1 - Math.hypot(mx - cx, my - cy) / 0.14);
        slot.style.setProperty('--prx', t.toFixed(2));
      });
    });
    panel.addEventListener('mouseleave', () => {
      slots.forEach(s => s.style.setProperty('--prx', '0'));
    });
  }

  // ── Drill Mini-game ───────────────────────────────────────────────────────
  _wireDrillButtons() {
    const btnAction = document.getElementById('btn-drill-action');
    const btnUpgrade = document.getElementById('btn-drill-upgrade');
    if (!btnAction || !btnUpgrade || !this.drill) return;

    btnAction.addEventListener('click', () => {
      this.drill.clickDrill();
      // Visual feedback: brief shake or color flash on the panel could be added here
    });

    btnUpgrade.addEventListener('click', () => {
      if (this.drill.upgrade()) {
        this.refreshDrillUI();
      }
    });
  }

  // ── Construction Mode ──────────────────────────────────────────────────────
  _wireConstructPanel() {
    const modeBtn = document.getElementById('btn-construct-mode');
    if (modeBtn) {
      modeBtn.addEventListener('click', () => {
        this._constructAddMode = !this._constructAddMode;
        this._refreshConstructPanel();
      });
    }

    const returnBtn = document.getElementById('btn-construct-return');
    if (returnBtn) {
      returnBtn.addEventListener('click', () => {
        const panel = document.getElementById('construct-panel');
        if (panel) panel.hidden = true;
        document.getElementById('btn-construct')?.classList.remove('active');
      });
    }
  }

  _refreshConstructPanel() {
    const el = document.getElementById('construct-contents');
    if (!el || !this.pedometer) return;

    // Sync mode toggle button appearance
    const modeBtn = document.getElementById('btn-construct-mode');
    if (modeBtn) {
      const isAdd = this._constructAddMode;
      modeBtn.textContent = isAdd ? '＋ PLACING' : '－ REMOVING';
      modeBtn.className = `construct-mode-toggle ${isAdd ? 'mode-add' : 'mode-remove'}`;
    }

    el.innerHTML = '';
    const ped = this.pedometer;
    const placed = ped.trackCount - ped.pendingTracks;
    const canBuy = ped.canBuyTrack();
    const costLabel = `${abbrevNum(ped.nextTrackCost)} steps`;

    const item = document.createElement('div');
    item.className = 'construct-item';

    const title = document.createElement('div');
    title.className = 'construct-item-title';
    title.textContent = 'Speed Track';
    item.appendChild(title);

    const stats = document.createElement('div');
    stats.className = 'construct-item-stats';
    stats.innerHTML = `<span class="ci-pending">Pending: ${ped.pendingTracks}</span><span class="ci-placed">Placed: ${placed}</span>`;
    item.appendChild(stats);

    const cost = document.createElement('div');
    cost.className = 'construct-item-cost';
    cost.textContent = `Next cost: ${costLabel}  ·  Steps: ${abbrevNum(ped.totalSteps)}`;
    item.appendChild(cost);

    const buyBtn = document.createElement('button');
    buyBtn.className = 'construct-buy-btn';
    buyBtn.textContent = 'BUY TRACK';
    buyBtn.disabled = !canBuy;
    buyBtn.addEventListener('click', () => {
      if (ped.buyTrack()) this._refreshConstructPanel();
    });
    item.appendChild(buyBtn);

    el.appendChild(item);

    // Large action button — primary input on mobile, fallback on desktop
    const isAdd = this._constructAddMode;
    const canPlace = ped.infiniteTracks || ped.pendingTracks > 0;
    const actionBtn = document.createElement('button');
    actionBtn.className = `construct-buy-btn construct-action-btn${isAdd ? '' : ' construct-action-remove'}`;
    actionBtn.textContent = isAdd ? '＋ PLACE HERE' : '－ REMOVE HERE';
    actionBtn.disabled = isAdd && !canPlace;
    actionBtn.addEventListener('click', () => {
      if (typeof window.doConstructAction === 'function') window.doConstructAction();
      this._refreshConstructPanel();
    });
    el.appendChild(actionBtn);

    const hint = document.createElement('div');
    hint.className = 'construct-hint';
    hint.textContent = isAdd
      ? `Navigate to tile · tap button or press [E]`
      : `Navigate near a track · tap button or press [E]`;
    el.appendChild(hint);
  }

  toggleDrillPanel() {
    if (!this.drillPanel) return;
    const shouldOpen = this.drillPanel.hidden;
    this._closeCommandPanels('drill-panel');
    this.drillPanel.hidden = !shouldOpen;
    if (!this.drillPanel.hidden) {
      this.refreshDrillUI();
    }
  }

  refreshDrillUI() {
    if (!this.drill || !this.drillPanel || this.drillPanel.hidden) return;

    const stratumEl = document.getElementById('drill-stratum');
    const hpFill = document.getElementById('drill-hp-fill');
    const hpText = document.getElementById('drill-hp-text');
    const powerLv = document.getElementById('drill-power-lv');
    const dmgLabel = document.getElementById('drill-damage-label');
    const costLabel = document.getElementById('drill-upgrade-cost');
    const upgradeBtn = document.getElementById('btn-drill-upgrade');

    if (stratumEl) stratumEl.textContent = `STRATUM ${this.drill.currentStratum}`;
    if (hpFill) {
      const pct = (this.drill.layerHP / this.drill.layerHPMax) * 100;
      hpFill.style.width = pct + '%';
    }
    if (hpText) hpText.textContent = `${Math.ceil(this.drill.layerHP).toLocaleString()} / ${Math.ceil(this.drill.layerHPMax).toLocaleString()} HP`;
    if (powerLv) powerLv.textContent = this.drill.drillPowerLevel;
    if (dmgLabel) dmgLabel.textContent = `Damage: ${this.drill.damagePerClick.toFixed(1)}`;

    if (costLabel) {
      const cost = this.drill.upgradeCost;
      costLabel.innerHTML = `${Math.floor(cost.iron)} Iron, ${Math.floor(cost.copper)} Copper<br>${Math.floor(cost.carbon)} Carbon`;

      const canAfford = this.drill.canUpgrade();
      upgradeBtn.disabled = !canAfford;
      upgradeBtn.style.opacity = canAfford ? '1' : '0.5';
    }
  }

  _buildStatList() {
    this.statList.innerHTML = '';
    for (const name of this.stats.statNames) {
      const label = this.stats.statLabels[name];

      const row = document.createElement('div');
      row.className = 'stat-row';
      row.dataset.stat = name;

      const info = document.createElement('div');
      info.className = 'stat-info';

      const labelEl = document.createElement('span');
      labelEl.className = 'stat-label';
      labelEl.textContent = label;

      const lvlEl = document.createElement('span');
      lvlEl.className = 'stat-level';
      lvlEl.textContent = `Lv ${this.stats.stats[name].level}`;

      info.appendChild(labelEl);
      info.appendChild(lvlEl);

      const btn = document.createElement('button');
      btn.className = 'stat-up-btn';
      btn.textContent = `+${this.stats.upgradeCost(name)}`;
      btn.dataset.stat = name;
      btn.onclick = () => this._onUpgrade(name, btn, lvlEl);

      row.appendChild(info);
      row.appendChild(btn);
      this.statList.appendChild(row);
    }
  }

  _onUpgrade(name, btn, lvlEl) {
    const ok = this.stats.levelUp(name, this.pp);
    if (!ok) {
      btn.classList.add('flash-fail');
      setTimeout(() => btn.classList.remove('flash-fail'), 400);
      return;
    }
    lvlEl.textContent = `Lv ${this.stats.stats[name].level}`;
    btn.textContent = `+${this.stats.upgradeCost(name)}`;
  }

  _wireStatsSidebar() {
    const btn = document.getElementById('btn-toggle-stat-sidebar');
    const sidebar = document.getElementById('stat-sidebar');
    if (btn && sidebar) {
      btn.addEventListener('click', () => {
        const shouldOpen = sidebar.hidden;
        this._closeCommandPanels('stat-sidebar');
        sidebar.hidden = !shouldOpen;
      });
    }
  }

  _wireStatisticsButton() {
    const btn = document.getElementById('btn-statistics');
    const panel = document.getElementById('statistics-panel');
    if (btn && panel) {
      btn.addEventListener('click', () => {
        const shouldOpen = panel.hidden;
        this._closeCommandPanels('statistics-panel');
        panel.hidden = !shouldOpen;
        if (!panel.hidden) this._refreshStatistics();
      });
    }
  }

  _refreshStatistics() {
    const el = document.getElementById('statistics-contents');
    if (!el || !this.gameStats) return;
    el.innerHTML = '';

    const gs = this.gameStats;
    const entries = [
      ['Enemies Defeated', gs.enemiesDefeated],
      ['Times Defeated', gs.defeats],
      ['Actions Taken', gs.actionsTaken],
      ['Highest Hit', gs.highestHit],
      ['Worlds Discovered', `${gs.worldsDiscovered} / ${gs.totalWorlds}`],
      ['Total Steps', gs.totalStepsTaken.toLocaleString()],
    ];

    for (const [label, value] of entries) {
      const row = document.createElement('div');
      row.className = 'statistics-row';
      row.innerHTML = `<span class="statistics-label">${label}</span><span class="statistics-value">${value}</span>`;
      el.appendChild(row);
    }
  }

  _wirePanelToggles() {
    // Toggle panels via buttons in HUD (crafting removed — only at Fabricator)
    const panels = ['inventory-panel', 'equipment-panel', 'pedometer-panel', 'tech-panel', 'mastery-panel'];
    for (const panelId of panels) {
      const btn = document.getElementById(`btn-toggle-${panelId}`);
      const panel = document.getElementById(panelId);
      if (btn && panel) {
        btn.addEventListener('click', () => {
          const shouldOpen = panel.hidden;
          this._closeCommandPanels(panelId);
          panel.hidden = !shouldOpen;
          if (!panel.hidden) this._refreshPanel(panelId);
        });
      }
    }
  }

  _closeCommandPanels(exceptId = null) {
    const ids = [
      'inventory-panel', 'equipment-panel', 'pedometer-panel', 'tech-panel',
      'mastery-panel', 'achievements-panel', 'statistics-panel', 'stat-sidebar',
      'ascension-panel', 'drill-panel', 'codex-panel', 'augmentations-panel',
      'optimization-panel', 'allocation-panel', 'quest-panel',
      'workshop-panel', 'constructor-panel', 'fabrication-panel', 'assembly-matrix-panel',
      'refinery-panel',
      'expedition-panel', 'challenges-panel', 'implant-panel', 'data-panel',
      'training-panel',
    ];
    for (const id of ids) {
      if (id === exceptId) continue;
      const panel = document.getElementById(id);
      if (panel) panel.hidden = true;
    }
  }

  _refreshPanel(panelId) {
    switch (panelId) {
      case 'inventory-panel': this._refreshInventory(); break;
      case 'crafting-panel': this._refreshCrafting(); break;
      case 'drone-panel': this._refreshDrones(); break;
      case 'equipment-panel': this._refreshEquipment(); break;
      case 'pedometer-panel': this._refreshPedometer(); break;
      case 'tech-panel': this._refreshTechTree(); break;
      case 'mastery-panel': this._refreshMastery(); break;
      case 'ascension-panel': this._refreshAscension(); break;
      case 'workshop-panel': this._refreshWorkshop(); break;
      case 'constructor-panel': this._refreshConstructor(); break;
      case 'fabrication-panel': this._refreshFabricationBay(); break;
      case 'assembly-matrix-panel': this._refreshAssemblyMatrix(); break;
      case 'refinery-panel': this._refreshRefinery(); break;
      case 'codex-panel': this._refreshCodex(); break;
      case 'augmentations-panel': this._refreshAugmentations(); break;
      case 'construct-panel': this._refreshConstructPanel(); break;
      case 'optimization-panel': this._refreshOptimization(); break;
      case 'allocation-panel': this._refreshAllocation(); break;
      case 'quest-panel': this._refreshQuestHub(); break;
      case 'expedition-panel': this._refreshExpedition(); break;
      case 'challenges-panel': this._refreshChallenges(); break;
      case 'implant-panel': this._refreshImplant(); break;
      case 'data-panel': this._refreshDataCore(); break;
      case 'training-panel': this._refreshTraining(); break;
    }
  }

  _wireAllocationSliders() {
    if (!this.tripartite) return;
    const map = { capacity: 'capacity', power: 'power', rate: 'rate' };
    for (const [domKey, legKey] of Object.entries(map)) {
      const slider = document.getElementById(`alloc-${domKey}`);
      if (!slider) continue;
      slider.addEventListener('input', () => {
        this.tripartite.setRatio(legKey, parseInt(slider.value, 10));
        this._refreshAllocation();
      });
    }
  }

  _refreshAllocation() {
    if (!this.tripartite) return;
    const r = this.tripartite.ratios;
    const inv = this.tripartite.invested;

    const setText = (id, txt) => {
      const el = document.getElementById(id);
      if (el) el.textContent = txt;
    };
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val;
    };

    setText('alloc-capacity-val', r.capacity + '%');
    setText('alloc-power-val',    r.power    + '%');
    setText('alloc-rate-val',     r.rate     + '%');

    setVal('alloc-capacity', r.capacity);
    setVal('alloc-power',    r.power);
    setVal('alloc-rate',     r.rate);

    // Read bonuses straight from the system — it owns the curve formulas.
    setText('alloc-cap-bonus',    '×' + this.tripartite.capacityMultiplier.toFixed(2));
    setText('alloc-power-bonus',  '+' + this.tripartite.powerBonus.toFixed(2) + ' PP/s');
    setText('alloc-rate-bonus',   '×' + this.tripartite.currentRateMultiplier.toFixed(2));
    setText('alloc-cap-invested', inv.capacity.toFixed(1));
    setText('alloc-power-invested', inv.power.toFixed(1));
    setText('alloc-rate-invested', inv.rate.toFixed(1));
    setText('alloc-momentum', '×' + this.tripartite.sessionMomentum.toFixed(2));

    this._renderComputeBoard();
  }

  // ── Al Compute allocation board (Phase E) ────────────────────────────────
  // Structure rebuilds only when the assignment signature changes (buttons
  // survive the 100ms allocation refresh); rate previews update every pass.
  _renderComputeBoard() {
    const host = document.getElementById('compute-board');
    const compute = this.compute;
    if (!host || !compute) return;

    if (!compute.unlocked) {
      const teaser = '<div style="border-top:1px solid #44ffcc33;padding-top:0.8em;opacity:0.55;font-size:0.85em;">AL COMPUTE — core dormant. Comes online at Chapter 3.</div>';
      if (host.innerHTML !== teaser) host.innerHTML = teaser;
      this._computeBoardSig = null;
      return;
    }

    const rows = this._computeBoardRows();
    const sig = [compute.capLevel, compute.totalUnits(), compute.freeUnits(),
      rows.map(r => `${r.key}:${compute.unitsOn(r.key)}:${r.shown ? 1 : 0}`).join('|'),
      AL_MODULES.map(m => `${m.id}:${compute.hasModule(m.id) ? 1 : 0}:${compute.moduleAvailable(m.id) ? 1 : 0}`).join('|'),
      this.pp.ppTotal >= compute.capUpgradeCost() ? 1 : 0].join('~');

    if (sig !== this._computeBoardSig) {
      this._computeBoardSig = sig;
      this._buildComputeBoard(host, rows);
    }
    this._updateComputePreviews(rows);
  }

  _computeBoardRows() {
    const machines = this.factory?.machines || {};
    return [
      { key: 'ladder',     label: 'SIM LADDER',      shown: true },
      { key: 'drones',     label: 'DRONE ROUTES',    shown: true },
      { key: 'extractors', label: 'EXTRACTOR BANK',  shown: true },
      { key: 'holodeck',   label: 'HOLODECK',        shown: true },
      { key: 'processing', label: 'PROCESSING BANK', shown: true },
      { key: 'factory:smelter',    label: 'LINE: ARC SMELTER',  shown: !!machines.smelter?.unlocked },
      { key: 'factory:assembler',  label: 'LINE: CONSTRUCTOR',  shown: !!machines.assembler?.unlocked },
      { key: 'factory:fabricator', label: 'LINE: FABRICATOR',   shown: !!machines.fabricator?.unlocked },
      { key: 'overflow',           label: 'OVERFLOW ROUTING',   shown: this.compute.hasModule('overflowRouting') },
    ].filter(r => r.shown);
  }

  _buildComputeBoard(host, rows) {
    const compute = this.compute;
    host.innerHTML = '';

    const head = document.createElement('div');
    head.style.cssText = 'border-top:1px solid #44ffcc33;padding-top:0.8em;display:flex;justify-content:space-between;align-items:center;gap:0.5em;flex-wrap:wrap;';
    head.innerHTML = `<span style="color:#44ffcc;font-weight:bold;">AL COMPUTE</span>
      <span style="font-size:0.85em;">free <span id="compute-free" style="color:#ffd700;font-weight:bold;">${compute.freeUnits()}</span> / ${compute.totalUnits()} units</span>`;
    const capBtn = document.createElement('button');
    capBtn.className = 'construct-buy-btn';
    const capCost = compute.capUpgradeCost();
    capBtn.textContent = `+${2} CAP (${abbrevNum(capCost)} PP)`;
    capBtn.disabled = this.pp.ppTotal < capCost;
    capBtn.title = 'Expand the compute pool';
    capBtn.addEventListener('click', () => {
      if (compute.buyCapUpgrade()) this._renderComputeBoard();
    });
    head.appendChild(capBtn);
    host.appendChild(head);

    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:0.75em;opacity:0.6;margin:0.3em 0 0.6em;';
    hint.textContent = 'A system runs unattended — including offline — only while ≥1 unit is assigned. Extra units boost output.';
    host.appendChild(hint);

    this._computeRowEls = {};
    for (const row of rows) {
      const units = compute.unitsOn(row.key);
      const line = document.createElement('div');
      line.style.cssText = 'display:flex;align-items:center;gap:0.45em;margin:0.25em 0;flex-wrap:wrap;';

      const label = document.createElement('span');
      label.style.cssText = 'flex:1 1 9em;min-width:9em;font-size:0.85em;';
      label.textContent = row.label;
      line.appendChild(label);

      const unitsEl = document.createElement('span');
      unitsEl.style.cssText = `min-width:1.6em;text-align:center;font-weight:bold;color:${units > 0 ? '#44ffcc' : '#666'};`;
      unitsEl.textContent = units;
      line.appendChild(unitsEl);

      const mkBtn = (txt, fn, disabled, title) => {
        const b = document.createElement('button');
        b.className = 'construct-buy-btn';
        b.textContent = txt;
        b.disabled = disabled;
        if (title) b.title = title;
        b.addEventListener('click', () => { fn(); this._renderComputeBoard(); });
        line.appendChild(b);
      };
      mkBtn('−', () => compute.adjust(row.key, -1), units <= 0);
      mkBtn('+', () => compute.adjust(row.key, +1), compute.freeUnits() <= 0);
      mkBtn('MAX', () => compute.assignMax(row.key), compute.freeUnits() <= 0, 'Assign all free units');

      const preview = document.createElement('span');
      preview.style.cssText = 'flex:1 1 100%;font-size:0.72em;opacity:0.65;padding-left:0.2em;';
      line.appendChild(preview);

      this._computeRowEls[row.key] = { unitsEl, preview };
      host.appendChild(line);
    }

    this._buildModuleShop(host);
  }

  // ── Al module shop (G1/G2: chapters unlock the right to buy) ─────────────
  _buildModuleShop(host) {
    const compute = this.compute;
    const shopHead = document.createElement('div');
    shopHead.style.cssText = 'margin-top:0.9em;padding-top:0.6em;border-top:1px solid #44ffcc33;color:#44ffcc;font-weight:bold;font-size:0.85em;';
    shopHead.textContent = 'AL CAPABILITY MODULES';
    host.appendChild(shopHead);

    this._computeModuleBtns = {};
    for (const def of AL_MODULES) {
      const owned = compute.hasModule(def.id);
      const available = compute.moduleAvailable(def.id);
      const line = document.createElement('div');
      line.style.cssText = 'display:flex;align-items:center;gap:0.45em;margin:0.3em 0;flex-wrap:wrap;';

      const label = document.createElement('span');
      label.style.cssText = `flex:1 1 10em;min-width:10em;font-size:0.85em;${owned ? 'color:#44ffcc;' : available ? '' : 'opacity:0.45;'}`;
      label.textContent = `${owned ? '✔ ' : ''}${def.label}`;
      line.appendChild(label);

      if (owned) {
        const on = document.createElement('span');
        on.style.cssText = 'font-size:0.75em;color:#44ffcc;opacity:0.8;';
        on.textContent = 'ONLINE';
        line.appendChild(on);
      } else if (!available) {
        const lock = document.createElement('span');
        lock.style.cssText = 'font-size:0.75em;color:#888;';
        lock.textContent = `LOCKED — Chapter ${def.level}`;
        line.appendChild(lock);
      } else {
        const matsStr = Object.entries(def.mats || {}).map(([m, q]) => `${q} ${m}`).join(' + ');
        const btn = document.createElement('button');
        btn.className = 'construct-buy-btn';
        btn.textContent = `BUY — ${abbrevNum(def.pp)} PP${matsStr ? ' + ' + matsStr : ''}`;
        btn.addEventListener('click', () => {
          if (compute.buyModule(def.id)) {
            this.showAchievementToast({ icon: '🤖', label: `Al: ${def.label} online`, desc: def.teach, reward: 0 });
            this._renderComputeBoard();
          }
        });
        this._computeModuleBtns[def.id] = btn;
        line.appendChild(btn);
      }

      const desc = document.createElement('span');
      desc.style.cssText = 'flex:1 1 100%;font-size:0.72em;opacity:0.6;padding-left:0.2em;';
      desc.textContent = def.desc;
      line.appendChild(desc);

      host.appendChild(line);
    }
  }

  _updateComputePreviews(rows) {
    const compute = this.compute;
    const els = this._computeRowEls;
    if (!els) return;
    for (const row of rows) {
      const el = els[row.key];
      if (!el) continue;
      el.preview.textContent = this._computePreviewText(row.key);
    }
    const freeEl = document.getElementById('compute-free');
    if (freeEl) freeEl.textContent = compute.freeUnits();
    // Module BUY buttons: affordability changes constantly — update disabled
    // state here instead of churning the board signature.
    if (this._computeModuleBtns) {
      for (const [id, btn] of Object.entries(this._computeModuleBtns)) {
        btn.disabled = !compute.canBuyModule(id);
      }
    }
  }

  /** Honest per-row rate previews; falls back to the output multiplier. */
  _computePreviewText(key) {
    const compute = this.compute;
    const units = compute.unitsOn(key);
    if (units <= 0) return 'PAUSED — no compute assigned';
    const mult = compute.outputMult(key);
    const multStr = `×${mult.toFixed(2)} output`;
    if (key === 'ladder' && this.prog?.expedition) {
      const exp = this.prog.expedition;
      if (!exp.active) return `${multStr} — frame halted`;
      const kph = exp.killRate(exp.tier) * mult * 3600;
      return kph > 0 ? `${multStr} — ~${abbrevNum(Math.floor(kph))} kills/hr @ T${exp.tier + 1}` : `${multStr} — stalled`;
    }
    if (key === 'drones' && this.drones) {
      const n = this.drones.drones.filter(d => d.assignedMaterial).length;
      return n > 0 ? `${multStr} — ${n} route${n > 1 ? 's' : ''} live` : `${multStr} — no routes assigned`;
    }
    if (key === 'extractors' && this.extractor) {
      const rates = this.extractor.getRates();
      const perHr = Object.values(rates).reduce((a, b) => a + b, 0) * mult * 3600;
      return perHr > 0 ? `${multStr} — ~${abbrevNum(Math.floor(perHr))} ore/hr` : `${multStr} — no extractors installed`;
    }
    if (key === 'holodeck' && this.trainingAreas) {
      const t = this.trainingAreas;
      const prog = t.activeId || t.selectedProgram;
      return prog ? `${multStr} — running ${t.getDef(prog)?.label || prog}` : `${multStr} — no program loaded`;
    }
    if (key === 'overflow') {
      const implant = this.prog?.implant;
      if (!implant?.target) return `${multStr} — set an implant target to receive routed XP`;
      const rate = 0.25 * (1 + (this.tripartite?.powerBonus || 0)) * mult;
      return `${multStr} — over-cap PP → ${implant.target} XP at ${(rate * 100).toFixed(0)}%`;
    }
    return multStr;
  }

  // ── Training Console + Chamber Overlay ─────────────────────────────────
  _refreshTraining() {
    const el = document.getElementById('training-contents');
    const training = this.trainingAreas;
    if (!el || !training) return;
    el.innerHTML = '';

    const intro = document.createElement('div');
    intro.style.cssText = 'font-size:0.8em;opacity:0.75;margin-bottom:8px;';
    intro.textContent = 'Choose a sim program, then step into the chamber. Advanced sims drain a stat while they run.';
    el.appendChild(intro);

    for (const def of training.constructor.STATION_DEFS) {
      const lv = training.stationLevel(def.id);
      const selected = training.selectedProgram === def.id;
      const card = document.createElement('div');
      card.className = 'training-program' + (selected ? ' selected' : '');

      const legs = Object.entries(def.trains)
        .map(([s, m]) => m > 0
          ? `${this.stats.getStatLabel(s)} ×${m}`
          : `<span class="drain">${this.stats.getStatLabel(s)} −${Math.abs(m)}</span>`)
        .join(' · ');

      const cost = training.upgradeCost(def.id);
      const costStr = cost ? Object.entries(cost).map(([m, q]) => `${q} ${m}`).join(', ') : null;

      card.innerHTML =
        `<div class="tp-name">${def.label}${selected ? ' — LOADED' : ''}</div>` +
        `<div class="tp-legs">${legs}</div>` +
        `<div class="tp-meta">Program Lv ${lv} · ${training.effectiveRate(def.id).toFixed(2)} XP/s per leg` +
        (costStr ? ` · next: ${costStr}` : ' · MAX') + `</div>`;

      const selBtn = document.createElement('button');
      selBtn.textContent = selected ? 'UNLOAD' : 'LOAD PROGRAM';
      selBtn.addEventListener('click', () => {
        training.selectProgram(selected ? null : def.id);
        this._refreshTraining();
      });
      card.appendChild(selBtn);

      if (cost) {
        const upBtn = document.createElement('button');
        upBtn.textContent = `UPGRADE (${costStr})`;
        upBtn.disabled = !training.canUpgrade(def.id);
        upBtn.addEventListener('click', () => {
          if (training.upgrade(def.id)) this._refreshTraining();
        });
        card.appendChild(upBtn);
      }
      el.appendChild(card);
    }
  }

  /**
   * Called every frame from main.js. Shows the chamber immersion overlay while
   * a program is running (player inside the chamber), hides it on exit.
   * Video: Assets/Video/training_<programId>.mp4, else Assets/Video/training.mp4,
   * else the animated holo placeholder.
   */
  updateTrainingOverlay(training) {
    const overlay = document.getElementById('training-overlay');
    if (!overlay) return;
    const active = training?.activeId || null;

    if (!active) {
      if (!overlay.hidden) {
        overlay.hidden = true;
        const vid = document.getElementById('training-video');
        if (vid) { vid.pause(); vid.removeAttribute('src'); vid.load(); vid.hidden = true; }
        this._trainingOverlayProgram = null;
      }
      return;
    }

    if (overlay.hidden || this._trainingOverlayProgram !== active) {
      overlay.hidden = false;
      this._trainingOverlayProgram = active;
      const def = training.getDef(active);
      const title = document.getElementById('training-title');
      if (title) title.textContent = (def?.label || active).toUpperCase() + ' — SIMULATION RUNNING';
      this._loadTrainingVideo(active);
      this._trainingOverlayNext = 0;
    }

    const now = performance.now();
    if (now < (this._trainingOverlayNext || 0)) return;
    this._trainingOverlayNext = now + 500;

    const s = Math.floor(training.stint.seconds);
    const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
    const elapsed = document.getElementById('training-elapsed');
    if (elapsed) {
      elapsed.textContent = 'Training time: ' +
        (hh > 0 ? `${hh}h ` : '') + `${String(mm).padStart(2, '0')}m ${String(ss).padStart(2, '0')}s`;
    }

    const gains = document.getElementById('training-gains');
    const def = training.getDef(active);
    if (gains && def) {
      gains.innerHTML = Object.entries(def.trains).map(([stat, mult]) => {
        const label = this.stats ? this.stats.getStatLabel(stat) : stat;
        const dLv = training.stint.levels[stat] || 0;
        if (mult > 0) {
          const pct = Math.floor(Math.min(1, (training.bank[stat] || 0) / this.stats.upgradeCost(stat)) * 100);
          return `${label} ${dLv > 0 ? '+' + dLv + ' Lv' : ''} (${pct}% to next)`;
        }
        return `<span class="drain">${label} ${dLv < 0 ? dLv + ' Lv' : 'draining'}</span>`;
      }).join(' · ');
    }
  }

  _loadTrainingVideo(programId) {
    const vid = document.getElementById('training-video');
    const holo = document.getElementById('training-holo');
    if (!vid || !holo) return;
    const showHolo = () => { vid.hidden = true; vid.removeAttribute('src'); vid.load(); holo.hidden = false; };
    const sources = [`Assets/Video/training_${programId}.mp4`, 'Assets/Video/training.mp4'];
    let i = 0;
    const tryNext = () => {
      if (i >= sources.length) { showHolo(); return; }
      vid.hidden = false;
      holo.hidden = true;
      vid.src = sources[i++];
      vid.play?.().catch(() => {});
    };
    vid.onerror = tryNext;
    tryNext();
  }

  _wireRateTooltip() {
    const ppDisplay = document.getElementById('pp-display');
    const tooltip = document.getElementById('pp-rate-tooltip');
    if (!ppDisplay || !tooltip) return;
    ppDisplay.addEventListener('click', () => {
      tooltip.hidden = !tooltip.hidden;
    });
    document.addEventListener('click', (e) => {
      if (!tooltip.hidden && !ppDisplay.contains(e.target) && !tooltip.contains(e.target)) {
        tooltip.hidden = true;
      }
    });
  }

  // ── Optimization Console ────────────────────────────────────────────────
  _refreshOptimization() {
    const el = document.getElementById('optimization-contents');
    if (!el) return;
    const { mathematician, timeWarp, modifiers } = this.opt;
    el.innerHTML = '';

    // ── ROI ANALYZER (Mathematician) ──
    const sec1 = document.createElement('div');
    sec1.className = 'opt-section';
    const t1 = document.createElement('div');
    t1.className = 'opt-section-title';
    t1.textContent = 'ROI ANALYZER';
    sec1.appendChild(t1);

    const subtitle1 = document.createElement('div');
    subtitle1.className = 'opt-subtitle';
    if (mathematician?.isActive) {
      subtitle1.innerHTML = `<span style="color:#44ffaa;">ACTIVE — ${formatDuration(mathematician.timeRemaining)} remaining</span>`;
    } else {
      subtitle1.innerHTML = `<span style="color:#aaccbb;">Hire a mathematician to reveal gains-per-PP across all upgrades.</span>`;
    }
    sec1.appendChild(subtitle1);

    if (mathematician && !mathematician.isActive) {
      const hireBtn = document.createElement('button');
      hireBtn.className = 'stat-up-btn opt-btn';
      hireBtn.textContent = `HIRE — ${formatBig(mathematician.hireCost)} PP`;
      hireBtn.disabled = this.pp.ppTotal < mathematician.hireCost;
      hireBtn.onclick = () => {
        if (mathematician.hire()) this._refreshOptimization();
      };
      sec1.appendChild(hireBtn);
    }

    if (mathematician?.isActive) {
      const rows = mathematician.analyze({
        stats: this.stats,
        ascension: this.ascension,
        techTree: this.techTree,
        modifiers,
      });
      const table = document.createElement('div');
      table.className = 'opt-roi-table';
      const head = document.createElement('div');
      head.className = 'opt-roi-row opt-roi-head';
      head.innerHTML = `<span>Upgrade</span><span>Cost</span><span>ROI</span>`;
      table.appendChild(head);
      for (const row of rows.slice(0, 10)) {
        const r = document.createElement('div');
        r.className = 'opt-roi-row';
        const rating = row.ratio > 0.0005 ? 'opt-roi-hi' : row.ratio > 0.0001 ? 'opt-roi-mid' : 'opt-roi-lo';
        r.innerHTML = `<span class="opt-roi-label">${row.label}<span class="opt-roi-source">${row.source}</span></span>`
                    + `<span>${row.cost > 0 ? formatBig(row.cost) : '—'}</span>`
                    + `<span class="${rating}">${(row.ratio * 1e6).toFixed(1)}μ</span>`;
        table.appendChild(r);
      }
      sec1.appendChild(table);
    }
    el.appendChild(sec1);

    // ── TRADE-OFF MODIFIERS ──
    const sec2 = document.createElement('div');
    sec2.className = 'opt-section';
    const t2 = document.createElement('div');
    t2.className = 'opt-section-title';
    t2.textContent = 'TRADE-OFF MODIFIERS';
    sec2.appendChild(t2);

    const subtitle2 = document.createElement('div');
    subtitle2.className = 'opt-subtitle';
    const activeCount = modifiers ? modifiers.list().filter(m => m.active).length : 0;
    subtitle2.innerHTML = `<span style="color:#aaccbb;">Up to ${modifiers?.maxActive || 0} active. Currently: ${activeCount}/${modifiers?.maxActive || 0}.</span>`;
    sec2.appendChild(subtitle2);

    if (modifiers) {
      for (const mod of modifiers.list()) {
        const row = document.createElement('div');
        row.className = `opt-mod-row ${mod.active ? 'opt-mod-active' : ''}`;
        row.innerHTML = `<div class="opt-mod-info">
          <div class="opt-mod-label">${mod.label}</div>
          <div class="opt-mod-desc">${mod.desc}</div>
        </div>`;
        const btn = document.createElement('button');
        btn.className = 'stat-up-btn';
        btn.textContent = mod.active ? 'OFF' : 'ON';
        const atCap = !mod.active && activeCount >= modifiers.maxActive;
        btn.disabled = atCap;
        btn.onclick = () => {
          if (modifiers.toggle(mod.id)) this._refreshOptimization();
        };
        row.appendChild(btn);
        sec2.appendChild(row);
      }
    }
    el.appendChild(sec2);

    // ── TIME-WARPS ──
    const sec3 = document.createElement('div');
    sec3.className = 'opt-section';
    const t3 = document.createElement('div');
    t3.className = 'opt-section-title';
    t3.textContent = 'TIME-WARPS';
    sec3.appendChild(t3);

    const subtitle3 = document.createElement('div');
    subtitle3.className = 'opt-subtitle';
    if (timeWarp?.activeBoostRemaining > 0) {
      subtitle3.innerHTML = `<span style="color:#44ffaa;">Boost active — ${formatDuration(timeWarp.activeBoostRemaining)}</span>`;
    } else {
      subtitle3.innerHTML = `<span style="color:#aaccbb;">Quantum Crystals: <b style="color:#88ccff;">${timeWarp?.crystals || 0}</b></span>`;
    }
    sec3.appendChild(subtitle3);

    if (timeWarp) {
      for (const opt of timeWarp.options) {
        const row = document.createElement('div');
        row.className = 'opt-warp-row';
        const projectedPP = Math.floor(this.pp.ppRate * opt.seconds);
        row.innerHTML = `<div class="opt-warp-info">
          <div class="opt-warp-label">${opt.label}</div>
          <div class="opt-warp-desc">+${formatBig(projectedPP)} PP · ${opt.multiplier}× boost for ${opt.duration}s</div>
        </div>`;
        const btn = document.createElement('button');
        btn.className = 'stat-up-btn';
        btn.textContent = `◈ ${opt.cost}`;
        btn.disabled = timeWarp.crystals < opt.cost;
        btn.onclick = () => {
          const r = timeWarp.use(opt.id);
          if (r) {
            this.showAchievementToast({
              icon: '◈',
              label: `${opt.label} engaged`,
              desc: `+${formatBig(r.grantedPP)} PP · ${opt.multiplier}× rate`,
              reward: 0,
            });
            this._refreshOptimization();
          }
        };
        row.appendChild(btn);
        sec3.appendChild(row);
      }
    }
    el.appendChild(sec3);
  }

  // Render a single factory machine card into the given container element.
  _renderMachineCard(containerId, machineId, refreshFn) {
    const el = document.getElementById(containerId);
    if (!el || !this.factory) return;
    el.innerHTML = '';

    const machine = this.factory.machines[machineId];
    if (!machine || !machine.unlocked) return;

    const card = document.createElement('div');
    card.className = 'machine-card';

    const header = document.createElement('div');
    header.className = 'machine-header';
    header.innerHTML = `<span class="machine-title">${machine.name} (Lv ${machine.count})</span>
                        <span class="machine-status" style="color: ${machine.isAutomated ? '#00ffcc' : '#ffaa44'}">${machine.isAutomated ? 'Auto' : 'Manual'}</span>`;
    card.appendChild(header);

    const body = document.createElement('div');
    body.className = 'machine-body';

    // Recipe Selector
    const selectorWrap = document.createElement('div');
    selectorWrap.className = 'recipe-selector';
    const select = document.createElement('select');
    for (const recipeId of this.factory.machineRecipes[machineId]) {
      const rOpts = document.createElement('option');
      rOpts.value = recipeId;
      const recipeDef = this.factory.recipes[recipeId];
      const outList = Object.keys(recipeDef.outputs).map(k => _matLabel(k)).join(', ');
      rOpts.textContent = outList;
      if (machine.currentRecipe === recipeId) rOpts.selected = true;
      select.appendChild(rOpts);
    }
    select.onchange = () => {
      this.factory.setRecipe(machineId, select.value);
      refreshFn();
    };
    selectorWrap.appendChild(select);
    body.appendChild(selectorWrap);

    // Recipe IO Display
    if (machine.currentRecipe) {
      const recipeDef = this.factory.recipes[machine.currentRecipe];
      const io = document.createElement('div');
      io.className = 'machine-io';
      const inStr = Object.entries(recipeDef.inputs).map(([k,v])=>`${v}x ${_matLabel(k)}`).join(', ');
      const outStr = Object.entries(recipeDef.outputs).map(([k,v])=>`${v * machine.yieldRatio}x ${_matLabel(k)}`).join(', ');
      io.innerHTML = `<span>${inStr} &rarr;</span><span>${outStr}</span>`;
      body.appendChild(io);

      // Input hopper (Phase E): the machine feeds from here, online and offline
      const size = this.factory.hopperSize(machineId);
      const hopperWrap = document.createElement('div');
      hopperWrap.style.cssText = 'margin:4px 0;padding:4px 6px;border:1px dashed #44ffcc33;font-size:0.78em;';
      const hopperHead = document.createElement('div');
      hopperHead.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:4px;';
      hopperHead.innerHTML = `<span style="color:#44ffcc;">HOPPER <span style="opacity:0.6">(${size}/mat)</span></span>`;
      const hopUp = document.createElement('button');
      hopUp.className = 'construct-buy-btn';
      const hopCost = this.factory.hopperUpgradeCost(machineId);
      hopUp.textContent = `×2 SIZE (${abbrevNum(hopCost)} PP)`;
      hopUp.disabled = this.pp.ppTotal < hopCost;
      hopUp.onclick = () => { if (this.factory.upgradeHopper(machineId)) refreshFn(); };
      hopperHead.appendChild(hopUp);
      hopperWrap.appendChild(hopperHead);

      for (const mat of Object.keys(recipeDef.inputs)) {
        const line = document.createElement('div');
        line.style.cssText = 'display:flex;align-items:center;gap:4px;margin-top:2px;';
        const have = machine.hopper[mat] || 0;
        const bag = this.inventory.materials[mat] || 0;
        const label = document.createElement('span');
        label.style.cssText = 'flex:1;';
        label.textContent = `${_matLabel(mat)}: ${have}/${size} (bag ${bag})`;
        line.appendChild(label);
        const stockBtn = document.createElement('button');
        stockBtn.className = 'construct-buy-btn';
        stockBtn.textContent = 'STOCK';
        stockBtn.title = 'Fill the hopper from your bag';
        stockBtn.disabled = bag <= 0 || have >= size;
        stockBtn.onclick = () => { if (this.factory.stock(machineId, mat) > 0) refreshFn(); };
        line.appendChild(stockBtn);
        const unstockBtn = document.createElement('button');
        unstockBtn.className = 'construct-buy-btn';
        unstockBtn.textContent = '↩';
        unstockBtn.title = 'Return hopper contents to your bag';
        unstockBtn.disabled = have <= 0;
        unstockBtn.onclick = () => { if (this.factory.unstock(machineId, mat) > 0) refreshFn(); };
        line.appendChild(unstockBtn);
        hopperWrap.appendChild(line);
      }
      body.appendChild(hopperWrap);
    }

    // Progress Track
    const track = document.createElement('div');
    track.className = 'progress-track';
    const fill = document.createElement('div');
    fill.className = 'progress-fill';
    fill.id = 'fill-' + machineId;
    fill.style.width = `${machine.progress * 100}%`;
    track.appendChild(fill);
    body.appendChild(track);

    card.appendChild(body);

    // Controls
    const controls = document.createElement('div');
    controls.className = 'machine-controls';

    const processBtn = document.createElement('button');
    processBtn.className = 'btn-process';
    processBtn.textContent = 'PROCESS';
    const recipe = this.factory.recipes[machine.currentRecipe];
    const hasMats = recipe ? this.factory.hasHopperMaterials(machine, recipe.inputs) : false;
    if (machine.isAutomated || !hasMats) {
      processBtn.disabled = true;
      processBtn.style.opacity = '0.5';
    }
    processBtn.onclick = () => {
      if (this.factory.manualProcess(machineId)) refreshFn();
    };
    controls.appendChild(processBtn);

    if (!machine.isAutomated) {
      const automateBtn = document.createElement('button');
      automateBtn.className = 'btn-automate';
      automateBtn.textContent = 'AUTOMATE (100 PP)';
      automateBtn.onclick = () => {
        this.factory.automate(machineId, 100);
        refreshFn();
      };
      controls.appendChild(automateBtn);
    } else {
      const upgradeBtn = document.createElement('button');
      upgradeBtn.className = 'btn-automate';
      const cost = 100 * Math.pow(2, machine.count);
      upgradeBtn.textContent = `UPGRADE (${cost} PP)`;
      upgradeBtn.onclick = () => {
        if (this.pp.spend(cost)) {
          machine.count++;
          refreshFn();
        }
      };
      controls.appendChild(upgradeBtn);
    }

    card.appendChild(controls);
    el.appendChild(card);
  }

  // ── Quest Hub ─────────────────────────────────────────────────────────────

  // ── Field Ops (Expedition + Boss Threat Index) ──────────────────────────
  _refreshExpedition() {
    const el = document.getElementById('expedition-contents');
    const exp = this.prog.expedition;
    if (!el || !exp) return;
    el.innerHTML = '';

    const tier = exp.tier;
    const band = exp.band(tier);
    const rate = exp.killRate(tier);
    const danger = exp.tierTooDangerous(tier);
    const farming = exp.isBandCleared(band);

    // Status card. AWAITING COMPUTE = board unlocked, frame running, 0 units on
    // the ladder — the sim is paused until Al's attention is assigned (ALLOC).
    const computeStarved = exp.active && this.compute?.unlocked && this.compute.unitsOn('ladder') <= 0;
    const runState = !exp.active
      ? '<span style="color:#888">IDLE</span>'
      : computeStarved
        ? '<span style="color:#ffaa44">AWAITING COMPUTE</span>'
        : '<span style="color:#66ff66">RUNNING</span>';
    const status = document.createElement('div');
    status.className = 'fieldops-status';
    status.innerHTML = `
      <div class="fieldops-title">SIMULATION LADDER — ${runState}</div>
      <div class="fieldops-row"><span>Sim tier</span><span>T${tier + 1} · ${exp.bandLabel(band)} ${farming ? '<span style="color:#66ff66">[FARM]</span>' : '<span style="color:#ffaa44">[FRONTIER]</span>'}</span></div>
      <div class="fieldops-row"><span>Target</span><span>${exp.enemyName(tier)} · HP ${abbrevNum(Math.floor(exp.enemyHP(tier)))}</span></div>
      <div class="fieldops-row"><span>Frame DPS</span><span>${abbrevNum(Math.floor(exp.playerDPS))}</span></div>
      <div class="fieldops-row"><span>Kill rate</span><span>${danger ? '<span style="color:#ff5555">STALLED</span>' : (rate * 60).toFixed(1) + ' /min · ' + abbrevNum(exp.ppPerKill(tier)) + ' PP/kill'}</span></div>
      <div class="fieldops-row"><span>Lifetime</span><span>${abbrevNum(exp.totalKills)} kills · +${abbrevNum(exp.totalPP)} PP</span></div>
      <div class="fieldops-row"><span>Archive Fragments</span><span style="color:#c9a2ff">◈ ${abbrevNum(exp.archiveShards)} <span style="color:#666">(banked for Recompile)</span></span></div>
      ${danger ? '<div class="fieldops-warn">⚠ Tier threat exceeds frame survivability — upgrade Health / Defense or drop tiers</div>' : ''}
      ${computeStarved ? '<div class="fieldops-warn">⚠ No compute assigned to SIM LADDER — allocate a unit on the ALLOC board</div>' : ''}
    `;
    el.appendChild(status);

    // Run / halt
    const btn = document.createElement('button');
    btn.className = 'construct-buy-btn';
    btn.textContent = exp.active ? '⏹ HALT SIMULATION' : '▶ RUN SIMULATION';
    btn.disabled = !exp.active && danger;
    btn.addEventListener('click', () => {
      if (exp.active) exp.stop(); else exp.start();
      this._refreshExpedition();
    });
    el.appendChild(btn);

    // Tier controls — the ladder is infinite; wardens gate each band of 10
    const ctrl = document.createElement('div');
    ctrl.style.cssText = 'display:flex;gap:6px;margin:8px 0;flex-wrap:wrap;';
    const mkTierBtn = (label, target, title = '') => {
      const b = document.createElement('button');
      b.className = 'construct-buy-btn';
      b.style.cssText = 'flex:1;min-width:52px;margin:0;';
      b.textContent = label;
      if (title) b.title = title;
      b.disabled = target === tier || target < 0 || target > exp.maxTier;
      b.addEventListener('click', () => { exp.setTier(target); this._refreshExpedition(); });
      return b;
    };
    ctrl.appendChild(mkTierBtn('−10', Math.max(0, tier - 10)));
    ctrl.appendChild(mkTierBtn('−1', tier - 1));
    ctrl.appendChild(mkTierBtn('+1', tier + 1));
    ctrl.appendChild(mkTierBtn('+10', Math.min(exp.maxTier, tier + 10)));
    const safe = exp.maxSafeTier();
    ctrl.appendChild(mkTierBtn('MAX SAFE', safe, safe >= 0 ? `Highest idle-safe tier: T${safe + 1}` : 'No safe tier'));
    el.appendChild(ctrl);

    // Warden gate — transparent attempt math, keys from field kills
    const p = exp.wardenPreview();
    // Key Tracker (Al module): band↔family hunting grounds, from the zone
    // spawn tables in Environment.getEnemySpawns().
    const KEY_TRACKER_GROUNDS = {
      serpendrill: 'Landing Site · The Mine',
      reptlar: 'The Mine · Verdant Maw',
      dunkraza: 'The Mine · Lagoon Coast · Frozen Tundra',
      spoonvark: 'Lagoon Coast',
      hardlizzy: 'Frozen Tundra · The Depths',
      cavecrab: 'The Depths',
    };
    const trackerLine = this.compute?.hasModule('keyTracker')
      ? `<div class="fieldops-row"><span style="color:#44ffcc">🤖 Key Tracker</span><span>${KEY_TRACKER_GROUNDS[p.family.id] || 'field zones'}</span></div>`
      : '';
    const keysShort = p.keysNeed - p.keysHave;
    const ready = keysShort <= 0;
    const winnable = p.damageFraction >= 1;
    const towardKey = exp.killsTowardKey(p.family.id);
    const perKey = exp.constructor.KILLS_PER_KEY;
    const warden = document.createElement('div');
    warden.className = 'fieldops-status';
    warden.style.borderColor = '#ffaa4466';
    warden.innerHTML = `
      <div class="fieldops-title" style="color:#ffaa44">SECTOR WARDEN — GATE T${p.gateTier + 1}</div>
      <div class="fieldops-row"><span>${p.name}</span><span>HP ${abbrevNum(Math.floor(p.hp))}</span></div>
      <div class="fieldops-row"><span>Override Keys</span><span>${p.keysHave} / ${p.keysNeed} <span style="color:#666">(${perKey - towardKey} field ${p.family.label} kills → next key)</span></span></div>
      ${trackerLine}
      <div class="fieldops-row"><span>Projected burn</span><span style="color:${p.dpsFraction >= 1 ? '#66ff66' : '#ff8855'}">${Math.round(p.dpsFraction * 100)}%</span></div>
      <div class="fieldops-row"><span>Survival gate</span><span style="color:${p.survivalFraction >= 1 ? '#66ff66' : '#ff8855'}">${Math.round(p.survivalFraction * 100)}%</span></div>
      <div class="activity-timer-bar"><div class="activity-timer-fill" style="width:${Math.min(100, p.damageFraction * 100)}%"></div></div>
    `;
    const attemptBtn = document.createElement('button');
    attemptBtn.className = 'construct-buy-btn';
    attemptBtn.textContent = ready
      ? (winnable ? `⚔ ATTEMPT WARDEN (−${p.keysNeed} keys)` : `⚔ PUSH ANYWAY (−${p.keysNeed} keys · ~${Math.round(p.damageFraction * 100)}% → salvage fragments)`)
      : `⚔ NEED ${keysShort} MORE KEY${keysShort === 1 ? '' : 'S'} — field-hunt ${p.family.label}s`;
    attemptBtn.disabled = !ready;
    attemptBtn.addEventListener('click', () => { exp.attemptWarden(); this._refreshExpedition(); });
    warden.appendChild(attemptBtn);
    el.appendChild(warden);

    // Rolling log
    if (exp.log.length > 0) {
      const log = document.createElement('div');
      log.className = 'fieldops-log';
      log.innerHTML = exp.log.map(e => `<div>${e.msg}</div>`).join('');
      el.appendChild(log);
    }

    // Chapter chain — the player's level + next objective
    const chapters = this.prog.chapters;
    if (chapters) {
      const chHead = document.createElement('div');
      chHead.className = 'fieldops-status';
      chHead.style.borderColor = '#ffd70044';
      chHead.innerHTML = `
        <div class="fieldops-title" style="color:#ffd700">${chapters.headline}</div>
        <div class="fieldops-row"><span>Next chapter</span><span>${chapters.nextObjective}</span></div>
      `;
      el.appendChild(chHead);
    }

    // Threat Index — zone bosses
    const bosses = this.prog.bosses;
    if (bosses) {
      const head = document.createElement('div');
      head.className = 'fieldops-section-head';
      head.textContent = 'THREAT INDEX — ZONE BOSSES';
      el.appendChild(head);
      const zoneLabels = {
        landingSite: 'Landing Site', mine: 'The Mine', verdantMaw: 'Verdant Maw',
        lagoonCoast: 'Lagoon Coast', frozenTundra: 'Frozen Tundra', depths: 'The Depths',
      };
      for (const def of bosses.constructor.BOSS_DEFS) {
        const dead = bosses.isDefeated(def.id);
        const row = document.createElement('div');
        row.className = 'fieldops-boss' + (dead ? ' defeated' : '');
        row.innerHTML = `
          <span>${dead ? '☠' : '⚔'} ${def.label}</span>
          <span>${zoneLabels[def.zone] || def.zone}</span>
          <span>${dead ? `✓ ${def.bonus.label}` : 'AT LARGE'}</span>
        `;
        el.appendChild(row);
      }
    }
  }

  // ── Trials (Challenge runs) ─────────────────────────────────────────────
  _refreshChallenges() {
    const el = document.getElementById('challenges-contents');
    const ch = this.prog.challenges;
    if (!el || !ch) return;
    el.innerHTML = '';

    const active = ch.activeDef;
    if (active) {
      const prog = ch.progress();
      const card = document.createElement('div');
      card.className = 'trial-card trial-active';
      card.innerHTML = `
        <div class="trial-head"><span>◆ ACTIVE: ${active.label}</span></div>
        <div class="trial-desc">${active.desc}</div>
        <div class="trial-progress">${prog ? prog.text : ''}</div>
        <div class="activity-timer-bar"><div class="activity-timer-fill" style="width:${prog ? prog.pct * 100 : 0}%"></div></div>
      `;
      const abandonBtn = document.createElement('button');
      abandonBtn.className = 'construct-buy-btn construct-action-remove';
      abandonBtn.textContent = 'ABANDON TRIAL';
      abandonBtn.addEventListener('click', () => { ch.abandon(); this._refreshChallenges(); });
      card.appendChild(abandonBtn);
      el.appendChild(card);
    } else {
      const hint = document.createElement('div');
      hint.className = 'trial-hint';
      hint.textContent = 'Complete trials under constraint for permanent multipliers. One trial at a time.';
      el.appendChild(hint);
    }

    for (const def of ch.constructor.CHALLENGE_DEFS) {
      const done = ch.isCompleted(def.id);
      const card = document.createElement('div');
      card.className = 'trial-card' + (done ? ' trial-done' : '');
      card.innerHTML = `
        <div class="trial-head">
          <span>${done ? '✓' : '◇'} ${def.label}</span>
          <span class="trial-reward">${def.reward.label}</span>
        </div>
        <div class="trial-desc">${def.desc}</div>
      `;
      if (!done && !active) {
        const startBtn = document.createElement('button');
        startBtn.className = 'construct-buy-btn';
        startBtn.textContent = 'START TRIAL';
        startBtn.addEventListener('click', () => { ch.start(def.id); this._refreshChallenges(); });
        card.appendChild(startBtn);
      }
      el.appendChild(card);
    }
  }

  // ── Neural Implant (idle stat training) ─────────────────────────────────
  _refreshImplant() {
    const el = document.getElementById('implant-contents');
    const imp = this.prog.implant;
    if (!el || !imp) return;
    el.innerHTML = '';

    const status = document.createElement('div');
    status.className = 'implant-status';
    if (imp.target) {
      const cost = imp.nextCost;
      const pct = Math.min(100, (imp.xp / cost) * 100);
      status.innerHTML = `
        <div class="fieldops-title">TRAINING: ${this.stats.getStatLabel(imp.target).toUpperCase()}</div>
        <div class="fieldops-row"><span>Diverting</span><span>${imp.drainRate.toFixed(2)} PP/s (${Math.round(imp.constructor.DRAIN_FRACTION * 100)}% of income)</span></div>
        <div class="fieldops-row"><span>Next level</span><span>${abbrevNum(Math.floor(imp.xp))} / ${abbrevNum(cost)}</span></div>
        <div class="fieldops-row"><span>Levels trained (lifetime)</span><span>${imp.totalTrained}</span></div>
        <div class="activity-timer-bar"><div class="activity-timer-fill" style="width:${pct}%"></div></div>
        <div class="trial-hint">Trains offline at 50% efficiency. Switching targets forfeits banked progress.</div>
      `;
      const stopBtn = document.createElement('button');
      stopBtn.className = 'construct-buy-btn construct-action-remove';
      stopBtn.textContent = '⏹ HALT TRAINING';
      stopBtn.addEventListener('click', () => { imp.setTarget(null); this._refreshImplant(); });
      status.appendChild(stopBtn);
    } else {
      status.innerHTML = `
        <div class="fieldops-title">IMPLANT IDLE</div>
        <div class="trial-hint">Select a stat to train passively. The implant siphons ${Math.round(imp.constructor.DRAIN_FRACTION * 100)}% of PP income and converts it into stat levels — even while offline.</div>
      `;
    }
    el.appendChild(status);

    for (const name of this.stats.statNames) {
      const row = document.createElement('div');
      row.className = 'implant-row' + (imp.target === name ? ' active' : '');
      const lvl = this.stats.stats[name].level;
      row.innerHTML = `
        <span class="implant-stat">${this.stats.getStatLabel(name)}</span>
        <span class="implant-lvl">Lv ${lvl}</span>
        <span class="implant-cost">${abbrevNum(this.stats.upgradeCost(name))} PP</span>
      `;
      const btn = document.createElement('button');
      btn.className = 'stat-up-btn';
      btn.textContent = imp.target === name ? 'TRAINING' : 'TRAIN';
      btn.disabled = imp.target === name;
      btn.addEventListener('click', () => { imp.setTarget(name); this._refreshImplant(); });
      row.appendChild(btn);
      el.appendChild(row);
    }
  }

  // ── Data Core (PP growth visualization) ─────────────────────────────────
  _refreshDataCore() {
    const bignum = document.getElementById('data-bignum');
    if (bignum) bignum.textContent = abbrevNum(this.pp.displayTotal);

    this._drawPPGraph();

    const statsEl = document.getElementById('data-stats');
    if (!statsEl) return;
    const mins = Math.max(1 / 60, (Date.now() - this._sessionStart) / 60000);
    const exp = this.prog.expedition;
    const bosses = this.prog.bosses;
    const ch = this.prog.challenges;
    const rows = [
      ['PP this session', abbrevNum(Math.floor(this._sessionPP))],
      ['Session time', mins < 60 ? `${Math.floor(mins)}m` : `${Math.floor(mins / 60)}h ${Math.floor(mins % 60)}m`],
      ['Avg PP/min', abbrevNum(Math.floor(this._sessionPP / mins))],
      ['Current rate', `${(this.pp.effectiveRate ?? this.pp.ppRate).toFixed(1)} /s`],
      ['Peak rate', `${this._peakRate.toFixed(1)} /s`],
      ['Chapter', this.prog?.chapters ? this.prog.chapters.headline : '—'],
      ['Offloads', this.pp.prestigeCount],
      ['Sim ladder kills', exp ? abbrevNum(exp.totalKills) : '—'],
      ['Boss trophies', bosses ? `${bosses.defeated.size} / ${bosses.constructor.BOSS_DEFS.length}` : '—'],
      ['Trials complete', ch ? `${ch.completed.size} / ${ch.constructor.CHALLENGE_DEFS.length}` : '—'],
    ];
    statsEl.innerHTML = rows.map(([k, v]) =>
      `<div class="data-stat-row"><span>${k}</span><span>${v}</span></div>`
    ).join('');
  }

  _drawPPGraph() {
    const canvas = document.getElementById('pp-graph');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const samples = this._ppSamples;
    if (samples.length < 2) {
      ctx.fillStyle = '#44ff8866';
      ctx.font = '13px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('collecting data…', W / 2, H / 2);
      return;
    }

    const maxRate = Math.max(this._peakRate, 0.1);
    const capacity = 300; // 10 min at 2s samples — timeline anchored right
    const stepX = W / (capacity - 1);

    // Horizontal grid lines at 25/50/75%
    ctx.strokeStyle = '#44ff8818';
    ctx.lineWidth = 1;
    for (const f of [0.25, 0.5, 0.75]) {
      ctx.beginPath();
      ctx.moveTo(0, H * f);
      ctx.lineTo(W, H * f);
      ctx.stroke();
    }

    const xAt = (i) => W - (samples.length - 1 - i) * stepX;
    const yAt = (r) => H - 4 - (r / maxRate) * (H - 12);

    // Area fill
    ctx.beginPath();
    ctx.moveTo(xAt(0), H);
    for (let i = 0; i < samples.length; i++) ctx.lineTo(xAt(i), yAt(samples[i].rate));
    ctx.lineTo(xAt(samples.length - 1), H);
    ctx.closePath();
    ctx.fillStyle = 'rgba(68, 255, 136, 0.12)';
    ctx.fill();

    // Rate line
    ctx.beginPath();
    for (let i = 0; i < samples.length; i++) {
      const x = xAt(i), y = yAt(samples[i].rate);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#44ff88';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Peak label
    ctx.fillStyle = '#44ff8899';
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${maxRate.toFixed(1)}/s`, 4, 12);
  }

  setQuestSystem(qs) {
    this.questSystem = qs;
  }

  _refreshQuestHub() {
    if (!this.questSystem) return;
    const body = document.getElementById('quest-hub-body');
    if (!body) return;

    // Ensure tab bar wiring (idempotent)
    this._wireQuestHubTabs();

    const activeTab = body.dataset.qhActiveTab || 'chains';
    body.innerHTML = '';

    if (activeTab === 'chains') {
      this._renderQuestChains(body);
    } else {
      this._renderSideQuests(body);
    }
  }

  _wireQuestHubTabs() {
    const tabBar = document.getElementById('quest-hub-tabs');
    if (!tabBar || tabBar._wired) return;
    tabBar._wired = true;
    const body = document.getElementById('quest-hub-body');
    tabBar.addEventListener('click', e => {
      const btn = e.target.closest('.quest-hub-tab');
      if (!btn) return;
      tabBar.querySelectorAll('.quest-hub-tab').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      body.dataset.qhActiveTab = btn.dataset.qhtab;
      this._refreshQuestHub();
    });
  }

  _renderQuestChains(container) {
    const qs = this.questSystem;
    const chains = qs.getChains();
    const trackedKey = qs.trackedQuestKey;

    for (const chain of chains) {
      const chainEl = document.createElement('div');
      chainEl.className = 'qh-chain';

      // Count done / total
      const total = chain.quests.length;
      const done  = chain.quests.filter(q => q._status === 'done').length;
      const allDone = done === total;
      if (allDone) chainEl.classList.add('all-done');

      // Auto-open chain if it has an active/available quest and not all done
      const hasActive = chain.quests.some(q => q._status === 'active' || q._status === 'available');
      if (hasActive && !allDone) chainEl.classList.add('open');

      // Header
      const header = document.createElement('div');
      header.className = 'qh-chain-header';
      header.innerHTML = `
        <span class="qh-chain-icon">${chain.icon}</span>
        <span class="qh-chain-name">${chain.title}
          <span class="qh-chain-sub">${chain.subtitle}</span>
        </span>
        <span class="qh-chain-progress">${done}/${total}</span>
        <span class="qh-chain-chevron">▼</span>
      `;
      header.addEventListener('click', () => {
        chainEl.classList.toggle('open');
      });
      chainEl.appendChild(header);

      // Body
      const bodyEl = document.createElement('div');
      bodyEl.className = 'qh-chain-body';

      for (const quest of chain.quests) {
        const key = `${chain.id}:${quest.id}`;
        const isTracked = trackedKey === key;
        const qEl = document.createElement('div');
        qEl.className = `qh-quest status-${quest._status}`;

        const badgeMap = { done:'✓ DONE', active:'IN PROGRESS', available:'AVAILABLE', locked:'🔒 LOCKED' };
        const badgeCls = { done:'badge-done', active:'badge-active', available:'badge-available', locked:'badge-locked' };

        let stepsHtml = '';
        for (const step of quest.steps) {
          stepsHtml += `<li class="qh-step${step.done?' done':''}">${step.desc}</li>`;
        }

        const rewardLabel = quest.reward?.special
          ? `<span class="qh-reward special">★ ${quest.reward.label}</span>`
          : quest.reward?.pp > 0
            ? `<span class="qh-reward">+${quest.reward.pp} PP</span>`
            : '';

        const trackBtnHtml = (quest._status === 'available' || quest._status === 'active')
          ? `<button class="qh-track-btn ${isTracked?'tracking':''}" data-key="${key}">${isTracked ? '📌 TRACKING' : 'TRACK'}</button>`
          : '';

        qEl.innerHTML = `
          <div class="qh-quest-header">
            <span class="qh-quest-title">${quest.title}</span>
            <span class="qh-quest-status-badge ${badgeCls[quest._status]}">${badgeMap[quest._status]}</span>
          </div>
          <div class="qh-quest-desc">${quest.desc}</div>
          <ul class="qh-step-list">${stepsHtml}</ul>
          <div class="qh-quest-footer">${rewardLabel}${trackBtnHtml}</div>
        `;

        // Wire track button
        const trackBtn = qEl.querySelector('.qh-track-btn');
        if (trackBtn) {
          trackBtn.addEventListener('click', e => {
            e.stopPropagation();
            const [cid, qid] = trackBtn.dataset.key.split(':');
            qs.setTrackedQuest(cid, qid);
            this._refreshQuestHub();
          });
        }

        bodyEl.appendChild(qEl);
      }

      chainEl.appendChild(bodyEl);
      container.appendChild(chainEl);
    }
  }

  _renderSideQuests(container) {
    const qs = this.questSystem;
    const pool = qs.getSidePool();
    const trackedId = qs.trackedSideId;

    // Group by category
    const cats = {};
    for (const sq of pool) {
      if (!cats[sq.cat]) cats[sq.cat] = [];
      cats[sq.cat].push(sq);
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'qh-side-section';

    // Tracked side quest at top
    if (trackedId) {
      const tracked = pool.find(s => s.id === trackedId);
      if (tracked && tracked._status !== 'done') {
        const label = document.createElement('div');
        label.className = 'qh-side-cat-label';
        label.textContent = '📌 CURRENTLY TRACKING';
        wrapper.appendChild(label);
        wrapper.appendChild(this._makeSideCard(tracked, true, qs));
      }
    }

    for (const [cat, quests] of Object.entries(cats)) {
      const label = document.createElement('div');
      label.className = 'qh-side-cat-label';
      label.textContent = cat.toUpperCase();
      wrapper.appendChild(label);
      for (const sq of quests) {
        wrapper.appendChild(this._makeSideCard(sq, sq.id === trackedId, qs));
      }
    }

    container.appendChild(wrapper);
  }

  _makeSideCard(sq, isTracked, qs) {
    const card = document.createElement('div');
    const isDone = sq._status === 'done';
    card.className = `qh-side-card${isDone?' done':''}${isTracked && !isDone?' tracking':''}`;

    if (isDone) {
      card.innerHTML = `
        <span class="qh-side-icon">${sq.icon}</span>
        <div class="qh-side-info">
          <div class="qh-side-title">${sq.title}</div>
          <div class="qh-side-desc">${sq.desc}</div>
        </div>
        <span class="qh-side-done-mark">✓</span>
      `;
    } else {
      card.innerHTML = `
        <span class="qh-side-icon">${sq.icon}</span>
        <div class="qh-side-info">
          <div class="qh-side-title">${sq.title}</div>
          <div class="qh-side-desc">${sq.desc}</div>
        </div>
        <span class="qh-side-reward">+${sq.reward.pp} PP</span>
        <button class="qh-track-btn ${isTracked?'tracking':''}" data-sqid="${sq.id}" style="margin-left:6px;">
          ${isTracked ? '📌' : 'TRACK'}
        </button>
      `;
      const btn = card.querySelector('.qh-track-btn');
      if (btn) {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          qs.setTrackedSide(btn.dataset.sqid);
          this._refreshQuestHub();
        });
      }
    }
    return card;
  }

  // ── End Quest Hub ─────────────────────────────────────────────────────────

  _refreshWorkshop() {
    this._renderMachineCard('workshop-contents', 'smelter', () => this._refreshWorkshop());
  }

  _refreshConstructor() {
    this._renderMachineCard('constructor-contents', 'assembler', () => this._refreshConstructor());
  }

  _refreshFabricationBay() {
    this._renderMachineCard('fabrication-contents', 'fabricator', () => this._refreshFabricationBay());
  }

  _refreshRefinery() {
    const el = document.getElementById('refinery-contents');
    if (!el) return;
    el.innerHTML = '';
    this._renderExtractorSection(el);
    this._renderProcessingSection(el);
  }

  // ── Refinery: Extractors ──────────────────────────────────────────────────
  _renderExtractorSection(parent) {
    const ex = this.extractor;
    if (!ex) return;
    const RATES = ex.constructor.RATES;

    const heading = document.createElement('div');
    heading.className = 'machine-header';
    heading.innerHTML = `<span class="machine-title">Extractors (${ex.slotCount}/${ex.constructor.MAX_SLOTS})</span>`;
    parent.appendChild(heading);

    // Combined live yield across installed extractors
    const rates = ex.getRates();
    const rateStr = Object.entries(rates).map(([m, r]) => `+${(r * 60).toFixed(1)}/min ${_matLabel(m)}`).join(', ');
    const yieldLine = document.createElement('div');
    yieldLine.style.cssText = 'font-size:0.7rem;color:#ccaadd;margin:2px 0 6px;';
    yieldLine.textContent = ex.slotCount > 0 ? rateStr : 'No extractors installed.';
    parent.appendChild(yieldLine);

    // Installed slots with remove buttons
    ex.serialize().slots.forEach((slot, i) => {
      const row = document.createElement('div');
      row.className = 'machine-io';
      const label = slot.type === 'advanced' ? 'Advanced Extractor' : 'Basic Extractor';
      row.innerHTML = `<span>${label}</span>`;
      const rm = document.createElement('button');
      rm.className = 'btn-process';
      rm.textContent = 'REMOVE';
      rm.onclick = () => { ex.remove(i); this._refreshRefinery(); };
      row.appendChild(rm);
      parent.appendChild(row);
    });

    // Install buttons — one per extractor type, gated by owned units
    const controls = document.createElement('div');
    controls.className = 'machine-controls';
    for (const type of Object.keys(RATES)) {
      const itemKey = type === 'advanced' ? 'extractor_unit_adv' : 'extractor_unit';
      const owned = this.inventory.materials[itemKey] || 0;
      const btn = document.createElement('button');
      btn.className = 'btn-automate';
      btn.textContent = `INSTALL ${type === 'advanced' ? 'ADVANCED' : 'BASIC'} (${owned})`;
      if (!ex.canInstall(type)) { btn.disabled = true; btn.style.opacity = '0.5'; }
      btn.onclick = () => { if (ex.install(type)) this._refreshRefinery(); };
      controls.appendChild(btn);
    }
    parent.appendChild(controls);
  }

  // ── Refinery: Processing Nodes ────────────────────────────────────────────
  _renderProcessingSection(parent) {
    const pn = this.processing;
    if (!pn) return;
    const DEFS = pn.constructor.NODE_DEFS;

    const heading = document.createElement('div');
    heading.className = 'machine-header';
    heading.style.marginTop = '8px';
    heading.innerHTML = `<span class="machine-title">Processing Nodes</span>`;
    parent.appendChild(heading);

    for (const [nodeType, def] of Object.entries(DEFS)) {
      const state = pn.getState(nodeType);
      const card = document.createElement('div');
      card.className = 'machine-card';

      const header = document.createElement('div');
      header.className = 'machine-header';
      const active = state.active ? 'Working' : (state.queue.length ? 'Queued' : 'Idle');
      header.innerHTML = `<span class="machine-title">${def.label} (T${state.tier})</span>
                          <span class="machine-status" style="color:${state.active ? '#00ffcc' : '#ffaa44'}">${active}</span>`;
      card.appendChild(header);

      const body = document.createElement('div');
      body.className = 'machine-body';

      const inStr = Object.entries(def.input).map(([k, v]) => `${v}× ${_matLabel(k)}`).join(', ');
      const outStr = Object.entries(def.output).map(([k, v]) => `${v}× ${_matLabel(k)}`).join(', ');
      const io = document.createElement('div');
      io.className = 'machine-io';
      io.innerHTML = `<span>${inStr} &rarr;</span><span>${outStr}</span>`;
      body.appendChild(io);

      // Progress bar (live-updated each frame via _tickRefinery)
      const barWrap = document.createElement('div');
      barWrap.className = 'progress-track';
      const fill = document.createElement('div');
      fill.className = 'progress-fill';
      fill.id = `refinery-fill-${nodeType}`;
      fill.style.width = state.active ? `${(state.active.progress / state.active.duration) * 100}%` : '0%';
      barWrap.appendChild(fill);
      body.appendChild(barWrap);
      card.appendChild(body);

      const controls = document.createElement('div');
      controls.className = 'machine-controls';

      const procBtn = document.createElement('button');
      procBtn.className = 'btn-process';
      procBtn.textContent = `PROCESS (${state.queue.length}/${pn.maxQueueSize})`;
      if (!pn.canProcess(nodeType) || state.queue.length >= pn.maxQueueSize) {
        procBtn.disabled = true; procBtn.style.opacity = '0.5';
      }
      procBtn.onclick = () => { if (pn.enqueue(nodeType)) this._refreshRefinery(); };
      controls.appendChild(procBtn);

      const upCost = pn.getUpgradeCost(nodeType);
      if (upCost !== null) {
        const upBtn = document.createElement('button');
        upBtn.className = 'btn-automate';
        upBtn.textContent = `UPGRADE (${upCost} PP)`;
        if (this.pp.ppTotal < upCost) { upBtn.disabled = true; upBtn.style.opacity = '0.5'; }
        upBtn.onclick = () => { if (pn.upgrade(nodeType)) this._refreshRefinery(); };
        controls.appendChild(upBtn);
      }

      card.appendChild(controls);
      parent.appendChild(card);
    }
  }

  // Lightweight per-frame progress update for the open Refinery panel (no DOM rebuild).
  _tickRefinery() {
    if (!this.processing) return;
    const DEFS = this.processing.constructor.NODE_DEFS;
    for (const nodeType of Object.keys(DEFS)) {
      const state = this.processing.getState(nodeType);
      const fill = document.getElementById(`refinery-fill-${nodeType}`);
      if (fill) fill.style.width = state.active ? `${(state.active.progress / state.active.duration) * 100}%` : '0%';
    }
  }

  _refreshAssemblyMatrix() {
    const el = document.getElementById('assembly-matrix-contents');
    if (!el || !this.assembly) return;
    el.innerHTML = '';

    for (const sch of this.assembly.constructor.SCHEMATICS) {
      const card = document.createElement('div');
      card.className = 'machine-card';

      const header = document.createElement('div');
      header.className = 'machine-header';
      const matched = this.assembly.checkMatch(sch.id);
      header.innerHTML = `<span class="machine-title">${sch.label}</span>
                          <span class="machine-status" style="color:${matched ? '#00ffcc' : '#ffaa44'}">${matched ? 'Ready' : 'Idle'}</span>`;
      card.appendChild(header);

      const body = document.createElement('div');
      body.className = 'machine-body';

      const desc = document.createElement('div');
      desc.style.fontSize = '0.7rem';
      desc.style.color = '#aaccdd';
      desc.style.marginBottom = '4px';
      desc.textContent = sch.description;
      body.appendChild(desc);

      const cost = this.assembly.getMaterialCost(sch.id);
      const costStr = Object.entries(cost).map(([k, v]) => `${v}× ${_matLabel(k)}`).join(', ');
      const io = document.createElement('div');
      io.className = 'machine-io';
      io.innerHTML = `<span>${costStr} &rarr;</span><span>1× ${_matLabel(sch.output.key)}</span>`;
      body.appendChild(io);

      card.appendChild(body);

      const controls = document.createElement('div');
      controls.className = 'machine-controls';

      const routeBtn = document.createElement('button');
      routeBtn.className = 'btn-process';
      routeBtn.textContent = 'AUTO-ROUTE';
      const canRoute = this.assembly.canAutoRoute(sch.id);
      if (!canRoute && !matched) {
        routeBtn.disabled = true;
        routeBtn.style.opacity = '0.5';
      }
      routeBtn.onclick = () => {
        this.assembly.autoRoute(sch.id);
        this._refreshAssemblyMatrix();
      };
      controls.appendChild(routeBtn);

      const buildBtn = document.createElement('button');
      buildBtn.className = 'btn-automate';
      buildBtn.textContent = 'BUILD';
      if (!matched) {
        buildBtn.disabled = true;
        buildBtn.style.opacity = '0.5';
      }
      buildBtn.onclick = () => {
        if (this.assembly.executeAssembly(sch.id)) this._refreshAssemblyMatrix();
      };
      controls.appendChild(buildBtn);

      card.appendChild(controls);
      el.appendChild(card);
    }
  }

  // ── Inventory Panel (20×2 material grid) ──────────────────────────────────
  _refreshInventory() {
    const el = document.getElementById('inventory-contents');
    if (!el) return;
    el.innerHTML = '';

    const allMatNames = Object.keys(this.inventory.materials);
    const GRID_CELLS = 40; // 20 wide × 2 tall

    // ── Material grid ──
    const matTitle = document.createElement('div');
    matTitle.className = 'panel-subtitle';
    matTitle.textContent = 'Materials (max 99/slot)';
    el.appendChild(matTitle);

    const grid = document.createElement('div');
    grid.className = 'inv-material-grid';
    for (let i = 0; i < GRID_CELLS; i++) {
      const name = allMatNames[i] || null;
      const raw = name ? this.inventory.materials[name] : 0;
      const cell = document.createElement('div');
      cell.className = 'inv-grid-cell' + (name && raw > 0 ? ' has-item' : ' empty-slot');
      if (name && raw > 0) {
        const icon = _makeIcon(name);
        icon.style.width = '82%'; icon.style.height = '82%'; icon.style.fontSize = '0.48rem';
        cell.appendChild(icon);
        const cnt = document.createElement('div');
        cnt.className = 'inv-grid-count';
        cnt.textContent = Math.min(raw, 99);
        cell.appendChild(cnt);
        cell.title = `${_matLabel(name)}: ${raw}`;
      }
      grid.appendChild(cell);
    }
    el.appendChild(grid);

    // ── Storage grid (when container owned) ──
    if (this.inventory.hasTool('storageContainer')) {
      const storTitle = document.createElement('div');
      storTitle.className = 'panel-subtitle';
      storTitle.style.marginTop = '10px';
      storTitle.textContent = 'Storage Container (click cell to withdraw)';
      el.appendChild(storTitle);

      const storGrid = document.createElement('div');
      storGrid.className = 'inv-material-grid';
      for (let i = 0; i < GRID_CELLS; i++) {
        const name = allMatNames[i] || null;
        const count = name ? (this.inventory.storageItems[name] || 0) : 0;
        const cell = document.createElement('div');
        cell.className = 'inv-grid-cell' + (name && count > 0 ? ' has-item' : ' empty-slot');
        if (name && count > 0) {
          const icon = _makeIcon(name);
          icon.style.width = '82%'; icon.style.height = '82%'; icon.style.fontSize = '0.48rem';
          cell.appendChild(icon);
          const cnt = document.createElement('div');
          cnt.className = 'inv-grid-count';
          cnt.textContent = Math.min(count, 99);
          cell.appendChild(cnt);
          cell.title = `${name}: ${count} stored — click to withdraw 1`;
          cell.style.cursor = 'pointer';
          cell.addEventListener('click', () => { this.inventory.withdrawFromStorage(name, 1); this._refreshInventory(); });
        }
        storGrid.appendChild(cell);
      }
      el.appendChild(storGrid);
    }

    // ── Equipment Bag ──
    if (this.inventory.equipmentBag.length > 0) {
      const bagTitle = document.createElement('div');
      bagTitle.className = 'panel-subtitle'; bagTitle.style.marginTop = '10px';
      bagTitle.textContent = 'Equipment Bag'; el.appendChild(bagTitle);
      this.inventory.equipmentBag.forEach((item, idx) => {
        const row = document.createElement('div'); row.className = 'inv-row';
        const nameEl = document.createElement('span'); nameEl.style.flex = '1';
        const tierColor = { Rare:'#cc88ff', Good:'#44aaff', Epic:'#ff8800' }[item.tier] || '#aaffcc';
        nameEl.style.color = tierColor;
        nameEl.textContent = `${item.label} [${item.slot}]${item.tier ? ' ('+item.tier+')' : ''}`;
        const equipBtn = document.createElement('button'); equipBtn.className = 'stat-up-btn';
        equipBtn.textContent = 'Equip';
        equipBtn.addEventListener('click', () => this._equipFromBag(idx));
        row.appendChild(nameEl); row.appendChild(equipBtn); el.appendChild(row);
      });
    }

    // ── Consumables ──
    const cons = this.inventory.getConsumableList();
    if (cons.length > 0) {
      const consTitle = document.createElement('div');
      consTitle.className = 'panel-subtitle'; consTitle.style.marginTop = '10px';
      consTitle.textContent = 'Consumables'; el.appendChild(consTitle);
      for (const c of cons) {
        const row = document.createElement('div'); row.className = 'inv-row';
        row.appendChild(_makeIcon(c.key));
        const nameSpan = document.createElement('span'); nameSpan.style.flex = '1';
        nameSpan.textContent = `${c.label}: x${c.count}`;
        const useBtn = document.createElement('button'); useBtn.className = 'stat-up-btn';
        useBtn.textContent = 'Use';
        const atFullHP = c.heal > 0 && this.stats.currentHP >= this.stats.maxHP;
        useBtn.disabled = c.count <= 0 || atFullHP;
        useBtn.title = atFullHP ? 'HP is already full' : '';
        useBtn.addEventListener('mousedown', () => {
          if (c.heal > 0 && this.stats.currentHP >= this.stats.maxHP) return;
          this.inventory.useConsumable(c.key, this.stats, this.pp);
          this.hpDisplay.textContent = `HP: ${Math.ceil(this.stats.currentHP)} / ${this.stats.maxHP}`;
          this._refreshInventory();
        });
        row.appendChild(nameSpan); row.appendChild(useBtn); el.appendChild(row);
      }
    }
  }

  _equipFromBag(idx) {
    const item = this.inventory.removeFromEquipmentBag(idx);
    if (!item) return;
    const displaced = this.equipment.equip(item);
    if (displaced) this.inventory.addToEquipmentBag(displaced);
    this._refreshInventory();
    this._refreshEquipment();
  }

  // Populate the inventory side-panel inside the crafting modal
  _refreshCraftingInventory() {
    const el = document.getElementById('crafting-inv-contents');
    if (!el) return;
    el.innerHTML = '';
    const mats = this.inventory.getMaterialList();
    if (mats.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'inv-row';
      empty.style.cssText = 'opacity:0.4;padding:4px 8px;';
      empty.textContent = 'Empty';
      el.appendChild(empty);
      return;
    }
    for (const m of mats) {
      const row = document.createElement('div');
      row.className = 'inv-row';
      row.appendChild(_makeIcon(m.name));
      const label = document.createElement('span');
      label.style.fontSize = '0.68rem';
      label.textContent = `${m.name}: ${m.count}`;
      row.appendChild(label);
      el.appendChild(row);
    }
  }

  // ── Crafting Panel ─────────────────────────────────────────────────────────
  _refreshCrafting() {
    // Always sync crafting level so prerequisite locks are current on every open
    this._lastCraftingLevel = this.stats.stats.crafting.level;
    this._refreshCraftingInventory();
    const el = document.getElementById('crafting-contents');
    if (!el) return;
    el.innerHTML = '';

    const recipes = this.crafting.getAvailableRecipes();
    if (recipes.length === 0) {
      el.innerHTML = '<div class="inv-row" style="opacity:0.5">No recipes available</div>';
      return;
    }

    for (const recipe of recipes) {
      const row = document.createElement('div');
      row.className = 'craft-row';

      const info = document.createElement('div');
      info.className = 'craft-info';
      const btn = document.createElement('button');
      btn.className = 'stat-up-btn';

      if (recipe.isLocked) {
        // Show locked recipes greyed out with level requirement
        info.style.opacity = '0.4';
        const matList = Object.entries(recipe.materials).map(([m, q]) => `${_matLabel(m)}×${q}`).join(', ');
        const typeLabel = recipe.type === 'tool' ? ' [Tool]' : recipe.type === 'equipment' ? ' [Equip]' : '';
        info.innerHTML = `<span class="craft-name">${recipe.label}${typeLabel}</span><span class="craft-mats">Crafting Lv ${recipe.minCraftingLevel} needed</span>`;
        btn.textContent = 'Locked';
        btn.disabled = true;
        btn.style.opacity = '0.4';
      } else {
        const matList = Object.entries(recipe.materials).map(([m, q]) => `${_matLabel(m)}×${q}`).join(', ');
        const typeLabel = recipe.type === 'tool' ? ' [Tool]' : recipe.type === 'equipment' ? ' [Equip]' : '';
        info.innerHTML = `<span class="craft-name">${recipe.label}${typeLabel}</span><span class="craft-mats">${matList}</span>`;
        if (recipe.alreadyOwned) {
          btn.textContent = 'Owned';
          btn.disabled = true;
        } else {
          btn.textContent = `Craft (${recipe.craftTime.toFixed(1)}s)`;
          btn.disabled = !recipe.canCraft || this.crafting.isCrafting;
          btn.addEventListener('click', () => {
            this.crafting.startCraft(recipe.id);
            this._refreshCrafting();
          });
        }
      }

      row.appendChild(info);
      row.appendChild(btn);

      // Queue button (for consumables/equipment when already crafting)
      if (!recipe.isLocked && !recipe.alreadyOwned && recipe.canCraft && this.crafting.isCrafting) {
        const qBtn = document.createElement('button');
        qBtn.className = 'stat-up-btn';
        qBtn.style.marginLeft = '4px';
        qBtn.textContent = '+Q';
        qBtn.title = 'Add to queue';
        qBtn.disabled = this.crafting.queueLength >= this.crafting.maxQueueSize;
        qBtn.addEventListener('click', () => {
          this.crafting.queueCraft(recipe.id);
          this._refreshCrafting();
        });
        row.appendChild(qBtn);
      }

      el.appendChild(row);
    }

    // Progress bar
    if (this.crafting.isCrafting) {
      const wrap = document.createElement('div');
      wrap.id = 'craft-progress-wrap';
      wrap.style.cssText = 'margin-top:8px;padding:6px 0;';

      const label = document.createElement('div');
      label.id = 'craft-progress-label';
      label.style.cssText = 'font-size:0.7rem;color:#00ffcc;text-align:center;margin-bottom:4px;';
      const remaining = Math.max(0, this.crafting.craftDuration - this.crafting.craftProgress).toFixed(1);
      label.textContent = `Crafting ${this.crafting.craftingRecipeName}... ${remaining}s`;
      wrap.appendChild(label);

      const track = document.createElement('div');
      track.style.cssText = 'background:#0a1a12;border:1px solid #00ffcc44;border-radius:3px;height:8px;overflow:hidden;';
      const fill = document.createElement('div');
      fill.id = 'craft-progress-fill';
      const pct = this.crafting.craftDuration > 0
        ? Math.min(100, (this.crafting.craftProgress / this.crafting.craftDuration) * 100)
        : 0;
      fill.style.cssText = `background:#00ffcc;height:100%;width:${pct}%;transition:width 0.1s linear;`;
      track.appendChild(fill);
      wrap.appendChild(track);
      el.appendChild(wrap);
    }

    // Queue display
    this._refreshCraftingWithQueue();
  }

  // Live-update the craft progress bar without full re-render
  _updateCraftProgressBar(prog, dur) {
    const fill = document.getElementById('craft-progress-fill');
    const label = document.getElementById('craft-progress-label');
    if (!fill || !label) return;
    const pct = dur > 0 ? Math.min(100, (prog / dur) * 100) : 0;
    fill.style.width = pct + '%';
    const remaining = Math.max(0, dur - prog).toFixed(1);
    label.textContent = `Crafting ${this.crafting.craftingRecipeName}... ${remaining}s`;
  }

  // Called by main.js when crafting completes
  onCraftingComplete() {
    const panel = document.getElementById('crafting-panel');
    if (panel && !panel.hidden) {
      this._refreshCrafting();
    }
  }

  // ── Drone Panel ────────────────────────────────────────────────────────────
  _refreshDrones() {
    const el = document.getElementById('drone-contents');
    if (!el) return;
    el.innerHTML = '';

    const drones = this.drones.getDroneStatus();
    const materials = ['copper', 'timber', 'stone', 'iron', 'fiber', 'quartz', 'silica', 'carbon', 'gold'];

    for (const drone of drones) {
      const card = document.createElement('div');
      card.className = 'drone-card';

      const header = document.createElement('div');
      header.className = 'drone-header';
      header.textContent = `${drone.name} (Eff: ${drone.efficiency})`;
      card.appendChild(header);

      // Material assignment selector
      const select = document.createElement('select');
      select.className = 'drone-select';
      const emptyOpt = document.createElement('option');
      emptyOpt.value = '';
      emptyOpt.textContent = '-- Idle --';
      select.appendChild(emptyOpt);
      for (const mat of materials) {
        const opt = document.createElement('option');
        opt.value = mat;
        opt.textContent = mat;
        if (drone.assignedMaterial === mat) opt.selected = true;
        select.appendChild(opt);
      }
      select.onchange = () => {
        if (select.value) {
          this.drones.assignDrone(drone.id, select.value);
        } else {
          this.drones.unassignDrone(drone.id);
        }
      };
      card.appendChild(select);

      // Upgrade button
      const upBtn = document.createElement('button');
      upBtn.className = 'stat-up-btn';
      upBtn.textContent = `Upgrade (${drone.efficiencyUpgradeCost} PP)`;
      upBtn.onclick = () => {
        this.drones.upgradeDroneEfficiency(drone.id);
        this._refreshDrones();
      };
      card.appendChild(upBtn);

      el.appendChild(card);
    }

    // Buy new drone button
    if (this.drones.canBuyDrone) {
      const buyBtn = document.createElement('button');
      buyBtn.className = 'stat-up-btn drone-buy-btn';
      buyBtn.textContent = `Buy Drone (${this.drones.nextDroneCost} PP)`;
      buyBtn.onclick = () => {
        this.drones.buyNewDrone();
        this._refreshDrones();
      };
      el.appendChild(buyBtn);
    }

    // ── Missions section ──────────────────────────────────────────────────────
    const missionTitle = document.createElement('div');
    missionTitle.className = 'panel-subtitle';
    missionTitle.style.marginTop = '12px';
    missionTitle.textContent = 'Drone Missions';
    el.appendChild(missionTitle);

    const visitedZones = this.gameStats?._visitedZones || new Set();
    const allZones = this.drones.constructor.MISSION_ZONES;
    const idleDrones = this.drones.drones.filter(d => !this.drones.isDroneOnMission(d.id) && !d.assignedMaterial);

    // Active missions (+ Phase E pre-logout queue: chain more legs behind each)
    const activeMissions = this.drones.getMissions().filter(m => !m.done);
    if (activeMissions.length > 0) {
      for (const m of activeMissions) {
        const remaining = Math.max(0, Math.ceil(m.duration - m.elapsed));
        const pct = Math.min(100, (m.elapsed / m.duration) * 100).toFixed(0);
        const drone = this.drones.drones.find(d => d.id === m.droneId);
        const queued = this.drones.queuedMissions(m.droneId);
        const depth = this.drones.missionQueueDepth(m.droneId);
        const row = document.createElement('div');
        row.style.cssText = 'padding:4px 0;border-bottom:1px solid #00cc6622;font-size:0.75rem;display:flex;align-items:center;gap:8px;flex-wrap:wrap;';
        row.innerHTML = `<span style="flex:1;color:#55bb88;">${drone?.name || 'Drone'} → ${allZones[m.zoneName]?.label || m.zoneName}</span><span style="color:#aaa;">${remaining}s</span>`;
        const recallBtn = document.createElement('button');
        recallBtn.className = 'stat-up-btn';
        recallBtn.textContent = 'Recall';
        recallBtn.onclick = () => { this.drones.recallDrone(m.droneId); this._refreshDrones(); };
        row.appendChild(recallBtn);

        // Queue controls: pick a zone, chain it behind the current mission
        const qWrap = document.createElement('span');
        qWrap.style.cssText = 'flex:1 1 100%;display:flex;gap:4px;align-items:center;font-size:0.7rem;color:#557788;';
        const qLabel = document.createElement('span');
        qLabel.textContent = `Queue ${queued.length}/${depth}: ${queued.map(z => allZones[z]?.label || z).join(' → ') || '(empty)'}`;
        qLabel.style.flex = '1';
        qWrap.appendChild(qLabel);
        if (queued.length < depth) {
          const qSelect = document.createElement('select');
          qSelect.className = 'drone-select';
          for (const [key, zone] of Object.entries(allZones)) {
            if (!visitedZones.has(key)) continue;
            const o = document.createElement('option');
            o.value = key;
            o.textContent = zone.label;
            qSelect.appendChild(o);
          }
          const qBtn = document.createElement('button');
          qBtn.className = 'stat-up-btn';
          qBtn.textContent = '+Queue';
          qBtn.onclick = () => { this.drones.queueMission(m.droneId, qSelect.value); this._refreshDrones(); };
          if (qSelect.options.length > 0) { qWrap.appendChild(qSelect); qWrap.appendChild(qBtn); }
        }
        row.appendChild(qWrap);
        el.appendChild(row);
      }
    }

    // Send on mission UI
    if (idleDrones.length > 0) {
      const sendWrap = document.createElement('div');
      sendWrap.style.cssText = 'margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;';

      const droneSelect = document.createElement('select');
      droneSelect.className = 'drone-select';
      for (const d of idleDrones) {
        const o = document.createElement('option');
        o.value = d.id; o.textContent = d.name;
        droneSelect.appendChild(o);
      }

      const zoneSelect = document.createElement('select');
      zoneSelect.className = 'drone-select';
      for (const [key, zone] of Object.entries(allZones)) {
        if (!visitedZones.has(key)) continue;
        const o = document.createElement('option');
        o.value = key;
        o.textContent = `${zone.label} (~${Math.round(zone.duration / 60)}m)`;
        zoneSelect.appendChild(o);
      }

      if (zoneSelect.options.length > 0) {
        const sendBtn = document.createElement('button');
        sendBtn.className = 'stat-up-btn';
        sendBtn.textContent = 'Send';
        sendBtn.onclick = () => {
          this.drones.sendOnMission(Number(droneSelect.value), zoneSelect.value);
          this._refreshDrones();
        };
        sendWrap.appendChild(droneSelect);
        sendWrap.appendChild(zoneSelect);
        sendWrap.appendChild(sendBtn);
        el.appendChild(sendWrap);
      } else {
        const note = document.createElement('div');
        note.style.cssText = 'font-size:0.7rem;color:#556677;margin-top:4px;';
        note.textContent = 'Visit more zones to unlock mission destinations.';
        el.appendChild(note);
      }
    } else if (activeMissions.length === 0) {
      const note = document.createElement('div');
      note.style.cssText = 'font-size:0.7rem;color:#556677;margin-top:4px;';
      note.textContent = 'All drones are busy gathering. Unassign one to send on a mission.';
      el.appendChild(note);
    }
  }

  // ── Pedometer / Steps Shop Panel ───────────────────────────────────────────
  _refreshPedometer() {
    const el = document.getElementById('pedometer-contents');
    if (!el) return;
    el.innerHTML = '';
    const ped = this.pedometer;
    const steps = ped.totalSteps;

    const stepInfo = document.createElement('div');
    stepInfo.className = 'panel-subtitle';
    stepInfo.textContent = `Available Steps: ${steps.toLocaleString()}`;
    el.appendChild(stepInfo);

    // Show current speed so track boost is observable
    const speedBonus = this.stats._trackBonus;
    const baseSpeed = this.stats.moveSpeed - speedBonus;
    const speedInfo = document.createElement('div');
    speedInfo.style.cssText = 'font-size:0.7rem;color:#aaccbb;margin-bottom:6px;text-align:center';
    speedInfo.textContent = speedBonus > 0
      ? `Speed: ${baseSpeed.toFixed(1)} + ${speedBonus.toFixed(1)} track boost = ${this.stats.moveSpeed.toFixed(1)}`
      : `Speed: ${this.stats.moveSpeed.toFixed(1)}`;
    el.appendChild(speedInfo);

    // ── PP Bonus per Step ──
    this._pedometerSection(el, 'PP Bonus / Step');
    const ppRow = this._pedometerShopRow(
      `+${ped.ppBonusPerStep.toFixed(2)} PP/step → +${(ped.ppBonusPerStep + 0.10).toFixed(2)}`,
      `${ped.nextBonusCost} steps`,
      steps >= ped.nextBonusCost,
      () => { ped.buyPPBonus(); this._refreshPedometer(); }
    );
    el.appendChild(ppRow);

    // ── Speed Tracks ──
    const tracksFree = ped.trackCount < 10;
    const trackCostLabel = tracksFree ? `FREE (${10 - ped.trackCount} remaining)` : `${ped.nextTrackCost} steps`;
    this._pedometerSection(el, `Speed Tracks (owned: ${ped.trackCount}${ped.pendingTracks > 0 ? `, ${ped.pendingTracks} unplaced — press T` : ''})`);
    const trackRow = this._pedometerShopRow(
      `Track #${ped.trackCount + 1} (+0.3 speed, place with T)`,
      trackCostLabel,
      ped.canBuyTrack(),
      () => { ped.buyTrack(); this._refreshPedometer(); }
    );
    el.appendChild(trackRow);

    // ── Stat Levels ──
    this._pedometerSection(el, `Stat Level (cost: ${ped.nextStatCost} steps)`);
    const statNames = this.stats.statNames;
    const statLabels = this.stats.statLabels;
    const canAfford = steps >= ped.nextStatCost;
    for (const name of statNames) {
      const row = this._pedometerShopRow(
        `${statLabels[name]} (Lv ${this.stats.stats[name].level} → ${this.stats.stats[name].level + 1})`,
        `${ped.nextStatCost} steps`,
        canAfford,
        () => { ped.buyStatLevel(name, this.stats); this._refreshPedometer(); }
      );
      el.appendChild(row);
    }

    // ── Environment Unlocks ──
    this._pedometerSection(el, 'Environment Unlocks');
    const envOptions = ped.getEnvUnlockOptions();
    const envLabels = { verdantMaw: 'Verdant Maw', lagoonCoast: 'Lagoon Coast', frozenTundra: 'Frozen Tundra' };
    for (const { zone, cost, unlocked } of envOptions) {
      const row = this._pedometerShopRow(
        `${envLabels[zone] || zone}`,
        unlocked ? 'UNLOCKED' : `${cost.toLocaleString()} steps`,
        !unlocked && steps >= cost,
        () => { ped.unlockZone(zone); this._refreshPedometer(); }
      );
      if (unlocked) row.querySelector('button').textContent = 'Owned';
      el.appendChild(row);
    }
  }

  _refreshTechTree() {
    const el = document.getElementById('tech-contents');
    if (!el || !this.techTree) return;
    el.innerHTML = '';
    const systems = { pp: this.pp, pedometer: this.pedometer, inventory: this.inventory };
    for (const node of this.techTree.nodes) {
      const state = this.techTree.getNodeState(node.id, systems);
      const row = document.createElement('div');
      row.className = 'craft-row';
      const info = document.createElement('div');
      info.className = 'craft-info';
      info.innerHTML = `<span class="craft-name">${node.label}</span><span class="craft-mats">${node.description} | ${state.owned ? 'Owned' : state.reason || 'Available'}</span>`;
      const btn = document.createElement('button');
      btn.className = 'stat-up-btn';
      btn.textContent = state.owned ? 'Owned' : 'Unlock';
      btn.disabled = state.owned || state.locked || !state.affordable;
      btn.addEventListener('click', async () => {
        await this.techTree.purchase(node.id, systems);
        this._refreshTechTree();
        this._refreshCrafting();
      });
      row.appendChild(info);
      row.appendChild(btn);
      el.appendChild(row);
    }
  }

  _refreshMastery() {
    const el = document.getElementById('mastery-contents');
    if (!el || !this.mastery) return;
    el.innerHTML = '';
    for (const track of this.mastery.tracks) {
      const progress = this.mastery.progress[track.id] || { xp: 0, level: 1 };
      const row = document.createElement('div');
      row.className = 'craft-row';
      const info = document.createElement('div');
      info.className = 'craft-info';
      const next = track.xpPerLevel * progress.level;
      info.innerHTML = `<span class="craft-name">${track.label} Lv ${progress.level}</span><span class="craft-mats">${progress.xp}/${next} XP | craft time x${this.mastery.getCraftTimeMultiplier(track.id).toFixed(2)}</span>`;
      row.appendChild(info);
      el.appendChild(row);
    }
  }

  setSyncStatus(status) {
    const el = document.getElementById('sync-status');
    if (el) el.textContent = status;
  }

  _pedometerSection(el, title) {
    const h = document.createElement('div');
    h.className = 'panel-subtitle';
    h.style.marginTop = '8px';
    h.textContent = title;
    el.appendChild(h);
  }

  _pedometerShopRow(label, costLabel, canAfford, onBuy) {
    const row = document.createElement('div');
    row.className = 'craft-row';
    const info = document.createElement('div');
    info.className = 'craft-info';
    info.innerHTML = `<span class="craft-name">${label}</span><span class="craft-mats">${costLabel}</span>`;
    const btn = document.createElement('button');
    btn.className = 'stat-up-btn';
    btn.textContent = 'Buy';
    btn.disabled = !canAfford;
    btn.style.touchAction = 'manipulation';
    btn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault(); // cancels the subsequent click on any rebuilt DOM node
      if (btn.disabled) return;
      onBuy();
    });
    row.appendChild(info);
    row.appendChild(btn);
    return row;
  }

  // ── Equipment Panel ────────────────────────────────────────────────────────
  _refreshEquipment() {
    const SLOT_NAMES = { head:'Head', deploy1:'Shoulders', accessory:'Accessory', body:'Torso', weapon:'Arms', legs:'Legs', offhand:'Hands', deploy2:'Feet', consumable:'Consumable' };

    // Update each slot box
    for (const { slot, item } of this.equipment.getEquippedList()) {
      const el = document.getElementById(`equip-slot-${slot}`);
      if (!el) continue;
      el.classList.toggle('equip-slot-active', !!item);
      el.innerHTML = '';
      if (item) {
        const wrap = document.createElement('div'); wrap.className = 'equip-slot-icon-wrap';
        const icon = _makeIcon(item.id || item.outputKey || slot);
        wrap.appendChild(icon); el.appendChild(wrap);
      }
      const nameLbl = document.createElement('span'); nameLbl.className = 'equip-slot-name';
      nameLbl.textContent = SLOT_NAMES[slot] || slot; el.appendChild(nameLbl);
      el.onclick = () => this._showEquipDetail(item, slot, false);
    }

    // Wire search/sort (replacing handler is idempotent)
    const searchEl = document.getElementById('equip-search');
    const sortEl   = document.getElementById('equip-sort');
    if (searchEl) searchEl.oninput  = () => this._refreshEquipBagList();
    if (sortEl)   sortEl.onchange   = () => this._refreshEquipBagList();
    this._refreshEquipBagList();

    // Stats bar (continuously refreshed by _updateEquipStats from update())
    this._updateEquipStats();

    // Bonus section
    const bonusBody = document.getElementById('equip-bonus-body');
    if (bonusBody) {
      const entries = Object.entries(this.equipment.getTotalBonuses()).filter(([, v]) => v !== 0);
      bonusBody.innerHTML = entries.length === 0
        ? 'No active bonuses.'
        : entries.map(([s, v]) => `<div>+${v} ${s.replace(/([A-Z])/g, ' $1')}</div>`).join('');
    }

    // Tools section
    const toolsEl = document.getElementById('equip-tools-section');
    if (toolsEl) {
      toolsEl.innerHTML = '';
      const tools = this.inventory.getToolList();
      if (tools.length > 0) {
        const title = document.createElement('div'); title.className = 'equip-col-title';
        title.style.marginTop = '8px'; title.textContent = 'TOOLS'; toolsEl.appendChild(title);
        const TOOL_LABELS = { terrainCutter:'Terrain Cutter', chargingStation:'Charging Station', storageContainer:'Storage Container', rockDrill:'Rock Drill', harvestBlade:'Harvest Blade', diveTool:'Dive Tool', cryoPick:'Cryo-Pick' };
        for (const key of tools) {
          const row = document.createElement('div'); row.className = 'inv-row';
          row.appendChild(_makeIcon(key));
          const durVal = this.inventory.tools[key];
          const maxDur = this.inventory.constructor.TOOL_MAX_DURABILITY?.[key] ?? null;
          const lbl = document.createElement('span'); lbl.style.fontSize = '0.7rem';
          lbl.textContent = (TOOL_LABELS[key] || key) + (maxDur !== null ? ` (${durVal}/${maxDur})` : '');
          row.appendChild(lbl);
          if (maxDur !== null && durVal < maxDur) {
            const btn = document.createElement('button'); btn.className = 'stat-up-btn';
            btn.textContent = 'Repair'; btn.title = '1 iron + 1 resin';
            btn.addEventListener('click', () => {
              if (!this.inventory.repairTool(key)) this.showInteractHint('Need 1 iron + 1 resin to repair.');
              this._refreshEquipment();
            });
            row.appendChild(btn);
          }
          toolsEl.appendChild(row);
        }
      }
    }
  }

  _updateEquipStats() {
    const hpEl  = document.getElementById('equip-stat-hp');
    const enEl  = document.getElementById('equip-stat-energy');
    const defEl = document.getElementById('equip-stat-defense');
    const wtEl  = document.getElementById('equip-stat-weight');
    if (hpEl)  hpEl.textContent  = `${Math.ceil(this.stats.currentHP)}`;
    if (enEl)  enEl.textContent  = `${Math.ceil(this.stats.currentEnergy)}`;
    if (defEl) defEl.textContent = this.equipment.getTotalBonuses().defense || 0;
    if (wtEl)  wtEl.textContent  = '0/--';
  }

  _refreshEquipBagList() {
    const listEl   = document.getElementById('equip-inv-list');
    const searchEl = document.getElementById('equip-search');
    const sortEl   = document.getElementById('equip-sort');
    if (!listEl) return;
    listEl.innerHTML = '';
    const filter = (searchEl?.value || '').toLowerCase();
    const sort   = sortEl?.value || 'type';
    const TIER_ORDER = { Basic:0, Good:1, Rare:2, Epic:3 };
    let items = [...(this.inventory.equipmentBag || [])];
    if (filter) items = items.filter(it => (it.label || '').toLowerCase().includes(filter));
    if (sort === 'name') items.sort((a, b) => (a.label||'').localeCompare(b.label||''));
    else if (sort === 'tier') items.sort((a, b) => (TIER_ORDER[b.tier]||0) - (TIER_ORDER[a.tier]||0));
    else items.sort((a, b) => (a.slot||'').localeCompare(b.slot||''));
    if (items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'equip-inv-empty';
      empty.innerHTML = '<span class="equip-inv-empty-icon">🧰</span>No items available';
      listEl.appendChild(empty);
      return;
    }
    for (const item of items) {
      const bagIdx = this.inventory.equipmentBag.indexOf(item);
      const row = document.createElement('div');
      row.className = `equip-inv-item tier-${(item.tier||'basic').toLowerCase()}`;
      const icon = _makeIcon(item.id || item.outputKey || 'item');
      icon.style.width = '22px'; icon.style.height = '22px';
      icon.style.fontSize = '0.55rem'; icon.style.flexShrink = '0';
      row.appendChild(icon);
      const lbl = document.createElement('span'); lbl.className = 'equip-inv-item-label';
      lbl.textContent = item.label || item.id || '?'; row.appendChild(lbl);
      const btn = document.createElement('button'); btn.className = 'equip-inv-equip-btn';
      btn.textContent = 'Equip';
      btn.addEventListener('click', e => { e.stopPropagation(); this._equipFromBag(bagIdx); });
      row.appendChild(btn);
      row.addEventListener('click', () => this._showEquipDetail(item, item.slot, true));
      listEl.appendChild(row);
    }
  }

  _showEquipDetail(item, slotKey, fromBag = false) {
    const SLOT_NAMES = { head:'Head', deploy1:'Shoulders', accessory:'Accessory', body:'Torso', weapon:'Arms', legs:'Legs', offhand:'Hands', deploy2:'Feet', consumable:'Consumable' };
    const el = document.getElementById('equip-detail-content');
    if (!el) return;
    if (!item) { el.innerHTML = ''; return; }
    const wrap = document.createElement('div'); wrap.className = 'equip-detail-filled';
    const icon = _makeIcon(item.id || item.outputKey || slotKey);
    icon.style.width = '54px'; icon.style.height = '54px';
    icon.style.fontSize = '1.5rem'; icon.style.margin = '0 auto 10px';
    icon.style.display = 'block';
    wrap.appendChild(icon);
    const nameEl = document.createElement('div');
    nameEl.className = `equip-detail-item-name tier-${(item.tier||'basic').toLowerCase()}`;
    nameEl.textContent = item.label || 'Unknown'; wrap.appendChild(nameEl);
    const slotEl = document.createElement('div'); slotEl.className = 'equip-detail-item-slot';
    slotEl.textContent = `${SLOT_NAMES[slotKey] || slotKey} slot`; wrap.appendChild(slotEl);
    const tierEl = document.createElement('div');
    tierEl.className = `equip-detail-item-tier tier-${(item.tier||'basic').toLowerCase()}`;
    tierEl.textContent = item.tier || 'Basic'; wrap.appendChild(tierEl);
    if (item.statBonuses && Object.keys(item.statBonuses).length > 0) {
      const bonusDiv = document.createElement('div'); bonusDiv.className = 'equip-detail-bonuses';
      for (const [stat, val] of Object.entries(item.statBonuses)) {
        const row = document.createElement('div'); row.className = 'equip-detail-bonus-row';
        row.textContent = `+${val} ${stat.replace(/([A-Z])/g, ' $1')}`; bonusDiv.appendChild(row);
      }
      wrap.appendChild(bonusDiv);
    }
    if (fromBag) {
      const bagIdx = this.inventory.equipmentBag.indexOf(item);
      if (bagIdx >= 0) {
        const btn = document.createElement('button'); btn.className = 'equip-inv-equip-btn';
        btn.style.cssText = 'margin-top:auto;padding:7px 12px;font-size:0.72rem;border-radius:4px';
        btn.textContent = 'Equip';
        btn.addEventListener('click', () => this._equipFromBag(bagIdx));
        wrap.appendChild(btn);
      }
    } else if (item) {
      const btn = document.createElement('button'); btn.className = 'equip-detail-unequip-btn';
      btn.textContent = 'Unequip';
      btn.addEventListener('click', () => {
        const removed = this.equipment.unequip(slotKey);
        if (removed) this.inventory.addToEquipmentBag(removed);
        this._refreshEquipment();
        this._showEquipDetail(null, slotKey);
      });
      wrap.appendChild(btn);
    }
    el.innerHTML = ''; el.appendChild(wrap);
  }

  // ── Gather progress ────────────────────────────────────────────────────────
  showGatherProgress(progress, total) {
    if (this.gatherBar) {
      this.gatherBar.hidden = false;
      const pct = Math.min(100, (progress / total) * 100);
      this.gatherFill.style.width = pct + '%';
      this.gatherText.textContent = `Gathering... ${pct.toFixed(0)}%`;
    }
  }

  hideGatherProgress() {
    if (this.gatherBar) this.gatherBar.hidden = true;
  }

  showInteractHint(text) {
    if (this.interactHint) {
      this.interactHint.hidden = false;
      this.interactHint.textContent = text;
    }
  }

  hideInteractHint() {
    if (this.interactHint) this.interactHint.hidden = true;
  }

  setZoneLabel(name) {
    if (this.zoneLabel) this.zoneLabel.textContent = name;
  }


  // ── Frame update ───────────────────────────────────────────────────────────
  // ── Session stats + PP milestone pulse (number-go-up feedback) ────────────
  _updateSessionStats(pp) {
    // Accumulate only gains — offloads/spends reset the baseline without deducting
    if (this._lastPPTotal !== null && pp > this._lastPPTotal) {
      this._sessionPP += pp - this._lastPPTotal;
    }
    this._lastPPTotal = pp;

    if (this._sessionPP >= 1) {
      const el = document.getElementById('session-stats');
      if (el) {
        el.hidden = false;
        const ppEl = document.getElementById('session-pp');
        const timeEl = document.getElementById('session-time');
        if (ppEl) ppEl.textContent = `${abbrevNum(Math.floor(this._sessionPP))} PP`;
        if (timeEl) {
          const mins = Math.floor((Date.now() - this._sessionStart) / 60000);
          timeEl.textContent = mins < 60 ? `· ${mins}m` : `· ${Math.floor(mins / 60)}h ${mins % 60}m`;
        }
      }
    }

    // Pulse the counter each time PP crosses another 10% of cap; gold when full
    const cap = this.pp.ppCap || 1;
    const decile = Math.min(10, Math.floor((pp / cap) * 10));
    if (this.ppDisplay) {
      if (decile > this._lastPPDecile && this._lastPPDecile >= 0) {
        this.ppDisplay.classList.remove('pp-pulse');
        void this.ppDisplay.offsetWidth; // restart the CSS animation
        this.ppDisplay.classList.add('pp-pulse');
        clearTimeout(this._ppPulseTimer);
        this._ppPulseTimer = setTimeout(() => this.ppDisplay.classList.remove('pp-pulse'), 800);
      }
      this.ppDisplay.classList.toggle('pp-capped', pp >= cap);
    }
    this._lastPPDecile = decile;
  }

  update(now) {
    if (now - this._lastUpdate < this._throttleMs) return;
    this._lastUpdate = now;

    // Live-refresh the allocation panel while it's open (invested values tick up)
    const allocPanel = document.getElementById('allocation-panel');
    if (allocPanel && !allocPanel.hidden) this._refreshAllocation();

    const pp = this.pp.displayTotal;
    const effRate = this.pp.effectiveRate ?? this.pp.ppRate;
    if (this.ppAmount) this.ppAmount.textContent = `${abbrevNum(pp)} / ${abbrevNum(this.pp.ppCap)}`;
    this.ppRate.textContent = `(+${effRate.toFixed(1)}/s)`;
    this._updateSessionStats(pp);

    // Data Core sampler — one PP/s sample every 2s, 10-minute window
    if (now - this._lastSampleAt >= 2000) {
      this._lastSampleAt = now;
      this._ppSamples.push({ rate: effRate });
      if (this._ppSamples.length > 300) this._ppSamples.shift();
      if (effRate > this._peakRate) this._peakRate = effRate;
    }

    // Live-refresh the new idle panels while open (1s cadence — they have buttons)
    if (!this._slowRefreshAt || now - this._slowRefreshAt >= 1000) {
      this._slowRefreshAt = now;
      this._refreshTabUnlocks();
      for (const [id, fn] of [
        ['expedition-panel', () => this._refreshExpedition()],
        ['challenges-panel', () => this._refreshChallenges()],
        ['implant-panel',    () => this._refreshImplant()],
        ['ascension-panel',  () => this._refreshAscension()],
      ]) {
        const p = document.getElementById(id);
        if (p && !p.hidden) fn();
      }
    }
    const dataPanel = document.getElementById('data-panel');
    if (dataPanel && !dataPanel.hidden) this._refreshDataCore();

    // Rate tooltip — per-min / per-hour Achievement Counter (IIC §2)
    const rateSec = document.getElementById('rate-sec');
    const rateMin = document.getElementById('rate-min');
    const rateHr  = document.getElementById('rate-hr');
    if (rateSec) rateSec.textContent = formatRate(effRate, 'sec');
    if (rateMin) rateMin.textContent = formatRate(effRate, 'min');
    if (rateHr)  rateHr.textContent  = formatRate(effRate, 'hour');

    // Crystal counter (only show if any earned)
    const crystalDisplay = document.getElementById('crystal-display');
    const crystalAmount = document.getElementById('crystal-amount');
    const tw = this.opt?.timeWarp;
    if (crystalDisplay && tw) {
      if (tw.crystals > 0 || tw.warpsUsed > 0) {
        crystalDisplay.hidden = false;
        if (crystalAmount) crystalAmount.textContent = tw.crystals;
      }
    }

    const prestigeEl = document.getElementById('prestige-display');
    if (prestigeEl) prestigeEl.textContent = `${Math.round(this.pp.ppCap * 100) / 100} max`;

    this.hpDisplay.textContent = `HP: ${Math.ceil(this.stats.currentHP)} / ${this.stats.maxHP}`;
    this.energyDisplay.textContent = `Energy: ${Math.ceil(this.stats.currentEnergy)} / ${this.stats.maxEnergy}`;

    // Live equipment-panel stats while it's open
    const equipPanel = document.getElementById('equipment-panel');
    if (equipPanel && !equipPanel.hidden) this._updateEquipStats();
    if (this.stepsAmount) this.stepsAmount.textContent = abbrevNum(this.pedometer.totalSteps);
    else this.stepsDisplay.textContent = `Steps: ${this.pedometer.totalSteps.toLocaleString()}`;

    // Refresh stat levels
    const rows = this.statList.querySelectorAll('.stat-row');
    rows.forEach(row => {
      const name = row.dataset.stat;
      const lvlEl = row.querySelector('.stat-level');
      const btn = row.querySelector('.stat-up-btn');
      lvlEl.textContent = `Lv ${this.stats.stats[name].level}`;
      const cost = this.stats.upgradeCost(name);
      btn.textContent = `+${cost}`;
      btn.disabled = this.pp.ppTotal < cost;
    });

    // Refresh open panels periodically
    const invPanel = document.getElementById('inventory-panel');
    if (invPanel && !invPanel.hidden) this._refreshInventory();

    // Crafting panel: always refresh inventory section; rebuild recipes if crafting level changed
    const craftPanel = document.getElementById('crafting-panel');
    if (craftPanel && !craftPanel.hidden) {
      const curCraftLevel = this.stats.stats.crafting.level;
      if (curCraftLevel !== this._lastCraftingLevel) {
        this._lastCraftingLevel = curCraftLevel;
        this._refreshCrafting();
      } else {
        this._refreshCraftingInventory();
      }
    }

    const dronePanel = document.getElementById('drone-panel');
    if (dronePanel && !dronePanel.hidden) {
      const droneContents = document.getElementById('drone-contents');
      if (!droneContents || !droneContents.contains(document.activeElement)) {
        this._refreshDrones();
      }
    }

    const pedPanel = document.getElementById('pedometer-panel');
    if (pedPanel && !pedPanel.hidden) this._refreshPedometer();

    this._refreshActivityTimers();

    // Update minigame bar if active
    this._updateMinigameBar();

    // Update auto-combat indicator
    const acInd = document.getElementById('auto-combat-indicator');
    if (acInd) acInd.hidden = !this.autoCombat.enabled;

    // Update minigame cooldown text
    const mgBtn = document.getElementById('btn-toggle-minigame');
    if (mgBtn && this.minigame) {
      if (this.minigame.active) {
        mgBtn.textContent = 'FOCUS!';
        mgBtn.style.borderColor = '#ffcc00';
        mgBtn.style.color = '#ffcc00';
      } else if (this.minigame.cooldownRemaining > 0) {
        mgBtn.textContent = `GAME ${Math.ceil(this.minigame.cooldownRemaining)}s`;
        mgBtn.style.borderColor = '#555';
        mgBtn.style.color = '#777';
      } else {
        mgBtn.textContent = 'GAME';
        mgBtn.style.borderColor = '#ffcc00';
        mgBtn.style.color = '#ffcc00';
      }
    }
  }

  // ── Activity Timers (top right) ─────────────────────────────────────────
  _refreshActivityTimers() {
    const el = document.getElementById('activity-timers');
    if (!el) return;
    const missions = this.drones?.getMissions().filter(m => !m.done) ?? [];
    if (missions.length === 0) { el.innerHTML = ''; return; }
    el.innerHTML = missions.map(m => {
      const zone = m.zoneName ? (this.drones.constructor.MISSION_ZONES[m.zoneName]?.label ?? m.zoneName) : '?';
      const drone = this.drones.drones.find(d => d.id === m.droneId);
      const label = drone ? `${drone.name}` : `Drone ${m.droneId}`;
      const remaining = Math.max(0, m.duration - m.elapsed);
      const pct = Math.min(100, (m.elapsed / m.duration) * 100).toFixed(1);
      const mins = Math.floor(remaining / 60);
      const secs = Math.floor(remaining % 60).toString().padStart(2, '0');
      const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
      return `<div class="activity-timer-card">
        <div class="activity-timer-label">${label}</div>
        <div>${zone} — ${timeStr}</div>
        <div class="activity-timer-bar"><div class="activity-timer-fill" style="width:${pct}%"></div></div>
      </div>`;
    }).join('');
  }

  // ── Drone Mission Toast ──────────────────────────────────────────────────
  showDroneToast({ drone, zone, loot }) {
    const toast = document.getElementById('drone-toast');
    if (!toast) return;
    document.getElementById('drone-toast-title').textContent = `${drone} returned from ${zone}`;
    const lootLines = Object.entries(loot).map(([m, q]) => `+${q} ${m}`).join('\n');
    document.getElementById('drone-toast-loot').textContent = lootLines || 'Nothing found.';
    toast.hidden = false;
    toast.classList.remove('toast-exit');
    toast.classList.add('toast-enter');
    clearTimeout(this._droneToastTimer);
    this._droneToastTimer = setTimeout(() => {
      toast.classList.remove('toast-enter');
      toast.classList.add('toast-exit');
      setTimeout(() => { toast.hidden = true; toast.classList.remove('toast-exit'); }, 500);
    }, 4000);
  }

  // ── Offline Progress Banner ─────────────────────────────────────────────
  showOfflineBanner(summary) {
    const banner = document.getElementById('offline-banner');
    if (!banner) return;
    const content = document.getElementById('offline-content');
    if (content) {
      // Per-system rows: what RAN vs what sat DORMANT (teaches the pre-logout puzzle)
      const rowHTML = (summary.rows && summary.rows.length)
        ? `<div style="margin-top:6px;padding-top:6px;border-top:1px solid #00ffcc33;">
             ${summary.rows.map(r => `
               <div style="font-size:0.74rem;margin-top:2px;">
                 <span style="color:${r.ran ? '#44ffaa' : '#888'};">${r.ran ? '▸' : '▪'} ${r.label}</span>
                 <span style="color:${r.ran ? '#aaccbb' : '#cc8855'};"> — ${r.detail}</span>
               </div>`).join('')}
           </div>`
        : '';
      const highlightHTML = (summary.highlights && summary.highlights.length)
        ? `<div style="margin-top:6px;padding-top:6px;border-top:1px solid #00ffcc33;">
             ${summary.highlights.map(h => `<div style="color:#ffcc66;font-size:0.74rem;margin-top:2px;">${h}</div>`).join('')}
           </div>`
        : '';
      content.innerHTML = `
        <div style="font-size:1rem;font-weight:bold;color:#00ffcc;margin-bottom:8px;">WELCOME BACK</div>
        <div style="color:#aaccbb;font-size:0.8rem;margin-bottom:4px;">Time away: ${summary.timeAway}</div>
        <div style="color:#44ffaa;font-size:0.85rem;margin-bottom:4px;">+${formatBig(summary.ppGained)} PP core feed</div>
        <div style="color:#aaccbb;font-size:0.75rem;">Hauled in: ${summary.matSummary}</div>
        ${rowHTML}
        ${highlightHTML}
      `;
    }
    banner.hidden = false;
    setTimeout(() => { banner.hidden = true; }, 15000);
  }

  // ── Achievement Toast ───────────────────────────────────────────────────
  showAchievementToast(ach) {
    this._toastQueue.push(ach);
    if (!this._toastActive) this._processToastQueue();
  }

  _processToastQueue() {
    if (this._toastQueue.length === 0) { this._toastActive = false; return; }
    this._toastActive = true;
    const ach = this._toastQueue.shift();

    const toast = document.getElementById('achievement-toast');
    if (!toast) { this._toastActive = false; return; }
    const icon = document.getElementById('ach-toast-icon');
    const label = document.getElementById('ach-toast-label');
    const desc = document.getElementById('ach-toast-desc');
    const reward = document.getElementById('ach-toast-reward');

    if (icon) icon.textContent = ach.icon;
    if (label) label.textContent = ach.label;
    if (desc) desc.textContent = ach.desc;
    if (reward) reward.textContent = ach.reward > 0 ? `+${ach.reward} PP` : '';

    toast.hidden = false;
    toast.classList.remove('toast-exit');
    toast.classList.add('toast-enter');

    setTimeout(() => {
      toast.classList.remove('toast-enter');
      toast.classList.add('toast-exit');
      setTimeout(() => {
        toast.hidden = true;
        toast.classList.remove('toast-exit');
        this._processToastQueue();
      }, 500);
    }, 3000);
  }

  // ── Auto-Combat Status ──────────────────────────────────────────────────
  showAutoCombatStatus(on) {
    const ind = document.getElementById('auto-combat-indicator');
    if (ind) ind.hidden = !on;
  }

  // ── Minigame ────────────────────────────────────────────────────────────
  _wireMinigameButton() {
    const btn = document.getElementById('btn-toggle-minigame');
    if (!btn || !this.minigame) return;
    btn.addEventListener('click', () => {
      if (this.minigame.active) {
        const result = this.minigame.hit();
        if (result) this._showMinigameResult(result);
      } else if (this.minigame.canPlay()) {
        this.minigame.start();
        const bar = document.getElementById('minigame-bar');
        if (bar) bar.hidden = false;
      }
    });
  }

  _updateMinigameBar() {
    const bar = document.getElementById('minigame-bar');
    const cursor = document.getElementById('minigame-cursor');
    if (!bar || !cursor || !this.minigame) return;

    if (!this.minigame.active) {
      bar.hidden = true;
      return;
    }
    bar.hidden = false;
    cursor.style.left = (this.minigame.cursor * 100) + '%';
  }

  _showMinigameResult(result) {
    const bar = document.getElementById('minigame-bar');
    if (bar) bar.hidden = true;

    const colors = { PERFECT: '#ffcc00', GOOD: '#44ffaa', OK: '#aaccbb', MISS: '#ff4444' };
    this.showAchievementToast({
      icon: '🎯',
      label: result.zone,
      desc: `${result.multiplier}x multiplier`,
      reward: result.ppAwarded,
    });
  }

  // ── Achievements Panel ──────────────────────────────────────────────────
  _wireAchievementsButton() {
    const btn = document.getElementById('btn-toggle-achievements');
    const panel = document.getElementById('achievements-panel');
    if (!btn || !panel) return;
    btn.addEventListener('click', () => {
      const shouldOpen = panel.hidden;
      this._closeCommandPanels('achievements-panel');
      panel.hidden = !shouldOpen;
      if (!panel.hidden) this._refreshAchievements();
    });
  }

  // ── Augmentations Panel ──────────────────────────────────────────────────────
  _wireAugmentationsButton() {
    const btn = document.getElementById('btn-toggle-augmentations-panel');
    const panel = document.getElementById('augmentations-panel');
    if (!btn || !panel) return;
    btn.addEventListener('click', () => {
      const shouldOpen = panel.hidden;
      this._closeCommandPanels('augmentations-panel');
      panel.hidden = !shouldOpen;
      if (!panel.hidden) this._refreshAugmentations();
    });
  }

  _refreshAugmentations() {
    const el = document.getElementById('augmentations-contents');
    if (!el || !this.augmentations) return;
    el.innerHTML = '';

    const aug = this.augmentations;
    const header = document.createElement('div');
    header.style.cssText = 'text-align:center;color:#cc88ff;font-size:0.75rem;margin-bottom:8px;';
    header.textContent = `Installed: ${aug.ownedCount} / ${aug.totalCount}`;
    el.appendChild(header);

    const categories = [...new Set(aug.constructor.ALL.map(a => a.category))];
    for (const cat of categories) {
      const catTitle = document.createElement('div');
      catTitle.className = 'panel-subtitle'; catTitle.style.marginTop = '8px';
      catTitle.textContent = cat; el.appendChild(catTitle);

      for (const augDef of aug.constructor.ALL.filter(a => a.category === cat)) {
        const owned = aug.has(augDef.id);
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid #cc88ff22;';

        const info = document.createElement('div');
        info.style.flex = '1';
        info.innerHTML = `<div style="color:${owned ? '#cc88ff' : '#aaaaaa'};font-size:0.8rem;">${augDef.label}${owned ? ' ✓' : ''}</div><div style="color:#556677;font-size:0.7rem;">${augDef.desc}</div>`;
        row.appendChild(info);

        if (!owned) {
          const btn = document.createElement('button');
          btn.className = 'stat-up-btn';
          btn.style.borderColor = '#cc88ff44'; btn.style
.color = '#cc88ff88';
          btn.textContent = `${aug.getCost(augDef.id)} PP`;
          btn.title = `Unlock: ${augDef.label}`;
          btn.addEventListener('click', () => {
            if (aug.purchase(augDef.id, { pp: this.pp })) {
              this._refreshAugmentations();
            }
          });
          row.appendChild(btn);
        }
        el.appendChild(row);
      }
    }
  }

  // ── Codex ─────────────────────────────────────────────────────────────────
  _refreshCodex() {
    if (!this.codex) return;
    const el = document.getElementById('codex-contents');
    if (!el) return;
    el.innerHTML = '';

    const entries = this.codex.getEntries();
    const discovered = this.codex.discoveredCount;
    const total = this.codex.totalCount;
    const pct = total > 0 ? (discovered / total * 100) : 0;

    const header = document.createElement('div');
    header.className = 'codex-progress';
    header.innerHTML = `
      <span class="codex-progress-label">DISCOVERED ${discovered} / ${total}</span>
      <div class="codex-progress-track"><div class="codex-progress-fill" style="width:${pct.toFixed(1)}%"></div></div>
    `;
    el.appendChild(header);

    const CATEGORY_ORDER  = ['Material', 'Component', 'Crafted', 'Enemy', 'Boss', 'Lore'];
    const CATEGORY_LABELS = {
      Material: 'MATERIALS', Component: 'FACTORY COMPONENTS', Crafted: 'FABRICATIONS',
      Enemy: 'HOSTILES', Boss: 'ZONE BOSSES', Lore: 'DISCOVERIES',
    };
    const CATEGORY_GLYPHS = { Enemy: '🤖', Boss: '👑', Lore: '📜' }; // fallback for categories without item art

    for (const cat of CATEGORY_ORDER) {
      const catEntries = entries.filter(e => e.category === cat);
      if (catEntries.length === 0) continue;
      const catDone = catEntries.filter(e => e.discovered).length;

      const title = document.createElement('div');
      title.className = 'codex-cat-title';
      title.innerHTML = `<span>${CATEGORY_LABELS[cat] || cat.toUpperCase()}</span><span class="codex-cat-count">${catDone}/${catEntries.length}</span>`;
      el.appendChild(title);

      const grid = document.createElement('div');
      grid.className = 'codex-grid';
      for (const entry of catEntries) {
        const card = document.createElement('div');
        card.className = 'codex-card' + (entry.discovered ? '' : ' undiscovered');

        const iconWrap = document.createElement('div');
        iconWrap.className = 'codex-card-icon';
        if (entry.icon || CATEGORY_GLYPHS[cat]) {
          iconWrap.textContent = entry.icon || CATEGORY_GLYPHS[cat];
        } else {
          const icon = _makeIcon(entry.key);
          icon.style.width = '34px'; icon.style.height = '34px'; icon.style.fontSize = '0.7rem';
          iconWrap.appendChild(icon);
        }
        card.appendChild(iconWrap);

        const info = document.createElement('div');
        info.className = 'codex-card-info';
        const name = document.createElement('div');
        name.className = 'codex-card-name';
        name.textContent = entry.discovered ? entry.label : '???';
        const flavor = document.createElement('div');
        flavor.className = 'codex-card-flavor';
        flavor.textContent = entry.discovered ? entry.flavor : 'Not yet discovered.';
        info.appendChild(name); info.appendChild(flavor);
        card.appendChild(info);

        grid.appendChild(card);
      }
      el.appendChild(grid);
    }
  }

  // ── Stubs ─────────────────────────────────────────────────────────────────
  // Panels that were scaffolded in HTML/dispatch but never had their wire/refresh
  // methods written. Stubs prevent constructor + panel-open crashes while leaving
  // the panels in their existing non-functional state.
  _wireCodexButton()      {}
  _wireAscensionButton()  {}

  // ── Recompile terminal (Spaceship) — the rebirth + Archive shop ─────────
  _refreshAscension() {
    const el = document.getElementById('ascension-contents');
    const asc = this.ascension;
    if (!el || !asc) return;
    el.innerHTML = '';

    const unlocked = asc.recompileUnlocked;
    const gain = asc.recompileGain;
    const mActive = asc.momentumActive;

    // The live NUMBER — gold when momentum is active ("now is a good time")
    const card = document.createElement('div');
    card.className = 'fieldops-status';
    card.style.borderColor = '#cc88ff55';
    card.innerHTML = `
      <div class="fieldops-title" style="color:#cc88ff">RECOMPILE — RUN ${asc.ascensionCount + 1}</div>
      <div style="text-align:center;font-size:28px;padding:6px 0;color:${mActive ? '#ffd700' : '#cc88ff'};text-shadow:0 0 12px ${mActive ? '#ffd70066' : '#cc88ff44'};">◈ ${abbrevNum(gain)}</div>
      <div style="text-align:center;font-size:10px;color:#888;margin-bottom:6px;">ARCHIVE DATA ON RECOMPILE</div>
      <div class="fieldops-row"><span>Base — peak T${asc.peakTierThisRun + 1} × ${1 + asc.wardensThisRun} wardens</span><span>◈ ${abbrevNum(asc.archiveNext)}</span></div>
      <div class="fieldops-row"><span>Momentum</span><span style="color:${mActive ? '#ffd700' : '#666'}">${mActive ? '×' + asc.momentum.toFixed(2) + ' ACTIVE' : 'DORMANT — 2h online or beat a warden'}</span></div>
      <div class="fieldops-row"><span>Watermark bonus</span><span>${asc.watermarkBonus > 0 ? `◈ ${abbrevNum(asc.watermarkBonus)} — new best tier!` : `— (best ever T${asc.bestTierEver + 1})`}</span></div>
      <div class="fieldops-row"><span>Fragments banked</span><span style="color:#c9a2ff">◈ ${abbrevNum(asc.fragmentsBanked)}</span></div>
      <div class="fieldops-row"><span>Run time (online)</span><span>${Math.floor(asc.runHours)}h ${Math.floor((asc.runSeconds % 3600) / 60)}m</span></div>
    `;
    el.appendChild(card);

    // Two-tap confirm — armed state lives on the instance so the 1s
    // live-refresh doesn't disarm it.
    const btn = document.createElement('button');
    btn.className = 'construct-buy-btn';
    if (!unlocked) {
      btn.textContent = '🔒 BEAT A SECTOR WARDEN TO UNLOCK';
      btn.disabled = true;
    } else if (gain < 1) {
      btn.textContent = 'NOTHING TO ARCHIVE — CLIMB THE LADDER';
      btn.disabled = true;
    } else if (this._recompileArmed) {
      btn.textContent = `⚠ CONFIRM — RESETS PP, CAP & LADDER (+◈ ${abbrevNum(gain)})`;
      btn.style.borderColor = '#ffd700';
      btn.style.color = '#ffd700';
    } else {
      btn.textContent = `◈ RECOMPILE (+${abbrevNum(gain)} ARCHIVE)`;
    }
    btn.addEventListener('click', () => {
      if (!this._recompileArmed) { this._recompileArmed = true; this._refreshAscension(); return; }
      this._recompileArmed = false;
      asc.ascend();
      this._refreshAscension();
    });
    el.appendChild(btn);

    const note = document.createElement('div');
    note.style.cssText = 'font-size:9px;color:#777;margin:6px 0;line-height:1.5;';
    note.textContent = 'Resets: PP pool · base cap · ladder tiers, wardens, keys. Keeps: stats · gear · materials · story bosses · tripartite · Archive & shop levels.';
    el.appendChild(note);

    // Archive shop — levels persist forever (watermarked; never lost)
    const head = document.createElement('div');
    head.className = 'fieldops-section-head';
    head.innerHTML = `ARCHIVE SHOP — <span style="color:#cc88ff">◈ ${abbrevNum(asc.archive)}</span>`;
    el.appendChild(head);
    for (const u of asc.getUpgrades()) {
      const row = document.createElement('div');
      row.className = 'fieldops-status';
      row.style.padding = '6px 8px';
      row.innerHTML = `
        <div class="fieldops-row"><span>${u.label} <span style="color:#666">Lv ${u.level}</span></span><span>${u.value}</span></div>
        <div style="font-size:9px;color:#888;">${u.desc}</div>
      `;
      const buy = document.createElement('button');
      buy.className = 'construct-buy-btn';
      buy.style.cssText = 'margin-top:4px;padding:3px 8px;';
      buy.textContent = `BUY — ◈ ${abbrevNum(u.cost)}`;
      buy.disabled = asc.archive < u.cost;
      buy.addEventListener('click', () => { asc.buyUpgrade(u.id); this._refreshAscension(); });
      row.appendChild(buy);
      el.appendChild(row);
    }
  }

}
