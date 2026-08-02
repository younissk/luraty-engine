/**
 * The tables every normalize step is written around.
 *
 * ⚠️ These are LANGUAGE FACTS, which is exactly why they are here and not in `utils/`. A fold table
 * knows that German wants `ö → oe` and French wants `ö → o`, and a folder whose admission rule is
 * "knows no module's vocabulary" cannot hold that.
 *
 * @module
 */

/** U+0640, the elongation character. Purely decorative — it carries no sound and no meaning. */
export const TATWEEL = 0x0640;

/**
 * Alef variants writers use interchangeably: آ أ إ ٱ all collapse to ا.
 *
 * Not a simplification. Arabic writers genuinely vary here, so treating أحمد and احمد as different
 * words would fragment a learner's knowledge across spellings of the same thing.
 */
export const ALEF_VARIANTS: ReadonlySet<number> = new Set([0x0622, 0x0623, 0x0625, 0x0671]);
export const ALEF = 'ا';

/** ة → ه and ى → ي: the other pair writers vary on, especially word-finally. */
export const TEH_MARBUTA = 0x0629;
export const HEH = 'ه';
export const ALEF_MAKSURA = 0x0649;
export const YEH = 'ي';

/** What a replacer returns to delete a character. */
export const DELETE = '';

/**
 * Accented Latin letters → their base form.
 *
 * An explicit table because `'é'.normalize('NFD')` is the idiomatic way and it is ICU-backed. The
 * table covers French thoroughly and the common Spanish, German, Portuguese and Nordic letters —
 * enough for the languages in scope, and trivially extended.
 */
export const LATIN_FOLD: Readonly<Record<string, string>> = {
  à: 'a',
  á: 'a',
  â: 'a',
  ã: 'a',
  ä: 'a',
  å: 'a',
  ā: 'a',
  è: 'e',
  é: 'e',
  ê: 'e',
  ë: 'e',
  ē: 'e',
  ì: 'i',
  í: 'i',
  î: 'i',
  ï: 'i',
  ī: 'i',
  ò: 'o',
  ó: 'o',
  ô: 'o',
  õ: 'o',
  ö: 'o',
  ø: 'o',
  ō: 'o',
  ù: 'u',
  ú: 'u',
  û: 'u',
  ü: 'u',
  ū: 'u',
  ý: 'y',
  ÿ: 'y',
  ñ: 'n',
  ç: 'c',
  æ: 'ae',
  œ: 'oe',
  ß: 'ss',
};

/**
 * German umlauts to their two-letter forms: ä→ae, ö→oe, ü→ue, ß→ss.
 *
 * ⚠️ THE POINT IS THAT THIS IS NOT `LATIN_FOLD`, AND GERMAN IS WHY.
 *
 * The pack module already argues that a generic `stripDiacritics` is a lie because Arabic and Latin
 * have nothing in common mechanically. German shows the same mistake one level further down: French
 * and German are the *same script* and want *opposite* answers. French `é→e` is correct — `café` and
 * `cafe` are one word. German `ö→o` is wrong, and destructively so. Measured against the real fold
 * table, every one of these pairs collapsed to one key:
 *
 * | folded to `o`/`a`/`u` | …which is a different word |
 * | --------------------- | -------------------------- |
 * | schön (beautiful)     | schon (already)            |
 * | zählen (to count)     | zahlen (to pay)            |
 * | fördern (to promote)  | fordern (to demand)        |
 * | drücken (to press)    | drucken (to print)         |
 * | schwül (humid)        | schwul (gay)               |
 * | Bär (bear)            | Bar (bar)                  |
 *
 * A learner who proved `zahlen` would be credited with `zählen`, and the engine would then never
 * teach them one of the two. The two-letter fold is also what German itself does when umlauts are
 * unavailable — passports, domain names, phone books — so it is the language's own convention
 * rather than an invention.
 *
 * `ß→ss` is shared with `LATIN_FOLD` and correct in both.
 */
export const GERMAN_FOLD: Readonly<Record<string, string>> = {
  ä: 'ae',
  ö: 'oe',
  ü: 'ue',
  ß: 'ss',
  // The capitals are here so the step does not silently depend on `lowercase` running first. A pack
  // author who omits it gets the right answer anyway.
  Ä: 'ae',
  Ö: 'oe',
  Ü: 'ue',
  ẞ: 'ss',
};

/**
 * Punctuation, listed rather than matched by category.
 *
 * Includes the Arabic comma, semicolon and question mark, which a `[a-z]`-shaped assumption misses
 * entirely and which appear constantly in real text.
 *
 * ⚠️ THE STRAIGHT APOSTROPHE IS DELIBERATELY ABSENT, and this was a real bug before it was.
 *
 * The tokenizer is the authority on what belongs inside a word — French declares `'` a word
 * character in its pattern precisely so `l'automne` survives splitting as one piece. When this set
 * also removed it, `l'automne` normalized to `lautomne` before affix stripping ran, the `l'` prefix
 * no longer matched, and the elision was silently baked into the key. Nothing errored; French words
 * just quietly filed themselves under the wrong lemma.
 *
 * The typographic quotes ‘ ’ “ ” stay, because those are never word-internal. A language for which
 * the straight apostrophe really is punctuation simply leaves it out of its tokenize pattern, and
 * it never reaches here.
 */
// Spreading a string yields code points, which is exactly what a set of single characters wants.
// (`no-misused-spread` is off package-wide; the argument lives in `eslint.config.js`, once.)
//
// ⚠️ KEYED BY CODE POINT, not by character, and that is a performance change rather than a style one
// — see `utils/transform.ts`. The source stays a readable literal string; only the lookup key
// changes.
export const PUNCTUATION: ReadonlySet<number> = new Set(
  [
    ...'.,;:!?"`()[]{}<>«»„“”‘’–—-_/\\|@#$%^&*+=~',
    '،', // ، Arabic comma
    '؛', // ؛ Arabic semicolon
    '؟', // ؟ Arabic question mark
    '٪', // ٪ Arabic percent
    '۔', // ۔ Urdu full stop
  ].map((ch) => ch.codePointAt(0) ?? -1),
);
