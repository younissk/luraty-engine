# Summary

<!-- What changed and why. The diff says what; the body should say why. -->

## The boundary

- [ ] No `react`, `react-native`, `expo-*`, DOM global, or database client was introduced —
      including transitively through a new dev dependency.
- [ ] No new dependency, **or** it was added to `ALLOWED_DEPENDENCIES` in `src/boundary.test.ts`
      deliberately, and it cannot pull in a UI framework.
- [ ] No root `package.json` and no npm workspace.

## Determinism and runtime

- [ ] No `Date.now()`, `Math.random()` or argless `new Date()` in `src/` — time arrives as `day`,
      randomness as a `seed`.
- [ ] No `Intl`, `localeCompare()`, `toLocale*Case()` or `normalize()`. Hermes ships without full
      ICU; locale behaviour belongs in a language pack as explicit data.
- [ ] Same inputs and seed still produce the same output.

## Contract

- [ ] `src/index.ts` unchanged, **or** the new export is deliberate and documented.
- [ ] A changeset was added (`npx changeset`) if this changes what a consumer can rely on.

## Verify

- [ ] `npm run check` green (format, typecheck, lint, test).
- [ ] New behaviour ships with a test; a bug fix ships with a fail-before/pass-after test.
