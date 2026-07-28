import type { NormalizeStep } from '../model/pack.js';
import { assertNever } from './assert.js';

/**
 * Text transformations, written the hard way on purpose.
 *
 * Every function here has a one-line idiomatic version that uses `String.prototype.normalize()` or
 * `Intl`, and every one of those is unavailable on Hermes, which ships without full ICU. They are
 * green on Node, green in a browser, and broken on the device this actually runs on — the worst
 * possible failure shape, because the tests pass.
 *
 * Unicode property escapes (`\p{L}`, `\p{M}`) are avoided for the same reason: their behaviour has
 * historically differed between engines, and this package's whole claim is that it behaves
 * identically on all three.
 *
 * So: explicit code-point ranges and an explicit mapping table. Bigger, uglier, and correct
 * everywhere.
 *
 * @module
 */

// ── Arabic ──────────────────────────────────────────────────────────────────────────────────────

/**
 * The short-vowel marks and friends: fathatan through sukun (U+064B–U+0652), plus shadda,
 * superscript alef (U+0670) and the Quranic marks at U+0653–U+0655.
 *
 * Stripping them is not lossy in practice — real Arabic writing omits them almost entirely, so a
 * learner typing an undiacritised word and a bank containing a diacritised one must match.
 */
function isArabicDiacritic(code: number): boolean {
  return (code >= 0x064b && code <= 0x0655) || code === 0x0670;
}

/** U+0640, the elongation character. Purely decorative — it carries no sound and no meaning. */
const TATWEEL = 0x0640;

/**
 * Alef variants writers use interchangeably: آ أ إ ٱ all collapse to ا.
 *
 * Not a simplification. Arabic writers genuinely vary here, so treating أحمد and احمد as different
 * words would fragment a learner's knowledge across spellings of the same thing.
 */
const ALEF_VARIANTS = new Set([0x0622, 0x0623, 0x0625, 0x0671]);
const ALEF = 'ا';

/** ة → ه and ى → ي: the other pair writers vary on, especially word-finally. */
const TEH_MARBUTA = 0x0629;
const HEH = 'ه';
const ALEF_MAKSURA = 0x0649;
const YEH = 'ي';

// ── Latin ───────────────────────────────────────────────────────────────────────────────────────

/**
 * Accented Latin letters → their base form.
 *
 * An explicit table because `'é'.normalize('NFD')` is the idiomatic way and it is ICU-backed. The
 * table covers French thoroughly and the common Spanish, German, Portuguese and Nordic letters —
 * enough for the languages in scope, and trivially extended.
 */
const LATIN_FOLD: Readonly<Record<string, string>> = {
  à: 'a',
  á: 'a',
  â: 'a',
  ã: 'a',
  ä: 'a',
  å: 'a',
  ā: 'a',
  è: 'e',
  é: 'e',
  ê: 'e',
  ë: 'e',
  ē: 'e',
  ì: 'i',
  í: 'i',
  î: 'i',
  ï: 'i',
  ī: 'i',
  ò: 'o',
  ó: 'o',
  ô: 'o',
  õ: 'o',
  ö: 'o',
  ø: 'o',
  ō: 'o',
  ù: 'u',
  ú: 'u',
  û: 'u',
  ü: 'u',
  ū: 'u',
  ý: 'y',
  ÿ: 'y',
  ñ: 'n',
  ç: 'c',
  æ: 'ae',
  œ: 'oe',
  ß: 'ss',
};

/**
 * Punctuation, listed rather than matched by category.
 *
 * Includes the Arabic comma, semicolon and question mark, which a `[a-z]`-shaped assumption misses
 * entirely and which appear constantly in real text.
 *
 * ⚠️ THE STRAIGHT APOSTROPHE IS DELIBERATELY ABSENT, and this was a real bug before it was.
 *
 * The tokenizer is the authority on what belongs inside a word — French declares `'` a word
 * character in its pattern precisely so `l'automne` survives splitting as one piece. When this set
 * also removed it, `l'automne` normalized to `lautomne` before affix stripping ran, the `l'` prefix
 * no longer matched, and the elision was silently baked into the key. Nothing errored; French words
 * just quietly filed themselves under the wrong lemma.
 *
 * The typographic quotes ‘ ’ “ ” stay, because those are never word-internal. A language for which
 * the straight apostrophe really is punctuation simply leaves it out of its tokenize pattern, and
 * it never reaches here.
 */
// Spreading a string yields code points, which is exactly what a set of single characters wants.
// (`no-misused-spread` is off package-wide; the argument lives in `eslint.config.js`, once.)
const PUNCTUATION = new Set([
  ...'.,;:!?"`()[]{}<>«»„“”‘’–—-_/\\|@#$%^&*+=~',
  '،', // ، Arabic comma
  '؛', // ؛ Arabic semicolon
  '؟', // ؟ Arabic question mark
  '٪', // ٪ Arabic percent
  '۔', // ۔ Urdu full stop
]);

// ── The steps ───────────────────────────────────────────────────────────────────────────────────

function stripArabicDiacritics(s: string): string {
  let out = '';
  for (const ch of s) {
    const code = ch.codePointAt(0);
    if (code !== undefined && isArabicDiacritic(code)) continue;
    out += ch;
  }
  return out;
}

function stripTatweel(s: string): string {
  let out = '';
  for (const ch of s) {
    if (ch.codePointAt(0) === TATWEEL) continue;
    out += ch;
  }
  return out;
}

