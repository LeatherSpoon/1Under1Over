export const MATERIALS = [
  'copper', 'timber', 'stone', 'iron', 'carbon', 'quartz', 'silica',
  'fiber', 'silver', 'gold', 'titanium', 'tungsten', 'resin', 'epoxy',
  'elastomer', 'magnet', 'glass', 'lumber', 'seed',
  'circuitWire', 'ironSpike', 'powerCore', 'armorPlate', 'burstCapacitor', 'logicChip'
].map(id => ({
  id,
  label: id.replace(/[A-Z]/g, m => ` ${m}`).replace(/^./, c => c.toUpperCase()),
  stackLimit: 99,
  rarity: ['gold', 'silver', 'titanium', 'tungsten', 'powerCore', 'logicChip'].includes(id) ? 'rare' : 'common',
  droneGatherable: !['seed', 'lumber'].includes(id)
}));

export const MASTERY_TRACKS = [
  { id: 'survival', label: 'Survival Fabrication', xpPerLevel: 100 },
  { id: 'tooling', label: 'Tooling Mastery', xpPerLevel: 120 },
  { id: 'combat', label: 'Combat Engineering', xpPerLevel: 140 },
  { id: 'energy', label: 'Energy Systems', xpPerLevel: 120 }
];

export const RECIPES = [
  { id: 'ration', label: 'Ration', type: 'consumable', outputKey: 'ration', outputQty: 1, category: 'survival', baseTime: 3, minCraftingLevel: 1, requiredTechNode: null, costs: { timber: 2, fiber: 1 } },
  { id: 'ironPatch', label: 'Iron Patch', type: 'consumable', outputKey: 'ironPatch', outputQty: 1, category: 'survival', baseTime: 4, minCraftingLevel: 1, requiredTechNode: null, costs: { iron: 2 } },
  { id: 'signalFlare', label: 'Signal Flare', type: 'consumable', outputKey: 'signalFlare', outputQty: 1, category: 'energy', baseTime: 4, minCraftingLevel: 1, requiredTechNode: null, costs: { carbon: 1, quartz: 1 } },
  { id: 'firstAid', label: 'First Aid', type: 'consumable', outputKey: 'firstAid', outputQty: 1, category: 'survival', baseTime: 5, minCraftingLevel: 2, requiredTechNode: 'fieldFabrication', costs: { copper: 2, fiber: 2 } },
  { id: 'repairKit', label: 'Repair Kit', type: 'consumable', outputKey: 'repairKit', outputQty: 1, category: 'survival', baseTime: 8, minCraftingLevel: 4, requiredTechNode: 'fieldFabrication', costs: { iron: 3, copper: 2, resin: 1 } },
  { id: 'antidote', label: 'Antidote', type: 'consumable', outputKey: 'antidote', outputQty: 1, category: 'survival', baseTime: 6, minCraftingLevel: 3, requiredTechNode: 'fieldFabrication', costs: { fiber: 3, quartz: 1 } },
  { id: 'terrainCutter', label: 'Terrain Cutter', type: 'tool', outputKey: 'terrainCutter', outputQty: 1, category: 'tooling', baseTime: 8, minCraftingLevel: 2, requiredTechNode: null, costs: { stone: 1, copper: 1 } },
  { id: 'rockDrill',     label: 'Rock Drill',     type: 'tool', outputKey: 'rockDrill',     outputQty: 1, category: 'tooling', baseTime: 10, minCraftingLevel: 1, requiredTechNode: null, costs: { copper: 3, stone: 2 } },
  { id: 'harvestBlade',  label: 'Harvest Blade',  type: 'tool', outputKey: 'harvestBlade',  outputQty: 1, category: 'tooling', baseTime: 10, minCraftingLevel: 2, requiredTechNode: null, costs: { timber: 2, fiber: 3 } },
  { id: 'diveTool',      label: 'Dive Tool',      type: 'tool', outputKey: 'diveTool',      outputQty: 1, category: 'tooling', baseTime: 12, minCraftingLevel: 2, requiredTechNode: null, costs: { copper: 2, resin: 2 } },
  { id: 'cryoPick',      label: 'Cryo-Pick',      type: 'tool', outputKey: 'cryoPick',      outputQty: 1, category: 'tooling', baseTime: 14, minCraftingLevel: 3, requiredTechNode: null, costs: { iron: 2, quartz: 1, stone: 2 } },
  { id: 'basicBlade', label: 'Basic Blade', type: 'equipment', outputKey: 'basicBlade', outputQty: 1, category: 'combat', baseTime: 10, minCraftingLevel: 2, requiredTechNode: null, slot: 'weapon', tier: 'Basic', statBonuses: { strength: 2 }, costs: { iron: 4, timber: 2 } },
  { id: 'basicShield', label: 'Basic Shield', type: 'equipment', outputKey: 'basicShield', outputQty: 1, category: 'combat', baseTime: 10, minCraftingLevel: 2, requiredTechNode: null, slot: 'offhand', tier: 'Basic', statBonuses: { defense: 2 }, costs: { iron: 3, timber: 3 } },
  { id: 'basicArmor', label: 'Basic Armor', type: 'equipment', outputKey: 'basicArmor', outputQty: 1, category: 'combat', baseTime: 12, minCraftingLevel: 3, requiredTechNode: null, slot: 'body', tier: 'Basic', statBonuses: { defense: 3, health: 1 }, costs: { iron: 5, fiber: 3 } },
  { id: 'copperRing', label: 'Copper Ring', type: 'equipment', outputKey: 'copperRing', outputQty: 1, category: 'energy', baseTime: 6, minCraftingLevel: 1, requiredTechNode: null, slot: 'accessory', tier: 'Basic', statBonuses: { focusRate: 1 }, costs: { copper: 4 } },
  { id: 'energyCell', label: 'Energy Cell', type: 'consumable', outputKey: 'energyCell', outputQty: 1, category: 'energy', baseTime: 5, minCraftingLevel: 1, requiredTechNode: null, costs: { copper: 2, quartz: 1 } },
  { id: 'storageContainer', label: 'Storage Container', type: 'tool', outputKey: 'storageContainer', outputQty: 1, category: 'tooling', baseTime: 25, minCraftingLevel: 2, requiredTechNode: 'fieldFabrication', costs: { iron: 6, timber: 4, stone: 3, copper: 3, resin: 2 } }
];

