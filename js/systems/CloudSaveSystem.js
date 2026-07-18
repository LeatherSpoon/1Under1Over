// ── Cloud Save System ────────────────────────────────────────────────────────
// Autosaves the full save blob to the optional Postgres server
// (player_save_snapshots) and restores the latest snapshot on boot — the
// game's automatic persistence plus desktop ↔ phone continuity (both devices
// share the 'local-player' id against the same server). Local-first: every
// path is a silent no-op while the server is unreachable.

const TOGGLE_KEY = 'pp_cloud_saves_enabled';

export class CloudSaveSystem {
  constructor({ sync, saveSystem, getZone, getPlayerPos, intervalMs = 60000, storage = globalThis.localStorage }) {
    this.sync = sync;
    this.saveSystem = saveSystem;
    this.getZone = getZone;
    this.getPlayerPos = getPlayerPos;
    this.intervalMs = intervalMs;
    this.storage = storage;
    this._lastUploaded = null;
    this._timer = null;
  }

  // Enabled unless explicitly toggled off — the toggle exists so god-mode
  // test sessions don't silently overwrite the real cloud save.
  get enabled() {
    try { return this.storage?.getItem(TOGGLE_KEY) !== '0'; } catch { return true; }
  }

  setEnabled(on) {
    try { this.storage?.setItem(TOGGLE_KEY, on ? '1' : '0'); } catch { /* private mode */ }
  }

  start() {
    if (this._timer) return;
    this._timer = setInterval(() => { this.uploadIfChanged(); }, this.intervalMs);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') this._flushBeacon();
      });
      globalThis.addEventListener('pagehide', () => this._flushBeacon());
    }
  }

  _buildSnapshot() {
    const { x, z } = this.getPlayerPos();
    return this.saveSystem.buildSaveData(this.getZone(), x, z);
  }

  /** Upload a snapshot unless the state is identical to the last upload
   *  (timestamp excluded). Returns 'disabled' | 'skipped' | 'saved' | 'offline'. */
  async uploadIfChanged() {
    if (!this.enabled) return 'disabled';
    const data = this._buildSnapshot();
    const fingerprint = JSON.stringify({ ...data, timestamp: 0 });
    if (fingerprint === this._lastUploaded) return 'skipped';
    const ok = await this.sync.uploadSnapshot(data);
    if (ok) this._lastUploaded = fingerprint;
    return ok ? 'saved' : 'offline';
  }

  _flushBeacon() {
    if (!this.enabled) return;
    try { this.sync.beaconSnapshot(this._buildSnapshot()); } catch (_) { /* best-effort */ }
  }

  /** Latest cloud snapshot, or null when offline / none stored. */
  async fetchLatest() {
    const snap = await this.sync.fetchLatestSnapshot();
    return snap && snap.version ? snap : null;
  }
}
