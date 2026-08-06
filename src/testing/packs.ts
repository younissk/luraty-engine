import { createPack } from '../core/pack.js';
import { variety } from '../model/index.js';
import type { LanguagePack, PackConfig, PackData } from '../model/index.js';

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

/**
 * Build a fixture pack, deferring any failure to first use.
 *
 * ⚠️ IT DOES NOT THROW AT MODULE LOAD, and that is about the mutation lane rather than about style.
 *
 * These packs are built when this file is imported, so a throw here kills the whole importing test
 * FILE before a single test runs. Vitest then reports "11 files failed, 0 tests failed" — and
 * Stryker scores kill-or-survive from **test results**, so a mutant whose blast radius is a broken
 * pack produced no failing test and was recorded as **SURVIVED**.
 *
 * Measured: hand-applying one such mutant (always-fail `checkSteps`' array guard) fails 11 test
 * files, and `npm run mutate` reported that exact mutant as a survivor. So an unknown share of
 * `pack.ts`'s survivors are false, and a lane that cries wolf is a lane nobody reads.
 *
 * Returning a pack whose every method throws moves the failure into the first TEST that uses it,
 * which is a failing test result — visible to the audit, and a clearer error for a human too.
 */
function build(config: PackConfig, data: PackData): LanguagePack {
  const result = createPack(config, data);
  if (result.ok) return result.value;

  const message = `bad test fixture pack "${config.id}": ${result.error.message}`;
  const boom = (): never => {
    throw new Error(message);
  };
  // `config.id` is a fixture literal, so this cannot fail — but it goes through the constructor
  // anyway, because `LanguagePack.id` is branded and `unitKey()` must stay the only place that
  // launders a string into a brand.
  return {
    id: variety(config.id) ?? variety('broken-fixture'),
    split: boom,
    key: boom,
    candidates: boom,
    rank: boom,
    compare: boom,
  };
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
    'شارع مطار طبيب قطار جريدة حكومة ولد وقت مدينة كتب مدرس',
  // ⚠️ **THE ONE FIXTURE WHERE A FORM HAS MORE THAN ONE READING, AND IT IS REAL ARABIC RATHER THAN
  // AN INVENTED AMBIGUITY.** Written Arabic drops the short vowels, so both rows below are one
  // string on the page and two different words underneath.
  //
  // ⚠️ **AND THE FIXTURE IS ALSO THE HONEST LIMIT OF THIS FORMAT.** Both rows work because the two
  // readings have DIFFERENT lemmas. Arabic's commonest ambiguity does not: ذهب is *he went* and
  // *gold*, علم is *knowledge* and *flag*, and each pair shares one consonant skeleton, so both
  // readings normalize to the same lemma and this table cannot tell them apart — nor can the unit
  // key, which means the engine credits one when the learner meets the other. Candidate lemmas are
  // necessary for glossing an unvocalised script and they are not sufficient; separating senses
  // that share a lemma needs a glossary keyed by sense, which no pack carries.
  lemmas: {
    // *he wrote* (كَتَبَ, lemma كتب) and *books* (كُتُب, plural of كتاب).
    كتب: ['كتب', 'كتاب'],
    // *school* (مَدْرَسَة) and *a female teacher* (مُدَرِّسَة, lemma مدرس).
    مدرسة: ['مدرسة', 'مدرس'],
  },
};

export const arabicPack: LanguagePack = build(ARABIC_CONFIG, ARABIC_DATA);

// ── German ──────────────────────────────────────────────────────────────────────────────────────

