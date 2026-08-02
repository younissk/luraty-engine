/** @module */

import { transform } from '../utils/transform.js';
import { dropPunctuation } from './replacers/dropPunctuation.js';

export function stripPunctuation(s: string): string {
  return transform(s, dropPunctuation);
}
