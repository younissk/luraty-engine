/**
 * A day number. Whole days since an epoch the host chooses, **starting at 1**.
 *
 * A day and not a timestamp, deliberately. Everything this engine schedules happens at day
 * granularity, and a number that cannot express "3:47pm" is a number nobody can accidentally make
 * a decision depend on the time of day.
 *
 * ⚠️ **DAY 0 IS RESERVED AND IS NOT A LEGAL DAY.** Zero is the "never" sentinel for every date the
 * engine stores — `lastSeen`, `lastAsked`, `lastProven`, and the day a claim was made — because a
 * max-fold needs an identity element and `0` is it.
 *
 * That works only if no *real* day can also be zero, and it was measured not to. A host whose epoch
 * is "days since install" naturally starts at 0, and then a word asked on the install day reads as
 * NEVER ASKED: `plan()` labels it `'new'` instead of `'review'`, a claim disproved that day still
 * counts as standing, and `summarize()` files it under the wrong bucket. Six separate defects, one
 * ambiguity — and all of them invisible to a host that picked the obvious epoch.
 *
 * `Prior` avoided this by being a discriminated union rather than a sentinel. Making every date a
 * union would cost far more than it buys; reserving one integer costs a sentence. So the constructor
 * refuses `0`, and a host that wants "days since install" starts counting at 1.
 *
 * @module
 */

import type { Brand } from './brand.js';

export type Day = Brand<number, 'Day'>;
