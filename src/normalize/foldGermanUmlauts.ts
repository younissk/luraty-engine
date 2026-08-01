/**
 * German umlauts to their two-letter forms. See `GERMAN_FOLD` for the six word pairs this keeps
 * apart, and for why it is emphatically not `foldLatinDiacritics`.
 *
 * ⚠️ This function had **no direct tests at all** until the mutation lane said so — the fold whose
 * table carries six German word pairs it exists to separate was pinned only indirectly, through a
 * pack fixture, and `Ä: 'ae' → Ä: ''` survived a full run. A sentence in a docstring is not a test.
 *
 * @module
 */

import { transform } from '../utils/transform.js';
import { foldGerman } from './replacers/foldGerman.js';

export function foldGermanUmlauts(s: string): string {
  return transform(s, foldGerman);
}
