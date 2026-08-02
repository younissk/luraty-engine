// Text transformations, written the hard way on purpose.
//
// Every function here has a one-line idiomatic version that uses `String.prototype.normalize()` or
// `Intl`, and every one of those is unavailable on Hermes, which ships without full ICU. They are
// green on Node, green in a browser, and broken on the device this actually runs on — the worst
// possible failure shape, because the tests pass.
//
// Unicode property escapes (`\p{L}`, `\p{M}`) are avoided for the same reason: their behaviour has
// historically differed between engines, and this package's whole claim is that it behaves
// identically on all three.
//
// So: explicit code-point ranges and an explicit mapping table. Bigger, uglier, and correct
// everywhere.
//
// ⚠️ THIS WAS `internal/text.ts`, AND THE SPLIT FROM `utils/` IS THE POINT. The mechanism —
// `transform`, `foldTable` — knows no language and lives in `utils/`. Everything here knows one:
// which code points Arabic writers vary on, and that German wants the opposite fold from French.
// **Nothing here is ever exported from `src/index.ts`**, exactly as `internal/` promised.
//
// @module

export { applyStep } from './applyStep.js';
export { applySteps } from './applySteps.js';
export { foldGermanUmlauts } from './foldGermanUmlauts.js';
export { foldLatinDiacritics } from './foldLatinDiacritics.js';
export { isArabicDiacritic } from './isArabicDiacritic.js';
export { isNormalizeStep } from './isNormalizeStep.js';
export { normalizeArabicAlef } from './normalizeArabicAlef.js';
export { normalizeArabicFinals } from './normalizeArabicFinals.js';
export { NORMALIZE_STEPS } from './normalizeSteps.js';
export { stripArabicDiacritics } from './stripArabicDiacritics.js';
export { stripPunctuation } from './stripPunctuation.js';
export { stripTatweel } from './stripTatweel.js';
