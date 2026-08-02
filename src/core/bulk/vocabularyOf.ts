/**
 * Every distinct canonical word a pack's frequency list contains, **commonest first**.
 *
 * The order is the whole value: it is what a host passes as `PlanOptions.priority`, and without it a
 * session of equally-overdue words comes back alphabetically.
 *
 * Two filters, and both matter. **Unkeyable surfaces are dropped** — `key()` can return the empty
 * string (a run of Arabic tatweel is a real example), and `unitKey(d, v, '')` mints an address
 * `parseUnitKey` rejects, so such a unit could never be known or even addressed. **Duplicates are
 * dropped, first occurrence winning** — many surfaces collapse to one lemma, and the earliest
 * position is the honest rank for it.
 *
 * @module
 */

import type { LanguagePack, Lemma } from '../../model/index.js';

export function vocabularyOf(pack: LanguagePack, frequency: string): readonly Lemma[] {
  const out: Lemma[] = [];
  const seen = new Set<Lemma>();
  for (const word of frequency.split(/\s+/)) {
    if (word.length === 0) continue;
    const lemma = pack.key(word);
    if (lemma.length === 0 || seen.has(lemma)) continue;
    seen.add(lemma);
    out.push(lemma);
  }
  return out;
}
