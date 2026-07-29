import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { unitKey, variety, type Day } from '../model/ids.js';
import { isKnown, KNOWN_AT_STRENGTH, MAX_STRENGTH } from '../model/unit.js';
import { arbEvidence } from '../testing/evidence.js';

import { STUCK_AFTER_LAPSES } from './plan.js';
import { createProfile } from './profile.js';
import { record } from './record.js';
import { summarize } from './summary.js';

/**
 * The snapshot the host persists and diffs.
 *
 * @module
 */

const AR = variety('ar-msa')!;
const LEV = variety('ar-levantine')!;
const WORDS = ['سوق', 'كتاب', 'مدرسة', 'بيت', 'ماء'];
const D = (n: number): Day => n as Day;

const anyProfile = fc
  .array(
    fc.oneof(
      arbEvidence({ variety: AR, words: WORDS, maxDay: 200 }),
      arbEvidence({ variety: LEV, words: WORDS, maxDay: 200 }),
    ),
    { maxLength: 80 },
  )
  .map((evidence) => record(createProfile('ar', D(200)), evidence));

describe('summarize — laws', () => {
  it('partitions the claimed set exactly into standing, confirmed and refuted', () => {
    // ⚠️ THE LAW BEHIND THE ONE SENTENCE A HERITAGE SPEAKER ACTUALLY WANTS: "of the 800 words you
    // said you knew, 430 checked out, 210 are still unchecked, and 160 did not hold."
    //
    // It is computable from PRESENT STATE, with no history stored anywhere, only because `record`
    // never clears `prior` — a claim survives its own refutation. The three buckets are disjoint by
    // construction, since proof requires an ask.
    fc.assert(
      fc.property(anyProfile, (profile) => {
        const s = summarize(profile, { kind: 'all' });
        const claimed = Object.values(profile.units).filter(
          (u) => u.prior.kind === 'claimed',
        ).length;
        expect(s.claimsStanding + s.claimsConfirmed + s.claimsRefuted).toBe(claimed);
      }),
    );
  });

  it('keeps the histogram consistent with every count derived from it', () => {
    fc.assert(
      fc.property(anyProfile, (profile) => {
        const s = summarize(profile, { kind: 'all' });
        expect(s.byStrength).toHaveLength(MAX_STRENGTH + 1);
        expect(s.byStrength.reduce((a, b) => a + b, 0)).toBe(s.units);
        // `known` is a suffix sum of the histogram, so the two can never disagree.
        const suffix = s.byStrength.slice(KNOWN_AT_STRENGTH).reduce((a, b) => a + b, 0);
        expect(s.known).toBe(suffix);
        expect(s.known).toBe(Object.values(profile.units).filter((u) => isKnown(u)).length);
      }),
    );
  });

  it('is integers all the way down, so nothing float-formatted reaches the host store', () => {
    // The lane that would catch this on a phone is `make hermes`, and it only runs on demand. A
    // ratio or an average here would serialize differently under a different runtime's float
    // formatting, and a stored history is the worst place to discover that.
    fc.assert(
      fc.property(anyProfile, (profile) => {
        const s = summarize(profile, { kind: 'all' });
        for (const n of [s.units, s.known, s.stuck, s.daysSinceProven, ...s.byStrength]) {
          expect(Number.isInteger(n)).toBe(true);
        }
      }),
    );
  });

  it('is a fixed size no matter how much she knows', () => {
    // The whole argument for (b): the engine computes, the host remembers. An append-only log in the
    // profile would grow to ~22,000 rows for a 20-item/day learner over three years, in the one blob
    // that is a synchronous parse before the first frame on Hermes.
    const small = summarize(record(createProfile('de', D(1)), []), { kind: 'all' });
    const words = Array.from({ length: 500 }, (_, i) => `w${String(i)}`);
    const big = summarize(
      record(
        createProfile('de', D(1)),
        words.map((w) => ({
          kind: 'retrieval' as const,
          unit: unitKey('recognise', variety('de')!, w),
          outcome: 'known' as const,
          day: D(1),
        })),
      ),
      { kind: 'all' },
    );
    expect(Object.keys(small).sort()).toEqual(Object.keys(big).sort());
    expect(JSON.stringify(big).length).toBeLessThan(400);
  });

  it('scopes to one skill without counting the other', () => {
    fc.assert(
      fc.property(anyProfile, (profile) => {
        const all = summarize(profile, { kind: 'all' }).units;
        const parts = (['recognise', 'produce'] as const).flatMap((direction) =>
          [AR, LEV].map((v) => summarize(profile, { kind: 'skill', variety: v, direction }).units),
        );
        // The four skills partition the profile — nothing is double-counted and nothing is dropped.
        expect(parts.reduce((a, b) => a + b, 0)).toBe(all);
      }),
    );
  });

  it('counts a stuck word only once it has failed enough times in a row', () => {
    const unit = unitKey('recognise', AR, 'سوق');
    let p = createProfile('ar', D(1));
    for (let i = 1; i <= STUCK_AFTER_LAPSES; i++) {
      p = record(p, [{ kind: 'retrieval', unit, outcome: 'unknown', day: D(i) }]);
      expect(summarize(p, { kind: 'all' }).stuck).toBe(i >= STUCK_AFTER_LAPSES ? 1 : 0);
    }
    // One success clears it. A word that is landing again is not stuck.
    p = record(p, [{ kind: 'retrieval', unit, outcome: 'known', day: D(20) }]);
    expect(summarize(p, { kind: 'all' }).stuck).toBe(0);
  });

  it('reports the full span since the epoch when nothing has ever been proven', () => {
    const p = record(createProfile('de', D(40)), [
      { kind: 'claim', unit: unitKey('recognise', variety('de')!, 'x'), day: D(1) },
    ]);
    // A learner who was placed and never drilled has proven nothing, and the honest reading of that
    // is "as long as we have known her" rather than zero.
    expect(summarize(p, { kind: 'all' }).daysSinceProven).toBe(40);
  });
});
