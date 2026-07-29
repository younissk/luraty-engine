import type { Direction, Variety } from './ids.js';
import type { Lemma } from './pack.js';

/**
 * How much of a text a learner knows, and what that says about whether to give it to them.
 *
 * This is ADR-0003 invariant 1 — the 95–98% known-token coverage band, which the report calls
 * *"the physics behind 'too easy vs. too hard'"*. At 98% coverage (1 unknown word in 50) most
 * learners read with adequate unassisted comprehension; at 95% (1 in 20) comprehension is minimal
 * and guessing unknown words becomes unreliable. The band is also where learning from input
 * happens at all: learners infer unknown words correctly ~80% of the time inside it, and only ~52%
 * at 90%.
 *
 * So difficulty is a property of **this text against this learner's known-token set**, not a rating
 * stamped on an item. That is the whole reason this module exists.
 *
 * @module
 */

/**
 * What the engine is being asked to measure.
 *
 * A QUERY, not a passage — which is why `direction` belongs on it. Direction is a property of the
 * question ("could she read this?" versus "could she say this?"), not of the text.
 */
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

/**
 * Where a text sits against the band.
 *
 * Named for what it means to a learner rather than for its position on a number line. `'too-easy'`
 * is not good news: a text with nothing unknown in it teaches no vocabulary.
 */
export type Band = 'too-hard' | 'in-band' | 'too-easy';

/**
 * How much of a text this learner knows.
 *
 * ⚠️ **FOUR kinds. `'unverified'` is NOT a fourth way of failing to resolve.** `'no-words'` and
 * `'too-short'` still mean "I cannot tell" and still carry no band at all. `'unverified'` means
 * something sharper: **the verdict CHANGES depending on whether you believe an unchecked
 * self-report**, so it carries BOTH readings and makes the caller pick which one to act on.
 *
 * It exists because of a measured gap. `coverage()` counts a unit known only once it has been
 * proven, so a learner placed at 800 claimed words reads ~0% on every text until the app has
 * actually drilled them — for months, on the learner whose defining trait is already knowing a lot.
 * Counting claims silently instead would compute the band on self-report, which correlates only
 * about **r ≈ .39** with tested proficiency. Neither is honest, so the disagreement is surfaced.
 *
 * The trigger needs no new constant and no threshold to tune. `coverage()` classifies twice —
 * strictly (only proven counts) and generously (a standing claim counts too) — and returns
 * `'measured'` when the two AGREE. "The answer changes" is the only non-arbitrary definition of
 * "I cannot tell" available here. It also self-extinguishes: every verification moves a token from
 * claimed to known, so the category drains to `'measured'` with nobody adjusting anything.
 *
 * Consequently `'measured'` now means something STRONGER than it did in v2: this verdict is robust
 * to whether you trust her.
 *
 * ⚠️ **`band` exists only on `'measured'`, and that is the load-bearing shape decision here.**
 *
 * The tempting alternative is one flat object with a four-valued band including something like
 * `'unknown'`. It reads fine and it leaves this compiling:
 *
 * ```ts
 * if (result.band !== 'in-band') giveThemSomethingEasier();
 * ```
 *
 * — which silently treats "I cannot tell" as "too hard". Putting resolution on the `kind` axis
 * makes that line a compile error until the caller narrows. It also stops mixing two categories:
 * three of those values are positions on a scale, and the fourth says the scale does not apply.
 *
 * The variants are written out in full rather than sharing a base type, matching `UnitState`.
 */
