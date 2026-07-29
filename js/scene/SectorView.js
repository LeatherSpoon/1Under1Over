/**
 * SectorView.js — zone-agnostic spatial streaming for large maps.
 *
 * A SectorView buckets items into a square grid and materializes each bucket's
 * visuals only while the player is near it, tearing them down again once the
 * player is well clear. Gameplay state is NOT owned here: an item's logical
 * existence is the caller's business, and only its `THREE.Object3D` comes and
 * goes. That split is what lets a 100×100 biome hold thousands of props at a
 * constant frame cost.
 *
 * This generalizes the pattern the Mine proved (see zones/Mine/index.js) so
 * every large zone can use it. Three things it adds over the Mine's version:
 *   • `persistent` items, which materialize once and never tear down — the
 *     design's "major landmarks stay legible at distance" requirement.
 *   • Sector-scoped collision, so dressing you cannot see cannot block you.
 *   • A movement epsilon, so a stationary player costs nothing per frame.
 *
 * ── Item contract ───────────────────────────────────────────────────────────
 *   {
 *     x, z            world position (drives which sector owns it)
 *     materialize()   → THREE.Object3D | null. Must be deterministic: the same
 *                       item must produce the same visual every time, since it
 *                       may be built and torn down many times per session.
 *                       Use spatialRng() for any per-item variation.
 *     dispose?(obj)   optional teardown; the view always removes obj from the
 *                       group, so this is only for extra cleanup
 *     r?              collision radius; present → the item blocks movement
 *                       while its sector is active
 *     persistent?     true → materialize on first update, never tear down
 *   }
 *
 * ── Usage ───────────────────────────────────────────────────────────────────
 *   const sectors = new SectorView({ group: env.group });
 *   for (const p of props) sectors.add({ x: p.x, z: p.z, r: p.r, materialize: ... });
 *   // in the game loop:
 *   sectors.update(player.position);
 *   // on zone switch:
 *   sectors.clear();
 */

