/**
 * Everything the engine believes about one learner, in one language.
 *
 * **One profile per language, always.** Two languages are two profiles with nothing shared — you
 * are a different person in each one, and a heritage speaker's Arabic tells you nothing useful
 * about their French. A diglossic language keeps two *varieties* inside one profile (the dialect
 * and the standard), because they interfere with each other and must be compared; but they are
 * still measured separately, which is why the variety is part of every unit key.
 *
 * **This is a value, not an object.** Nothing mutates it — `record()` returns a new one. That is
 * what lets a test fork a learner to ask "what if she had failed this?", diff two profiles, and
 * bisect a replay that went wrong. None of it is possible with state hidden inside a class.
 *
 * **It is also derived, not authoritative.** The evidence log is the truth; a profile is a fold
 * over it. So when the memory model changes — and it will, several times — that is a re-fold
 * rather than a migration.
 *
 * @module
 */

import type { Day } from './day.js';
import type { UnitKey } from './unitKey.js';
import type { UnitState } from './unitState.js';

export type Profile = {
  /**
   * The language this profile is for, as the host names it. Varieties of it (a dialect and a
   * standard) live inside, distinguished per unit key.
   */
  readonly language: string;

  /**
   * The learner's current day. Advanced explicitly by the host via `advanceTo`, never read from a
   * clock — there is no clock in here to read.
   */
  readonly day: Day;

  /**
   * Sparse. A unit the learner has never met is genuinely absent rather than present-and-empty,
   * which is exactly what `UnitState | undefined` on lookup is telling you. Use the total accessor
   * instead of reaching for `??` at every call site.
   *
   * Unevenness needs no special representation here: "B1 listening, A1 writing" is just a dense
   * layer of `recognise` keys over a sparse layer of `produce` ones. If the abstraction were wrong,
   * this is where it would show.
   */
  readonly units: Readonly<Record<UnitKey, UnitState>>;
};
