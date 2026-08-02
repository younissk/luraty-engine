/**
 * One unit, as the positional row v5 stores.
 *
 * ⚠️ **THE ORDER IS THE FORMAT.** `toRow` and `parseRow` in `core/persist.ts` are the only two
 * functions allowed to know it, and they are written to be read side by side.
 *
 * ⚠️ **`lastHelped` IS APPENDED, NOT INSERTED**, which is the rule {@link WireRowV4} states and the
 * only reason this bump is cheap: every earlier position keeps its index, so `MIGRATIONS[4]` is a
 * push rather than a reshuffle and a misread field is impossible by construction rather than by
 * review. Inserting it after `lastAsked` — where it reads better — would have silently shifted three
 * anchors and a rung.
 *
 * @module
 */
export type WireRowV5 = readonly [
  key: string,
  seen: number,
  lastSeen: number,
  lastAsked: number,
  lastProven: number,
  /** `null` for no claim; the day it was made otherwise. See `Prior`. */
  prior: number | null,
  strength: number,
  lapses: number,
  /** APPENDED in v5. The last day a gloss was tapped. See `UnitState.lastHelped`. */
  lastHelped: number,
];