export type Coverage =
  | {
      /**
       * The pack found no words here.
       *
       * Covers an empty string, punctuation-only text, and the realistic case: text in a script
       * this pack does not cover — `arabicPack.split('bonjour le monde')` is `[]`. `checkPack`
       * reports the same fact about a pack as `tokenizer-matches-nothing`.
       *
       * There is no coverage of a text with no words. 0/0 is not 0, and it is emphatically not
       * in band — see {@link COVERAGE_BAND} for why that needs saying out loud.
       */
      readonly kind: 'no-words';
      /** Tokens the caller marked as not vocabulary. */
      readonly ignoredTokens: number;
      /**
       * Tokens that `split()` produced and `key()` reduced to nothing.
       *
       * `0` means the tokenizer itself matched nothing. `> 0` means it matched and every match
       * keyed away to the empty string. One field, two distinguishable diagnoses.
       */
      readonly unkeyableTokens: number;
    }
  | {
      /**
       * Too short for the band to have a representable point.
       *
       * Returned **unconditionally** at this length, never conditionally on where the ratio happens
       * to fall. The counts below are real and useful; it is the CLASSIFICATION that does not
       * resolve. See {@link COVERAGE_BAND.minTokens}.
       */
      readonly kind: 'too-short';
      readonly runningTokens: number;
      readonly knownTokens: number;
      readonly unknownTokens: number;
      /** Running tokens counted unknown that rest on a standing claim. See {@link Coverage}. */
      readonly claimedTokens: number;
      readonly unkeyableTokens: number;
      /** Tokens the caller marked as not-vocabulary. See {@link CoverageQuery.ignore}. */
      readonly ignoredTokens: number;
      readonly unknownLemmas: readonly Lemma[];
      /** `COVERAGE_BAND.minTokens - runningTokens`. Always at least 1. */
      readonly needsMoreTokens: number;
    }
  | {
      readonly kind: 'measured';
      /**
       * Tokens with a non-empty canonical form.
       *
       * RUNNING tokens — a repeat counts every time. `split('de de de la la')` is 5, not 2. The
       * band is a claim about unknown-word density in text a learner actually reads through, so
       * counting types instead would silently inflate every number.
       *
       * `knownTokens + unknownTokens === runningTokens`, exactly. There is no third bucket:
       * unkeyable tokens are excluded from this count by definition rather than filtered out of it
       * afterwards.
       */
      readonly runningTokens: number;
      /** Proven knowledge only — `strength >= KNOWN_AT_STRENGTH`. Never includes a bare claim. */
      readonly knownTokens: number;
      readonly unknownTokens: number;
      /**
       * Running tokens resting on a standing claim.
       *
       * ⚠️ MAY BE `> 0` on this variant, and that is not a contradiction: this kind means the band
       * comes out the same either way, which is the honest "it does not matter here" answer.
       */
      readonly claimedTokens: number;
      /**
       * Tokens dropped because `key()` returned the empty string.
       * `runningTokens + unkeyableTokens + ignoredTokens === pack.split(text).length`.
       *
       * Reachable with an ordinary pack, not a contrivance: a run of tatweel — the Arabic
       * elongation character, plain typography — tokenizes as one word and `stripTatweel` erases
       * it. Such a token is structurally unaddressable, because `parseUnitKey` rejects a
       * zero-length word, so it can never be known. Counting it as unknown would push a passage
       * toward `'too-hard'` over a decorative character.
       */
      readonly unkeyableTokens: number;
      /**
       * Tokens the caller marked as not vocabulary — names, brands, codes.
       *
       * Excluded from `runningTokens` for the same reason `unkeyableTokens` is: a learner who does
       * not recognise `Toyota` has no vocabulary gap, and counting it as one makes every text look
       * harder than it is. See {@link CoverageQuery.ignore}.
       */
      readonly ignoredTokens: number;
      /**
       * Distinct unknown lemmas, de-duplicated, in first-appearance order.
       *
       * Not sorted: every tiebreak wants a string comparator, the idiomatic one is `localeCompare`,
       * and that is ICU-backed and banned here. First-appearance order is free, deterministic on
       * every runtime, and what a reading screen wants anyway.
       *
       * This is a TYPE count — `unknownLemmas.length <= unknownTokens` — and must never be used as
       * a numerator.
       *
       * Deliberately carries no rank. `rank(key(w))` is genuinely `undefined` for words a pack's
       * own frequency list contains, whenever a lemma entry points somewhere the list does not go;
       * shipping the field would ship a number that is missing for no reason a caller can see.
       */
      readonly unknownLemmas: readonly Lemma[];
      readonly band: Band;
    }
  | {
      /**
       * The verdict depends on whether you believe an unchecked claim. See {@link Coverage}.
       *
       * Both readings are carried and neither is privileged, because the engine genuinely does not
       * know which is right — that is what a placement is for, and this variant is how the engine
       * asks for one.
       */
      readonly kind: 'unverified';
      readonly runningTokens: number;
      /** Proven only. The strict reading's numerator. */
      readonly knownTokens: number;
      readonly unknownTokens: number;
      /** Always `> 0` here, and always enough to flip the verdict — or this variant is not returned. */
      readonly claimedTokens: number;
      readonly unkeyableTokens: number;
      readonly ignoredTokens: number;
      /** Unknown under the STRICT reading, so claimed lemmas appear here too. */
      readonly unknownLemmas: readonly Lemma[];
      /** Counting only what she has proven. */
      readonly strict: Band;
      /** Counting standing claims as known. Always `!== strict`. */
      readonly withClaims: Band;
      /**
       * Distinct claimed-but-unchecked lemmas in this text, first-appearance order.
       *
       * ⚠️ Feed these — through `key()` and `unitKey()` — straight into {@link PlanOptions.priority}.
       * Coverage's own uncertainty becomes tomorrow's drill list: the words she is about to read that
       * nobody has checked are exactly the words worth checking, and the loop closes with no new
       * machinery anywhere.
       *
       * A TYPE count like `unknownLemmas`, and never a numerator.
       */
      readonly claimedLemmas: readonly Lemma[];
    };

