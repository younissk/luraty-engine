/**
 * What the engine is being asked to measure.
 *
 * A QUERY, not a passage — which is why `direction` belongs on it. Direction is a property of the
 * question ("could she read this?" versus "could she say this?"), not of the text.
 *
 * @module
 */

import type { Direction } from './direction.js';
import type { Variety } from './variety.js';

export type CoverageQuery = {
  /**
   * Raw text.
   *
   * Deliberately not a pre-split token array. The pack owns tokenization, and the pack is already
   * an argument — accepting somebody else's tokens creates a second definition of "running token"
   * that the engine cannot police. A caller could split French text with an Arabic tokenizer, or
   * hand in a de-duplicated array, and get a plausible number with nothing able to detect it.
   *
   * To measure several passages together, concatenate them with a space. `split` resets its
   * `lastIndex` on every call, so the token streams concatenate exactly. **Never average two
   * coverage ratios** — 19/20 and 49/50 pool to 68/70 (0.9714) but average to 0.965, and the
   * verdict can flip on the difference.
   */
  readonly text: string;

  /**
   * Which variety this text is written in. Required, never inferred.
   *
   * A diglossic profile holds two varieties at once — the dialect spoken at home and the standard
   * that is read — and they are measured separately. `profile.language` cannot stand in for this:
   * it is an opaque host string, and a profile with `language: 'ar'` is legitimately queried with
   * a pack whose id is `'ar-msa'`.
   */
  readonly variety: Variety;

  /**
   * Which way the knowledge has to run. Required, and deliberately without a default.
   *
   * The gap between what a heritage speaker recognises and what they can produce is the single
   * defining feature of the learner this engine exists for. Defaulting to `'recognise'` would be
   * right for reading and silently wrong for a speaking task — and silently is the problem: every
   * number would still look plausible.
   */
  readonly direction: Direction;

  /**
   * Surface forms in this text that are **not vocabulary** — names, brands, codes, foreign
   * fragments. Counted separately and excluded from the denominator.
   *
   * ⚠️ THE CALLER DECIDES, AND THAT IS THE WHOLE DESIGN. The obvious alternative is for the pack to
   * detect names itself, and for German it cannot: German capitalises EVERY noun, so "capitalised
   * and unknown" catches `Rezession` and `Impfpflicht` exactly as readily as `Toyota`. A pack-level
   * heuristic would hand the learner credit for not knowing ordinary German words, which inflates
   * the number the engine steers on — the one direction of error that must not be allowed.
   *
   * Arabic settles it: it has no letter case at all, so no token-level rule exists there even in
   * principle. Proper-noun detection is a property of the CONTENT, not of the language, and the host
   * is the only party that knows — it has the editor, or an NER pass, or a hand-tagged corpus.
   *
   * Why it matters: measured on held-out German news, names and acronyms are **66% of everything a
   * 10,000-lemma pack does not know**. Counting them makes coverage read 89.6%; excluding them makes
   * the same text read 96.8%, which is the difference between "unreachable" and "in band".
   *
   * Matched on the RAW surface, before normalization, because capitalisation is exactly the signal
   * a host uses to find them.
   */
  readonly ignore?: readonly string[];
};
