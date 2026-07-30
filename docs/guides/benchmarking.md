# Benchmarking, and what breaks

> Status: **implemented**, 2026-07-30. `npm run bench` ships. Every number below was measured on an
> Apple-silicon laptop against the real 10,000-lemma German pack, under Node **and** under Hermes.
> Re-measure before quoting — the point of the lane is that numbers rot.

Every performance number this package ever had was measured on a laptop, under Node, with a JIT.
The engine ships to **Hermes on a phone**, which has no JIT, and to a learner whose profile grows
without bound. "It is fast" was an assumption, not a measurement.

```bash
make bench          # the standard suite, against packs/de, projected onto an older phone
make bench-quick    # two profile sizes, three samples — seconds
make stress         # what it CANNOT take: 250k units, 1 MB texts, adversarial input
```

## How it works

`src/testing/bench.ts` is a **pure program**: the clock is injected, the pack data is passed in,
nothing is read from the filesystem or the environment. That is what lets the same bundle run under
Node and under Hermes — the two numbers are the same bytes doing the same work, which is the only
way a runtime comparison means anything.

`scripts/bench.mjs` bundles it with esbuild (the fingerprint lane's recipe: `iife`, `es2015`,
`platform=neutral`), runs it under both, and projects the Hermes number onto a target device.

Measurement discipline, because getting it wrong is how a benchmark comes to measure itself: every
result is warmed up, batched until the batch out-measures clock resolution — Hermes has no
`performance.now()`, so the clock is millisecond-grained `Date.now()` — sampled several times, and
reported as a **median**. Every operation's result is fed to a sink so nothing can be optimised
away.

**It is not a gate and must never become one.** A wall-clock assertion fails on a busy laptop and
passes on a quiet one. Use `--compare <report.json>` when regression is the actual question; the
report prints a delta column and flags anything past ±15%.

## The budgets

Compared against the **projected device time**, never against the laptop time.

| budget      | why                                                                                            |
| ----------- | ---------------------------------------------------------------------------------------------- |
| **16 ms**   | one frame at 60 Hz. The answer path runs with a finger on the screen; over is a dropped frame. |
| **100 ms**  | the limit for a tap to feel like it caused the thing. Opening a session, saving.               |
| **1000 ms** | where attention leaves the task. Cold launch — and it is the budget for the WHOLE launch.      |

## ⚠️ The device multiplier is an ESTIMATE until you calibrate it

`--device old-2018` multiplies by 8. That number is a guess from single-core class, and single-core
class is a poor proxy for what actually bounds an interpreter, which is memory latency and
allocation rate. The report labels it `ESTIMATED` on every run rather than in a footnote.

**Replacing the guess with a measurement takes ten minutes**, and the machinery is already there:

1. The bundle carries a fixed **calibration kernel** — integer arithmetic, string building, `Map`
   churn and allocation, mixed in roughly the proportion the engine's hot paths use them. The report
   prints its time as `kernel`.
2. Run `reports/bench/bench.js` on the real phone. It is plain ES2015 with no Node APIs and it
   prints with `print()` or `console.log`, whichever exists — so importing it from `App.tsx` and
   reading Metro's console is enough.
3. Take that device's kernel time and pass it back:

   ```bash
   npm run bench -- --pack ../packs/de --baseline 412
   ```

The header then reads `MEASURED` instead of `ESTIMATED`, and every projection in the table is a
measurement of that device rather than an opinion about it.

Until someone does that, read the estimated columns as **shape, not magnitude** — the ranking of the
problems is reliable, the absolute milliseconds are not.

## What the run found (2026-07-30, real German pack)

The Node→Hermes ratio alone is worth knowing: **Hermes is 4–10× slower than Node on this
workload**, and the ratio is not uniform — `serialize` is ~7×, `plan` ~8×, `key` ~8×, while
`record` is only ~2×. A laptop profile would have ranked these differently from how the phone does.

Five things are over budget on an older phone before any pool grows unreasonably:

| what                               | why it matters                                                                                       |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `serialize` at 20k units           | **2.4 MB of JSON on every save**, ~90 ms under Hermes. It grows linearly and it is on the save path. |
| `plan` at 20k units                | 60 ms under Hermes — it scans and sorts the whole pool for a 20-item session.                        |
| `record` (one answer) at 20k units | 7.4 ms under Hermes for ONE answer, because `record` shallow-copies the entire unit map.             |
| `createPack`                       | 323 ms under Hermes, once at launch, for 10k frequency entries + 15k lemma rows.                     |
| `key` over 1,000 tokens            | 7.3 ms under Hermes per screen of text.                                                              |

None of these is a bug. They are all **O(pool)** work on paths that a product calls per answer, per
save and per session, and the profile is the thing that grows forever. The engine is correct and the
shape is the risk.

Two of them have obvious, contained fixes if they ever bite:

- **`serialize` on every save is the sharpest one.** A profile is append-mostly; writing the whole
  blob each time is what makes a 60,000-unit learner cost 7.3 MB and, projected, seconds. This is a
  HOST problem before it is an engine one — the host chooses the save cadence — but the engine could
  offer a delta.
- **`record`'s whole-map copy.** Value-in/value-out is load-bearing and must not be given up, but
  the copy is per CALL, so batching a session into one `record` already collapses twenty copies into
  one. `record.batch20` measures exactly that, and at 20k units it is 8× cheaper than twenty
  singles. **A host should batch.** That is a documentable rule, not a rewrite.

## The stress lane

`make stress` answers the other question — not how fast, but where it stops.

