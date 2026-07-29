import type { Day, UnitKey } from './ids.js';

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

/**
 * Why an item is in the session — the partition it was drawn from.
 *
 * Derived on every call and stored nowhere, so it can never disagree with the state it describes.
 *
 * ⚠️ THE MOST PRODUCT-VISIBLE FIELD IN v3. `'verify'` is what lets day one say *"you told us you
 * know this — let's check"* to a fluent adult, instead of labelling 800 words she grew up hearing as
 * "new". A heritage speaker being called a beginner is the specific failure this product exists to
 * avoid, and until now the engine had no way to tell the host not to.
 */
export type Why =
  /**
   * A standing claim: the host asserted it and nobody has checked. Draws from the REVIEW budget, not
   * the new-material cap — confirming what she already said she knows is not teaching her a word.
   */
  | 'verify'
  /** Never asked and never claimed. **The only value {@link PlanOptions.maxNew} caps.** */
  | 'new'
  /** Asked at least once and never once right. Maintenance, uncapped — she is mid-acquisition. */
  | 'relearn'
  /** Proven at least once. Maintenance, uncapped. */
  | 'review';

export type PlanOptions = {
  /** The day to plan for. Time is data; there is no clock in here to read. */
  readonly day: Day;

  /**
   * How many units to drill. Clamped to a whole number ≥ 0 rather than rejected — see
   * {@link plan}.
   *
   * The evidence supports SHORT sessions (roughly 15–20 minutes for a beginner, up to an hour for
   * an advanced learner) and says several short ones beat one long one. The engine does not enforce
   * a ceiling, because minutes are not items and only the host knows how long its exercises take.
   */
  readonly maxItems: number;

  /**
   * How many genuinely NEW units may be introduced today. Clamped to `[0, maxItems]`.
   *
   * **Defaults to `floor(maxItems / 2)`**, which is measured rather than chosen.
   *
   * ⚠️ **THIS FIELD WAS REQUIRED, AND THE ARGUMENT FOR THAT TURNED OUT TO BE WRONG.** The failure it
   * exists for is real: a never-asked unit's wait is `day - 0`, which strictly dominates every
   * attended unit at every epoch, so a host feeding 20 new words a day into a 20-item budget gave
   * review **0% of slots, forever** and the learner ended a simulated year knowing NOTHING, because
   * no word was ever drilled twice.
   *
   * The claim that followed — "there is no safe default" — was never measured. Sweeping words-known
   * after a simulated year across budgets 4 to 40, accuracies 0.7 to 0.95 and introduction rates 3
   * to 20, `floor(maxItems / 2)` is the peak or within **3%** of it in every cell, and exactly the
   * peak in 21 of 30. At low introduction rates it is identical to the peak, because a cap cannot
   * bind when there is little new material to hold back.
   *
   * ⚠️ And requiring it never prevented the bug. The catastrophic value is `maxNew === maxItems` —
   * a legal explicit number, and the most natural thing to type when a compiler demands "how many
   * new units may be introduced" for a full session. Requiring the field converted a silent omission
   * into a silent explicit mistake. A measured default converts it into the peak.
   *
   * The cliff is still there and still sharp: at `maxItems`, a year of daily practice yields zero.
   *
   * ⚠️ **A CEILING ON CROWDING-OUT, NOT AN ABSOLUTE ONE — and the difference is worth reading.**
   * New items skipped by the cap are DEFERRED rather than dropped, and come back to fill slots that
   * maintenance could not use. So a host that claims nothing and introduces three words on day one
   * still gets a full session rather than a three-item one, and `maxNew: 0` on a profile with
   * nothing but new material yields one word rather than an empty screen.
   *
   * Two laws in `plan.property.test.ts` pin exactly what that buys, and both were arrived at only
   * after fast-check refuted a more confident-sounding version:
   *
   * 1. `maxItems - maxNew` slots are RESERVED for maintenance, and maintenance takes them whenever
   *    it has the work. This is the one that forbids the measured failure.
   * 2. The cap is exceeded only once maintenance has run out entirely.
   *
   * What it deliberately does NOT promise is `introduced <= maxNew` in all cases. That statement is
   * false, and writing it in this docstring would have been a lie the tests disprove.
   */
  readonly maxNew?: number;

  /**
   * Days a unit must wait after reaching {@link KNOWN_AT_STRENGTH} before being drilled again.
   * Defaults to {@link DEFAULT_REVIEW_GAP_DAYS}.
   *
   * ⚠️ **v3 CHANGED WHO IT APPLIES TO**, and this is the only place `strength` reaches the
   * scheduler. v2 applied the gap to anything ever proven; v3 applies it only at or above the known
   * rung. A unit below that line is in ACQUISITION and may come back the next day — which is v2's
   * own "a never-proven unit has nothing to wait out" rule, generalised to the one thing that now
   * measures proof.
   *
   * A single equal interval, not a ladder, and that is still the literature's own finding rather
   * than a simplification: expanding schedules perform about as well as equal ones across 98 effect
   * sizes. v3 now HAS the repetition count a ladder would need, so the old "we could not build one
   * anyway" argument has expired — the reason is now purely that a ladder would push
   * `plan.property.test.ts`'s anti-starvation horizon from `rotation + gap` out to `rotation + 96`,
   * converting an arithmetic guarantee into a judgement call.
   */
  readonly reviewGapDays?: number;

  /**
   * Which units to prefer when two have waited exactly the same number of days.
   *
   * ⚠️ WHY THIS EXISTS. Ties are not an edge case — they are the normal case. A learner who was
   * placed, or who read a passage, acquires hundreds of units on the same day, and every one of them
   * then carries the same anchor. Without a priority the engine falls back to comparing the unit
   * key, which is a total order and therefore correct, and which sorts the session ALPHABETICALLY:
   *
   *     agieren  alternative  anders  andrea  anforderung  ansatz  apotheke
   *
   * Deterministic, reproducible, and a bad lesson.
   *
   * The fix is data rather than cleverness: the host already loaded a frequency-ordered pack, so it
   * knows which of two equally-overdue words is worth more. Pass those keys, commonest first. The
   * engine stays language-free — it never looks the words up, it only respects the order it is
   * given — and a host that wants to order by topic, difficulty or lesson plan can do that instead.
   *
   * A good second source: `Coverage.claimedLemmas` from the passage she is about to read. Those are
   * the unchecked words standing between her and a verdict on that text.
   *
   * Units absent from this list sort after every unit in it. Omit it and the key tiebreak applies.
   */
  readonly priority?: readonly UnitKey[];
};

