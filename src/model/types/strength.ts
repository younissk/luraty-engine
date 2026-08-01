/**
 * How sure the engine is that this unit is known, as a rung on a bounded integer ladder.
 *
 * A literal union rather than a bare `number`, because this is where *make illegal states
 * unrepresentable* now lives: a rung of 7 must not typecheck, and a rung of 2.5 must not either.
 *
 * Integer and bounded, for the same reason `COVERAGE_BAND` is integer: nothing here has a rounding
 * or formatting behaviour that could differ between Hermes and Node. A float ladder would put the
 * definition of "known" on the wrong side of the cross-runtime lane.
 *
 * @module
 */

import type { LADDER } from '../ladder.js';

export type Strength = (typeof LADDER)[number];
