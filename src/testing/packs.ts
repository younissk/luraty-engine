import { createPack } from '../core/pack.js';
import type { LanguagePack, PackConfig, PackData } from '../model/pack.js';

/**
 * Small but genuine language packs, for tests.
 *
 * ⚠️ NOT exported from `src/index.ts`, and never should be. These are fixtures — real packs carry
 * tens of thousands of words and are supplied by the host.
 *
 * They are real French and Arabic rather than a made-up toy language on purpose. A toy language
 * would pass every test and prove nothing about the two cases that actually matter: French
 * elision and accents, and Arabic clitics and optional diacritics. Those are where a pack breaks.
 *
 * @module
 */

function build(config: PackConfig, data: PackData): LanguagePack {
  const result = createPack(config, data);
  if (!result.ok) throw new Error(`bad test fixture pack: ${result.error.message}`);
  return result.value;
}

// ── French ──────────────────────────────────────────────────────────────────────────────────────

const FRENCH_CONFIG: PackConfig = {
  id: 'fr',
  // Latin letters plus the accented ones and the apostrophe, so `l'automne` tokenizes as one piece
  // and the elision is handled during normalization rather than being lost at the split.
  tokenize: { strategy: 'regex', pattern: "[a-zA-Zà-öø-ÿ']+" },
  normalize: ['lowercase', 'stripPunctuation', 'foldLatinDiacritics'],
  affixes: {
    prefixes: ["l'", "d'", "j'", "n'", "qu'", "s'", "c'", "m'", "t'"],
    onlyIfRemainderKnown: true,
  },
  compare: ['lowercase', 'stripPunctuation', 'foldLatinDiacritics'],
};

const FRENCH_DATA: PackData = {
  // Roughly frequency-ordered. Real lists run to tens of thousands.
  frequency:
    'de la le et les des en un une du que est il pour dans qui ne sur se pas plus par je avec tout ' +
    'faire son mettre autre on mais nous comme ou si leur y dire elle avant deux mots automne ' +
    'marche marché pain vendre acheter maison eau',
  lemmas: {
    vais: 'aller',
    vas: 'aller',
    va: 'aller',
    allons: 'aller',
    allez: 'aller',
    vont: 'aller',
    suis: 'etre',
    es: 'etre',
    est: 'etre',
    sommes: 'etre',
  },
};

export const frenchPack: LanguagePack = build(FRENCH_CONFIG, FRENCH_DATA);

// ── Arabic (MSA) ────────────────────────────────────────────────────────────────────────────────

const ARABIC_CONFIG: PackConfig = {
  id: 'ar-msa',
  // The Arabic block. Diacritics are included so they can be stripped during normalization rather
  // than silently splitting a word in two at the tokenizer.
  tokenize: { strategy: 'regex', pattern: '[\\u0600-\\u06FF]+' },
  normalize: [
    'stripArabicDiacritics',
    'stripTatweel',
    'normalizeArabicAlef',
    'normalizeArabicFinals',
  ],
  // ال (the), و (and), ب (with), ل (for), ف (so), and the combined لل.
  affixes: { prefixes: ['ال', 'لل', 'و', 'ب', 'ل', 'ف', 'ك'], onlyIfRemainderKnown: true },
  compare: [
    // `stripPunctuation` was missing here while French had it, so the two packs graded trailing
    // punctuation differently: French accepted "marche." for "marche" and Arabic rejected "سوق."
    // for "سوق". Nothing caught it, because no test compared packs against the same input.
    'stripPunctuation',
    'stripArabicDiacritics',
    'stripTatweel',
    'normalizeArabicAlef',
    'normalizeArabicFinals',
  ],
};

const ARABIC_DATA: PackData = {
  frequency:
    'في من على أن إلى عن مع هذا التي كان قد لا ما هو كل بعد بين حول عند سوق كتاب مدرسة بيت ماء خبز ' +
    'شارع مطار طبيب قطار جريدة حكومة ولد وقت مدينة',
};

export const arabicPack: LanguagePack = build(ARABIC_CONFIG, ARABIC_DATA);

// ── Exposed configs, for tests that need to vary one setting ────────────────────────────────────

export const fixtures = {
  frenchConfig: FRENCH_CONFIG,
  frenchData: FRENCH_DATA,
  arabicConfig: ARABIC_CONFIG,
  arabicData: ARABIC_DATA,
} as const;
