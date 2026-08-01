/**
 * What `day()` can return, given what the caller actually passed. See `VarietyOf` for the mechanism.
 *
 * ⚠️ **`day(0)` typing as `undefined` is the POINT, not a casualty.** All six of the defects that
 * produced the 1-based rule came from a host reaching zero, and now `const d: Day = day(0)` will not
 * compile — `NEVER` is the only way to write it. The sentinel got stronger.
 *
 * ⚠️ The illegal set is tested through `` `${N}` `` because there is no arithmetic at the type level,
 * and each arm is there for a MEASURED reason rather than a symmetric-looking one: `String(-3)` is
 * `"-3"`, `String(1.5)` is `"1.5"`, and **`String(1e-7)` is `"1e-7"`** — no dot and no leading minus,
 * so without the `e-` arm a non-integer literal would type as `Day` while the runtime returned
 * `undefined`. Deliberately NOT rejected: `String(1e21)` is `"1e+21"`, which types as `Day` and is
 * right, because `Number.isInteger(1e21)` is true. Probe any future numeric edge against tsc rather
 * than reasoning about it.
 *
 * @module
 */

import type { Day } from './day.js';

export type DayOf<N extends number> = number extends N
  ? Day | undefined
  : `${N}` extends `-${string}` | `${string}.${string}` | `${string}e-${string}` | '0'
    ? undefined
    : Day;
