/**
 * Turn the output of a placement into evidence.
 *
 * **The single most common day-one operation**, and until this existed it was a four-field object
 * literal inside a `.map` at every call site.
 *
 * A claim says the host believes she knows this and nobody has checked. It buys no head start on its
 * own — see `Claim` — so this cannot inflate anything; what it buys is that day one is not an empty
 * screen, that those words come back labelled `'verify'` rather than `'new'`, and that `coverage()`
 * can say "it depends whether you believe her" instead of confidently reporting 0%.
 *
 * @module
 */

import type { Claim, Day, Direction, Variety } from '../../model/index.js';
import { keysFor } from './keysFor.js';

export function claimsFor(
  direction: Direction,
  v: Variety,
  words: readonly string[],
  day: Day,
): readonly Claim[] {
  return keysFor(direction, v, words).map((unit) => ({ kind: 'claim', unit, day }));
}
