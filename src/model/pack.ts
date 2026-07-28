/**
 * The language pack contract.
 *
 * The engine knows no language. Everything language-specific arrives through this interface, which
 * is why one engine can serve French, Arabic and anything else without a branch.
 *
 * Four functions is the whole surface. That is not minimalism for its own sake — every function
 * here is one the engine genuinely cannot do itself, and nothing else qualifies. If a fifth is ever
 * needed, that is a real signal about the design rather than a convenience.
 *
 * @module
 */

/** A canonical word form: the pack's answer to "are these two the same word?". */
export type Lemma = string;

export type LanguagePack = {
  /** Identifies the pack. The engine treats it as opaque. */
  readonly id: string;

  /**
   * Text → surface tokens.
   *
   * The engine cannot do this: French splits on spaces and apostrophes, Arabic on spaces, Chinese
   * and Japanese on nothing at all and need a dictionary.
   */
  split(text: string): readonly string[];

  /**
   * Surface form → canonical form. The answer to "are these the same word?".
   *
   * `vais` and `allons` both key to `aller`; `السوق` keys to `سوق` with the article stripped. The
   * engine then addresses knowledge by this canonical form, so a learner who met `vais` gets credit
   * when they meet `allez`.
   */
  key(surface: string): Lemma;

  /**
   * How common a word is. `1` is the most common word in the language.
   *
   * `undefined` means "not in the list", i.e. rarer than anything the pack knows about.
   *
   * ⚠️ Deliberately NOT `Infinity` for unknown. `JSON.stringify(Infinity)` is `null`, so an
   * infinite rank that reaches a persisted profile or a report silently becomes a null and the
   * failure surfaces somewhere else entirely.
   *
   * This is a property of the LANGUAGE, not of the learner, which is why a pack must carry data and
   * cannot be pure code: you cannot derive how common a word is from one person's history.
   */
  rank(lemma: Lemma): number | undefined;

  /**
   * Is this answer right? `1` exact, `0` wrong, in between for partial credit.
   *
   * Language-specific because what counts as "the same answer" is: French folds accents, Arabic
   * folds diacritics that are optional in writing anyway.
   */
  compare(given: string, expected: string): number;
};

// ── Building a pack from data ───────────────────────────────────────────────────────────────────

/**
 * The named transformations a pack may compose. A CLOSED set, on purpose.
 *
 * Closed because this is what lets a language be added as data rather than code: the pack file
 * names the steps, the engine owns the implementations. An open set (arbitrary functions in config)
 * would just be code with extra steps, and could not be shipped as JSON.
 *
 * These are named by SCRIPT rather than generically. A `stripDiacritics` that claims to work
 * everywhere is a lie — the Arabic and Latin cases have nothing in common mechanically, and hiding
 * that behind one name is how the wrong one gets applied to the wrong language.
 */
export type NormalizeStep =
  | 'lowercase'
  | 'stripPunctuation'
  /** Removes the optional Arabic short-vowel marks — they are usually absent in real text anyway. */
  | 'stripArabicDiacritics'
  /** Removes the Arabic elongation character, which carries no meaning. */
  | 'stripTatweel'
  /** Collapses أ إ آ ٱ to ا, which writers use interchangeably. */
  | 'normalizeArabicAlef'
  /** Collapses ة to ه and ى to ي, another pair writers vary on. */
  | 'normalizeArabicFinals'
  /** Maps accented Latin letters to their base form: é→e, ç→c, ü→u. Right for French. */
  | 'foldLatinDiacritics'
  /**
   * German umlauts to their two-letter forms: ä→ae, ö→oe, ü→ue, ß→ss.
   *
   * ⚠️ Not a duplicate of `foldLatinDiacritics`. French and German are the same script and want
   * OPPOSITE answers: `é→e` is right for French, and `ö→o` would merge schön with schon, zählen
   * with zahlen, drücken with drucken — different words in every case. Two-letter is also German's
   * own convention when umlauts are unavailable.
   */
  | 'foldGermanUmlauts';

export type TokenizeConfig = {
  readonly strategy: 'regex';
  /**
   * A character-class pattern matched globally. Not a full regex — a pattern for what counts as a
   * word character, so a pack file cannot smuggle in catastrophic backtracking.
   */
  readonly pattern: string;
};

export type AffixConfig = {
  /** Prefixes to strip, longest first. */
  readonly prefixes: readonly string[];
  /**
   * Only strip when the remainder is a word the pack has heard of.
   *
   * This is what makes affix stripping safe without a morphological analyser. Arabic و ("and") is a
   * legitimate prefix, so ولد would strip to لد — which is not a word. Checking the remainder
   * against the frequency list stops that, and the frequency list is already there.
   */
  readonly onlyIfRemainderKnown: boolean;
};

export type PackConfig = {
  readonly id: string;
  readonly tokenize: TokenizeConfig;
  /** Applied in order to produce the canonical form. */
  readonly normalize: readonly NormalizeStep[];
  readonly affixes?: AffixConfig;
  /** Applied in order before comparing an answer. Often the same list as `normalize`. */
  readonly compare: readonly NormalizeStep[];
};

export type PackData = {
  /**
   * Words ordered by frequency, most common first, separated by single spaces.
   *
   * A string rather than `{ "de": 1, "la": 2 }` because the POSITION is the rank, so no numbers are
   * stored at all. For 20k words that is roughly 180 KB instead of about 1.5 MB — and on Hermes the
   * object version is a multi-megabyte `JSON.parse` on the main thread before the first frame,
   * doubled if two languages are loaded.
   */
  readonly frequency: string;

  /** Optional surface → canonical map, for languages where affix rules are not enough. */
  readonly lemmas?: Readonly<Record<string, string>>;
};
