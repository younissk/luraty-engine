import type { Day, UnitKey } from './ids.js';

/**
 * One observation about the learner.
 *
 * ⚠️ THE IMPORTANT PROPERTY: evidence describes the LEARNER, not the exercise.
 *
 * There is no `source: 'tap' | 'flashcard' | 'speech'` field, and there should never be one. A word
 * tapped while reading, a failed recall, a hesitation mid-sentence and a wrong answer on a test all
 * arrive here in the same shape. That is what lets a speaking exercise be added in six months
 * without the core changing at all — the core cannot tell where anything came from, so it cannot
 * grow a dependency on it.
 *
 * @module
 */

/** What the observation says about the learner's knowledge. */
export type Outcome = 'known' | 'unknown';

export type Evidence = {
  readonly unit: UnitKey;

  readonly outcome: Outcome;

  /**
   * Did the learner actually have to RETRIEVE this, or is it a passive signal?
   *
   * This is the one distinction the core genuinely needs, and it is still about the learner rather
   * than the exercise: was knowledge demonstrated, or merely not contradicted?
   *
   * - `true` — a real retrieval. Recalling a meaning, producing the word, answering a cloze.
   *   Only this can promote a unit.
   * - `false` — a weak signal. Chiefly: reading a text and not asking what this word means.
   *
   * Why the split matters, and why it is not fussiness. If simply *not asking* counted as knowing,
   * two things break at once. A learner who under-taps — shy, skimming, tired — would be recorded
   * as knowing words they cannot read, and the engine would then measure its own accuracy using
   * the very signal that produced the error. Worse for this particular learner: a heritage speaker
   * often recognises a word's shape and has only the domestic sense of it. They will not ask. Let
   * that promote, and the register gap this engine exists to find becomes invisible by
   * construction.
   */
  readonly tested: boolean;

  /** The day this happened. Time is data — the engine never reads a clock. */
  readonly day: Day;
};
