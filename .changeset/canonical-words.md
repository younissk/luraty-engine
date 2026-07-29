---
'@luraty/engine': minor
---

The `learner()` handle now keys words through its pack, and `effectiveStrength` is exported.

**A silent defect, found by driving the engine by hand rather than by any test.** `learner.answer`,
`.claim` and `.help` branded the string they were given straight into a unit key, while `.read()`,
`coverage()` and every lemma out of `vocabularyOf` addressed the pack's canonical form. The German
pack transliterates umlauts, so `answer('Schlüssel', …)` wrote to `recognise:de:schlüssel` and
everything else looked at `recognise:de:schluessel` — two units for one word, no error, no failing
test. Measured on the demo: five of the six words a learner proved were counted in coverage instead
of four.

Nothing caught it because the shipped end-to-end example only ever used words identical to their own
keys (`haus`, `verordnung`). It now uses `Schlüssel` and `Verordnung` deliberately.

The handle is the only place this can be fixed: `keysFor` and `claimsFor` take no pack, so their
contract stays "hand me lemmas". Keying is safe on already-keyed input because `key` is idempotent —
a pack property law, verified across all 9,981 lemmas of the real German pack — so the equivalence
between the facade and the free functions is unchanged for callers who were already passing lemmas.

Routing `answer` and `help` through `keysFor` also picks up its empty-word guard: a word the pack
cannot key is now dropped rather than minting a permanently unaddressable unit.

**Also exported: `effectiveStrength`.** `isKnown` was on the barrel but the rung behind it was not,
so a host could ask "does she know this?" and not "what do I draw?". A unit that has been proved
after being claimed reads one rung above what the ledger stores, and rendering that gap is the
difference between a progress bar that matches the known count and one that contradicts it.
