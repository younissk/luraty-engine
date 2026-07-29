# What the engine believes about a learner

> Everything it stores is one row per word. This page is that row, field by field, and why each one
> is there — because every field was added to fix something measured, not something imagined.

## The whole of it

One entry per **(direction, variety, word)**. That address is the unit key, and it never changes.

```ts
type UnitState = {
  seen: number; // encounters of any kind
  lastSeen: Day; // last encounter          ⎫
  lastAsked: Day; // last retrieval attempt  ⎬ nested: lastSeen ⊇ lastAsked ⊇ lastProven
  lastProven: Day; // last retrieval passed  ⎭
  prior: { kind: 'none' } | { kind: 'claimed'; on: Day };
  strength: 0 | 1 | 2 | 3 | 4 | 5 | 6; // the ledger
  lapses: number; // consecutive failures
};
```

That is the entire memory. There is no history, no log, no per-word attempt list. A profile is a
**fold** over evidence, and folds do not remember — which is why retaining the evidence log is a
[host obligation](../guides/building-a-client.md).

## The address: why direction and variety are in the key

**`direction` is `recognise | produce`.** Separate entries, never averaged. The gap between what a
heritage speaker understands and what they can say is the single defining feature of this learner;
collapse the two and you have measured the wrong person.

**`variety` is which form of the language** — `ar-msa` versus `ar-levantine`, the standard you read
versus the dialect you heard at home. For a diglossic language those are two systems, and someone can
be strong in one and weak in the other. German has one variety and you can ignore the field.

> **Not in the key, deliberately: modality.** The engine cannot tell listening from reading, and for
> this learner that is a real gap — they typically understand speech better than text, the opposite
> of a classroom learner. It was proposed and deferred, and the reason is checkable rather than
> defensive: `isDirection` is a closed guard on the first key segment, so adding `hear`, `read`,
> `say` and `write` later is **purely additive** and every stored key keeps parsing. Nothing hardens
> by waiting.
> What _would_ harden is rewriting `recognise → hear` in a migration, which stamps _proven_ on a
> modality a text-first app never measured. Mint the new facets empty when an exercise exists to fill
> them.

## The three dates, and why one was not enough

This is the field that has changed most, and each change came from a measurement.

| field        | moved by                     | read by                                         |
| ------------ | ---------------------------- | ----------------------------------------------- |
| `lastSeen`   | any encounter, incl. reading | **nothing that schedules.** Reporting only.     |
| `lastAsked`  | any retrieval, pass or fail  | **the scheduler.** This is `daysWaiting`.       |
| `lastProven` | a retrieval that passed      | trust: `coverage`, `summarize`, the `why` label |

v1 had one date. v2 split `lastProven` out because `lastSeen` is refreshed by _reading_ a word — so
scheduling on it pushed every word in today's passage to the back of the queue, which is exactly
backwards.

v3 split `lastAsked` out because scheduling on **proof** meant a word she never gets right is never
attended to, its wait grows without bound, and it sits at the head of the queue forever. Measured:
ten always-failed words in a pool of 210 took **44% of every slot** for two months. Anchoring on the
last _ask_ brought it to 4.5% against a 4.8% fair share — one line, no new constant, no backoff.

The nesting `lastSeen ⊇ lastAsked ⊇ lastProven` is checked on every unit on every day of the
simulation. It is the invariant that would break first if a variant ever moved the wrong one.

## The ledger: why the ladder is asymmetric

`strength` is a rung from 0 to 6. **A word counts as known at rung 2 or above.** There is no box.

Right is worth **+1**, wrong costs **−2**, asking for help costs **−1**.

The asymmetry is not a punishment — it is what makes the number mean something. Expected drift at
accuracy `a` is `1·a − 2·(1−a)`, positive only above **66.7%**. So the ledger answers _"does she know
this word?"_ rather than reporting how often she slips.

The rule it replaced — two right in a row to be known, one wrong to lose it — had no floor at all.
Measured over 720 simulated days, the known count settled at **accuracy × pool** and never climbed:
place a learner at 800 words with 90% accuracy and it sat near 720 forever. **A month of work made
her number go down.** For a product whose pitch is _"you know more than you think"_, that is the
worst thing it could show her.

A symmetric ±1 ladder fails the other way: break-even at 50% would report someone wrong four times in
ten as knowing almost everything.

**Nothing is permanently known.** Enough misses still take a word below the line. It just takes more
than one bad morning.

## The provenance: how prior knowledge gets in without lying

`prior` records that the host said she knows this, before anyone checked.

This exists because of a measured hole: `plan()` iterates the profile, so a brand-new profile yields
an **empty session**, and `coverage()` counted only proven words, so it read ~0% on every text for
months. For a learner whose defining trait is already knowing a lot, that is the whole first phase of
her life with the product.

