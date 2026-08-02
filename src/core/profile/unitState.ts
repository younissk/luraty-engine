/**
 * The state of a unit, total.
 *
 * `profile.units[key]` is `UnitState | undefined` because `noUncheckedIndexedAccess` is on, and it
 * stays on — a unit the learner has never met really is absent, and that is the domain speaking
 * rather than a nuisance. This function owns the ergonomics tax once, so `?? somethingDefault` does
 * not get scattered across every call site with a slightly different default each time.
 *
 * An unmet unit reads as `UNMET`: every counter zero, every date zero, no claim. The engine's
 * honest default is that you do not know a word until something says otherwise — and that never
 * having met a word is not a claim about it.
 *
 * ⚠️ `lastSeen` defaults to `0`, not `profile.day`. v2 returned today, which asserted a sighting
 * that never happened; `plan()` never read it and `coverage()` never read it, so nothing depended on
 * the lie, but `summarize()` would have. Corrected while the wire was open.
 *
 * @module
 */

import { UNMET, type Profile, type UnitKey, type UnitState } from '../../model/index.js';

export function unitState(profile: Profile, key: UnitKey): UnitState {
  return profile.units[key] ?? UNMET;
}
