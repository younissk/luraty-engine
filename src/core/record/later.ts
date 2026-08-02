/**
 * Later of two days.
 *
 * ⚠️ MONOTONIC, and every date field in `UnitState` folds through it. A host syncing an offline
 * queue replays evidence out of order, and taking `evidence.day` directly meant a late-arriving
 * day-3 item rewound a unit last seen on day 40 — so a unit proven yesterday reported itself last
 * proven 37 days ago. Nothing errored; it stayed invisible until something did interval arithmetic
 * on the field, at which point it surfaced as a scheduling bug dated to a commit months earlier.
 *
 * Taking the later of the two also makes the result independent of arrival order, which is the
 * property a sync queue actually needs.
 *
 * ⚠️ NOT a utility: `Day` is a domain type, so clause 1 of the `utils/` test fails.
 *
 * @module
 */

import type { Day } from '../../model/index.js';

export function later(a: Day, b: Day): Day {
  return a > b ? a : b;
}
