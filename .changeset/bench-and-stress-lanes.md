---
'@luraty/engine': patch
---

Add `make bench` and `make stress` — how fast the engine is on the runtime it ships to, and what it
cannot take.

Every performance number this package had was measured on a laptop, under Node, with a JIT. It ships
to **Hermes**, which has none. `src/testing/bench.ts` is a pure program — clock injected, pack data
passed in — so the same esbuild bundle runs under both and the comparison means something.
`--stress` sweeps to 250,000 units and adds an adversarial set, isolating every scenario in its own
process so a crash names one limit instead of killing the sweep.

**Neither is a gate and neither may become one**: a wall-clock assertion fails on a busy laptop and
passes on a quiet one. `--compare <report.json>` is how regression gets asked as a question.

Two findings, both invisible on Node:

- **Hermes 0.13.0 gives a `let`/`const` loop variable one binding for the whole loop**, so a closure
  built in a loop body captures the last value — the `var` semantics ES6 abolished, for both `for…of`
  and `for (let i = …)`. Nothing under `src/core`, `src/model` or `src/internal` builds a closure
  that escapes a loop body, and Metro/Babel rewrites this in a real RN app, so nothing shipping
  depends on it. It silently collapsed every profile-size measurement onto one number first, which
  reads as a performance _finding_ rather than a bug. Pinned in `fingerprint.ts`; `scripts/hermes.mjs`
  grows a known-divergence allowlist checked in **both** directions, so a listed line that stops
  differing also fails the lane.
- **A plain object on Hermes caps at 196,607 own properties**, and `Profile.units` is a plain object.
  Past that the engine throws rather than slows — roughly 98,000 lemmas across both directions.
  Unreachable for one language; not unreachable for a diglossic pair or a multi-language host.

⚠️ The device multiplier in the report is an **estimate** until someone runs the bundled calibration
kernel on a real phone and passes `--baseline`. Every Hermes number above is a raw measurement and
does not depend on it.
