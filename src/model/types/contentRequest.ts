/**
 * The content this session needs, described rather than fetched.
 *
 * Deliberately a description of PROPERTIES, not a query. The engine does not know what a host's
 * content store looks like, and inventing a query language for it here would be the engine growing a
 * dependency on a schema it cannot see.
 *
 * @module
 */

import type { UnitKey } from './unitKey.js';

export type ContentRequest = {
  /**
   * The units to build retrieval exercises for, in the order they should be presented.
   *
   * ⚠️ **May be longer than `maxItems`.** Over-asking is the engine's answer to a host that cannot
   * satisfy every unit — a missing exercise for one word should cost that word, not the session. A
   * host takes the first `maxItems` it can actually build.
   */
  readonly units: readonly UnitKey[];

  /**
   * The minimum running-token length of any passage this session shows.
   *
   * ⚠️ **This is why it is exported at all.** Below this length the 95–98% coverage band has no
   * representable point, so `coverage()` refuses to classify — and the engine cannot go and find
   * longer text itself. If nobody carries this number outward, the host supplies nine-word sentences
   * forever and ADR-0003 invariant 1 is unsatisfiable by construction, silently. See
   * `COVERAGE_BAND.minTokens`.
   */
  readonly minPassageTokens: number;

  /**
   * New slots `plan()` was allowed to fill and could NOT, for want of any unmet unit in the profile.
   *
   * ⚠️ **THE ANSWER TO THE EMPTY-DAY-ONE SESSION, and the only thing the engine may honestly do
   * about it.** `plan()` iterates `profile.units`, and a new profile is `{}` — so an empty profile
   * yields an empty session no matter how clever the scheduler gets. Measured: a fresh profile
   * returned 0 items and 0 content units, and nothing said why.
   *
   * The engine has no vocabulary of its own and must not acquire one. So it REQUESTS: *"I had N new
   * slots I could not fill; send me words she has not met."* The host picks them from the frequency
   * list it already loaded, shows them, and records the evidence — after which they are ordinary
   * units.
   *
   * This is `ContentRequest`'s existing described-not-fetched idiom exactly, and it is why `plan()`
   * still needs no language pack: work the four-function contract through again and `split` has no
   * text, `compare` has no answer, `key` has no surface, and `rank` is still never consulted. It
   * also keeps every unit in `Session.items` one the learner has actually met — which the
   * alternative, letting `plan()` emit units absent from the profile, silently breaks.
   */
  readonly newUnitsWanted: number;
};
