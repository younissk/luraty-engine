import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { arabicText, frenchText } from '../testing/alphabets.js';

import { DIRECTIONS, day, parseUnitKey, unitKey, variety } from './ids.js';

/**
 * The identifiers, and the parser that runs against persisted data.
 *
 * A mutation audit put this file at 19% with 38 mutants uncovered entirely — the worst in the
 * package. That is a bad place to be thin: `parseUnitKey` reads data written by an older build, and
 * the constructors are the trust boundary for anything a host supplies.
 *
 * @module
 */

/**
 * ⚠️ THE ILLEGAL CASES ARE ASSERTED THROUGH A LYING CAST, ON PURPOSE.
 *
 * `variety('')` and `day(0)` now type as `undefined`, so `expect(variety(''))` is a void expression
 * and the compiler has already made the mistake unwritable. That is the win — but it would also make
 * these tests assert nothing about the RUNTIME, and the runtime guard still has to hold for a
 * JavaScript consumer, for a `someString as 'de'` cast, and for every value crossing `deserialize`.
 *
 * Casting the argument to a legal literal type gives back the branded return type while passing an
 * illegal VALUE — so the assertion runs against the real body. Delete the body and these fail.
 */

describe('variety', () => {
  it('accepts ordinary ids', () => {
    expect(variety('fr')).toBe('fr');
    expect(variety('ar-msa')).toBe('ar-msa');
    expect(variety('ar-levantine')).toBe('ar-levantine');
  });

  it('rejects an empty id', () => {
    // A nameless variety makes every key it appears in ambiguous.
    expect(variety('' as 'de')).toBeUndefined();
  });

  it('rejects a colon, because the unit key uses it as a separator', () => {
    expect(variety('ar:msa' as 'ar-msa')).toBeUndefined();
    expect(variety(':' as 'de')).toBeUndefined();
    expect(variety('a:' as 'de')).toBeUndefined();
  });
});

describe('day', () => {
  it('accepts whole days from one up, and REFUSES zero', () => {
    // ⚠️ ZERO IS RESERVED, and this test is the reason the reservation is real rather than a
    // convention. Every date the engine stores uses `0` to mean "never" — it is the identity element
    // of the max-fold in `record`. That only works if no genuine day is also zero.
    //
    // It was measured not to be. A host whose epoch is "days since install" naturally starts at 0,
    // and then a word asked on the install day reads as NEVER ASKED: `plan()` labels it `'new'`
    // rather than `'review'`, a claim disproved that day still counts as standing, and `summarize()`
    // files it under the wrong bucket. Six defects, one ambiguity, all invisible to a host that
    // picked the obvious epoch.
    expect(day(0 as 1)).toBeUndefined();
    expect(day(1)).toBe(1);
    expect(day(365)).toBe(365);
  });

  it('rejects anything that is not a whole day', () => {
    // A fractional day would let a decision depend on the time of day, which is the whole reason
    // this is a day count rather than a timestamp.
    expect(day(1.5 as 1)).toBeUndefined();
    expect(day(-1 as 1)).toBeUndefined();
    expect(day(NaN)).toBeUndefined();
    expect(day(Infinity as 1)).toBeUndefined();
  });
});

describe('DIRECTIONS', () => {
  it('lists exactly the directions the type allows', () => {
    // A mutation that empties this array survives unless something asserts the contents — and an
    // empty DIRECTIONS would make every "for each direction" loop silently do nothing.
    expect([...DIRECTIONS].sort()).toEqual(['produce', 'recognise']);
  });
});

describe('unitKey and parseUnitKey', () => {
  const AR = variety('ar-msa');

  it('builds the documented shape', () => {
    expect(unitKey('recognise', AR, 'سوق')).toBe('recognise:ar-msa:سوق');
    expect(unitKey('produce', AR, 'سوق')).toBe('produce:ar-msa:سوق');
  });

  it('round-trips every part', () => {
    const key = unitKey('produce', AR, 'كتاب');
    expect(parseUnitKey(key)).toEqual({
      direction: 'produce',
      variety: 'ar-msa',
      word: 'كتاب',
    });
  });

  it('round-trips a word containing colons', () => {
    // The reason the word goes LAST. Parsing takes the first two segments and treats the entire
    // remainder as the word, so a colon inside it cannot corrupt the key.
    const key = unitKey('recognise', AR, 'a:b:c');
    expect(parseUnitKey(key)?.word).toBe('a:b:c');
  });

  it('rejects malformed keys rather than guessing', () => {
    // This runs against persisted data, which is the one place the engine cannot assume its own
    // invariants held.
    for (const bad of [
      '',
      'recognise',
      'recognise:ar-msa',
      ':ar-msa:سوق',
      'recognise::سوق',
      'recognise:ar-msa:',
      'sideways:ar-msa:سوق',
      'RECOGNISE:ar-msa:سوق',
    ]) {
      expect(parseUnitKey(bad), bad).toBeUndefined();
    }
  });

  it('accepts both directions and only those', () => {
    for (const direction of DIRECTIONS) {
      expect(parseUnitKey(`${direction}:fr:x`)?.direction).toBe(direction);
    }
    expect(parseUnitKey('recognize:fr:x')).toBeUndefined(); // American spelling is not a direction
  });

  it('round-trips for any word in any script', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...DIRECTIONS),
        fc.constantFrom('fr', 'ar-msa', 'ar-levantine'),
        fc.oneof(arabicText, frenchText).filter((w) => w.length > 0),
        (direction, v, word) => {
          const key = unitKey(direction, variety(v), word);
          const parts = parseUnitKey(key);
          expect(parts).toEqual({ direction, variety: v, word });
        },
      ),
    );
  });

  it('never throws, whatever it is handed', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (s) => {
        expect(() => parseUnitKey(s)).not.toThrow();
      }),
    );
  });
});
