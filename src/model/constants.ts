/**
 * The model's plain values — the numbers and frozen shapes the types are written around.
 *
 * ⚠️ `LADDER` is deliberately NOT here; it has its own file, because `types/strength.ts` derives
 * from the value while this file needs the type. See `ladder.ts`.
 *
 * @module
 */

import { LADDER } from './ladder.js';
import type { Day } from './types/day.js';
import type { Direction } from './types/direction.js';
import type { Strength } from './types/strength.js';
import type { UnitState } from './types/unitState.js';

/** All directions, for iteration. Derived from the union so the two cannot drift apart. */
export const DIRECTIONS: readonly Direction[] = ['recognise', 'produce'];

/**
 * The day that means "never".
 *
 * Exported so that nothing reimplements `=== 0` and so the meaning is greppable. It is deliberately
 * NOT constructible through `day()` — that function rejects it, which is the whole point.
 */
export const NEVER = 0 as Day;

/**
 * The ceiling. A unit cannot become more consolidated than this.
 *
 * ⚠️ PROVISIONAL, in exactly the sense the old `PROMOTE_AFTER_SUCCESSES` was, and for the same
 * reason: the literature is emphatic that consolidation matters and quiet about the number. Unlike
 * that constant, this one has been swept — see the strength sweep, which measures known-count
 * trajectories across the ladder at three accuracy levels. The sweep says 6 is not a knife-edge, not
 * that 6 is correct.
 */
export const MAX_STRENGTH: Strength = 6;

/**
 * At or above this rung, a unit counts as KNOWN — for `coverage()`, for `summarize()`, and for the
 * review gap. This one number is the entire definition; there is no box any more.
 *
 * Deliberately equal to the old `PROMOTE_AFTER_SUCCESSES`, so that the v2→v3 migration moves
 * nobody's coverage number: a v2 `understood` unit had exactly two proofs behind it and lands
 * exactly here.
 */
export const KNOWN_AT_STRENGTH: Strength = 2;

/**
 * How the ledger moves. Integers, and the ASYMMETRY IS THE DESIGN.
 *
 * Expected drift per drill at accuracy `a` is `gain * a - missRetrieval * (1 - a)`, which is
 * positive above `a = missRetrieval / (gain + missRetrieval)` — **66.7%**. So the break-even is a
 * *consequence* of these two numbers rather than a third guess, and the ledger becomes a CLASSIFIER
 * ("does she know this word?") rather than a smoothed readout of her global error rate.
 *
 * That distinction is the whole of gap 3. Under the old rule — promote on 2 consecutive successes,
 * demote fully on 1 failure — the steady-state known count was measured at `accuracy x pool` over
 * 720 simulated days: place a learner at 800 words and 90% accuracy and the number settles at ~720
 * and never climbs, because the ledger was reporting how often she slips rather than how much she
 * knows. A symmetric ±1 ladder would put break-even at 50%, which softens gap 3 in the wrong
 * direction: it would report a 60%-accurate learner as knowing almost everything.
 *
 * `missHelp` is smaller because tapping a gloss is a real negative signal and a weaker one than
 * failing a retrieval outright. It is NOT a lapse — see `UnitState.lapses`.
 */
export const STRENGTH_STEP = {
  gain: 1,
  missRetrieval: 2,
  missHelp: 1,
} as const;

/**
 * Bump when the wire shape changes, and add the matching migration in the same commit.
 *
 * Not the same as the package version — the API can change many times without the stored bytes
 * changing at all, and vice versa.
 */
export const PROFILE_SCHEMA_VERSION = 5;

/** How many elements a `WireRowV4` has. Read by `serialize` and `parseRow`, nowhere else. */
export const WIRE_ROW_V4_LENGTH = 8;

/** v5 APPENDS `lastHelped`. Append, never insert — see {@link WireRowV5}. */
export const WIRE_ROW_V5_LENGTH = 9;

/**
 * The band, expressed the way ADR-0003 states it: **integer unknown-token density.**
 *
 * The ADR says "1 unknown word in 50" and "1 in 20". So the test is
 * `unknown * 20 <= tokens && unknown * 50 >= tokens` — two multiplications by small integers and
 * two comparisons. No division, no float literal, no epsilon, nothing whose formatting differs by
 * runtime.
 *
 * This is not floating-point superstition. The float form is exact: `19 / 20 === 0.95` and
 * `49 / 50 === 0.98` are both true, because IEEE754 division and decimal-literal parsing are both
 * correctly rounded onto the same real value. But that exactness is a proof no reviewer can audit
 * at a glance, and it dies to any edit that looks like tidying — a percentage hop
 * (`ratio * 100 >= 95`), a defensive `- 1e-9` that silently widens the band, a stray `Math.round`.
 * The integer form has no proof to break, and it reads as the ADR's own sentence.
 *
 * Exact while `50 * unknownTokens < 2^53`, which is about 1.8e14 tokens.
 */
export const COVERAGE_BAND = {
  /**
   * The 95% edge — at most 1 unknown word per 20 running tokens.
   *
   * Denser than this is **too hard**: comprehension is minimal and inferring unknown words from
   * context stops working (~52% correct at 90% coverage, against ~80% inside the band).
   */
  hardEdgeOneUnknownIn: 20,

  /**
   * The 98% edge — at least 1 unknown word per 50 running tokens.
   *
   * Sparser than this is **too easy**: comprehension is fine and there is little left to learn from
   * the input.
   */
  easyEdgeOneUnknownIn: 50,

  /**
   * Below this many running tokens the band has **no representable point**, so no verdict is honest.
   *
   * ⚠️ Derived, not an independent literal. `unknownTokens` is a non-negative integer, and zero
   * unknowns is 100% coverage — which is above the band, not inside it. So landing in band needs at
   * least one unknown token, which needs `1 * hardEdgeOneUnknownIn <= runningTokens`.
   *
   * Enumerated, because this is the kind of claim that should not rest on an argument: for every
   * n ≤ 19 the only reachable coverages are 1.00000 (u=0) and at most 0.94737 (n=19, u=1).
   * `'in-band'` cannot occur. The first (n, u) that reaches it is (20, 1) = 0.95 exactly.
   *
   * It is exported so that a future `plan()` can carry the floor outward. The engine cannot fetch
   * content, so if the host is never told "at least 20 running tokens", it supplies a nine-word
   * sentence and the band objective is unsatisfiable by construction, silently, forever.
   */
  minTokens: 20,
} as const;

/**
 * The state of a unit nothing has ever said anything about.
 *
 * Every date is `0` — never seen, never asked, never proven — rather than the current day. v2's
 * accessor defaulted `lastSeen` to `profile.day`, which asserted a sighting that never happened.
 * Zero is also the identity element of the `later()` fold in `record`, which is what keeps every
 * date independent of the order evidence arrives in.
 *
 * A frozen shared value rather than a factory: it is deeply `readonly`, so there is nothing to
 * copy-protect, and one instance means `unitState()` on a large profile allocates nothing.
 */
export const UNMET: UnitState = Object.freeze({
  seen: 0,
  lastSeen: NEVER,
  lastAsked: NEVER,
  lastProven: NEVER,
  prior: Object.freeze({ kind: 'none' as const }),
  strength: LADDER[0],
  lapses: 0,
  lastHelped: NEVER,
});
