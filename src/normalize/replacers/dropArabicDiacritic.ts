/**
 * ⚠️ A module-level constant rather than an inline arrow, and every replacer in this folder is one
 * for the same reason: `transform` is called 160,000 times building the German pack, and an inline
 * arrow would allocate a fresh closure on each of them.
 *
 * @module
 */

import { DELETE } from '../constants.js';
import { isArabicDiacritic } from '../isArabicDiacritic.js';

export const dropArabicDiacritic = (code: number): string | undefined =>
  isArabicDiacritic(code) ? DELETE : undefined;
