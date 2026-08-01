/**
 * The named transformations a pack may compose. A CLOSED set, on purpose.
 *
 * Closed because this is what lets a language be added as data rather than code: the pack file
 * names the steps, the engine owns the implementations. An open set (arbitrary functions in config)
 * would just be code with extra steps, and could not be shipped as JSON.
 *
 * These are named by SCRIPT rather than generically. A `stripDiacritics` that claims to work
 * everywhere is a lie — the Arabic and Latin cases have nothing in common mechanically, and hiding
 * that behind one name is how the wrong one gets applied to the wrong language.
 *
 * The implementations live in `normalize/`.
 *
 * @module
 */
export type NormalizeStep =
  | 'lowercase'
  | 'stripPunctuation'
  /** Removes the optional Arabic short-vowel marks — they are usually absent in real text anyway. */
  | 'stripArabicDiacritics'
  /** Removes the Arabic elongation character, which carries no meaning. */
  | 'stripTatweel'
  /** Collapses أ إ آ ٱ to ا, which writers use interchangeably. */
  | 'normalizeArabicAlef'
  /** Collapses ة to ه and ى to ي, another pair writers vary on. */
  | 'normalizeArabicFinals'
  /** Maps accented Latin letters to their base form: é→e, ç→c, ü→u. Right for French. */
  | 'foldLatinDiacritics'
  /**
   * German umlauts to their two-letter forms: ä→ae, ö→oe, ü→ue, ß→ss.
   *
   * ⚠️ Not a duplicate of `foldLatinDiacritics`. French and German are the same script and want
   * OPPOSITE answers: `é→e` is right for French, and `ö→o` would merge schön with schon, zählen
   * with zahlen, drücken with drucken — different words in every case. Two-letter is also German's
   * own convention when umlauts are unavailable.
   */
  | 'foldGermanUmlauts';
