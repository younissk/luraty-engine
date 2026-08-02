/**
 * Saturating, and total on every number including `NaN` and `Infinity`.
 *
 * Used by the fold, where the arithmetic is bounded by construction and this is belt-and-braces, and
 * by `parseUnit`, where it is load-bearing: a blob written by a build with a HIGHER ceiling must
 * still load. That asymmetry — reject a non-whole rung, clamp an over-large one — is what lets
 * `MAX_STRENGTH` be lowered after a sweep as a code change rather than a wire bump.
 *
 * `Math.trunc` before clamping, so `2.7` lands on 2 rather than being rejected; `NaN` truncates to
 * `NaN`, fails both comparisons, and falls out at 0 through the `??`.
 *
 * @module
 */

import { MAX_STRENGTH } from './constants.js';
import { LADDER } from './ladder.js';
import type { Strength } from './types/strength.js';

export function clampStrength(n: number): Strength {
  return LADDER[Math.min(Math.max(Math.trunc(n), 0), MAX_STRENGTH)] ?? 0;
}
