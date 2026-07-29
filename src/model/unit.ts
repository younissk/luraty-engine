import { NEVER, type Day } from './ids.js';

/**
 * What the engine believes about one unit, in one direction and variety.
 *
 * @module
 */

/**
 * The rungs, as data. The literal union below is derived from it so the two cannot drift.
 *
 * ⚠️ Do not inline this into the type. Writing `0 | 1 | 2 | 3 | 4 | 5 | 6` by hand and
 * `MAX_STRENGTH = 6` separately is two statements of one fact, and the day someone raises the
 * ceiling only one of them moves — leaving a constant the type says is illegal.
 */
const LADDER = [0, 1, 2, 3, 4, 5, 6] as const;

/**
 * How sure the engine is that this unit is known, as a rung on a bounded integer ladder.
 *
 * A literal union rather than a bare `number`, because this is where *make illegal states
 * unrepresentable* now lives: a rung of 7 must not typecheck, and a rung of 2.5 must not either.
 *
 * Integer and bounded, for the same reason {@link COVERAGE_BAND} is integer: nothing here has a
 * rounding or formatting behaviour that could differ between Hermes and Node. A float ladder would
 * put the definition of "known" on the wrong side of the cross-runtime lane.
 */
export type Strength = (typeof LADDER)[number];

/**
 * The ceiling. A unit cannot become more consolidated than this.
 *
 * ⚠️ PROVISIONAL, in exactly the sense the old `PROMOTE_AFTER_SUCCESSES` was, and for the same
 * reason: the literature is emphatic that consolidation matters and quiet about the number. Unlike
 * that constant, this one has been swept — see `strength.sweep.test.ts`, which measures known-count
 * trajectories across the ladder at three accuracy levels. The sweep says 6 is not a knife-edge, not
 * that 6 is correct.
 */
export const MAX_STRENGTH: Strength = 6;

/**
 * At or above this rung, a unit counts as KNOWN — for `coverage()`, for `summarize()`, and for the
 * review gap. This one number is the entire definition; there is no box any more.
 *
 * Deliberately equal to the old `PROMOTE_AFTER_SUCCESSES`, so that the v2→v3 migration moves
 * nobody's coverage number: a v2 `understood` unit had exactly two proofs behind it and lands
 * exactly here.
 */
export const KNOWN_AT_STRENGTH: Strength = 2;

/**
 * How the ledger moves. Integers, and the ASYMMETRY IS THE DESIGN.
 *
 * Expected drift per drill at accuracy `a` is `gain * a - missRetrieval * (1 - a)`, which is
 * positive above `a = missRetrieval / (gain + missRetrieval)` — **66.7%**. So the break-even is a
 * *consequence* of these two numbers rather than a third guess, and the ledger becomes a CLASSIFIER
 * ("does she know this word?") rather than a smoothed readout of her global error rate.
 *
 * That distinction is the whole of gap 3. Under the old rule — promote on 2 consecutive successes,
 * demote fully on 1 failure — the steady-state known count was measured at `accuracy x pool` over
 * 720 simulated days: place a learner at 800 words and 90% accuracy and the number settles at ~720
 * and never climbs, because the ledger was reporting how often she slips rather than how much she
 * knows. A symmetric ±1 ladder would put break-even at 50%, which softens gap 3 in the wrong
 * direction: it would report a 60%-accurate learner as knowing almost everything.
 *
 * `missHelp` is smaller because tapping a gloss is a real negative signal and a weaker one than
 * failing a retrieval outright. It is NOT a lapse — see {@link UnitState.lapses}.
 */
export const STRENGTH_STEP = {
  gain: 1,
  missRetrieval: 2,
  missHelp: 1,
} as const;

/**
 * Read a rung arriving from storage. Total; returns `undefined` for anything that is not a rung.
 *
 * The parse door's narrow form: `deserialize` must reject a corrupt value rather than coerce it,
 * because a coerced rung is a silent change to what the learner is told they know.
 */
export function strengthOf(n: number): Strength | undefined {
  return LADDER.find((rung) => rung === n);
}

/**
 * Saturating, and total on every number including `NaN` and `Infinity`.
 *
 * Used by the fold, where the arithmetic is bounded by construction and this is belt-and-braces, and
 * by `parseUnit`, where it is load-bearing: a blob written by a build with a HIGHER ceiling must
 * still load. That asymmetry — reject a non-whole rung, clamp an over-large one — is what lets
 * `MAX_STRENGTH` be lowered after a sweep as a code change rather than a wire bump.
 *
 * `Math.trunc` before clamping, so `2.7` lands on 2 rather than being rejected; `NaN` truncates to
 * `NaN`, fails both comparisons, and falls out at 0 through the `??`.
 */
