/**
 * Fold evidence into a profile, returning a new profile.
 *
 * **This is a fold, and that is a property worth protecting.** Applying evidence one item at a time
 * must equal applying it in one batch — `record(record(p, [a]), [b])` and `record(p, [a, b])` give
 * the same profile. A scheduler's genuinely nasty bugs live in the difference between two paths to
 * the same state, and a property test pins this so no future optimisation can quietly break it.
 * Anything that makes a batch behave differently from a sequence (a per-call cap, a once-per-batch
 * bonus) breaks the law and needs to be a deliberate decision, not a side effect.
 *
 * ⚠️ **`strength` and `lapses` are ORDER-DEPENDENT, and every date field is not.** A saturating ±n
 * walk does not commute: from rung 0, `[miss, hit]` ends at 1 while `[hit, miss]` ends at 0. This is
 * not new — v2's `streak` and `box` were order-dependent in exactly the same way — but it is newly
 * LOAD-BEARING, because `coverage()` now reads `strength` where it used to read a box that a
 * two-success run would have reached from either direction.
 *
 * Two consequences a host must know, and the sequence property suite pins both:
 *
 * 1. **Sort an offline queue by day before folding it.** Same-day ties remain genuinely ambiguous
 *    and are the host's to break however it likes; across days, sorting removes the question.
 * 2. **The repair path is a re-fold from the log**, which is why retaining the evidence log is now a
 *    stated host obligation rather than an unspoken house rule.
 *
 * The commuting alternative — storing `proved` and `failed` counts and deriving a rung from their
 * ratio — was rejected because it can never forget: a word proven 400 times and now failing half the
 * time would read at the ceiling for months.
 *
 * Evidence is `readonly` so this function cannot push into the caller's array, and the caller loses
 * nothing — a mutable array is assignable to a readonly one.
 *
 * The profile's `day` is NOT advanced here. Evidence carries the day it happened, which may be in
 * the past when a host is syncing an offline queue. Moving the learner through time is `advanceTo`,
 * on purpose: recording what happened and deciding it is now tomorrow are different acts.
 *
 * @module
 */

import { UNMET, type Evidence, type Profile, type UnitState } from '../../model/index.js';
import { applyOne } from './applyOne.js';

export function record(profile: Profile, evidence: readonly Evidence[]): Profile {
  if (evidence.length === 0) return profile;

  const units: Record<string, UnitState> = { ...profile.units };

  for (const item of evidence) {
    units[item.unit] = applyOne(units[item.unit] ?? UNMET, item);
  }

  return { ...profile, units };
}
