import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { arabicText, frenchText } from '../testing/alphabets.js';

import { applyStep, applySteps } from './text.js';

/**
 * Character-level tests for the ICU-free transformations.
 *
 * A mutation audit put this file at 61% with 48 surviving mutants — the weakest in the package, and
 * the one where a silent error is most expensive. Every function here exists *because* Hermes lacks
 * ICU, so a wrong code point is a bug that passes on a laptop and mangles Arabic on a phone.
 *
 * Testing these through a pack was too indirect: a pack applies several steps at once, so one
 * broken range gets masked by another step happening to fix it. These go character by character.
 *
 * @module
 */

describe('stripArabicDiacritics', () => {
  const strip = (s: string) => applyStep('stripArabicDiacritics', s);

  it('removes every mark in the fathatan–sukun range', () => {
    // U+064B through U+0652 individually, because a range boundary off by one is exactly the
    // mutation that survives an aggregate test.
    for (let cp = 0x064b; cp <= 0x0652; cp++) {
      const mark = String.fromCodePoint(cp);
      expect(strip(`سوق${mark}`), `U+${cp.toString(16)}`).toBe('سوق');
    }
  });

  it('removes the superscript alef and the Quranic marks', () => {
    expect(strip('سٰوق')).toBe('سوق');
    for (let cp = 0x0653; cp <= 0x0655; cp++) {
      expect(strip(`سوق${String.fromCodePoint(cp)}`)).toBe('سوق');
    }
  });

  it('leaves letters either side of the range alone', () => {
    // U+064A (yeh) is just below the range and U+0656 just above. Both must survive, or the strip
    // is eating real letters.
    expect(strip('ي')).toBe('ي');
    expect(strip('ٖ')).toBe('ٖ');
    expect(strip('سوق')).toBe('سوق');
  });

  it('leaves Latin text untouched', () => {
    expect(strip('marché')).toBe('marché');
  });
});

describe('stripTatweel', () => {
  it('removes only U+0640', () => {
    expect(applyStep('stripTatweel', 'كتـــاب')).toBe('كتاب');
    expect(applyStep('stripTatweel', 'كتاب')).toBe('كتاب');
    // The neighbouring code points are real letters and must survive.
    expect(applyStep('stripTatweel', 'ؿف')).toBe('ؿف');
  });
});

describe('normalizeArabicAlef', () => {
  const fold = (s: string) => applyStep('normalizeArabicAlef', s);

  it('folds every alef variant to the plain one', () => {
    for (const variant of ['آ', 'أ', 'إ', 'ٱ']) {
      expect(fold(variant), variant).toBe('ا');
    }
  });

  it('leaves the plain alef and everything else alone', () => {
    expect(fold('ا')).toBe('ا');
    expect(fold('ب')).toBe('ب');
    // U+0624 (waw with hamza) is inside the variant range numerically but is NOT an alef — folding
    // it would merge two genuinely different letters.
    expect(fold('ؤ')).toBe('ؤ');
  });
});

describe('normalizeArabicFinals', () => {
  it('folds teh marbuta to heh and alef maksura to yeh, and nothing else', () => {
    expect(applyStep('normalizeArabicFinals', 'مدينة')).toBe('مدينه');
    expect(applyStep('normalizeArabicFinals', 'على')).toBe('علي');
    expect(applyStep('normalizeArabicFinals', 'هي')).toBe('هي');
    // U+0628 (beh) sits between them numerically and must not move.
    expect(applyStep('normalizeArabicFinals', 'ب')).toBe('ب');
  });
});

describe('foldLatinDiacritics', () => {
  const fold = (s: string) => applyStep('foldLatinDiacritics', s);

  it('folds every accented vowel to its base letter', () => {
    const cases: [string, string][] = [
      ['àáâãäåā', 'aaaaaaa'],
      ['èéêëē', 'eeeee'],
      ['ìíîïī', 'iiiii'],
      ['òóôõöøō', 'ooooooo'],
      ['ùúûüū', 'uuuuu'],
      ['ýÿ', 'yy'],
    ];
    for (const [input, expected] of cases) {
      expect(fold(input), input).toBe(expected);
    }
  });

  it('folds the letters that expand to two characters', () => {
    expect(fold('æ')).toBe('ae');
    expect(fold('œ')).toBe('oe');
    expect(fold('ß')).toBe('ss');
  });

  it('folds ñ and ç', () => {
    expect(fold('ñ')).toBe('n');
    expect(fold('ç')).toBe('c');
  });

  it('leaves unaccented Latin and other scripts alone', () => {
    expect(fold('marche')).toBe('marche');
    expect(fold('سوق')).toBe('سوق');
  });

  it("is case-sensitive by design — uppercase is lowercase's job", () => {
    // The table holds lowercase only. Packs run `lowercase` first, so folding uppercase here would
    // be redundant work and a second place to keep in sync.
    expect(fold('É')).toBe('É');
    expect(applySteps(['lowercase', 'foldLatinDiacritics'], 'É')).toBe('e');
  });
});

