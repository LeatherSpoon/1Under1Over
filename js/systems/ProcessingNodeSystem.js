// NODE_DEFS: static recipe definitions for each processing node type.
// duration = baseDuration / 2^(tier-1) — halves each tier upgrade.
const NODE_DEFS = {
  quantumCrusher: {
    label: 'Quantum Crusher',
    description: 'Grinds iron into refined dust at double yield.',
    input: { iron: 2 },
    output: { iron_dust: 3 },
    baseDuration: 8,
    upgradeCosts: [500, 2000, 8000],
  },
  plasmaForge: {
    label: 'Plasma Forge',
    description: 'Fuses dust into solid alloy bars.',
    input: { iron_dust: 3 },
    output: { alloy_bar: 1 },
    baseDuration: 12,
    upgradeCosts: [500, 2000, 8000],
  },
  nanoLathe: {
    label: 'Nano-Lathe',
    description: 'Shapes alloy bars into structural struts.',
    input: { alloy_bar: 1 },
    output: { metal_strut: 2 },
    baseDuration: 10,
    upgradeCosts: [750, 3000, 12000],
  },
  molecularPress: {
    label: 'Molecular Press',
    description: 'Flattens alloy bars into hull plating.',
    input: { alloy_bar: 1 },
    output: { hull_plating: 1 },
    baseDuration: 10,
    upgradeCosts: [750, 3000, 12000],
  },
  wireExtruder: {
    label: 'Wire-Extruder',
    description: 'Draws hull plating into conductor cable.',
    input: { hull_plating: 1 },
    output: { data_cable: 2 },
    baseDuration: 8,
    upgradeCosts: [1000, 4000, 16000],
  },
  microCutter: {
    label: 'Micro-Cutter',
    description: 'Cuts struts into high-volume micro-fasteners.',
    input: { metal_strut: 1 },
    output: { micro_fastener: 4 },
    baseDuration: 6,
    upgradeCosts: [500, 2000, 8000],
  },
  isotopeMixer: {
    label: 'Isotope Mixer',
    description: 'Up-cycles base elements into alloy via synthesis.',
    input: { copper: 2, iron: 1 },
    output: { alloy_bar: 1 },
    baseDuration: 15,
    upgradeCosts: [1500, 6000, 24000],
  },
  entropyBoiler: {
    label: 'Entropy Boiler',
    description: 'Recycles alloy back into refined dust via controlled decay.',
    input: { alloy_bar: 1 },
    output: { iron_dust: 2 },
    baseDuration: 8,
    upgradeCosts: [500, 2000, 8000],
  },
};

export class ProcessingNodeSystem {
  static get NODE_DEFS() { return NODE_DEFS; }

  constructor(inventorySystem, ppSystem) {
    this.inventory = inventorySystem;
    this.pp = ppSystem;
    this.maxQueueSize = 5;

    this._nodes = {};
    for (const id of Object.keys(NODE_DEFS)) {
      this._nodes[id] = {
        tier: 1,
        active: null,  // { progress, duration } while processing
        queue: [],     // pending jobs waiting to start
        totalCompleted: 0,
      };
    }

    this.onNodeComplete = null;  // fn(nodeType, outputKey, qty)
    this.onNodeUpdate = null;    // fn() — any state change
  }

  // ── Queries ─────────────────────────────────────────────────────────────────

  canProcess(nodeType) {
    const def = NODE_DEFS[nodeType];
    if (!def) return false;
    return this.inventory.hasMaterials(def.input);
  }

  getUpgradeCost(nodeType) {
    const def = NODE_DEFS[nodeType];
    const node = this._nodes[nodeType];
    if (!def || !node) return null;
    // tier is 1-indexed; upgradeCosts[0] is cost to go from tier 1 → 2
    const idx = node.tier - 1;
    return def.upgradeCosts[idx] ?? null;
  }

  getState(nodeType) {
    return this._nodes[nodeType] ?? null;
  }

  getDef(nodeType) {
    return NODE_DEFS[nodeType] ?? null;
  }

  // ── Actions ─────────────────────────────────────────────────────────────────

  enqueue(nodeType) {
    const node = this._nodes[nodeType];
    const def = NODE_DEFS[nodeType];
    if (!node || !def) return false;
    if (node.queue.length >= this.maxQueueSize) return false;
    if (!this.inventory.hasMaterials(def.input)) return false;

    // Consume inputs immediately on queue entry (same pattern as CraftingSystem)
    for (const [mat, qty] of Object.entries(def.input)) {
      this.inventory.removeMaterial(mat, qty);
    }

    node.queue.push({});
    if (this.onNodeUpdate) this.onNodeUpdate();

    if (!node.active) this._startNext(nodeType);
    return true;
  }

  upgrade(nodeType) {
    const cost = this.getUpgradeCost(nodeType);
    if (cost === null) return false;
    if (!this.pp.spend(cost)) return false;
    this._nodes[nodeType].tier++;
    if (this.onNodeUpdate) this.onNodeUpdate();
    return true;
  }

  // ── Tick ────────────────────────────────────────────────────────────────────

  update(delta) {
    let anyChange = false;
    for (const nodeType of Object.keys(this._nodes)) {
      const node = this._nodes[nodeType];
      if (!node.active) continue;
      node.active.progress += delta;
      if (node.active.progress >= node.active.duration) {
        this._completeJob(nodeType);
        anyChange = true;
      }
    }
    if (anyChange && this.onNodeUpdate) this.onNodeUpdate();
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  _calcDuration(baseDuration, tier) {
    return baseDuration / Math.pow(2, tier - 1);
  }

  _startNext(nodeType) {
    const node = this._nodes[nodeType];
    if (node.queue.length === 0) return;
    node.queue.shift();
    const def = NODE_DEFS[nodeType];
    node.active = {
      progress: 0,
      duration: this._calcDuration(def.baseDuration, node.tier),
    };
  }

  _completeJob(nodeType) {
    const node = this._nodes[nodeType];
    const def = NODE_DEFS[nodeType];
    node.active = null;
    node.totalCompleted++;

    for (const [mat, qty] of Object.entries(def.output)) {
      this.inventory.addMaterial(mat, qty);
      if (this.onNodeComplete) this.onNodeComplete(nodeType, mat, qty);
    }

    // Auto-start next queued job
    if (node.queue.length > 0) this._startNext(nodeType);
  }

  // ── Serialization ────────────────────────────────────────────────────────────

  serialize() {
    const nodes = {};
    for (const [id, state] of Object.entries(this._nodes)) {
      nodes[id] = {
        tier: state.tier,
        totalCompleted: state.totalCompleted,
      };
    }
    return { nodes };
  }

  deserialize(data) {
    if (!data?.nodes) return;
    for (const [id, saved] of Object.entries(data.nodes)) {
      if (!this._nodes[id]) continue;
      this._nodes[id].tier = saved.tier ?? 1;
      this._nodes[id].totalCompleted = saved.totalCompleted ?? 0;
    }
  }
}
