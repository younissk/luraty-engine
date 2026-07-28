# @luraty/engine — Claude Code guide

The runtime-agnostic core of Luraty. **This package is the backend; a mobile app is only a
frontend.** It holds the decisions — what to teach, when, how an answer is judged, what happens
next. It must run unchanged under Hermes (React Native), Node, and a browser.

**Nothing is implemented yet.** This is a scaffold. Read this file before adding the first feature.

## The one rule

**Nothing from a UI runtime, a device, or a database may enter this package.** No `react`, no
`react-native`, no `expo-*`, no `@react-navigation/*`, no DOM globals, no database client.

This is **compiler-enforced, not trusted**: this package has its own `node_modules` and none of
those are in it, and module resolution walks only _upward_ — never sideways into a consumer's
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
  (`hash(seed, day, key)`), so the _order_ of calls can never change a decision.
- Content is requested, not fetched: a planning call returns a **description** of what it needs.
  The host goes and gets it. That is what makes the engine testable with no database.

The best injected dependency is the one you removed from the signature. Reach for a port only when
that genuinely fails.

## House style

These are the rules the scaffold already encodes. Keep them.

- **Value in, value out.** Core functions take a state value and return a new one. No hidden
  mutable state — it is what lets a test fork a learner, diff two profiles, and bisect a replay.
- **Make illegal states unrepresentable.** Discriminated unions over optional flags. `readonly` at
  _every_ level — `Readonly<T>` is only one level deep, so it will happily let
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
npm install          # husky installs the hooks via the `prepare` script
npm run check        # format:check + typecheck + lint + test — the whole gate
npm run check:publish # build + publint; the published shape, not the daily loop
```

Hooks are **husky** (`.husky/pre-commit`, `.husky/commit-msg`), installed automatically by
`npm install`. Pre-commit runs `lint-staged` (prettier + eslint --fix on staged files only) then
typecheck and test whole — those two cannot be narrowed to staged files, since `tsc` checks the
program and a test can break from an edit elsewhere. Commit messages are checked by commitlint
against a **closed scope list**: `core` · `model` · `pack` · `ci` · `docs` · `deps`.

All three lanes are also wired into the parent repo's gate, which loops over packages and runs
whichever of `lint` / `typecheck` / `test` each one defines.

**Two rule families are lint errors, not prose.** Both reject in `src/` with tests excepted, and
both carry **no exempt list** — if a file in here seems to need one, that file belongs on the other
side of the boundary.

- **Determinism** — `Date.now()`, `Math.random()`, argless `new Date()`. Recovered from the
  pre-reset config rather than re-derived.
- **Runtime fidelity** — `Intl.*`, `localeCompare()`, `toLocale*Case()`, `normalize()`. Hermes ships
  without full ICU, so these are green on Node and broken on a phone. This one matters more than it
  looks: the first two language-pack functions anyone writes are `split` and `compare`, and their
  idiomatic implementations are `Intl.Segmenter` and `normalize()`. **The obvious code is the broken
  code.** Locale behaviour ships as explicit data in a pack.

**Dependencies are an allowlist, not a denylist.** `src/boundary.test.ts` pins the exact set. A
denylist cannot catch the realistic failure: installing a docs-site generator here pulls Vue or
React into `node_modules`, and `import { ref } from 'vue'` then typechecks green inside `src/`.

⚠️ **`@vitest/coverage-v8` peer-depends on an EXACT vitest patch version.** When coverage is added,
the two must be bumped together or the install breaks. Dependabot groups all devDeps into one PR
partly for this reason.

## Layout

```
src/
  index.ts          the public barrel — a hand-written allowlist, never `export *`
  model/            types only, no behaviour. core/ → model/, never back
  core/             the pure functions: plan, record, coverage, serialize/deserialize
  internal/         mechanisms. NEVER exported from the barrel
  boundary.test.ts
docs/
  concepts/         why the engine is shaped this way — the invariants a newcomer will break
  guides/           how to do one thing, start to finish
```

Each folder has a README stating what belongs in it and what does not. Read the one for the folder
you are about to edit — they carry the rules that the types cannot.

A **language pack** is injected, never imported: four small functions (`split`, `key`, `rank`,
`compare`) plus data (a frequency list, a lemma table). Packs are ideally pure config + data files,
so adding a language is not a code change. The engine never loads the data itself — the host does.
See [docs/guides/adding-a-language.md](docs/guides/adding-a-language.md).

## Distribution

`private: true`, consumed as **TypeScript source** via `file:../engine`. No build in the daily loop.

`npm run build` (tsdown → ESM + `.d.mts`) exists only so the _published_ shape can be checked;
`publishConfig` swaps `main`/`types`/`exports` to `dist/` at publish time, so local source
consumption is unaffected. `npm run check:publish` builds and runs publint.

Versioning is **changesets**, not semantic-release — "is this breaking?" is a judgement about a
contract, not a lookup on a commit prefix. ⚠️ `changeset version` bumps `package.json`, and
`boundary.test.ts` pins `ENGINE_API_VERSION` to it, so the constant must move in the same commit.

## Testing

Vitest is wired. Two property laws are worth writing _before_ the functions they describe are
finished, because a scheduler's real bugs live in the difference between two paths to the same
state:

- `record` is a fold — applying evidence one at a time equals applying it in a batch.
- `serialize` → `deserialize` round-trips, and serialization is canonically key-ordered (JS objects
  keep insertion order, so an unsorted `serialize` makes every replay hash test randomly flaky).

Everything below is deliberately **not yet installed**, each with the trigger that turns it on.
Adding any of them earlier is ceremony; adding them later is negligence.

| Add                                             | When                                                                                                                           |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `fast-check` (property tests)                   | the day `src/model/` types land                                                                                                |
| `expectTypeOf` (already in vitest — no install) | same day; the public types are a contract                                                                                      |
| `@vitest/coverage-v8` + a branch ratchet        | the first real module in `src/core/`, never before — on an empty repo the ratchet starts at 100% and blocks the first feature  |
| goldens via `toMatchFileSnapshot`               | once `plan()` returns a shape. Never put `-u` in an npm script: regenerating a golden is a human deciding what "correct" means |
| a real Hermes lane                              | the first real arithmetic in `src/core/`                                                                                       |
| Stryker, as a hand-run audit                    | the first spacing/rating function. Read the survivors once; never a gate                                                       |

## Docs

Plain markdown under `docs/`, then TypeDoc over the same source when the barrel has real exports.

**Not MkDocs**, despite it being asked for by name — it cannot read TypeScript, so the API reference
would be hand-written and rot, and it puts a Python toolchain in a TypeScript repo. **Not VitePress,
Docusaurus, Starlight or Nextra _in this package_** — see the dependency allowlist above. When a
docs site is genuinely wanted, it goes in a sibling package where its React/Vue cannot reach `src/`.
