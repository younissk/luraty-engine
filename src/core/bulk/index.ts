// Doing one thing to many words.
//
// ⚠️ **THIS MODULE EXISTS BECAUSE THE SAME LOOP WAS HAND-WRITTEN FIVE TIMES.** `vocabularyOf` lived
// in `testing/` and was never exported, so the identical "split the frequency list, key each word,
// drop empties, drop duplicates" loop was then rewritten in `testing/demo.ts`, twice in a script,
// and in two pack build scripts. Writing a helper five times and publishing it zero times is the API
// missing it, not the callers being lazy.
//
// Everything here is a pure transform over strings — no I/O, no new concepts, nothing that touches
// the state model. Each one is the shortest honest way to express something every host does on day
// one.
//
// @module

export { claimsFor } from './claimsFor.js';
export { exposuresFor } from './exposuresFor.js';
export { keysFor } from './keysFor.js';
export { vocabularyOf } from './vocabularyOf.js';
export { wordsIn } from './wordsIn.js';
