import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TelemetrySystem } from '../../js/TelemetrySystem.js';

test('telemetry tracks sync and progression events', () => {
  global.window = { addEventListener() {}, removeEventListener() {} };
  global.localStorage = {
    getItem() { return '[]'; },
    setItem() {},
    removeItem() {}
  };

  const telemetry = new TelemetrySystem();
  try {
    telemetry.trackSyncStatus('Syncing', 3);
    telemetry.trackSyncBatch(true, 3, 42);
    telemetry.trackTechNode('purchased', 'fieldFabrication', {});
    telemetry.trackMastery('level_gained', 'survival', { level: 2 });

    assert.equal(telemetry.actions.sync_status_change, 1);
    assert.equal(telemetry.session.syncBatchesSucceeded, 1);
    assert.equal(telemetry.session.techNodesPurchased.fieldFabrication, 1);
    assert.equal(telemetry.session.masteryLevelsGained.survival, 1);
  } finally {
    clearInterval(telemetry._heartbeat);
  }
});
