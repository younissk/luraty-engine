/**
 * Move a rung by a signed step, saturating at both ends. See `STRENGTH_STEP`.
 *
 * @module
 */

import { clampStrength, type UnitState } from '../../model/index.js';

export function step(state: UnitState, delta: number): UnitState['strength'] {
  return clampStrength(state.strength + delta);
}
