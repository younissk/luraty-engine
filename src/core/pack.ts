import { applySteps } from '../internal/text.js';
import type { LanguagePack, Lemma, NormalizeStep, PackConfig, PackData } from '../model/pack.js';
import type { Decoded } from '../model/wire.js';

/**
 * Building a language pack from configuration and data.
 *
 * This is the answer to "can a language be added without writing code?". Yes: a pack is a JSON
 * config naming which transformations to apply, plus two data files. The engine owns the
 * transformations; the pack owns the choices.
 *
 * A language that genuinely needs something new — Chinese and Japanese have no spaces and need
 * dictionary segmentation — means adding one strategy here, once, after which it is available to
 * every language.
 *
 * @module
 */

const MAX_PATTERN_LENGTH = 200;

/**
 * A single character class followed by `+`, and nothing else.
 *
 * The class body accepts escapes (`\\u0600`, `\\]`) and any character that is not an unescaped
 * `]`. A character class cannot backtrack catastrophically — there is no nesting and no
 * alternation to explore — so this shape is safe by construction rather than by inspection.
 */
const CHARACTER_CLASS_PATTERN = /^\[(?:\\.|[^\]\\])+\]\+$/;

function fail(message: string): Decoded<never> {
  return { ok: false, error: { kind: 'malformed', message } };
}

/**
 * Parse the frequency list into a rank lookup, **keyed by the normalized form**.
 *
 * Built once when the pack is created, not on every call. The data arrives as a rank-ordered string
 * because the position IS the rank — see {@link PackData.frequency} for why that matters on a
 * phone.
 *
 * The Map doubles as the pack's lexicon: "is this a word at all?" is `has()`, which is what makes
 * safe affix stripping possible without a morphological analyser.
 *
 * ⚠️ NORMALIZED, and that is a correctness fix rather than tidying.
 *
 * This map used to be indexed by the RAW word from the frequency string, while every lookup against
 * it — `rank()` and, crucially, the `onlyIfRemainderKnown` guard in `stripPrefixes` — passes a
 * NORMALIZED form. So the two sides disagreed for every word any normalize step touches.
 *
 * Measured on this repo's own fixtures, before the fix:
 *
 * - `key('المدينة')` returned `المدينه` — the article `ال` was NOT stripped, because the guard
 *   looked up `مدينه` (finals normalized) in a map holding `مدينة`. Meanwhile `key('مدينة')`
 *   returned `مدينه`. **One word, two unit keys.** A learner who proves `مدينة` gets no credit for
 *   `المدينة`, forever, and the engine reports it as their gap.
 * - `rank(key(w))` was `undefined` for **7 of the 34** Arabic fixture words and for French `est`
 *   (the 12th commonest word in its own list).
 *
 * Nothing errored. The pack built, tokenized and graded; it just quietly filed the article-bearing
 * and bare forms of a word apart, which is systematic pessimism that reads as the learner's fault.
 * It is exactly the shape of the wrong-separator bug below — a pack that works, quietly, and
 * teaches nobody anything.
 *
 * The rank NUMBER still comes from the position in the raw list, so normalization cannot renumber
 * anything: two entries that collapse to one form keep the earlier one's rank, and every later
 * word keeps the position it had.
 */
