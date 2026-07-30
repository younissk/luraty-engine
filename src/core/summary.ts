import { assertNever } from '../internal/assert.js';
import { NEVER, parseUnitKey, type UnitKey } from '../model/ids.js';
import type { Profile } from '../model/profile.js';
import type { Summary, SummaryScope } from '../model/summary.js';
import { effectiveStrength, isKnown, MAX_STRENGTH, type UnitState } from '../model/unit.js';

import { STUCK_AFTER_LAPSES } from './plan.js';

/**
 * Reducing a learner to a number small enough to keep forever.
 *
 * @module
 */

/**
 * Does this unit fall inside the scope being summarised?
 *
 * ⚠️ **EVERY SCOPE PARSES THE KEY, INCLUDING `'all'`**, and the reason is a law rather than tidiness.
 * `summarize` promises that the four per-skill scopes partition the profile exactly — nothing
 * double-counted, nothing dropped. `unitKey(d, v, '')` mints `"recognise:fr:"`, which `parseUnitKey`
 * rejects for having no word; `record` writes whatever key it is handed, so such a unit can reach a
 * profile. If `'all'` counted it and no skill scope could, the partition would silently be off by
 * one for every malformed key present.
 *
 * The alternative — having `'all'` return true unconditionally and calling the law approximate — was
 * rejected: an unaddressable unit is not a unit anybody can act on, so counting it in a headline
 * number is the worse error.
 */
function inScope(key: UnitKey, scope: SummaryScope): boolean {
  const parts = parseUnitKey(key);
  if (parts === undefined) return false;
  switch (scope.kind) {
    case 'all':
      return true;
    case 'skill': {
      // Matched on the PARSED parts rather than a string prefix. A prefix test would need the
      // caller's variety to be free of colons — true today by construction, and exactly the kind of
      // invariant that stops being true quietly.
      return parts.direction === scope.direction && parts.variety === scope.variety;
    }
    default:
      return assertNever(scope, 'SummaryScope');
  }
}

/** Which of the three claim buckets this unit is in, if any. See {@link Summary.claimsRefuted}. */
function claimBucket(state: UnitState): 'standing' | 'confirmed' | 'refuted' | undefined {
  if (state.prior.kind !== 'claimed') return undefined;
  if (state.lastAsked === NEVER) return 'standing';
  return state.lastProven === NEVER ? 'refuted' : 'confirmed';
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
  let lastProven = NEVER;

  // ⚠️ `Object.keys`, not `Object.entries`, and it is not a style preference. `entries` materialises
  // one two-element array PER UNIT before the loop body has run once — 20,000 throwaway arrays for a
  // function that returns eight integers, on a runtime with no generational nursery to make that
  // free. The indexed lookup reads the same state with no allocation at all.
  for (const key of Object.keys(profile.units) as UnitKey[]) {
    const state = profile.units[key];
    // Cannot miss: the key came from `Object.keys`. Present because `noUncheckedIndexedAccess` says
    // so, and a `!` here would be a lie about an index signature. Same known equivalent mutant as
    // `plan()` carries, for the same stated reason.
    if (state === undefined) continue;
    if (!inScope(key, scope)) continue;

    units += 1;
    // ⚠️ THE EFFECTIVE RUNG, not the raw one — so a confirmed claim shows up in the histogram at the
    // same place it counts for `known`. `known` is documented as a suffix sum of `byStrength`, and
    // reporting the raw rung here while `isKnown` reads the effective one would break that law and
    // hand a host two numbers that quietly disagree.
    //
    // Defensive `min`/`max` against a rung outside the ladder, which `deserialize` cannot produce and
    // a hand-built profile can. Dropping it silently would make the histogram disagree with `units`.
    const rung = Math.min(Math.max(effectiveStrength(state), 0), MAX_STRENGTH);
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