export const TECH_NODES = [
  { id: 'fieldFabrication', branch: 'fabrication', label: 'Field Fabrication', description: 'Unlocks advanced survival recipes and storage fabrication.', costType: 'pp', costAmount: 150, displayOrder: 1, prerequisites: [] },
  { id: 'droneLogistics', branch: 'drones', label: 'Drone Logistics', description: 'Unlocks broader drone assignment support.', costType: 'pp', costAmount: 250, displayOrder: 2, prerequisites: [] },
  { id: 'terrainControl', branch: 'tools', label: 'Terrain Control', description: 'Unlocks terrain manipulation tooling.', costType: 'materials', costAmount: 1, materialCosts: { copper: 3, iron: 2 }, displayOrder: 3, prerequisites: ['fieldFabrication'] },
  { id: 'biomeAccess', branch: 'exploration', label: 'Biome Access', description: 'Centralizes biome access progression.', costType: 'steps', costAmount: 1000, displayOrder: 4, prerequisites: [] },

  // ── Research nodes ─────────────────────────────────────────────────────────
  { id: 'efficientMining',  branch: 'mining',     label: 'Efficient Mining',   description: 'Mining actions complete 25% faster.', costType: 'materials', costAmount: 1, materialCosts: { iron: 5 },    displayOrder: 10, prerequisites: [] },
  { id: 'deepVeins',        branch: 'mining',     label: 'Deep Veins',         description: 'Ore drop chance from mine blocks increased by 50%.', costType: 'materials', costAmount: 1, materialCosts: { carbon: 5 }, displayOrder: 11, prerequisites: ['efficientMining'] },
  { id: 'swiftHarvest',     branch: 'gathering',  label: 'Swift Harvest',      description: 'Tree and resource node gather time reduced by 20%.', costType: 'materials', costAmount: 1, materialCosts: { fiber: 5 },   displayOrder: 12, prerequisites: [] },
  { id: 'materialFocus',    branch: 'gathering',  label: 'Material Focus',     description: 'Resource nodes yield +1 material per gather.', costType: 'materials', costAmount: 1, materialCosts: { quartz: 3 },  displayOrder: 13, prerequisites: ['swiftHarvest'] },
  { id: 'combatChip',       branch: 'combat',     label: 'Combat Chip',        description: 'Passively grants +5 Strength.', costType: 'pp', costAmount: 350, displayOrder: 14, prerequisites: [] },
  { id: 'armorCoating',     branch: 'combat',     label: 'Armor Coating',      description: 'Passively grants +5 Defense.', costType: 'pp', costAmount: 350, displayOrder: 15, prerequisites: [] },
  { id: 'energyEfficiency', branch: 'energy',     label: 'Energy Efficiency',  description: 'All energy costs reduced by 1 (minimum 1).', costType: 'materials', costAmount: 1, materialCosts: { copper: 3 },  displayOrder: 16, prerequisites: [] },
];
