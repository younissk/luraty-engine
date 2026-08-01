/**
 * Apply steps in order.
 *
 * @module
 */

import type { NormalizeStep } from '../model/index.js';
import { applyStep } from './applyStep.js';

export function applySteps(steps: readonly NormalizeStep[], s: string): string {
  let out = s;
  for (const step of steps) out = applyStep(step, out);
  return out;
}
