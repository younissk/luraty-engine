/**
 * One unit, as a FLAT POSITIONAL ROW. **This is the only change v4 makes.**
 *
 * ⚠️ **THE FIELD ORDER BELOW IS THE FORMAT.** It is declared once, here, and `serialize`/`parseRow`
 * are the only two places that may know it. A row read at the wrong offset does not fail — it
 * silently swaps a learner's `lastProven` for their `lastAsked` — so this declaration and the frozen
 * golden are jointly the specification. Never insert a field in the middle; append, and bump the
 * version.
 *
 * ### Why the field names went away
 *
 * v3 stored each unit as `[key, {seen, lastSeen, lastAsked, lastProven, prior, strength, lapses}]`.
 * Those seven names are **73 bytes of pure repetition per unit** — the same seven strings, once for
 * every word a learner has ever met. Measured on a 20,000-unit profile: 2,438,933 bytes total, of
 * which the values are 978,933. The names were 60% of the file.
 *
 * That file is written on every save and parsed before the first frame at launch, on a phone, and
 * both `JSON.stringify` and `JSON.parse` cost scales with its size. **2.44 MB → 0.98 MB.**
 *
 * ### What it costs, honestly
 *
 * A named object is readable in a debugger and survives a field being reordered; a row is neither.
 * Three things answer that, and they are the reason this was judged worth doing rather than merely
 * possible:
 *
 * - `parseRow` validates **every position** as a whole number before it becomes a `UnitState`, so a
 *   shifted field is a `malformed` error naming the unit rather than a silently wrong learner.
 * - The golden test pins the exact bytes, so a reordering is a diff a human has to approve.
 * - It was taken **pre-live, at zero installs**, which is the only window in which the migration is
 *   free. `MIGRATIONS[3]` exists anyway, because the archived goldens still traverse it.
 *
 * @module
 */
export type WireRowV4 = readonly [
  key: string,
  seen: number,
  lastSeen: number,
  lastAsked: number,
  lastProven: number,
  /** `null` for no claim; the day it was made otherwise. See `Prior`. */
  prior: number | null,
  strength: number,
  lapses: number,
];
