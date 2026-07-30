import { COVERAGE_BAND } from '../model/coverage.js';
import { NEVER, type Day, type UnitKey } from '../model/ids.js';
import type { Profile } from '../model/profile.js';
import type {
  ContentRequest,
  PlanOptions,
  Reassess,
  Session,
  SessionItem,
  Why,
} from '../model/session.js';
import { isKnown, type UnitState } from '../model/unit.js';

/**
 * Deciding what a learner should do next.
 *
 * @module
 */

/**
 * Days between drills of a unit that is going well.
 *
 * ⚠️ PROVISIONAL. The literature is emphatic that spacing matters and quiet about the number. It is
 * a named constant so a simulation can sweep it and so changing it is one visible edit.
 *
 * A single equal interval rather than a ladder, and that is the evidence's own finding: expanding
 * schedules perform about as well as equal ones across 98 effect sizes. See
 * {@link PlanOptions.reviewGapDays} for why v3 kept it even though it now has the repetition count a
 * ladder would need.
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
 * Days without a single successful retrieval before `plan()` asks for a re-measurement.
 *
 * ⚠️ PROVISIONAL, and a product rhythm rather than a finding — no literature fixes a reassessment
 * interval, and a month is the unit people already plan their lives in.
 *
 * It counts from the last PROOF and not from the last assessment, which is deliberate and is what
 * lets the engine own this at all: the engine has no idea what an assessment is. A learner drilling
 * daily and getting things right resets it constantly and is never nagged; a learner who has drifted
 * for a month is exactly who a re-measurement is for.
 */
export const REASSESS_AFTER_DAYS = 30;

/** Consecutive failed retrievals before a unit is reported in {@link Session.stuck}. Report-only. */
export const STUCK_AFTER_LAPSES = 6;

/**
 * The day the engine last had a reason to attend to this unit.
 *
 * ⚠️ **THE ONE-LINE LEECH FIX.** v2 anchored on `lastProven`, so a word the learner never gets right
 * is never attended to, its wait grows without bound, and it sits at the head of the queue forever —
 * measured at 44% of every slot for ten words in a pool of 210. Anchoring on the last ASK, and on
 * the day a claim was made, means every unit's clock actually resets when the engine acts on it.
 *
 * A `max` and not a preference: a unit can be both claimed and asked, and the later of the two is
 * when it was genuinely last handled.
 */
function attendedOn(state: UnitState): Day {
  const claimed = state.prior.kind === 'claimed' ? state.prior.on : NEVER;
  return state.lastAsked > claimed ? state.lastAsked : claimed;
}

/**
 * Which partition this unit belongs to. See {@link Why}.
 *
 * Ordered from most specific to least, and the first two are the ones that carry product meaning:
 * a standing claim is something to CONFIRM rather than teach, and a word asked but never once right
 * is mid-acquisition rather than up for review.
 */
