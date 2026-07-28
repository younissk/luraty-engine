# src/core — the pure functions

The decisions live here. Everything is value-in, value-out:

```
plan(profile, options)            → a session, plus a description of the content it needs
record(profile, evidence[])       → a new profile
coverage(profile, pack, query)    → how much of this text the learner knows
serialize(profile) / deserialize(text)
```

`coverage` takes raw TEXT rather than pre-split tokens, and that is a decision rather than a detail
(ADR-0004). The pack owns tokenization and the pack is already an argument; accepting somebody
else's tokens would create a second definition of "running token" that the engine cannot police.
It also returns **no band verdict at all** below 20 running tokens, because below that length the
95–98% band has no representable point — the only reachable coverages are 100% and at most 94.7%.

`plan` takes **no language pack and no seed**, and both are findings rather than omissions
(ADR-0005). Nothing on the four-function pack contract is reachable from a scheduler that has no
text and no answer to grade — so threading a pack through would be a lie about what the function
depends on, and dropping it means a pack bug can never be mistaken for a scheduling bug. A seed is
unnecessary because the selection score is total: serving a unit resets its anchor while every
unserved unit gains a day, so no tie survives that the key tiebreak cannot settle.

## The rules that make this folder work

**No hidden state.** A function takes a profile and returns a profile. This is what lets a test fork
a learner ("what if she had failed this?"), diff two profiles, and bisect a replay that diverged —
none of which is possible if the state is inside an object.

**No I/O, and no ports either.** Time arrives as `day` on the profile. Randomness arrives as a
`seed` in the options, hashed per decision (`hash(seed, day, key)`) so that the _order_ of calls can
never change an outcome. Content is never fetched — `plan()` returns a _description_ of what it
needs and the host goes and gets it. The best injected dependency is the one deleted from the
signature.

**Total functions.** Nothing throws across the public boundary. `deserialize` returns a tagged
result, because a schema change must not brick a learner at app launch.

**Exhaustive switches.** An `assertNever` default, so adding a variant to a union produces a
compiler-generated list of every place that must change.

## Testing this folder

Two property laws are worth writing before the functions are finished, because a scheduler's real
bugs live in the difference between two paths to the same state:

- `record` is a **fold** — applying evidence one at a time equals applying it in a batch.
- `serialize` → `deserialize` **round-trips**, and serialization is canonically key-ordered. JS
  objects keep insertion order, so an unsorted `serialize` makes a fresh profile and a
  saved-then-reloaded one produce different bytes for identical state, and every replay test goes
  randomly flaky.
