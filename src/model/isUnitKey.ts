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
import { parseSkillKey } from './parseSkillKey.js';
import type { UnitKey } from './types/unitKey.js';

/**
 * ⚠️ **A SKILL KEY IS A UNIT KEY, AND FORGETTING THAT WOULD HAVE BROKEN EVERY PROFILE THAT HELD ONE.**
 * `persist` validates every key on load and fails the whole blob as malformed when one does not
 * parse — deliberately, because an unparseable key silently shortens every session forever. A
 * `skill:` key has no `Direction` in its first segment, so `parseUnitKey` rejects it by design, and
 * without this second arm a learner who did one grammar lesson could never load her profile again.
 *
 * Found by reading `persist` rather than by a failing test: the unit test for skills passed happily,
 * because it never round-tripped through serialization.
 */
export function isUnitKey(key: string): key is UnitKey {
  return parseUnitKey(key) !== undefined || parseSkillKey(key) !== undefined;
}