function normalizeArabicAlef(s: string): string {
  let out = '';
  for (const ch of s) {
    const code = ch.codePointAt(0);
    out += code !== undefined && ALEF_VARIANTS.has(code) ? ALEF : ch;
  }
  return out;
}

function normalizeArabicFinals(s: string): string {
  let out = '';
  for (const ch of s) {
    const code = ch.codePointAt(0);
    if (code === TEH_MARBUTA) out += HEH;
    else if (code === ALEF_MAKSURA) out += YEH;
    else out += ch;
  }
  return out;
}

function foldLatinDiacritics(s: string): string {
  let out = '';
  for (const ch of s) {
    out += LATIN_FOLD[ch] ?? ch;
  }
  return out;
}

/**
 * German umlauts to their two-letter forms: ä→ae, ö→oe, ü→ue, ß→ss.
 *
 * ⚠️ THE POINT IS THAT THIS IS NOT `foldLatinDiacritics`, AND GERMAN IS WHY.
 *
 * `pack.ts` already argues that a generic `stripDiacritics` is a lie because Arabic and Latin have
 * nothing in common mechanically. German shows the same mistake one level further down: French and
 * German are the *same script* and want *opposite* answers. French `é→e` is correct — `café` and
 * `cafe` are one word. German `ö→o` is wrong, and destructively so. Measured against the real fold
 * table, every one of these pairs collapsed to one key:
 *
 * | folded to `o`/`a`/`u` | …which is a different word |
 * | --------------------- | -------------------------- |
 * | schön (beautiful)     | schon (already)            |
 * | zählen (to count)     | zahlen (to pay)            |
 * | fördern (to promote)  | fordern (to demand)        |
 * | drücken (to press)    | drucken (to print)         |
 * | schwül (humid)        | schwul (gay)               |
 * | Bär (bear)            | Bar (bar)                  |
 *
 * A learner who proved `zahlen` would be credited with `zählen`, and the engine would then never
 * teach them one of the two. The two-letter fold is also what German itself does when umlauts are
 * unavailable — passports, domain names, phone books — so it is the language's own convention
 * rather than an invention.
 *
 * `ß→ss` is shared with {@link LATIN_FOLD} and correct in both.
 */
const GERMAN_FOLD: Readonly<Record<string, string>> = {
  ä: 'ae',
  ö: 'oe',
  ü: 'ue',
  ß: 'ss',
  // The capitals are here so the step does not silently depend on `lowercase` running first. A pack
  // author who omits it gets the right answer anyway.
  Ä: 'ae',
  Ö: 'oe',
  Ü: 'ue',
  ẞ: 'ss',
};

function foldGermanUmlauts(s: string): string {
  let out = '';
  for (const ch of s) {
    out += GERMAN_FOLD[ch] ?? ch;
  }
  return out;
}

function stripPunctuation(s: string): string {
  let out = '';
  for (const ch of s) {
    if (PUNCTUATION.has(ch)) continue;
    out += ch;
  }
  return out;
}

/**
 * Every step, as a runtime value.
 *
 * A `Record<NormalizeStep, true>` rather than a hand-written array, because the annotation makes the
 * compiler enforce exhaustiveness: adding a member to {@link NormalizeStep} and forgetting it here
 * is a type error, not a step that silently fails to validate. That is the same guarantee
 * {@link applyStep}'s switch gives, in the one other place that has to know the whole set.
 *
 * ⚠️ The `true` values are a COMPILE-TIME device and are never read — only the keys are. Flipping
 * one to `false` therefore changes nothing, and `npm run mutate` reports each as a survivor forever.
 * They stay because a `Record<K, true>` is the only shape that makes the compiler check the list is
 * complete; an array would let a step go missing in silence, which is the failure this exists to
 * prevent.
 */
const STEPS: Readonly<Record<NormalizeStep, true>> = {
  lowercase: true,
  stripPunctuation: true,
  stripArabicDiacritics: true,
  stripTatweel: true,
  normalizeArabicAlef: true,
  normalizeArabicFinals: true,
  foldLatinDiacritics: true,
  foldGermanUmlauts: true,
};

/** The step names, so an error can tell a pack author what they are allowed to write. */
export const NORMALIZE_STEPS: readonly NormalizeStep[] = Object.keys(STEPS) as NormalizeStep[];

/**
 * The same names as a Set, which is what membership is actually tested against.
 *
 * ⚠️ A Set and not the object above, for the reason `createPack` uses a Map for its lemma table:
 * `'constructor' in STEPS` is TRUE through the prototype chain, so an object lookup would validate
 * `constructor`, `toString`, `__proto__` and `valueOf` and then throw from {@link applyStep}. A Set
 * has no prototype chain to fall through, which removes the class rather than guarding each case.
 */
const STEP_NAMES: ReadonlySet<string> = new Set<string>(NORMALIZE_STEPS);

/** Is this a step the engine actually has? */
export function isNormalizeStep(value: unknown): value is NormalizeStep {
  return typeof value === 'string' && STEP_NAMES.has(value);
}

/** Apply one named step. Exhaustive, so adding a step to the union breaks this until it is handled. */
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

/** Apply steps in order. */
export function applySteps(steps: readonly NormalizeStep[], s: string): string {
  let out = s;
  for (const step of steps) out = applyStep(step, out);
  return out;
}
