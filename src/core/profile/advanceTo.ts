/**
 * Move the profile to a day.
 *
 * The host calls this; the engine never reads a clock, because there is no clock in here to read.
 * Time is data, which is what makes a session replayable from a seed.
 *
 * Monotonic: going backwards returns the profile unchanged rather than throwing. A host whose
 * device clock jumps backwards (timezone change, manual correction, a phone that was off) should
 * not be able to corrupt a learner's history, and it certainly should not crash their app.
 *
 * @module
 */

import type { Day, Profile } from '../../model/index.js';

export function advanceTo(profile: Profile, day: Day): Profile {
  if (day <= profile.day) return profile;
  return { ...profile, day };
}
