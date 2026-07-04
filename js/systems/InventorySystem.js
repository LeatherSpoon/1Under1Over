import { CONFIG } from '../config.js';

const CONSUMABLE_DEFS = {
  ration:        { label: 'Ration',          heal: 20,  cures: null },
  firstAid:      { label: 'First Aid',       heal: 60,  cures: null },
  repairKit:     { label: 'Repair Kit',      heal: 100, cures: null },
  antidote:      { label: 'Antidote',        heal: 0,   cures: 'poison' },
  ironPatch:     { label: 'Iron Patch',      heal: 30,  cures: null },
  signalFlare:   { label: 'Signal Flare',    heal: 0,   cures: null, ppBoost: { rate: 2.0, duration: 30 } },
  energyCell:    { label: 'Energy Cell',     heal: 0,   cures: null, energy: 50 },
  overchargeCell:{ label: 'Overcharge Cell', heal: 0,   cures: null, energy: 100 },
  dataCache:     { label: 'Data Cache',      heal: 0,   cures: null, pp: 50 },
};

const MATERIAL_NAMES = [
  'copper', 'timber', 'stone', 'iron', 'carbon', 'quartz', 'silica',
  'fiber', 'silver', 'gold', 'titanium', 'tungsten', 'resin', 'epoxy',
  'elastomer', 'magnet', 'glass', 'lumber', 'seed',
  // Enemy drops
  'circuitWire', 'ironSpike', 'powerCore', 'armorPlate', 'burstCapacitor', 'logicChip',
  // Factory Raw
  'silica_sand', 'ferrous_ore', 'carbon_biomass',
  // Factory Refined
  'silicon_wafer', 'steel_ingot', 'synthetic_resin',
  // Factory Components
  'logic_processor', 'mechanical_servo', 'energy_capacitor',
  // Factory Modules
  'quantum_processor_ring', 'exo_servo_harness', 'aegis_capacitor_bank',
  // Processing chain (ProcessingNodeSystem outputs)
  'iron_dust', 'alloy_bar', 'metal_strut', 'hull_plating', 'data_cable', 'micro_fastener',
  // Assembly products
  'extractor_unit', 'extractor_unit_adv', 'circuit_board', 'hull_segment'
];

export class InventorySystem {
  static get MATERIAL_NAMES() { return MATERIAL_NAMES; }

  constructor() {
    this.maxStackSize = 99; // per material cell

    this.materials = {};
    for (const m of MATERIAL_NAMES) {
      this.materials[m] = 0;
    }

    // Storage container pool — separate grid, same keys
    this.storageItems = {};
    for (const m of MATERIAL_NAMES) {
      this.storageItems[m] = 0;
    }

    this.consumables = {};
    for (const key of Object.keys(CONSUMABLE_DEFS)) {
      this.consumables[key] = 0;
    }
    // Start with 3 rations and 3 energy cells
    this.consumables.ration = 3;
    this.consumables.energyCell = 3;

    // Persistent tools (once crafted, always owned)
    this.tools = {};

    // Equipment bag — holds displaced equipment items
    this.equipmentBag = [];
  }

  static get CONSUMABLE_DEFS() { return CONSUMABLE_DEFS; }
  static get MATERIAL_NAMES() { return MATERIAL_NAMES; }

  addMaterial(name, qty = 1) {
    if (!(name in this.materials)) return;
    const space = this.maxStackSize - this.materials[name];
    const toInv = Math.min(qty, Math.max(0, space));
    this.materials[name] += toInv;
    const overflow = qty - toInv;
    if (overflow > 0 && this.tools.storageContainer) {
      const storSpace = this.maxStackSize - this.storageItems[name];
      this.storageItems[name] += Math.min(overflow, Math.max(0, storSpace));
    }
  }

  // Storage management
  withdrawFromStorage(name, qty = 1) {
    const inStore = this.storageItems[name] || 0;
    const invSpace = this.maxStackSize - (this.materials[name] || 0);
    const take = Math.min(qty, inStore, Math.max(0, invSpace));
    if (take <= 0) return 0;
    this.storageItems[name] -= take;
    this.materials[name] += take;
    return take;
  }

  depositToStorage(name, qty = 1) {
    const inInv = this.materials[name] || 0;
    const storSpace = this.maxStackSize - (this.storageItems[name] || 0);
    const store = Math.min(qty, inInv, Math.max(0, storSpace));
    if (store <= 0) return 0;
    this.materials[name] -= store;
    this.storageItems[name] += store;
    return store;
  }

