import { CONFIG } from '../config.js';

export class FactorySystem {
  constructor(inventorySystem, ppSystem, statsSystem, pedometerSystem) {
    this.inventory = inventorySystem;
    this.ppSystem = ppSystem;
    this.statsSystem = statsSystem;
    this.pedometerSystem = pedometerSystem;
    
    // Global buff tracks
    this.buffs = {
      quantum_processor_ring: false,
      exo_servo_harness: false,
      aegis_capacitor_bank: false
    };

    // Keep track of factory machine state
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
        progress: 0.0
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
        progress: 0.0
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
        progress: 0.0
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
  }

  update(delta) {
    for (const [id, machine] of Object.entries(this.machines)) {
      if (!machine.unlocked || !machine.currentRecipe || machine.count === 0) continue;
      
      const recipe = this.recipes[machine.currentRecipe];
      
      // Idle calculation
      if (machine.isAutomated) {
        const workDone = delta * machine.count * (1 / machine.processingSpeed);
        machine.progress += workDone;
      }

      while (machine.progress >= 1.0) {
        if (this.inventory.hasMaterials(recipe.inputs)) {
          // Consume inputs
          for (const [mat, qty] of Object.entries(recipe.inputs)) {
            this.inventory.removeMaterial(mat, qty);
          }
          
          // Generate outputs
          for (const [mat, qty] of Object.entries(recipe.outputs)) {
            this.giveOutput(mat, qty * machine.yieldRatio);
          }
          
          machine.progress -= 1.0; 
        } else {
          machine.progress = 1.0; // halt at 100% until resources available
          break;
        }
      }
    }
  }
  
  giveOutput(item, qty) {
    // If it's a global buff module
    if (item === 'quantum_processor_ring' && !this.buffs.quantum_processor_ring) {
      this.buffs.quantum_processor_ring = true;
      this.ppSystem.globalMultiplier *= 1.20; 
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
    if (!recipe || !this.inventory.hasMaterials(recipe.inputs)) return false;
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
          progress: m.progress
        }])
      )
    };
  }

  deserialize(data) {
    if (!data) return;
    if (data.buffs) {
      if (data.buffs.quantum_processor_ring && !this.buffs.quantum_processor_ring) {
        this.buffs.quantum_processor_ring = true;
        this.ppSystem.globalMultiplier *= 1.20;
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
        }
      }
    }
  }
}
