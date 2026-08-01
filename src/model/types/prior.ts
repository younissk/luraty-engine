/**
 * What the host asserted about this unit before anybody measured anything.
 *
 * ⚠️ A DISCRIMINATED UNION AND NOT A `claimedOn: Day` WITH `0` MEANING "NEVER". The never-sentinel
 * is tolerable for `UnitState.lastProven` — it is documented there, and the one ambiguous case (a
 * unit genuinely proven on day 0, in a host whose epoch is day 0) merely drills it once too early.
 * It is NOT tolerable here, because a placement on day 0 of a fresh profile is the NORMAL case, not
 * an edge one. Under a sentinel it would silently relabel 800 claimed units as brand-new, costing
 * them their `'verify'` label, their honest anchor, and their exemption from the new-material cap —
 * on exactly the day the feature exists for.
 *
 * It also restores the compiler-generated worklist that collapsing `Learning | Understood` gave up,
 * and puts it on the axis where a new variant will actually arrive: a scored placement, or an import
 * from another app.
 *
 * @module
 */

import type { Day } from './day.js';

export type Prior =
  | { readonly kind: 'none' }
  | {
      /** The host says she knows this. Nobody has checked. */
      readonly kind: 'claimed';
      /** The day the claim was made. Monotone max-fold, so re-claiming is safe and order-free. */
      readonly on: Day;
    };