The rules are narrow on purpose:

- **A claim touches nothing else** — not `strength`, not `seen`, not `lastAsked`. That makes it
  structurally incapable of overwriting a measurement, so re-placing at month six is safe with no
  rule anybody has to remember.
- **A bare claim is worth nothing.** Self-report correlates about **r ≈ .39** with tested
  proficiency.
- **A claim she has since proved is worth one rung**, so it reaches "known" on its first proof where
  an unclaimed word needs two. A claim plus an independent retrieval is two signals from different
  sources.
- **A claim is never cleared**, even when disproved. That is what makes the three counts —
  `claimsStanding`, `claimsConfirmed`, `claimsRefuted` — computable from present state with no
  history stored anywhere.

> **Why the rung bonus is computed on READ, not folded in.** Giving the first proof of a claimed word
> `+2` inside `record` would make the claim path order-dependent for the first time: `[proof, claim]`
> and `[claim, proof]` would disagree, because the proof would not yet have seen the claim. An
> offline queue makes no ordering promise. Computing it on read costs nothing and keeps the two
> orders convergent.

The number this buys is the one a heritage speaker actually wants: _"of the 800 words you said you
knew, 430 checked out, 210 are still unchecked, and 160 did not hold."_

## What changes it: four kinds of evidence

`record(profile, evidence)` is the **only** function that writes. Evidence describes what the
**learner did**, never what the exercise was — which is what lets a speaking exercise be added later
without the core changing.

| kind        | what happened              | seen | lastSeen | lastAsked | lastProven     | strength | lapses       |
| ----------- | -------------------------- | ---- | -------- | --------- | -------------- | -------- | ------------ |
| `retrieval` | asked, and answered        | +1   | → day    | → day     | → day if right | ±        | →0 / +1      |
| `exposure`  | read past it               | +1   | → day    | –         | –              | –        | –            |
| `help`      | tapped the gloss           | +1   | → day    | –         | –              | −1       | –            |
| `claim`     | the host says she knows it | –    | –        | –         | –              | –        | sets `prior` |

**Closed at four**, because the axis is what a learner can do that tells you something: prove it,
meet it and move on, meet it and ask, or state it unasked. A fifth member needs a fifth _behaviour_,
not a fifth exercise type.

Two rows are worth dwelling on. **Reading proves nothing** — a heritage speaker recognises a word's
shape while holding only its domestic sense, and will not ask; if not-asking counted, the register
gap this product exists to find would be invisible by construction. But **tapping the gloss is not
nothing**: she has told you she does not have it. An earlier version had no way to say that, and its
nearest equivalent _demoted a word she had proven four months earlier_.

## What is deliberately absent

| not stored                     | why                                                                                                                                                                                 |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| any history or attempt log     | ~22,000 rows over three years, in the blob parsed before the first frame. `summarize()` is a snapshot the host keeps.                                                               |
| a global level or CEFR band    | One number across skills is the category error this product exists to avoid. State is per unit, per direction, per variety.                                                         |
| word sense or register         | The unit is the lemma, so answering from the domestic sense promotes the word. Real, unfixed, and needs content that does not exist yet.                                            |
| phrases, chunks, pronunciation | Each needs an item kind or a task model the engine does not have. Missing inputs, not missing ideas.                                                                                |
| decay over time                | State would become a function of when you looked — `serialize(p)` would differ on day 40 and 41 with no evidence between, killing replay. Staleness is **reported**, never applied. |

## One thing that is honestly awkward

**`strength` and `lapses` are order-dependent.** A saturating ±n walk does not commute: from rung 0,
`[miss, hit]` ends at 1 while `[hit, miss]` ends at 0. Every _date_ field is a max-fold and converges
regardless; the rungs do not.

This is not new — the old `streak` and `box` were order-dependent in the same way — but it became
load-bearing when `coverage()` started reading the rung. Two consequences, both pinned by tests:

1. **Sort an offline queue by day before folding it.** Same-day ties stay genuinely ambiguous.
2. **The repair path is a re-fold from the log**, which is why keeping that log is a host obligation.

The commuting alternative — storing `proved` and `failed` counts and deriving a rung from the ratio —
was rejected because it can never forget: a word proven 400 times and now failing half the time would
read at the ceiling for months.

---

**Next:** [`selection.md`](selection.md) for how these fields decide what she practises, and
[`../guides/building-a-client.md`](../guides/building-a-client.md) for where your app plugs in.
Decision records: [ADR-0006](../../../docs/adr/0006-a-unit-is-a-rung-ladder-with-three-anchors-and-a-provenance.md).
