/**
 * How strong this unit is once a CONFIRMED claim is taken into account.
 *
 * ⚠️ **A CLAIM THAT HAS BEEN CHECKED IS WORTH ONE RUNG, and this is the only place it counts for
 * anything.** A bare claim is still worth nothing at all — the bonus needs `lastProven`, which only
 * a successful retrieval can move.
 *
 * ### Why this exists
 *
 * Simulated: a heritage speaker places at 2,558 claimed words and drills 15 a day. Her queue is
 * 2,587 units, so a word comes back roughly every **172 days** — and the known rung needs TWO
 * proofs. Twelve weeks in she had proven 1,085 of her claims, was reading the sample passage at
 * 100%, and the engine still reported **0 words known**. `coverage()` said `'too-hard'` on that same
 * passage every single week, and got *worse* as she worked, because verifying a claim moves it out
 * of the claimed bucket (which could have flipped the verdict) and into rung 1, which reads as
 * plain unknown.
 *
 * A claim plus an independent retrieval is **two signals from different sources**, which is what the
 * known rung was ever meant to represent. One proof on an UNCLAIMED word still lands at rung 1 and
 * is still not known, so nothing is inflated.
 *
 * ### Why it is DERIVED and not folded in
 *
 * The obvious implementation gives the first proof of a claimed word `+2` inside `applyOne`. That
 * would make the claim path order-dependent for the first time: `[proof, claim]` and
 * `[claim, proof]` would disagree, because the proof would not yet have seen the claim. An offline
 * queue makes no ordering promise, so two learners who did identical work would get different
 * numbers. Computing it on read costs nothing and keeps `record` commutative on this path — the
 * `record` suite pins that both orders converge.
 *
 * ### It can still be taken away
 *
 * The bonus rides on `strength`, not instead of it. A claimed word proven once sits at raw rung 1,
 * effective 2 — and one failed retrieval takes the raw rung to 0, so the effective rung drops to 1
 * and it stops counting as known. Nothing here is permanent.
 *
 * @module
 */

import { clampStrength } from './clampStrength.js';
import { NEVER } from './constants.js';
import type { Strength } from './types/strength.js';
import type { UnitState } from './types/unitState.js';

export function effectiveStrength(state: UnitState): Strength {
  const confirmedClaim = state.prior.kind === 'claimed' && state.lastProven !== NEVER;
  return confirmedClaim ? clampStrength(state.strength + 1) : state.strength;
}
