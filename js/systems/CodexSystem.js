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
  elastomer:      { category: 'Material', label: 'Elastomer',       flavor: 'Flexible synthetic polymer. Stretches, seals, and springs back.' },
  magnet:         { category: 'Material', label: 'Magnet',          flavor: 'Ferromagnetic core. Pulls its weight in any servo assembly.' },
  glass:          { category: 'Material', label: 'Glass',           flavor: 'Vitrified silica pane. Fragile alone, essential everywhere.' },
  lumber:         { category: 'Material', label: 'Lumber',          flavor: 'Milled timber planks. Civilization, one board at a time.' },
  // ── Factory chain (Refinery raw → refined → components → modules) ──────────
  silica_sand:            { category: 'Component', label: 'Silica Sand',            flavor: 'Unrefined granular silica. A desert of circuits yet to come.' },
  ferrous_ore:            { category: 'Component', label: 'Ferrous Ore',            flavor: 'Raw iron-bearing rock. Smelts down to honest steel.' },
  carbon_biomass:         { category: 'Component', label: 'Carbon Biomass',         flavor: 'Compressed organic matter. Fuel, feedstock, fertilizer.' },
  silicon_wafer:          { category: 'Component', label: 'Silicon Wafer',          flavor: 'Polished crystalline substrate. A blank canvas for logic.' },
  steel_ingot:            { category: 'Component', label: 'Steel Ingot',            flavor: 'Refined structural alloy. The frontier is built on these.' },
  synthetic_resin:        { category: 'Component', label: 'Synthetic Resin',        flavor: 'Engineered polymer binder. Cures harder than what it joins.' },
  logic_processor:        { category: 'Component', label: 'Logic Processor',        flavor: 'Assembled computation core. Thinks faster than its maker.' },
  mechanical_servo:       { category: 'Component', label: 'Mechanical Servo',       flavor: 'Precision actuator assembly. Motion, on demand.' },
  energy_capacitor:       { category: 'Component', label: 'Energy Capacitor',       flavor: 'High-density charge bank. Handle grounded.' },
  quantum_processor_ring: { category: 'Component', label: 'Quantum Processor Ring', flavor: 'Toroidal computation lattice. Calculates in superposition.' },
  exo_servo_harness:      { category: 'Component', label: 'Exo-Servo Harness',      flavor: 'Full-frame strength augment. The suit does the lifting.' },
  aegis_capacitor_bank:   { category: 'Component', label: 'Aegis Capacitor Bank',   flavor: 'Layered defensive charge array. Absorbs what would kill.' },
  // ── Enemies ────────────────────────────────────────────────────────────────
  rusher:      { category: 'Enemy', icon: '🤖', label: 'Scrapper',   flavor: 'Fast-moving bipedal combat unit. Prioritizes aggression over defense. Minimal shielding.' },
  swinger:     { category: 'Enemy', icon: '🦾', label: 'Brute',      flavor: 'Heavily armored melee fighter. Wind-up attacks carry lethal momentum. Patience wins.' },
  burst:       { category: 'Enemy', icon: '💥', label: 'Glitch',     flavor: 'Ranged energy emitter. Volatile capacitor banks power its salvos. Stay mobile.' },
  stinger:     { category: 'Enemy', icon: '🐝', label: 'Vespid',     flavor: 'Agile insectoid frame. Venom-tipped strikes — keep an antidote handy.' },
  pyro:        { category: 'Enemy', icon: '🔥', label: 'Cinderling', flavor: 'Thermal core runs white-hot. Its strikes ignite, and the burn outlasts the fight.' },
  arc:         { category: 'Enemy', icon: '⚡', label: 'Voltgeist',  flavor: 'Discharges stored voltage in rapid salvos. The shock slows your footwork.' },
  corroder:    { category: 'Enemy', icon: '🧪', label: 'Rustmaw',    flavor: 'Slow, heavy, and dripping with acid. Corrosion eats through armor plating.' },
  bulwark:     { category: 'Enemy', icon: '🛡', label: 'Bulwark',    flavor: 'A walking fortress. Flat plating shrugs off weak hits — bring real firepower.' },
  siphon:      { category: 'Enemy', icon: '🌀', label: 'Siphon',     flavor: 'Feeds on focus. Every hit drains your reserves before your health.' },
  regenerator: { category: 'Enemy', icon: '🧬', label: 'Mitogel',    flavor: 'Self-repairing gel chassis. Kill it faster than it knits itself back together.' },
  longshot:    { category: 'Enemy', icon: '🎯', label: 'Longshot',   flavor: 'A railgun on legs. Telegraphs every shot — the shot still hurts.' },
  rampant:     { category: 'Enemy', icon: '💢', label: 'Rampant',    flavor: 'Combat governor removed. The longer it fights, the harder it hits.' },
  specter:     { category: 'Enemy', icon: '👻', label: 'Specter',    flavor: 'Phase-shifted hull. A quarter of your strikes pass straight through it.' },
  // ── Zone bosses ────────────────────────────────────────────────────────────
  boss_landing: { category: 'Boss', icon: '👑', label: 'Scrap Tyrant', flavor: 'Alpha unit of the landing-site scrappers, crowned in salvage. Faster than it looks once wounded.' },
  boss_mine:    { category: 'Boss', icon: '⚒',  label: 'Forge Warden', flavor: 'Ancient foundry guardian. Burns hot, armored deep. It did not build the Breach — it guards the way down.' },
  boss_verdant: { category: 'Boss', icon: '🌿', label: 'Maw Sovereign', flavor: 'The jungle crowned it. Poison and regrowth in equal measure.' },
  boss_lagoon:  { category: 'Boss', icon: '🌊', label: 'Tide Oracle',  flavor: 'Reads the fight three moves ahead. Voltage salvos arrive in fours; the will to focus drains with each.' },
  boss_tundra:  { category: 'Boss', icon: '❄',  label: 'Cryo Monarch', flavor: 'Armored in glacier plate. Half your hits glance off, and it answers the rest doubled.' },
  boss_depths:  { category: 'Boss', icon: '🕳',  label: 'The Unmaker',  flavor: 'Whatever sealed the deep strata, this was left behind to keep it sealed. It accelerates.' },
  // ── Lore ───────────────────────────────────────────────────────────────────
  theLanding: { category: 'Lore', icon: '🛸', label: 'The Landing Site', flavor: 'Where you came down. The pad scorched a clearing; the planet is already growing back over it.' },
  theMine:    { category: 'Lore', icon: '⛏', label: 'The Mine',         flavor: 'An excavation far older than your arrival. Somebody sank these shafts, laid these rails — and left in a hurry.' },
  theDepths:  { category: 'Lore', icon: '🕯', label: 'The Depths',       flavor: 'Below the mine the geology stops making sense. Titanium veins, tungsten seams, and a silence that listens.' },
  theMaw:     { category: 'Lore', icon: '🌿', label: 'The Verdant Maw',  flavor: 'A jungle that grows visibly while you watch. The flora is not hostile. The things living in it are.' },
  theCoast:   { category: 'Lore', icon: '🌊', label: 'Lagoon Coast',     flavor: 'Quartz-bright water over silica sand. Beautiful, mineral-rich, and patrolled.' },
  theTundra:  { category: 'Lore', icon: '❄', label: 'The Frozen Tundra', flavor: 'Cold enough to crack steel. Whatever survives out here earned it — respect accordingly.' },
  theShip:    { category: 'Lore', icon: '🚀', label: 'The Ship',         flavor: 'More than transport. Its deeper systems wake as your processing power grows — and they remember the way home.' },
  theBreach:  { category: 'Lore', icon: '🌀', label: 'The Breach',       flavor: 'The miners were digging for gold. They found a door. A chamber of standing stones, deep beneath the rock, whose gates open onto other worlds entirely.' },
  // ── Crafted ────────────────────────────────────────────────────────────────
  terrainCutter:    { category: 'Crafted', label: 'Terrain Cutter',    flavor: 'A powered cutting blade. Clears terrain efficiently. Mind the durability.' },
  rockDrill:        { category: 'Crafted', label: 'Rock Drill',        flavor: 'Percussion bore for ore veins. The mine gives nothing up without it.' },
  harvestBlade:     { category: 'Crafted', label: 'Harvest Blade',     flavor: 'Curved mono-edge for organics. Gathers in one motion what hands take three.' },
  diveTool:         { category: 'Crafted', label: 'Dive Tool',         flavor: 'Sealed hydro-extractor. Opens the coast\'s underwater deposits.' },
  cryoPick:         { category: 'Crafted', label: 'Cryo-Pick',         flavor: 'Thermally hardened pick. Ice that cracks steel meets its match.' },
  chargingStation:  { category: 'Crafted', label: 'Charging Station',  flavor: 'Personal energy restoration module. Plug in, power up, move out.' },
  storageContainer: { category: 'Crafted', label: 'Storage Container', flavor: 'Modular storage unit. More space, fewer trips back to base.' },
  energyCell:       { category: 'Crafted', label: 'Energy Cell',       flavor: 'Field-synthesized power reserve. 50 units of clean energy, on demand.' },
  ration:           { category: 'Crafted', label: 'Ration',            flavor: 'Compressed nutrient block. Keeps you operational between skirmishes.' },
  firstAid:         { category: 'Crafted', label: 'First Aid Kit',     flavor: 'Trauma kit for field wounds. Stops bleeding, restores function.' },
  ironPatch:        { category: 'Crafted', label: 'Iron Patch',        flavor: 'Crude hull plating for field repairs. Ugly, heavy, effective.' },
  signalFlare:      { category: 'Crafted', label: 'Signal Flare',      flavor: 'Quartz-carbon flash compound. Someone — or something — will see it.' },
  repairKit:        { category: 'Crafted', label: 'Repair Kit',        flavor: 'Resin, wire, and patience. Restores tool durability in the field.' },
  antidote:         { category: 'Crafted', label: 'Antidote',          flavor: 'Broad-spectrum counteragent. The Maw\'s venom meets its answer.' },
  basicBlade:       { category: 'Crafted', label: 'Basic Blade',       flavor: 'Iron edge on a timber grip. The first argument the Scrappers respect.' },
  basicShield:      { category: 'Crafted', label: 'Basic Shield',      flavor: 'Iron-banded timber round. What it lacks in style it stops in strikes.' },
  basicArmor:       { category: 'Crafted', label: 'Basic Armor',       flavor: 'Iron plates on fiber weave. Turns lethal hits into survivable ones.' },
  copperRing:       { category: 'Crafted', label: 'Copper Ring',       flavor: 'A conductive band worn against the skin. Focus flows a little easier.' },
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
