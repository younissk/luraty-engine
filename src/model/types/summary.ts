/**
 * A snapshot of what the engine believes, small enough to store every day forever.
 *
 * ⚠️ **THE ENGINE STORES NO HISTORY, AND THIS IS HOW THAT IS MADE WORKABLE.** A profile is a fold,
 * and folds do not remember. An append-only log inside the profile fails on arithmetic before it
 * fails on principle: 800 units already serialize to ~66KB, and a learner doing 20 items a day for
 * three years is ~22,000 rows — in the one blob that is a synchronous `JSON.parse` before the first
 * frame on Hermes. It is also the wrong storage tier: the host runs Postgres, and a time series is
 * what a relational database is for.
 *
 * So the division is: the engine computes, the host remembers. *"Can she read more than in March?"*
 * is a subtraction of two of these. Every value is an integer, so nothing float-formatted ever
 * reaches the host's storage, and the size is independent of how many words she knows.
 *
 * ⚠️ **The host must also retain the raw evidence log.** That was always the house rule — *the
 * evidence log is the truth; a profile is a fold over it* — and nothing said it out loud, so nobody
 * was told they had to. It is the repair path for the one thing in the fold that is order-dependent
 * (see `record`), and the stated strategy for a changed memory model is a re-fold, which without a
 * log is a rebuild from nothing.
 *
 * @module
 */

import type { Day } from './day.js';
import type { SummaryScope } from './summaryScope.js';

export type Summary = {
  readonly day: Day;
  readonly language: string;
  readonly scope: SummaryScope;

  /** Units with any state at all — met, claimed, or both. */
  readonly units: number;

  /**
   * How many units sit at each rung, `0` through `MAX_STRENGTH`.
   *
   * The whole distribution rather than a mean, because a mean cannot distinguish a learner with
   * everything half-learned from one with half of it solid — and those two want different sessions.
   * Every derived count is a suffix sum of this array.
   */
  readonly byStrength: readonly [number, number, number, number, number, number, number];

  /**
   * `strength >= KNOWN_AT_STRENGTH`. **The headline, and it climbs with consolidation.**
   *
   * Under v2 the equivalent number was measured to settle at `accuracy x pool` and never rise: place
   * a learner at 800 words and 90% accuracy and it sat near 720 forever, because one slip erased two
   * proofs. A month of work made the number go DOWN, which for a product whose whole pitch is *"you
   * know more than you think"* is the worst possible thing to show someone.
   */
  readonly known: number;

  /**
   * Claimed, and never yet asked about. **A shrinking to-do, never a shrinking score.**
   *
   * The distinction matters on screen: this number going down is progress, whereas `known` going
   * down is bad news, and a host that renders them the same way will tell her the opposite of the
   * truth.
   */
  readonly claimsStanding: number;

  /** Claimed, and since proven at least once. She was right. */
  readonly claimsConfirmed: number;

  /**
   * Claimed, asked, and never once right.
   *
   * ⚠️ **The number no fold that discarded the claim could produce.** A claim survives being
   * refuted — `record` never clears `prior` — which is what makes the sentence a heritage speaker
   * actually wants computable from present state, with no history at all: *"of the 800 words you
   * said you knew, 430 checked out, 210 are still unchecked, and 160 did not hold."*
   *
   * The three claim counts partition the claimed set exactly, and are disjoint by construction:
   * proof requires an ask.
   */
  readonly claimsRefuted: number;

  /** Units at `lapses >= STUCK_AFTER_LAPSES`. Not sticking; see `Session.stuck`. */
  readonly stuck: number;

  /** `day - max(lastProven)` over the scope; the full span since the epoch if nothing is proven. */
  readonly daysSinceProven: number;
};
