/**
 * Claimed, and never yet asked about — the liability a placement creates.
 *
 * This is the predicate behind `Why.'verify'` and behind `Summary.claimsStanding`. Note that it is
 * *not* "has a claim": a claim survives being checked, which is what makes the confirmed/refuted
 * split computable from present state with no history at all.
 *
 * @module
 */

import { NEVER } from './constants.js';
import type { UnitState } from './types/unitState.js';

export function hasStandingClaim(state: UnitState): boolean {
  return state.prior.kind === 'claimed' && state.lastAsked === NEVER;
}
