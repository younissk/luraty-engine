import { describe, expect, it } from 'vitest';

import type { AffixConfig, NormalizeStep, PackConfig } from '../../src/model/index.js';
import { fixtures, frenchPack } from '../../src/testing/packs.js';

import { createPack } from '../../src/core/pack.js';

/**
 * The edges of pack construction.
 *
 * A mutation audit left `pack.ts` at 55% — the weakest file in the package. The survivors were not
 * exotic: unasserted error messages, the no-affixes path, prefix ordering, and the length cap.
 * Every one is a line that runs in production the first time somebody writes a pack by hand.
 *
 * Error messages get asserted here rather than just error-ness. A `fail('')` mutant surviving means
 * the message is never read by anything — and a pack author staring at an empty error is exactly
 * who this validation exists for.
 *
 * @module
 */

const build = (over: Partial<PackConfig>) =>
  createPack({ ...fixtures.frenchConfig, ...over }, fixtures.frenchData);

describe('validation messages say what is wrong', () => {
  it('names a missing id', () => {
    const r = build({ id: '' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe('malformed');
      expect(r.error.message).toMatch(/id/i);
    }
  });

  it('names an over-long pattern, and says nothing about a normal one', () => {
    const long = `[${'a-z'.repeat(100)}]+`;
    expect(long.length).toBeGreaterThan(200);
    const r = build({ tokenize: { strategy: 'regex', pattern: long } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/long/i);
  });

  it('quotes the offending pattern back, so a pack author can see it', () => {
    const r = build({ tokenize: { strategy: 'regex', pattern: 'a+' } });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.message).toContain('a+');
      expect(r.error.message).toContain('[a-z]+'); // and shows a correct example
    }
  });

  it('names an unparseable character class', () => {
    // Passes the shape check but is not a valid expression — an unterminated escape.
    const r = build({ tokenize: { strategy: 'regex', pattern: '[\\u{ZZZZ}]+' } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message.length).toBeGreaterThan(10);
  });
});

// ── The step lists are checked, not trusted ────────────────────────────────────────────────────
// Regression. `createPack` promises a `Decoded` rather than a throw, because a config is a JSON
// file a human wrote. Neither step list was checked, so an unrecognised name fell through to
// `applyStep`'s exhaustive switch and came back out as `assertNever`'s exception.
describe('normalize and compare steps', () => {
  it('rejects an unknown normalize step instead of throwing', () => {
    // `stripDiacritics` is the name this engine deliberately does NOT have — Arabic and Latin
    // diacritics have nothing in common mechanically — and therefore the one an author is most
    // likely to guess. It used to throw from inside `createPack`.
    const r = build({ normalize: ['stripDiacritics' as NormalizeStep] });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe('malformed');
      expect(r.error.message).toContain('stripDiacritics');
      // The message has to name the alternatives, or a pack author has nowhere to go from here.
      expect(r.error.message).toContain('foldLatinDiacritics');
    }
  });

  it('rejects an unknown compare step AT BUILD TIME, not mid-session', () => {
    // The worse half. Nothing at build time touched the compare list, so this pack used to build
    // clean, report healthy, and throw from `compare()` — when a learner submitted an answer.
    const r = build({ compare: ['normalizeAlef' as NormalizeStep] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toContain('normalizeAlef');
  });

  it('rejects a step list that is not a list', () => {
    // A plain string is what a hand-written JSON file holds when someone forgets the brackets. It
    // used to iterate character by character and complain about a step named "l".
    const r = build({ normalize: 'lowercase' as unknown as NormalizeStep[] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toContain('normalize');
  });

  it('rejects a name that is only reachable through the prototype chain', () => {
    // `'constructor' in STEPS` is true for a plain object. This package has been bitten by that
    // chain once already, in the lemma table.
    for (const name of ['constructor', 'toString', '__proto__', 'valueOf']) {
      const r = build({ normalize: [name as NormalizeStep] });
      expect(r.ok, name).toBe(false);
    }
  });

  it('accepts every step the engine actually implements', () => {
    // The other half of the law: the check must not be so strict that a real pack stops building.
    // Applying all eight to one config is nonsense linguistically and fine mechanically.
    const all: NormalizeStep[] = [
      'lowercase',
      'stripPunctuation',
      'stripArabicDiacritics',
      'stripTatweel',
      'normalizeArabicAlef',
      'normalizeArabicFinals',
      'foldLatinDiacritics',
      'foldGermanUmlauts',
    ];
    expect(build({ normalize: all, compare: all }).ok).toBe(true);
  });
});

describe('affixes', () => {
  it('works with no affix config at all', () => {
    const r = build({});
    // The key is OMITTED rather than set to undefined — `exactOptionalPropertyTypes` distinguishes
    // "absent" from "present and undefined", and absent is what a pack file without an affixes
    // block actually produces.
    const { affixes: _omitted, ...withoutAffixes } = fixtures.frenchConfig;
    void _omitted;
    const noAffixes = createPack(withoutAffixes, fixtures.frenchData);
    expect(r.ok).toBe(true);
    expect(noAffixes.ok).toBe(true);
    if (noAffixes.ok) {
      // Nothing is stripped, so the elision stays attached rather than crashing.
      expect(noAffixes.value.key("l'automne")).toBe("l'automne");
    }
  });

  it('tries the longest prefix first', () => {
    // With ['ال', 'ا'] unsorted, 'ا' could match first and strip one character off السوق, leaving
    // لسوق — a word that does not exist. Longest-first is what makes the more specific rule win.
    const pack = createPack(
      {
        ...fixtures.frenchConfig,
        tokenize: { strategy: 'regex', pattern: '[a-z]+' },
        normalize: ['lowercase'],
        affixes: { prefixes: ['a', 'ab'], onlyIfRemainderKnown: true },
        compare: ['lowercase'],
      },
      { frequency: 'cd bcd' },
    );
    expect(pack.ok).toBe(true);
    // 'abcd': the longer prefix 'ab' wins, leaving 'cd'. Had 'a' been tried first it would leave
    // 'bcd', which is also in the list — so an unsorted list gives a different, wrong answer.
    if (pack.ok) expect(pack.value.key('abcd')).toBe('cd');
  });

  it('defaults onlyIfRemainderKnown to the safe setting when omitted', () => {
    // Omitting it must not silently disable the guard that stops ولد becoming لد.
    const pack = createPack(
      {
        ...fixtures.frenchConfig,
        affixes: { prefixes: ["d'"] } as unknown as AffixConfig,
      },
      fixtures.frenchData,
    );
    expect(pack.ok).toBe(true);
    if (pack.ok) expect(pack.value.key("d'zzz")).toBe("d'zzz");
  });

  it('never strips a prefix that is the entire word', () => {
    // Otherwise the word keys to the empty string and every such word collapses into one unit.
    const pack = createPack(
      {
        ...fixtures.frenchConfig,
        tokenize: { strategy: 'regex', pattern: '[a-z]+' },
        normalize: ['lowercase'],
        affixes: { prefixes: ['de'], onlyIfRemainderKnown: false },
        compare: ['lowercase'],
      },
      { frequency: 'de la' },
    );
    expect(pack.ok).toBe(true);
    if (pack.ok) expect(pack.value.key('de')).toBe('de');
  });
});

describe('frequency data', () => {
  it('gives rank 1 to the first word', () => {
    expect(frenchPack.rank('de')).toBe(1);
  });

  it('keeps the first occurrence when a word repeats', () => {
    // A later duplicate is rarer by definition; overwriting would make the common entry vanish.
    const pack = createPack(fixtures.frenchConfig, { frequency: 'a b a' });
    expect(pack.ok).toBe(true);
    if (pack.ok) expect(pack.value.rank('a')).toBe(1);
  });

  it('ignores runs of whitespace rather than counting them as words', () => {
    const pack = createPack(fixtures.frenchConfig, { frequency: '  a \n\n b  \t c ' });
    expect(pack.ok).toBe(true);
    if (pack.ok) {
      expect(pack.value.rank('a')).toBe(1);
      expect(pack.value.rank('b')).toBe(2);
      expect(pack.value.rank('c')).toBe(3);
    }
  });
});

describe('compare', () => {
  it('ignores surrounding whitespace', () => {
    // A learner's keyboard adds a trailing space constantly. Without the trim this marks them wrong.
    expect(frenchPack.compare('  marche  ', 'marche')).toBe(1);
    expect(frenchPack.compare('marche', '  marche  ')).toBe(1);
    expect(frenchPack.compare('\tmarche\n', 'marche')).toBe(1);
  });

  it('does not ignore whitespace inside an answer', () => {
    expect(frenchPack.compare('mar che', 'marche')).toBe(0);
  });
});

describe('split', () => {
  it('returns nothing for text with no matching characters', () => {
    expect(frenchPack.split('123 456')).toEqual([]);
    expect(frenchPack.split('')).toEqual([]);
  });

  it('is unaffected by how many times it has been called', () => {
    // A `g`-flagged regex carries lastIndex between calls. Without the reset, the second call skips
    // the start of the string — a bug that only ever appears on the second call.
    const text = 'je vais au marche';
    const first = frenchPack.split(text);
    const second = frenchPack.split(text);
    const third = frenchPack.split(text);
    expect(second).toEqual(first);
    expect(third).toEqual(first);
    expect(first).toHaveLength(4);
  });
});
