import { describe, expect, it } from 'vitest';

import type { PackConfig } from '../../src/model/index.js';
import { arabicPack, fixtures, frenchPack } from '../../src/testing/packs.js';

import { createPack } from '../../src/core/pack.js';

describe('createPack — validation', () => {
  it('rejects a pack with no id', () => {
    const bad = createPack({ ...fixtures.frenchConfig, id: '' }, fixtures.frenchData);
    expect(bad.ok).toBe(false);
  });

  it('rejects an unknown tokenize strategy without throwing', () => {
    // Config is a file a human wrote, possibly against a different engine version. It is untrusted.
    const config = {
      ...fixtures.frenchConfig,
      tokenize: { strategy: 'dictionary', pattern: 'x' },
    } as unknown as PackConfig;
    const bad = createPack(config, fixtures.frenchData);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.message).toContain('dictionary');
  });

  it('rejects a pattern that is not a valid expression, at load time', () => {
    // Better here than as a crash on the first sentence a learner reads.
    const bad = createPack(
      { ...fixtures.frenchConfig, tokenize: { strategy: 'regex', pattern: '[a-' } },
      fixtures.frenchData,
    );
    expect(bad.ok).toBe(false);
  });

  it('accepts an empty frequency list — valid, and silently useless', () => {
    const empty = createPack(fixtures.frenchConfig, { frequency: '' });
    expect(empty.ok).toBe(true);
    if (empty.ok) expect(empty.value.rank('de')).toBeUndefined();
  });

  it('does not fall through to Object.prototype for words like "constructor"', () => {
    // Regression. The lemma table used to be the plain object it arrives as, so
    // `lemmas['constructor']` returned Object.prototype.constructor — a FUNCTION — and `key()`
    // handed a function to every caller expecting a string. Same for toString, valueOf and
    // __proto__, all of which occur in real text. Property testing found it in seconds.
    for (const word of ['constructor', 'toString', 'valueOf', '__proto__', 'hasOwnProperty']) {
      expect(typeof frenchPack.key(word)).toBe('string');
      expect(typeof arabicPack.key(word)).toBe('string');
    }
  });
});

describe('french pack', () => {
  it('splits on words and keeps elisions attached', () => {
    expect(frenchPack.split('Je vais au marché.')).toEqual(['Je', 'vais', 'au', 'marché']);
  });

  it('maps inflected forms to one canonical form', () => {
    // The whole point of `key`: a learner who met `vais` gets credit when they meet `allez`.
    expect(frenchPack.key('vais')).toBe('aller');
    expect(frenchPack.key('allez')).toBe('aller');
    expect(frenchPack.key('vont')).toBe('aller');
  });

  it('folds accents and case', () => {
    expect(frenchPack.key('MARCHÉ')).toBe(frenchPack.key('marche'));
  });

  it('strips an elision only when what remains is a real word', () => {
    expect(frenchPack.key("l'automne")).toBe('automne');
    // `d'` is a prefix in the config, but `zzz` is not a word — so nothing is stripped rather than
    // inventing a lemma.
    expect(frenchPack.key("d'zzz")).toBe("d'zzz");
  });

  it('ranks common words below rare ones, and unknown words as undefined', () => {
    const de = frenchPack.rank('de');
    const pain = frenchPack.rank('pain');
    expect(de).toBeDefined();
    expect(pain).toBeDefined();
    if (de !== undefined && pain !== undefined) expect(de).toBeLessThan(pain);
    expect(frenchPack.rank('zzzznotaword')).toBeUndefined();
  });

  it('accepts an answer that differs only by accent or case', () => {
    expect(frenchPack.compare('MARCHE', 'marché')).toBe(1);
    expect(frenchPack.compare('pain', 'vendre')).toBe(0);
  });
});

describe('arabic pack', () => {
  it('splits Arabic script', () => {
    expect(arabicPack.split('ذهبت إلى السوق')).toEqual(['ذهبت', 'إلى', 'السوق']);
  });

  it('strips the definite article', () => {
    expect(arabicPack.key('السوق')).toBe('سوق');
  });

  it('refuses to strip a prefix when the remainder is not a word', () => {
    // THE case that makes affix stripping safe without a morphological analyser. و is a real
    // prefix meaning "and", so a naive rule turns ولد into لد — which is not a word.
    expect(arabicPack.key('ولد')).toBe('ولد');
    expect(arabicPack.key('وقت')).toBe('وقت');
  });

  it('ignores optional diacritics, which real writing omits anyway', () => {
    // A learner types the undiacritised form; the bank may hold a diacritised one. They must match.
    expect(arabicPack.key('سُوق')).toBe('سوق');
    expect(arabicPack.compare('سُوق', 'سوق')).toBe(1);
  });

  it('collapses alef spellings writers use interchangeably', () => {
    expect(arabicPack.key('أحمد')).toBe(arabicPack.key('احمد'));
    expect(arabicPack.key('إلى')).toBe(arabicPack.key('الى'));
  });

  it('collapses teh marbuta and alef maksura', () => {
    expect(arabicPack.key('مدينة')).toBe(arabicPack.key('مدينه'));
  });

  it('ignores tatweel, which carries no meaning', () => {
    expect(arabicPack.key('كتـــاب')).toBe('كتاب');
  });
});

describe('the engine cannot tell the two apart', () => {
  it('gives both packs the same shape', () => {
    // The point of the contract: one engine, no branches. Every difference between French and
    // Arabic lives inside the pack.
    for (const pack of [frenchPack, arabicPack]) {
      expect(typeof pack.id).toBe('string');
      expect(typeof pack.split).toBe('function');
      expect(typeof pack.key).toBe('function');
      expect(typeof pack.candidates).toBe('function');
      expect(typeof pack.rank).toBe('function');
      expect(typeof pack.compare).toBe('function');
    }
  });

  it('produces a different number of keys for the same idea, and nobody has to care', () => {
    // "I went to the market" — four tokens in French, three in Arabic, because Arabic attaches the
    // article. The engine counts keys; it has no idea one of them needed an article removed.
    const fr = frenchPack.split('Je vais au marché').map((t) => frenchPack.key(t));
    const ar = arabicPack.split('ذهبت إلى السوق').map((t) => arabicPack.key(t));
    expect(fr).toHaveLength(4);
    expect(ar).toHaveLength(3);
    expect(ar).toContain('سوق');
  });
});
