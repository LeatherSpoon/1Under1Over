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

// Bonus per merge level — merging a duplicate into an item boosts all its
// stat bonuses by this fraction, stacking linearly (+15% / +30% / +45% ...).
const MERGE_BONUS_PER_LEVEL = 0.15;

// Set bonuses: equipping 3+ items of the same tier (any slots) grants a flat
// block on top of individual item bonuses.
const SET_BONUSES = {
  Basic: { hp: 15, defense: 0, damage: 0 },
  Good:  { hp: 20, defense: 3, damage: 0 },
  Rare:  { hp: 30, defense: 4, damage: 6 },
  Epic:  { hp: 50, defense: 6, damage: 12 },
};
const SET_PIECES_REQUIRED = 3;

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
  static get SET_BONUSES() { return SET_BONUSES; }
  static get SET_PIECES_REQUIRED() { return SET_PIECES_REQUIRED; }
  static get MERGE_BONUS_PER_LEVEL() { return MERGE_BONUS_PER_LEVEL; }

  equip(item) {
    if (!item || !item.slot) return null;
    if (!SLOT_TYPES.includes(item.slot)) return null;

    // Unequip current item — returns displaced item (or null)
    const displaced = this.unequip(item.slot);

    this.slots[item.slot] = item;
    this._applyBonuses(item);
    this._recomputeSetBonuses();
    return displaced; // caller should send this to inventory bag
  }

  unequip(slotName) {
    const current = this.slots[slotName];
    if (!current) return null;
    this._removeBonuses(current);
    this.slots[slotName] = null;
    this._recomputeSetBonuses();
    return current;
  }

  // ── Merging ────────────────────────────────────────────────────────────────
  /** Two items are merge-compatible if they share label and tier. */
  static isSameItem(a, b) {
    return !!a && !!b && a.label === b.label && a.tier === b.tier;
  }

  /** Index of the first bag duplicate of `item`, or -1. */
  findDuplicateInBag(inventory, item, excludeIdx = -1) {
    return inventory.equipmentBag.findIndex(
      (bagItem, i) => i !== excludeIdx && EquipmentSystem.isSameItem(bagItem, item)
    );
  }

  /**
   * Merge a bag duplicate into the item equipped in `slotName`.
   * Consumes the duplicate, raises mergeLevel, reapplies bonuses.
   */
  mergeFromBag(inventory, slotName) {
    const item = this.slots[slotName];
    if (!item) return false;
    const dupIdx = this.findDuplicateInBag(inventory, item);
    if (dupIdx < 0) return false;
    inventory.equipmentBag.splice(dupIdx, 1);
    this._removeBonuses(item);
    item.mergeLevel = (item.mergeLevel || 0) + 1;
    this._applyBonuses(item);
    this._recomputeSetBonuses();
    return true;
  }

  /** Merge a duplicate into the bag item at `bagIdx` (both stay in the bag). */
  mergeBagItems(inventory, bagIdx) {
    const item = inventory.equipmentBag[bagIdx];
    if (!item) return false;
    const dupIdx = this.findDuplicateInBag(inventory, item, bagIdx);
    if (dupIdx < 0) return false;
    inventory.equipmentBag.splice(dupIdx, 1);
    item.mergeLevel = (item.mergeLevel || 0) + 1;
    return true;
  }

  _effectiveMult(item) {
    const tierMult = TIER_MULTIPLIERS[item.tier] || 1;
    return tierMult * (1 + MERGE_BONUS_PER_LEVEL * (item.mergeLevel || 0));
  }

  _applyBonuses(item) {
    if (!item.statBonuses) return;
    const mult = this._effectiveMult(item);
    const key = `equip_${item.slot}`;
    this._appliedBonuses[key] = {};
    for (const [stat, bonus] of Object.entries(item.statBonuses)) {
      const effective = Math.floor(bonus * mult);
      this._appliedBonuses[key][stat] = effective;
      if (this.stats.stats[stat]) {
        this.stats.stats[stat].level += effective;
      }
    }
  }

  // ── Set bonuses ────────────────────────────────────────────────────────────
  /** Tier counts across equipped items. */
  getTierCounts() {
    const counts = {};
    for (const item of Object.values(this.slots)) {
      if (item && item.tier) counts[item.tier] = (counts[item.tier] || 0) + 1;
    }
    return counts;
  }

  /** Tiers whose set bonus is currently active. */
  getActiveSets() {
    return Object.entries(this.getTierCounts())
      .filter(([tier, n]) => n >= SET_PIECES_REQUIRED && SET_BONUSES[tier])
      .map(([tier]) => tier);
  }

  _recomputeSetBonuses() {
    const total = { hp: 0, defense: 0, damage: 0 };
    for (const tier of this.getActiveSets()) {
      const b = SET_BONUSES[tier];
      total.hp += b.hp;
      total.defense += b.defense;
      total.damage += b.damage;
    }
    this.stats.setSetBonuses(total);
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
