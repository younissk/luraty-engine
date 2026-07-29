import { describe, expect, it } from 'vitest';

import { COVERAGE_BAND, type Band, type Coverage } from '../model/coverage.js';
import { unitKey, variety, type Day, type Direction, type Variety } from '../model/ids.js';
import type { Evidence } from '../model/evidence.js';
import type { LanguagePack } from '../model/pack.js';
import type { Profile } from '../model/profile.js';
import { arabicPack, frenchPack } from '../testing/packs.js';

import { coverage } from './coverage.js';
import { createProfile } from './profile.js';
import { record } from './record.js';
import { KNOWN_AT_STRENGTH } from '../model/unit.js';

/**
 * Examples for {@link coverage}.
 *
 * @module
 */

const FR = variety('fr')!;
const AR = variety('ar-msa')!;
const D = (n: number): Day => n as Day;

/** A profile in which every listed word is `understood`, in one direction and variety. */
function knowing(
  pack: LanguagePack,
  v: Variety,
  direction: Direction,
  words: readonly string[],
  language = 'fr',
): Profile {
  const evidence: Evidence[] = [];
  for (const word of words) {
    const unit = unitKey(direction, v, pack.key(word));
    for (let i = 0; i < KNOWN_AT_STRENGTH; i++) {
      evidence.push({ kind: 'retrieval', unit, outcome: 'known', day: D(0) });
    }
  }
  return record(createProfile(language, D(0)), evidence);
}

/**
 * A French text with exactly `known` tokens the learner knows and `unknown` tokens they do not.
 *
 * `de` is the commonest word in the fixture list. `zzz` is not French, which is the point: it
 * tokenizes under the pack's own `[a-zA-Zà-öø-ÿ']+` pattern, keys to itself (no prefix matches, no
 * lemma entry), and nothing will ever promote it.
 */
function text(known: number, unknown: number): string {
  return [
    ...Array.from({ length: known }, () => 'de'),
    ...Array.from({ length: unknown }, () => 'zzz'),
  ].join(' ');
}

/** The profile used by every count-driven test below: knows `de`, has never met `zzz`. */
const knowsDe = knowing(frenchPack, FR, 'recognise', ['de']);

/** The band, or the `kind` when there is no band to report. */
function bandOf(known: number, unknown: number): Band | Coverage['kind'] {
  const result = coverage(knowsDe, frenchPack, {
    text: text(known, unknown),
    variety: FR,
    direction: 'recognise',
  });
  return result.kind === 'measured' ? result.band : result.kind;
}

