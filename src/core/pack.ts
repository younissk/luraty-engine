import { applySteps } from '../internal/text.js';
import type { LanguagePack, Lemma, PackConfig, PackData } from '../model/pack.js';
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

function fail(message: string): Decoded<never> {
  return { ok: false, error: { kind: 'malformed', message } };
}

/**
 * Parse the frequency list into a rank lookup.
 *
 * Built once when the pack is created, not on every call. The data arrives as a rank-ordered string
 * because the position IS the rank — see {@link PackData.frequency} for why that matters on a
 * phone.
 *
 * The Map doubles as the pack's lexicon: "is this a word at all?" is `has()`, which is what makes
 * safe affix stripping possible without a morphological analyser.
 */
function buildRanks(frequency: string): Map<string, number> {
  const ranks = new Map<string, number>();
  let rank = 0;
  for (const word of frequency.split(' ')) {
    if (word.length === 0) continue;
    rank += 1;
    // First occurrence wins: a duplicate later in the list is rarer by definition, and silently
    // overwriting would make the more common entry disappear.
    if (!ranks.has(word)) ranks.set(word, rank);
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

  let tokenizer: RegExp;
  try {
    // Compiled once, here, so a broken pattern is a pack-loading error rather than a crash on the
    // first sentence a learner reads.
    tokenizer = new RegExp(config.tokenize.pattern, 'gu');
  } catch {
    return fail(`tokenize pattern is not a valid expression: ${config.tokenize.pattern}`);
  }

  const ranks = buildRanks(data.frequency);

  // A Map, not the plain object it arrives as — and this is a correctness fix, not a preference.
  //
  // Property testing found it in seconds: `lemmas['constructor']` on a plain object returns
  // `Object.prototype.constructor`, which is a FUNCTION. So `key('constructor')` returned a
  // function where every caller expects a string, and `key('toString')`, `key('__proto__')` and
  // `key('valueOf')` are all the same bug. Real text contains these words.
  //
  // A Map has no prototype chain to fall through, which removes the whole class rather than
  // patching the instances of it.
  const lemmas = new Map(Object.entries(data.lemmas ?? {}));

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
      if (a.length === 0 && b.length === 0) return 1;
      return a === b ? 1 : 0;
    },
  };

  return { ok: true, value: pack };
}
