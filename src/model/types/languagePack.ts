/**
 * The language pack contract.
 *
 * The engine knows no language. Everything language-specific arrives through this interface, which
 * is why one engine can serve French, Arabic and anything else without a branch.
 *
 * Four functions was the whole surface. That is not minimalism for its own sake — every function
 * here is one the engine genuinely cannot do itself, and nothing else qualifies. The header used to
 * end "if a fifth is ever needed, that is a real signal about the design rather than a
 * convenience", and `candidates` is that fifth. Here is the signal, stated rather than waved at:
 *
 * ⚠️ **`key` ANSWERS "ARE THESE THE SAME WORD?" AND CANNOT ALSO ANSWER "WHAT WORD IS THIS?".** The
 * engine only ever needed the first, because it addresses knowledge and never renders meaning. A
 * reader needs the second, and in an unvocalised script the second has more than one answer: كتب
 * is *he wrote* and *books*, and no amount of canonicalisation makes that one word. Folding the two
 * questions into one function is what made the pack table pick a reading silently — 86,910 Arabic
 * surface forms, every one committed to exactly one lemma, nothing anywhere recording that a choice
 * had been made (#177).
 *
 * So the fifth function is not a convenience over the fourth; it is the question the fourth was
 * quietly answering wrong. `key` keeps its meaning exactly, `candidates` says what else the form
 * could have been, and `candidates(s)[0] === key(s)` is enforced so the two can never drift.
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
   * Surface form → every canonical form it could be, likeliest first. The answer to "what word is
   * this?", which is a different question from `key`'s.
   *
   * ⚠️ **NEVER EMPTY, AND THE FIRST ELEMENT IS ALWAYS `key(surface)`.** Both halves are load-bearing
   * and both are asserted by `checkPack`. A caller may therefore treat the list as "the answer, plus
   * the answers it beat", which means adding a second column to a pack's lemma table can never move
   * a unit key, a coverage figure or a schedule: everything that reads `key` reads element zero.
   *
   * ⚠️ **A ONE-ELEMENT LIST IS THE COMMON CASE AND MEANS "UNAMBIGUOUS", NOT "UNKNOWN".** A form the
   * pack has never heard of also comes back as one element — whatever `key` derived from it — so
   * length alone does not distinguish confidence from ignorance. Ask `rank` for that.
   *
   * ⚠️ **THE ENGINE ITSELF NEVER CALLS THIS.** Coverage, planning and the fold all address knowledge
   * by `key`, and giving them a list would mean deciding which reading a learner met — a decision
   * belonging to the learner, not to the scheduler. It exists for a host that renders help: showing
   * every sense a form can carry is a learning activity, whereas showing one guessed sense with a
   * caveat attached transfers the risk to the person least able to evaluate it.
   */
  candidates(surface: string): readonly Lemma[];

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
