import { assertNever } from '../internal/assert.js';
import { parseUnitKey, type Day, type UnitKey } from '../model/ids.js';
import type { Profile } from '../model/profile.js';
import type { Summary, SummaryScope } from '../model/summary.js';
import { isKnown, MAX_STRENGTH, type UnitState } from '../model/unit.js';

import { STUCK_AFTER_LAPSES } from './plan.js';

/**
 * Reducing a learner to a number small enough to keep forever.
 *
 * @module
 */

/** Does this unit fall inside the scope being summarised? */
function inScope(key: UnitKey, scope: SummaryScope): boolean {
  switch (scope.kind) {
    case 'all':
      return true;
    case 'skill': {
      // Parsed rather than matched on a string prefix. A prefix test would need the caller's variety
      // to be free of colons — true today by construction, and exactly the kind of invariant that
      // stops being true quietly.
      const parts = parseUnitKey(key);
      if (parts === undefined) return false;
      return parts.direction === scope.direction && parts.variety === scope.variety;
    }
    default:
      return assertNever(scope, 'SummaryScope');
  }
}

/** Which of the three claim buckets this unit is in, if any. See {@link Summary.claimsRefuted}. */
function claimBucket(state: UnitState): 'standing' | 'confirmed' | 'refuted' | undefined {
  if (state.prior.kind !== 'claimed') return undefined;
  if (state.lastAsked === 0) return 'standing';
  return state.lastProven === 0 ? 'refuted' : 'confirmed';
}

/**
 * Summarise a learner.
 *
 * O(units), and deliberately NOT cached on the profile. A denormalised counter is a cache, a cache
 * rots, and the one that rots here would be the number shown on the home screen. It is also what
 * keeps `record` the only function that writes to a profile.
 *
 * Total: every scope has an honest answer, including "no units match", which reports zeros and a
 * `daysSinceProven` of the full span since the epoch.
 */
export function summarize(profile: Profile, scope: SummaryScope): Summary {
  const byStrength = [0, 0, 0, 0, 0, 0, 0];
  let units = 0;
  let known = 0;
  let claimsStanding = 0;
  let claimsConfirmed = 0;
  let claimsRefuted = 0;
  let stuck = 0;
  let lastProven = 0 as Day;

  for (const [key, state] of Object.entries(profile.units)) {
    if (!inScope(key as UnitKey, scope)) continue;

    units += 1;
    // Defensive against a rung outside the ladder, which `deserialize` cannot produce and a
    // hand-built profile can. Dropping it silently would make the histogram disagree with `units`.
    const rung = Math.min(Math.max(state.strength, 0), MAX_STRENGTH);
    byStrength[rung] = (byStrength[rung] ?? 0) + 1;

    if (isKnown(state)) known += 1;
    if (state.lapses >= STUCK_AFTER_LAPSES) stuck += 1;
    if (state.lastProven > lastProven) lastProven = state.lastProven;

    const bucket = claimBucket(state);
    if (bucket === 'standing') claimsStanding += 1;
    if (bucket === 'confirmed') claimsConfirmed += 1;
    if (bucket === 'refuted') claimsRefuted += 1;
  }

  return {
    day: profile.day,
    language: profile.language,
    scope,
    units,
    // Fixed-length by construction above; the assertion carries that fact to the type, which cannot
    // see it. The array is built here and never escapes before this line.
    byStrength: byStrength as unknown as Summary['byStrength'],
    known,
    claimsStanding,
    claimsConfirmed,
    claimsRefuted,
    stuck,
    daysSinceProven: Math.max(0, profile.day - lastProven),
  };
}
