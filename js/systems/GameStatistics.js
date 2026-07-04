export class GameStatistics {
  constructor() {
    this.enemiesDefeated = 0;
    this.defeats = 0;
    this.actionsTaken = 0;
    this.highestHit = 0;
    this.totalStepsTaken = 0;
    this.resourcesGathered = 0;
    this.miningActions = 0;
    this._visitedZones = new Set();
  }

  // landingSite, mine, depths, verdantMaw, lagoonCoast, frozenTundra, spaceship, workspace
  static get TOTAL_WORLDS() { return 8; }

  recordEnemyDefeated() {
    this.enemiesDefeated++;
    this.actionsTaken++;
  }

  recordDefeat() {
    this.defeats++;
  }

  recordAction() {
    this.actionsTaken++;
  }

  recordGather(amount = 1) {
    this.resourcesGathered += amount;
    this.actionsTaken++;
  }

  recordMine() {
    this.miningActions++;
    this.actionsTaken++;
  }

  recordHit(damage) {
    if (damage > this.highestHit) {
      this.highestHit = damage;
    }
    this.actionsTaken++;
  }

  recordSteps(steps) {
    this.totalStepsTaken += steps;
  }

  recordZoneVisit(zoneName) {
    this._visitedZones.add(zoneName);
  }

  get worldsDiscovered() {
    return this._visitedZones.size;
  }

  get totalWorlds() {
    return GameStatistics.TOTAL_WORLDS;
  }
}