  getStorageList() {
    return MATERIAL_NAMES.map(name => ({ name, count: this.storageItems[name] || 0 }));
  }

  // Equipment bag (displaced equipment)
  addToEquipmentBag(item) {
    this.equipmentBag.push(item);
  }

  removeFromEquipmentBag(index) {
    if (index < 0 || index >= this.equipmentBag.length) return null;
    return this.equipmentBag.splice(index, 1)[0];
  }

  removeMaterial(name, qty = 1) {
    if (name in this.materials && this.materials[name] >= qty) {
      this.materials[name] -= qty;
      return true;
    }
    return false;
  }

  hasMaterials(recipe) {
    for (const [mat, qty] of Object.entries(recipe)) {
      if ((this.materials[mat] || 0) < qty) return false;
    }
    return true;
  }

  addConsumable(key, qty = 1) {
    if (key in this.consumables) {
      this.consumables[key] += qty;
    }
  }

  // Tools — persistent; durable tools store remaining uses, others store true
  static get TOOL_MAX_DURABILITY() { return { terrainCutter: 50 }; }

  addTool(key) {
    this.tools[key] = InventorySystem.TOOL_MAX_DURABILITY[key] ?? true;
  }

  hasTool(key) {
    return !!this.tools[key];
  }

  getToolList() {
    return Object.keys(this.tools).filter(k => this.tools[k]);
  }

  degradeTool(key) {
    if (typeof this.tools[key] === 'number' && this.tools[key] > 0) {
      this.tools[key]--;
    }
  }

  repairTool(key) {
    const max = InventorySystem.TOOL_MAX_DURABILITY[key];
    if (!max || typeof this.tools[key] !== 'number') return false;
    if (!this.hasMaterials({ iron: 1, resin: 1 })) return false;
    this.removeMaterial('iron', 1);
    this.removeMaterial('resin', 1);
    this.tools[key] = max;
    return true;
  }

  useConsumable(key, statsSystem, ppSystem) {
    if (!this.consumables[key] || this.consumables[key] <= 0) return null;
    const def = CONSUMABLE_DEFS[key];
    if (!def) return null;

    this.consumables[key]--;

    const result = { label: def.label, healed: 0, cured: null, ppBoosted: false };
    if (def.heal > 0) {
      const before = statsSystem.currentHP;
      statsSystem.heal(def.heal);
      result.healed = statsSystem.currentHP - before;
    }
    if (def.cures) {
      result.cured = def.cures;
    }
    if (def.ppBoost && ppSystem) {
      ppSystem.addTemporaryBoost(def.ppBoost.rate, def.ppBoost.duration);
      result.ppBoosted = true;
    }
    if (def.energy > 0 && statsSystem) {
      statsSystem.currentEnergy = Math.min(statsSystem.maxEnergy, statsSystem.currentEnergy + def.energy);
      result.energyRestored = def.energy;
    }
    if (def.pp > 0 && ppSystem) {
      ppSystem.ppTotal += def.pp;
      result.ppGranted = def.pp;
    }
    return result;
  }

  getConsumableList() {
    const list = [];
    for (const [key, count] of Object.entries(this.consumables)) {
      if (count > 0) {
        const def = CONSUMABLE_DEFS[key];
        list.push({ key, count, label: def.label, heal: def.heal, cures: def.cures });
      }
    }
    return list;
  }

  getMaterialList() {
    const list = [];
    for (const [name, count] of Object.entries(this.materials)) {
      if (count > 0) {
        list.push({ name, count });
      }
    }
    return list;
  }

  serialize() {
    return {
      materials: { ...this.materials },
      consumables: { ...this.consumables },
      tools: { ...this.tools },
      storageItems: { ...this.storageItems },
      equipmentBag: this.equipmentBag.map(item => ({ ...item }))
    };
  }

  applyServerInventory(inventory) {
    const materialBucket = inventory?.inventory || {};
    const consumableBucket = inventory?.consumable || {};
    for (const key of Object.keys(this.materials)) {
      this.materials[key] = materialBucket[key] || 0;
    }
    for (const key of Object.keys(this.consumables)) {
      this.consumables[key] = consumableBucket[key] || 0;
    }
  }
}
