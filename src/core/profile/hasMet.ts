/**
 * Whether the learner has ever met this unit. Distinct from "knows it".
 *
 * @module
 */

import type { Profile, UnitKey } from '../../model/index.js';

export function hasMet(profile: Profile, key: UnitKey): boolean {
  return key in profile.units;
}