/** One thing to do, with the reason it was chosen — so a host can explain itself to a learner. */
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
   * v3 defines it as days-since-ATTENDED, which covers all four {@link Why} arms with one number: a
   * claim waiting to be checked, a failed word waiting to come round again, a proven word waiting
   * for review. All of those genuinely are waiting, so `daysWaiting` is still the true name —
   * `daysSinceAsked` or `daysOverdue` would each be true of only some arms.
   *
   * Still THE selection score, exposed rather than hidden: a learner asking "why am I seeing this
   * again?" deserves an answer, and ipsative feedback — progress against your own past — is what the
   * evidence says counters the plateau feeling at intermediate levels.
   */
  readonly daysWaiting: number;
  /** Which partition this came from. See {@link Why}. */
  readonly why: Why;
};

/**
 * The content this session needs, described rather than fetched.
 *
 * Deliberately a description of PROPERTIES, not a query. The engine does not know what a host's
 * content store looks like, and inventing a query language for it here would be the engine growing a
 * dependency on a schema it cannot see.
 */
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
   * {@link COVERAGE_BAND.minTokens}.
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
   * also keeps every unit in {@link Session.items} one the learner has actually met — which the
   * alternative, letting `plan()` emit units absent from the profile, silently breaks.
   */
  readonly newUnitsWanted: number;
};

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
       * {@link REASSESS_AFTER_DAYS} in the past would be permanently past the threshold.
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

export type Session = {
  readonly day: Day;
  /**
   * The drills, best-first, truncated to `maxItems`.
   *
   * MAY BE EMPTY, and that is a real state rather than an error: a learner with nothing due has
   * nothing due. Check {@link ContentRequest.newUnitsWanted} before concluding there is nothing to
   * do — an empty list with a positive want means "I need vocabulary, not a scheduler".
   */
  readonly items: readonly SessionItem[];
  readonly content: ContentRequest;
  /** Whether to re-measure. See {@link Reassess}. */
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
