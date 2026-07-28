import type { Day } from './ids.js';

/**
 * What the engine believes about one unit, in one direction.
 *
 * A discriminated union rather than one object with optional fields. `streak` is only meaningful
 * while learning and `confirmedOn` only once understood — as optional fields on a single shape,
 * that is four representable states of which two are legal, and nothing stops a function reading
 * `confirmedOn` off a unit that never had one. As a union, each variant carries exactly the fields
 * that apply, and the compiler narrows them for you.
 *
 * `readonly` appears on every field rather than being delegated to `Readonly<UnitState>`, because
 * that helper is only one level deep and would happily allow `profile.units[k].seen++`.
 *
 * @module
 */

/**
 * Not yet proven.
 *
 * Reached either by the learner signalling they do not know the word, or by meeting it without
 * proving anything. Both start here — a word is not "known" because nobody asked.
 */
export type Learning = {
  readonly box: 'learning';
  /** Total encounters, of any kind. Never decreases. */
  readonly seen: number;
  /** The last day any evidence arrived for this unit. */
  readonly lastSeen: Day;
  /**
   * Consecutive successful RETRIEVALS — the count that drives promotion.
   *
   * Only real retrievals move it. Passively not asking for help does not, which is what stops the
   * engine recording "knows it" for a word the learner merely skimmed past.
   */
  readonly streak: number;

  /**
   * The day this unit was last **successfully retrieved**, or `0` if it never has been.
   *
   * ⚠️ THE SCHEDULER READS THIS AND NOT {@link Learning.lastSeen}, and the difference is the whole
   * reason the field exists. `lastSeen` is refreshed by passive exposure — reading a word and not
   * asking what it means moves it. So scheduling on `lastSeen` would push every word in today's
   * reading to the back of the drill queue, which is exactly backwards: those are the words the
   * learner is currently meeting.
   *
   * It is the direct counterpart of {@link Understood.confirmedOn}, so both variants answer the same
   * question — "when was this last proven?" — and a scheduler needs no special case for the box.
   *
   * **A failure does not move it.** Only `tested: true` with `outcome: 'known'` does. A learner who
   * just got this wrong should meet it again soon, not be told they have practised it; parking the
   * anchor is what makes that fall out of the arithmetic rather than needing a rule.
   *
   * `0` for never-proven is the identity element of the `later()` fold, which is what keeps the
   * value independent of the order evidence arrives in — the property an offline sync queue needs.
   */
  readonly lastProven: Day;
};

/**
 * Proven, for now.
 *
 * Reached only by passing an actual retrieval. Not a terminal state: a unit here is still eligible
 * for review forever, and failing a later check sends it back to {@link Learning}. Nothing ever
 * graduates out of the pool — cumulative review is where the retention gain lives.
 */
export type Understood = {
  readonly box: 'understood';
  readonly seen: number;
  readonly lastSeen: Day;
  /** The day it was last proven. Drives when it is due for a re-check. */
  readonly confirmedOn: Day;
};

export type UnitState = Learning | Understood;

/** The box a unit is in. Useful for reporting without narrowing the whole union. */
export type Box = UnitState['box'];
