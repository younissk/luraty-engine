/** @module */

import { DELETE, PUNCTUATION } from '../constants.js';

export const dropPunctuation = (code: number): string | undefined =>
  PUNCTUATION.has(code) ? DELETE : undefined;
