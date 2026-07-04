import { CONFIG } from '../config.js';

const MISSION_ZONES = {
  landingSite: { label: 'Landing Site', duration: 120, loot: [
    { mat: 'copper', min: 2, max: 5 }, { mat: 'timber', min: 2, max: 4 }, { mat: 'stone', min: 1, max: 3 },
  ]},
  mine: { label: 'The Mine', duration: 180, loot: [
    { mat: 'iron', min: 2, max: 4 }, { mat: 'stone', min: 3, max: 6 }, { mat: 'carbon', min: 0, max: 2 },
  ]},
  verdantMaw: { label: 'Verdant Maw', duration: 240, loot: [
    { mat: 'fiber', min: 3, max: 6 }, { mat: 'timber', min: 2, max: 5 }, { mat: 'seed', min: 0, max: 2 },
  ]},
  lagoonCoast: { label: 'Lagoon Coast', duration: 300, loot: [
    { mat: 'silica', min: 2, max: 4 }, { mat: 'quartz', min: 1, max: 3 }, { mat: 'resin', min: 1, max: 3 },
  ]},
  frozenTundra: { label: 'Frozen Tundra', duration: 360, loot: [
    { mat: 'iron', min: 3, max: 6 }, { mat: 'silver', min: 1, max: 3 }, { mat: 'carbon', min: 1, max: 3 },
  ]},
  spaceship: { label: 'Spaceship', duration: 200, loot: [
    { mat: 'copper', min: 2, max: 5 }, { mat: 'quartz', min: 1, max: 3 }, { mat: 'circuitWire', min: 0, max: 2 },
  ]},
};

export class DroneSystem {
  constructor(inventorySystem, ppSystem, options = {}) {
    this.inventory = inventorySystem;
    this.pp = ppSystem;
    this.sync = options.sync || null;

    this.drones = [
      { id: 1, name: 'Drone Alpha', assignedMaterial: null, efficiency: 1, gatherTimer: 0 },
    ];

    this.baseGatherTime = 30; // seconds per unit of material
    this.upgradeCost = 50; // PP to unlock next drone
    this.maxDrones = 5;

    // Trade-off modifier hook (set from main.js via modifiers.onChange). 1 = neutral.
    this.efficiencyMult = 1;

    this._missions = []; // active/completed missions
    this.onMissionComplete = null; // fn(missionResult)
  }

  static get MISSION_ZONES() { return MISSION_ZONES; }

  assignDrone(droneId, materialType) {
    const drone = this.drones.find(d => d.id === droneId);
    if (!drone) return false;
    drone.assignedMaterial = materialType;
    drone.gatherTimer = 0;
    this.sync?.recordTransaction('drone.assign', { droneId, materialType });
    return true;
  }

  unassignDrone(droneId) {
    const drone = this.drones.find(d => d.id === droneId);
    if (!drone) return false;
    drone.assignedMaterial = null;
    drone.gatherTimer = 0;
    return true;
  }

  upgradeDroneEfficiency(droneId) {
    const drone = this.drones.find(d => d.id === droneId);
    if (!drone) return false;
    const cost = this._efficiencyUpgradeCost(drone.efficiency);
    if (!this.pp.spend(cost)) return false;
    drone.efficiency++;
    this.sync?.recordTransaction('drone.upgrade', { droneId, efficiency: drone.efficiency });
    return true;
  }

  _efficiencyUpgradeCost(currentLevel) {
    return Math.ceil(30 * Math.pow(1.8, currentLevel - 1));
  }

  buyNewDrone() {
    if (this.drones.length >= this.maxDrones) return false;
    if (!this.pp.spend(this.upgradeCost)) return false;
    const id = this.drones.length + 1;
    this.drones.push({
      id,
      name: `Drone ${['Alpha','Beta','Gamma','Delta','Epsilon'][id - 1] || id}`,
      assignedMaterial: null,
      efficiency: 1,
      gatherTimer: 0,
    });
    this.upgradeCost = Math.ceil(this.upgradeCost * 2.5);
    return true;
  }

  sendOnMission(droneId, zoneName) {
    const drone = this.drones.find(d => d.id === droneId);
    const zone = MISSION_ZONES[zoneName];
    if (!drone || !zone) return false;
    if (this._missions.some(m => m.droneId === droneId && !m.done)) return false; // already on mission
    drone.assignedMaterial = null; // suspend passive gathering
    drone.gatherTimer = 0;
    this._missions.push({ droneId, zoneName, elapsed: 0, duration: zone.duration, done: false });
    return true;
  }

  recallDrone(droneId) {
    const idx = this._missions.findIndex(m => m.droneId === droneId && !m.done);
    if (idx !== -1) this._missions.splice(idx, 1);
  }

  getMissions() { return this._missions; }

  isDroneOnMission(droneId) {
    return this._missions.some(m => m.droneId === droneId && !m.done);
  }

  _completeMission(mission) {
    mission.done = true;
    const zone = MISSION_ZONES[mission.zoneName];
    const drone = this.drones.find(d => d.id === mission.droneId);
    const efficiency = drone?.efficiency || 1;
    const lootResult = {};
    for (const entry of zone.loot) {
      const qty = Math.floor((entry.min + Math.random() * (entry.max - entry.min + 1)) * Math.max(1, efficiency * this.efficiencyMult * 0.5));
      if (qty > 0) {
        this.inventory.addMaterial(entry.mat, qty);
        lootResult[entry.mat] = (lootResult[entry.mat] || 0) + qty;
      }
    }
    if (this.onMissionComplete) {
      this.onMissionComplete({ drone: drone?.name || `Drone ${mission.droneId}`, zone: zone.label, loot: lootResult });
    }
    // Clean up old done missions (keep last 5)
    const done = this._missions.filter(m => m.done);
    if (done.length > 5) this._missions.splice(this._missions.indexOf(done[0]), 1);
  }

  update(delta) {
    for (const drone of this.drones) {
      // Tick missions
      const mission = this._missions.find(m => m.droneId === drone.id && !m.done);
      if (mission) {
        mission.elapsed += delta;
        if (mission.elapsed >= mission.duration) this._completeMission(mission);
        continue; // drone occupied
      }

      if (!drone.assignedMaterial) continue;
      const gatherTime = this.baseGatherTime / (drone.efficiency * this.efficiencyMult);
      drone.gatherTimer += delta;
      if (drone.gatherTimer >= gatherTime) {
        drone.gatherTimer -= gatherTime;
        this.inventory.addMaterial(drone.assignedMaterial, 1);
      }
    }
  }

  getDroneStatus() {
    return this.drones.map(d => ({
      id: d.id,
      name: d.name,
      assignedMaterial: d.assignedMaterial,
      efficiency: d.efficiency,
      gatherProgress: d.assignedMaterial
        ? d.gatherTimer / (this.baseGatherTime / (d.efficiency * this.efficiencyMult))
        : 0,
      efficiencyUpgradeCost: this._efficiencyUpgradeCost(d.efficiency),
    }));
  }

  get nextDroneCost() { return this.upgradeCost; }
  get canBuyDrone() { return this.drones.length < this.maxDrones; }
}
