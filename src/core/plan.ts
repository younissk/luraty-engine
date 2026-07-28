import { assertNever } from '../internal/assert.js';
import { COVERAGE_BAND } from '../model/coverage.js';
import type { Day, UnitKey } from '../model/ids.js';
import type { Profile } from '../model/profile.js';
import type { ContentRequest, PlanOptions, Session, SessionItem } from '../model/session.js';
import type { UnitState } from '../model/unit.js';

/**
 * Deciding what a learner should do next.
 *
 * @module
 */

/**
 * Days between drills of a unit that is going well.
 *
 * ⚠️ PROVISIONAL, in the same sense as `PROMOTE_AFTER_SUCCESSES` and for the same reason: the
 * literature is emphatic that spacing matters and quiet about the number. It is a named constant so
 * a simulation can sweep it and so changing it is one visible edit.
 *
 * A single equal interval rather than a ladder, and that is the evidence's own finding: expanding
 * schedules perform about as well as equal ones across 98 effect sizes, so a ladder is complexity
 * with no measurable return. It would also need a repetition count this profile does not have —
 * `seen` counts passive exposure, so a skimmed word would earn a long interval it never proved.
 */
export const DEFAULT_REVIEW_GAP_DAYS = 3;

/**
 * How many more units to name than the session will use.
 *
 * Not a learning constant — an engineering one, about hosts. A content store will not have an
 * exercise for every unit, and a session that shrinks because one word had no card is a worse
 * failure than naming a few spares. Three is enough to absorb a two-thirds miss rate.
 */
export const OVER_ASK = 3;

/**
 * The day a unit was last proven, for either box.
 *
 * The exhaustive switch is the point: `Understood.confirmedOn` and `Learning.lastProven` answer the
 * same question, so a scheduler needs no special case — but a third box arriving must be a compiler
 * error here rather than a silent default.
 */
function provenOn(state: UnitState): Day {
  switch (state.box) {
    case 'learning':
      return state.lastProven;
    case 'understood':
      return state.confirmedOn;
    default:
      return assertNever(state, 'UnitState');
  }
}

/**
 * Has this unit ever been successfully retrieved?
 *
 * `lastProven: 0` is the never-proven sentinel — see {@link Learning.lastProven}. Reaching the
 * `understood` box requires {@link PROMOTE_AFTER_SUCCESSES} real retrievals, so that variant is
 * proven by construction and needs no field to say so.
 *
 * ⚠️ The sentinel is ambiguous at exactly one point: a unit genuinely proven on day 0, in a host
 * whose epoch is day 0. Such a unit reads as never-proven and is drilled once immediately instead of
 * after the gap. That is the harmless direction, and it is inherent to storing "never" as a number —
 * removing it means a wire-schema change, not a scheduler change.
 */
function neverProven(state: UnitState): boolean {
  switch (state.box) {
    case 'learning':
      return state.lastProven === 0;
    case 'understood':
      return false;
    default:
      return assertNever(state, 'UnitState');
  }
}

/**
 * Whole, non-negative, and finite. A bad option is clamped, never thrown at the caller.
 *
 * ⚠️ The `undefined` check is a KNOWN EQUIVALENT MUTANT and is kept deliberately. `Number.isFinite`
 * already returns false for `undefined`, so deleting the line changes no behaviour and `npm run
 * mutate` reports it as a survivor forever. It stays because removing it forces a cast to satisfy
 * `Math.trunc`, and a cast that launders `number | undefined` into `number` is a worse thing to have
 * in the file than a survivor with a comment explaining itself.
 */
function clamp(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.trunc(value));
}

/**
 * Decide what to do next.
 *
 * **Takes no language pack, and that is a finding rather than an oversight.** Work the four-function
 * pack contract through: `split` needs text and there is none here, `compare` needs a submitted
 * answer, `key` needs a surface form, and `rank` is never consulted because nothing here orders by
 * frequency. Nothing on the contract is reachable. A parameter threaded through and never read is a
 * lie about what a function depends on — and dropping it means every scheduling test runs with no
 * pack at all, so a pack bug can never be mistaken for a scheduling bug. **Scheduling is
 * language-free; only measurement needs a language.**
 *
 * **Takes no seed either.** Selection scores by days-waiting, a unit that is served resets its
 * anchor to today while every unit that is not gains a day — so the unserved set strictly dominates
 * from the next day onward and every unit is reached within one rotation of the pool. There is no
 * tie the ordering cannot break, because the key tiebreak is total. A seed nothing reads is worse
 * than no seed: it invites a "same seed, same session" law that passes vacuously.
 *
 * **Total.** No throws and no `Decoded<>` wrapper. `options` comes from the host's own code rather
 * than from storage, and every input has an honest answer including "there is nothing to drill".
 * Bad numbers are clamped, matching `advanceTo`'s refusal to throw on a backwards clock.
 *
 * ### What it does NOT do yet, and why each is a missing input rather than a missing idea
 *
 * - **Interleaving by confusability** needs a confusability relation. A `LanguagePack` has four
 *   functions and none is relational, and the relation cannot be derived — surfaces that `key()`
 *   collapses are identical, not confusable. Note that not shuffling is not the same as global
 *   randomization, which the evidence warns against: the prohibition is honoured, the prescription
 *   is unclaimed.
 * - **Chunks as first-class items** needs an item kind. A unit key addresses a word today.
 * - **Fluency tasks** need a task model. There is no representation of a timed speaking repetition.
 * - **Weighting production over recognition** is deliberately absent rather than deferred. The two
 *   directions are separate units competing on the same age score, so production earns its share by
 *   being practised less — not by a weight nobody has calibrated. A weight would be a second
 *   uncalibrated constant, and no simulation sweeps the first one yet.
 */
