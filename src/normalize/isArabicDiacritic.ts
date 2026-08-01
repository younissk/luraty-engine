/**
 * The short-vowel marks and friends: fathatan through sukun (U+064B–U+0652), plus shadda,
 * superscript alef (U+0670) and the Quranic marks at U+0653–U+0655.
 *
 * Stripping them is not lossy in practice — real Arabic writing omits them almost entirely, so a
 * learner typing an undiacritised word and a bank containing a diacritised one must match.
 *
 * ⚠️ **U+06D6–U+06ED, THE QUR'ANIC ANNOTATION BLOCK, IS INCLUDED — and omitting it silently cut
 * words in half.** Measured 2026-08-01 on al-Baqarah 2:2: `هُدًۭى` carries U+06ED ARABIC SMALL LOW
 * MEEM *between* the tanween and the alef maksura. Without this range the mark survives
 * normalisation, so `key()` returns a string no lemma table contains — and worse, a tokenizer built
 * from the same character set splits the word into `هُدً` and `ى`: two fragments, neither of them a
 * word.
 *
 * The block holds recitation and pause signs — sajdah, the small high seen, the small low meem.
 * They tell a reciter how to *say* a word; none of them changes *which* word it is, which is
 * exactly the test for belonging here.
 *
 * The corrected token count over the full mushaf is **77,878**, down from 80,811 — and 77,878 is
 * independently what the `ar-x-quran` pack build reports, which is the reason to believe this range
 * is now right rather than merely wider.
 *
 * ⚠️ A pack widening its tokenizer to match must also DROP tokens that normalise to nothing. Some
 * of these signs stand alone between words, so a wider character class admits tokens made of no
 * letters at all.
 *
 * @module
 */
export function isArabicDiacritic(code: number): boolean {
  return (
    (code >= 0x064b && code <= 0x0655) || code === 0x0670 || (code >= 0x06d6 && code <= 0x06ed)
  );
}