It differs in two ways. It sweeps profile sizes past anything plausible (up to 250,000 units — a
diglossic learner with two full tracks after a decade), and it adds an adversarial set: a 1 MB text
through `split`, a 50,000-token book through `coverage`, 200 unlexicalised 40-character words
through the compound splitter's worst case, a 10,000-item offline sync queue, a priority list as
long as the pool, and a multi-megabyte non-profile through `deserialize`.

**Every scenario runs in its own process**, with a timeout and a heap cap. That is the whole point:
a scenario that exhausts the heap does not return a large number, it kills the process and takes
every scenario queued behind it with it. A crash is caught, recorded as _that scenario's_ limit, and
the sweep continues.

### The hard ceiling: ~196,607 units per profile, on Hermes

The first stress run found a real wall, and it is a _throw_, not a slowdown:

```
FAILED: Property storage exceeds 196607 properties
```

`Profile.units` is a `Record<UnitKey, UnitState>` — a plain JavaScript object — and **Hermes caps a
single object at 196,607 own properties**. Past that the engine does not get slow, it raises. Node
has no such limit, so every test in this package passes at any size and the ceiling is invisible
until a phone hits it.

How much headroom that is: a unit is one word in one direction, so the cap is roughly **98,000
lemmas across both directions**, or ~49,000 if a learner ends up with both directions on everything.
The German pack is 10,000 lemmas. A single-language learner cannot get near it. Two things could:
a host that puts several languages in one profile, or a diglossic pair (Arabic dialect + MSA) held
as two varieties in one `Profile`. Neither is implausible.

Nothing needs changing today. It needs **knowing**, because the fix if it is ever needed — a `Map`
instead of a plain object for `units` — is a wire-format decision, and wire-format decisions are
cheap now and expensive after the first install.

### How it scales, measured

Hermes milliseconds, real German pack, one profile size per row. Everything here is linear in the
pool — no algorithm is quadratic — which is the good news and also the problem: linear work on a
per-answer path against a quantity that only grows.

| units   | `plan` | `record` (one) | `serialize` | `deserialize` | blob size |
| ------- | ------ | -------------- | ----------- | ------------- | --------- |
| 20,000  | 54 ms  | 6.4 ms         | 79 ms       | 49 ms         | 2.4 MB    |
| 60,000  | 185 ms | 20 ms          | 265 ms      | 147 ms        | 7.3 MB    |
| 120,000 | 417 ms | 42 ms          | 562 ms      | 300 ms        | 14.6 MB   |
| 250,000 | throws | throws         | throws      | throws        | 30.6 MB   |

The adversarial set was, by contrast, unremarkable — which is a result. A 1 MB text tokenizes in
58 ms, a 400,000-word non-profile is rejected in 5 ms, 200 worst-case compound words key in 6 ms,
and a 10,000-item offline sync queue folds in 74 ms. The compound splitter's superlinear scan is
held in check by the pack's own 40-character cap. **The engine's risk is size, not shape.**

### ⚠️ `Infinity` does not survive JSON, and that made failures look green

Worth recording because the tool built to find failures had this bug on its first real run.

`runBench` reports a scenario that threw as `medianMs: Infinity`. That is correct in memory and gone
the moment it crosses a process boundary: `JSON.stringify(Infinity)` is `null`, `null * 8` is `0`,
and a driver comparing `0` against a budget prints **ok, in green**. Six genuine Hermes failures at
250,000 units — the ceiling above — were reported as passing.

The fix is a boolean (`BenchResult.failed`) rather than a sentinel value, because a flag survives
serialization and a magic number does not. The general lesson is older than this file: **an
out-of-band value that has to make it through a serializer is a value that will quietly become
in-band.**

## ⚠️ Hermes 0.13.0 does not give loop variables a per-iteration binding

Found by this lane, on its first real run, and worth reading before writing any code in this
package.

ES6 gives a `let`/`const` loop variable a fresh binding per iteration, so a closure built inside the
loop body captures that iteration's value. **Hermes 0.13.0 does not** — every closure sees the last
value, which is the `var` semantics ES6 abolished. Both `for…of` and `for (let i = …)` are affected.

```js
const fs = [];
for (const n of [1, 2, 3]) fs.push(() => n);
fs.map((f) => f()); // Node: [1, 2, 3]   Hermes 0.13.0: [3, 3, 3]
```

Nothing errors. The program runs and quietly computes with one wrong value — which is precisely how
it surfaced: it made every profile-size measurement report the same number, and _"a 20,000-unit
learner costs the same as a 4,000-unit one"_ reads like a performance finding rather than a bug.

**The workaround is a call frame**, which is a fresh binding on every runtime: a factory function,
`.map`, or `.forEach`. `bench.ts` uses factories for exactly this reason and says so at both sites.

Three things bound how much this matters, and they are stated because the honest version is smaller
than the alarming one:

- No file under `src/core`, `src/model` or `src/internal` builds a closure that escapes a loop body,
  so **nothing shipping depends on it today**.
- A real React Native app usually escapes it anyway: Metro runs Babel, whose block-scoping transform
  rewrites the capture. This bundle does not go through Babel, so it sees the raw runtime.
- It is pinned in `fingerprint.ts` as `loop-capture-for-of` / `loop-capture-c-for`, and
  `scripts/hermes.mjs` carries them in a **known-divergence allowlist** that is checked in both
  directions — a listed line that stops differing fails the lane too, so the list cannot rot into an
  excuse. `loop-capture-factory` is pinned alongside them and must NEVER differ; the day it does,
  the advice above is no longer safe either.

Write the factory form regardless. It costs nothing and the bug is silent.
