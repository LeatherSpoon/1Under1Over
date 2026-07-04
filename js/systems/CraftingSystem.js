const RECIPES = {
  ration: {
    label: 'Ration',
    type: 'consumable',
    key: 'ration',
    materials: { timber: 2, fiber: 1 },
    baseTime: 3, // seconds
    minCraftingLevel: 1,
  },
  ironPatch: {
    label: 'Iron Patch',
    type: 'consumable',
    key: 'ironPatch',
    materials: { iron: 2 },
    baseTime: 4,
    minCraftingLevel: 1,
  },
  signalFlare: {
    label: 'Signal Flare',
    type: 'consumable',
    key: 'signalFlare',
    materials: { carbon: 1, quartz: 1 },
    baseTime: 4,
    minCraftingLevel: 1,
  },
  firstAid: {
    label: 'First Aid',
    type: 'consumable',
    key: 'firstAid',
    materials: { copper: 2, fiber: 2 },
    baseTime: 5,
    minCraftingLevel: 2,
  },
  repairKit: {
    label: 'Repair Kit',
    type: 'consumable',
    key: 'repairKit',
    materials: { iron: 3, copper: 2, resin: 1 },
    baseTime: 8,
    minCraftingLevel: 4,
  },
  antidote: {
    label: 'Antidote',
    type: 'consumable',
    key: 'antidote',
    materials: { fiber: 3, quartz: 1 },
    baseTime: 6,
    minCraftingLevel: 3,
  },
  terrainCutter: {
    label: 'Terrain Cutter',
    type: 'tool',
    key: 'terrainCutter',
    materials: { copper: 3, iron: 2, carbon: 1 },
    baseTime: 8,
    minCraftingLevel: 2,
  },
  basicBlade: {
    label: 'Basic Blade',
    type: 'equipment',
    slot: 'weapon',
    tier: 'Basic',
    statBonuses: { strength: 2 },
    materials: { iron: 4, timber: 2 },
    baseTime: 10,
    minCraftingLevel: 2,
  },
  basicShield: {
    label: 'Basic Shield',
    type: 'equipment',
    slot: 'offhand',
    tier: 'Basic',
    statBonuses: { defense: 2 },
    materials: { iron: 3, timber: 3 },
    baseTime: 10,
    minCraftingLevel: 2,
  },
  basicArmor: {
    label: 'Basic Armor',
    type: 'equipment',
    slot: 'body',
    tier: 'Basic',
    statBonuses: { defense: 3, health: 1 },
    materials: { iron: 5, fiber: 3 },
    baseTime: 12,
    minCraftingLevel: 3,
  },
  copperRing: {
    label: 'Copper Ring',
    type: 'equipment',
    slot: 'accessory',
    tier: 'Basic',
    statBonuses: { focusRate: 1 },
    materials: { copper: 4 },
    baseTime: 6,
    minCraftingLevel: 1,
  },
  goldShard: {
    label: 'Gold Shard',
    type: 'equipment',
    slot: 'accessory',
    tier: 'Basic',
    statBonuses: { agility: 1 },
    materials: { gold: 2 },
    baseTime: 7,
    minCraftingLevel: 2,
  },
  chargingStation: {
    label: 'Charging Station',
    type: 'tool',
    key: 'chargingStation',
    materials: { copper: 5, quartz: 3, iron: 4, carbon: 2 },
    baseTime: 12,
    minCraftingLevel: 3,
  },
  energyCell: {
    label: 'Energy Cell',
    type: 'consumable',
    key: 'energyCell',
    materials: { copper: 2, quartz: 1 },
    baseTime: 5,
    minCraftingLevel: 1,
  },
  storageContainer: {
    label: 'Storage Container',
    type: 'tool',
    key: 'storageContainer',
    // Blueprint: 6 material types make this a complex crafting project
    materials: { iron: 6, timber: 4, stone: 3, copper: 3, resin: 2 },
    baseTime: 25,
    minCraftingLevel: 2,
  },
  // ── Enemy drop recipes ─────────────────────────────────────────────────────
  neuralCoil: {
    label: 'Neural Coil',
    type: 'equipment',
    slot: 'accessory',
    tier: 'Combat',
    statBonuses: { focusRate: 2 },
    materials: { circuitWire: 2, copper: 2, quartz: 1 },
    baseTime: 10,
    minCraftingLevel: 3,
  },
  spikeKnuckles: {
    label: 'Spike Knuckles',
    type: 'equipment',
    slot: 'weapon',
    tier: 'Combat',
    statBonuses: { strength: 3 },
    materials: { ironSpike: 2, iron: 2 },
    baseTime: 12,
    minCraftingLevel: 3,
  },
  overchargeCell: {
    label: 'Overcharge Cell',
    type: 'consumable',
    key: 'overchargeCell',
    materials: { powerCore: 1, copper: 2 },
    baseTime: 8,
    minCraftingLevel: 3,
  },
  heavyPlateArmor: {
    label: 'Heavy Plate Armor',
    type: 'equipment',
    slot: 'body',
    tier: 'Combat',
    statBonuses: { defense: 6, health: 2 },
    materials: { armorPlate: 2, iron: 3 },
    baseTime: 18,
    minCraftingLevel: 4,
  },
  pulseModule: {
    label: 'Pulse Module',
    type: 'equipment',
    slot: 'accessory',
    tier: 'Combat',
    statBonuses: { agility: 2 },
    materials: { burstCapacitor: 2, silica: 1 },
    baseTime: 12,
    minCraftingLevel: 4,
  },
  dataCache: {
    label: 'Data Cache',
    type: 'consumable',
    key: 'dataCache',
    materials: { logicChip: 2, carbon: 1 },
    baseTime: 6,
    minCraftingLevel: 3,
  },
};

