import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { Evidence } from '../model/evidence.js';
import { unitKey, variety, type Day, type UnitKey } from '../model/ids.js';

import { deserialize, serialize } from './persist.js';
import { createProfile } from './profile.js';
import { record } from './record.js';

/**
 * The round-trip law, and the canonical-form law.
 *
 * These two are the reason this file exists rather than a handful of examples. An example proves
 * one profile survives storage; a property proves every profile does, and hands back the smallest
 * one that does not.
 */

const AR = variety('ar-msa')!;
const LEV = variety('ar-levantine')!;

// Deliberately awkward words: an empty-ish set would never exercise the sort, and the punctuation
// and non-Latin scripts are where canonical ordering usually goes wrong.
const WORDS = ['سوق', 'كتاب', 'a', 'Z', 'é', '0', '99', 'a:b', 'ñ', ' ', 'ZZZ'];

const arbEvidence: fc.Arbitrary<Evidence> = fc.record({
  unit: fc
    .tuple(
      fc.constantFrom('recognise' as const, 'produce' as const),
      fc.constantFrom(AR, LEV),
      fc.constantFrom(...WORDS),
    )
    .map(([dir, v, word]): UnitKey => unitKey(dir, v, word)),
  outcome: fc.constantFrom('known' as const, 'unknown' as const),
  tested: fc.boolean(),
  day: fc.integer({ min: 0, max: 500 }).map((n) => n as Day),
});

const arbProfile = fc
  .array(arbEvidence, { maxLength: 60 })
  .map((evidence) => record(createProfile('ar', 0 as Day), evidence));

describe('persistence — laws', () => {
  it('round-trips: deserialize(serialize(p)) equals p', () => {
    fc.assert(
      fc.property(arbProfile, (profile) => {
        const back = deserialize(serialize(profile));
        expect(back.ok).toBe(true);
        if (back.ok) expect(back.value).toEqual(profile);
      }),
    );
  });

  it('is idempotent: serializing a reloaded profile gives identical bytes', () => {
    // Weaker than the round-trip law on its own, and the one that actually catches non-canonical
    // ordering — a format can round-trip perfectly while producing different bytes each time.
    fc.assert(
      fc.property(arbProfile, (profile) => {
        const once = serialize(profile);
        const back = deserialize(once);
        expect(back.ok).toBe(true);
        if (back.ok) expect(serialize(back.value)).toBe(once);
      }),
    );
  });

  it('is canonical: the same state serializes the same way regardless of how it was built', () => {
    fc.assert(
      fc.property(fc.array(arbEvidence, { maxLength: 40 }), (evidence) => {
        const batched = record(createProfile('ar', 0 as Day), evidence);
        const oneByOne = evidence.reduce((p, e) => record(p, [e]), createProfile('ar', 0 as Day));
        expect(serialize(oneByOne)).toBe(serialize(batched));
      }),
    );
  });

  it('never throws on arbitrary text', () => {
    // Corrupted storage, a half-finished write, the wrong key read back — all of it lands here.
    fc.assert(
      fc.property(fc.string(), (text) => {
        expect(() => deserialize(text)).not.toThrow();
      }),
    );
  });

  it('never throws on arbitrary JSON', () => {
    // Nastier than random text: this is well-formed JSON of entirely the wrong shape, which is what
    // a schema change actually produces.
    fc.assert(
      fc.property(fc.json(), (text) => {
        expect(() => deserialize(text)).not.toThrow();
      }),
    );
  });

  it('never returns a half-built profile — either ok with a whole one, or an error', () => {
    fc.assert(
      fc.property(fc.json(), (text) => {
        const result = deserialize(text);
        if (result.ok) {
          expect(typeof result.value.language).toBe('string');
          expect(Number.isInteger(result.value.day)).toBe(true);
          expect(typeof result.value.units).toBe('object');
        } else {
          expect(result.error.message.length).toBeGreaterThan(0);
        }
      }),
    );
  });
});