describe('coverage', () => {
  // ── E1 ────────────────────────────────────────────────────────────────────────────────────────
  it('reports no-words rather than a band when there is nothing to measure', () => {
    // ⚠️ The bug this exists for: the integer band test is TRUE at zero tokens — `0 * 20 <= 0` and
    // `0 * 50 >= 0` — so a flat design reports an empty string as perfectly pitched material. Every
    // other test in this file has tokens, so nothing else in the suite can see it.
    const empty = coverage(knowsDe, frenchPack, { text: '', variety: FR, direction: 'recognise' });
    expect(empty).toEqual({ kind: 'no-words', unkeyableTokens: 0, ignoredTokens: 0 });

    // Punctuation and digits are not words under the pack's pattern.
    expect(
      coverage(knowsDe, frenchPack, { text: '12345 !!! ...', variety: FR, direction: 'recognise' }),
    ).toEqual({ kind: 'no-words', unkeyableTokens: 0, ignoredTokens: 0 });

    // The realistic case: text in a script this pack does not cover. `checkPack` reports the same
    // fact about a pack as `tokenizer-matches-nothing`.
    expect(
      coverage(knowsDe, arabicPack, {
        text: 'bonjour le monde',
        variety: AR,
        direction: 'recognise',
      }),
    ).toEqual({ kind: 'no-words', unkeyableTokens: 0, ignoredTokens: 0 });
  });

  // ── E2 ────────────────────────────────────────────────────────────────────────────────────────
  it('excludes a token that keys to nothing from the denominator, and counts it separately', () => {
    // A run of tatweel is ordinary Arabic typography. It tokenizes as one word under `[؀-ۿ]+` and
    // `stripTatweel` erases it, so `key()` returns ''. `unitKey(d, v, '')` mints an address
    // `parseUnitKey` rejects, so such a token can NEVER be known — counting it as unknown would
    // push a passage toward 'too-hard' over a decorative character.
    const passage = 'سوق كتاب ـــ مدرسة';
    expect(arabicPack.key('ـــ')).toBe('');

    const result = coverage(createProfile('ar', D(0)), arabicPack, {
      text: passage,
      variety: AR,
      direction: 'recognise',
    });

    expect(result.kind).toBe('too-short');
    if (result.kind !== 'too-short') return;

    expect(result.runningTokens).toBe(3);
    expect(result.unkeyableTokens).toBe(1);
    // The tatweel is in neither bucket.
    expect(result.knownTokens + result.unknownTokens).toBe(result.runningTokens);
    // And the second exact law: nothing the tokenizer produced is unaccounted for.
    expect(result.runningTokens + result.unkeyableTokens).toBe(arabicPack.split(passage).length);
  });

  it('reports no-words with a non-zero unkeyable count when everything keys away', () => {
    // `0` means the tokenizer matched nothing; `> 0` means it matched and nothing survived keying.
    // One field, two distinguishable diagnoses.
    expect(
      coverage(createProfile('ar', D(0)), arabicPack, {
        text: 'ـــ',
        variety: AR,
        direction: 'recognise',
      }),
    ).toEqual({ kind: 'no-words', unkeyableTokens: 1, ignoredTokens: 0 });
  });

  // ── E3 / E4 ───────────────────────────────────────────────────────────────────────────────────
  it('applies the length floor BEFORE the ratio, and unconditionally', () => {
    // A short text that the learner knows entirely is `too-short`, NOT `too-easy`. A wrong
    // implementation that tests the ratio first returns `too-easy` here and looks reasonable.
    expect(bandOf(11, 0)).toBe('too-short');

    // And a short text that is genuinely below 95% is still `too-short`, not `too-hard`.
    // 18/19 = 0.94737 — under the hard edge by any reading, and still not classifiable.
    expect(bandOf(18, 1)).toBe('too-short');

    // Even at 47% coverage. The floor is about the length, never about the answer.
    expect(bandOf(9, 10)).toBe('too-short');

    const result = coverage(knowsDe, frenchPack, {
      text: text(11, 0),
      variety: FR,
      direction: 'recognise',
    });
    expect(result.kind).toBe('too-short');
    if (result.kind !== 'too-short') return;
    expect(result.needsMoreTokens).toBe(COVERAGE_BAND.minTokens - 11);
    expect(result.unknownTokens).toBe(0);
  });

  // ── E5 ────────────────────────────────────────────────────────────────────────────────────────
  it('classifies the band at every boundary', () => {
    // A frozen table rather than a property, deliberately: a property test would re-encode the same
    // arithmetic and break identically. This is the only thing that pins the two CLOSED edges and
    // kills the `>` / `>=` mutants.
    //
    // `bandOf(known, unknown)`, so n = known + unknown.
    //
    //     args        n    u    coverage   expected
    expect(bandOf(18, 1)).toBe('too-short'); //  19   1   0.94737   below the floor, unclassifiable
    expect(bandOf(19, 1)).toBe('in-band'); //  20   1   0.95000   the CLOSED lower edge, and the
    //                                                            first (n, u) at which the band
    //                                                            has any point at all
    expect(bandOf(20, 1)).toBe('in-band'); //  21   1   0.95238
    expect(bandOf(38, 2)).toBe('in-band'); //  40   2   0.95000   the edge again, away from n=20
    expect(bandOf(37, 3)).toBe('too-hard'); //  40   3   0.92500
    expect(bandOf(49, 1)).toBe('in-band'); //  50   1   0.98000   the CLOSED upper edge
    expect(bandOf(50, 1)).toBe('too-easy'); //  51   1   0.98039   one token past it
    expect(bandOf(95, 5)).toBe('in-band'); // 100   5   0.95000
    expect(bandOf(94, 6)).toBe('too-hard'); // 100   6   0.94000
    expect(bandOf(98, 2)).toBe('in-band'); // 100   2   0.98000
    expect(bandOf(99, 1)).toBe('too-easy'); // 100   1   0.99000

    // Nothing unknown is TOO EASY, never in-band and never a special 'perfect' case. A text a
    // learner knows entirely teaches no vocabulary. This is the single most likely line for a
    // reviewer to file as a bug, so it is asserted rather than implied.
    expect(bandOf(100, 0)).toBe('too-easy');

    // Everything unknown is too-hard, with no special case.
    expect(bandOf(0, 100)).toBe('too-hard');
  });

  // ── E6 ────────────────────────────────────────────────────────────────────────────────────────
  it('never consults rank()', () => {
    // Rank is a property of the LANGUAGE; coverage is a claim about the LEARNER. Using rank as a
    // knowledge or is-this-a-real-word proxy is the tempting shortcut, and it is measurably wrong:
    // `rank(key(w))` is undefined for words a pack's own frequency list contains whenever a lemma
    // entry points somewhere the list does not go — French `est` maps to `etre`, which is not in
    // the list at all.
    //
    // A throwing pack turns the dependency from unlikely into impossible, and localizes the failure
    // if it ever returns.
    const throwingRank: LanguagePack = {
      ...frenchPack,
      split: (t) => frenchPack.split(t),
      key: (s) => frenchPack.key(s),
      rank: () => {
        throw new Error('rank() must never be called by coverage()');
      },
      compare: () => 0,
    };

    expect(() =>
      coverage(knowsDe, throwingRank, {
        text: text(20, 1),
        variety: FR,
        direction: 'recognise',
      }),
    ).not.toThrow();
  });

  // ── E7 ────────────────────────────────────────────────────────────────────────────────────────
  it('does not count exposure as knowledge', () => {
    const passage = text(0, 25); // 25 tokens of `zzz`, never met
    const query = { text: passage, variety: FR, direction: 'recognise' } as const;
    const fresh = createProfile('fr', D(0));

    const before = coverage(fresh, frenchPack, query);

    // Forty passive encounters. A heritage speaker often recognises a word's shape while holding
    // only its domestic sense, and will not ask what it means. If not-asking promoted, the register
    // gap this engine exists to find would be invisible by construction — in the very number
    // selection is steered by.
    const unit = unitKey('recognise', FR, frenchPack.key('zzz'));
    const passive: Evidence[] = Array.from({ length: 40 }, () => ({
      kind: 'exposure' as const,
      unit,
      day: D(1),
    }));
    const exposed = record(fresh, passive);

    expect(coverage(exposed, frenchPack, query)).toEqual(before);

    // The positive control, so this test cannot pass by measuring nothing: real retrievals DO move
    // it.
    const tested = record(
      exposed,
      Array.from({ length: KNOWN_AT_STRENGTH }, () => ({
        kind: 'retrieval' as const,
        unit,
        outcome: 'known' as const,
        day: D(2),
      })),
    );
    const after = coverage(tested, frenchPack, query);
    expect(after.kind).toBe('measured');
    if (after.kind !== 'measured') return;
    expect(after.unknownTokens).toBe(0);
    expect(after.knownTokens).toBe(25);
  });

  // ── E8 ────────────────────────────────────────────────────────────────────────────────────────
  it('measures one direction and never the other', () => {
    // The worst silent bug available here: a unit key built without the direction segment, or a
    // `direction` accepted and ignored. Every number stays plausible; it just measures a different
    // learner — and it collapses the recognition/production gap that defines this user.
    const reader = knowing(frenchPack, FR, 'recognise', ['de']);
    const passage = text(25, 0);

    const recognise = coverage(reader, frenchPack, {
      text: passage,
      variety: FR,
      direction: 'recognise',
    });
    expect(recognise.kind === 'measured' && recognise.knownTokens).toBe(25);

    const produce = coverage(reader, frenchPack, {
      text: passage,
      variety: FR,
      direction: 'produce',
    });
    expect(produce.kind).toBe('measured');
    if (produce.kind !== 'measured') return;
    expect(produce.knownTokens).toBe(0);
    expect(produce.unknownTokens).toBe(produce.runningTokens);
  });

  // ── E9 ────────────────────────────────────────────────────────────────────────────────────────
  it('measures one variety and never the other', () => {
    // Same shape as the direction test, a different key segment and a different invariant: a
    // diglossic learner's dialect and standard are related but separate systems, and merging them
    // is the category error the variety segment exists to prevent.
    const LEV = variety('ar-levantine')!;
    const msa = knowing(arabicPack, AR, 'recognise', ['سوق'], 'ar');
    const passage = Array.from({ length: 25 }, () => 'سوق').join(' ');

    const asMsa = coverage(msa, arabicPack, { text: passage, variety: AR, direction: 'recognise' });
    expect(asMsa.kind === 'measured' && asMsa.knownTokens).toBe(25);

    const asLevantine = coverage(msa, arabicPack, {
      text: passage,
      variety: LEV,
      direction: 'recognise',
    });
    expect(asLevantine.kind).toBe('measured');
    if (asLevantine.kind !== 'measured') return;
    expect(asLevantine.knownTokens).toBe(0);
  });

  it('reports a beginner as 0% known rather than raising an alarm', () => {
    // 0% is the correct answer for someone who has met nothing, and it is indistinguishable from a
    // variety that is absent from the profile. Asserted so nobody "fixes" it into a throw.
    const beginner = createProfile('fr', D(0));
    const result = coverage(beginner, frenchPack, {
      text: text(0, 30),
      variety: FR,
      direction: 'recognise',
    });
    expect(result.kind).toBe('measured');
    if (result.kind !== 'measured') return;
    expect(result.knownTokens).toBe(0);
    expect(result.band).toBe('too-hard');
  });

  // ── E10 ───────────────────────────────────────────────────────────────────────────────────────
  it('counts running tokens, not types', () => {
    // A Set-based implementation counting distinct words silently INFLATES coverage, and ordinary
    // example text cannot see it: both fixture frequency lists are all-unique words, so types and
    // tokens are identical for any sentence a test would naturally write.
    const result = coverage(knowsDe, frenchPack, {
      text: 'de de de la la',
      variety: FR,
      direction: 'recognise',
    });
    expect(result.kind).toBe('too-short');
    if (result.kind !== 'too-short') return;

    expect(result.runningTokens).toBe(5);
    expect(result.knownTokens).toBe(3);
    expect(result.unknownTokens).toBe(2);
    // …and the unknown LIST is de-duplicated. Two counts, two meanings, never interchangeable.
    expect(result.unknownLemmas).toEqual(['la']);
  });

  it('lists unknown lemmas once each, in first-appearance order', () => {
    const result = coverage(knowsDe, frenchPack, {
      text: 'pain de eau pain de eau maison',
      variety: FR,
      direction: 'recognise',
    });
    expect(result.kind).toBe('too-short');
    if (result.kind !== 'too-short') return;
    // Not sorted: sorting wants a comparator, the idiomatic one is `localeCompare`, and that is
    // ICU-backed and banned here. First-appearance order is free and identical on every runtime.
    expect(result.unknownLemmas).toEqual(['pain', 'eau', 'maison']);
  });

  it('credits two surfaces that key to the same lemma', () => {
    // `vais` and `allons` both key to `aller`. Proving one is proving the other — that is what a
    // canonical form is for — and the lemma appears once in the unknown list.
    const knowsAller = knowing(frenchPack, FR, 'recognise', ['vais']);
    const result = coverage(knowsAller, frenchPack, {
      text: 'vais allons vont',
      variety: FR,
      direction: 'recognise',
    });
    expect(result.kind).toBe('too-short');
    if (result.kind !== 'too-short') return;
    expect(result.knownTokens).toBe(3);
    expect(result.unknownLemmas).toEqual([]);
  });

  it('credits an Arabic word through its definite article', () => {
    // The pack fix this slice depends on: `المدينة` and `مدينة` are one piece of knowledge. Before
    // it they keyed apart, so a learner who proved the bare form read as not knowing the article
    // form — systematic pessimism that reads as the learner's fault.
    const knowsCity = knowing(arabicPack, AR, 'recognise', ['مدينة'], 'ar');
    const result = coverage(knowsCity, arabicPack, {
      text: 'المدينة مدينة',
      variety: AR,
      direction: 'recognise',
    });
    expect(result.kind).toBe('too-short');
    if (result.kind !== 'too-short') return;
    expect(result.knownTokens).toBe(2);
  });

  // ── Names and other not-vocabulary ────────────────────────────────────────────────────────────
  it('excludes caller-marked tokens from the denominator, not from existence', () => {
    // ⚠️ Measured motivation, not a hypothetical: on held-out German news, names and acronyms are
    // 66% of everything a 10,000-lemma pack does not know. Counting them makes the text read 89.6%
    // and excluding them makes the SAME text read 96.8% — the difference between "the band is
    // unreachable" and "the band is where we are".
    const passage = `${text(24, 0)} Toyota Senegal`;
    const query = { text: passage, variety: FR, direction: 'recognise' as const };

    const counted = coverage(knowsDe, frenchPack, query);
    expect(counted.kind).toBe('measured');
    if (counted.kind !== 'measured') return;
    expect(counted.runningTokens).toBe(26);
    expect(counted.unknownTokens).toBe(2);
    expect(counted.ignoredTokens).toBe(0);

    const ignored = coverage(knowsDe, frenchPack, { ...query, ignore: ['Toyota', 'Senegal'] });
    expect(ignored.kind).toBe('measured');
    if (ignored.kind !== 'measured') return;
    expect(ignored.runningTokens).toBe(24);
    expect(ignored.unknownTokens).toBe(0);
    expect(ignored.ignoredTokens).toBe(2);
    // The accounting law still closes, with a third bucket.
    expect(ignored.runningTokens + ignored.unkeyableTokens + ignored.ignoredTokens).toBe(
      frenchPack.split(passage).length,
    );
  });

  it('matches the RAW surface, so capitalisation still carries information', () => {
    // The caller found these by looking at capitalisation; `key()` lowercases, so matching on the
    // keyed form would make the whole mechanism unusable for the one signal it depends on.
    const passage = `${text(24, 0)} Marche marche`;
    const q = { text: passage, variety: FR, direction: 'recognise' as const };

    const result = coverage(knowsDe, frenchPack, { ...q, ignore: ['Marche'] });
    expect(result.kind).toBe('measured');
    if (result.kind !== 'measured') return;
    // Only the capitalised one was ignored; the lowercase one is still a running token.
    expect(result.ignoredTokens).toBe(1);
    expect(result.runningTokens).toBe(25);
  });

  it('does not let an ignore list turn a real text into no-words silently', () => {
    // Ignoring everything is a caller error, and the honest answer is the same one an empty string
    // gets — with `ignoredTokens` saying why, so the two are distinguishable.
    const result = coverage(knowsDe, frenchPack, {
      text: 'de de de',
      variety: FR,
      direction: 'recognise',
      ignore: ['de'],
    });
    expect(result).toEqual({ kind: 'no-words', unkeyableTokens: 0, ignoredTokens: 3 });
  });
});
