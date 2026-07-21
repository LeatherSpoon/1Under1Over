import { CONFIG } from '../config.js';

export class FactorySystem {
  constructor(inventorySystem, ppSystem, statsSystem, pedometerSystem) {
    this.inventory = inventorySystem;
    this.ppSystem = ppSystem;
    this.statsSystem = statsSystem;
    this.pedometerSystem = pedometerSystem;
    
    // Global buff tracks
    this.moduleGlobalMult = 1.0; // ×1.2 once the quantum ring is built; folded into globalMultiplier by main.js each frame
    this.buffs = {
      quantum_processor_ring: false,
      exo_servo_harness: false,
      aegis_capacitor_bank: false
    };

    // Keep track of factory machine state. Hoppers (Phase E, TPT2 model):
    // machines consume from their own input hopper, not the shared inventory —
    // a stocked machine runs online and offline while fed. Capacity is
    // per-material: 20 × 2^hopperLevel.
    this.machines = {
      smelter: {
        id: 'smelter',
        name: 'Arc Smelter',
        unlocked: true,
        count: 1,
        isAutomated: false,
        processingSpeed: 2.0,
        yieldRatio: 1,
        currentRecipe: 'steel_ingot',
        progress: 0.0,
        hopper: {},
        hopperLevel: 0
      },
      assembler: {
        id: 'assembler',
        name: 'Constructor',
        unlocked: true,
        count: 1,
        isAutomated: false,
        processingSpeed: 5.0,
        yieldRatio: 1,
        currentRecipe: 'logic_processor',
        progress: 0.0,
        hopper: {},
        hopperLevel: 0
      },
      fabricator: {
        id: 'fabricator',
        name: 'Advanced Fabricator',
        unlocked: true,
        count: 1,
        isAutomated: false,
        processingSpeed: 10.0,
        yieldRatio: 1,
        currentRecipe: 'quantum_processor_ring',
        progress: 0.0,
        hopper: {},
        hopperLevel: 0
      }
    };

    // Dictionary of recipes
    this.recipes = {
      steel_ingot: { inputs: { ferrous_ore: 2 }, outputs: { steel_ingot: 1 } },
      silicon_wafer: { inputs: { silica_sand: 2 }, outputs: { silicon_wafer: 1 } },
      synthetic_resin: { inputs: { carbon_biomass: 2 }, outputs: { synthetic_resin: 1 } },
      
      logic_processor: { inputs: { silicon_wafer: 1, steel_ingot: 1 }, outputs: { logic_processor: 1 } },
      mechanical_servo: { inputs: { steel_ingot: 1, synthetic_resin: 1 }, outputs: { mechanical_servo: 1 } },
      energy_capacitor: { inputs: { silicon_wafer: 1, synthetic_resin: 1 }, outputs: { energy_capacitor: 1 } },
      
      quantum_processor_ring: { inputs: { logic_processor: 10, energy_capacitor: 5 }, outputs: { quantum_processor_ring: 1 } },
      exo_servo_harness: { inputs: { mechanical_servo: 10, logic_processor: 5 }, outputs: { exo_servo_harness: 1 } },
      aegis_capacitor_bank: { inputs: { energy_capacitor: 10, mechanical_servo: 5 }, outputs: { aegis_capacitor_bank: 1 } }
    };
    
    // Mappings of what recipes belong to what machines
    this.machineRecipes = {
      smelter: ['steel_ingot', 'silicon_wafer', 'synthetic_resin'],
      assembler: ['logic_processor', 'mechanical_servo', 'energy_capacitor'],
      fabricator: ['quantum_processor_ring', 'exo_servo_harness', 'aegis_capacitor_bank']
    };

    // Compute gate per line (Phase E): 0 pauses an automated line, >1 speeds
    // it. Manual clicks are attended play and are never gated.
    this.computeGate = null; // fn(machineId) → mult, wired in main.js
    // Foreman (Al module): auto-restocks hoppers from the shared inventory.
    this.foremanActive = null; // fn() → bool, wired in main.js
  }

  // ── Input hoppers (Phase E) ────────────────────────────────────────────────

  hopperSize(machineId) {
    const m = this.machines[machineId];
    return m ? 20 * Math.pow(2, m.hopperLevel) : 0;
  }

  hopperUpgradeCost(machineId) {
    const m = this.machines[machineId];
    return m ? 250 * Math.pow(3, m.hopperLevel) : Infinity;
  }

  upgradeHopper(machineId) {
    const m = this.machines[machineId];
    if (!m || !this.ppSystem.spend(this.hopperUpgradeCost(machineId))) return false;
    m.hopperLevel++;
    return true;
  }

