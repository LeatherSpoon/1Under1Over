const SLOT_TYPES = [
  'weapon',     // Active gear 1
  'offhand',    // Active gear 2
  'head',       // Active gear 3
  'body',       // Active gear 4
  'legs',       // Active gear 5
  'accessory',  // Active gear 6
  'deploy1',    // Pre-combat assignment 1
  'deploy2',    // Pre-combat assignment 2
  'consumable', // Consumable slot
];

const TIER_MULTIPLIERS = {
  Basic: 1.0,
  Good:  1.5,
  Rare:  2.0,
  Epic:  3.0,
};

export class EquipmentSystem {
  constructor(statsSystem) {
    this.stats = statsSystem;
    this.slots = {};
    for (const slot of SLOT_TYPES) {
      this.slots[slot] = null; // { name, tier, slot, statBonuses }
    }
    this._appliedBonuses = {};
  }

  static get SLOT_TYPES() { return SLOT_TYPES; }
  static get TIER_MULTIPLIERS() { return TIER_MULTIPLIERS; }

  equip(item) {
    if (!item || !item.slot) return null;
    if (!SLOT_TYPES.includes(item.slot)) return null;

    // Unequip current item — returns displaced item (or null)
    const displaced = this.unequip(item.slot);

    this.slots[item.slot] = item;
    this._applyBonuses(item);
    return displaced; // caller should send this to inventory bag
  }

  unequip(slotName) {
    const current = this.slots[slotName];
    if (!current) return null;
    this._removeBonuses(current);
    this.slots[slotName] = null;
    return current;
  }

  _applyBonuses(item) {
    if (!item.statBonuses) return;
    const tierMult = TIER_MULTIPLIERS[item.tier] || 1;
    const key = `equip_${item.slot}`;
    this._appliedBonuses[key] = {};
    for (const [stat, bonus] of Object.entries(item.statBonuses)) {
      const effective = Math.floor(bonus * tierMult);
      this._appliedBonuses[key][stat] = effective;
      if (this.stats.stats[stat]) {
        this.stats.stats[stat].level += effective;
      }
    }
  }

  _removeBonuses(item) {
    const key = `equip_${item.slot}`;
    const bonuses = this._appliedBonuses[key];
    if (!bonuses) return;
    for (const [stat, effective] of Object.entries(bonuses)) {
      if (this.stats.stats[stat]) {
        this.stats.stats[stat].level = Math.max(1, this.stats.stats[stat].level - effective);
      }
    }
    delete this._appliedBonuses[key];
  }

  getEquippedList() {
    return SLOT_TYPES.map(slot => ({
      slot,
      item: this.slots[slot],
    }));
  }

  getTotalBonuses() {
    const totals = {};
    for (const bonuses of Object.values(this._appliedBonuses)) {
      for (const [stat, val] of Object.entries(bonuses)) {
        totals[stat] = (totals[stat] || 0) + val;
      }
    }
    return totals;
  }
}
