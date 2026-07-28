import { assertNever } from '../internal/assert.js';
import type { Evidence } from '../model/evidence.js';
import type { Day } from '../model/ids.js';
import type { Profile } from '../model/profile.js';
import type { UnitState } from '../model/unit.js';

/**
 * Folding evidence into a profile.
 *
 * This is the only function in the engine that changes what is believed about a learner.
 * Everything else reads.
 *
 * @module
 */

/**
 * How many consecutive successful retrievals promote a unit out of the learning box.
 *
 * ⚠️ PROVISIONAL. Two is a starting guess, not a finding — the literature is clear that spacing and
 * cumulative review matter, and notably quiet about the right promotion threshold. It lives here as
 * a named constant so that a simulation can sweep it, and so that changing it is one visible edit
 * rather than a magic number buried in a branch.
 */
export const PROMOTE_AFTER_SUCCESSES = 2;

/**
 * The `lastProven` of a unit that has never been proven.
 *
 * Zero rather than `undefined`, so the field is total and `later()` has an identity element — which
 * is what keeps the fold independent of the order evidence arrives in. It also reads correctly in
 * the scheduler with no special case: `day - 0` is the largest possible wait, so a never-proven unit
 * sorts to the front, which is exactly where it belongs.
 */
const NEVER = 0 as Day;

/** Later of two days. Time only ever moves forward for a unit — see {@link applyOne}. */
function later(a: Day, b: Day): Day {
  return a > b ? a : b;
}

/**
 * Did this evidence actually prove the unit?
 *
 * The conjunction is the point: a passive signal proves nothing (see {@link Evidence.tested}), and
 * a failed retrieval proves the opposite. Only this advances a unit's "last proven" anchor.
 */
function proves(evidence: Evidence): boolean {
  return evidence.tested && evidence.outcome === 'known';
}

/**
 * Apply evidence to a single unit's state.
 *
 * The rules, and why each one is there:
 *
 * - **Only a real retrieval can promote.** A passive signal (`tested: false`) counts as an
 *   encounter and nothing more. This is the rule that stops "did not ask what it means" being
 *   recorded as "knows it" — see {@link Evidence.tested}.
 * - **Failure always demotes.** An understood unit that comes back wrong returns to learning with
 *   its streak cleared. Nothing is permanently known.
 * - **Nothing ever leaves the pool.** There is no third box and no terminal state; an understood
 *   unit stays eligible for review forever. Cumulative review — every session drawing from
 *   everything ever studied rather than the latest batch — is where the large retention gain lives,
 *   and a graduated state would quietly discard it.
 */
