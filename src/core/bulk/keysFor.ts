/**
 * Address a list of words, in one direction and variety.
 *
 * Chiefly for `PlanOptions.priority`: `keysFor('recognise', de, vocabularyOf(pack, frequency))` is
 * the whole of the frequency tiebreak a host needs.
 *
 * ⚠️ **Empty words are skipped**, and that is a real guard rather than tidiness. `unitKey(d, v, '')`
 * returns `"recognise:de:"`, which `parseUnitKey` rejects for having no word — and `record` writes
 * whatever key it is handed, so one empty string in a caller's list puts a permanently unaddressable
 * unit in the profile. A review found exactly that reaching `summarize`, where it broke the law that
 * the per-skill scopes partition the whole.
 *
 * Order is preserved and duplicates are NOT removed: `priority` takes the first index it sees, so a
 * caller who wants dedup should use `vocabularyOf`, which does it.
 *
 * @module
 */

import { unitKey, type Direction, type UnitKey, type Variety } from '../../model/index.js';

export function keysFor(
  direction: Direction,
  v: Variety,
  words: readonly string[],
): readonly UnitKey[] {
  const out: UnitKey[] = [];
  for (const word of words) {
    if (word.length === 0) continue;
    out.push(unitKey(direction, v, word));
  }
  return out;
}
