/**
 * Met it and moved on. Reading a word in a passage and not asking about it.
 *
 * ⚠️ NO `outcome` FIELD, so "passive and wrong" is structurally unrepresentable here — that is
 * `Help`, which says what the learner actually DID rather than what somebody inferred. Under v2 this
 * was `{ tested: false, outcome }`, and the ordering of the branches in `applyOne` meant
 * `{ tested: false, outcome: 'unknown' }` demoted an understood unit outright: four months of proof
 * erased by a gloss tap, with no test covering it. Splitting the variants makes that unwritable.
 *
 * Exposure moves `seen` and `lastSeen` and NOTHING else. It cannot promote — a heritage speaker
 * often recognises a word's shape while holding only its domestic sense, and will not ask; letting
 * not-asking count as knowing would make the register gap this engine exists to find invisible by
 * construction.
 *
 * @module
 */

import type { Day } from './day.js';
import type { UnitKey } from './unitKey.js';

export type Exposure = {
  readonly kind: 'exposure';
  readonly unit: UnitKey;
  readonly day: Day;
};