describe('foldGermanUmlauts', () => {
  const fold = (s: string) => applyStep('foldGermanUmlauts', s);

  // ⚠️ THIS BLOCK DID NOT EXIST, and the mutation lane is what said so. `foldGermanUmlauts` is the
  // most consequential fold in the package — its docstring carries a six-row table of German word
  // pairs it exists to keep apart — and every one of those claims was pinned only INDIRECTLY, through
  // the German pack fixture. Two mutants survived a full run as a direct result, both on behaviour
  // the source explicitly documents.

  it('folds each umlaut to its two-letter form, not to a bare vowel', () => {
    expect(fold('ä')).toBe('ae');
    expect(fold('ö')).toBe('oe');
    expect(fold('ü')).toBe('ue');
    expect(fold('ß')).toBe('ss');
  });

  it('KEEPS APART the six pairs a bare-vowel fold would collapse', () => {
    // ⚠️ THE WHOLE REASON THIS STEP IS NOT `foldLatinDiacritics`. French and German are the same
    // script and want opposite answers: `é → e` is right, `ö → o` is destructive. Against the real
    // Latin table every one of these pairs became a single key, so a learner who proved `zahlen`
    // was credited with `zählen` and the engine would then never teach them one of the two.
    //
    // This is the test that fails if someone "simplifies" the two folds into one.
    const pairs: [string, string][] = [
      ['schön', 'schon'], // beautiful / already
      ['zählen', 'zahlen'], // to count / to pay
      ['fördern', 'fordern'], // to promote / to demand
      ['drücken', 'drucken'], // to press / to print
      ['schwül', 'schwul'], // humid / gay
      ['Bär', 'Bar'], // bear / bar
    ];
    for (const [withUmlaut, without] of pairs) {
      expect(fold(withUmlaut), `${withUmlaut} vs ${without}`).not.toBe(fold(without));
    }
  });

  it('folds the CAPITALS too, so the step does not depend on lowercase running first', () => {
    // ⚠️ A CLAIM THE SOURCE MAKES AND NOTHING CHECKED. `GERMAN_FOLD` carries `Ä Ö Ü ẞ` with the
    // comment "so the step does not silently depend on `lowercase` running first — a pack author
    // who omits it gets the right answer anyway". Mutating `Ä: 'ae'` to `Ä: ''` survived a full
    // mutation run, which means that sentence was decoration.
    //
    // Note this is the OPPOSITE policy to `foldLatinDiacritics` above, which is deliberately
    // lowercase-only. The asymmetry is the point: a missing Latin fold degrades to a redundant
    // lowercase pass, while a missing German fold silently merges two different words.
    expect(fold('Ä')).toBe('ae');
    expect(fold('Ö')).toBe('oe');
    expect(fold('Ü')).toBe('ue');
    expect(fold('ẞ')).toBe('ss');
    expect(fold('BÄR')).toBe('BaeR');
  });

  it('leaves everything else alone', () => {
    expect(fold('haus')).toBe('haus');
    expect(fold('café')).toBe('café');
    expect(fold('سوق')).toBe('سوق');
    expect(fold('')).toBe('');
  });
});

describe('stripPunctuation', () => {
  const strip = (s: string) => applyStep('stripPunctuation', s);

  it('removes Latin punctuation', () => {
    expect(strip('a.b,c;d:e!f?g')).toBe('abcdefg');
    expect(strip('«quoted»')).toBe('quoted');
  });

  it('removes Arabic punctuation, which an ASCII-shaped list would miss entirely', () => {
    expect(strip('سوق،')).toBe('سوق');
    expect(strip('سوق؟')).toBe('سوق');
    expect(strip('سوق؛')).toBe('سوق');
    expect(strip('٪')).toBe('');
  });

  it('keeps the straight apostrophe, which is word-internal in French', () => {
    // Regression: removing it broke elision stripping, so `l'automne` keyed as `lautomne`.
    expect(strip("l'automne")).toBe("l'automne");
  });

  it('removes the typographic quotes, which never are', () => {
    expect(strip('‘a’')).toBe('a');
    expect(strip('“a”')).toBe('a');
  });

  it('keeps letters and digits', () => {
    expect(strip('abc123سوق')).toBe('abc123سوق');
  });
});

describe('lowercase', () => {
  it('lowercases Latin and leaves Arabic (which has no case) alone', () => {
    expect(applyStep('lowercase', 'MARCHÉ')).toBe('marché');
    expect(applyStep('lowercase', 'سوق')).toBe('سوق');
  });
});

describe('applySteps', () => {
  it('applies steps in order, and order matters', () => {
    // fold-then-lowercase and lowercase-then-fold differ, because the fold table is lowercase-only.
    expect(applySteps(['lowercase', 'foldLatinDiacritics'], 'MARCHÉ')).toBe('marche');
    expect(applySteps(['foldLatinDiacritics', 'lowercase'], 'MARCHÉ')).toBe('marché');
  });

  it('returns the input unchanged for an empty step list', () => {
    expect(applySteps([], 'MARCHÉ')).toBe('MARCHÉ');
  });

  it('never throws and never returns a non-string', () => {
    fc.assert(
      fc.property(fc.oneof(arabicText, frenchText), (s) => {
        const out = applySteps(
          [
            'lowercase',
            'stripPunctuation',
            'stripArabicDiacritics',
            'stripTatweel',
            'normalizeArabicAlef',
            'normalizeArabicFinals',
            'foldLatinDiacritics',
          ],
          s,
        );
        expect(typeof out).toBe('string');
        expect(out.length).toBeLessThanOrEqual(s.length * 2); // ß→ss is the only expansion
      }),
    );
  });

  it('is idempotent for every step', () => {
    // Applying a fold twice must equal applying it once, or a canonical form depends on how many
    // times it was normalized.
    const steps = [
      'lowercase',
      'stripPunctuation',
      'stripArabicDiacritics',
      'stripTatweel',
      'normalizeArabicAlef',
      'normalizeArabicFinals',
      'foldLatinDiacritics',
    ] as const;
    fc.assert(
      fc.property(fc.oneof(arabicText, frenchText), fc.constantFrom(...steps), (s, step) => {
        const once = applyStep(step, s);
        expect(applyStep(step, once)).toBe(once);
      }),
    );
  });
});
