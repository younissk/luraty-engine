/**
 * Is this string one of the two directions?
 *
 * ⚠️ Not a utility: `(s: string) => boolean` passes the signature clause, but the body knows the
 * engine's own vocabulary. See `utils/index.ts` for the test.
 *
 * @module
 */

import type { Direction } from './types/direction.js';

export function isDirection(s: string): s is Direction {
  return s === 'recognise' || s === 'produce';
}
