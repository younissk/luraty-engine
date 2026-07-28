import { assertNever } from '../internal/assert.js';
import { COVERAGE_BAND, type Band, type Coverage, type CoverageQuery } from '../model/coverage.js';
import { unitKey } from '../model/ids.js';
import type { LanguagePack, Lemma } from '../model/pack.js';
import type { Profile } from '../model/profile.js';
import type { UnitState } from '../model/unit.js';

import { unitState } from './profile.js';

/**
 * Measuring a text against what a learner knows.
 *
 * @module
 */

/**
 * Is this unit known, for the purpose of coverage?
 *
 * ⚠️ A switch and not `state.box === 'understood'`. `Box` is a two-member union today; an equality
 * test would silently classify a future third box as unknown, moving every learner's coverage
 * number with no compile error anywhere. The switch turns that edit into a worklist the compiler
 * writes for you.
 */
function isKnown(state: UnitState): boolean {
  switch (state.box) {
    case 'learning':
      // Including at `streak: PROMOTE_AFTER_SUCCESSES - 1`. There is no partial credit here,
      // because half a running token is not a thing the band can be a claim about.
      return false;
    case 'understood':
      return true;
    default:
      return assertNever(state, 'UnitState');
  }
}

/**
 * Classify a token count against the band. Integers only — see {@link COVERAGE_BAND}.
 *
 * Not exported, deliberately. Exporting it would reopen the exact hole that taking `text` closes:
 * a caller could supply counts from its own tokenizer and get an authoritative-looking verdict on
 * a token stream the engine never saw.
 */
function classify(runningTokens: number, unknownTokens: number): Band {
  // Denser than one unknown in 20 — below 95%.
  if (unknownTokens * COVERAGE_BAND.hardEdgeOneUnknownIn > runningTokens) return 'too-hard';
  // Sparser than one unknown in 50 — above 98%. Includes zero unknowns, which is the case a
  // reviewer is most likely to file as a bug: a text a learner knows entirely teaches no
  // vocabulary, so it is too easy rather than perfect.
  if (unknownTokens * COVERAGE_BAND.easyEdgeOneUnknownIn < runningTokens) return 'too-easy';
  // Both edges are CLOSED. (20, 1) is 0.95 exactly and (50, 1) is 0.98 exactly; ADR-0003 describes
  // the band by naming its endpoints, so including them is the faithful reading.
  return 'in-band';
}

/**
 * How much of a text this learner knows, classified against ADR-0003 invariant 1.
 *
 * Total: it never throws and returns no `Decoded<>` wrapper. Nothing here is a trust boundary —
 * `text` is just text, and every input has an honest total answer, including "there is nothing to
 * measure".
 *
 * **What counts as known** is exactly one thing: the unit is in the `understood` box for the
 * requested direction and variety. Not "has met it" — a heritage speaker often recognises a word's
 * shape while holding only its domestic sense, and will not ask; letting that count would make the
 * register gap this engine exists to find invisible by construction, in the very number selection
 * is steered by. Not a rank proxy either: the pack is a tokenizer and a keyer here, and `rank()` is
 * never called.
 *
 * **The grain is the word**, deliberately. Chunks are first-class ITEMS in ADR-0003, not first-class
 * TOKENS; the band's construct is word families over running text, so letting a known chunk claim
 * its whole span would inflate coverage against its own source. When chunks arrive they change what
 * makes a token known — they must never change what a token IS.
 */
export function coverage(profile: Profile, pack: LanguagePack, query: CoverageQuery): Coverage {
  const surfaces = pack.split(query.text);

  let runningTokens = 0;
  let knownTokens = 0;
  let unkeyableTokens = 0;
  const unknownLemmas: Lemma[] = [];
  // Doubles as the memo for the profile lookup, so a word repeated 40 times costs one lookup. The
  // insertion order of a Map is the first-appearance order the result promises.
  const seen = new Map<Lemma, boolean>();

  for (const surface of surfaces) {
    const lemma = pack.key(surface);

    // Not a running token. `unitKey(d, v, '')` mints an address `parseUnitKey` rejects, so an empty
    // lemma can never be known — leaving it in the denominator would cap coverage below 1 for a
    // typographic reason, and a read-only function would be minting keys that cannot round-trip.
    if (lemma.length === 0) {
      unkeyableTokens += 1;
      continue;
    }

    runningTokens += 1;

    let known = seen.get(lemma);
    if (known === undefined) {
      known = isKnown(unitState(profile, unitKey(query.direction, query.variety, lemma)));
      seen.set(lemma, known);
      if (!known) unknownLemmas.push(lemma);
    }
    if (known) knownTokens += 1;
  }

  const unknownTokens = runningTokens - knownTokens;

  // ⚠️ MUST come before the band test. The integer test is TRUE at (0, 0) — `0 * 20 <= 0` and
  // `0 * 50 >= 0` — so without this guard an empty string reports itself as perfectly pitched
  // material. Every other test in the suite has tokens, so nothing else would ever see it.
  if (runningTokens === 0) return { kind: 'no-words', unkeyableTokens };

  // ⚠️ Also before the band test, and UNCONDITIONALLY — not only when the ratio lands somewhere
  // awkward. At 19 tokens with 10 unknown (47% coverage) the answer is still `'too-short'`.
  // Making the floor depend on the value being classified is how non-monotonic selection gets in.
  if (runningTokens < COVERAGE_BAND.minTokens) {
    return {
      kind: 'too-short',
      runningTokens,
      knownTokens,
      unknownTokens,
      unkeyableTokens,
      unknownLemmas,
      needsMoreTokens: COVERAGE_BAND.minTokens - runningTokens,
    };
  }

  return {
    kind: 'measured',
    runningTokens,
    knownTokens,
    unknownTokens,
    unkeyableTokens,
    unknownLemmas,
    band: classify(runningTokens, unknownTokens),
  };
}
