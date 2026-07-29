import type { Day, UnitKey } from './ids.js';

/**
 * One observation about the learner.
 *
 * ⚠️ THE IMPORTANT PROPERTY, UNCHANGED SINCE v1: evidence describes the LEARNER, not the exercise.
 *
 * There is no `source: 'flashcard' | 'cloze' | 'speech'` field and there should never be one. A word
 * tapped while reading, a failed recall, a hesitation mid-sentence and a wrong answer on a test all
 * arrive here in the same shape. That is what lets a speaking exercise be added in six months
 * without the core changing at all — the core cannot tell where anything came from, so it cannot
 * grow a dependency on it.
 *
 * @module
 */

/** What a retrieval said about the learner's knowledge. Lives ONLY on {@link Retrieval}. */
export type Outcome = 'known' | 'unknown';

/**
 * A real retrieval: she was asked, and she answered.
 *
 * The only variant that can raise {@link UnitState.strength}, and the only one that moves
 * {@link UnitState.lastAsked}. Everything the engine trusts, it trusts because of one of these.
 */
export type Retrieval = {
  readonly kind: 'retrieval';
  readonly unit: UnitKey;
  readonly outcome: Outcome;
  readonly day: Day;
};

/**
 * Met it and moved on. Reading a word in a passage and not asking about it.
 *
 * ⚠️ NO `outcome` FIELD, so "passive and wrong" is structurally unrepresentable here — that is
 * {@link Help}, which says what the learner actually DID rather than what somebody inferred. Under
 * v2 this was `{ tested: false, outcome }`, and the ordering of the branches in `applyOne` meant
 * `{ tested: false, outcome: 'unknown' }` demoted an understood unit outright: four months of proof
 * erased by a gloss tap, with no test covering it. Splitting the variants makes that unwritable.
 *
 * Exposure moves `seen` and `lastSeen` and NOTHING else. It cannot promote — a heritage speaker
 * often recognises a word's shape while holding only its domestic sense, and will not ask; letting
 * not-asking count as knowing would make the register gap this engine exists to find invisible by
 * construction.
 */
export type Exposure = {
  readonly kind: 'exposure';
  readonly unit: UnitKey;
  readonly day: Day;
};

/**
 * Tapped the gloss, or revealed the answer.
 *
 * The amendment every critique lens reached independently: *"only a real retrieval counts"* justifies
 * refusing to PROMOTE on a passive signal, not refusing to RECORD a negative one. Asking for help is
 * the learner telling you she does not have it — the single most informative thing that happens
 * while reading, and v2 threw it away or, worse, treated it as a full failure.
 *
 * Costs {@link STRENGTH_STEP.missHelp}, and is deliberately NOT a lapse: she did the right thing.
 */
export type Help = {
  readonly kind: 'help';
  readonly unit: UnitKey;
  readonly day: Day;
};

/**
 * The host asserts prior knowledge. Nobody has checked.
 *
 * ⚠️ THIS IS THE ENTIRE SHAPE OF THE FACT A PLACEMENT HANDS OVER. The METHOD stays in the host, and
 * that is settled: self-assessment, a checklist, imitation, a scored instrument or a combination are
 * genuine product decisions with several defensible answers, and the engine takes no position.
 *
 * There is no confidence number and no `basis: 'self-report' | 'placement'`, because the engine would
 * treat them identically — so both would be invisible to the learner while looking like rigour.
 *
 * It arrives through `record()` rather than through a `seedProfile()` side door, and that is decided
 * by the house rule rather than by taste: the evidence log is the truth and a profile is a fold over
 * it, so the strategy for a changed memory model is a RE-FOLD. A placement that never entered the
 * log would be lost on the first one.
 *
 * A claim sets {@link UnitState.prior} and touches nothing else — not `strength`, not `seen`, not
 * `lastAsked`. It buys no head start: the first successful retrieval on a claimed word lands at
 * `strength: 1`, exactly like a word nobody ever claimed. That is what makes it structurally
 * incapable of overwriting a measurement, and what makes re-placing at month six safe with no
 * "never overwrite" rule that somebody has to remember.
 */
export type Claim = {
  readonly kind: 'claim';
  readonly unit: UnitKey;
  readonly day: Day;
};

/**
 * One observation about the learner.
 *
 * ⚠️ CLOSED AT FOUR, and the axis is what a learner can DO that tells you something: prove it, meet
 * it and move on, meet it and ask, or state it unasked. A fifth member needs a fifth learner
 * behaviour, not a fifth exercise type. That is what closes the set, and it is the same rule that
 * keeps `flashcard | cloze | speech` out.
 *
 * ⚠️ There is deliberately NO `purpose: 'practice' | 'assessment'` axis. It is the exercise's
 * framing, which this module's own rule excludes; the magnitude that would carry it (a larger
 * demotion for a formal miss) is invented, with nothing measuring it; and it is untagged host data
 * crossing a trust boundary, so a host that mislabels poisons the ledger with no way for the engine
 * to detect it. "A re-measurement is indistinguishable from a bad morning" is answered where a
 * measurement belongs — in the host's decision to take a {@link Summary} snapshot.
 *
 * ### What each variant may do — the complete table, and the only place it is written down
 *
 * | variant             | seen | lastSeen | lastAsked | lastProven | strength | lapses | prior |
 * | ------------------- | ---- | -------- | --------- | ---------- | -------- | ------ | ----- |
 * | retrieval + known   | +1   | → day    | → day     | → day      | +1 (cap) | → 0    | –     |
 * | retrieval + unknown | +1   | → day    | → day     | –          | −2 (flr) | +1     | –     |
 * | exposure            | +1   | → day    | –         | –          | –        | –      | –     |
 * | help                | +1   | → day    | –         | –          | −1 (flr) | –      | –     |
 * | claim               | –    | –        | –         | –          | –        | –      | set   |
 *
 * "→ day" is `later(current, evidence.day)` — monotone, so an out-of-order offline queue converges
 * on the same answer whatever order it drains in.
 */
export type Evidence = Retrieval | Exposure | Help | Claim;

/** The tag. Useful for reporting without narrowing the whole union. */
export type EvidenceKind = Evidence['kind'];