const GERMAN_CONFIG: PackConfig = {
  id: 'de',
  // No apostrophe: German does not elide the way French does, so it is punctuation here rather than
  // a word character. The umlauts and ß are inside the class so they survive to the fold step.
  tokenize: { strategy: 'regex', pattern: '[a-zA-ZäöüÄÖÜßẞ]+' },
  // ⚠️ ORDER MATTERS, and it is the whole reason both fold steps appear.
  //
  // `foldGermanUmlauts` runs FIRST and turns ä into `ae`. Only then does `foldLatinDiacritics` run,
  // which handles loan-word accents (`Café` → `cafe`) and finds no umlauts left to ruin. Reverse
  // them and the Latin table gets ä first, maps it to `a`, and schön collapses into schon.
  normalize: ['lowercase', 'stripPunctuation', 'foldGermanUmlauts', 'foldLatinDiacritics'],
  // `ge-` is the participle prefix. It is only safe because `onlyIfRemainderKnown` refuses a strip
  // whose remainder is not a word the pack has heard of: `gesagt` → `sagt` is right, and `Geld` →
  // `ld`, `gehen` → `hen`, `gerade` → `rade` are all refused because none of those is in the list.
  affixes: { prefixes: ['ge'], onlyIfRemainderKnown: true },
  compare: ['lowercase', 'stripPunctuation', 'foldGermanUmlauts', 'foldLatinDiacritics'],
};

const GERMAN_DATA: PackData = {
  // Roughly frequency-ordered, then the content words the demo passage needs. A real list runs to
  // tens of thousands and comes from a corpus; this is a fixture.
  frequency:
    'der die und in den von zu das mit sich des auf fuer ist im dem nicht ein eine als auch es an ' +
    'werden aus er hat dass sie nach wird bei einer um am sind noch wie einem ueber einen so zum ' +
    'war haben nur oder aber vor zur bis mehr durch man sein wurde sei ich wir ihr mich mir dich ' +
    'dir uns euch kein sehr schon immer wenn dann weil dass hier dort heute morgen gestern jahr ' +
    'tag zeit mensch kind frau mann haus stadt land wasser brot markt strasse bahnhof arzt zeitung ' +
    'regierung schule buch tuer fenster garten baum blume himmel sonne mond stern gehen kommen ' +
    'machen sagen sehen geben nehmen finden denken wissen kennen lesen schreiben sprechen hoeren ' +
    'essen trinken kaufen verkaufen wohnen arbeiten lernen spielen laufen fahren schoen gross ' +
    'klein alt neu jung gut schlecht warm kalt schnell langsam',
  lemmas: {
    // Irregular verbs — exactly the forms affix rules cannot reach. Keys AND values are normalized
    // forms, because `key()` consults this map with the already-normalized surface.
    bin: 'sein',
    bist: 'sein',
    ist: 'sein',
    sind: 'sein',
    seid: 'sein',
    war: 'sein',
    waren: 'sein',
    gewesen: 'sein',
    habe: 'haben',
    hast: 'haben',
    hat: 'haben',
    habt: 'haben',
    hatte: 'haben',
    hatten: 'haben',
    gehe: 'gehen',
    gehst: 'gehen',
    geht: 'gehen',
    ging: 'gehen',
    gegangen: 'gehen',
    kaufe: 'kaufen',
    kaufst: 'kaufen',
    kauft: 'kaufen',
    gekauft: 'kaufen',
    lese: 'lesen',
    liest: 'lesen',
    las: 'lesen',
    gelesen: 'lesen',
    trinke: 'trinken',
    trinkt: 'trinken',
    getrunken: 'trinken',
    // ⚠️ Written in NATURAL German, umlauts and all. `createPack` normalizes both sides of this
    // table, so a pack author never has to hand-transliterate. Before it did, `läuft` keyed to
    // `laeuft` instead of `laufen` — the inflected form and the infinitive became two units.
    //
    // These two rows are also the umlaut pair: they stay DIFFERENT lemmas, because zählen (to
    // count) and zahlen (to pay) are different words.
    zählt: 'zählen',
    zahlt: 'zahlen',
    läuft: 'laufen',
    fährt: 'fahren',
    trägt: 'tragen',
  },
};

export const germanPack: LanguagePack = build(GERMAN_CONFIG, GERMAN_DATA);

// ── Exposed configs, for tests that need to vary one setting ────────────────────────────────────

export const fixtures = {
  frenchConfig: FRENCH_CONFIG,
  frenchData: FRENCH_DATA,
  arabicConfig: ARABIC_CONFIG,
  arabicData: ARABIC_DATA,
  germanConfig: GERMAN_CONFIG,
  germanData: GERMAN_DATA,
} as const;