function applyOne(state: UnitState, evidence: Evidence): UnitState {
  const seen = state.seen + 1;

  // ⚠️ MONOTONIC, not simply `evidence.day`.
  //
  // A host syncing an offline queue replays evidence out of order — that case is anticipated in
  // `record`'s own contract below. Taking the evidence's day directly meant a late-arriving day-3
  // item would rewind a unit last seen on day 40, so a unit proven yesterday reported itself last
  // proven 37 days ago.
  //
  // Nothing errors when that happens. It stays invisible until something does interval arithmetic
  // on these fields, at which point it surfaces as a scheduling bug dated to a commit months
  // earlier. Taking the later of the two also makes the result independent of arrival order, which
  // is the property a sync queue actually needs.
  const lastSeen = later(state.lastSeen, evidence.day);

  switch (state.box) {
    case 'learning': {
      // Monotonic like `lastSeen`, and for the same sync reason — but folded only over evidence
      // that actually PROVED something, so passive exposure and failures leave it alone.
      const lastProven = proves(evidence)
        ? later(state.lastProven, evidence.day)
        : state.lastProven;

      if (evidence.outcome === 'unknown') {
        // Explicitly not known. Reset the run of successes; the encounter still counts. The proven
        // anchor does not move, so this unit stays at the front of the drill queue — which is where
        // a word the learner just got wrong belongs.
        return { box: 'learning', seen, lastSeen, streak: 0, lastProven };
      }
      if (!evidence.tested) {
        // Known, but nothing was actually retrieved. Exposure only — no progress toward promotion.
        return { ...state, seen, lastSeen };
      }
      const streak = state.streak + 1;
      if (streak >= PROMOTE_AFTER_SUCCESSES) {
        // ⚠️ `later(...)`, not `evidence.day`, and for the same offline-sync reason as `lastSeen`.
        //
        // This used to take the promoting evidence's own day, which is wrong whenever a queue is
        // replayed out of order: a day-3 success arriving after a day-40 one triggers the promotion
        // and stamped `confirmedOn: 3`, so a unit proven on day 40 reported itself last proven 37
        // days earlier. The unit then looked overdue forever and the engine drilled a word the
        // learner had just got right.
        //
        // It was invisible before `lastProven` existed, because nothing else in the state knew that
        // day 40 had happened. Now the answer is right there, and taking the later of the two makes
        // the result independent of arrival order — the property a sync queue actually needs.
        return {
          box: 'understood',
          seen,
          lastSeen,
          confirmedOn: later(state.lastProven, evidence.day),
        };
      }
      return { box: 'learning', seen, lastSeen, streak, lastProven };
    }

    case 'understood': {
      if (evidence.outcome === 'unknown') {
        // Forgotten, or never really known. Back to learning.
        //
        // `lastProven` inherits `confirmedOn`, because that IS the day this unit was last proven and
        // nothing about failing today changes when that was. Seeding it to `evidence.day` instead
        // would record a failure as a proof and park the unit at the back of the queue precisely
        // when it needs drilling; seeding it to 0 would discard a real fact.
        return { box: 'learning', seen, lastSeen, streak: 0, lastProven: state.confirmedOn };
      }
      if (!evidence.tested) {
        // Seeing it again without being tested is not proof it is still known — record the
        // encounter but do not refresh the confirmation date, or a unit could stay "recently
        // proven" forever purely by appearing on screen.
        return { ...state, seen, lastSeen };
      }
      // Monotonic for the same reason as `lastSeen`: a late-arriving day-3 confirmation must not
      // make a unit proven on day 40 look 37 days stale.
      return {
        box: 'understood',
        seen,
        lastSeen,
        confirmedOn: later(state.confirmedOn, evidence.day),
      };
    }

    default:
      return assertNever(state, 'UnitState');
  }
}

/**
 * Fold evidence into a profile, returning a new profile.
 *
 * **This is a fold, and that is a property worth protecting.** Applying evidence one item at a time
 * must equal applying it in one batch — `record(record(p, [a]), [b])` and `record(p, [a, b])` give
 * the same profile. A scheduler's genuinely nasty bugs live in the difference between two paths to
 * the same state, and a property test pins this so that no future optimisation can quietly break
 * it. Anything that makes a batch behave differently from a sequence (a per-call cap, a
 * once-per-batch bonus) breaks the law and needs to be a deliberate decision, not a side effect.
 *
 * Evidence is `readonly` so this function cannot push into the caller's array, and the caller loses
 * nothing — a mutable array is assignable to a readonly one.
 *
 * The profile's `day` is NOT advanced here. Evidence carries the day it happened, which may be in
 * the past when a host is syncing an offline queue. Moving the learner through time is `advanceTo`,
 * on purpose: recording what happened and deciding it is now tomorrow are different acts.
 */
export function record(profile: Profile, evidence: readonly Evidence[]): Profile {
  if (evidence.length === 0) return profile;

  const units: Record<string, UnitState> = { ...profile.units };

  for (const item of evidence) {
    const current =
      units[item.unit] ??
      // ⚠️ `lastProven: 0` — never proven — and NOT `item.day`. Zero is the identity element of the
      // `later()` fold, which is what makes the final value independent of the order evidence
      // arrives in. Seeding it to the minting item's day would make it depend on which item record
      // happened to meet first, so an offline queue replayed in a different order would produce a
      // different profile — breaking the fold law this function's contract rests on.
      ({
        box: 'learning',
        seen: 0,
        lastSeen: item.day,
        streak: 0,
        lastProven: NEVER,
      } satisfies UnitState);
    units[item.unit] = applyOne(current, item);
  }

  return { ...profile, units };
}
