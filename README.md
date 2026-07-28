# @luraty/engine

The runtime-agnostic core of [Luraty](https://github.com/younissk/lughaty) — an adaptive language
trainer for **heritage speakers**: people who grew up hearing a language, understand more than they
can say, and are stuck between beginner courses that bore them and books that flatten them.

**The engine is the backend. A mobile app is only a frontend.** This package holds the decisions —
what to teach, when, how an answer is judged, what happens next. It runs unchanged under Hermes
(React Native), Node, and a browser, with zero framework imports.

> **Status: five slices shipped.** Learner state and the evidence fold (`record`), persistence
> (`serialize` / `deserialize`), language packs (`createPack` / `checkPack`), coverage, and the
> scheduler (`plan`). The rules and the boundary are in [CLAUDE.md](CLAUDE.md).
>
> Not built yet, and each is a missing _input_ rather than a missing idea: interleaving by
> confusability (needs a relation the four-function pack contract cannot express), chunks as items
> (a unit key addresses a word), and fluency tasks (no timed-repetition model). See the notes on
> `plan` in [src/core/plan.ts](src/core/plan.ts).

## Thirty seconds

```ts
import { coverage, createProfile, day, plan, record, unitKey, variety } from '@luraty/engine';

const v = variety('de')!; //                        which variety this knowledge is in
let profile = createProfile('de', day(0)!); //      a learner who has met nothing

// 1. The engine decides. No pack, no clock, no database — just the profile and the day.
const session = plan(profile, { day: day(1)!, maxItems: 12 });

// 2. The host fetches exercises for `session.content.units`, shows them, and reports back.
profile = record(profile, [
  { unit: unitKey('recognise', v, 'haus'), outcome: 'known', tested: true, day: day(1)! },
]);

// 3. How hard is this text for them now? `pack` comes from the host — see below.
coverage(profile, pack, {
  text: 'Der Mann geht aus dem Haus.',
  variety: v,
  direction: 'recognise',
});
```

Watch it run for thirty days: `npm run demo`.

## Why it is a separate package

An adaptive engine is only testable if it is deterministic and runnable headless — you validate it
by simulating thousands of learners, not by tapping through a UI. An engine that imports React
Native cannot run in that harness at all.

The previous version of this engine lived _inside_ the app. When the app was rewritten, the engine
went with it — not because it was wrong, but because it was in the wrong place. This package exists
so that can't happen twice.

## The shape

```ts
plan(profile, { day, maxItems }); //          → a session, plus a description of content it needs
record(profile, evidence); //                 → a new profile
coverage(profile, pack, query); //            → how much of this text they know
serialize(profile) / deserialize(text); //    → persistence, as pure total functions
createPack(config, data) / checkPack(pack, sample); // → a language, from JSON
```

Two of those signatures are shorter than you would expect, and both are findings rather than
oversights. `plan` takes **no pack** — work the four-function contract through and nothing on it is
reachable from a scheduling decision, so scheduling is language-free. It takes **no seed** either,
because selection is by days-waiting and the key tiebreak is total, so there is no tie randomness
could break. `coverage` takes **raw text, not tokens**, so nobody can hand it a token stream the
pack never produced. The long-form arguments are in
[src/core/plan.ts](src/core/plan.ts) and [src/model/coverage.ts](src/model/coverage.ts).

**Everything is a value.** No hidden state, no clock, no database. Time arrives as data (`day`) and
content as a request the _host_ fulfils. That is what makes a session replayable, a learner forkable,
and two profiles diffable. Nothing in the engine draws a random number today; when something needs
to, it takes a `seed` and derives from it, so call order can never change a decision.

## Language packs

The engine knows no language. Everything language-specific is injected as a **pack** — four small
functions plus data:

|           | what it does             | French           | Arabic          | German                        |
| --------- | ------------------------ | ---------------- | --------------- | ----------------------------- |
| `split`   | text → pieces            | on spaces        | on spaces       | on spaces                     |
| `key`     | are these the same word? | `vais` → `aller` | `السوق` → `سوق` | `Bahnhofstraße` → `strasse`   |
| `rank`    | how common is it         | frequency list   | frequency list  | frequency list                |
| `compare` | is this answer right     | fold accents     | fold diacritics | umlauts two-letter (`ö`→`oe`) |

A pack is **config plus data files, not code** — so adding a language is two files rather than a
pull request against the engine. Build one with `createPack(config, data)`, then run
`checkPack(pack, sample)` against real text: it catches the failures no unit test can, because
fixtures are correct by construction and the input that breaks is the host's 20,000-word file.
See [docs/guides/adding-a-language.md](docs/guides/adding-a-language.md).

One profile per language, deliberately: you are a different person in each one.

## Develop

```bash
npm install
npm run check    # format + typecheck + lint + test — the whole gate
```

`make` on its own lists every command. Determinism is enforced by lint, not by convention:
`Date.now()`, `Math.random()` and argless `new Date()` are errors in `src/` — as are `Intl`,
`localeCompare()` and `normalize()`, which work on Node and are missing or different under Hermes.

## Use as a submodule

```bash
git submodule add https://github.com/younissk/luraty-engine.git engine
```

Then link it from the consuming app with `"@luraty/engine": "file:../engine"`. Do **not** put the
two in an npm workspace — hoisting would let `react-native` resolve from inside the engine and
silently destroy the boundary this package is built around.
