import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { Evidence } from '../model/evidence.js';
import { unitKey, variety, type Day, type UnitKey } from '../model/ids.js';

import { createProfile, unitState } from './profile.js';
import { record } from './record.js';

/**
 * Laws, not examples.
 *
 * An example test asks "does this input give that output". A property asks "is this true for every
 * input", and the answer arrives with a shrunk counter-example — the smallest sequence that breaks
 * it, which is the bug report you would otherwise spend an afternoon constructing by hand.
 */

const AR = variety('ar-msa')!;
const WORDS = ['سوق', 'كتاب', 'مدرسة', 'بيت', 'ماء'];

const arbEvidence: fc.Arbitrary<Evidence> = fc.record({
  unit: fc
    .tuple(fc.constantFrom('recognise' as const, 'produce' as const), fc.constantFrom(...WORDS))
    .map(([dir, word]): UnitKey => unitKey(dir, AR, word)),
  outcome: fc.constantFrom('known' as const, 'unknown' as const),
  tested: fc.boolean(),
  day: fc.integer({ min: 0, max: 400 }).map((n) => n as Day),
});

const fresh = () => createProfile('ar', 0 as Day);

describe('record — laws', () => {
  it('is a fold: one at a time equals all at once', () => {
    // The law that protects every future optimisation. A per-call cap, a once-per-batch bonus, or
    // any cleverness that treats a batch differently from a sequence breaks this — and it should
    // then be a deliberate decision, not something discovered months later as a sync bug where a
    // learner who was offline gets different results from one who was not.
    fc.assert(
      fc.property(fc.array(arbEvidence, { maxLength: 50 }), (evidence) => {
        const batched = record(fresh(), evidence);
        const oneByOne = evidence.reduce((p, e) => record(p, [e]), fresh());
        expect(oneByOne).toEqual(batched);
      }),
    );
  });

  it('never loses a unit it has met', () => {
    // Cumulative review, as an invariant. Nothing graduates, nothing is dropped — an understood
    // unit stays in the pool forever, because that is where the retention gain lives.
    fc.assert(
      fc.property(
        fc.array(arbEvidence, { minLength: 1, maxLength: 40 }),
        fc.array(arbEvidence, { maxLength: 40 }),
        (first, second) => {
          const p1 = record(fresh(), first);
          const p2 = record(p1, second);
          for (const key of Object.keys(p1.units)) {
            expect(key in p2.units).toBe(true);
          }
        },
      ),
    );
  });

  it('never decreases `seen` for any unit', () => {
    fc.assert(
      fc.property(
        fc.array(arbEvidence, { maxLength: 40 }),
        fc.array(arbEvidence, { maxLength: 40 }),
        (first, second) => {
          const p1 = record(fresh(), first);
          const p2 = record(p1, second);
          for (const [key, before] of Object.entries(p1.units)) {
            const after = p2.units[key as UnitKey];
            expect(after?.seen ?? 0).toBeGreaterThanOrEqual(before.seen);
          }
        },
      ),
    );
  });

  it('counts exactly one encounter per piece of evidence', () => {
    fc.assert(
      fc.property(fc.array(arbEvidence, { maxLength: 60 }), (evidence) => {
        const p = record(fresh(), evidence);
        const total = Object.values(p.units).reduce((n, s) => n + s.seen, 0);
        expect(total).toBe(evidence.length);
      }),
    );
  });

  it('cannot promote a unit on passive signals alone', () => {
    // The single most important rule in the engine, stated as a law rather than an example: no
    // quantity of "did not ask what it means" adds up to knowing a word.
    fc.assert(
      fc.property(
        fc.array(
          arbEvidence.map((e): Evidence => ({ ...e, outcome: 'known', tested: false })),
          { maxLength: 60 },
        ),
        (evidence) => {
          const p = record(fresh(), evidence);
          for (const state of Object.values(p.units)) {
            expect(state.box).toBe('learning');
          }
        },
      ),
    );
  });

  it('is deterministic: identical input gives an identical profile', () => {
    fc.assert(
      fc.property(fc.array(arbEvidence, { maxLength: 40 }), (evidence) => {
        expect(record(fresh(), evidence)).toEqual(record(fresh(), evidence));
      }),
    );
  });

  it('leaves the input profile untouched', () => {
    fc.assert(
      fc.property(fc.array(arbEvidence, { maxLength: 30 }), (evidence) => {
        const p = fresh();
        const snapshot = JSON.stringify(p);
        record(p, evidence);
        expect(JSON.stringify(p)).toBe(snapshot);
      }),
    );
  });

  it('reports a consistent state for every key, met or not', () => {
    fc.assert(
      fc.property(fc.array(arbEvidence, { maxLength: 30 }), (evidence) => {
        const p = record(fresh(), evidence);
        for (const word of WORDS) {
          const key = unitKey('recognise', AR, word);
          const s = unitState(p, key);
          expect(s.seen).toBeGreaterThanOrEqual(0);
          expect(['learning', 'understood']).toContain(s.box);
        }
      }),
    );
  });
});
