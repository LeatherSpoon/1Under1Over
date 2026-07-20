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

test('the full authored chain: six bosses + five wardens = chapter 11; wardens continue past S6', () => {
  const { bosses, ch } = makeChain();
  for (const def of BossSystem.BOSS_DEFS) bosses.recordDefeat(def.id);
  ch.ascension.bestTierEver = 55;   // wardens 1..5 crossed
  assert.equal(ch.current, 11, 'S1..S6 + W10..W50');
  ch.ascension.bestTierEver = 75;   // wardens 6 and 7 → rungs 12, 13
  assert.equal(ch.current, 13);
  assert.equal(ch.rungInfo(12).kind, 'warden');
  assert.equal(ch.rungInfo(12).tier, 60);
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
