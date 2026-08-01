/**
 * What the caller asks of `plan()`.
 *
 * @module
 */

import type { Day } from './day.js';
import type { UnitKey } from './unitKey.js';

export type PlanOptions = {
  /** The day to plan for. Time is data; there is no clock in here to read. */
  readonly day: Day;

  /**
   * How many units to drill. Clamped to a whole number ≥ 0 rather than rejected — see `plan`.
   *
   * The evidence supports SHORT sessions (roughly 15–20 minutes for a beginner, up to an hour for
   * an advanced learner) and says several short ones beat one long one. The engine does not enforce
   * a ceiling, because minutes are not items and only the host knows how long its exercises take.
   */
  readonly maxItems: number;

  /**
   * How many genuinely NEW units may be introduced today. Clamped to `[0, maxItems]`.
   *
   * **Defaults to `floor(maxItems / 2)`**, which is measured rather than chosen.
   *
   * ⚠️ **THIS FIELD WAS REQUIRED, AND THE ARGUMENT FOR THAT TURNED OUT TO BE WRONG.** The failure it
   * exists for is real: a never-asked unit's wait is `day - 0`, which strictly dominates every
   * attended unit at every epoch, so a host feeding 20 new words a day into a 20-item budget gave
   * review **0% of slots, forever** and the learner ended a simulated year knowing NOTHING, because
   * no word was ever drilled twice.
   *
   * The claim that followed — "there is no safe default" — was never measured. Sweeping words-known
   * after a simulated year across budgets 4 to 40, accuracies 0.7 to 0.95 and introduction rates 3
   * to 20, `floor(maxItems / 2)` is the peak or within **3%** of it in every cell, and exactly the
   * peak in 21 of 30. At low introduction rates it is identical to the peak, because a cap cannot
   * bind when there is little new material to hold back.
   *
   * ⚠️ And requiring it never prevented the bug. The catastrophic value is `maxNew === maxItems` —
   * a legal explicit number, and the most natural thing to type when a compiler demands "how many
   * new units may be introduced" for a full session. Requiring the field converted a silent omission
   * into a silent explicit mistake. A measured default converts it into the peak.
   *
   * The cliff is still there and still sharp: at `maxItems`, a year of daily practice yields zero.
   *
   * ⚠️ **A CEILING ON CROWDING-OUT, NOT AN ABSOLUTE ONE — and the difference is worth reading.**
   * New items skipped by the cap are DEFERRED rather than dropped, and come back to fill slots that
   * maintenance could not use. So a host that claims nothing and introduces three words on day one
   * still gets a full session rather than a three-item one, and `maxNew: 0` on a profile with
   * nothing but new material yields one word rather than an empty screen.
   *
   * Two laws in the `plan` property suite pin exactly what that buys, and both were arrived at only
   * after fast-check refuted a more confident-sounding version:
   *
   * 1. `maxItems - maxNew` slots are RESERVED for maintenance, and maintenance takes them whenever
   *    it has the work. This is the one that forbids the measured failure.
   * 2. The cap is exceeded only once maintenance has run out entirely.
   *
   * What it deliberately does NOT promise is `introduced <= maxNew` in all cases. That statement is
   * false, and writing it in this docstring would have been a lie the tests disprove.
   */
  readonly maxNew?: number;

  /**
   * Days a unit must wait after reaching `KNOWN_AT_STRENGTH` before being drilled again. Defaults to
   * `DEFAULT_REVIEW_GAP_DAYS`.
   *
   * ⚠️ **v3 CHANGED WHO IT APPLIES TO**, and this is the only place `strength` reaches the
   * scheduler. v2 applied the gap to anything ever proven; v3 applies it only at or above the known
   * rung. A unit below that line is in ACQUISITION and may come back the next day — which is v2's
   * own "a never-proven unit has nothing to wait out" rule, generalised to the one thing that now
   * measures proof.
   *
   * A single equal interval, not a ladder, and that is still the literature's own finding rather
   * than a simplification: expanding schedules perform about as well as equal ones across 98 effect
   * sizes. v3 now HAS the repetition count a ladder would need, so the old "we could not build one
   * anyway" argument has expired — the reason is now purely that a ladder would push the
   * anti-starvation horizon from `rotation + gap` out to `rotation + 96`, converting an arithmetic
   * guarantee into a judgement call.
   */
  readonly reviewGapDays?: number;

  /**
   * Which units to prefer when two have waited exactly the same number of days.
   *
   * ⚠️ WHY THIS EXISTS. Ties are not an edge case — they are the normal case. A learner who was
   * placed, or who read a passage, acquires hundreds of units on the same day, and every one of them
   * then carries the same anchor. Without a priority the engine falls back to comparing the unit
   * key, which is a total order and therefore correct, and which sorts the session ALPHABETICALLY:
   *
   *     agieren  alternative  anders  andrea  anforderung  ansatz  apotheke
   *
   * Deterministic, reproducible, and a bad lesson.
   *
   * The fix is data rather than cleverness: the host already loaded a frequency-ordered pack, so it
   * knows which of two equally-overdue words is worth more. Pass those keys, commonest first. The
   * engine stays language-free — it never looks the words up, it only respects the order it is
   * given — and a host that wants to order by topic, difficulty or lesson plan can do that instead.
   *
   * A good second source: `Coverage.claimedLemmas` from the passage she is about to read. Those are
   * the unchecked words standing between her and a verdict on that text.
   *
   * Units absent from this list sort after every unit in it. Omit it and the key tiebreak applies.
   */
  readonly priority?: readonly UnitKey[];
};
