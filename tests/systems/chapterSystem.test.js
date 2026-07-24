// Chapter Chain — one number indexes the game (story bosses ⨯ sim wardens).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PPSystem } from '../../js/systems/PPSystem.js';
import { BossSystem } from '../../js/systems/BossSystem.js';
import { ChapterSystem } from '../../js/systems/ChapterSystem.js';

function makeChain() {
  const pp = new PPSystem();
  const bosses = new BossSystem(pp);
  const ch = new ChapterSystem(bosses, pp);
  ch.expedition = { peakTier: 0 };
  ch.ascension = { bestTierEver: 0 };
  return { pp, bosses, ch };
}

test('chain starts at prologue; S1 is chapter 1; wardens need the story rung below', () => {
  const { bosses, ch } = makeChain();
  assert.equal(ch.level, 0);
  assert.equal(ch.headline, 'PROLOGUE');

  // A warden crossed WITHOUT S1 does not advance the chain (contiguous prefix)
  ch.expedition.peakTier = 12;
  assert.equal(ch.current, 0, 'rung 1 (Scrap Tyrant) still blocks');

  bosses.recordDefeat('boss_landing');
  assert.equal(ch.current, 2, 'S1 + W10 both crossed → chapter 2');
  assert.ok(ch.headline.startsWith('CH.2'));
});

test('the full authored chain: seven bosses + six wardens = chapter 13; wardens continue past S7', () => {
  const { bosses, ch } = makeChain();
  for (const def of BossSystem.BOSS_DEFS) bosses.recordDefeat(def.id);
  ch.ascension.bestTierEver = 55;   // wardens 1..5 crossed
  assert.equal(ch.current, 11, 'S1..S6 + W10..W50 — rung 12 wants warden 6');
  ch.ascension.bestTierEver = 65;   // warden 6 → rung 12, then S7 at rung 13
  assert.equal(ch.current, 13);
  ch.ascension.bestTierEver = 75;   // warden 7 → rung 14
  assert.equal(ch.current, 14);
  assert.equal(ch.rungInfo(12).kind, 'warden');
  assert.equal(ch.rungInfo(12).tier, 60);
  assert.equal(ch.rungInfo(14).tier, 70, 'wardens stay contiguous across the new story rung');
});

test('story rungs are odd, gapless, and each maps to a real boss def', () => {
  const rungs = ChapterSystem.STORY.map(s => s.rung);
  assert.deepEqual(rungs, [...rungs].sort((a, b) => a - b), 'STORY must be in rung order');
  rungs.forEach((r, i) => {
    assert.equal(r, 1 + i * 2, `story rung ${i} should be ${1 + i * 2} (odd and gapless)`);
  });
  for (const s of ChapterSystem.STORY) {
    assert.ok(BossSystem.BOSS_DEFS.some(d => d.id === s.boss),
      `STORY rung ${s.rung} references '${s.boss}', which has no BossSystem.BOSS_DEFS entry`);
  }
});

test('adding a story rung never regresses an existing save', () => {
  // A save from the six-boss era: The Unmaker beaten (then rung 11), wardens
  // 1..5, watermark 11. The Rimefather now occupies rung 11, so `current`
  // drops — but the serialized watermark must hold the displayed level.
  const { bosses, ch } = makeChain();
  for (const id of ['boss_landing', 'boss_mine', 'boss_verdant', 'boss_lagoon', 'boss_tundra', 'boss_depths']) {
    bosses.recordDefeat(id);
  }
  ch.ascension.bestTierEver = 55;   // wardens 1..5
  ch.deserialize({ highestEver: 11 });
  assert.equal(ch.current, 10, 'rung 11 (Rimefather) is now unbeaten');
  assert.equal(ch.level, 11, 'watermark holds the old chapter — no tab or zone re-locks');
  bosses.recordDefeat('boss_hollow');
  assert.equal(ch.current, 11, 'the new rung is crossed; rung 12 now wants warden 6');
  ch.ascension.bestTierEver = 65;   // warden 6
  assert.equal(ch.current, 13, 'past the new rung it jumps straight over the already-beaten Unmaker');
});

test('watermark: level never drops even when run state resets', () => {
  const { bosses, ch } = makeChain();
  bosses.recordDefeat('boss_landing');
  ch.expedition.peakTier = 15;
  assert.equal(ch.current, 2);
  ch.expedition.peakTier = 0;       // recompile reset — but ascension watermark took over
  ch.ascension.bestTierEver = 15;
  assert.equal(ch.current, 2, 'bestTierEver carries the warden rung');
  ch.ascension.bestTierEver = 0;    // pathological: even then the chapter watermark holds
  assert.equal(ch.level, 2, 'highestEver watermark backstops the level');
});

test('pre-v13 saves seed from prestigeCount so no tab re-locks', () => {
  const { pp, ch } = makeChain();
  pp.prestigeCount = 3;
  ch.deserialize(null);
  assert.equal(ch.level, 4, 'prestige 3 had TRIALS open → chapter 4');
  pp.prestigeCount = 1;
  const { ch: ch2, pp: pp2 } = makeChain();
  pp2.prestigeCount = 1;
  ch2.deserialize(undefined);
  assert.equal(ch2.level, 1);
});

test('serialize round-trip preserves the watermark', () => {
  const { bosses, ch } = makeChain();
  bosses.recordDefeat('boss_landing');
  assert.equal(ch.current, 1);
  const { ch: fresh } = makeChain();
  fresh.deserialize(JSON.parse(JSON.stringify(ch.serialize())));
  assert.equal(fresh.level, 1);
});
