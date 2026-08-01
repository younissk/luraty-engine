/**
 * Apply one piece of evidence to one unit's state.
 *
 * The complete rule table lives on `Evidence` — this function is that table, executed. The switch is
 * exhaustive so that a fifth evidence kind becomes a compiler-generated worklist rather than a silent
 * default.
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
 *   knowledge. Nothing is permanently known — a unit still falls below `KNOWN_AT_STRENGTH` after
 *   enough misses — but a single slip no longer erases months.
 *
 * @module
 */

import { STRENGTH_STEP, type Evidence, type UnitState } from '../../model/index.js';
import { assertNever } from '../../utils/index.js';
import { claimed } from './claimed.js';
import { later } from './later.js';
import { step } from './step.js';

export function applyOne(state: UnitState, evidence: Evidence): UnitState {
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
