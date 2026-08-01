import { assertNever } from '../internal/assert.js';
import type { Evidence } from '../model/index.js';
import type { Day } from '../model/index.js';
import type { Profile } from '../model/index.js';
import { clampStrength, STRENGTH_STEP, UNMET, type Prior, type UnitState } from '../model/index.js';

/**
 * Folding evidence into a profile.
 *
 * This is the only function in the engine that changes what is believed about a learner. Everything
 * else reads.
 *
 * @module
 */

/**
 * Later of two days.
 *
 * ⚠️ MONOTONIC, and every date field in `UnitState` folds through it. A host syncing an offline
 * queue replays evidence out of order, and taking `evidence.day` directly meant a late-arriving
 * day-3 item rewound a unit last seen on day 40 — so a unit proven yesterday reported itself last
 * proven 37 days ago. Nothing errored; it stayed invisible until something did interval arithmetic
 * on the field, at which point it surfaced as a scheduling bug dated to a commit months earlier.
 *
 * Taking the later of the two also makes the result independent of arrival order, which is the
 * property a sync queue actually needs.
 */
function later(a: Day, b: Day): Day {
  return a > b ? a : b;
}

/** Move a rung by a signed step, saturating at both ends. See {@link STRENGTH_STEP}. */
function step(state: UnitState, delta: number): UnitState['strength'] {
  return clampStrength(state.strength + delta);
}

/**
 * Fold one claim into a unit's prior.
 *
 * A max-fold like every date here, so re-claiming a word is safe and the result does not depend on
 * which claim `record` happened to meet first. A claim never clears an existing one and never
 * touches anything else on the unit.
 */
function claimed(prior: Prior, day: Day): Prior {
  switch (prior.kind) {
    case 'none':
      return { kind: 'claimed', on: day };
    case 'claimed':
      return { kind: 'claimed', on: later(prior.on, day) };
    default:
      return assertNever(prior, 'Prior');
  }
}

/**
 * Apply one piece of evidence to one unit's state.
 *
 * The complete rule table lives on {@link Evidence} — this function is that table, executed. The
 * switch is exhaustive so that a fifth evidence kind becomes a compiler-generated worklist rather
 * than a silent default.
 *
 * Three things are worth naming here because each replaces a v2 rule that turned out to be wrong:
 *
 * - **`lastAsked` moves on every retrieval, pass or fail.** v2 had no such field, so a failed word's
 *   wait grew without bound and it sat at the head of the drill queue forever. This one line is the
 *   whole leech fix.
 * - **`lastProven` still moves only on success.** A failure must never be recorded as a proof. That
 *   is the v1→v2 lesson and it is untouched.
 * - **A failure costs a rung rather than everything.** v2 demoted an understood unit outright on one
 *   wrong answer, which is why the known count measured out at `accuracy x pool` instead of tracking
 *   knowledge. Nothing is permanently known — a unit still falls below {@link KNOWN_AT_STRENGTH}
 *   after enough misses — but a single slip no longer erases months.
 */
function applyOne(state: UnitState, evidence: Evidence): UnitState {
  switch (evidence.kind) {
    case 'retrieval': {
      const common = {
        ...state,
        seen: state.seen + 1,
        lastSeen: later(state.lastSeen, evidence.day),
        lastAsked: later(state.lastAsked, evidence.day),
      };
      if (evidence.outcome === 'unknown') {
        return {
          ...common,
          strength: step(state, -STRENGTH_STEP.missRetrieval),
          lapses: state.lapses + 1,
        };
      }
      return {
        ...common,
        lastProven: later(state.lastProven, evidence.day),
        strength: step(state, STRENGTH_STEP.gain),
        lapses: 0,
      };
    }

    case 'exposure':
      // Met and moved on. `seen` and `lastSeen` and nothing else — no progress toward known, and no
      // penalty either. She may well have understood it perfectly; nobody asked.
      return {
        ...state,
        seen: state.seen + 1,
        lastSeen: later(state.lastSeen, evidence.day),
      };

    case 'help':
      // She asked. That is a real negative signal and a weaker one than failing a retrieval — and it
      // is not a lapse, because asking for help is the right thing to do. `lastAsked` does NOT move:
      // nobody tested her, so the scheduler has no more reason to consider this word attended to
      // than if she had read straight past it.
      return {
        ...state,
        seen: state.seen + 1,
        lastSeen: later(state.lastSeen, evidence.day),
        strength: step(state, -STRENGTH_STEP.missHelp),
      };

    case 'claim':
      // Sets `prior` and nothing else — not `seen`, because nobody encountered anything. This is what
      // makes a claim structurally unable to overwrite a measurement, and it is why the claim path
      // commutes with every other kind under any permutation.
      return { ...state, prior: claimed(state.prior, evidence.day) };

    default:
      return assertNever(evidence, 'Evidence');
  }
}

/**
 * Fold evidence into a profile, returning a new profile.
 *
 * **This is a fold, and that is a property worth protecting.** Applying evidence one item at a time
 * must equal applying it in one batch — `record(record(p, [a]), [b])` and `record(p, [a, b])` give
 * the same profile. A scheduler's genuinely nasty bugs live in the difference between two paths to
 * the same state, and a property test pins this so no future optimisation can quietly break it.
 * Anything that makes a batch behave differently from a sequence (a per-call cap, a once-per-batch
 * bonus) breaks the law and needs to be a deliberate decision, not a side effect.
 *
 * ⚠️ **`strength` and `lapses` are ORDER-DEPENDENT, and every date field is not.** A saturating ±n
 * walk does not commute: from rung 0, `[miss, hit]` ends at 1 while `[hit, miss]` ends at 0. This is
 * not new — v2's `streak` and `box` were order-dependent in exactly the same way — but it is newly
 * LOAD-BEARING, because `coverage()` now reads `strength` where it used to read a box that a
 * two-success run would have reached from either direction.
 *
 * Two consequences a host must know, and `sequence.property.test.ts` pins both:
 *
 * 1. **Sort an offline queue by day before folding it.** Same-day ties remain genuinely ambiguous
 *    and are the host's to break however it likes; across days, sorting removes the question.
 * 2. **The repair path is a re-fold from the log**, which is why retaining the evidence log is now a
 *    stated host obligation rather than an unspoken house rule.
 *
 * The commuting alternative — storing `proved` and `failed` counts and deriving a rung from their
 * ratio — was rejected because it can never forget: a word proven 400 times and now failing half the
 * time would read at the ceiling for months.
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
    units[item.unit] = applyOne(units[item.unit] ?? UNMET, item);
  }

  return { ...profile, units };
}
