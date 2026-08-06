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
 * ⚠️ **THE SECOND ARM IS GONE, AND THAT IS THE POINT OF ADR-0022.** It used to read
 * `parseUnitKey(key) !== undefined || parseSkillKey(key) !== undefined`, because a `skill:` key had
 * no `Direction` in its first segment and `parseUnitKey` rejected it by design. `persist` validates
 * every key on load and fails the whole blob as malformed when one does not parse — so without that
 * arm, a learner who did one grammar lesson could never open her profile again. It was found by
 * reading `persist` rather than by a failing test, because the skill test never round-tripped
 * through serialization.
 *
 * That is a patch per namespace, and the next two namespaces were pronunciation and writing. Now the
 * modality is checked in one place, so there is nothing to forget.
 *
 * @module
 */

import { parseUnitKey } from './parseUnitKey.js';
import type { UnitKey } from './types/unitKey.js';

export function isUnitKey(key: string): key is UnitKey {
  return parseUnitKey(key) !== undefined;
}
