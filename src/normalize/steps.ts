/**
 * Every step, as a runtime value.
 *
 * A `Record<NormalizeStep, true>` rather than a hand-written array, because the annotation makes the
 * compiler enforce exhaustiveness: adding a member to `NormalizeStep` and forgetting it here is a
 * type error, not a step that silently fails to validate. That is the same guarantee `applyStep`'s
 * switch gives, in the one other place that has to know the whole set.
 *
 * ⚠️ The `true` values are a COMPILE-TIME device and are never read — only the keys are. Flipping
 * one to `false` therefore changes nothing, and `npm run mutate` reports each as a survivor forever.
 * They stay because a `Record<K, true>` is the only shape that makes the compiler check the list is
 * complete; an array would let a step go missing in silence, which is the failure this exists to
 * prevent.
 *
 * ⚠️ Its own file rather than a line in `constants.ts`, for the same reason `model/ladder.ts` is:
 * `NORMALIZE_STEPS` and `STEP_NAMES` both derive from it, and one of them is what `isNormalizeStep`
 * tests against.
 *
 * @module
 */

import type { NormalizeStep } from '../model/index.js';

export const STEPS: Readonly<Record<NormalizeStep, true>> = {
  lowercase: true,
  stripPunctuation: true,
  stripArabicDiacritics: true,
  stripTatweel: true,
  normalizeArabicAlef: true,
  normalizeArabicFinals: true,
  foldLatinDiacritics: true,
  foldGermanUmlauts: true,
};
