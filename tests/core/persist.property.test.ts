import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { Evidence } from '../../src/model/index.js';
import { variety, type Day } from '../../src/model/index.js';
import { arbEvidence as anyEvidence } from '../../src/testing/evidence.js';

import { deserialize, serialize } from '../../src/core/persist.js';
import { createProfile } from '../../src/core/profile.js';
import { record } from '../../src/core/record.js';

/**
 * The round-trip law, and the canonical-form law.
 *
 * These two are the reason this file exists rather than a handful of examples. An example proves
 * one profile survives storage; a property proves every profile does, and hands back the smallest
 * one that does not.
 */

const AR = variety('ar-msa');
const LEV = variety('ar-levantine');

// Deliberately awkward words: an empty-ish set would never exercise the sort, and the punctuation
// and non-Latin scripts are where canonical ordering usually goes wrong.
const WORDS = ['سوق', 'كتاب', 'a', 'Z', 'é', '0', '99', 'a:b', 'ñ', ' ', 'ZZZ'];

// ⚠️ BOTH varieties, and all four evidence kinds. `arbProfile` builds profiles ONLY through
// `record()`, so any state the generator cannot produce is state these six laws do not cover — and
// the round-trip and canonical-ordering laws would stay green while never once serializing a claim.
// See `testing/evidence.ts` for the near-miss this guards against.
const arbEvidence: fc.Arbitrary<Evidence> = fc.oneof(
  anyEvidence({ variety: AR, words: WORDS, maxDay: 500 }),
  anyEvidence({ variety: LEV, words: WORDS, maxDay: 500 }),
);

const arbProfile = fc
  .array(arbEvidence, { maxLength: 60 })
  .map((evidence) => record(createProfile('ar', 1 as Day), evidence));

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
        const batched = record(createProfile('ar', 1 as Day), evidence);
        const oneByOne = evidence.reduce((p, e) => record(p, [e]), createProfile('ar', 1 as Day));
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
