/**
 * Prefix stripping, for languages that attach particles to the front of a word.
 *
 * @module
 */
export type AffixConfig = {
  /** Prefixes to strip, longest first. */
  readonly prefixes: readonly string[];
  /**
   * Only strip when the remainder is a word the pack has heard of.
   *
   * This is what makes affix stripping safe without a morphological analyser. Arabic و ("and") is a
   * legitimate prefix, so ولد would strip to لد — which is not a word. Checking the remainder
   * against the frequency list stops that, and the frequency list is already there.
   */
  readonly onlyIfRemainderKnown: boolean;
};
