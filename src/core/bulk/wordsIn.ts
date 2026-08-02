/**
 * The distinct canonical words of a passage, in first-appearance order.
 *
 * The reading-side counterpart of `vocabularyOf`: same dedup and same unkeyable filter, but over
 * real text rather than a frequency list. Feed the result to `exposuresFor`.
 *
 * @module
 */

import type { LanguagePack, Lemma } from '../../model/index.js';

export function wordsIn(pack: LanguagePack, text: string): readonly Lemma[] {
  const out: Lemma[] = [];
  const seen = new Set<Lemma>();
  for (const surface of pack.split(text)) {
    const lemma = pack.key(surface);
    if (lemma.length === 0 || seen.has(lemma)) continue;
    seen.add(lemma);
    out.push(lemma);
  }
  return out;
}