function buildRanks(frequency: string, normalize: readonly NormalizeStep[]): Map<string, number> {
  const ranks = new Map<string, number>();
  let rank = 0;
  // ⚠️ ANY whitespace, not just a space. Splitting on ' ' alone meant a newline-separated list
  // produced exactly one giant "word" — so `rank()` returned undefined for everything, and affix
  // stripping stopped dead, because `onlyIfRemainderKnown` consults this same map and every lookup
  // missed. The pack reported healthy the whole time.
  //
  // This is not a hypothetical format: Leipzig, OpenSubtitles and wordfreq — the three sources this
  // project's own guide recommends — are all one word per line. The first real pack anyone builds
  // would have hit it.
  for (const word of frequency.split(/\s+/)) {
    if (word.length === 0) continue;
    // Incremented BEFORE the normalization check, because the rank is the position in the list the
    // pack author wrote. A word that normalizes away still occupied a slot.
    rank += 1;
    const normalized = applySteps(normalize, word);
    // A frequency entry that normalizes to nothing (a lone tatweel, a stray diacritic) is not a
    // word. Keeping it would put the empty string in the lexicon, and `stripPrefixes` would then
    // accept any prefix whose remainder normalizes away.
    if (normalized.length === 0) continue;
    // First occurrence wins: a duplicate later in the list is rarer by definition, and silently
    // overwriting would make the more common entry disappear. After normalization this also covers
    // pairs that collapse — French `marche` and `marché` are one lexical entry, and the earlier
    // (commoner) position is the honest rank for it.
    if (!ranks.has(normalized)) ranks.set(normalized, rank);
  }
  return ranks;
}

/**
 * Build a {@link LanguagePack}.
 *
 * Returns a {@link Decoded} rather than throwing, because config is untrusted input: it comes from
 * a JSON file that a human wrote, possibly for a different version of this engine.
 */
