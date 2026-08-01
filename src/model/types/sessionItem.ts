/**
 * One thing to do, with the reason it was chosen — so a host can explain itself to a learner.
 *
 * @module
 */

import type { UnitKey } from './unitKey.js';
import type { Why } from './why.js';

export type SessionItem = {
  readonly unit: UnitKey;
  /**
   * Days since the engine last had a reason to attend to this unit —
   * `day - max(lastAsked, prior.on)`, clamped at 0.
   *
   * ⚠️ **THE NAME IS KEPT AND THE MEANING IS GENERALISED, deliberately.** v2 defined it as
   * days-since-PROVEN, and that definition is what pinned failing words at the head of the queue
   * forever: a word she never gets right is never proven, so its wait grows without bound. Measured,
   * ten such words in a pool of 210 took 44% of every slot for two months.
   *
   * v3 defines it as days-since-ATTENDED, which covers all four `Why` arms with one number: a claim
   * waiting to be checked, a failed word waiting to come round again, a proven word waiting for
   * review. All of those genuinely are waiting, so `daysWaiting` is still the true name —
   * `daysSinceAsked` or `daysOverdue` would each be true of only some arms.
   *
   * Still THE selection score, exposed rather than hidden: a learner asking "why am I seeing this
   * again?" deserves an answer, and ipsative feedback — progress against your own past — is what the
   * evidence says counters the plateau feeling at intermediate levels.
   */
  readonly daysWaiting: number;
  /** Which partition this came from. See `Why`. */
  readonly why: Why;
};
