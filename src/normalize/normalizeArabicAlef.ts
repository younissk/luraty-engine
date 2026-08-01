/** @module */

import { transform } from '../utils/transform.js';
import { toAlef } from './replacers/toAlef.js';

export function normalizeArabicAlef(s: string): string {
  return transform(s, toAlef);
}
