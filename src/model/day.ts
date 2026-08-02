/**
 * Build a `Day`. Rejects negatives, non-integers, and **zero**.
 *
 * Zero is the never-sentinel — see `types/day.ts`. Rejecting it here is what makes that sentinel
 * unambiguous, and it is the same discipline as `unitKey()` being the only blessed constructor: the
 * check has to live somewhere a caller cannot skip.
 *
 * @module
 */

import { NEVER } from './constants.js';
import type { Day } from './types/day.js';
import type { DayOf } from './types/dayOf.js';

export function day<N extends number>(n: N): DayOf<N>;
export function day(n: number): Day | undefined {
  if (!Number.isInteger(n) || n < NEVER + 1) return undefined;
  return n as Day;
}
