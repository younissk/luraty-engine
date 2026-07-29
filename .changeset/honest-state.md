---
'@luraty/engine': minor
---

Wire v3 — a unit becomes a rung ladder with three anchors and a provenance, closing five measured
gaps.

Every gap below was measured against the built engine before anything was changed, and re-measured
after. Nothing here is a refactor.

**Breaking.** `Evidence` is now a four-member discriminated union (`retrieval` / `exposure` / `help`
/ `claim`) instead of a record with `tested: boolean`. `UnitState` is one flat shape instead of
`Learning | Understood`; `Box`, `Learning`, `Understood` and `PROMOTE_AFTER_SUCCESSES` are gone.
`PlanOptions.maxNew` is required. `Coverage` gains a fourth kind. Stored profiles migrate v2 → v3
automatically, and the key format is untouched.

- **Day one was an empty session, and coverage read ~0% for months.** Prior knowledge could only
  enter by fabricating retrievals. A `claim` is now first-class evidence: it sets a `prior`, grants
  no head start, and survives being confirmed or refuted — which is what makes "of the 800 words you
  said you knew, N did not hold" computable from present state with no history stored anywhere.
  `ContentRequest.newUnitsWanted` lets the engine ask for vocabulary it does not have.
- **New material silently starved review.** Measured: a host introducing 20 new words a day into a
  20-item budget gave review **0% of slots, forever**. `maxNew` makes that a number a human typed.
- **The known count was a readout of the error rate.** Measured over 720 simulated days it settled
  at `accuracy x pool` and never climbed — a month of work made the number go down. A bounded rung
  ladder with a +1/−2 asymmetry puts break-even at 66.7% and makes the count climb with
  consolidation.
- **A handful of failed words monopolised the queue.** Measured: ten always-failed words in a pool
  of 210 took **44% of every slot** over 60 days against a 4.8% fair share. Splitting `lastAsked`
  out of `lastProven` is the entire fix — no backoff, no new constant.
- **Nothing could say "reassess", and nothing remembered.** `Session.reassess` is the trigger (the
  engine owns _when_, the host owns _how_), and `summarize()` is a fixed-size snapshot the host
  persists and diffs.

Also fixes a live bug: `{ tested: false, outcome: 'unknown' }` — a learner tapping a gloss while
reading — demoted an understood unit outright, erasing months of proof. It is now `help`, costs one
rung, and is not a lapse.
