/**
 * Apply one named step. Exhaustive, so adding a step to the union breaks this until it is handled.
 *
 * @module
 */

import type { NormalizeStep } from '../model/index.js';
import { assertNever } from '../utils/assertNever.js';
import { foldGermanUmlauts } from './foldGermanUmlauts.js';
import { foldLatinDiacritics } from './foldLatinDiacritics.js';
import { normalizeArabicAlef } from './normalizeArabicAlef.js';
import { normalizeArabicFinals } from './normalizeArabicFinals.js';
import { stripArabicDiacritics } from './stripArabicDiacritics.js';
import { stripPunctuation } from './stripPunctuation.js';
import { stripTatweel } from './stripTatweel.js';

export function applyStep(step: NormalizeStep, s: string): string {
  switch (step) {
    case 'lowercase':
      // NOT toLocaleLowerCase: that is ICU-backed and, worse, locale-dependent — the Turkish
      // dotless-i rule would make the same word normalize differently on a Turkish phone.
      return s.toLowerCase();
    case 'stripPunctuation':
      return stripPunctuation(s);
    case 'stripArabicDiacritics':
      return stripArabicDiacritics(s);
    case 'stripTatweel':
      return stripTatweel(s);
    case 'normalizeArabicAlef':
      return normalizeArabicAlef(s);
    case 'normalizeArabicFinals':
      return normalizeArabicFinals(s);
    case 'foldLatinDiacritics':
      return foldLatinDiacritics(s);
    case 'foldGermanUmlauts':
      return foldGermanUmlauts(s);
    default:
      return assertNever(step, 'NormalizeStep');
  }
}
