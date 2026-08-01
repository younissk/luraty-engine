import { describe, expect, it } from 'vitest';

import { parseUnitKey, unitKey, variety, type Day } from '../../src/model/index.js';
import { germanPack } from '../../src/testing/packs.js';

import { claimsFor, exposuresFor, keysFor, vocabularyOf, wordsIn } from '../../src/core/bulk.js';
import { createProfile, unitState } from '../../src/core/profile.js';
import { record } from '../../src/core/record.js';

/**
 * The bulk helpers.
 *
 * Small enough that the tests are mostly about the two guards, which is where the value is: both
 * exist because the hand-written versions of these loops did NOT have them.
 *
 * @module
 */

const DE = variety('de');
const D = (n: number): Day => n as Day;

describe('vocabularyOf', () => {
  it('keeps frequency order and drops duplicates, first occurrence winning', () => {
    // `haus` and `hause` key to the same lemma, so the second must not appear again — and the rank
    // that survives is the earlier, commoner one.
    const words = vocabularyOf(germanPack, 'der haus hause der brot');
    expect(new Set(words).size).toBe(words.length);
    expect(words[0]).toBe(germanPack.key('der'));
  });

  it('drops surfaces the pack cannot key', () => {
    // ⚠️ THE GUARD THAT MATTERS. `key()` returning empty is not hypothetical — a run of Arabic
    // tatweel is ordinary typography that normalises away to nothing. `unitKey(d, v, '')` mints
    // `"recognise:de:"`, which `parseUnitKey` rejects, so such a unit can never be addressed at all.
    const words = vocabularyOf(germanPack, 'der ... !!! brot');
    for (const w of words) expect(w.length).toBeGreaterThan(0);
  });

  it('is total on junk input', () => {
    expect(vocabularyOf(germanPack, '')).toEqual([]);
    expect(vocabularyOf(germanPack, '   \n\t  ')).toEqual([]);
  });
});

describe('keysFor', () => {
  it('mints only keys that parse back', () => {
    const keys = keysFor('recognise', DE, ['haus', 'brot']);
    for (const k of keys) expect(parseUnitKey(k)).toBeDefined();
    expect(keys).toEqual([unitKey('recognise', DE, 'haus'), unitKey('recognise', DE, 'brot')]);
  });

  it('SKIPS an empty word rather than minting an unaddressable unit', () => {
    // ⚠️ A REGRESSION GUARD FOR A DEFECT A REVIEW FOUND. `record` writes whatever key it is handed,
    // so one empty string in a caller's list put a permanently unaddressable unit in the profile —
    // where it broke `summarize`'s law that the per-skill scopes partition the whole.
    expect(keysFor('recognise', DE, ['haus', '', 'brot'])).toHaveLength(2);
  });

  it('preserves order and does NOT dedupe, because priority takes the first index', () => {
    expect(keysFor('recognise', DE, ['b', 'a', 'b'])).toHaveLength(3);
  });
});

describe('claimsFor', () => {
  it('produces evidence that records a prior and nothing else', () => {
    const p = record(createProfile('de', D(1)), claimsFor('recognise', DE, ['haus', 'brot'], D(1)));
    const haus = unitState(p, unitKey('recognise', DE, 'haus'));
    expect(haus.prior).toEqual({ kind: 'claimed', on: 1 });
    // A claim is not an encounter and buys no rung. Both halves matter.
    expect(haus.seen).toBe(0);
    expect(haus.strength).toBe(0);
    expect(haus.lastAsked).toBe(0);
  });

  it('is equivalent to the hand-written map it replaces', () => {
    const byHand = ['haus', 'brot'].map((w) => ({
      kind: 'claim' as const,
      unit: unitKey('recognise', DE, w),
      day: D(1),
    }));
    expect(claimsFor('recognise', DE, ['haus', 'brot'], D(1))).toEqual(byHand);
  });
});

describe('exposuresFor and wordsIn', () => {
  it('turns a passage into evidence that proves nothing', () => {
    const text = 'Der Mann geht aus dem Haus.';
    const p = record(
      createProfile('de', D(1)),
      exposuresFor('recognise', DE, wordsIn(germanPack, text), D(1)),
    );
    for (const state of Object.values(p.units)) {
      expect(state.seen).toBe(1);
      expect(state.lastSeen).toBe(1);
      // The whole point: reading moves nothing that schedules and nothing that is trusted.
      expect(state.lastAsked).toBe(0);
      expect(state.lastProven).toBe(0);
      expect(state.strength).toBe(0);
    }
  });

  it('dedupes a repeated word within one passage', () => {
    // A passage says `der` five times; she met the word once.
    const words = wordsIn(germanPack, 'der der der Mann der der');
    expect(new Set(words).size).toBe(words.length);
  });

  it('is total on text the pack finds no words in', () => {
    expect(wordsIn(germanPack, '???  ...')).toEqual([]);
    expect(exposuresFor('recognise', DE, [], D(1))).toEqual([]);
  });
});