export function plan(profile: Profile, options: PlanOptions): Session {
  const day = options.day;
  const maxItems = clamp(options.maxItems, 0);
  const gap = clamp(options.reviewGapDays, DEFAULT_REVIEW_GAP_DAYS);

  const due: SessionItem[] = [];
  for (const unit of Object.keys(profile.units) as UnitKey[]) {
    const state = profile.units[unit];
    // ⚠️ A KNOWN EQUIVALENT MUTANT, like `clamp`'s `undefined` check and kept for the same reason.
    // The key came from `Object.keys`, so the lookup cannot miss; the branch exists only because
    // `noUncheckedIndexedAccess` types it as possibly-undefined. `npm run mutate` reports it as a
    // survivor forever. The alternative is a non-null assertion, and a `!` that lies about an index
    // signature is worse in the file than a survivor with a comment explaining itself.
    if (state === undefined) continue;

    // Whole days since this unit was last PROVEN. Never-proven units carry an anchor of 0, so they
    // report the full span since the epoch — the largest possible wait, sorting them first with no
    // special case anywhere.
    //
    // Clamped at 0 because `advanceTo` refuses to move a profile backwards but `options.day` is the
    // host's own number and may be behind `profile.day`. A negative wait would sort a unit as if it
    // were fresher than one proven today.
    const daysWaiting = Math.max(0, day - provenOn(state));

    // ⚠️ THE GAP APPLIES ONLY TO UNITS THAT HAVE BEEN PROVEN, and leaving that out was a real bug.
    //
    // `reviewGapDays` means "days a unit must wait AFTER being proven" — see {@link PlanOptions}. A
    // never-proven unit has nothing to wait out. Gating it on the gap anyway made the engine's
    // decisions depend on which epoch the HOST happened to pick for day 0: a never-proven unit
    // scores `day - 0`, so with a young epoch that score is small and the unit is filtered out.
    //
    // Measured on a beginner started at day 0: sessions on days 1 and 2 came back EMPTY, while the
    // identical profile started at day 2000 got its items immediately. `runDemo` printed the empty
    // rows as "—" and nothing failed. Two days of nothing to do is not a small bug for a learner
    // opening the app for the first time.
    //
    // The ordering below needs no matching special case: `lastProven` is never negative, so a
    // never-proven unit's `day - 0` is greater than or equal to every proven unit's `day - n`. It
    // already sorts first, at every epoch.
    if (!neverProven(state) && daysWaiting < gap) continue;

    due.push({ unit, daysWaiting });
  }

  // ⚠️ THIS COMPARATOR IS THE ONLY THING MAKING A SESSION REPRODUCIBLE, so it is TOTAL on purpose.
  //
  // `Object.keys` above returns insertion order, and a profile built by replaying evidence has a
  // DIFFERENT insertion order from the same profile loaded from storage — `serialize` writes its
  // units sorted, so `deserialize` inserts them sorted. A comparator that returned 0 for equal waits
  // would leave those ties to `Array.prototype.sort`, and a learner would get one session before an
  // app restart and a different one after, with both looking perfectly plausible.
  //
  // Because unit keys are unique in a Record, the key tiebreak never returns 0 — so the result is
  // independent of input order and sort stability is irrelevant. An earlier draft ALSO pre-sorted
  // the keys; mutation testing showed that made this line's tiebreak untestable, because the two
  // orderings agreed. One guarantee, in one place, pinned by a round-trip test.
  //
  // The comparison is on UTF-16 code units, the same total order `persist.ts` uses, and for the same
  // two reasons: `localeCompare` is ICU-backed and unavailable on Hermes, and a locale-aware sort
  // would make a learner's session depend on their device's language settings.
  due.sort((a, b) => b.daysWaiting - a.daysWaiting || (a.unit < b.unit ? -1 : 1));

  const items = due.slice(0, maxItems);

  const content: ContentRequest = {
    // Named beyond what the session uses, so a host missing an exercise loses that word rather than
    // shortening the session.
    units: due.slice(0, maxItems * OVER_ASK).map((item) => item.unit),
    minPassageTokens: COVERAGE_BAND.minTokens,
  };

  return { day, items, content };
}
