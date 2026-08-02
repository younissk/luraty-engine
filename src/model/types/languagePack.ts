/**
 * The language pack contract.
 *
 * The engine knows no language. Everything language-specific arrives through this interface, which
 * is why one engine can serve French, Arabic and anything else without a branch.
 *
 * Four functions is the whole surface. That is not minimalism for its own sake — every function
 * here is one the engine genuinely cannot do itself, and nothing else qualifies. If a fifth is ever
 * needed, that is a real signal about the design rather than a convenience.
 *
 * @module
 */

import type { Lemma } from './lemma.js';
import type { Variety } from './variety.js';

export type LanguagePack = {
  /**
   * Identifies the pack, and IS the variety it addresses.
   *
   * ⚠️ **Branded as `Variety`, and that is a guarantee `createPack` now enforces.** A pack id
   * containing a colon used to build fine while `variety()` rejected the same string — and if a host
   * forced it through, `unitKey('recognise', 'ar:msa', 'سوق')` produced `recognise:ar:msa:سوق`,
   * which `parseUnitKey` reads back as variety `ar`, word `msa:سوق`. A pack that builds, reports
   * healthy, and silently re-addresses every word it owns.
   *
   * Validating it at the one door that already returns a result makes that unrepresentable, and it
   * is what lets `learner()` default its variety: pack id and variety are the same string in every
   * pack that exists (`de`, `fr`, `ar-msa`), so restating it at the call site was duplication with a
   * live typo hazard — `variety('be')` beside a `de` pack files every unit under an address nothing
   * ever reads, forever, silently.
   *
   * ⚠️ This encodes ONE PACK PER VARIETY. That is true today and it is not free: the day a second
   * German pack ships (a graded-reader one beside the frequency one), both address `de` and the id
   * can no longer be the variety. The fix then is an optional `PackConfig.variety` defaulting to
   * `id` — purely additive, and it breaks no stored unit key.
   */
  readonly id: Variety;

  /**
   * Text → surface tokens.
   *
   * The engine cannot do this: French splits on spaces and apostrophes, Arabic on spaces, Chinese
   * and Japanese on nothing at all and need a dictionary.
   */
  split(text: string): readonly string[];

  /**
   * Surface form → canonical form. The answer to "are these the same word?".
   *
   * `vais` and `allons` both key to `aller`; `السوق` keys to `سوق` with the article stripped. The
   * engine then addresses knowledge by this canonical form, so a learner who met `vais` gets credit
   * when they meet `allez`.
   */
  key(surface: string): Lemma;

  /**
   * How common a word is. `1` is the most common word in the language.
   *
   * `undefined` means "not in the list", i.e. rarer than anything the pack knows about.
   *
   * ⚠️ Deliberately NOT `Infinity` for unknown. `JSON.stringify(Infinity)` is `null`, so an
   * infinite rank that reaches a persisted profile or a report silently becomes a null and the
   * failure surfaces somewhere else entirely.
   *
   * This is a property of the LANGUAGE, not of the learner, which is why a pack must carry data and
   * cannot be pure code: you cannot derive how common a word is from one person's history.
   */
  rank(lemma: Lemma): number | undefined;

  /**
   * Is this answer right? `1` exact, `0` wrong, in between for partial credit.
   *
   * Language-specific because what counts as "the same answer" is: French folds accents, Arabic
   * folds diacritics that are optional in writing anyway.
   */
  compare(given: string, expected: string): number;
};
