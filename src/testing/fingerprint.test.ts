import { describe, expect, it } from 'vitest';

import { fingerprint } from './fingerprint.js';

/**
 * The Node half of the cross-runtime lane.
 *
 * `npm run test:hermes` compares this fingerprint between Node and Hermes, but it needs a VM binary
 * and is therefore not in the fast gate. These tests keep the fingerprint itself honest on every
 * ordinary run, so it cannot quietly rot into something that compares nothing.
 *
 * @module
 */

describe('fingerprint', () => {
  it('is deterministic within a single runtime', () => {
    // If this fails, the fingerprint reads a clock or an unseeded random, and a cross-runtime diff
    // would report differences that are noise rather than bugs.
    expect(fingerprint()).toBe(fingerprint());
  });

  it('actually covers something', () => {
    // Guards the failure mode this whole exercise was about: a check that runs happily against an
    // empty input and proves nothing. A fingerprint that shrank to a handful of lines would still
    // "pass" on both runtimes.
    const lines = fingerprint().split('\n');
    expect(lines.length).toBeGreaterThan(500);
  });

  it('exercises every part that could differ between engines', () => {
    const text = fingerprint();
    for (const marker of [
      'step lowercase',
      'step stripArabicDiacritics',
      'step foldLatinDiacritics',
      'codepoints',
      'ar-msa split',
      'fr key',
      'sort | corpus',
      'unitKey',
      'serialize | 20 days',
      'deserialize-bad',
      'json-order',
      'imul',
    ]) {
      expect(text, `fingerprint no longer covers "${marker}"`).toContain(marker);
    }
  });

  it('contains non-ASCII input, or it is testing the wrong thing', () => {
    // The whole reason internal/text.ts exists is non-Latin script. A fingerprint of pure ASCII
    // would be the vacuous-property bug all over again, one layer up.
    //
    // U+0627 is Arabic alef and U+064F is damma — a letter and a diacritic, so both the character
    // set and the stripping path are represented. The fingerprint escapes without zero-padding.
    const text = fingerprint();
    expect(text).toContain('U+627');
    expect(text).toContain('U+64F');
  });
});
