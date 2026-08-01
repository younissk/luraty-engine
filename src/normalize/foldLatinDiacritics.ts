/** @module */

import { transform } from '../utils/transform.js';
import { foldLatin } from './replacers/foldLatin.js';

export function foldLatinDiacritics(s: string): string {
  return transform(s, foldLatin);
}
