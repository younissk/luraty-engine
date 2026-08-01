/**
 * Splitting compound words, for languages that build them productively.
 *
 * ⚠️ GERMAN IS WHY THIS EXISTS, and the error it fixes runs in the dangerous direction.
 * `Bahnhofstraße`, `Krankenversicherung` and every other productive compound is absent from any
 * frequency list and always will be — the set is infinite. Without this, each one reads as an
 * unknown word, so coverage UNDERSTATES a German learner's comprehension and the engine feeds
 * easier and easier text to someone who understood the passage fine.
 *
 * ⚠️ THE TRADE, stated plainly because it is a real one. A decomposed compound keys to its HEAD —
 * `Bahnhofstraße` → `straße` — so a learner who has proven `Straße` is credited with every
 * compound ending in it. That is right for comprehension, which is what coverage measures: German
 * compounds are transparent, and treating them as separate vocabulary is exactly the "flattened by
 * a real book" failure this product exists to avoid. It is wrong for production, where
 * `Bahnhofstraße` is a word you either know or do not.
 *
 * Safety comes from the same place as affix stripping: a split is accepted ONLY if every part is a
 * word the frequency list contains. Nothing is guessed.
 *
 * @module
 */
export type CompoundConfig = {
  /**
   * Shortest acceptable part.
   *
   * ⚠️ Not optional and not 2. German is full of two-letter fragments that are also words — `ei`,
   * `so`, `an`, `um` — and at 2 almost any long word "decomposes" into nonsense. 4 is the
   * conservative default.
   */
  readonly minPartLength: number;
  /**
   * Linking morphemes allowed between parts: German writes `Bahnhof-s-straße`, `Blume-n-topf`.
   *
   * The empty string must be included for compounds that join directly.
   */
  readonly linkers: readonly string[];
};
