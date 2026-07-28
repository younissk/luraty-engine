import { fingerprint } from './fingerprint.js';

/**
 * Entry point for the bundled Hermes run.
 *
 * Hermes has no module system and no `console` guarantee, but it does provide a global `print`.
 * Node provides `console.log` and no `print`. This picks whichever exists so one bundle runs on
 * both, which is the entire point — the two runtimes must execute the same bytes.
 *
 * @module
 */

// Both are declared locally rather than pulled from a lib. The package's `tsconfig` has no `dom`
// and no `@types/node` on purpose — a runtime-agnostic core must not be able to reach either — so
// neither global exists in the type system here, and this file is the one place that needs them.
declare const print: ((s: string) => void) | undefined;
declare const console: { log: (s: string) => void } | undefined;

const out = fingerprint();

if (typeof print === 'function') {
  print(out);
} else if (typeof console !== 'undefined') {
  console.log(out);
} else {
  throw new Error('hermes-entry: runtime has neither print() nor console.log()');
}
