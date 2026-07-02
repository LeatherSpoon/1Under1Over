export class CraftingMasterySystem {
  constructor({ tracks = [], progress = [], sync = null, telemetry = null } = {}) {
    this.tracks = tracks;
    this.progress = {};
    this.sync = sync;
    this.telemetry = telemetry;
    for (const track of tracks) {
      this.progress[track.id] = { xp: 0, level: 1 };
    }
    for (const row of progress) {
      this.progress[row.trackId] = { xp: row.xp || 0, level: row.level || 1 };
    }
  }

  setDefinitions(tracks) {
    this.tracks = tracks || [];
    for (const track of this.tracks) {
      this.progress[track.id] ||= { xp: 0, level: 1 };
    }
  }

  applyProgress(progress) {
    for (const row of progress || []) {
      this.progress[row.trackId] = { xp: row.xp || 0, level: row.level || 1 };
    }
  }

  getTrack(id) {
    return this.tracks.find(t => t.id === id) || { id, label: id, xpPerLevel: 100 };
  }

  getLevel(id) {
    return this.progress[id]?.level || 1;
  }

  award(trackId, xp) {
    const track = this.getTrack(trackId);
    const current = this.progress[trackId] || { xp: 0, level: 1 };
    const nextXp = current.xp + xp;
    const nextLevel = 1 + Math.floor(nextXp / track.xpPerLevel);
    this.progress[trackId] = { xp: nextXp, level: nextLevel };
    this.telemetry?.trackMastery?.('xp_awarded', trackId, { xp, level: nextLevel });
    if (nextLevel > current.level) {
      this.telemetry?.trackMastery?.('level_gained', trackId, { level: nextLevel });
    }
    this.sync?.recordTransaction('mastery.awardCraftXp', { trackId, xp });
    return this.progress[trackId];
  }

  getCraftTimeMultiplier(trackId) {
    const level = this.getLevel(trackId);
    const reduction = Math.min(0.2, (level - 1) * 0.04);
    return Number((1 - reduction).toFixed(2));
  }

  serialize() {
    return { progress: { ...this.progress } };
  }

  deserialize(data) {
    this.progress = { ...(data?.progress || {}) };
  }
}