export function clampStrength(n: number): Strength {
  return LADDER[Math.min(Math.max(Math.trunc(n), 0), MAX_STRENGTH)] ?? 0;
}

/**
 * What the host asserted about this unit before anybody measured anything.
 *
 * ⚠️ A DISCRIMINATED UNION AND NOT A `claimedOn: Day` WITH `0` MEANING "NEVER". The never-sentinel
 * is tolerable for {@link UnitState.lastProven} — it is documented there, and the one ambiguous case
 * (a unit genuinely proven on day 0, in a host whose epoch is day 0) merely drills it once too
 * early. It is NOT tolerable here, because a placement on day 0 of a fresh profile is the NORMAL
 * case, not an edge one. Under a sentinel it would silently relabel 800 claimed units as brand-new,
 * costing them their `'verify'` label, their honest anchor, and their exemption from the
 * new-material cap — on exactly the day the feature exists for.
 *
 * It also restores the compiler-generated worklist that collapsing `Learning | Understood` gave up,
 * and puts it on the axis where a new variant will actually arrive: a scored placement, or an import
 * from another app.
 */
export type Prior =
  | { readonly kind: 'none' }
  | {
      /** The host says she knows this. Nobody has checked. */
      readonly kind: 'claimed';
      /** The day the claim was made. Monotone max-fold, so re-claiming is safe and order-free. */
      readonly on: Day;
    };

/**
 * What the engine believes about one unit.
 *
 * ⚠️ ONE SHAPE, NOT A UNION. `Learning | Understood` is gone, and this is the load-bearing
 * structural change in v3.
 *
 * The union earned its keep on a specific argument: *"`streak` is only meaningful while learning and
 * `confirmedOn` only once understood"*. Under a rung ladder that argument evaporates — every field
 * below is meaningful in every state, and `confirmedOn`/`lastProven` stop being two names for one
 * fact. (`plan.ts`'s `provenOn()` already treated them as one question and said so out loud.) A
 * union whose variants carry identical fields is not making anything unrepresentable; it is a switch
 * statement standing where a field read belongs.
 *
 * *Make illegal states unrepresentable* has not been given up, it has MOVED to where illegal states
 * are actually reachable: {@link Strength} is a literal union, {@link Prior} is a discriminated
 * union, and {@link Evidence} became one. The count of exhaustive switches in the package is
 * unchanged.
 *
 * `readonly` on every field rather than `Readonly<UnitState>`, which is only one level deep and
 * would happily allow `profile.units[k].seen++`.
 *
 * ### Three anchors, nested by strictness
 *
 * `lastSeen ⊇ lastAsked ⊇ lastProven`. One date was being asked three different questions — when do
 * I schedule this, have I ever checked it, do I trust it — and answering all three from `lastProven`
 * is what pinned failing words at the head of the queue forever.
 */
export type UnitState = {
  /**
   * Total ENCOUNTERS, of any kind: a retrieval, a passive sighting, a gloss tap. Never decreases.
   *
   * ⚠️ A claim does NOT increment this. Nobody encountered anything — the host asserted something.
   * Keeping `seen` honest is why `record.property.test.ts`'s law reads
   * "sum(seen) === the number of non-claim items" rather than `evidence.length`.
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
   * ⚠️ THE SCHEDULING ANCHOR (together with {@link Prior}), and splitting it out from `lastProven`
   * IS the fix for the leech wall. A word she keeps failing must come back soon and then LEAVE;
   * anchoring the sort on proof alone means its wait grows without bound, so it is pinned at the
   * head of the queue forever. Measured on a pool of 210 with ten always-failed words at 20 slots a
   * day for 60 days: **44% of every slot**, against a 4.8% fair share. Moving this on every ask, and
   * nothing else, is the whole repair — no backoff, no new constant.
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

  /** What the host claimed before anything was measured. See {@link Prior}. */
  readonly prior: Prior;

  /** The ledger. `>= KNOWN_AT_STRENGTH` is what "known" means. See {@link STRENGTH_STEP}. */
  readonly strength: Strength;

  /**
   * Consecutive FAILED retrievals. Reset to 0 by any success. Never moved by exposure or help.
   *
   * ⚠️ REPORT-ONLY. It reaches no comparator and no gap; it exists so `plan()` can populate
   * {@link Session.stuck}. A backoff — showing a repeatedly-failed word less often — was designed and
   * rejected twice over: it costs uncalibrated constants, and it makes a word she is failing appear
   * LESS, which for an acquisition frontier is backwards. A word failed six times running is a
   * content or method problem, and the honest engine response is to name it, not to hide it.
   */
  readonly lapses: number;
};

