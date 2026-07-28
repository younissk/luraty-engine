import { describe, expect, it } from 'vitest';

import { unitKey, variety, type Day, type UnitKey } from '../model/ids.js';
import { arabicPack, fixtures, frenchPack } from '../testing/packs.js';

import { createPack } from './pack.js';
import { createProfile, unitState } from './profile.js';
import { record } from './record.js';

/**
 * One named test per bug that actually shipped, so none of them can come back quietly.
 *
 * Every entry here was live in the package at some point and caught nothing — the suite was green
 * for all of them. They are collected in one file rather than scattered because the common thread
 * matters more than the individual bugs: each one produced a WORKING system that taught the wrong
 * thing. Nothing crashed. Nothing was reported.
 *
 * @module
 */

const AR = variety('ar-msa')!;
const D = (n: number): Day => n as Day;

describe('regressions', () => {
  it('compare() rejects an answer key that normalizes to nothing', () => {
    // Was: both sides normalized to empty and the function returned 1, so `compare('!!!','?')`
    // was a correct answer. One punctuation-only key in a content batch marks every learner
    // correct on that item forever — and nobody reports being told they are right.
    expect(frenchPack.compare('!!!', '?')).toBe(0);
    expect(frenchPack.compare('', '...')).toBe(0);
    expect(frenchPack.compare('', '')).toBe(0);
    expect(arabicPack.compare('؟؟', '،')).toBe(0);

    // And real answers still grade correctly.
    expect(frenchPack.compare('marché', 'MARCHE')).toBe(1);
    expect(arabicPack.compare('سُوق', 'سوق')).toBe(1);
  });

  it('grades trailing punctuation identically in every pack', () => {
    // Was: the Arabic compare list omitted `stripPunctuation` while French included it, so French
    // accepted "marche." and Arabic rejected "سوق.". A missing normalize step in a pack config is
    // invisible unless packs are compared against the same class of input.
    const cases: [given: string, expected: string][] = [
      ['marche.', 'marche'],
      ['marche ', 'marche'],
      ['MARCHE', 'marche'],
    ];
    for (const [given, expected] of cases) {
      expect(frenchPack.compare(given, expected), `french: ${given}`).toBe(1);
    }
    expect(arabicPack.compare('سوق.', 'سوق')).toBe(1);
    expect(arabicPack.compare('سوق ', 'سوق')).toBe(1);
  });

  it('parses a frequency list separated by newlines, not just spaces', () => {
    // Was: split(' ') only, so a one-word-per-line list became a single giant "word". rank()
    // returned undefined for everything and affix stripping stopped dead, because it consults the
    // same table. The pack built fine and reported healthy.
    //
    // Leipzig, OpenSubtitles and wordfreq — the three sources this project's own guide recommends
    // — are all one word per line, so the first real pack would have hit this.
    const newlines = createPack(fixtures.frenchConfig, {
      ...fixtures.frenchData,
      frequency: fixtures.frenchData.frequency.split(' ').join('\n'),
    });
    expect(newlines.ok).toBe(true);
    if (!newlines.ok) return;
    expect(newlines.value.rank('de')).toBe(1);
    expect(newlines.value.key("l'automne")).toBe('automne');
  });

  it('refuses a tokenize pattern that can backtrack catastrophically', () => {
    // Was: only a 200-character length cap, with a comment claiming it prevented catastrophic
    // backtracking. It did not — `(a+)+b` is six characters and took 790ms to fail on a
    // 27-character string, which on a phone is a frozen app on the first sentence read.
    for (const evil of ['(a+)+b', '(a|a)*$', '^(a+)+$']) {
      const result = createPack(
        { ...fixtures.frenchConfig, tokenize: { strategy: 'regex', pattern: evil } },
        fixtures.frenchData,
      );
      expect(result.ok, `should reject ${evil}`).toBe(false);
    }

    // Real tokenizer patterns still work — the guard is a shape rule, not a blanket ban.
    for (const good of ['[a-z]+', '[\\u0600-\\u06FF]+', "[a-zA-Zà-öø-ÿ']+"]) {
      const result = createPack(
        { ...fixtures.frenchConfig, tokenize: { strategy: 'regex', pattern: good } },
        fixtures.frenchData,
      );
      expect(result.ok, `should accept ${good}`).toBe(true);
    }
  });

  it('never rewinds lastSeen or confirmedOn when evidence arrives out of order', () => {
    // Was: `lastSeen = evidence.day` unconditionally, so a host syncing an offline queue could
    // replay a day-3 item after day 40 and a unit proven yesterday would report itself last proven
    // 37 days ago. Invisible until something does interval arithmetic on these fields, at which
    // point it looks like a scheduling bug from a commit months earlier.
    const k: UnitKey = unitKey('recognise', AR, 'سوق');
    let p = createProfile('ar', D(0));
    p = record(p, [
      { unit: k, outcome: 'known', tested: true, day: D(39) },
      { unit: k, outcome: 'known', tested: true, day: D(40) },
    ]);
    const before = unitState(p, k);
    expect(before).toMatchObject({ box: 'understood', lastSeen: 40, confirmedOn: 40 });

    p = record(p, [{ unit: k, outcome: 'known', tested: true, day: D(3) }]);
    const after = unitState(p, k);
    expect(after.lastSeen).toBe(40);
    expect(after.seen).toBe(3); // the encounter still counts
    if (after.box === 'understood') expect(after.confirmedOn).toBe(40);
  });

  it('keys words that collide with Object.prototype', () => {
    // Was: the lemma table was the plain object it arrives as, so `lemmas['constructor']` returned
    // Object.prototype.constructor — a FUNCTION — from a method typed to return a string. Found by
    // property testing in seconds; no example test would have thought to try the word.
    for (const word of ['constructor', 'toString', 'valueOf', '__proto__', 'hasOwnProperty']) {
      expect(typeof frenchPack.key(word)).toBe('string');
      expect(typeof arabicPack.key(word)).toBe('string');
    }
  });

  it('strips a French elision rather than baking it into the key', () => {
    // Was: `stripPunctuation` removed the apostrophe before affix stripping ran, so `l'automne`
    // normalized to `lautomne`, the `l'` prefix stopped matching, and French words filed themselves
    // under the wrong lemma. Nothing errored.
    expect(frenchPack.key("l'automne")).toBe('automne');
    expect(frenchPack.key("L'AUTOMNE")).toBe('automne');
  });
});
