/**
 * The host asserts prior knowledge. Nobody has checked.
 *
 * ⚠️ THIS IS THE ENTIRE SHAPE OF THE FACT A PLACEMENT HANDS OVER. The METHOD stays in the host, and
 * that is settled: self-assessment, a checklist, imitation, a scored instrument or a combination are
 * genuine product decisions with several defensible answers, and the engine takes no position.
 *
 * There is no confidence number and no `basis: 'self-report' | 'placement'`, because the engine would
 * treat them identically — so both would be invisible to the learner while looking like rigour.
 *
 * It arrives through `record()` rather than through a `seedProfile()` side door, and that is decided
 * by the house rule rather than by taste: the evidence log is the truth and a profile is a fold over
 * it, so the strategy for a changed memory model is a RE-FOLD. A placement that never entered the
 * log would be lost on the first one.
 *
 * A claim sets `UnitState.prior` and touches nothing else — not `strength`, not `seen`, not
 * `lastAsked`. That is what makes it structurally incapable of overwriting a measurement, and what
 * makes re-placing at month six safe with no "never overwrite" rule anybody has to remember.
 *
 * ⚠️ **A bare claim is worth nothing; a CONFIRMED one is worth a rung.** The fold is untouched — the
 * first proof of a claimed word still lands at raw `strength: 1`, exactly like any other word. But
 * `effectiveStrength` adds one on read once `lastProven` has moved, so a claim plus an independent
 * retrieval reaches the known rung. Two signals from different sources, which is what that rung was
 * always meant to represent. See `effectiveStrength` for the simulated learner whose count read zero
 * for twelve weeks without it.
 *
 * @module
 */

import type { Day } from './day.js';
import type { UnitKey } from './unitKey.js';

export type Claim = {
  readonly kind: 'claim';
  readonly unit: UnitKey;
  readonly day: Day;
};
