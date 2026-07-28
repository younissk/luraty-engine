---
'@luraty/engine': minor
---

Add `plan(profile, options)` — the scheduler (ADR-0005).

Selects by one score, days since a unit was last successfully proven, over the whole cumulative
pool. Takes no language pack (nothing on the pack contract is reachable from a scheduler with no
text) and no seed (the comparator is total, so no tie needs one). Returns the drills plus a
description of the content the session needs, carrying `COVERAGE_BAND.minTokens` outward so the
host can supply passages long enough for the coverage band to classify.

**Breaking, wire format v2.** `Learning` gains `lastProven: Day` — the day a unit was last
successfully retrieved. `lastSeen` could not serve, because passive exposure refreshes it, so
scheduling on it would push every word in today's reading to the back of the drill queue. The
v1→v2 migration maps `lastProven` to 0 (never proven) rather than to `lastSeen`, deliberately.

Also fixes a latent out-of-order-sync bug: on promotion, `confirmedOn` took the promoting evidence's
own day, so a late-arriving day-3 success could stamp a unit proven on day 40 as proven on day 3.
