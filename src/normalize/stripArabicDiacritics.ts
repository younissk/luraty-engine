/** @module */

import { transform } from '../utils/transform.js';
import { dropArabicDiacritic } from './replacers/dropArabicDiacritic.js';

export function stripArabicDiacritics(s: string): string {
  return transform(s, dropArabicDiacritic);
}
