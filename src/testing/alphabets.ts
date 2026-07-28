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

// ── Passages ────────────────────────────────────────────────────────────────────────────────────
//
// ⚠️ THE SAME TRAP AS ABOVE, ONE LAYER UP.
//
// `arabicText` and `frenchText` are `fc.string({ unit })` with no minimum length, so they generate
// short and empty strings constantly. Any law about the 95–98% coverage band fed one of them takes
// the "too short to classify" branch essentially always — the band classifier is never reached, the
// law is green, and it proves nothing. That is exactly the ten-vacuous-Arabic-laws story again.
//
// The band needs at least 20 running tokens to have a representable point at all, and 50 to reach
// its upper edge, so a generator for band laws has to GUARANTEE a token count rather than hope for
// one.

/** Letters only — no marks, no separators, no punctuation. Every one survives `key()` intact. */
const ARABIC_LETTERS = [...'ابتثجحخدذرزسشصضطظعغفقكلمنهوي', 'أ', 'إ', 'آ', 'ٱ', 'ة', 'ى'];

/**
 * ⚠️ `œ` is deliberately absent, and finding out why is exactly what this generator is for.
 *
 * The French fixture tokenizes with `[a-zA-Zà-öø-ÿ']+`, whose accented ranges are U+00E0–U+00F6 and
 * U+00F8–U+00FF. `œ` is U+0153 — outside both — so a word containing one SPLITS IN TWO, and a
 * hundred generated words produced a hundred and one running tokens. It stays in `FRENCH_UNITS`
 * above, where probing the fold table with characters the tokenizer rejects is the point; here the
 * whole contract is that the word count equals the token count.
 */
const FRENCH_LETTERS = [...'abcdefghijklmnopqrstuvwxyz', ...'àâäéèêëîïôöùûüÿçæ'];

function passage(letters: readonly string[], words: number): fc.Arbitrary<string> {
  const word = fc
    .array(fc.constantFrom(...letters), { minLength: 1, maxLength: 8 })
    .map((cs) => cs.join(''));
  // Space-separated, and a space is in neither pack's tokenize pattern, so the word count IS the
  // running-token count. Each word holds at least one letter, and no normalize step deletes a
  // letter, so none of them can key away to nothing.
  return fc.array(word, { minLength: words, maxLength: words }).map((ws) => ws.join(' '));
}

/**
 * A passage of EXACTLY `words` running tokens under the matching pack's tokenizer.
 *
 * Use this — never `textFor` — for any law about the coverage band. A law that cannot reach the
 * branch it describes is a cost dressed up as rigour.
 */
export function passageFor(packId: string, words: number): fc.Arbitrary<string> {
  return passage(packId.startsWith('ar') ? ARABIC_LETTERS : FRENCH_LETTERS, words);
}