  hasHopperMaterials(machine, inputs) {
    for (const [mat, qty] of Object.entries(inputs)) {
      if ((machine.hopper[mat] || 0) < qty) return false;
    }
    return true;
  }

  _consumeFromHopper(machine, inputs, cycles = 1) {
    for (const [mat, qty] of Object.entries(inputs)) {
      machine.hopper[mat] = (machine.hopper[mat] || 0) - qty * cycles;
      if (machine.hopper[mat] <= 0) delete machine.hopper[mat];
    }
  }

  /** Move materials bag → hopper. qty Infinity = fill. Returns moved count. */
  stock(machineId, mat, qty = Infinity) {
    const m = this.machines[machineId];
    if (!m || !(mat in this.inventory.materials)) return 0;
    const space = this.hopperSize(machineId) - (m.hopper[mat] || 0);
    const moved = Math.max(0, Math.min(qty, this.inventory.materials[mat], space));
    if (moved > 0) {
      this.inventory.materials[mat] -= moved;
      m.hopper[mat] = (m.hopper[mat] || 0) + moved;
    }
    return moved;
  }

  /** Move materials hopper → bag, never voiding (stops at the 99 stack cap). */
  unstock(machineId, mat, qty = Infinity) {
    const m = this.machines[machineId];
    if (!m || !(mat in this.inventory.materials)) return 0;
    const bagSpace = 99 - this.inventory.materials[mat];
    const moved = Math.max(0, Math.min(qty, m.hopper[mat] || 0, bagSpace));
    if (moved > 0) {
      m.hopper[mat] -= moved;
      if (m.hopper[mat] <= 0) delete m.hopper[mat];
      this.inventory.materials[mat] += moved;
    }
    return moved;
  }

  /** Foreman refill: top the hopper up from the bag for the current recipe. */
  _foremanRestock(machine) {
    const recipe = this.recipes[machine.currentRecipe];
    if (!recipe) return;
    for (const mat of Object.keys(recipe.inputs)) {
      this.stock(machine.id, mat);
    }
  }

  update(delta) {
    const foreman = this.foremanActive ? this.foremanActive() : false;
    for (const [id, machine] of Object.entries(this.machines)) {
      if (!machine.unlocked || !machine.currentRecipe || machine.count === 0) continue;

      const recipe = this.recipes[machine.currentRecipe];
      if (foreman && machine.isAutomated) this._foremanRestock(machine);

      // Idle calculation
      if (machine.isAutomated) {
        const gate = this.computeGate ? this.computeGate(id) : 1;
        if (gate > 0) {
          const workDone = delta * machine.count * (1 / machine.processingSpeed) * gate;
          machine.progress += workDone;
        }
      }

      while (machine.progress >= 1.0) {
        if (this.hasHopperMaterials(machine, recipe.inputs)) {
          this._consumeFromHopper(machine, recipe.inputs);

          // Generate outputs
          for (const [mat, qty] of Object.entries(recipe.outputs)) {
            this.giveOutput(mat, qty * machine.yieldRatio);
          }

          machine.progress -= 1.0;
        } else {
          machine.progress = 1.0; // halt at 100% until the hopper is restocked
          break;
        }
      }
    }
  }

  /**
   * Stocked-offline resolution (Phase E): each automated line runs in closed
   * form while its hopper feeds it, at `gateFn('factory:<id>')` speed.
   * Returns [{ id, name, cycles, dormant }] for the away report.
   */
  simulateOffline(seconds, gateFn) {
    const report = [];
    for (const [id, machine] of Object.entries(this.machines)) {
      if (!machine.unlocked || !machine.isAutomated || !machine.currentRecipe || machine.count === 0) continue;
      const recipe = this.recipes[machine.currentRecipe];
      if (!recipe) continue;
      const mult = gateFn ? gateFn('factory:' + id) : 1;
      if (mult <= 0) {
        report.push({ id, name: machine.name, cycles: 0, dormant: true });
        continue;
      }
      const workRate = machine.count / machine.processingSpeed; // cycles per second
      const byTime = Math.floor(machine.progress + workRate * seconds * mult);
      let byHopper = Infinity;
      for (const [mat, qty] of Object.entries(recipe.inputs)) {
        byHopper = Math.min(byHopper, Math.floor((machine.hopper[mat] || 0) / qty));
      }
      const cycles = Math.max(0, Math.min(byTime, byHopper));
      if (cycles > 0) {
        this._consumeFromHopper(machine, recipe.inputs, cycles);
        for (const [mat, qty] of Object.entries(recipe.outputs)) {
          this.giveOutput(mat, qty * machine.yieldRatio * cycles);
        }
      }
      // Halt at the fed edge: hopper-bound lines sit at 100% awaiting restock
      machine.progress = (cycles < byTime) ? 1.0
        : Math.min(1, machine.progress + workRate * seconds * mult - cycles);
      report.push({ id, name: machine.name, cycles, dormant: false });
    }
    return report;
  }
  
