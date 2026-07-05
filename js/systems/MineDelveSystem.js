// Tracks the current Mine delve: the seed that generated this cave and which
// ore cells have been mined out. A delve re-rolls (fresh seed, cleared cells)
// only when the player descends into the Mine from Landing Site.
export class MineDelveSystem {
  constructor() {
    this._seed = (Math.random() * 0xffffffff) >>> 0;
    this._minedCells = new Set();
    this._armed = false;
  }

  get seed() { return this._seed; }
  get armed() { return this._armed; }

  // Surfacing arms the next descent to start a fresh delve.
  arm() { this._armed = true; }

  // Begin a fresh delve: new seed, no depleted blocks, disarmed.
  startNewDelve() {
    this._seed = (Math.random() * 0xffffffff) >>> 0;
    this._minedCells.clear();
    this._armed = false;
  }

  recordMined(c, r) { this._minedCells.add(`${c},${r}`); }
  isMined(c, r) { return this._minedCells.has(`${c},${r}`); }

  serialize() {
    return { seed: this._seed, minedCells: [...this._minedCells] };
  }

  load(data) {
    if (!data) return;
    this._seed = (data.seed ?? this._seed) >>> 0;
    this._minedCells = new Set(data.minedCells || []);
    this._armed = false;
  }
}
