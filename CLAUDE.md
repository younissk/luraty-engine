# @luraty/engine — Claude Code guide

The runtime-agnostic core of Luraty. **This package is the backend; a mobile app is only a
frontend.** It holds the decisions — what to teach, when, how an answer is judged, what happens
next. It must run unchanged under Hermes (React Native), Node, and a browser.

**Built so far:** the learner state and the evidence fold (`record`), persistence
(`serialize`/`deserialize`), language packs (`createPack`/`checkPack`), coverage, the scheduler
(`plan`), and reporting (`summarize`). Read this file before adding the next piece.

⚠️ **Wire v3 landed 2026-07-29 (ADR-0006) and it changed the shape of a unit.** A unit is a rung
ladder (`strength: 0..6`, known at 2) with three anchors — `lastSeen ⊇ lastAsked ⊇ lastProven` —
plus a `prior`. `Learning | Understood | Box | PROMOTE_AFTER_SUCCESSES` are **gone**; `Evidence` is a
four-member union (`retrieval` / `exposure` / `help` / `claim`) instead of a record with
`tested: boolean`; `PlanOptions.maxNew` is **required**. Anything you find that still talks about
boxes or `tested` is archaeology.

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

`make` on its own lists every command with one line each. Every target is a thin wrapper over an
npm script — the scripts stay authoritative, the `Makefile` is the map. `make verify` is the gate
plus the cross-runtime lane.

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
  core/             the pure functions: plan, record, coverage, summarize, serialize/deserialize
  internal/         mechanisms. NEVER exported from the barrel
  testing/          generators and fixtures. NEVER exported from the barrel either
  boundary.test.ts
docs/
  concepts/         why the engine is shaped this way — the invariants a newcomer will break
  guides/           how to do one thing, start to finish
