/**
 * The step names, so an error can tell a pack author what they are allowed to write.
 *
 * @module
 */

import type { NormalizeStep } from '../model/index.js';
import { STEPS } from './steps.js';

export const NORMALIZE_STEPS: readonly NormalizeStep[] = Object.keys(STEPS) as NormalizeStep[];
