# How the engine chooses what to practise

> The whole algorithm is four steps and one number. This page walks a concrete learner through it,
> line by line, so it stops being a black box.

## The number

Every word the learner has ever met carries **one date**: the day it was last _successfully
retrieved_. Not the day it was last seen — the day they last proved it.

```
daysWaited = today − thatDate
```

A word that has never been proven carries the date `0`, so its wait is the whole span since the
profile began. That is the largest number possible, which is why new words sort to the front with
no special case anywhere in the code.

## The four steps

```
1. skip anything proven in the last 3 days          (reviewGapDays)
2. sort the rest by daysWaited, longest first
3. break ties by the order the host supplied         (priority)
4. take the top N                                    (maxItems)
```

That is the entire selection rule. No weights, no scoring model, no randomness, no machine
learning. `plan()` is about sixty lines and half of them are comments.

## A concrete example

A learner on **day 30**. Six words, one of which they have never been asked about.

| word     | box        | last proven | daysWaited | step 1      | final order |
| -------- | ---------- | ----------: | ---------: | ----------- | ----------: |
| `neu`    | learning   |   never (0) |     **30** | due         |       **1** |
| `haus`   | understood |       day 4 |     **26** | due         |       **2** |
| `brot`   | understood |      day 12 |     **18** | due         |       **3** |
| `wasser` | understood |      day 21 |      **9** | due         |       **4** |
| `kind`   | understood |      day 27 |      **3** | due (3 ≥ 3) |       **5** |
| `gehen`  | understood |      day 29 |      **1** | ✗ skipped   |           — |

With `maxItems: 4`, the session is **`neu`, `haus`, `brot`, `wasser`**.

Note two things:

- `gehen` was proven yesterday, so it is not offered. `kind` was proven three days ago, and the gap
  is **inclusive** — three days is enough.
- `neu` leads not because it is new but because _never proven_ is the longest possible wait. The
  engine has no concept of "new material"; it falls out of the arithmetic.

### What happens next

The learner answers. `record()` folds the result in:

| answer                                | effect                                                                     |
| ------------------------------------- | -------------------------------------------------------------------------- |
| **right**, and it was a real question | the date moves to today → it goes to the back of the queue                 |
| **wrong**                             | the date does **not** move → it stays at the front and comes back tomorrow |
| they just _read_ it somewhere         | nothing moves. Reading proves nothing.                                     |

That last row is the one that surprises people, and it is deliberate: a heritage speaker recognises
a word's shape without knowing its sense, and will not ask. If not-asking counted, the register gap
this product exists to find would be invisible.

## The tiebreak, and why it needed fixing

Ties are not an edge case — they are the **normal** case. A learner who was placed, or who read a
passage, acquires hundreds of words on the same day, and every one then carries the same date
forever.

With nothing to break the tie, the engine compares the unit key. That is a total order, which is
what makes a session reproducible — and it sorts alphabetically:

```
agieren  alternative  anders  andrea  anforderung  ansatz  apotheke
```

Deterministic, correct, and a terrible lesson. So `PlanOptions.priority` lets the host pass an
order. Passing the pack's own frequency list, commonest first, gives:

```
und  gegen  dazu  schule  jung  möglichkeit  schnell  sprechen
```

**The engine still never looks a word up.** It respects the order it is handed and knows nothing
about what the words mean — which is what keeps scheduling language-free. A host that would rather
order by topic, lesson plan or difficulty passes that instead.

⚠️ Priority breaks **ties only**. It can never promote a fresh word over an overdue one; a test
pins that, because a host could otherwise starve its own review queue by accident.

## See it on a real learner

```bash
node scripts/learner.mjs make /tmp/anna.json --pack packs/de --who heritage
node scripts/learner.mjs plan /tmp/anna.json --day 205 --items 8 --pack packs/de --why
```

`--why` prints every word, its date, its wait, and whether it was picked. Drop `--pack` to see the
alphabetical fallback.

## What this rule deliberately does not do

| not done                                       | why                                                                                                                                                                         |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Expanding intervals (2 days, then 5, then 14…) | The evidence says equal intervals perform about as well across 98 effect sizes. A ladder would also need a repetition count the profile does not carry.                     |
| Weight production over recognition             | The two directions are separate units competing on the same score, so production earns its share by being practised less. A weight would be a second uncalibrated constant. |
| Group confusable words together                | Needs a confusability relation no pack has. Note the evidence only supports interleaving _confusable_ material — shuffling everything can be worse than not.                |
| Shuffle                                        | Same reason, plus it would destroy replayability.                                                                                                                           |

## The two numbers you are allowed to distrust

```ts
PROMOTE_AFTER_SUCCESSES = 2; // correct answers in a row before a word counts as known
DEFAULT_REVIEW_GAP_DAYS = 3; // rest days before a proven word returns
```

Both are **guesses**, labelled as such in the source. No simulation has swept either. If sessions
ever feel wrong, change these before touching the algorithm.
