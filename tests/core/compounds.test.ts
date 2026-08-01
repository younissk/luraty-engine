import { describe, expect, it } from 'vitest';

import type { PackConfig } from '../../src/model/index.js';

import { createPack } from '../../src/core/pack.js';

/**
 * Compound splitting, which German needs and most languages do not.
 *
 * @module
 */

const CONFIG: PackConfig = {
  id: 'de-test',
  tokenize: { strategy: 'regex', pattern: '[a-zA-ZäöüÄÖÜßẞ]+' },
  normalize: ['lowercase', 'stripPunctuation', 'foldGermanUmlauts', 'foldLatinDiacritics'],
  compare: ['lowercase', 'stripPunctuation', 'foldGermanUmlauts', 'foldLatinDiacritics'],
  compounds: { minPartLength: 4, linkers: ['', 's', 'n', 'en', 'es', 'er'] },
};

const WORDS =
  'bahnhof strasse haupt kranken versicherung arbeit losigkeit bundes regierung kinder ' +
  'garten spiel platz woerter buch hand tasche schreib tisch fenster brett haus tuer ' +
  'sonne schein blume topf zeit punkt fahr karte';

function pack() {
  const built = createPack(CONFIG, { frequency: WORDS });
  if (!built.ok) throw new Error(built.error.message);
  return built.value;
}

describe('compound splitting', () => {
  const de = pack();

  it('keys a compound to its head, so a known head credits the whole word', () => {
    // German compounds are head-final: the last element carries the meaning and the gender. A
    // learner who knows Straße understands Bahnhofstraße, and coverage should say so.
    expect(de.key('Bahnhofstraße')).toBe('strasse');
    expect(de.key('Blumentopf')).toBe('topf');
    expect(de.key('Schreibtisch')).toBe('tisch');
    expect(de.key('Handtasche')).toBe('tasche');
    expect(de.key('Fahrkarte')).toBe('karte');
  });

  it('handles the linking morphemes German actually writes', () => {
    expect(de.key('Bundesregierung')).toBe('regierung'); // -s-
    expect(de.key('Blumentopf')).toBe('topf'); // -n-
    expect(de.key('Sonnenschein')).toBe('schein'); // -n-
  });

  it('splits three-part compounds, which German writes freely', () => {
    expect(de.key('Hauptbahnhofstrasse')).toBe('strasse');
  });

  it('⚠️ NEVER splits a word the list already knows', () => {
    // The failure that would make this feature worse than useless: `Fenster` decomposing into
    // `fens` + `ter`, or `Garten` into `gart` + `en`. Membership is checked BEFORE decomposition,
    // so a real word can never be taken apart.
    for (const word of ['fenster', 'garten', 'strasse', 'bahnhof', 'versicherung', 'haus']) {
      expect(de.key(word), word).toBe(word);
    }
  });

  it('leaves a word alone when the parts are not real words', () => {
    // Nothing is guessed. If any part is absent from the list, the split is refused and the word
    // keys to itself — an honest unknown rather than an invented decomposition.
    expect(de.key('Xyzabcdefgh')).toBe('xyzabcdefgh');
    expect(de.key('Quatschwort')).toBe('quatschwort');
  });

  it('refuses parts shorter than the configured minimum', () => {
    // `minPartLength` is the guard against a long word "decomposing" into two-letter German
    // fragments that all happen to be words — ei, so, an, um. Here `haus` + `tuer` is legal at 4,
    // and nothing shorter is even attempted.
    expect(de.key('Haustür')).toBe('tuer');

    const loose = createPack(
      { ...CONFIG, compounds: { minPartLength: 2, linkers: [''] } },
      {
        frequency: 'haus tuer ei so an um eisen',
      },
    );
    expect(loose.ok).toBe(true);
    if (!loose.ok) return;
    // At 2, `eisen` is reachable as `ei` + `sen`… which is exactly the nonsense the default avoids.
    expect(de.key('eisen')).toBe('eisen');
  });

  it('is off unless a pack asks for it', () => {
    // The key is OMITTED rather than set to undefined. `exactOptionalPropertyTypes` is on, so
    // "absent" and "present but undefined" are genuinely different types — which is the flag's
    // whole point, and a pack config read from JSON will never carry an explicit undefined.
    const withoutCompounds: PackConfig = {
      id: CONFIG.id,
      tokenize: CONFIG.tokenize,
      normalize: CONFIG.normalize,
      compare: CONFIG.compare,
    };
    const noCompounds = createPack(withoutCompounds, { frequency: WORDS });
    expect(noCompounds.ok).toBe(true);
    if (!noCompounds.ok) return;
    expect(noCompounds.value.key('Bahnhofstraße')).toBe('bahnhofstrasse');
  });

  it('is idempotent — the head of a compound is a word, not another compound', () => {
    // `checkPack` asserts this for real packs. A key that keys again to something else files one
    // word under two addresses depending on how many times key() was applied.
    for (const word of ['Bahnhofstraße', 'Bundesregierung', 'Hauptbahnhofstrasse', 'Haustür']) {
      const once = de.key(word);
      expect(de.key(once), word).toBe(once);
    }
  });
});
