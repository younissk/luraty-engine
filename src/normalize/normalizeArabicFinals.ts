/** @module */

import { transform } from '../utils/transform.js';
import { toFinal } from './replacers/toFinal.js';

export function normalizeArabicFinals(s: string): string {
  return transform(s, toFinal);
}
