import { GENERATIONS, CHUNK, chunkKey, chunkToWorld } from './computerGenerations.js';

/**
 * The Generation Engine's run-time state: the player-built plan (a set of
 * chunk cells on the 6-unit lattice), the door edge, the pending-chunk pool
 * (Pedometer pattern), and the schematic delivery checklist. Pure state —
 * rendering reads it (Environment.buildComputerShell), the world validity
 * mask and the recompile count are injected callbacks so this file stays
 * Node-testable.
 */

const DIRS = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };

function isConnected(plan) {
  if (plan.size === 0) return true;
  const [first] = plan;
  const seen = new Set([first]);
  const queue = [first];
  while (queue.length) {
    const [cx, cz] = queue.pop().split(',').map(Number);
    for (const [dx, dz] of Object.values(DIRS)) {
      const k = chunkKey(cx + dx, cz + dz);
      if (plan.has(k) && !seen.has(k)) { seen.add(k); queue.push(k); }
    }
  }
  return seen.size === plan.size;
}

export class ComputerSystem {
  constructor(inventorySystem) {
    this.inventory = inventorySystem;
    this.generation = 1;
    this.plan = new Set();          // 'cx,cz'
    this.door = null;               // { cx, cz, side }
    this.pendingChunks = GENERATIONS[0].chunkGrant;
    this.delivered = {};            // material → qty toward the next schematic
    this.slotChoices = {};          // reserved: module-slot variants (later round)
    this.colorId = 0;               // reserved: color variants (later round)
    this.onPlanChanged = null;      // wired in main.js → shell rebuild + HUD refresh
    this.onEvolved = null;          // wired in main.js → generation-online toast
    this.getAscensionCount = () => 0; // ascension.ascensionCount (NOT pp.prestigeCount)
    this.isCellValid = () => true;  // world keep-out mask, injected in main.js
  }

  row() { return GENERATIONS[this.generation - 1]; }
  nextRow() { return GENERATIONS[this.generation] || null; }
  hasFounded() { return this.plan.size > 0; }

  // ── Plan ────────────────────────────────────────────────────────────────
  _adjacent(cx, cz) {
    return Object.values(DIRS).some(([dx, dz]) => this.plan.has(chunkKey(cx + dx, cz + dz)));
  }

  canPlace(cx, cz) {
    if (this.pendingChunks <= 0) return false;
    if (this.plan.has(chunkKey(cx, cz))) return false;
    if (this.hasFounded() && !this._adjacent(cx, cz)) return false;
    return this.isCellValid(cx, cz);
  }

  place(cx, cz) {
    if (!this.canPlace(cx, cz)) return false;
    this.plan.add(chunkKey(cx, cz));
    this.pendingChunks--;
    if (!this.door) this.door = { cx, cz, side: 'S' }; // camera-side default
    this.onPlanChanged?.();
    return true;
  }

  canRemove(cx, cz) {
    const key = chunkKey(cx, cz);
    if (!this.plan.has(key)) return false;
    if (this.plan.size <= 1) return false;                          // never un-found
    if (this.door && chunkKey(this.door.cx, this.door.cz) === key) return false;
    const rest = new Set(this.plan);
    rest.delete(key);
    return isConnected(rest);
  }

  remove(cx, cz) {
    if (!this.canRemove(cx, cz)) return false;
    this.plan.delete(chunkKey(cx, cz));
    this.pendingChunks++;
    this.onPlanChanged?.();
    return true;
  }

  // ── Door ────────────────────────────────────────────────────────────────
  isExteriorEdge(cx, cz, side) {
    if (!this.plan.has(chunkKey(cx, cz))) return false;
    const [dx, dz] = DIRS[side];
    return !this.plan.has(chunkKey(cx + dx, cz + dz));
  }

  canSetDoor(cx, cz, side) { return this.isExteriorEdge(cx, cz, side); }

  setDoor(cx, cz, side) {
    if (!this.canSetDoor(cx, cz, side)) return false;
    this.door = { cx, cz, side };
    this.onPlanChanged?.();
    return true;
  }

  /** Door edge midpoint in world units. */
  doorWorld() {
    const { cx, cz, side } = this.door;
    const [x, z] = chunkToWorld(cx, cz);
    const [dx, dz] = DIRS[side];
    return [x + dx * (CHUNK / 2), z + dz * (CHUNK / 2)];
  }

  /** Point 1.5 units outside the door — spawnOverride for leaving the interior. */
  doorOutside() {
    const [x, z] = this.doorWorld();
    const [dx, dz] = DIRS[this.door.side];
    return [x + dx * 1.5, z + dz * 1.5];
  }

  /** Point 1.5 units inside the door — spawnOverride for entering. */
  doorInside() {
    const [x, z] = this.doorWorld();
    const [dx, dz] = DIRS[this.door.side];
    return [x - dx * 1.5, z - dz * 1.5];
  }

  // ── Schematic / evolve ──────────────────────────────────────────────────
  schematic() { return this.nextRow()?.schematic || null; }

  remaining() {
    const s = this.schematic();
    if (!s) return null;
    const out = {};
    for (const [k, q] of Object.entries(s)) {
      const left = q - (this.delivered[k] || 0);
      if (left > 0) out[k] = left;
    }
    return out;
  }

  deliver(mat, qty) {
    const rem = this.remaining();
    if (!rem || !rem[mat]) return 0;
    const held = this.inventory.materials[mat] || 0;
    const n = Math.min(qty, rem[mat], held);
    if (n <= 0) return 0;
    this.inventory.removeMaterial(mat, n);
    this.delivered[mat] = (this.delivered[mat] || 0) + n;
    return n;
  }

  eligible() {
    const n = this.nextRow();
    return !!n && this.getAscensionCount() >= n.eligibility;
  }

  schematicComplete() {
    const rem = this.remaining();
    return rem !== null && Object.keys(rem).length === 0;
  }

  canEvolve() { return this.hasFounded() && this.eligible() && this.schematicComplete(); }

  evolve() {
    if (!this.canEvolve()) return false;
    this.generation++;
    this.pendingChunks += this.row().chunkGrant;
    this.delivered = {};
    this.onPlanChanged?.();
    this.onEvolved?.();
    return true;
  }

  // ── Save ────────────────────────────────────────────────────────────────
  serialize() {
    return {
      generation: this.generation,
      plan: [...this.plan],
      door: this.door ? { ...this.door } : null,
      pendingChunks: this.pendingChunks,
      delivered: { ...this.delivered },
      slotChoices: { ...this.slotChoices },
      colorId: this.colorId,
    };
  }

  deserialize(data) {
    if (!data) return; // pre-v15 save — fresh state stands
    this.generation = data.generation || 1;
    this.plan = new Set(data.plan || []);
    this.door = data.door ? { ...data.door } : null;
    this.pendingChunks = data.pendingChunks ?? 0;
    this.delivered = { ...(data.delivered || {}) };
    this.slotChoices = { ...(data.slotChoices || {}) };
    this.colorId = data.colorId || 0;
  }
}
