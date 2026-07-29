---
'@luraty/engine': minor
---

Host ergonomics: bulk helpers, an optional fluent handle, and a `createPack` that keeps its promise.

Came out of a DX audit that scored the API 5/10 and Getting Started 3/10.

**`createPack` threw.** The barrel promises "BOTH doors that take untrusted input… neither throws",
and `createPack({ id: 'de' }, …)` raised `Cannot read properties of undefined (reading 'strategy')` —
a raw TypeError on a host's app-launch path, from the function built to prevent exactly that. It
checked every leaf while assuming the branches existed. Now the shape is validated before any field
is read, and each failure has its own message.

**New: `vocabularyOf`, `keysFor`, `claimsFor`, `exposuresFor`, `wordsIn`.** Pure transforms every
host writes on day one. `vocabularyOf` already existed — in `testing/`, unexported — so the identical
"split the frequency list, key each word, drop empties and duplicates" loop was then hand-written in
`testing/demo.ts`, twice in the learner CLI, and in two pack build scripts. A helper written five
times and published zero times is the API missing it. `keysFor` also skips empty words, which the
hand-written versions did not: one empty string put a permanently unaddressable unit in the profile.

**New: `learner(profile, context)`, entirely optional.** Answers "why functional?" by separating two
things that were conflated. Purity is load-bearing — it is what lets a test fork a learner, diff two
profiles and simulate four hundred headless ones. FREE FUNCTIONS ARE NOT: `profile.plan(...)`
returning a new value is equally pure, and the default was never justified. The handle carries
`pack`, `variety`, `direction` and the frequency order so a host stops repeating them, returns a new
handle on every write, and exposes `.profile` so it is never a wall. `learner.test.ts` asserts both
paths produce identical profiles.

**README fixed.** Its "Thirty seconds" block failed typecheck verbatim — missing `maxNew`, a removed
`tested` field, and `day(0)!` which is now `undefined`. The full loop now lives in
`packs/de/src/example.test.ts`, a test rather than a snippet, so it cannot rot again.
