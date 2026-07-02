/**
 * ── Drill System ───────────────────────────────────────────────────────────
 * Incremental clicker for The Mine: Shatter bedrock layers for rare loot.
 */

export class DrillSystem {
  constructor(ppSystem, inventorySystem, statsSystem) {
    this.pp = ppSystem;
    this.inventory = inventorySystem;
    this.stats = statsSystem;

    // Persistent State
    this.currentStratum = 1;
    this.layerHPMax = 100;
    this.layerHP = 100;
    this.drillPowerLevel = 1; // Base power level

    this.onUpdate = null; // Callback for HUD refresh
  }

  // Calculate damage per click
  get damagePerClick() {
    // Base power + 20% of Strength stat
    const strengthBonus = this.stats.getStat('strength') * 0.2;
    return (this.drillPowerLevel * 5) + strengthBonus;
  }

  get upgradeCost() {
    return {
      iron: 10 * Math.pow(1.5, this.drillPowerLevel - 1),
      copper: 5 * Math.pow(1.5, this.drillPowerLevel - 1),
      carbon: 2 * Math.pow(1.8, this.drillPowerLevel - 1),
    };
  }

  clickDrill() {
    const damage = this.damagePerClick;
    this.layerHP = Math.max(0, this.layerHP - damage);

    if (this.layerHP <= 0) {
      this.breakLayer();
    }

    if (this.onUpdate) this.onUpdate();
    return damage;
  }

  breakLayer() {
    // Rewards scale with stratum level
    const ppAwarded = 50 * Math.pow(1.2, this.currentStratum);
    const goldFound = Math.floor(Math.random() * 2) + Math.floor(this.currentStratum / 3);
    const quartzFound = Math.floor(Math.random() * 3) + Math.floor(this.currentStratum / 5);

    this.pp.ppTotal += ppAwarded;
    if (goldFound > 0) this.inventory.addMaterial('gold', goldFound);
    if (quartzFound > 0) this.inventory.addMaterial('quartz', quartzFound);

    // Progression
    this.currentStratum++;
    this.layerHPMax = 100 * Math.pow(1.4, this.currentStratum - 1);
    this.layerHP = this.layerHPMax;

    return { ppAwarded, goldFound, quartzFound };
  }

  canUpgrade() {
    const cost = this.upgradeCost;
    return (
      this.inventory.materials.iron >= cost.iron &&
      this.inventory.materials.copper >= cost.copper &&
      this.inventory.materials.carbon >= cost.carbon
    );
  }

  upgrade() {
    if (!this.canUpgrade()) return false;

    const cost = this.upgradeCost;
    this.inventory.removeMaterial('iron', Math.floor(cost.iron));
    this.inventory.removeMaterial('copper', Math.floor(cost.copper));
    this.inventory.removeMaterial('carbon', Math.floor(cost.carbon));

    this.drillPowerLevel++;
    if (this.onUpdate) this.onUpdate();
    return true;
  }

  serialize() {
    return {
      currentStratum: this.currentStratum,
      layerHP: this.layerHP,
      layerHPMax: this.layerHPMax,
      drillPowerLevel: this.drillPowerLevel,
    };
  }

  deserialize(data) {
    if (!data) return;
    this.currentStratum = data.currentStratum || 1;
    this.layerHP = data.layerHP || 100;
    this.layerHPMax = data.layerHPMax || 100;
    this.drillPowerLevel = data.drillPowerLevel || 1;
  }
}
