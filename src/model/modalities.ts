/**
 * The channels a piece of knowledge can be held in, as data. `Modality` is derived from this so the
 * two cannot drift.
 *
 * ⚠️ **THE FIRST SEGMENT OF EVERY UNIT KEY, AND THE REASON A TOOL COSTS THE ENGINE NOTHING**
 * (ADR-0022). `plan()` never parses a key — it reads `profile.units` as opaque addresses with rungs
 * — so a new modality inherits spacing, the rung ladder, review gaps, `Reassess` and stuck-detection
 * for free. Grammar proved it: `skill:ar:<id>` is scheduled by the same `plan()` as a word, with no
 * branch anywhere.
 *
 * ⚠️ **`skill` LIVES HERE RATHER THAN BEING SMUGGLED IN.** It used to be a hand-written cast in
 * `skillKey` that bypassed `unitKey`, plus a second arm in `isUnitKey` to stop `persist` rejecting
 * the key it had just minted — and `persist` fails the WHOLE profile on one unparseable key, so a
 * learner who did one grammar lesson could never load hers again. That bug was found by reading
 * `persist`, not by a test. Pronunciation and writing would have been smuggles two and three.
 *
 * ⚠️ Its own file rather than a line in `constants.ts`, and that is structural rather than stylistic:
 * `types/modality.ts` needs this VALUE to derive from, and `constants.ts` needs the `Modality` TYPE.
 * Sharing one file would be a runtime import cycle. Same shape as `ladder.ts` / `types/strength.ts`.
 *
 * ⚠️ **ORDER IS NOT A RANKING** and nothing may depend on it. The first two are `Direction` — the
 * recognise/produce asymmetry that is the measured core of the learner model (ADR-0002) — and they
 * come first only because they are the two that existed.
 *
 * @module
 */
export const MODALITIES = [
  /** She understood it when she met it. */
  'recognise',
  /** She produced it from meaning. */
  'produce',
  /** She said it, and the sounds were right. */
  'pronounce',
  /** She wrote it. */
  'write',
  /** She understood it by ear, with no text in front of her. */
  'hear',
  /**
   * A grammar rule she holds, rather than a word.
   *
   * ⚠️ Never introduced by `plan()` — no pack contains grammar. A skill enters a profile the first
   * time she is asked one, which is correct rather than a limitation: a rule she has never been
   * taught is not due for review.
   */
  'skill',
] as const;
