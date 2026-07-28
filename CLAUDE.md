# @luraty/engine — Claude Code guide

The runtime-agnostic core of Luraty. **This package is the backend; a mobile app is only a
frontend.** It holds the decisions — what to teach, when, how an answer is judged, what happens
next. It must run unchanged under Hermes (React Native), Node, and a browser.

**Nothing is implemented yet.** This is a scaffold. Read this file before adding the first feature.

## The one rule

**Nothing from a UI runtime, a device, or a database may enter this package.** No `react`, no
`react-native`, no `expo-*`, no `@react-navigation/*`, no DOM globals, no database client.

This is **compiler-enforced, not trusted**: this package has its own `node_modules` and none of
those are in it, and module resolution walks only *upward* — never sideways into a consumer's
tree. So `import { View } from 'react-native'` here does not resolve and `npm run typecheck` fails
with TS2307. `src/boundary.test.ts` asserts the same thing out loud, so it cannot break silently.

⚠️ **Never add this package to an npm workspace, and never add a root `package.json` above it.**
It reads as tidying and it destroys the guarantee: hoisting puts `react-native` in a shared
`node_modules`, the engine resolves it again, and typecheck goes green on exactly the mistake this
package exists to prevent. A consumer links it with `file:` or as a git submodule instead.

## Which way things point

A consumer depends on the engine. Never the reverse. **The engine does not know a screen exists.**

**I/O never enters. It is not injected either — it is designed away.**

- Time is data: `day` lives on the profile and on every piece of evidence. There is nowhere to put
  a clock, so determinism is structural rather than a rule someone has to remember.
- Randomness is arithmetic, not I/O: take a `seed` in the options and derive draws from it
  (`hash(seed, day, key)`), so the *order* of calls can never change a decision.
- Content is requested, not fetched: a planning call returns a **description** of what it needs.
  The host goes and gets it. That is what makes the engine testable with no database.

The best injected dependency is the one you removed from the signature. Reach for a port only when
that genuinely fails.

## House style

These are the rules the scaffold already encodes. Keep them.

- **Value in, value out.** Core functions take a state value and return a new one. No hidden
  mutable state — it is what lets a test fork a learner, diff two profiles, and bisect a replay.
- **Make illegal states unrepresentable.** Discriminated unions over optional flags. `readonly` at
  *every* level — `Readonly<T>` is only one level deep, so it will happily let
  `p.units[k].seen++` through.
- **Exhaustive switches.** An `assertNever` default, so adding a variant becomes a compiler-generated
  list of every place that must change.
- **Parse, don't validate, at the doors.** Anything crossing in from the outside returns a tagged
  result and never throws. A schema change must not brick a learner at app launch.
- **Brand ids in two steps.** `as` is a promise, not a check — assign to the shape type first (that
  is where the template literal actually fires), then brand.
- **Keep the saved shape separate from the domain shape**, and version it. They have opposite
  change policies: one you rename freely, the other has a caller on a phone.
- **No enums, no namespaces, no parameter properties.** `erasableSyntaxOnly` enforces this — the
  package stays erasable to plain JS, which is what lets Metro and Node read the source directly.
- **The barrel is a hand-written allowlist.** Never `export *`.

## Verify

```bash
npm run typecheck && npm run lint && npm test
```

All three are wired into the parent repo's gate, which loops over packages and runs whichever of
`lint` / `typecheck` / `test` each one defines.

**The determinism rule is a lint error, not prose** — `Date.now()`, `Math.random()` and argless
`new Date()` are rejected in `src/` (tests excepted). The config is recovered from the pre-reset
tree rather than re-derived. Note it carries **no exempt list**: if a file in here seems to need
one, that file belongs on the other side of the boundary.

## Planned layout

Nothing below `src/index.ts` exists yet. The intended shape:

```
src/
  index.ts        the public barrel — a hand-written allowlist
  model/          types only: Profile, UnitState, Evidence, Session, LanguagePack
  core/           pure functions: plan, record, coverage, serialize/deserialize
  boundary.test.ts
```

A **language pack** is injected, never imported: four small functions (`split`, `key`, `rank`,
`compare`) plus data (a frequency list, a lemma table). Packs are ideally pure config + data files,
so adding a language is not a code change. The engine never loads the data itself — the host does.

## Testing

Vitest is wired. Two property laws are worth writing *before* the functions they describe are
finished, because a scheduler's real bugs live in the difference between two paths to the same
state:

- `record` is a fold — applying evidence one at a time equals applying it in a batch.
- `serialize` → `deserialize` round-trips, and serialization is canonically key-ordered (JS objects
  keep insertion order, so an unsorted `serialize` makes every replay hash test randomly flaky).