/** mulberry32 — same generator the rest of the scene code uses. */
function seededRandom(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic RNG for a point in space. The same (seed, ix, iz) always yields
 * the same stream, so a prop's variant/rotation survives any number of
 * materialize/dispose round trips — and editing one region's seed cannot
 * reshuffle another's.
 */
export function spatialRng(seed, ix, iz) {
  return seededRandom((seed ^ Math.imul(ix + 1, 73856093) ^ Math.imul(iz + 1, 19349663)) | 0);
}

// Defaults tuned by measurement against a 100×100 map holding 841 props, at the
// worst-case player position (map centre). Generous radii make sectoring a
// no-op at this size — 56/72 left 96% of props live, i.e. it bought nothing:
//
//   size 16, 56/72 → 96% live      size 10, 40/56 → 66% live
//   size 16, 34/48 → 60% live      size 10, 34/48 → 50% live   ← chosen
//   size  8, 34/48 → 51% live (196 sectors to scan, no real gain over size 10)
//
// activateR 34 sits ~7 units beyond the camera's widest reach (~27 — see the
// implementation plan's F5), so a sector materializes before it can be seen
// even at high speed, and the 14-unit hysteresis band is ~0.7 s at 20 u/s.
// The Mine's cave-tuned 36/44 are deliberately not the default here. Phase 2
// finalizes these against real traversal at the real camera.
const DEFAULT_SECTOR_SIZE = 10;
const DEFAULT_ACTIVATE_R = 34;
const DEFAULT_DEACTIVATE_R = 48;

// Re-scanning only after the player has moved this far keeps a standing player
// free. Small enough that it cannot skip a transition at any real speed.
const SCAN_EPSILON = 0.5;

export class SectorView {
  constructor({
    group,
    sectorSize = DEFAULT_SECTOR_SIZE,
    activateR = DEFAULT_ACTIVATE_R,
    deactivateR = DEFAULT_DEACTIVATE_R,
  }) {
    if (!group) throw new Error('SectorView requires a THREE.Group to add into');
    if (deactivateR <= activateR) {
      throw new Error('SectorView needs deactivateR > activateR for hysteresis');
    }

    this.group = group;
    this.sectorSize = sectorSize;
    this.activateR = activateR;
    this.deactivateR = deactivateR;

    this.sectors = new Map();     // "ix,iz" → sector
    this.persistent = [];         // items that never tear down
    this.collisionCircles = [];   // live blockers, rebuilt on any change
    this.version = 0;             // bumps whenever collisionCircles changes

    this._lastScan = null;
    this._persistentBuilt = false;
  }

  /** Bucket an item. Call before the first update(); order does not matter. */
  add(item) {
    if (item.persistent) {
      this.persistent.push(item);
      return item;
    }
    const ix = Math.floor(item.x / this.sectorSize);
    const iz = Math.floor(item.z / this.sectorSize);
    const key = `${ix},${iz}`;
    let sec = this.sectors.get(key);
    if (!sec) {
      sec = {
        key, ix, iz, active: false,
        minX: ix * this.sectorSize, maxX: (ix + 1) * this.sectorSize,
        minZ: iz * this.sectorSize, maxZ: (iz + 1) * this.sectorSize,
        pad: 0, items: [], objects: [],
      };
      this.sectors.set(key, sec);
    }
    sec.items.push(item);
    // Pad the sector by its widest blocker so an item straddling the border
    // still activates before the player can reach it.
    if (item.r > sec.pad) sec.pad = item.r;
    return item;
  }

  /** Distance from a point to a sector's padded bounds (0 when inside). */
  _distanceTo(sec, x, z) {
    const dx = Math.max(sec.minX - sec.pad - x, 0, x - (sec.maxX + sec.pad));
    const dz = Math.max(sec.minZ - sec.pad - z, 0, z - (sec.maxZ + sec.pad));
    return Math.hypot(dx, dz);
  }

  /** Drive from the game loop with the player's position. */
  update(pos) {
    if (!this._persistentBuilt) {
      this._persistentBuilt = true;
      for (const item of this.persistent) this._materialize(item, null);
      this._rebuildCollision();
    }

    if (this._lastScan) {
      const moved = Math.hypot(pos.x - this._lastScan.x, pos.z - this._lastScan.z);
      if (moved < SCAN_EPSILON) return;
    }
    this._lastScan = { x: pos.x, z: pos.z };

    let changed = false;
    for (const sec of this.sectors.values()) {
      const d = this._distanceTo(sec, pos.x, pos.z);
      if (!sec.active && d < this.activateR) {
        this._activate(sec);
        changed = true;
      } else if (sec.active && d > this.deactivateR) {
        this._deactivate(sec);
        changed = true;
      }
    }
    if (changed) this._rebuildCollision();
  }

  _activate(sec) {
    sec.active = true;
    for (const item of sec.items) this._materialize(item, sec);
  }

  _deactivate(sec) {
    sec.active = false;
    for (const item of sec.items) {
      if (!item._obj) continue;
      this.group.remove(item._obj);
      if (item.dispose) item.dispose(item._obj);
      item._obj = null;
    }
    sec.objects.length = 0;
  }

  _materialize(item, sec) {
    const obj = item.materialize();
    if (!obj) return;
    item._obj = obj;
    this.group.add(obj);
    if (sec) sec.objects.push(obj);
  }

  /**
   * Rebuild the live blocker list. Only active sectors and persistent items
   * contribute, so collision and visuals can never disagree.
   */
  _rebuildCollision() {
    const out = [];
    for (const item of this.persistent) {
      if (item.r > 0 && item._obj) out.push({ x: item.x, z: item.z, r: item.r });
    }
    for (const sec of this.sectors.values()) {
      if (!sec.active) continue;
      for (const item of sec.items) {
        if (item.r > 0) out.push({ x: item.x, z: item.z, r: item.r });
      }
    }
    this.collisionCircles = out;
    this.version++;
  }

  /** Tear everything down — call on zone switch. */
  clear() {
    for (const sec of this.sectors.values()) {
      if (sec.active) this._deactivate(sec);
    }
    for (const item of this.persistent) {
      if (!item._obj) continue;
      this.group.remove(item._obj);
      if (item.dispose) item.dispose(item._obj);
      item._obj = null;
    }
    this.sectors.clear();
    this.persistent.length = 0;
    this.collisionCircles = [];
    this._lastScan = null;
    this._persistentBuilt = false;
    this.version++;
  }

  /** Counts for profiling and tests. */
  get stats() {
    let active = 0, live = 0, items = this.persistent.length;
    for (const sec of this.sectors.values()) {
      items += sec.items.length;
      if (sec.active) { active++; live += sec.items.length; }
    }
    for (const item of this.persistent) if (item._obj) live++;
    return { sectors: this.sectors.size, active, items, live };
  }
}
