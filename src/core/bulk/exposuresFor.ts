/**
 * Everything she met while reading, as evidence that proves nothing.
 *
 * Pass the DISTINCT words of a passage — `vocabularyOf` is not right here, because a passage is text
 * rather than a frequency list; split it with `pack.split` and key each surface.
 *
 * ⚠️ Exposure is the weakest signal the engine has and it is deliberately weaker than it looks: it
 * moves `seen` and `lastSeen` and nothing else. A heritage speaker recognises a word's shape while
 * holding only its domestic sense and will not ask, so if not-asking counted as knowing, the register
 * gap this engine exists to find would be invisible by construction.
 *
 * If she tapped the gloss on a word, that is `Help`, not this — and it is the more informative of the
 * two, because it is her telling you she does not have it.
 *
 * @module
 */

import type { Day, Direction, Exposure, Variety } from '../../model/index.js';
import { keysFor } from './keysFor.js';

export function exposuresFor(
  direction: Direction,
  v: Variety,
  words: readonly string[],
  day: Day,
): readonly Exposure[] {
  return keysFor(direction, v, words).map((unit) => ({ kind: 'exposure', unit, day }));
}
