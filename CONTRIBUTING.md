# Contributing

Short on purpose. Four things, and the first one is the whole package.

## 1. The one rule

**Nothing from a UI runtime, a device, or a database may enter this package.** No `react`, no
`react-native`, no `expo-*`, no DOM globals, no database client.

This is not a style preference — it is the reason the package exists. The engine has to run
unchanged under Hermes, Node and a browser so it can be simulated headless, which is the only
honest way to validate an adaptive learning system. It is enforced by module resolution: those
packages are not in `node_modules`, so importing one fails `tsc` with TS2307.

Two ways to break it by accident, both of which look like tidying:

- **Adding a root `package.json` or an npm workspace.** Hoisting puts `react-native` back within
  reach and typecheck goes green on the exact mistake this package prevents. Nothing fails.
- **Installing a docs-site generator here.** VitePress, Docusaurus, Starlight and Nextra each drag
  Vue, React or Astro into `node_modules`, at which point `import { ref } from 'vue'` typechecks
  fine inside `src/`. Those tools belong in a sibling package.

`src/boundary.test.ts` holds an exact **allowlist** of every package this repo may install. Adding a
dependency means editing that line, deliberately.

## 2. Determinism

A session must replay identically from a seed — that is what makes the engine testable.

- No `Date.now()`, no `Math.random()`, no argless `new Date()`. **Time arrives as data** (`day` is
  on the profile and on every piece of evidence); **randomness arrives as a `seed`.**
- No `Intl`, `localeCompare()`, `toLocaleLowerCase()` or `normalize()`. Hermes ships without full
  ICU, so these are green on your laptop and broken on a phone. Locale behaviour belongs in a
  language pack as explicit data.

Both sets are **lint errors**, not conventions. The message tells you what to do instead.

## 3. The gate

```bash
npm install
git config core.hooksPath .githooks   # once per clone — enables the pre-commit gate
npm run typecheck && npm run lint && npm test
```

The whole thing runs in about three seconds, so the hook runs all of it rather than doing
staged-file cleverness. If it ever creeps past ~5s, move `npm test` to pre-push — a slow hook is a
bypassed hook, and a bypassed gate is worse than none because it still feels like one.

## 4. Commits

[Conventional commits](https://www.conventionalcommits.org). Scopes: `core`, `model`, `pack`, `ci`,
`docs`. (Not `engine` — everything here is the engine.)

Explain **why** in the body, not what. The diff already says what.

---

Deeper background, written for coding agents but accurate for humans: [CLAUDE.md](CLAUDE.md).
