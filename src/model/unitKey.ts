/**
 * Build a `UnitKey`.
 *
 * ⚠️ Two steps, not one. The assignment to `UnitKeyShape` is where the template literal actually
 * checks anything; `as` on its own is a promise rather than a check, so a one-step
 * `` return `${d}:${v}` as UnitKey `` would compile clean with a whole segment missing. This is the
 * single blessed constructor — it should be the only `as UnitKey` in the package.
 *
 * @module
 */

import type { Direction } from './types/direction.js';
import type { UnitKey } from './types/unitKey.js';
import type { UnitKeyShape } from './types/unitKeyShape.js';
import type { Variety } from './types/variety.js';

export function unitKey(direction: Direction, v: Variety, word: string): UnitKey {
  const shape: UnitKeyShape = `${direction}:${v}:${word}`;
  return shape as UnitKey;
}
