export class SyncClient {
  constructor({
    baseUrl = 'http://localhost:3000',
    playerId = 'local-player',
    storage = globalThis.localStorage,
    fetchImpl = globalThis.fetch?.bind(globalThis),
    onStatus = null,
    onReconciled = null,
    telemetry = null
  } = {}) {
    this.baseUrl = baseUrl;
    this.playerId = playerId;
    this.storage = storage;
    this.fetch = fetchImpl;
    this.onStatus = onStatus;
    this.onReconciled = onReconciled;
    this.telemetry = telemetry;
    this.status = 'Local';
    this.version = 0;
    this.queueKey = `pp_sync_queue_${playerId}`;
    this.queue = this._loadQueue();
  }

  _setStatus(status) {
    if (this.status === status) return;
    this.status = status;
    this.onStatus?.(status);
    this.telemetry?.trackSyncStatus?.(status, this.queue.length);
  }

  _loadQueue() {
    try {
      return JSON.parse(this.storage.getItem(this.queueKey) || '[]');
    } catch {
      return [];
    }
  }

  _saveQueue() {
    this.storage.setItem(this.queueKey, JSON.stringify(this.queue));
  }

  _eventId() {
    return `evt_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }

  async health() {
    try {
      const response = await this.fetch(`${this.baseUrl}/api/health`);
      const body = await response.json();
      const ok = response.ok && body.ok && body.database;
      this._setStatus(ok ? 'Synced' : 'Local');
      return ok;
    } catch {
      this._setStatus('Local');
      return false;
    }
  }

  async bootstrap() {
    if (!(await this.health())) return null;
    const response = await this.fetch(`${this.baseUrl}/api/bootstrap?playerId=${encodeURIComponent(this.playerId)}`);
    if (!response.ok) {
      this._setStatus('Retry');
      return null;
    }
    const body = await response.json();
    this.version = body.player?.version || 0;
    this.onReconciled?.(body.player, body.definitions);
    this._setStatus('Synced');
    return body;
  }

  async recordTransaction(type, payload) {
    const event = {
      eventId: this._eventId(),
      playerId: this.playerId,
      type,
      createdAt: new Date().toISOString(),
      expectedVersion: this.version,
      payload
    };
    this.queue.push(event);
    this._saveQueue();
    await this.flush();
    return event;
  }

  async flush() {
    if (this.queue.length === 0) return { ok: true };
    if (!this.fetch) {
      this._setStatus('Local');
      return { ok: false };
    }

    this._setStatus('Syncing');
    const started = Date.now();
    try {
      const response = await this.fetch(`${this.baseUrl}/api/sync`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ playerId: this.playerId, transactions: this.queue })
      });
      const body = await response.json();
      if (!response.ok || !body.ok) {
        this._setStatus('Retry');
        this.telemetry?.trackSyncBatch?.(false, this.queue.length, Date.now() - started);
        return body;
      }
      this.queue = [];
      this._saveQueue();
      this.version = body.player?.version || this.version;
      this.onReconciled?.(body.player, body.definitions);
      this.telemetry?.trackSyncBatch?.(true, body.results?.length || 0, Date.now() - started);
      this._setStatus('Synced');
      return body;
    } catch {
      this._setStatus('Local');
      this.telemetry?.trackSyncBatch?.(false, this.queue.length, Date.now() - started);
      return { ok: false };
    }
  }

  // ── Cloud save snapshots (player_save_snapshots) ──────────────────────────

  async uploadSnapshot(snapshot) {
    if (!this.fetch) return false;
    try {
      const response = await this.fetch(`${this.baseUrl}/api/save-snapshot`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...snapshot, playerId: this.playerId })
      });
      const body = await response.json();
      return !!(response.ok && body.ok);
    } catch {
      return false;
    }
  }

  async fetchLatestSnapshot() {
    if (!this.fetch) return null;
    try {
      const response = await this.fetch(`${this.baseUrl}/api/save-snapshot/${encodeURIComponent(this.playerId)}`);
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  // Best-effort upload while the page is closing. text/plain keeps sendBeacon
  // CORS-safelisted (a beacon can't run the preflight a cross-port
  // application/json request requires); the server parses the body as JSON
  // regardless of content-type.
  beaconSnapshot(snapshot) {
    const json = JSON.stringify({ ...snapshot, playerId: this.playerId });
    const nav = globalThis.navigator;
    if (nav?.sendBeacon) {
      try {
        return nav.sendBeacon(`${this.baseUrl}/api/save-snapshot`, new Blob([json], { type: 'text/plain' }));
      } catch {
        return false;
      }
    }
    if (this.fetch) {
      this.fetch(`${this.baseUrl}/api/save-snapshot`, {
        method: 'POST',
        keepalive: true,
        headers: { 'content-type': 'application/json' },
        body: json
      }).catch(() => {});
      return true;
    }
    return false;
  }

  async uploadTelemetrySession(report) {
    try {
      await this.fetch(`${this.baseUrl}/api/telemetry/sessions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...report, playerId: this.playerId })
      });
    } catch {
      this._setStatus('Retry');
    }
  }
}
