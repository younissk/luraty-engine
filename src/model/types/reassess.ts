/**
 * Whether it is time to re-measure.
 *
 * ⚠️ **THE ENGINE OWNS THE TRIGGER; THE HOST OWNS THE INSTRUMENT.** This says *when*, never *how* —
 * it names no units and prescribes no method, because how to assess somebody is a product decision
 * with several defensible answers. That division is also what keeps `plan()` free of a pack and a
 * seed, since deciding "it has been a month" needs neither.
 *
 * Computed from `profile.day` and the units alone, on every call, and stored nowhere. A trigger that
 * were stored would have to be cleared by something, and nothing here writes to a profile except
 * `record`.
 *
 * @module
 */
export type Reassess =
  | { readonly kind: 'not-due'; readonly daysUntil: number }
  | {
      /**
       * Nothing has EVER been successfully retrieved, so there is no span to report.
       *
       * ⚠️ A separate variant rather than `daysSinceProven: day`, and the difference is not
       * cosmetic. The engine does not know when a learner started — a profile carries a current day
       * and no epoch — so with nothing proven, `day - 0` is the host's raw day NUMBER, not a span of
       * anybody's life. A host counting Unix days would have been told its brand-new learner had
       * gone **20,661 days** without proving anything, and any host whose epoch is more than
       * `REASSESS_AFTER_DAYS` in the past would be permanently past the threshold.
       *
       * Splitting the variant makes that unrepresentable: there is no number here to be wrong.
       */
      readonly kind: 'never-measured';
      /** Units resting on an unchecked claim. Usually the whole profile, just after a placement. */
      readonly claimsStanding: number;
    }
  | {
      readonly kind: 'due';
      /** `day - max(lastProven)` across the profile. Always a real span: something WAS proven. */
      readonly daysSinceProven: number;
      /** Units still resting on an unchecked claim. Context for the host, not the trigger. */
      readonly claimsStanding: number;
    };
