# How the engine chooses what to practise

> The whole algorithm is one number, one gap, and one cap. This page walks a concrete learner
> through it, line by line, so it stops being a black box.

## The number

Every word the learner has ever met carries **one date**: the day the engine last had a reason to
attend to it — the day she was last _asked_ about it, or the day the host _claimed_ she knew it.

```
daysWaited = today − max(lastAsked, claimedOn)
```

A word nobody has ever asked about or claimed carries the date `0`, so its wait is the whole span
since the profile began. That is the largest number possible, which is why unmet material sorts to
the front with no special case anywhere in the code.

> ### ⚠️ This used to be "the day it was last **proven**", and changing it was the point
>
> Anchoring on proof sounds stricter and more honest. It has one consequence nobody predicted: a
> word she **never gets right is never proven**, so its wait grows without bound and it sits at the
> head of the queue forever.
>
> Measured on a pool of 210 words with ten she always failed, at 20 drills a day for 60 days: those
> ten took **44% of every slot**, against a fair share of 4.8%. She would have spent two months on
> the handful of words that were not working and barely seen the other two hundred. Nothing errored;
> the suite was green throughout.
>
> Anchoring on the last **ask** fixes it in one line, with no new constant and no backoff. A failed
> word is still due immediately — see the gap below — but its clock resets, so tomorrow it competes
> on equal terms instead of outranking everything. Measured after: **4.5%**, against 4.8% fair.

## The rule

```
1. skip a word that counts as KNOWN and was asked within the last 3 days   (reviewGapDays)
2. sort the rest by daysWaited, longest first
3. break ties by the order the host supplied                              (priority)
4. take the top N, admitting at most `maxNew` words she has never met     (maxItems, maxNew)
```

No randomness, no machine learning, one number per word. There is one cap, `maxNew`, and it exists
because leaving it out was a measured bug rather than a simplification.

**Step 1 applies only to words that already count as known.** A word below the known rung is still
being acquired and may come back tomorrow; a word above it is being maintained and waits out the gap.

## A concrete example

A learner on **day 30**. Six words she has met, and a cap of one new word.

| word     | rung | known? |  last asked | daysWaited | step 1    |     why | order |
| -------- | ---: | ------ | ----------: | ---------: | --------- | ------: | ----: |
| `neu`    |    0 | no     |       never |     **30** | due       |   `new` | **1** |
| `bank`   |    0 | no     | claimed d.2 |     **28** | due       |  verify | **2** |
| `haus`   |    4 | yes    |       day 4 |     **26** | due       |  review | **3** |
| `brot`   |    2 | yes    |      day 12 |     **18** | due       |  review | **4** |
| `wasser` |    1 | no     |      day 21 |      **9** | due       | relearn | **5** |
| `kind`   |    5 | yes    |      day 29 |      **1** | ✗ skipped |       — |     — |

With `maxItems: 4, maxNew: 1`, the session is **`neu`, `bank`, `haus`, `brot`**.

Four things worth noticing:

- `kind` is known and was asked yesterday, so it waits out the gap. `wasser` was asked nine days ago
  and is **not** known, so the gap never applied to it — it is due, it just sorts low.
- `neu` leads not because it is new but because _never attended_ is the longest possible wait. The
  ordering has no concept of "new material"; that falls out of the arithmetic.
- `bank` is `verify`, not `new`. The host said she knows it and nobody has checked. That distinction
  is what lets an app say _"you told us you know this — let's check"_ to a fluent adult instead of
  labelling 800 words she grew up hearing as "new".
- Only `neu` counts against `maxNew`. Verification draws from the maintenance budget, because
  confirming a word she already claimed is not teaching her a word.

### What happens next

She answers. `record()` folds the result in:

| what she did                 | rung   | last asked | last proven | effect on the queue                 |
| ---------------------------- | ------ | ---------- | ----------- | ----------------------------------- |
| answered **right**           | **+1** | → today    | → today     | goes to the back                    |
| answered **wrong**           | **−2** | → today    | unchanged   | resets its wait; comes back in turn |
| **read past it**             | —      | unchanged  | unchanged   | nothing at all                      |
| **tapped the gloss** to look | **−1** | unchanged  | unchanged   | still due; slightly less trusted    |
| host **claimed** she knows   | —      | unchanged  | unchanged   | becomes `verify` instead of `new`   |

**A word counts as known at rung 2 or above.** That is the entire definition; there is no box.

Two rows are worth dwelling on. **Reading proves nothing** — a heritage speaker recognises a word's
shape without holding its sense, and will not ask; if not-asking counted, the register gap this
product exists to find would be invisible by construction. But **tapping the gloss is not nothing**:
she told you she does not have it. The old model discarded that, and worse, an earlier version read
it as a full failure and demoted a word she had proven four months earlier.