/**
 * The state of a unit nothing has ever said anything about.
 *
 * Every date is `0` — never seen, never asked, never proven — rather than the current day. v2's
 * accessor defaulted `lastSeen` to `profile.day`, which asserted a sighting that never happened.
 * Zero is also the identity element of the `later()` fold in `record`, which is what keeps every
 * date independent of the order evidence arrives in.
 *
 * A frozen shared value rather than a factory: it is deeply `readonly`, so there is nothing to
 * copy-protect, and one instance means `unitState()` on a large profile allocates nothing.
 */
export const UNMET: UnitState = Object.freeze({
  seen: 0,
  lastSeen: NEVER,
  lastAsked: NEVER,
  lastProven: NEVER,
  prior: Object.freeze({ kind: 'none' as const }),
  strength: 0,
  lapses: 0,
});

/**
 * How strong this unit is once a CONFIRMED claim is taken into account.
 *
 * ⚠️ **A CLAIM THAT HAS BEEN CHECKED IS WORTH ONE RUNG, and this is the only place it counts for
 * anything.** A bare claim is still worth nothing at all — the bonus needs `lastProven`, which only
 * a successful retrieval can move.
 *
 * ### Why this exists
 *
 * Simulated: a heritage speaker places at 2,558 claimed words and drills 15 a day. Her queue is
 * 2,587 units, so a word comes back roughly every **172 days** — and the known rung needs TWO
 * proofs. Twelve weeks in she had proven 1,085 of her claims, was reading the sample passage at
 * 100%, and the engine still reported **0 words known**. `coverage()` said `'too-hard'` on that same
 * passage every single week, and got *worse* as she worked, because verifying a claim moves it out
 * of the claimed bucket (which could have flipped the verdict) and into rung 1, which reads as
 * plain unknown.
 *
 * A claim plus an independent retrieval is **two signals from different sources**, which is what the
 * known rung was ever meant to represent. One proof on an UNCLAIMED word still lands at rung 1 and
 * is still not known, so nothing is inflated.
 *
 * ### Why it is DERIVED and not folded in
 *
 * The obvious implementation gives the first proof of a claimed word `+2` inside `applyOne`. That
 * would make the claim path order-dependent for the first time: `[proof, claim]` and
 * `[claim, proof]` would disagree, because the proof would not yet have seen the claim. An offline
 * queue makes no ordering promise, so two learners who did identical work would get different
 * numbers. Computing it on read costs nothing and keeps `record` commutative on this path —
 * `record.test.ts` pins that both orders converge.
 *
 * ### It can still be taken away
 *
 * The bonus rides on `strength`, not instead of it. A claimed word proven once sits at raw rung 1,
 * effective 2 — and one failed retrieval takes the raw rung to 0, so the effective rung drops to 1
 * and it stops counting as known. Nothing here is permanent.
 */
export function effectiveStrength(state: UnitState): Strength {
  const confirmedClaim = state.prior.kind === 'claimed' && state.lastProven !== NEVER;
  return confirmedClaim ? clampStrength(state.strength + 1) : state.strength;
}

/**
 * Is this unit known?
 *
 * ⚠️ THE one predicate, exported so that nothing reimplements it. Under the old two-box model this
 * was `state.box === 'understood'`, written out longhand in `coverage.ts` as an exhaustive switch
 * precisely so a third box could not be silently misclassified. The ladder makes that structural
 * risk vanish and replaces it with a numeric one: `>=` written as `>` somewhere would move every
 * learner's coverage number with nothing failing to compile. One definition, one place.
 */
export function isKnown(state: UnitState): boolean {
  return effectiveStrength(state) >= KNOWN_AT_STRENGTH;
}

/**
 * Claimed, and never yet asked about — the liability a placement creates.
 *
 * This is the predicate behind `Why.'verify'` and behind `Summary.claimsStanding`. Note that it is
 * *not* "has a claim": a claim survives being checked, which is what makes the confirmed/refuted
 * split computable from present state with no history at all.
 */
export function hasStandingClaim(state: UnitState): boolean {
  return state.prior.kind === 'claimed' && state.lastAsked === NEVER;
}