  giveOutput(item, qty) {
    // If it's a global buff module
    if (item === 'quantum_processor_ring' && !this.buffs.quantum_processor_ring) {
      this.buffs.quantum_processor_ring = true;
      this.moduleGlobalMult = 1.20;
      this.inventory.addMaterial(item, qty); // Store record in inventory for visuals
    } else if (item === 'exo_servo_harness' && !this.buffs.exo_servo_harness) {
      this.buffs.exo_servo_harness = true;
      // Permanent speed buff using stats
      this.statsSystem.stats.speed.level += 15; // 15 levels = +2.25 speed
      this.inventory.addMaterial(item, qty);
    } else if (item === 'aegis_capacitor_bank' && !this.buffs.aegis_capacitor_bank) {
      this.buffs.aegis_capacitor_bank = true;
      this.statsSystem.stats.health.level += 10; // 10 levels = 20 HP
      this.statsSystem.stats.energyCap.level += 5; // +50 energy
      this.inventory.addMaterial(item, qty);
    } else {
      // Regular material
      this.inventory.addMaterial(item, Math.floor(qty));
    }
  }

  manualProcess(machineId) {
    const machine = this.machines[machineId];
    if (!machine || machine.isAutomated || !machine.unlocked) return false;
    const recipe = this.recipes[machine.currentRecipe];
    if (!recipe || !this.hasHopperMaterials(machine, recipe.inputs)) return false;
    machine.progress += (1 / machine.processingSpeed);
    return true;
  }
  
  automate(machineId, cost) {
    const machine = this.machines[machineId];
    if (machine && !machine.isAutomated && this.ppSystem.spend(cost)) {
      machine.isAutomated = true;
    }
  }

  setRecipe(machineId, recipeId) {
    const machine = this.machines[machineId];
    if (machine && this.recipes[recipeId]) {
      machine.currentRecipe = recipeId;
      machine.progress = 0; // reset progress when switching recipe
    }
  }
  
  unlockMachine(machineId) {
    if (this.machines[machineId]) {
      this.machines[machineId].unlocked = true;
      if (this.machines[machineId].count === 0) {
        this.machines[machineId].count = 1;
      }
    }
  }

  serialize() {
    return {
      buffs: { ...this.buffs },
      machines: Object.fromEntries(
        Object.entries(this.machines).map(([id, m]) => [id, {
          unlocked: m.unlocked,
          count: m.count,
          isAutomated: m.isAutomated,
          currentRecipe: m.currentRecipe,
          progress: m.progress,
          hopper: { ...m.hopper },
          hopperLevel: m.hopperLevel
        }])
      )
    };
  }

  deserialize(data) {
    if (!data) return;
    if (data.buffs) {
      if (data.buffs.quantum_processor_ring && !this.buffs.quantum_processor_ring) {
        this.buffs.quantum_processor_ring = true;
        this.moduleGlobalMult = 1.20;
      }
      if (data.buffs.exo_servo_harness && !this.buffs.exo_servo_harness) {
        this.buffs.exo_servo_harness = true;
      }
      if (data.buffs.aegis_capacitor_bank && !this.buffs.aegis_capacitor_bank) {
        this.buffs.aegis_capacitor_bank = true;
      }
    }
    
    if (data.machines) {
      for (const [id, mData] of Object.entries(data.machines)) {
        if (this.machines[id]) {
          this.machines[id].unlocked = mData.unlocked;
          this.machines[id].count = mData.count;
          this.machines[id].isAutomated = mData.isAutomated;
          this.machines[id].currentRecipe = mData.currentRecipe;
          this.machines[id].progress = mData.progress || 0;
          // v13 saves have no hoppers — start empty at level 0
          this.machines[id].hopper = { ...(mData.hopper || {}) };
          this.machines[id].hopperLevel = mData.hopperLevel || 0;
          // v13→v14 migration: a running automated line used to feed from the
          // shared bag — stock its hopper once from the bag so it doesn't
          // silently halt on the version bump.
          if (mData.hopper === undefined && this.machines[id].isAutomated && this.machines[id].currentRecipe) {
            const recipe = this.recipes[this.machines[id].currentRecipe];
            if (recipe) for (const mat of Object.keys(recipe.inputs)) this.stock(id, mat);
          }
        }
      }
    }
  }
}
