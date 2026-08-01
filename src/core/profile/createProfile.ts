/**
 * A learner who has met nothing yet.
 *
 * @module
 */

import type { Day, Profile } from '../../model/index.js';

export function createProfile(language: string, startDay: Day): Profile {
  return { language, day: startDay, units: {} };
}
