const CODEX_ENTRIES = {
  // ── Materials ──────────────────────────────────────────────────────────────
  copper:         { category: 'Material', label: 'Copper',          flavor: 'A highly conductive metal. Common throughout the sector.' },
  timber:         { category: 'Material', label: 'Timber',          flavor: 'Dense fibrous wood. Burns slow, builds strong.' },
  stone:          { category: 'Material', label: 'Stone',           flavor: 'Compressed mineral aggregate. Ubiquitous on terrestrial worlds.' },
  iron:           { category: 'Material', label: 'Iron',            flavor: 'Ferrous alloy. The backbone of any frontier operation.' },
  carbon:         { category: 'Material', label: 'Carbon',          flavor: 'Crystalline carbon matrix. Prized by fabricators.' },
  quartz:         { category: 'Material', label: 'Quartz',          flavor: 'Silicon dioxide crystals. Resonant in energy systems.' },
  silica:         { category: 'Material', label: 'Silica',          flavor: 'Refined sand particulate. Essential for circuit fabrication.' },
  fiber:          { category: 'Material', label: 'Fiber',           flavor: 'Organic polymer strands. Lightweight and remarkably tensile.' },
  silver:         { category: 'Material', label: 'Silver',          flavor: 'Lustrous noble metal. Rare in these coordinates.' },
  gold:           { category: 'Material', label: 'Gold',            flavor: 'Dense precious metal. High conductivity, higher value.' },
  resin:          { category: 'Material', label: 'Resin',           flavor: 'Organic binding compound. Adhesive and heat-resistant.' },
  epoxy:          { category: 'Material', label: 'Epoxy',           flavor: 'Two-part polymer sealant. Bonds most known alloys.' },
  seed:           { category: 'Material', label: 'Seed',            flavor: 'A preserved growth embryo. Life finds a way.' },
  circuitWire:    { category: 'Material', label: 'Circuit Wire',    flavor: 'Salvaged from combat units. High-gauge conductive filament.' },
  ironSpike:      { category: 'Material', label: 'Iron Spike',      flavor: 'A crude but effective projectile. Battlefield scrap.' },
  powerCore:      { category: 'Material', label: 'Power Core',      flavor: 'Compact energy cell ripped from a hostile unit. Handle with care.' },
  armorPlate:     { category: 'Material', label: 'Armor Plate',     flavor: 'Harvested from a decommissioned combat chassis.' },
  burstCapacitor: { category: 'Material', label: 'Burst Capacitor', flavor: 'Stores high-voltage charges. Unstable if damaged.' },
  logicChip:      { category: 'Material', label: 'Logic Chip',      flavor: 'Microcircuit array. The mind of a machine, reduced to salvage.' },
  titanium:       { category: 'Material', label: 'Titanium',        flavor: 'Extracted from The Depths. Lightweight, near-indestructible. Rarely found near the surface.' },
  tungsten:       { category: 'Material', label: 'Tungsten',        flavor: 'Dense heavy metal from deep strata. Heat-resistant. Industrial-grade cutting edge.' },
  // ── Enemies ────────────────────────────────────────────────────────────────
  rusher:  { category: 'Enemy', label: 'Rusher',  flavor: 'Fast-moving bipedal combat unit. Prioritizes aggression over defense. Minimal shielding.' },
  swinger: { category: 'Enemy', label: 'Swinger', flavor: 'Heavily armored melee fighter. Wind-up attacks carry lethal momentum. Patience wins.' },
  burst:   { category: 'Enemy', label: 'Burst',   flavor: 'Ranged energy emitter. Volatile capacitor banks power its salvos. Stay mobile.' },
  // ── Crafted ────────────────────────────────────────────────────────────────
  terrainCutter:    { category: 'Crafted', label: 'Terrain Cutter',    flavor: 'A powered cutting blade. Clears terrain efficiently. Mind the durability.' },
  chargingStation:  { category: 'Crafted', label: 'Charging Station',  flavor: 'Personal energy restoration module. Plug in, power up, move out.' },
  storageContainer: { category: 'Crafted', label: 'Storage Container', flavor: 'Modular storage unit. More space, fewer trips back to base.' },
  energyCell:       { category: 'Crafted', label: 'Energy Cell',       flavor: 'Field-synthesized power reserve. 50 units of clean energy, on demand.' },
  ration:           { category: 'Crafted', label: 'Ration',            flavor: 'Compressed nutrient block. Keeps you operational between skirmishes.' },
  firstAid:         { category: 'Crafted', label: 'First Aid Kit',     flavor: 'Trauma kit for field wounds. Stops bleeding, restores function.' },
};

export class CodexSystem {
  constructor() {
    this._discovered = new Set();
    this.onDiscover = null; // fn(key, entry)
  }

  discover(key) {
    if (!key || this._discovered.has(key) || !CODEX_ENTRIES[key]) return false;
    this._discovered.add(key);
    if (this.onDiscover) this.onDiscover(key, CODEX_ENTRIES[key]);
    return true;
  }

  isDiscovered(key) { return this._discovered.has(key); }
  get discoveredCount() { return this._discovered.size; }
  get totalCount() { return Object.keys(CODEX_ENTRIES).length; }

  getEntries() {
    return Object.entries(CODEX_ENTRIES).map(([key, entry]) => ({
      key, ...entry, discovered: this._discovered.has(key)
    }));
  }

  serialize() {
    return { discovered: [...this._discovered] };
  }

  load(data) {
    if (data?.discovered) {
      this._discovered = new Set(data.discovered);
    }
  }

  static get ENTRIES() { return CODEX_ENTRIES; }
}
