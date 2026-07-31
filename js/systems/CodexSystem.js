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
  obsidian:       { category: 'Material', label: 'Obsidian',        flavor: 'Volcanic glass from the rift where melt meets ice. Holds an edge finer than steel, and shatters like a grudge.' },
  embermoss:      { category: 'Material', label: 'Embermoss',       flavor: 'Hardy moss that drinks geothermal heat. Stays faintly warm for days after picking.' },
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
  // ── Enemies (native fauna) ───────────────────────────────────────────────────
  serpendrill: { category: 'Enemy', icon: '🐍', label: 'Serpendrill', flavor: 'Drill-nosed cave serpent. Bores through rock and strikes twice before you blink — its venom lingers.' },
  reptlar:     { category: 'Enemy', icon: '🦎', label: 'Reptlar',     flavor: 'Crystal-backed jungle reptile. Plated hide turns aside glancing blows; its bite carries the jungle rot.' },
  dunkraza:    { category: 'Enemy', icon: '👹', label: 'Dunkraza',    flavor: 'Elite guardian posted at the deep shaft. Small, armored, venomous, and quicker than its bulk suggests.' },
  hardlizzy:   { category: 'Enemy', icon: '🐢', label: 'Hard Lizzy',  flavor: 'Armored ankylosaur bulwark. Slow to swing, but the swing lands like a falling glacier.' },
  cavecrab:    { category: 'Enemy', icon: '🦀', label: 'Cave Crab',   flavor: 'Rocky-clawed brute from the lowest strata. Corrosive, relentless, and angrier the longer it fights.' },
  vineclaw:    { category: 'Enemy', icon: '🐆', label: 'Vineclaw',    flavor: 'Lean shadow of the undergrowth, half cat, half creeper. The vines it wears are alive — and so is its appetite.' },
  sporeback:   { category: 'Enemy', icon: '🍄', label: 'Sporeback',   flavor: 'A patient toad beneath a garden of glowing fungus. Knock on the shell and the garden knocks back.' },
  bloomfang:   { category: 'Enemy', icon: '🌺', label: 'Bloomfang',   flavor: 'The prettiest flower in the Maw, and the only one that stalks. Its perfume pulls the fight right out of you.' },
  duskdart:    { category: 'Enemy', icon: '🦎', label: 'Duskdart',    flavor: 'A tree gecko that lives its whole life in the canopy, eyes like two drops of night. Strike at it and you mostly hit the branch it was on.' },
  scalerunner: { category: 'Enemy', icon: '🦎', label: 'Scalerunner', flavor: 'Blue-plated tunneller that treats solid rock like open door. You hear the scrabbling long before you find the hole.' },
  duneplate:   { category: 'Enemy', icon: '🪨', label: 'Duneplate',   flavor: 'A boulder that grew legs and a grudge. Its shell sweats an acid that eats armor while it takes its slow, patient swing.' },
  bramblemaw:  { category: 'Enemy', icon: '🐗', label: 'Bramblemaw',  flavor: 'Thorned shadow of the deep cuts. Every blow it lands makes the next one angrier — end it early or not at all.' },
  frostfang:   { category: 'Enemy', icon: '🐺', label: 'Frostfang',   flavor: 'Shaggy pack-hunter of the white wastes. The icicles in its ruff chime before it strikes — twice, then gone.' },
  glacierback: { category: 'Enemy', icon: '🦬', label: 'Glacierback', flavor: 'A walking shelf of ancient ice. Patient as winter; the swing, when it finally lands, cracks like a calving glacier.' },
  blubberfin:  { category: 'Enemy', icon: '🐧', label: 'Blubberfin',  flavor: 'Round, cheerful, and hungrier than it looks. Every slap of its flippers leaves a cold that saps the will to move.' },
  rimeburrow:  { category: 'Enemy', icon: '🦡', label: 'Rimeburrow',  flavor: 'Blind, shaggy, and built entirely around the two ice picks it calls hands. It hears you coming through the floor long before you see it.' },
  shardback:   { category: 'Enemy', icon: '🦔', label: 'Shardback',   flavor: 'Grows its own armour a shard at a time. Hitting it is easy; hitting it hard enough to matter is the problem.' },
  cryolisk:    { category: 'Enemy', icon: '🦎', label: 'Cryolisk',    flavor: 'Pale, patient, and colder than the stone it sleeps on. The frost it leaves in a wound keeps working long after the fight.' },
  chillwing:   { category: 'Enemy', icon: '🦇', label: 'Chillwing',   flavor: 'Roosts in the high dark and drops without a sound. Half your swings meet the space where it just was.' },
  mossback:    { category: 'Enemy', icon: '🐢', label: 'Mossback',    flavor: 'Grazes the landing meadow under a shell that has been growing its own garden for years. It would rather you went around, and mostly it wins that argument by being too heavy to move.' },
  burrfang:    { category: 'Enemy', icon: '🦊', label: 'Burrfang',    flavor: 'Quick, wiry, and covered in seeds it never asked for. Hunts in threes and commits to none of them — the one that bites you is never the one you were watching.' },
  stiltbeak:   { category: 'Enemy', icon: '🦩', label: 'Stiltbeak',   flavor: 'Stands in the long grass on two absurd legs, perfectly still, until the beak arrives. Opens every fight from further away than seems fair.' },
  // ── Zone bosses ────────────────────────────────────────────────────────────
  boss_landing: { category: 'Boss', icon: '👑', label: 'Scrap Tyrant', flavor: 'Alpha unit of the landing-site scrappers, crowned in salvage. Faster than it looks once wounded.' },
  boss_mine:    { category: 'Boss', icon: '⚒',  label: 'Forge Warden', flavor: 'Ancient foundry guardian. Burns hot, armored deep. It did not build the Breach — it guards the way down.' },
  boss_verdant: { category: 'Boss', icon: '🌿', label: 'Maw Sovereign', flavor: 'The jungle crowned it. Poison and regrowth in equal measure.' },
  boss_lagoon:  { category: 'Boss', icon: '🌊', label: 'Tide Oracle',  flavor: 'Reads the fight three moves ahead. Voltage salvos arrive in fours; the will to focus drains with each.' },
  boss_tundra:  { category: 'Boss', icon: '❄',  label: 'Cryo Monarch', flavor: 'Armored in glacier plate. Half your hits glance off, and it answers the rest doubled.' },
  boss_hollow:  { category: 'Boss', icon: '🦣', label: 'Rimefather',   flavor: 'Every skull in the hollow is one of its children. It has outlived all of them, and the ice it wears is older still.' },
  boss_depths:  { category: 'Boss', icon: '🕳',  label: 'The Unmaker',  flavor: 'Whatever sealed the deep strata, this was left behind to keep it sealed. It accelerates.' },
  // ── Lore ───────────────────────────────────────────────────────────────────
  theLanding: { category: 'Lore', icon: '🛸', label: 'The Landing Site', flavor: 'Where you came down. The pad scorched a clearing; the planet is already growing back over it.' },
  theMine:    { category: 'Lore', icon: '⛏', label: 'The Mine',         flavor: 'An excavation far older than your arrival. Somebody sank these shafts, laid these rails — and left in a hurry.' },
  theDepths:  { category: 'Lore', icon: '🕯', label: 'The Depths',       flavor: 'Below the mine the geology stops making sense. Titanium veins, tungsten seams, and a silence that listens.' },
  theMaw:     { category: 'Lore', icon: '🌿', label: 'The Verdant Maw',  flavor: 'A jungle that glows in the dark and grows visibly while you watch. The flora is not hostile. The things living in it are — some of them all the way up in the canopy.' },
  theCoast:   { category: 'Lore', icon: '🌊', label: 'Lagoon Coast',     flavor: 'Quartz-bright water over silica sand. Beautiful, mineral-rich, and patrolled.' },
  theTundra:  { category: 'Lore', icon: '❄', label: 'The Frozen Tundra', flavor: 'Cold enough to crack steel. Whatever survives out here earned it — respect accordingly.' },
  theHollow:  { category: 'Lore', icon: '🧊', label: 'The Glacial Hollow', flavor: 'A cave mouth in the tundra ridge that exhales cold. Inside: standing ice, old bones, and things that never needed eyes.' },
  theRift:    { category: 'Lore', icon: '♨', label: 'The Meltwater Rift',  flavor: 'Beneath the hollow the glacier rests on warm rock, and the melt runs glowing through the dark. Two sealed ways lead on: a door that predates the ice, and a chasm that breathes heat.' },
  theSunkenCity: { category: 'Lore', icon: '🔱', label: 'Atlantis',        flavor: 'A city that chose the deep. Behind the Breach\'s drowned gate the sea stands in glowing canals between blue-grey ruins, and the Crystal Heart its people left burning still lights the plaza. The water remembers their name.' },
  theLabyrinth: { category: 'Lore', icon: '🐂', label: 'The Labyrinth',    flavor: 'The drowned city\'s back door was never a dead end — it was a threshold. Beyond it: carved stone corridors older than Atlantis itself, brazier-lit, patient. The bull-headed colossus at the heart watches the way to the shrine. It is only a statue. Probably.' },
  theCinderforge: { category: 'Lore', icon: '🌋', label: 'The Cinderforge', flavor: 'The Ember Chasm was never a wound in the rock — it was a chimney. At the bottom: the forge-maze where the World Gates were cast, its crucibles still warm, its lava pools still patient. The Forgemaster stands at the heart of the works, ember-veined, waiting. It is only a statue. Probably.' },
  theShip:    { category: 'Lore', icon: '🚀', label: 'The Ship',         flavor: 'More than transport. Its deeper systems wake as your processing power grows — and they remember the way home.' },
  denSylva:   { category: 'Lore', icon: '🌱', label: "Sylva's Den",      flavor: 'Seed-pod lanterns, drying herbs, tea still warm. The elder has tended this grove longer than your ship has existed.' },
  lodgeBram:  { category: 'Lore', icon: '🪵', label: "Bram's Lodge",     flavor: 'Half-carved staves and a well-worn whetstone. The grovekeeper builds slowly and repairs everything.' },
  burrowSprig: { category: 'Lore', icon: '⚙', label: "Sprig's Burrow",   flavor: 'Brass gadgets in various states of disassembly. The little tinker is convinced your drones are cousins.' },
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
