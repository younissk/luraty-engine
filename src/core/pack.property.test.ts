import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { arabicPack, frenchPack } from '../testing/packs.js';

/**
 * Laws every pack must obey, checked against both real packs.
 *
 * These are the contract the engine relies on. A pack that breaks one of them will not crash — it
 * will quietly give a learner credit for a word they do not know, or split their knowledge of one
 * word across two keys, and nothing will look wrong.
 */

const PACKS = [
  ['french', frenchPack],
  ['arabic', arabicPack],
] as const;

describe.each(PACKS)('%s pack — laws', (_name, pack) => {
  it('key is idempotent: keying an already-canonical form changes nothing', () => {
    // If this fails, the canonical form depends on how many times it has been normalized, and the
    // same word ends up under two different keys depending on the path it took.
    fc.assert(
      fc.property(fc.string(), (s) => {
        const once = pack.key(s);
        expect(pack.key(once)).toBe(once);
      }),
    );
  });

  it('key is total: it returns a string for any input, and never throws', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        expect(typeof pack.key(s)).toBe('string');
      }),
    );
  });

  it('split never invents characters', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const joined = pack.split(s).join('');
        expect(joined.length).toBeLessThanOrEqual(s.length);
      }),
    );
  });

  it('split never throws, on any text', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        expect(() => pack.split(s)).not.toThrow();
      }),
    );
  });

  it('split does not depend on how many times it has been called', () => {
    // A regex with the `g` flag is stateful. Reuse one across calls without resetting `lastIndex`
    // and results start depending on call order — precisely the class of bug this engine claims not
    // to have, and one that only shows up on the second call.
    fc.assert(
      fc.property(fc.string(), (s) => {
        expect(pack.split(s)).toEqual(pack.split(s));
      }),
    );
  });

  it('compare is reflexive: an answer always matches itself', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        expect(pack.compare(s, s)).toBe(1);
      }),
    );
  });

  it('compare is symmetric: which side the answer is on cannot matter', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (a, b) => {
        expect(pack.compare(a, b)).toBe(pack.compare(b, a));
      }),
    );
  });

  it('compare returns a score between 0 and 1', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (a, b) => {
        const score = pack.compare(a, b);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      }),
    );
  });

  it('rank returns a positive integer or undefined — never Infinity or NaN', () => {
    // Infinity is the tempting sentinel for "not in the list", and it is a trap:
    // JSON.stringify(Infinity) is null, so it would silently become a null somewhere downstream.
    fc.assert(
      fc.property(fc.string(), (s) => {
        const r = pack.rank(pack.key(s));
        if (r === undefined) return;
        expect(Number.isInteger(r)).toBe(true);
        expect(r).toBeGreaterThan(0);
        expect(Number.isFinite(r)).toBe(true);
      }),
    );
  });

  it('every token it produces can be keyed and looked up', () => {
    // The pipeline the engine actually runs: split, then key, then rank. If any step chokes on the
    // output of the one before it, coverage counting breaks on real text.
    fc.assert(
      fc.property(fc.string(), (text) => {
        for (const token of pack.split(text)) {
          const key = pack.key(token);
          expect(typeof key).toBe('string');
          expect(() => pack.rank(key)).not.toThrow();
        }
      }),
    );
  });
});
