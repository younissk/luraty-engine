// Utilities — mechanisms that belong to no module.
//
// This is the folder `internal/` used to be, renamed and narrowed. **Nothing here is ever exported
// from `src/index.ts`**; that was `internal/`'s whole point and it survives unchanged. What changed
// is the admission rule, which used to be "small and mechanical" and is now checkable.
//
// ⚠️ TWO CLAUSES, AND BOTH MUST HOLD:
//
//   1. the signature mentions **no domain type** — no `Profile`, `UnitState`, `NormalizeStep`;
//   2. the body knows **no module's vocabulary** — no languages, no rungs, no wire offsets.
//
// Both are needed, and the near misses are the proof. All three of these were in `internal/text.ts`
// and none of them qualify:
//
//   `applyStep(step, s)`     — clause 1 fails. `NormalizeStep` is a domain type.
//   `foldGermanUmlauts(s)`   — clause 1 passes, clause 2 fails: it knows German, and knows that
//                              German wants the OPPOSITE fold from French. Moved to `normalize/`.
//   `isNormalizeStep(v)`     — takes `unknown`, returns a domain predicate. `normalize/`.
//
// A function that passes both can be read, tested and replaced without knowing what this package is
// for — which is the only thing that makes a `utils/` folder something other than a junk drawer.
//
// @module

export { assertNever } from './assertNever.js';
export { foldTable } from './foldTable.js';
export { transform } from './transform.js';
