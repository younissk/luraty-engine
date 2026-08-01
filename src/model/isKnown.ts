/**
 * Is this unit known?
 *
 * ⚠️ THE one predicate, exported so that nothing reimplements it. Under the old two-box model this
 * was `state.box === 'understood'`, written out longhand in `coverage` as an exhaustive switch
 * precisely so a third box could not be silently misclassified. The ladder makes that structural
 * risk vanish and replaces it with a numeric one: `>=` written as `>` somewhere would move every
 * learner's coverage number with nothing failing to compile. One definition, one place.
 *
 * @module
 */

import { KNOWN_AT_STRENGTH } from './constants.js';
import { effectiveStrength } from './effectiveStrength.js';
import type { UnitState } from './types/unitState.js';

export function isKnown(state: UnitState): boolean {
  return effectiveStrength(state) >= KNOWN_AT_STRENGTH;
}
