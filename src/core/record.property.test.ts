import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { unitKey, variety, type Day, type UnitKey } from '../model/ids.js';
import { arbEvidence as anyEvidence, arbPassive, kindsIn } from '../testing/evidence.js';
import { effectiveStrength, isKnown, KNOWN_AT_STRENGTH, MAX_STRENGTH } from '../model/unit.js';

import { createProfile, unitState } from './profile.js';
import { record } from './record.js';

/**
 * Laws, not examples.
 *
 * An example test asks "does this input give that output". A property asks "is this true for every
 * input", and the answer arrives with a shrunk counter-example — the smallest sequence that breaks
 * it, which is the bug report you would otherwise spend an afternoon constructing by hand.
 */

const AR = variety('ar-msa');
const WORDS = ['سوق', 'كتاب', 'مدرسة', 'بيت', 'ماء'];

const UNIVERSE = { variety: AR, words: WORDS } as const;
const arbEvidence = anyEvidence(UNIVERSE);

const fresh = () => createProfile('ar', 1 as Day);

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
        // ⚠️ NOT `evidence.length`. A claim is not an encounter — nobody met anything, the host
        // asserted something — so it deliberately leaves `seen` alone. Restating the law is the
        // price of keeping `seen` honest, and it is worth paying: `seen` is what tells a simulation
        // whether a word has actually been in front of the learner.
        expect(total).toBe(evidence.filter((e) => e.kind !== 'claim').length);
      }),
    );
  });

  it('cannot promote a unit on passive signals alone', () => {
    // The single most important rule in the engine, stated as a law rather than an example: no
    // quantity of "did not ask what it means" adds up to knowing a word.
    fc.assert(
      fc.property(fc.array(arbPassive(UNIVERSE), { maxLength: 60 }), (evidence) => {
        const p = record(fresh(), evidence);
        for (const state of Object.values(p.units)) {
          // Strictly WIDER than the v2 law it replaces. That one said "exposure cannot promote";
          // this one says no combination of exposure, gloss-taps and claims can, which also pins
          // the rule that a claim buys no head start on the ladder.
          expect(isKnown(state)).toBe(false);
          expect(state.strength).toBe(0);
          expect(state.lastProven).toBe(0);
        }
      }),
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
          // The rung is always ON the ladder. Under v2 this asserted the box was one of two members;
          // the ladder moves the same guarantee onto a number, where saturating arithmetic is what
          // could break it.
          expect(s.strength).toBeGreaterThanOrEqual(0);
          expect(s.strength).toBeLessThanOrEqual(MAX_STRENGTH);
          expect(Number.isInteger(s.strength)).toBe(true);
          // ⚠️ NOT `s.strength >= KNOWN_AT_STRENGTH`. `isKnown` reads the EFFECTIVE rung, which adds
          // one for a claim that has been confirmed by a real retrieval — a claim plus an
          // independent proof is two signals from different sources. A bare claim still adds
          // nothing, which is the half worth pinning here.
          expect(isKnown(s)).toBe(effectiveStrength(s) >= KNOWN_AT_STRENGTH);
          if (s.prior.kind === 'none' || s.lastProven === 0) {
            expect(effectiveStrength(s)).toBe(s.strength);
          }
        }
      }),
    );
  });

  it('generates every evidence kind — the guard against a vacuous suite', () => {
    // ⚠️ NOT A LAW ABOUT `record`. A law about the LAWS above.
    //
    // When `Evidence` became a four-member union, the mechanical repair for every property test in
    // this package was to pin `kind: 'retrieval'` and move on. Every law here would have stayed
    // green while covering one variant in four — and nothing would have said so. This package has
    // already been bitten by exactly that shape once, when `fc.string()` turned out to emit
    // printable ASCII only and ten Arabic laws ran on input the pack could not tokenize.
    //
    // So the generator is asserted to actually generate. If a future edit narrows it, this fails
    // here rather than silently hollowing out the eight laws above.
    const seen = new Set<string>();
    fc.assert(
      fc.property(fc.array(arbEvidence, { minLength: 1, maxLength: 40 }), (evidence) => {
        for (const kind of kindsIn(evidence)) seen.add(kind);
      }),
    );
    expect(seen).toEqual(new Set(['retrieval', 'exposure', 'help', 'claim']));
  });
});
