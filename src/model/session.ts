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
   * Days a unit must wait after being proven before it is drilled again. Defaults to
   * {@link DEFAULT_REVIEW_GAP_DAYS}.
   *
   * A single equal interval, not a ladder. That is the literature's own finding rather than a
   * simplification: expanding schedules perform about as well as equal ones, so an interval ladder
   * is complexity with no measurable return — and it would need a repetition count the profile does
   * not carry, because `seen` is incremented by passive exposure and would hand a six-month interval
   * to a word the learner had merely skimmed forty times.
   */
  readonly reviewGapDays?: number;
};

/** One thing to do, with the reason it was chosen — so a host can explain itself to a learner. */
export type SessionItem = {
  readonly unit: UnitKey;
  /**
   * Days since this unit was last successfully retrieved.
   *
   * This IS the selection score, exposed rather than hidden: a learner asking "why am I seeing this
   * again?" deserves an answer, and ipsative feedback — progress against your own past — is what the
   * evidence says counters the plateau feeling at intermediate levels.
   *
   * A unit that has never been proven reports the full span since the profile's epoch, which is the
   * largest possible wait and therefore sorts first.
   */
  readonly daysWaiting: number;
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
};

export type Session = {
  readonly day: Day;
  /**
   * The drills, best-first, truncated to `maxItems`.
   *
   * MAY BE EMPTY, and that is a real state rather than an error: a learner with nothing due has
   * nothing due. The host shows reading instead.
   */
  readonly items: readonly SessionItem[];
  readonly content: ContentRequest;
};
