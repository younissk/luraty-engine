/**
 * A unit key for something she KNOWS rather than a word she knows.
 *
 * ⚠️ **A GRAMMAR SKILL IS A UNIT, AND THAT IS THE WHOLE POINT.** Founder: *"make grammar skills units
 * the engine schedules."* A rule fades on the same curve a word does; giving grammar its own bespoke
 * scheduler would mean two answers to "what is due today", and they would disagree within a week. As
 * a unit it inherits spacing, the rung ladder, review gaps and `Reassess` for free.
 *
 * ⚠️ **NOTHING IN THE SCHEDULER PARSES A KEY, WHICH IS WHY THIS COSTS NOTHING.** `plan()` reads
 * `profile.units` as opaque keys with state; it never splits one, never filters on the direction
 * segment, never asks what a unit means. Verified before writing this rather than assumed — the only
 * `split(':')` in the engine is in `testing/demo.ts`, for display.
 *
 * ⚠️ **`skill` SITS WHERE A `Direction` NORMALLY SITS**, deliberately, so every key in a profile keeps
 * the same three-part shape. A skill is not asked in a direction — "recognise the past-tense
 * agreement rule" is not a thing — so the slot is free, and reusing it keeps one key format rather
 * than two.
 *
 * ⚠️ **A SKILL IS NEVER INTRODUCED BY `plan()`.** New units come from the pack's vocabulary and no
 * pack contains grammar. A skill enters a profile the first time she is asked one: the lesson records
 * evidence, and from that moment it is scheduled like anything else. That is correct rather than a
 * limitation — a rule she has never been taught is not due for review.
 *
 * @module
 */

import type { UnitKey } from './types/unitKey.js';
import type { Variety } from './types/variety.js';

/** The segment that marks a unit as a skill rather than a word. */
export const SKILL = 'skill';

export function skillKey(v: Variety, skill: string): UnitKey {
  return `${SKILL}:${v}:${skill}` as UnitKey;
}

/**
 * Whether a key names a skill.
 *
 * ⚠️ For a HOST deciding what to draw, never for the scheduler deciding what is due. The moment the
 * engine branches on this, grammar has its own scheduler again.
 */
export function isSkill(unit: UnitKey): boolean {
  return String(unit).startsWith(`${SKILL}:`);
}
