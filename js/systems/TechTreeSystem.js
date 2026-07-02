function labelFromId(id) {
  return id.replace(/[A-Z]/g, m => ` ${m}`).replace(/^./, c => c.toUpperCase());
}

export class TechTreeSystem {
  constructor({ nodes = [], owned = [], sync = null, telemetry = null } = {}) {
    this.nodes = nodes;
    this.owned = new Set(owned);
    this.sync = sync;
    this.telemetry = telemetry;
    this.onPurchase = null; // fn(id) — called after successful purchase
  }

  setDefinitions(nodes) {
    this.nodes = nodes || [];
  }

  applyOwned(owned) {
    this.owned = new Set(owned || []);
  }

  getNode(id) {
    return this.nodes.find(n => n.id === id) || null;
  }

  getNodeState(id, systems) {
    const node = this.getNode(id);
    if (!node) return { exists: false, locked: true, affordable: false, owned: false, reason: 'Missing tech node' };
    const owned = this.owned.has(id);
    const missingPrereq = (node.prerequisites || []).find(req => !this.owned.has(req));
    if (missingPrereq) {
      return { exists: true, node, owned, locked: true, affordable: false, reason: `Requires ${labelFromId(missingPrereq)}` };
    }
    const affordable = this._canAfford(node, systems);
    return { exists: true, node, owned, locked: false, affordable, reason: affordable ? '' : this._costReason(node) };
  }

  _costReason(node) {
    if (node.costType === 'pp') return `${node.costAmount} PP`;
    if (node.costType === 'steps') return `${node.costAmount} steps`;
    if (node.costType === 'materials') return Object.entries(node.materialCosts || {}).map(([m, q]) => `${m} x${q}`).join(', ');
    return 'Unknown cost';
  }

  _canAfford(node, systems) {
    if (this.owned.has(node.id)) return false;
    if (node.costType === 'pp') return (systems.pp?.ppTotal || 0) >= node.costAmount;
    if (node.costType === 'steps') return (systems.pedometer?.totalSteps || 0) >= node.costAmount;
    if (node.costType === 'materials') {
      return Object.entries(node.materialCosts || {}).every(([mat, qty]) => (systems.inventory?.materials?.[mat] || 0) >= qty);
    }
    return false;
  }

  async purchase(id, systems) {
    const state = this.getNodeState(id, systems);
    this.telemetry?.trackTechNode?.('purchase_attempt', id, state);
    if (!state.exists || state.locked || !state.affordable || state.owned) return false;

    const node = state.node;
    if (node.costType === 'pp') systems.pp.ppTotal -= node.costAmount;
    if (node.costType === 'steps') systems.pedometer.totalSteps -= node.costAmount;
    if (node.costType === 'materials') {
      for (const [mat, qty] of Object.entries(node.materialCosts || {})) {
        systems.inventory.removeMaterial(mat, qty);
      }
    }

    this.owned.add(id);
    if (this.onPurchase) this.onPurchase(id);
    await this.sync?.recordTransaction('tech.purchase', { techNodeId: id });
    this.telemetry?.trackTechNode?.('purchased', id, state);
    return true;
  }

  serialize() {
    return { owned: [...this.owned] };
  }

  deserialize(data) {
    this.applyOwned(data?.owned || []);
  }
}