function whyFor(state: UnitState): Why {
  if (state.lastAsked === NEVER) {
    return state.prior.kind === 'claimed' ? 'verify' : 'new';
  }
  return state.lastProven === NEVER ? 'relearn' : 'review';
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
 * ⚠️ That still holds in v3, and it was re-checked rather than assumed. The obvious way to fix an
 * empty day-one session is to let `plan()` pull unmet words out of a frequency list — which would
 * make `rank` reachable, make the engine language-aware, and quietly break the law that every item
 * is a unit the learner has actually met. Instead the engine REQUESTS them:
 * {@link ContentRequest.newUnitsWanted}.
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
 *   being practised less — not by a weight nobody has calibrated.
 */
export function plan(profile: Profile, options: PlanOptions): Session {
  const day = options.day;
  const maxItems = clamp(options.maxItems, 0);
  const gap = clamp(options.reviewGapDays, DEFAULT_REVIEW_GAP_DAYS);
  // Defaults to half the session, and the number is measured rather than chosen — see
  // {@link PlanOptions.maxNew}. Sweeping a simulated year across budgets 4–40, accuracies 0.7–0.95
  // and introduction rates 3–20, `floor(maxItems / 2)` lands on the peak or within 3% of it
  // everywhere.
  //
  // Clamped INTO the session size rather than merely to a non-negative number: a cap larger than the
  // session cannot mean anything, and letting it through would make the over-ask arithmetic below
  // request more new content than a session could ever show.
  const maxNew = Math.min(clamp(options.maxNew, Math.floor(maxItems / 2)), maxItems);

  // Built once per call rather than per comparison: a comparator that scans an array is O(n) inside
  // an O(n log n) sort, which is how a session of 10,000 units becomes a frozen frame.
  const priority = new Map<UnitKey, number>();
  (options.priority ?? []).forEach((unit, index) => {
    if (!priority.has(unit)) priority.set(unit, index);
  });

  const due: SessionItem[] = [];
  const stuck: UnitKey[] = [];
  // For the reassessment trigger. `0` if nothing has ever been proven, which reads as "never" and
  // makes `daysSinceProven` fall out as the full span since the epoch.
  let lastProvenAnywhere = NEVER;
  let claimsStanding = 0;

  for (const unit of Object.keys(profile.units) as UnitKey[]) {
    const state = profile.units[unit];
    // ⚠️ A KNOWN EQUIVALENT MUTANT, kept deliberately. The key came from `Object.keys`, so the lookup
    // cannot miss; the branch exists only because `noUncheckedIndexedAccess` types it as
    // possibly-undefined. The alternative is a non-null assertion, and a `!` that lies about an index
    // signature is worse in the file than a survivor with a comment explaining itself.
    if (state === undefined) continue;

    if (state.lastProven > lastProvenAnywhere) lastProvenAnywhere = state.lastProven;
    if (state.lapses >= STUCK_AFTER_LAPSES) stuck.push(unit);

    const why = whyFor(state);
    if (why === 'verify') claimsStanding += 1;

    // Whole days since this unit was last ATTENDED — asked, or claimed. Never-attended units carry
    // an anchor of 0, so they report the full span since the epoch, which is the largest possible
    // wait and sorts them first with no special case anywhere.
    //
    // Clamped at 0 because `advanceTo` refuses to move a profile backwards but `options.day` is the
    // host's own number and may be behind `profile.day`. A negative wait would sort a unit as if it
    // were fresher than one attended today.
    const daysWaiting = Math.max(0, day - attendedOn(state));

    // ⚠️ THE GAP APPLIES ONLY TO UNITS THAT COUNT AS KNOWN, and that is v3's one change here.
    //
    // v2 gated anything ever proven, which left a unit that had been proven once and failed twice
    // waiting three days between attempts while it was actively being acquired. The rung ladder
    // gives the honest test: a unit below {@link KNOWN_AT_STRENGTH} is still being learned and may
    // come back tomorrow; a unit at or above it is being maintained and waits out the gap.
    //
    // This subsumes v2's own never-proven exemption rather than replacing it — a never-proven unit
    // is at rung 0 and is therefore already exempt, so the special case that used to be spelled out
    // here is now a consequence. That exemption mattered: gating never-proven units on the gap made
    // the engine's decisions depend on which epoch the HOST picked for day 0, and a beginner started
    // at day 0 got EMPTY sessions on days 1 and 2 while the identical profile started at day 2000
    // got its items immediately.
    if (isKnown(state) && daysWaiting < gap) continue;

    due.push({ unit, daysWaiting, why });
  }

  // ⚠️ THIS COMPARATOR IS THE ONLY THING MAKING A SESSION REPRODUCIBLE, so it is TOTAL on purpose.
  //
  // Three tiers: days waited, then the caller's priority order, then the key. The last tier is what
  // makes it total — keys are unique in a Record, so the comparator never returns 0 and the result
  // cannot depend on input order or on sort stability.
  //
  // ⚠️ `why` is deliberately NOT a tier. Partitioning the sort by category would mean a fresh new
  // word outranking a review that has waited a year, and the budget below already does the only job
  // a category tier would do — bound how much new material lands — without reordering anything.
  // One ordering, one place.
  //
  // `Object.keys` above returns insertion order, and a profile built by replaying evidence has a
  // DIFFERENT insertion order from the same profile loaded from storage — `serialize` writes its
  // units sorted, so `deserialize` inserts them sorted. A comparator that returned 0 for equal waits
  // would leave those ties to `Array.prototype.sort`, and a learner would get one session before an
  // app restart and a different one after, with both looking perfectly plausible.
  //
  // The comparison is on UTF-16 code units, the same total order `persist.ts` uses, and for the same
  // two reasons: `localeCompare` is ICU-backed and unavailable on Hermes, and a locale-aware sort
  // would make a learner's session depend on their device's language settings.
  // ⚠️ TWO COMPARATORS, CHOSEN ONCE, AND THEY ARE THE SAME ORDER. The middle tier is a no-op when the
  // caller named nothing — every `priority.get` misses, every unit gets `Infinity`, and `pa !== pb`
  // is false for all of them — but a comparator runs O(n log n) times, so "a no-op" still cost two
  // Map lookups per comparison: roughly 280,000 of them on a 20,000-unit profile, to reach a branch
  // that could never be taken. Hoisting the emptiness test out of the inner loop is free.
  //
  // ⚠️ The two MUST stay identical in the tiers they share. If a third tier is ever added, add it to
  // both — a fast path that orders differently from the slow one is a session that changes shape
  // depending on whether the host passed an empty array.
  due.sort(
    priority.size === 0
      ? (a, b) => {
          if (a.daysWaiting !== b.daysWaiting) return b.daysWaiting - a.daysWaiting;
          return a.unit < b.unit ? -1 : 1;
        }
      : (a, b) => {
          if (a.daysWaiting !== b.daysWaiting) return b.daysWaiting - a.daysWaiting;
          // The caller's order. Anything it did not mention sorts after everything it did —
          // `Infinity` rather than a large integer, so no list length can collide with it.
          const pa = priority.get(a.unit) ?? Infinity;
          const pb = priority.get(b.unit) ?? Infinity;
          if (pa !== pb) return pa - pb;
          return a.unit < b.unit ? -1 : 1;
        },
  );

  const items = take(due, maxItems, maxNew);
  const named = nameWithSpares(due, items, maxItems * OVER_ASK, maxNew * OVER_ASK);

  const content: ContentRequest = {
    // Named beyond what the session uses, so a host missing an exercise loses that word rather than
    // shortening the session. The new-material cap is scaled by the same factor, so over-asking
    // cannot smuggle in extra new words.
    units: named.map((item) => item.unit),
    minPassageTokens: COVERAGE_BAND.minTokens,
    // What the cap allowed and the profile could not supply. On a fresh profile this is the whole
    // cap, which is the engine saying "I need vocabulary, not a scheduler".
    newUnitsWanted: Math.max(0, maxNew - items.filter((item) => item.why === 'new').length),
  };

  return {
    day,
    items,
    content,
    reassess: reassessment(day, lastProvenAnywhere, claimsStanding),
    // ⚠️ SORTED, and not for tidiness. `Object.keys` returns insertion order, and a profile built by
    // replaying evidence has a DIFFERENT insertion order from the same profile loaded from storage —
    // `serialize` writes its units sorted, so `deserialize` inserts them sorted. Unsorted, two
    // value-identical profiles produced `stuck` lists in different orders, so a session was not
    // stable across an app restart. `items` was immune because its comparator is total; this was
    // appended in iteration order and was not. Same total order, on UTF-16 code units.
    stuck: stuck.sort((a, b) => (a < b ? -1 : 1)),
  };
}

/**
 * Take up to `limit` items, admitting at most `newLimit` of the `'new'` ones.
 *
 * ⚠️ ONE PASS IN COMPARATOR ORDER, WITH A DEFERRED QUEUE — not two sorted buckets merged. The
 * ordering above is the whole scheduling opinion, and anything that reorders after it is a second,
 * unstated opinion. Here the cap only ever SKIPS; it never promotes.
 *
 * The deferred pass is what stops the cap shortening a session. A host that claims nothing and
 * introduces three words on day one has almost nothing but new material, so a naive cap would hand
 * back a three-item session for a learner who asked for twelve. Skipped new items come back, still
 * in comparator order, to fill whatever review and verification could not.
 *
 * ⚠️ Only `'new'` is capped. `'verify'` draws from the review budget on purpose: confirming a word
 * she told you she knows is not teaching her a word, and capping it would make a placement of 800
 * words take months to check at the same rate as learning 800 new ones.
 */
function take(due: readonly SessionItem[], limit: number, newLimit: number): SessionItem[] {
  // ⚠️ SELECTED BY INDEX, then filtered — so the result is always in comparator order.
  //
  // The obvious implementation pushes chosen items into one array and appends the deferred ones
  // afterwards, and it is wrong in a way no example test would have caught: a deferred new word
  // lands at the END of the session rather than at its own score. `plan.property.test.ts`'s
  // comparator law found it on the third counter-example. Order is part of what `plan` returns, and
  // a scheduler whose output order depends on which pass admitted an item has two orderings.
  const selected = new Array<boolean>(due.length).fill(false);
  let taken = 0;
  let introduced = 0;

  for (const [i, item] of due.entries()) {
    if (taken >= limit) break;
    if (item.why === 'new') {
      if (introduced >= newLimit) continue;
      introduced += 1;
    }
    selected[i] = true;
    taken += 1;
  }

  // The deferred pass: new material skipped by the cap comes back to fill slots nothing else could
  // use. This is what stops the cap SHORTENING a session — a learner on day two has almost nothing
  // but new material, and handing her a three-item session when she asked for twelve trades a
  // silent scheduling bug for a loud emptiness bug.
  for (const [i, item] of due.entries()) {
    if (taken >= limit) break;
    if (selected[i] === true || item.why !== 'new') continue;
    selected[i] = true;
    taken += 1;
  }

  return due.filter((_, i) => selected[i] === true);
}

/**
 * The session, then the spares — in that order.
 *
 * ⚠️ **`content.units` MUST BEGIN WITH `items`, and getting that wrong was a real defect.** The
 * documented contract is that *"a host takes the first `maxItems` it can actually build"*, so any
 * prefix of this list has to agree with the session it accompanies.
 *
 * The obvious implementation — re-running the selection with both limits multiplied by
 * {@link OVER_ASK} — does not. New material scores the maximum possible wait, so it sorts to the
 * head; scaling the cap admits `maxNew * OVER_ASK` new words *before* any review is reachable.
 * Measured on a 160-unit profile at `maxItems: 20, maxNew: 5`: the session was 5 new / 15 review,
 * while the first 20 named units were **15 new / 5 review**. A host following the documented
 * contract would have got a session nothing in the engine ever chose.
 *
 * So the chosen items lead, and the spares follow in comparator order, still capped.
 */
function nameWithSpares(
  due: readonly SessionItem[],
  items: readonly SessionItem[],
  limit: number,
  newLimit: number,
): SessionItem[] {
  const chosen = new Set<UnitKey>(items.map((item) => item.unit));
  const named = [...items];
  let introduced = items.filter((item) => item.why === 'new').length;

  for (const item of due) {
    if (named.length >= limit) break;
    if (chosen.has(item.unit)) continue;
    if (item.why === 'new') {
      if (introduced >= newLimit) continue;
      introduced += 1;
    }
    named.push(item);
  }
  return named;
}

/**
 * Whether it is time to re-measure. See {@link Reassess}.
 *
 * A profile that has never proven anything reads as `daysSinceProven: day` — the full span since the
 * epoch — so a learner who has been placed and never drilled becomes due on schedule rather than
 * never. That is the case the trigger exists for.
 */
function reassessment(day: Day, lastProven: Day, claimsStanding: number): Reassess {
  // ⚠️ CHECKED FIRST, and it is not the same question as "is it overdue". With nothing ever proven
  // there is no span to measure FROM — `day - NEVER` is the host's raw day number, which for a
  // Unix-day epoch reads as twenty thousand days of neglect on a profile created this morning.
  if (lastProven === NEVER) return { kind: 'never-measured', claimsStanding };

  const daysSinceProven = Math.max(0, day - lastProven);
  if (daysSinceProven >= REASSESS_AFTER_DAYS) {
    return { kind: 'due', daysSinceProven, claimsStanding };
  }
  return { kind: 'not-due', daysUntil: REASSESS_AFTER_DAYS - daysSinceProven };
}