```

Three test files carry more weight than their names suggest:

- **`core/gaps.test.ts`** — the five measured failures ADR-0006 fixed, each with the OLD reading in a
  comment. Four of the five were silent, so a regression would be silent too.
- **`core/*.sweep.test.ts`** — audits of a CONSTANT, not specs of a behaviour. They simulate whole
  years, carry a 60s timeout, and are excluded from the mutation lane via `vitest.mutate.config.ts`.
- **`testing/evidence.ts`** — one generator, all four evidence kinds, plus `kindsIn` so a suite can
  assert it saw them. It exists because the mechanical fix when `Evidence` became a union (pin
  `kind: 'retrieval'`) would have left every property law green and covering one variant in four.

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

Layers are chosen by **failure class**, not by tool. A layer catching the same class as another is
a cost dressed up as rigour, so each row below names the bug nothing else would find.

| Layer         | Where                       | Catches, uniquely                                                                                                                                              |
| ------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Examples      | `*.test.ts`                 | A rule being wrong. Found the apostrophe/affix ordering bug.                                                                                                   |
| Properties    | `*.property.test.ts`        | Inputs nobody would think to type. Found `key('constructor')` returning a **function**, in seconds.                                                            |
| Sequences     | `sequence.property.test.ts` | Anything only wrong ACROSS operations. The fold law cannot see it — both its paths break identically. Found time running backwards on offline sync.            |
| Simulation    | `simulation.test.ts`        | Rules individually right and wrong in combination, over 90 days, asserted after **every** day.                                                                 |
| Wire golden   | `wire-v1.golden.test.ts`    | Silent behaviour drift. Every other test is written in terms of the rules, so changing a rule changes its test too; a frozen string cannot rationalise.        |
| Types         | `api.types.test.ts`         | A type quietly widening. Breaks nothing today, breaks every consumer later, suite green throughout.                                                            |
| Conformance   | `checkPack.ts`              | The engine right and the DATA wrong. No unit test reaches it: fixtures are correct by construction, and the input that fails is the host's real 20k-word file. |
| Cross-runtime | `npm run test:hermes`       | The code being right on your laptop and wrong on the phone. **Every other layer runs on Node**, where the ICU-backed APIs all work and hide the bug.           |
| Mutation      | `npm run mutate`            | Whether the tests pin anything at all. The meta-layer.                                                                                                         |

⚠️ **A generator must be able to produce the input that breaks the code.** `fc.string()` emits
printable ASCII only — measured, max code point 126. Every Arabic law was therefore fed input the
pack cannot even tokenize: ten laws, all green, all vacuous. `src/testing/alphabets.ts` exists so
that cannot recur. Use `textFor(pack.id)` for behaviour laws; `anyText` only for "never throws".

⚠️ **The same trap has a second floor.** `textFor` is an unbounded `fc.string`, so it emits short
and empty text constantly — which is fine until a law is about something that only exists in LONG
text. Every coverage-band law fed `textFor` would take the "too short to classify" branch nearly
always and prove nothing. Use **`passageFor(packId, words)`** for those: it guarantees a running-
token count. And `coverage.property.test.ts` carries an explicit **vacuity guard** that asserts all
three band arms were actually observed during the run — copy that pattern whenever a law describes
a branch a generator might never reach.

Two laws are worth writing _before_ the functions they describe: `record` is a fold, and
`serialize` → `deserialize` round-trips with canonical ordering.

⚠️ **A law that reads true is not a law that is true.** Three statements of the new-material budget
were written and refuted by fast-check before one survived: `introduced <= maxNew` (false — the cap
yields rather than shorten a session), `maintenance === min(maxItems, due)` (false — new material
legitimately outranks review), and finally the one that holds, that `maxItems - maxNew` slots are
reserved for maintenance. The third counter-example found a real defect rather than a bad law: the
deferred pass was appending items out of comparator order. **Write the law, let it fail, and read
what it says** — twice here it was the law that was wrong, and once it was the code.

### Mutation testing

```bash
npm run mutate     # minutes, not seconds — an audit, never a gate
```

Deliberately **not** in `npm run check`, and with no score threshold: a hard number is one that
eventually gets lowered so a commit can land. Read the survivors, fix what matters, move on.

Score today **84.96%** (757 of 891) — `coverage.ts` 97, `record.ts` 96, `ids.ts` 95, `profile.ts`
92, `plan.ts` 88, `text.ts` 86, `persist.ts` 83, `checkPack.ts` 79, `pack.ts` 77, `assert.ts` 0.

`assert.ts` at zero is honest: `assertNever`'s body is unreachable while the types are truthful, so
nothing can pin its message. Do not "fix" it by asserting on an exception no correct program throws.

⚠️ **THE SCORE ABOVE IS FROM BEFORE WIRE v3 and has not been re-measured on the new shape.** Treat
it as the last known reading, not as today's.

⚠️ **THE NUMBER WAS OVERSTATED BEFORE, AND UNDERSTATED FOR TWO FILES — read this before trusting a
future one.** `src/testing/packs.ts` used to `throw` when a fixture pack failed to build, at MODULE
LOAD. A mutant that breaks pack construction therefore killed the whole importing test FILE before
any test ran, vitest reported "11 files failed, **0 tests failed**", and Stryker — which scores
kill-or-survive from test RESULTS — recorded it as **survived**. Measured: `pack.ts` 69.0 → 76.6 and
`text.ts` 83.2 → 86.3 once `build()` returned a pack whose methods throw instead. Fifteen survivors
in two files were false.

The general shape is worth keeping in mind: **anything a mutant can break at import time is scored
as surviving.** If a survivor looks impossible, apply it by hand and read whether vitest reports
failing _tests_ or failing _files_.

`plan.ts` is the worked example of what this lane is for. It scored **67.86%** first time, and 12 of
its 15 survivors sat on one redundant pre-sort of `Object.keys` — redundant because the final
comparator was already total, and actively harmful because the two orderings agreed, which made the
comparator's tiebreak untestable. Deleting four lines took it to 88.89 and turned an unpinned
guarantee into a pinned one. No test was failing before.

### The cross-runtime lane

```bash
make hermes-install   # one-off: fetch the VM into .hermes/ (~10MB, gitignored)
make hermes           # or: npm run test:hermes
```

`src/internal/text.ts` exists _entirely_ because Hermes lacks ICU — explicit code-point ranges, a
hand-written fold table, no `normalize()`, no `\p{...}`. Every other layer runs on Node, where all
those APIs work perfectly, so the whole suite can be green while the package is broken on the only
runtime that ships. Lint bans the APIs; this lane verifies the replacements.

**How.** `src/testing/fingerprint.ts` is a pure function producing a deterministic string from
every operation that could differ between engines — each normalize step, code-point iteration, both
packs end to end, sorting, ids, a 20-day record→serialize→deserialize loop, JSON key order,
`Math.imul`, float formatting. It is bundled with esbuild, run under both VMs, and diffed **line by
line**. The output is text rather than a hash precisely so a failure names the input that broke.
`fingerprint.test.ts` keeps the fingerprint itself from rotting into something that covers nothing.

Status: **574 checks identical**. Measured on Hermes v0.13.0, not assumed:

| API                           | Hermes                                                 |
| ----------------------------- | ------------------------------------------------------ |
| `Intl`                        | **undefined** — every `Intl.*` access throws           |
| `'i'.toLocaleUpperCase('tr')` | `'I'`, where Node gives `'İ'` — **silently different** |
| `normalize('NFD')`            | works, agrees with Node                                |
| `localeCompare`               | works, agrees with Node                                |
| `/\p{L}/u`                    | works, agrees with Node                                |

So two of the four lint bans are proven load-bearing and two are precautionary — kept anyway, since
Hermes can be built with or without ICU and the explicit implementations already exist.

⚠️ **Honest limits.** This is the last standalone Hermes release (v0.13.0, RN 0.75.x); RN 0.86
bundles its own in-tree build, so the lane catches the _class_ of bug, it does not certify a
specific build. It runs the fingerprint, not the suite — vitest needs Node APIs Hermes lacks. And a
missing binary is a **loud SKIP with exit 0**, never a silent pass; it is therefore not in
`npm run check`.

## Docs

Plain markdown under `docs/`, then TypeDoc over the same source when the barrel has real exports.

**Not MkDocs**, despite it being asked for by name — it cannot read TypeScript, so the API reference
would be hand-written and rot, and it puts a Python toolchain in a TypeScript repo. **Not VitePress,
Docusaurus, Starlight or Nextra _in this package_** — see the dependency allowlist above. When a
docs site is genuinely wanted, it goes in a sibling package where its React/Vue cannot reach `src/`.
