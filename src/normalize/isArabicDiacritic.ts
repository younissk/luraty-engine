/**
 * The short-vowel marks and friends: fathatan through sukun (U+064B–U+0652), plus shadda,
 * superscript alef (U+0670) and the Quranic marks at U+0653–U+0655.
 *
 * Stripping them is not lossy in practice — real Arabic writing omits them almost entirely, so a
 * learner typing an undiacritised word and a bank containing a diacritised one must match.
 *
 * @module
 */
export function isArabicDiacritic(code: number): boolean {
  return (code >= 0x064b && code <= 0x0655) || code === 0x0670;
}
