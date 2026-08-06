/**
 * A unit key for something she KNOWS rather than a word she knows.
 *
 * ⚠️ **A GRAMMAR SKILL IS A UNIT, AND THAT IS THE WHOLE POINT.** Founder: *"make grammar skills units
 * the engine schedules."* A rule fades on the same curve a word does; giving grammar its own bespoke
 * scheduler would mean two answers to "what is due today", and they would disagree within a week. As
 * a unit it inherits spacing, the rung ladder, review gaps and `Reassess` for free.
 *
 * ⚠️ **NOTHING IN THE SCHEDULER PARSES A KEY, WHICH IS WHY THIS COSTS NOTHING.** `plan()` reads
 * `profile.units` as opaque keys with state; it never splits one, never filters on the modality
 * segment, never asks what a unit means. Verified before writing this rather than assumed — the only
 * `split(':')` in the engine is in `testing/demo.ts`, for display.
 *
 * ⚠️ **`skill` IS A {@link Modality} (ADR-0022), WHICH IS WHY THIS IS NOW THREE LINES.** It used to
 * hand-cast, because the first segment was typed `Direction` and `unitKey()` would not take it —
 * minting a key the engine's own `parseUnitKey` rejected, and forcing a second arm into `isUnitKey`
 * to keep `persist` from failing every profile that held one. A skill is not asked in a direction —
 * "recognise the past-tense agreement rule" is not a thing — so it sits in the modality slot beside
 * `pronounce` and `hear`, and every key keeps one shape.
 *
 * ⚠️ **A SKILL IS NEVER INTRODUCED BY `plan()`.** New units come from the pack's vocabulary and no
 * pack contains grammar. A skill enters a profile the first time she is asked one: the lesson records
 * evidence, and from that moment it is scheduled like anything else. That is correct rather than a
 * limitation — a rule she has never been taught is not due for review.
 *
 * @module
 */

import type { Modality } from './types/modality.js';
import type { UnitKey } from './types/unitKey.js';
import type { Variety } from './types/variety.js';
import { unitKey } from './unitKey.js';

/**
 * The modality that marks a unit as a skill rather than a word.
 *
 * ⚠️ `as const satisfies Modality`, not `: Modality`. An annotation would WIDEN this from the literal
 * `'skill'` to the whole union, so `` `${SKILL}:` `` would stop being a known string and every
 * consumer narrowing on it would quietly lose the narrowing. `satisfies` checks membership and keeps
 * the literal.
 */
export const SKILL = 'skill' as const satisfies Modality;

export function skillKey(v: Variety, skill: string): UnitKey {
  return unitKey(SKILL, v, skill);
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
