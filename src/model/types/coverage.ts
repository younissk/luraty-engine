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
 *
 * @module
 */

import type { Band } from './band.js';
import type { Lemma } from './lemma.js';

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
       * in band — see `COVERAGE_BAND` for why that needs saying out loud.
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
       * resolve. See `COVERAGE_BAND.minTokens`.
       */
      readonly kind: 'too-short';
      readonly runningTokens: number;
      readonly knownTokens: number;
      readonly unknownTokens: number;
      /** Running tokens counted unknown that rest on a standing claim. See the header above. */
      readonly claimedTokens: number;
      readonly unkeyableTokens: number;
      /** Tokens the caller marked as not-vocabulary. See `CoverageQuery.ignore`. */
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
       * harder than it is. See `CoverageQuery.ignore`.
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
       * The verdict depends on whether you believe an unchecked claim. See the header above.
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
       * ⚠️ Feed these — through `key()` and `unitKey()` — straight into `PlanOptions.priority`.
       * Coverage's own uncertainty becomes tomorrow's drill list: the words she is about to read that
       * nobody has checked are exactly the words worth checking, and the loop closes with no new
       * machinery anywhere.
       *
       * A TYPE count like `unknownLemmas`, and never a numerator.
       */
      readonly claimedLemmas: readonly Lemma[];
    };
