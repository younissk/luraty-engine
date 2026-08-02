/**
 * Is this a step the engine actually has?
 *
 * @module
 */

import type { NormalizeStep } from '../model/index.js';
import { STEP_NAMES } from './stepNames.js';

export function isNormalizeStep(value: unknown): value is NormalizeStep {
  return typeof value === 'string' && STEP_NAMES.has(value);
}
