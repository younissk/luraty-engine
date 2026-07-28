---
'@luraty/engine': patch
---

Add a cross-runtime lane that runs the engine under Hermes and diffs it against Node.

`src/internal/text.ts` is a hand-written replacement for ICU, which Hermes does not ship — but every
test ran on Node, where the ICU-backed APIs all work and hide the bug. `npm run test:hermes` bundles
a deterministic fingerprint of every operation that could differ between engines and compares the
two runtimes line by line. 574 checks are identical today.

No behaviour change; this is verification of behaviour that was previously only asserted.
