# @luraty/engine

The runtime-agnostic core of [Luraty](https://github.com/younissk/lughaty) — an adaptive language
trainer for **heritage speakers**: people who grew up hearing a language, understand more than they
can say, and are stuck between beginner courses that bore them and books that flatten them.

**The engine is the backend. A mobile app is only a frontend.** This package holds the decisions —
what to teach, when, how an answer is judged, what happens next. It runs unchanged under Hermes
(React Native), Node, and a browser, with zero framework imports.

> **Status: scaffold.** No behaviour is implemented yet. What is here is the boundary, the build,
> and the rules — see [CLAUDE.md](CLAUDE.md).

## Why it is a separate package

An adaptive engine is only testable if it is deterministic and runnable headless — you validate it
by simulating thousands of learners, not by tapping through a UI. An engine that imports React
Native cannot run in that harness at all.

The previous version of this engine lived _inside_ the app. When the app was rewritten, the engine
went with it — not because it was wrong, but because it was in the wrong place. This package exists
so that can't happen twice.

## The shape it grows into

```ts
plan(profile, pack, { focus, budget, seed }); // → a session, plus a description of content it needs
record(profile, evidence); // → a new profile
coverage(profile, pack, tokens); // → how much of this text they know
serialize(profile) / deserialize(text); // → persistence, as pure total functions
```

**Everything is a value.** No hidden state, no clock, no database. Time arrives as data (`day`),
randomness as a seed, and content as a request the _host_ fulfils. That is what makes a session
replayable, a learner forkable, and two profiles diffable.

## Language packs

The engine knows no language. Everything language-specific is injected as a **pack** — four small
functions plus data:

|           | what it does             | French           | Arabic          |
| --------- | ------------------------ | ---------------- | --------------- |
| `split`   | text → pieces            | on spaces        | on spaces       |
| `key`     | are these the same word? | `vais` → `aller` | `السوق` → `سوق` |
| `rank`    | how common is it         | frequency list   | frequency list  |
| `compare` | is this answer right     | fold accents     | fold diacritics |

The goal is that a pack is **config plus data files, not code** — so adding a language is two files
rather than a pull request against the engine. One profile per language, deliberately: you are a
different person in each one.

## Develop

```bash
npm install
npm run typecheck && npm run lint && npm test
```

Determinism is enforced by lint, not by convention: `Date.now()`, `Math.random()` and argless
`new Date()` are errors in `src/`.

## Use as a submodule

```bash
git submodule add https://github.com/younissk/luraty-engine.git engine
```

Then link it from the consuming app with `"@luraty/engine": "file:../engine"`. Do **not** put the
two in an npm workspace — hoisting would let `react-native` resolve from inside the engine and
silently destroy the boundary this package is built around.
