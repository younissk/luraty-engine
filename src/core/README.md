# src/core — the pure functions

The decisions live here. Everything is value-in, value-out:

```
plan(profile, pack, options)      → a session, plus a description of the content it needs
record(profile, evidence[])       → a new profile
coverage(profile, pack, tokens)   → how much of this text the learner knows
serialize(profile) / deserialize(text)
```

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
