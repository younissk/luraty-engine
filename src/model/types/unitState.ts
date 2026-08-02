/**
 * What the engine believes about one unit, in one direction and variety.
 *
 * ⚠️ ONE SHAPE, NOT A UNION. `Learning | Understood` is gone, and this is the load-bearing
 * structural change in v3.
 *
 * The union earned its keep on a specific argument: *"`streak` is only meaningful while learning and
 * `confirmedOn` only once understood"*. Under a rung ladder that argument evaporates — every field
 * below is meaningful in every state, and `confirmedOn`/`lastProven` stop being two names for one
 * fact. (`plan`'s `provenOn()` already treated them as one question and said so out loud.) A union
 * whose variants carry identical fields is not making anything unrepresentable; it is a switch
 * statement standing where a field read belongs.
 *
 * *Make illegal states unrepresentable* has not been given up, it has MOVED to where illegal states
 * are actually reachable: `Strength` is a literal union, `Prior` is a discriminated union, and
 * `Evidence` became one. The count of exhaustive switches in the package is unchanged.
 *
 * `readonly` on every field rather than `Readonly<UnitState>`, which is only one level deep and
 * would happily allow `profile.units[k].seen++`.
 *
 * ### Three anchors, nested by strictness
 *
 * `lastSeen ⊇ lastAsked ⊇ lastProven`. One date was being asked three different questions — when do
 * I schedule this, have I ever checked it, do I trust it — and answering all three from `lastProven`
 * is what pinned failing words at the head of the queue forever.
 *
 * @module
 */

import type { Day } from './day.js';
import type { Prior } from './prior.js';
import type { Strength } from './strength.js';

export type UnitState = {
  /**
   * Total ENCOUNTERS, of any kind: a retrieval, a passive sighting, a gloss tap. Never decreases.
   *
   * ⚠️ A claim does NOT increment this. Nobody encountered anything — the host asserted something.
   * Keeping `seen` honest is why the `record` property law reads "sum(seen) === the number of
   * non-claim items" rather than `evidence.length`.
   */
  readonly seen: number;

  /**
   * The last day ANY encounter arrived. Refreshed by passive exposure.
   *
   * ⚠️ NOTHING SCHEDULES ON THIS, and that is the point. Reading a word and not asking what it means
   * moves it, so scheduling here would push every word in today's reading to the back of the drill
   * queue — exactly backwards, since those are the words she is currently meeting. Reporting only.
   */
  readonly lastSeen: Day;

  /**
   * The last day a RETRIEVAL was attempted, whatever the outcome. `0` means never asked.
   *
   * ⚠️ THE SCHEDULING ANCHOR (together with `Prior`), and splitting it out from `lastProven` IS the
   * fix for the leech wall. A word she keeps failing must come back soon and then LEAVE; anchoring
   * the sort on proof alone means its wait grows without bound, so it is pinned at the head of the
   * queue forever. Measured on a pool of 210 with ten always-failed words at 20 slots a day for 60
   * days: **44% of every slot**, against a 4.8% fair share. Moving this on every ask, and nothing
   * else, is the whole repair — no backoff, no new constant.
   *
   * A monotone max-fold with identity `0`, so it is independent of the order evidence arrives in.
   */
  readonly lastAsked: Day;

  /**
   * The last day this was SUCCESSFULLY retrieved, or `0` if it never has been.
   *
   * Unchanged in meaning from v2, and still moved only by a `retrieval` that came back `known`. It
   * is the TRUST anchor, not the scheduling one: `coverage()`, `summarize()` and the `'relearn'`
   * label read it; the sort does not. A failure must never move it — that would record a failure as
   * a proof, permanently, which is the lesson the v1→v2 migration is built around.
   *
   * `0` for never-proven is the identity element of the `later()` fold, which is what keeps the
   * value independent of the order evidence arrives in.
   */
  readonly lastProven: Day;

  /** What the host claimed before anything was measured. See `Prior`. */
  readonly prior: Prior;

  /** The ledger. `>= KNOWN_AT_STRENGTH` is what "known" means. See `STRENGTH_STEP`. */
  readonly strength: Strength;

  /**
   * Consecutive FAILED retrievals. Reset to 0 by any success. Never moved by exposure or help.
   *
   * ⚠️ REPORT-ONLY. It reaches no comparator and no gap; it exists so `plan()` can populate
   * `Session.stuck`. A backoff — showing a repeatedly-failed word less often — was designed and
   * rejected twice over: it costs uncalibrated constants, and it makes a word she is failing appear
   * LESS, which for an acquisition frontier is backwards. A word failed six times running is a
   * content or method problem, and the honest engine response is to name it, not to hide it.
   */
  readonly lapses: number;
};
