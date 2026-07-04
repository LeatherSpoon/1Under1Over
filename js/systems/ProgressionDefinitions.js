import {
  MATERIALS,
  MASTERY_TRACKS,
  RECIPES,
  TECH_NODES,
} from '../../server/definitions/seedData.js';

export function createLocalDefinitions() {
  return {
    version: 'postgres-seed-fallback-1',
    materials: MATERIALS.map(material => ({
      id: material.id,
      label: material.label,
      stackLimit: material.stackLimit,
      rarity: material.rarity,
      droneGatherable: material.droneGatherable,
    })),
    masteryTracks: MASTERY_TRACKS.map(track => ({ ...track })),
    techNodes: TECH_NODES.map(node => ({
      ...node,
      materialCosts: { ...(node.materialCosts || {}) },
      prerequisites: [...(node.prerequisites || [])],
    })),
    recipes: RECIPES.map(recipe => ({
      ...recipe,
      costs: { ...(recipe.costs || {}) },
      statBonuses: { ...(recipe.statBonuses || {}) },
    })),
  };
}

export function normalizeRecipesForCrafting(definitions) {
  const map = {};
  for (const recipe of definitions.recipes || []) {
    map[recipe.id] = {
      label: recipe.label,
      type: recipe.type,
      key: recipe.outputKey,
      slot: recipe.slot,
      tier: recipe.tier,
      statBonuses: recipe.statBonuses,
      materials: { ...(recipe.costs || {}) },
      baseTime: recipe.baseTime,
      minCraftingLevel: recipe.minCraftingLevel,
      requiredTechNode: recipe.requiredTechNode || null,
      masteryCategory: recipe.category
    };
  }
  return map;
}