/**
 * The band, expressed the way ADR-0003 states it: **integer unknown-token density.**
 *
 * The ADR says "1 unknown word in 50" and "1 in 20". So the test is
 * `unknown * 20 <= tokens && unknown * 50 >= tokens` — two multiplications by small integers and
 * two comparisons. No division, no float literal, no epsilon, nothing whose formatting differs by
 * runtime.
 *
 * This is not floating-point superstition. The float form is exact: `19 / 20 === 0.95` and
 * `49 / 50 === 0.98` are both true, because IEEE754 division and decimal-literal parsing are both
 * correctly rounded onto the same real value. But that exactness is a proof no reviewer can audit
 * at a glance, and it dies to any edit that looks like tidying — a percentage hop
 * (`ratio * 100 >= 95`), a defensive `- 1e-9` that silently widens the band, a stray `Math.round`.
 * The integer form has no proof to break, and it reads as the ADR's own sentence.
 *
 * Exact while `50 * unknownTokens < 2^53`, which is about 1.8e14 tokens.
 */
export const COVERAGE_BAND = {
  /**
   * The 95% edge — at most 1 unknown word per 20 running tokens.
   *
   * Denser than this is **too hard**: comprehension is minimal and inferring unknown words from
   * context stops working (~52% correct at 90% coverage, against ~80% inside the band).
   */
  hardEdgeOneUnknownIn: 20,

  /**
   * The 98% edge — at least 1 unknown word per 50 running tokens.
   *
   * Sparser than this is **too easy**: comprehension is fine and there is little left to learn from
   * the input.
   */
  easyEdgeOneUnknownIn: 50,

  /**
   * Below this many running tokens the band has **no representable point**, so no verdict is honest.
   *
   * ⚠️ Derived, not an independent literal. `unknownTokens` is a non-negative integer, and zero
   * unknowns is 100% coverage — which is above the band, not inside it. So landing in band needs at
   * least one unknown token, which needs `1 * hardEdgeOneUnknownIn <= runningTokens`.
   *
   * Enumerated, because this is the kind of claim that should not rest on an argument: for every
   * n ≤ 19 the only reachable coverages are 1.00000 (u=0) and at most 0.94737 (n=19, u=1).
   * `'in-band'` cannot occur. The first (n, u) that reaches it is (20, 1) = 0.95 exactly.
   *
   * It is exported so that a future `plan()` can carry the floor outward. The engine cannot fetch
   * content, so if the host is never told "at least 20 running tokens", it supplies a nine-word
   * sentence and the band objective is unsatisfiable by construction, silently, forever.
   */
  minTokens: 20,
} as const;
