import { describe, expect, it } from 'vitest';

import { unitKey, variety, type Day, type UnitKey } from '../model/ids.js';
import { arabicPack, fixtures, frenchPack, germanPack } from '../testing/packs.js';

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

  it('indexes the frequency list by its NORMALIZED form, not the raw string', () => {
    // Was: `buildRanks` keyed the map on the raw word from the frequency string, while every lookup
    // against it passes a normalized form — `rank()` and, worse, the `onlyIfRemainderKnown` guard
    // inside `stripPrefixes`. The two sides disagreed for every word a normalize step touches.
    //
    // The Arabic case is the one that matters, because `normalizeArabicFinals` maps ة → ه and the
    // fixture list is written with ة. So the guard asked for `مدينه` in a map holding `مدينة`,
    // refused to strip the article, and filed ONE WORD UNDER TWO UNIT KEYS.

    // The bug, stated directly: an article-bearing form and its bare form are the same knowledge.
    expect(arabicPack.key('المدينة')).toBe(arabicPack.key('مدينة'));
    expect(arabicPack.key('المدرسة')).toBe(arabicPack.key('مدرسة'));
    expect(arabicPack.key('الحكومة')).toBe(arabicPack.key('حكومة'));

    // And its visible symptom: a word in the pack's own frequency list was unrankable once keyed.
    // Seven of the 34 Arabic fixture words were, along with French `est`.
    for (const word of ['على', 'أن', 'إلى', 'مدرسة', 'جريدة', 'حكومة', 'مدينة']) {
      expect(arabicPack.rank(arabicPack.key(word)), word).toBeDefined();
    }

    // A word already in its normalized form was never affected, which is why this hid so well —
    // `سوق` has nothing for a normalize step to change, so the common case looked healthy.
    expect(arabicPack.key('السوق')).toBe('سوق');

    // French: `marché` and `marche` are one lexical entry after folding, and the earlier (commoner)
    // position is the rank kept for it. The later duplicate must not overwrite it.
    expect(frenchPack.rank('marche')).toBe(frenchPack.rank(frenchPack.key('marché')));

    // ⚠️ `est` is STILL unrankable, and that is correct rather than a leftover: the lemma table maps
    // it to `etre`, which the fixture's frequency list does not contain. That is a data gap in the
    // pack, not a defect in the index — the kind of thing `checkPack` exists to report.
    expect(frenchPack.key('est')).toBe('etre');
    expect(frenchPack.rank('etre')).toBeUndefined();
  });

  it('keeps German umlaut pairs apart — they are different words', () => {
    // Was: German used `foldLatinDiacritics`, whose table maps ä→a, ö→o, ü→u. Every pair below
    // collapsed to ONE key, so a learner who proved `zahlen` (to pay) was credited with `zählen`
    // (to count) and the engine would then never teach them the other one.
    //
    // The fix is a separate `foldGermanUmlauts` step — ä→ae, ö→oe, ü→ue — which is also what German
    // itself does when umlauts are unavailable. `pack.ts` already argues a generic `stripDiacritics`
    // is a lie because Arabic and Latin differ; this is the same mistake one level down, where
    // French and German share a SCRIPT and want opposite answers.
    const pairs: readonly (readonly [string, string])[] = [
      ['schön', 'schon'], // beautiful / already
      ['zählen', 'zahlen'], // to count / to pay
      ['fördern', 'fordern'], // to promote / to demand
      ['drücken', 'drucken'], // to press / to print
      ['schwül', 'schwul'], // humid / gay
      ['Bär', 'Bar'], // bear / bar
      ['wählen', 'Wahlen'], // to choose / elections
    ];
    for (const [umlaut, plain] of pairs) {
      expect(germanPack.key(umlaut), `${umlaut} vs ${plain}`).not.toBe(germanPack.key(plain));
    }

    // And the two-letter forms are the ones German actually uses.
    expect(germanPack.key('schön')).toBe('schoen');
    expect(germanPack.key('über')).toBe('ueber');
    expect(germanPack.key('Straße')).toBe('strasse');

    // French is unaffected: `é→e` is correct there, and `café` really is `cafe`.
    expect(frenchPack.key('marché')).toBe(frenchPack.key('marche'));
  });

  it('grades German case and ß the way a German reader would', () => {
    // ALL-CAPS German writes ß as SS, so these must be the same answer.
    expect(germanPack.compare('STRASSE', 'Straße')).toBe(1);
    expect(germanPack.compare('grosse', 'große')).toBe(1);
    // …but an umlaut dropped entirely is a different word, not a typo to forgive.
    expect(germanPack.compare('schon', 'schön')).toBe(0);
  });

  it('refuses a German ge- strip whose remainder is not a word', () => {
    // The `onlyIfRemainderKnown` guard, in a second language. `gesehen` → `sehen` is right;
    // `Geld` → `ld` and `gehen` → `hen` are not words and must be refused.
    expect(germanPack.key('gesehen')).toBe('sehen');
    expect(germanPack.key('gelesen')).toBe('lesen');
    expect(germanPack.key('Geld')).toBe('geld');
    expect(germanPack.key('gehen')).toBe('gehen');
    expect(germanPack.key('gerade')).toBe('gerade');
  });

  it('indexes the LEMMA table by its normalized form too, not just the frequency list', () => {
    // Was: `buildRanks` was fixed to normalize, and the lemma map was left raw — so the same defect
    // survived in the other half of `key()`. A pack author writing the natural `"läuft": "laufen"`
    // got `key('läuft') === 'laeuft'`: the lookup passes an already-normalized surface, so a raw
    // key can never match. The inflected form and the infinitive became two separate units, and
    // proving one never credited the other.
    expect(germanPack.key('läuft')).toBe('laufen');
    expect(germanPack.key('fährt')).toBe('fahren');
    expect(germanPack.key('trägt')).toBe('tragen');

    // The VALUE is normalized as well, which is the half that is easy to miss: a lemma target
    // containing an umlaut would otherwise be a second address for the same word.
    expect(germanPack.key('zählt')).toBe('zaehlen');
    expect(germanPack.key('zählen')).toBe('zaehlen');
    expect(germanPack.key('zählt')).toBe(germanPack.key('zählen'));

    // …and still distinct from the word it is NOT.
    expect(germanPack.key('zahlt')).toBe('zahlen');
    expect(germanPack.key('zählt')).not.toBe(germanPack.key('zahlt'));
  });
});
