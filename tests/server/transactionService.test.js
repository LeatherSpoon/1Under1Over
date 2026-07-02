import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTransactionService } from '../../server/services/transactionService.js';

function fakeRepo() {
  const accepted = new Set();
  return {
    state: {
      version: 0,
      inventory: { inventory: { copper: 5, iron: 3, timber: 2 }, consumable: {} },
      techUnlocks: [],
      mastery: [],
      wallet: { pp: 200, steps: 1200 }
    },
    definitions: {
      recipes: [
        { id: 'ration', type: 'consumable', outputKey: 'ration', outputQty: 1, category: 'survival', baseTime: 3, minCraftingLevel: 1, requiredTechNode: null, costs: { timber: 2 } }
      ],
      techNodes: [
        { id: 'fieldFabrication', costType: 'pp', costAmount: 150, materialCosts: {}, prerequisites: [] }
      ],
      masteryTracks: [{ id: 'survival', xpPerLevel: 100 }]
    },
    async hasAcceptedEvent(eventId) {
      return accepted.has(eventId);
    },
    async getTransactionContext() {
      return this;
    },
    async recordAccepted(event, result) {
      accepted.add(event.eventId);
      this.state.version = result.version;
    },
    async recordRejected() {},
    async applyInventoryDelta(playerId, itemKey, bucket, delta) {
      this.state.inventory[bucket] ||= {};
      this.state.inventory[bucket][itemKey] = (this.state.inventory[bucket][itemKey] || 0) + delta;
    },
    async updateWalletDelta(playerId, delta) {
      this.state.wallet.pp += delta.pp || 0;
      this.state.wallet.steps += delta.steps || 0;
    },
    async insertCraftingJob() {},
    async completeCraftingJob() {},
    async unlockTech(playerId, techNodeId) {
      this.state.techUnlocks.push(techNodeId);
    },
    async awardMastery(playerId, trackId, xp) {
      const existing = this.state.mastery.find(m => m.trackId === trackId);
      if (existing) existing.xp += xp;
      else this.state.mastery.push({ trackId, xp, level: 1 });
    },
    async getBootstrap(playerId) {
      return { player: { id: playerId, version: this.state.version, ...this.state }, definitions: this.definitions };
    }
  };
}

test('crafting.start consumes materials and accepts event', async () => {
  const repo = fakeRepo();
  const service = createTransactionService(repo);

  const result = await service.applyOne({
    eventId: 'evt-1',
    playerId: 'local-player',
    type: 'crafting.start',
    expectedVersion: 0,
    payload: { localJobId: 'job-1', recipeId: 'ration', startedAt: '2026-04-19T00:00:00.000Z' }
  });

  assert.equal(result.ok, true);
  assert.equal(repo.state.inventory.inventory.timber, 0);
  assert.equal(result.version, 1);
});

test('duplicate event is idempotent', async () => {
  const repo = fakeRepo();
  const service = createTransactionService(repo);
  const event = {
    eventId: 'evt-duplicate',
    playerId: 'local-player',
    type: 'tech.purchase',
    expectedVersion: 0,
    payload: { techNodeId: 'fieldFabrication' }
  };

  const first = await service.applyOne(event);
  const second = await service.applyOne(event);

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(second.duplicate, true);
  assert.equal(repo.state.wallet.pp, 50);
});

test('locked or unaffordable actions are rejected', async () => {
  const repo = fakeRepo();
  repo.state.inventory.inventory.timber = 1;
  const service = createTransactionService(repo);

  const result = await service.applyOne({
    eventId: 'evt-reject',
    playerId: 'local-player',
    type: 'crafting.start',
    expectedVersion: 0,
    payload: { localJobId: 'job-1', recipeId: 'ration', startedAt: '2026-04-19T00:00:00.000Z' }
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'insufficient_materials');
});
