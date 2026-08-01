/**
 * Is this string a well-formed unit key?
 *
 * The narrowing form of `parseUnitKey`, for the caller that only needs the yes/no — chiefly
 * `deserialize`, which must reject a bad key from storage rather than take it apart.
 *
 * ⚠️ It exists so that `unitKey()` stays **the only `as UnitKey` in the package**. Without it a
 * decoder that has just checked a key still has to cast to use it, and a cast is a promise rather
 * than a check — the exact thing the two-step constructor was written to avoid. A type predicate
 * carries the proof into the type system instead.
 *
 * @module
 */

import { parseUnitKey } from './parseUnitKey.js';
import type { UnitKey } from './types/unitKey.js';

export function isUnitKey(key: string): key is UnitKey {
  return parseUnitKey(key) !== undefined;
}
