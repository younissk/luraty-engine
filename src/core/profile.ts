import type { Day, UnitKey } from '../model/ids.js';
import type { Profile } from '../model/profile.js';
import type { UnitState } from '../model/unit.js';

/**
 * Creating and moving a profile through time.
 *
 * @module
 */

/** A learner who has met nothing yet. */
export function createProfile(language: string, startDay: Day): Profile {
  return { language, day: startDay, units: {} };
}

/**
 * Move the profile to a day.
 *
 * The host calls this; the engine never reads a clock, because there is no clock in here to read.
 * Time is data, which is what makes a session replayable from a seed.
 *
 * Monotonic: going backwards returns the profile unchanged rather than throwing. A host whose
 * device clock jumps backwards (timezone change, manual correction, a phone that was off) should
 * not be able to corrupt a learner's history, and it certainly should not crash their app.
 */
export function advanceTo(profile: Profile, day: Day): Profile {
  if (day <= profile.day) return profile;
  return { ...profile, day };
}

/**
 * The state of a unit, total.
 *
 * `profile.units[key]` is `UnitState | undefined` because `noUncheckedIndexedAccess` is on, and it
 * stays on — a unit the learner has never met really is absent, and that is the domain speaking
 * rather than a nuisance. This function owns the ergonomics tax once, so `?? somethingDefault` does
 * not get scattered across every call site with a slightly different default each time.
 *
 * An unmet unit reads as `learning` with zero encounters: the engine's honest default is that you
 * do not know a word until something says otherwise.
 */
export function unitState(profile: Profile, key: UnitKey): UnitState {
  return profile.units[key] ?? { box: 'learning', seen: 0, lastSeen: profile.day, streak: 0 };
}

/** Whether the learner has ever met this unit. Distinct from "knows it". */
export function hasMet(profile: Profile, key: UnitKey): boolean {
  return key in profile.units;
}
