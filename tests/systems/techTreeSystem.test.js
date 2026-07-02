import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TechTreeSystem } from '../../js/systems/TechTreeSystem.js';

test('tech tree reports affordable PP node', () => {
  const tech = new TechTreeSystem({
    nodes: [{ id: 'fieldFabrication', costType: 'pp', costAmount: 150, materialCosts: {}, prerequisites: [] }]
  });
  const state = tech.getNodeState('fieldFabrication', {
    pp: { ppTotal: 200 },
    pedometer: { totalSteps: 0 },
    inventory: { materials: {} }
  });
  assert.equal(state.affordable, true);
  assert.equal(state.owned, false);
});

test('tech tree blocks unmet prerequisites', () => {
  const tech = new TechTreeSystem({
    nodes: [{ id: 'terrainControl', costType: 'materials', costAmount: 1, materialCosts: { copper: 1 }, prerequisites: ['fieldFabrication'] }]
  });
  const state = tech.getNodeState('terrainControl', {
    pp: { ppTotal: 0 },
    pedometer: { totalSteps: 0 },
    inventory: { materials: { copper: 5 } }
  });
  assert.equal(state.locked, true);
  assert.equal(state.reason, 'Requires Field Fabrication');
});
