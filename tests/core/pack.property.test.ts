import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { anyText, textFor } from '../../src/testing/alphabets.js';
import { arabicPack, frenchPack } from '../../src/testing/packs.js';

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
      fc.property(textFor(pack.id), (s) => {
        const once = pack.key(s);
        expect(pack.key(once)).toBe(once);
      }),
    );
  });

  it('key is total: it returns a string for any input, and never throws', () => {
    fc.assert(
      fc.property(anyText, (s) => {
        expect(typeof pack.key(s)).toBe('string');
      }),
    );
  });

  it('split never invents characters', () => {
    fc.assert(
      fc.property(textFor(pack.id), (s) => {
        const joined = pack.split(s).join('');
        expect(joined.length).toBeLessThanOrEqual(s.length);
      }),
    );
  });

  it('split never throws, on genuinely anything', () => {
    // `anyText` reaches code point 1,114,111 — astral-plane characters, lone surrogates, the lot.
    // Robustness laws want the widest generator; behaviour laws emphatically do not, because a law
    // fed pure noise passes for the wrong reason.
    fc.assert(
      fc.property(anyText, (s) => {
        expect(() => pack.split(s)).not.toThrow();
      }),
    );
  });

  it('split does not depend on how many times it has been called', () => {
    // A regex with the `g` flag is stateful. Reuse one across calls without resetting `lastIndex`
    // and results start depending on call order — precisely the class of bug this engine claims not
    // to have, and one that only shows up on the second call.
    fc.assert(
      fc.property(textFor(pack.id), (s) => {
        expect(pack.split(s)).toEqual(pack.split(s));
      }),
    );
  });

  it('compare accepts an answer against itself, unless the answer normalizes away entirely', () => {
    // Plain reflexivity is FALSE, and finding that out was the point of feeding these laws real
    // script instead of ASCII. `compare('؟', '؟')` is 0: both sides normalize to nothing, and an
    // expected answer that normalizes to nothing is an unanswerable content bug rather than
    // something a learner can get right.
    //
    // So the honest law is narrower — and it still pins the thing that matters, because a pack
    // that rejects identity for any OTHER reason is a grading bug.
    fc.assert(
      fc.property(textFor(pack.id), (s) => {
        const self = pack.compare(s, s);
        expect([0, 1]).toContain(self);
        if (self === 0) {
          // The only legitimate cause: nothing survives normalization, in which case the pack must
          // reject everything else against it too.
          expect(pack.compare('zzq', s)).toBe(0);
          expect(pack.compare(s, 'zzq')).toBe(0);
        }
      }),
    );
  });

  it('compare is discriminating: it does not accept everything', () => {
    // "Marks every answer correct" is the worst bug this package can have, and the one nobody
    // reports — learners do not complain about being told they are right. It deserves a law rather
    // than resting on a single example assertion.
    fc.assert(
      fc.property(textFor(pack.id), (s) => {
        fc.pre(pack.split(s).length > 0);
        expect(pack.compare(s, 'zzqxwv')).toBe(0);
      }),
    );
  });

  it('compare is symmetric: which side the answer is on cannot matter', () => {
    fc.assert(
      fc.property(textFor(pack.id), textFor(pack.id), (a, b) => {
        expect(pack.compare(a, b)).toBe(pack.compare(b, a));
      }),
    );
  });

  it('compare returns a score between 0 and 1', () => {
    fc.assert(
      fc.property(textFor(pack.id), textFor(pack.id), (a, b) => {
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
      fc.property(textFor(pack.id), (s) => {
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
      fc.property(textFor(pack.id), (text) => {
        for (const token of pack.split(text)) {
          const key = pack.key(token);
          expect(typeof key).toBe('string');
          expect(() => pack.rank(key)).not.toThrow();
        }
      }),
    );
  });
});
