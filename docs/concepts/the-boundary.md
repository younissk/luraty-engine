# The boundary

> The engine is the backend. A frontend is a rendering detail.

The engine holds the decisions — what to teach, when, how an answer is judged, what happens next. It
must run unchanged under Hermes (React Native), Node and a browser, with no framework anywhere in
sight.

## Why this is a hard rule and not a preference

The previous version of this engine lived _inside_ a mobile app. When the app was rewritten, the
engine was deleted with it — not because it was wrong, but because it was in the wrong place. A
package that can be destroyed by a UI rewrite is not a backend.

The second reason is testability. Validating an adaptive system means running it headless, thousands
of times. An engine that imports React Native cannot run in that harness at all.

## How it is enforced

Not by review. By module resolution:

```
engine/node_modules/     ← no react, no react-native, no expo
      ↑ resolution walks UP only, never sideways into a consumer's tree
```

So `import { View } from 'react-native'` in `src/` does not resolve, and `npm run typecheck` fails
with `TS2307`. The wrong thing is impossible, not discouraged.

## The two ways it dies, both of which look like tidying

**1. An npm workspace.** Hoisting puts `react-native` into a shared `node_modules` that the engine
_can_ reach. Typecheck then passes on exactly the mistake this package exists to prevent. Nothing
fails. Nobody notices.

**2. A dependency that pulls in a UI framework.** Install a docs-site generator here and Vue or
React lands in `node_modules`; `import { ref } from 'vue'` typechecks green from that moment on.

A denylist cannot catch the second — nobody thinks to ban `vue`. So `src/boundary.test.ts` pins an
**allowlist** of every installable package, and adding one is a deliberate, reviewed edit.

## What crosses the boundary, and how

Nothing is imported in. Everything arrives as an argument:

- **Time** — `day`, a number on the profile and on every piece of evidence.
- **Randomness** — a `seed` in the options.
- **Language knowledge** — an injected language pack (five functions plus data).
- **Content** — never fetched. `plan()` returns a _description_ of what it needs; the host fetches
  it and passes it back. This is what makes the engine testable with no database at all.

The rule of thumb: the best injected dependency is the one removed from the signature. Reach for a
port only when designing the impurity away genuinely fails.
