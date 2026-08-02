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
      // ⚠️ **IT NO LONGER COSTS A RUNG, AND THE OLD PENALTY WAS BACKWARDS** (ADR-0012). It read the
      // tap as "she failed to know this", which is true and is the least interesting thing about it.
      // Meta-analysis of 42 studies: glossed reading teaches 45.3% of encountered words against
      // 26.6% unglossed, and looking a word up predicts receptive vocabulary knowledge where
      // guessing from context does not. A gloss tap is the most productive thing a learner does
      // while reading, and the engine was charging her for it.
      //
      // ⚠️ **IT STILL PROVES NOTHING EITHER.** No rung moves in either direction; ADR-0003's rule
      // that only retrieval proves is untouched and `known` still means proven. What the tap buys is
      // a place in tomorrow's queue — `plan`'s `engagedOn` reads `lastHelped`.
      //
      // `lastAsked` does NOT move: nobody tested her, so the scheduler has no more reason to
      // consider this word attended to than if she had read straight past it.
      return {
        ...state,
        seen: state.seen + 1,
        lastSeen: later(state.lastSeen, evidence.day),
        lastHelped: later(state.lastHelped, evidence.day),
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
