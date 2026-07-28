# Determinism

> The same profile, the same inputs and the same seed must always produce the same result — on your
> laptop, in CI, and on a phone.

This is the engine's one load-bearing claim. Everything else in the design exists to protect it.

## Why it matters more here than in most libraries

You cannot A/B test a learning algorithm on one person. If you change how review intervals are
chosen, the only honest way to find out whether the new version is better is to **simulate thousands
of learners** and compare outcomes — and a simulation is worthless if two runs of the same inputs
disagree.

Determinism is also what makes bug reports cheap. "It scheduled the wrong thing on day 40" is
unactionable in most systems. Here it is a profile, a seed, and a replay.

## What that forbids

| Forbidden                                | Why                                                                       | Instead                                                |
| ---------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------ |
| `Date.now()`, argless `new Date()`       | wall time is an invisible input; a replay cannot reproduce it             | `day` is on the profile and on every piece of evidence |
| `Math.random()`                          | unseeded, and unreproducible                                              | a `seed` in the options                                |
| `Intl`, `localeCompare()`, `normalize()` | ICU-backed; Hermes ships without full ICU, so results differ _by runtime_ | explicit data in a language pack                       |

All three are **lint errors**, not conventions. The rule has no exempt list: if a file in `src/`
seems to need one, that file belongs on the other side of the boundary.

## Seeds, not streams

A seeded random _stream_ is not enough. If the engine holds a stateful generator, replay depends on
reproducing the exact number and order of draws — and a screen that remounts and calls `plan()`
twice silently shifts every decision after it. Worse, `plan()` on the same profile would return two
different sessions, so "same seed, same session" would simply be false.

So randomness is derived **per decision** from data:

```ts
hash(seed, day, unitKey);
```

Call order stops mattering, because there is no order.

## The one caveat worth writing down

`Math.exp`, `Math.log` and `Math.pow` are implementation-defined in their last bit and can differ
between Hermes and Node. So "bit-identical across runtimes" holds only for `+ − × ÷` and
comparisons.

This is a live argument for keeping the scheduler arithmetic simple: a fixed interval ladder is
exactly reproducible everywhere, while an FSRS-style `exp(-t/S)` curve is not. If a decay curve is
ever genuinely needed, quantise the result to a fixed grid before anything compares it.
