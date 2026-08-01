/**
 * What a learner should do next, and what content the host must fetch to make it possible.
 *
 * ⚠️ **The engine cannot fetch anything.** So a session is a plan plus a *request* — the host reads
 * the request, goes and gets the content, and shows it. That is what makes a scheduler testable
 * with no database, and it is why there is no `ContentStore` port here. An injected store would make
 * `plan()` async, and async ends value-in/value-out — taking fork-a-learner, diff-two-profiles and
 * bisect-a-replay with it. Simulating thousands of headless learners is the whole reason this engine
 * lives outside the app.
 *
 * @module
 */

import type { ContentRequest } from './contentRequest.js';
import type { Day } from './day.js';
import type { Reassess } from './reassess.js';
import type { SessionItem } from './sessionItem.js';
import type { UnitKey } from './unitKey.js';

export type Session = {
  readonly day: Day;
  /**
   * The drills, best-first, truncated to `maxItems`.
   *
   * MAY BE EMPTY, and that is a real state rather than an error: a learner with nothing due has
   * nothing due. Check `ContentRequest.newUnitsWanted` before concluding there is nothing to do —
   * an empty list with a positive want means "I need vocabulary, not a scheduler".
   */
  readonly items: readonly SessionItem[];
  readonly content: ContentRequest;
  /** Whether to re-measure. See `Reassess`. */
  readonly reassess: Reassess;
  /**
   * Units at `lapses >= STUCK_AFTER_LAPSES` — failed that many times in a row.
   *
   * ⚠️ NAMED, NOT HIDDEN. The obvious alternative is a backoff that shows a repeatedly-failed word
   * less often, and it was rejected twice: it costs uncalibrated constants, and showing a word she
   * is failing LESS is backwards for an acquisition frontier. A word failed six times running is a
   * content or method problem — the exercise is wrong, the audio is bad, the gloss is misleading —
   * and quietly reducing its frequency is precisely how that stays invisible.
   *
   * These units are NOT excluded from `items`. They are reported alongside it.
   */
  readonly stuck: readonly UnitKey[];
};
