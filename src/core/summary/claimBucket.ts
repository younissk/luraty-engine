/**
 * Which of the three claim buckets this unit is in, if any. See `Summary.claimsRefuted`.
 *
 * @module
 */

import { NEVER, type UnitState } from '../../model/index.js';

export function claimBucket(state: UnitState): 'standing' | 'confirmed' | 'refuted' | undefined {
  if (state.prior.kind !== 'claimed') return undefined;
  if (state.lastAsked === NEVER) return 'standing';
  return state.lastProven === NEVER ? 'refuted' : 'confirmed';
}
