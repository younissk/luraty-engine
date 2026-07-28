import fc from 'fast-check';

/**
 * Script-aware string generators.
 *
 * ⚠️ THIS FILE EXISTS BECAUSE THE PROPERTY TESTS WERE ASSERTING NOTHING.
 *
 * `fc.string()` generates printable ASCII — measured on the installed fast-check 4.9.0: 2,000
 * samples produced a maximum code point of 126 and not one non-ASCII character. So every law in
 * `pack.property.test.ts` was fed input the Arabic pack cannot even tokenize:
 *
 *     arabicPack.split('hello world')  →  []
 *     arabicPack.key('hello')          →  'hello'   (the identity function)
 *
 * Ten laws, all passing, all vacuous. The entire script-specific half of the engine — every reason
 * `internal/text.ts` exists — rested on about seven example assertions.
 *
 * A generator has to be able to produce the input that breaks the code, and a green suite says
 * nothing about whether it ever did.
 *
 * @module
 */

/** Arabic letters, plus the marks and variants `internal/text.ts` is specifically written to fold. */
const ARABIC_UNITS = [
  ...'ابتثجحخدذرزسشصضطظعغفقكلمنهوي',
  'أ', // hamza above — folds to ا
  'إ', // hamza below — folds to ا
  'آ', // madda — folds to ا
  'ٱ', // wasla — folds to ا
  'ة', // teh marbuta — folds to ه
  'ى', // alef maksura — folds to ي
  'ً', // fathatan
  'ُ', // damma
  'ِ', // kasra
  'ّ', // shadda
  'ْ', // sukun
  'ٰ', // superscript alef
  'ـ', // tatweel
  '،', // Arabic comma
  '؟', // Arabic question mark
  ' ',
];

/** French letters with the accents the fold table covers, plus the apostrophe elision depends on. */
const FRENCH_UNITS = [
  ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
  ...'àâäéèêëîïôöùûüÿçœæ',
  ...'ÀÂÄÉÈÊËÎÏÔÖÙÛÜŸÇŒÆ',
  "'",
  ' ',
  '.',
  ',',
];

export const arabicText = fc.string({ unit: fc.constantFrom(...ARABIC_UNITS) });
export const frenchText = fc.string({ unit: fc.constantFrom(...FRENCH_UNITS) });

/**
 * Anything at all, including astral-plane characters.
 *
 * For "never throws" laws only. `unit: 'binary'` reaches code point 1,114,111, which is what you
 * want when asserting robustness and emphatically not what you want when asserting behaviour —
 * a law fed pure noise passes for the wrong reason.
 */
export const anyText = fc.string({ unit: 'binary' });

/** The generator matching a pack id, so a law can be run against every pack with the right input. */
export function textFor(packId: string): fc.Arbitrary<string> {
  return packId.startsWith('ar') ? arabicText : frenchText;
}