export class CraftingSystem {
  constructor(inventorySystem, statsSystem, options = {}) {
    this.inventory = inventorySystem;
    this.stats = statsSystem;
    this.recipes = options.recipes || RECIPES;
    this.techTree = options.techTree || null;
    this.mastery = options.mastery || null;
    this.sync = options.sync || null;
    this._isCrafting = false;
    this._craftingRecipe = null;
    this._craftingProgress = 0;
    this._craftingDuration = 0;
    this._queue = [];           // queued recipe IDs
    this.maxQueueSize = 5;
    this.onCraftComplete = null; // fn(recipe)
    this.onCraftProgress = null; // fn(progress, duration)
    this.onQueueUpdate = null;   // fn(queue)
  }

  static get RECIPES() { return RECIPES; }

  setRecipes(recipes) {
    this.recipes = recipes || RECIPES;
  }

  getAvailableRecipes() {
    const craftLevel = this.stats.stats.crafting.level;
    return Object.entries(this.recipes)
      .map(([id, r]) => ({
        id,
        ...r,
        isLocked: r.minCraftingLevel > craftLevel,
        canCraft: r.type === 'tool'
          ? (!this.inventory.hasTool(r.key) && this.inventory.hasMaterials(r.materials))
          : this.inventory.hasMaterials(r.materials),
        alreadyOwned: r.type === 'tool' && this.inventory.hasTool(r.key),
        craftTime: this._calcCraftTime(r.baseTime),
      }));
  }

  _calcCraftTime(baseTime) {
    return baseTime / (1 + this.stats.stats.craftingSpeed.level * 0.2);
  }

  _createLocalJobId(recipeId) {
    return `craft_${recipeId}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }

  startCraft(recipeId) {
    if (this._isCrafting) return false;
    const recipe = this.recipes[recipeId];
    if (!recipe) return false;
    if (recipe.minCraftingLevel > this.stats.stats.crafting.level) return false;
    if (recipe.type === 'tool' && this.inventory.hasTool(recipe.key)) return false;
    if (!this.inventory.hasMaterials(recipe.materials)) return false;

    // Consume materials
    for (const [mat, qty] of Object.entries(recipe.materials)) {
      this.inventory.removeMaterial(mat, qty);
    }

    const localJobId = this._createLocalJobId(recipeId);
    this._isCrafting = true;
    this._craftingRecipe = { id: recipeId, localJobId, ...recipe };
    this._craftingProgress = 0;
    this._craftingDuration = this._calcCraftTime(recipe.baseTime);
    this.sync?.recordTransaction('crafting.start', {
      localJobId,
      recipeId,
      startedAt: new Date().toISOString()
    });
    return true;
  }

  update(delta) {
    if (!this._isCrafting) return;

    this._craftingProgress += delta;
    if (this.onCraftProgress) {
      this.onCraftProgress(this._craftingProgress, this._craftingDuration);
    }

    if (this._craftingProgress >= this._craftingDuration) {
      this._completeCraft();
    }
  }

  _completeCraft() {
    const recipe = this._craftingRecipe;
    this._isCrafting = false;
    this._craftingRecipe = null;
    this._craftingProgress = 0;
    this._craftingDuration = 0;

    if (recipe.type === 'consumable') {
      this.inventory.addConsumable(recipe.key, 1);
    } else if (recipe.type === 'tool') {
      this.inventory.addTool(recipe.key);
    }
    if (recipe.masteryCategory && this.mastery) {
      this.mastery.award(recipe.masteryCategory, 25);
    }
    this.sync?.recordTransaction('crafting.complete', {
      localJobId: recipe.localJobId,
      recipeId: recipe.id,
      completedAt: new Date().toISOString()
    });
    // Equipment items handled externally through the callback
    if (this.onCraftComplete) {
      this.onCraftComplete(recipe);
    }

    // Auto-start next queued item
    this._processQueue();
  }

  // ── Queue methods ───────────────────────────────────────────────────────
  queueCraft(recipeId) {
    if (this._queue.length >= this.maxQueueSize) return false;
    const recipe = this.recipes[recipeId];
    if (!recipe) return false;
    if (recipe.minCraftingLevel > this.stats.stats.crafting.level) return false;
    if (recipe.type === 'tool' && this.inventory.hasTool(recipe.key)) return false;
    if (!this.inventory.hasMaterials(recipe.materials)) return false;

    // Consume materials immediately for queued items
    for (const [mat, qty] of Object.entries(recipe.materials)) {
      this.inventory.removeMaterial(mat, qty);
    }

    const localJobId = this._createLocalJobId(recipeId);
    this._queue.push({ id: recipeId, localJobId, ...recipe });
    this.sync?.recordTransaction('crafting.start', {
      localJobId,
      recipeId,
      startedAt: new Date().toISOString()
    });
    if (this.onQueueUpdate) this.onQueueUpdate(this._queue);

    // If nothing currently crafting, start immediately
    if (!this._isCrafting) this._processQueue();
    return true;
  }

  _processQueue() {
    if (this._isCrafting || this._queue.length === 0) return;
    const next = this._queue.shift();
    if (this.onQueueUpdate) this.onQueueUpdate(this._queue);

    this._isCrafting = true;
    this._craftingRecipe = next;
    this._craftingProgress = 0;
    this._craftingDuration = this._calcCraftTime(next.baseTime);
  }

  get queue() { return this._queue; }
  get queueLength() { return this._queue.length; }

  get isCrafting() { return this._isCrafting; }
  get craftProgress() { return this._craftingProgress; }
  get craftDuration() { return this._craftingDuration; }
  get craftingRecipeName() { return this._craftingRecipe?.label || ''; }
}
