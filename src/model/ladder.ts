/**
 * The rungs, as data. `Strength` is derived from this so the two cannot drift.
 *
 * ⚠️ Do not inline this into the type. Writing `0 | 1 | 2 | 3 | 4 | 5 | 6` by hand and
 * `MAX_STRENGTH = 6` separately is two statements of one fact, and the day someone raises the
 * ceiling only one of them moves — leaving a constant the type says is illegal.
 *
 * ⚠️ Its own file rather than a line in `constants.ts`, and that is structural rather than
 * stylistic: `types/strength.ts` needs this VALUE to derive from, and `constants.ts` needs the
 * `Strength` TYPE for `MAX_STRENGTH`. Sharing one file would be a runtime import cycle.
 *
 * @module
 */
export const LADDER = [0, 1, 2, 3, 4, 5, 6] as const;