> ### Why the ladder is asymmetric
>
> Right is worth **+1**; wrong costs **−2**. That is not a punishment, it is what makes the number
> mean something.
>
> Expected drift per drill at accuracy `a` is `1·a − 2·(1−a)`, positive only above **66.7%**. So the
> ledger answers _"does she know this word?"_ rather than reporting how often she slips.
>
> The previous model — two right in a row to be known, one wrong to lose it — had no floor at all.
> Measured over 720 simulated days, the known count settled at **accuracy × pool** and never climbed:
> place a learner at 800 words with 90% accuracy and it sat near 720. **A month of work made her
> number go down.** For a product whose pitch is _"you know more than you think"_, that is the worst
> thing it could show her. Measured after the change, the same learner reads **792**.
>
> A symmetric ±1 ladder would fail the other way — break-even at 50% would report someone wrong four
> times in ten as knowing almost everything.
>
> Nothing is permanently known: enough misses still take a word below the line. It just takes more
> than one bad morning.

## The tiebreak

Ties are not an edge case — they are the **normal** case. A learner who was placed, or who read a
passage, acquires hundreds of words on the same day, and every one then carries the same date.

With nothing to break the tie, the engine compares the unit key. That is a total order, which is what
makes a session reproducible — and it sorts alphabetically:

```
agieren  alternative  anders  andrea  anforderung  ansatz  apotheke
```

Deterministic, correct, and a terrible lesson. So `PlanOptions.priority` lets the host pass an order.
Passing the pack's own frequency list, commonest first, gives:

```
und  gegen  dazu  schule  jung  möglichkeit  schnell  sprechen
```

**The engine still never looks a word up.** It respects the order it is handed and knows nothing
about what the words mean — which is what keeps scheduling language-free. A host that would rather
order by topic, lesson plan or difficulty passes that instead. A good second source is
`Coverage.claimedLemmas` from the passage she is about to read: those are the unchecked words
standing between her and a verdict on that text.

⚠️ Priority breaks **ties only**. It can never promote a fresh word over an overdue one; a test pins
that, because a host could otherwise starve its own review queue by accident.

## What else a session tells you

`plan()` returns three things besides the drills, none of which the engine can act on itself:

- **`content.newUnitsWanted`** — new slots it was allowed to fill and could not, because the profile
  has no unmet words. On a brand-new profile this is the whole cap: the engine saying _"I need
  vocabulary, not a scheduler."_ It has no word list of its own and must not acquire one.
- **`reassess`** — whether it has been long enough without a single proof to re-measure. The engine
  owns the **trigger**; the host owns the **instrument**, because how to assess somebody is a product
  decision with several defensible answers.
- **`stuck`** — words failed six times running. The engine deliberately does **not** show these less
  often. A word failing that consistently is a content or method problem — a bad recording, a
  misleading gloss — and quietly reducing its frequency is exactly how that stays invisible.

## See it on a real learner

```bash
node scripts/learner.mjs make /tmp/anna.json --pack packs/de --who heritage
node scripts/learner.mjs plan /tmp/anna.json --day 205 --items 8 --pack packs/de --why
```

`--why` prints every word, its rung, its date, its wait, and whether it was picked. Drop `--pack` to
see the alphabetical fallback.

## What this rule deliberately does not do

| not done                           | why                                                                                                                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Expanding intervals (2, 5, 14…)    | Equal intervals perform about as well across 98 effect sizes. A ladder would also drop the anti-starvation guarantee from arithmetic to a judgement call.                       |
| Back off on repeated failures      | It hits the same fair-share number by **hiding** the problem. A word she is failing is a word she needs; the engine names it in `stuck` instead.                                |
| Weight production over recognition | The two directions are separate units competing on the same score, so production earns its share by being practised less. A weight would be an uncalibrated constant.           |
| Group confusable words             | Needs a confusability relation no pack has. The evidence only supports interleaving _confusable_ material — shuffling everything can be worse than not.                         |
| Decay a word over time             | The state would then be a function of when you looked. `serialize(p)` would differ on day 40 and day 41 with no evidence in between, killing replay. Staleness is **reported**. |

## The numbers you are allowed to distrust

```ts
MAX_STRENGTH = 6; // the ceiling of the ladder
KNOWN_AT_STRENGTH = 2; // at or above this, a word counts as known
STRENGTH_STEP = { gain: 1, missRetrieval: 2, missHelp: 1 };
DEFAULT_REVIEW_GAP_DAYS = 3; // rest days before a known word returns
REASSESS_AFTER_DAYS = 30; // days without a proof before `reassess` goes due
STUCK_AFTER_LAPSES = 6; // consecutive failures before a word is reported stuck
```

Exactly **one** number here is derived rather than chosen: the 66.7% break-even, which is a
consequence of `gain` and `missRetrieval` rather than a third knob.

`maxNew` is not in that list because it is the host's, not the engine's — but it is swept in
`src/core/budget.sweep.test.ts`, and the curve has an interior maximum at about half the session.
Both extremes are catastrophic: no cap learns **nothing at all** (nothing is ever drilled twice), and
a cap of zero learns almost nothing (there is nothing to consolidate).

The rest are labelled PROVISIONAL in the source. `src/core/strength.sweep.test.ts` sweeps the ladder
and shows the behaviour is **not a knife-edge** — ceilings from 4 to 8 land within ten points of each
other — but that is not the same as showing 6 is right, and nothing here could show that: there are
no learners yet, so there is no data to fit. If sessions ever feel wrong, change these before
touching the algorithm.