export function createPack(config: PackConfig, data: PackData): Decoded<LanguagePack> {
  if (config.id.length === 0) return fail('pack has no id');

  // Widened to `string` on purpose. The type says this can only be 'regex', but the value came out
  // of a JSON file that a human wrote — possibly against a different version of this engine — so
  // the type is a claim about intent, not about what is actually in memory. Checking a
  // "impossible" case is the whole job at a trust boundary.
  const strategy: string = config.tokenize.strategy;
  if (strategy !== 'regex') {
    return fail(`unknown tokenize strategy "${strategy}"`);
  }
  if (config.tokenize.pattern.length > MAX_PATTERN_LENGTH) {
    return fail('tokenize pattern is suspiciously long');
  }

  // ⚠️ THE SHAPE IS ENFORCED, not just the length.
  //
  // This guard used to be the length cap alone, with a comment claiming it stopped a pack file
  // smuggling in catastrophic backtracking. That claim was simply false: `(a+)+b` is six
  // characters, sailed through, and took 790 MILLISECONDS to fail on a 27-character string. On a
  // phone that is a frozen app on the first sentence a learner reads, and it scales exponentially.
  //
  // So the pattern must be exactly a character class with a `+`: `[...]+`. That is not a
  // restriction in practice — it is what every real tokenizer pattern already looks like
  // (`[a-z]+`, `[؀-ۿ]+`, `[a-zA-Zà-öø-ÿ']+`) — and it makes runaway backtracking
  // impossible by construction rather than by hoping nobody writes a nested quantifier. It also
  // makes the code match what `TokenizeConfig.pattern` always claimed to be: "not a full regex".
  if (!CHARACTER_CLASS_PATTERN.test(config.tokenize.pattern)) {
    return fail(
      `tokenize pattern must be a single character class followed by "+", such as "[a-z]+" — got "${config.tokenize.pattern}"`,
    );
  }

  let tokenizer: RegExp;
  try {
    // Compiled once, here, so a broken pattern is a pack-loading error rather than a crash on the
    // first sentence a learner reads.
    tokenizer = new RegExp(config.tokenize.pattern, 'gu');
  } catch {
    return fail(`tokenize pattern is not a valid expression: ${config.tokenize.pattern}`);
  }

  const ranks = buildRanks(data.frequency, config.normalize);

  // A Map, not the plain object it arrives as — and this is a correctness fix, not a preference.
  //
  // Property testing found it in seconds: `lemmas['constructor']` on a plain object returns
  // `Object.prototype.constructor`, which is a FUNCTION. So `key('constructor')` returned a
  // function where every caller expects a string, and `key('toString')`, `key('__proto__')` and
  // `key('valueOf')` are all the same bug. Real text contains these words.
  //
  // A Map has no prototype chain to fall through, which removes the whole class rather than
  // patching the instances of it.
  //
  // ⚠️ BOTH SIDES NORMALIZED, for exactly the reason `buildRanks` normalizes — this is the same
  // defect, and fixing it there only fixed half of it.
  //
  // `key()` looks this table up with an already-normalized surface form, so a raw key can never
  // match. Found with real German: a pack author writes the natural `"läuft": "laufen"`, and
  // `key('läuft')` normalizes to `laeuft`, misses the table entirely, and returns `laeuft` — so the
  // inflected form and the infinitive become two separate units and proving one never credits the
  // other.
  //
  // The VALUE is normalized too, and that matters just as much: leaving it raw would make
  // `key('läuft')` return `laufen` while `key('läufst')` … also returns `laufen`, but
  // `key('laufen')` returns `laufen` — fine here, yet the moment a lemma target itself contains an
  // umlaut (`"zählt": "zählen"`) the raw value `zählen` and the normalized `zaehlen` are two
  // different addresses for one word. Normalizing both ends means a pack file can be written in
  // ordinary German and still address knowledge consistently.
  const lemmas = new Map<string, Lemma>();
  for (const [surface, lemma] of Object.entries(data.lemmas ?? {})) {
    const from = applySteps(config.normalize, surface);
    const to = applySteps(config.normalize, lemma);
    if (from.length === 0 || to.length === 0) continue;
    // First entry wins, matching `buildRanks` — a duplicate later in the file is the author's
    // second thought, and silently overwriting makes the first one vanish without a word.
    if (!lemmas.has(from)) lemmas.set(from, to);
  }

  // Longest prefix first, so ال is tried before ا and the more specific rule wins.
  const prefixes = [...(config.affixes?.prefixes ?? [])].sort((a, b) => b.length - a.length);
  const onlyIfRemainderKnown = config.affixes?.onlyIfRemainderKnown ?? true;

  function stripPrefixes(word: string): string {
    for (const prefix of prefixes) {
      if (!word.startsWith(prefix)) continue;
      const remainder = word.slice(prefix.length);
      if (remainder.length === 0) continue;
      // The guard that makes this safe without a morphological analyser. Arabic و ("and") is a real
      // prefix, so ولد would strip to لد, which is not a word. Checking the remainder against the
      // frequency list — which is already loaded — refuses the strip unless the result is something
      // the language actually contains.
      if (onlyIfRemainderKnown && !ranks.has(remainder)) continue;
      return remainder;
    }
    return word;
  }

  function key(surface: string): Lemma {
    const normalized = applySteps(config.normalize, surface);
    // An explicit lemma entry beats a derived one: irregular forms are exactly the ones affix rules
    // get wrong, and they are why the map exists.
    const mapped = lemmas.get(normalized);
    if (mapped !== undefined) return mapped;
    return stripPrefixes(normalized);
  }

  const pack: LanguagePack = {
    id: config.id,

    split(text: string): readonly string[] {
      // A fresh lastIndex every call: a shared global regex is stateful, and reusing one across
      // calls makes results depend on call order — the exact class of bug this engine is built to
      // not have.
      tokenizer.lastIndex = 0;
      return text.match(tokenizer) ?? [];
    },

    key,

    rank(lemma: Lemma): number | undefined {
      return ranks.get(lemma);
    },

    compare(given: string, expected: string): number {
      const a = applySteps(config.compare, given).trim();
      const b = applySteps(config.compare, expected).trim();

      // ⚠️ An expected answer that normalizes to nothing scores ZERO, always — including when the
      // learner also submitted nothing.
      //
      // This used to return 1 when both sides came out empty, which meant `compare('!!!', '?')`
      // was a correct answer: both normalize away to nothing, and nothing equals nothing. One
      // punctuation-only answer key in a content batch would mark every learner correct on that
      // item forever, and it would never be reported — nobody complains about being told they are
      // right.
      //
      // An unanswerable key is a content bug, so the honest score is 0 and `checkPack` flags the
      // data. Awarding credit for it would be the engine covering up for its own content.
      if (b.length === 0) return 0;

      return a === b ? 1 : 0;
    },
  };

  return { ok: true, value: pack };
}
