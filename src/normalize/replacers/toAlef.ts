/** @module */

import { ALEF, ALEF_VARIANTS } from '../constants.js';

export const toAlef = (code: number): string | undefined =>
  ALEF_VARIANTS.has(code) ? ALEF : undefined;
