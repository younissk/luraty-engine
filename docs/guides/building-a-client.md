# Building a client on this engine

> Where your app ends and the engine begins — and the answers to the questions that come up first.

## The whole interface, in one shape

The engine has **one input** and **two outputs**. Everything you build connects to one of them.

```
        your app                          the engine
  ─────────────────────            ──────────────────────────
  however you measure    ──────▶   record(profile, evidence)      the only thing that writes
  however you teach      ◀──────   plan(profile, options)         what to practise
  however you pick text  ◀──────   coverage(profile, pack, q)     how hard is this
  everything else                  — not the engine's business —
```

If you can express something as _"this word, in this direction, known or unknown, on this day"_ the
engine can hold it. If you cannot, it belongs in your app.

## Your three pillars, mapped

### Measurement → produces evidence

Every way of finding out what somebody knows ends in the same shape. The engine does not care
which method produced it, and that is the point — you can change how you assess without touching
the engine.

| how you measure                                | what it becomes                                                      |
| ---------------------------------------------- | -------------------------------------------------------------------- |
| A placement — checklist, self-rating, anything | `{ kind: 'claim' }` on every word it names                           |
| CEFR self-assessment ("I can order food")      | `{ kind: 'claim' }` on the words that skill implies                  |
| Reading a text, tapping what they don't know   | untapped words → `{ kind: 'exposure' }`, tapped → `{ kind: 'help' }` |
| Imitation / repeat-after-me                    | `{ kind: 'retrieval' }` on `produce` units                           |
| Speaking a prompt, scored                      | `{ kind: 'retrieval' }` on `produce` units                           |
| A vocabulary quiz                              | `{ kind: 'retrieval' }` on the asked units                           |

⚠️ **Only a `retrieval` can raise a word's rung, and self-report must be a `claim`.** Learner
self-ratings correlate only about **r ≈ .39** with tested proficiency, so letting one promote a word
would mean the engine believes a guess. A claim is tracked, scheduled, and labelled `verify` — it is
just never mistaken for proof.

⚠️ **`exposure` and `help` are not the same thing, and the difference is worth getting right.**
Reading past a word proves nothing and costs nothing. _Tapping the gloss_ is the learner telling you
she does not have it, which is the single most informative thing that happens while reading. Send the
tap as `help`. (An earlier version had no way to say this, and its nearest equivalent demoted a word
she had proven four months earlier.)

### Learning → consumes plan and coverage

| how you teach           | what it uses                                              |
| ----------------------- | --------------------------------------------------------- |
| Spaced retrieval drills | `plan()` — the item list, straight through                |
| Graded reading          | `coverage()` — pick the passage that comes back `in-band` |
| Speaking exercises      | `plan()`, filtered to units whose direction is `produce`  |
| Listening               | `plan()` — but see the gap below                          |
| Pronunciation           | **nothing yet.** The engine has no model for it.          |

The loop is: `plan()` says which words → you find or build the exercise → the learner does it →
`record()` folds in what happened → `coverage()` sizes tomorrow's reading.

⚠️ **Read `SessionItem.why` before you build the screen.** The same word means four different things
to a learner, and showing them identically is how a fluent adult gets told she is a beginner:

| `why`     | what it means                      | what the screen should say                |
| --------- | ---------------------------------- | ----------------------------------------- |
| `verify`  | she claimed it; nobody has checked | _"You said you know this — let's check."_ |
| `new`     | never asked, never claimed         | teach it                                  |
| `relearn` | asked before, never once right     | she is mid-acquisition; more support      |
| `review`  | proven before                      | ordinary review                           |

⚠️ **`plan()` cannot invent vocabulary.** It iterates the profile, so a brand-new profile yields an
empty session no matter what. When that happens it sets `content.newUnitsWanted` — the number of new
slots it was allowed to fill and could not. Take that many words off the frequency list you already
loaded, show them, and record the evidence. The engine deliberately has no word list of its own.

⚠️ **The engine cannot tell listening from reading.** `Direction` is `recognise | produce` only.
For the learner this product is built for that is a real gap — they typically understand _speech_
better than _text_, the opposite of a classroom learner. Widening that type is a small change and
it has not been made.

### Consistency → outside the engine, deliberately

Streaks, reminders, goals, autonomy support, self-regulation prompts — **none of it is in the
engine and none of it should be.** The engine is stateless between calls: it has no notion of a
session, a day missed, or a habit. Your app owns all of it.

Two things worth knowing:

- **The evidence is against guilt mechanics** for this learner specifically. Motivation here is
  identity-based — family, continuity, the rooted self — not streak-based. That is a product
  constraint recorded in the ADRs, not a technical one.
- **The engine can feed ipsative feedback**, which is the kind the evidence supports: progress
  against your own past, not against a level. `summarize(profile, scope)` gives a fixed-size,
  integer-only snapshot — _"you can read 400 more words than in March"_ is a subtraction of two of
  them. Store one whenever you take a measurement.
- ⚠️ **Show `known` and `claimsStanding` differently.** `known` going down is bad news;
  `claimsStanding` going down is progress — it is a shrinking to-do, not a shrinking score. A screen
  that renders them the same way will tell her the opposite of the truth.

### Reassessment → the engine says when, you say how

`plan()` returns a `reassess` field with **three** arms:

| kind             | meaning                                                    |
| ---------------- | ---------------------------------------------------------- |
| `not-due`        | something was proven recently; carries `daysUntil`         |
| `due`            | 30 days without a proof; carries a real `daysSinceProven`  |
| `never-measured` | nothing has EVER been proven — a placed learner on day one |

⚠️ `never-measured` is a separate arm rather than `daysSinceProven: <big number>` because the engine
stores no epoch. With nothing proven, `day − 0` is your raw day _number_: a host counting Unix days
was told its brand-new learner had gone 20,661 days without proving anything. The type now makes that
number unrepresentable.

**That is a trigger, not an instrument.** It names no units and prescribes no method, because how to
assess somebody is a genuine product decision. When it fires, run whatever placement you run and feed
the result back as `claim` and `retrieval` evidence. A learner who drills daily and gets things right
resets it constantly and is never nagged.

## Questions that come up first

### ⚠️ Days start at 1. Zero is reserved.

`day(0)` returns `undefined`. Zero is the "never" sentinel for every date the engine stores, because
a max-fold needs an identity element — and that only works if no real day is also zero.

It was measured not to be. A host whose epoch is "days since install" naturally starts at 0, and then
a word asked on the install day read as **never asked**: `plan()` labelled it `'new'` instead of
`'review'`, a claim disproved that day still counted as standing, and `summarize()` filed it under
the wrong bucket. Six defects, one ambiguity, all invisible to a host that picked the obvious epoch.

So count from 1. `Math.floor(Date.now() / 86_400_000)` is fine; `daysSinceInstall` needs a `+ 1`.

### What is a "variety"? Is it the dialect?

`profile.language` is the **language**. `variety` is **which form of it**.

| language | varieties you would use                                                                     |
| -------- | ------------------------------------------------------------------------------------------- |
| German   | just `de`. There is one standard. Add `de-CH` only if you mean genuinely different systems. |
| Arabic   | `ar-msa` **and** `ar-levantine` — what you read versus what you heard at home.              |

For a diglossic language those are related but _different systems_, and someone can be strong in one
and weak in the other. That is why the variety is part of every unit key: the two are measured
apart, never averaged. For German it is a formality you can ignore.

### How do I tell a name from a word?

**You cannot do it from the token, and neither can the engine.** German capitalises _every_ noun,
so "capitalised and unknown" flags `Rezession` exactly as readily as `Toyota`. Arabic has no letter
case at all, so no rule exists there even in principle.

So it is the **content's** job, and you have three realistic options:

1. **Tag names when the content is authored.** Best, if you control the content — which you will.
2. **Run an NER model** over text you did not write.
3. **A heuristic**, accepting that it over-counts. There is one in
   `packs/de/build/coverage-curve.mjs` behind `--ignore-names`.

Whatever you use, pass the surfaces to `CoverageQuery.ignore` and they leave the calculation.

**This matters more than it sounds.** On real German news, names and acronyms are **66% of
everything a 10,000-word pack does not know**. Counting them, a passage reads 89.6% and "too hard";
excluding them, the same passage reads 96.8% and "just right".

### Where does placement go?

**In your app.** There is no engine work to do.

Placement _method_ is a genuine product decision with several defensible answers — self-assessment,
imitation, a comprehension check, or a combination — and the engine takes no position on any of
them. Whatever your test concludes, you express it as evidence and call `record()`:

```ts
// However you decided she knows these 800 words, this is how it becomes a profile.
const placed = record(
  createProfile('de', day),
  knownWords.map((lemma) => ({ kind: 'claim', unit: unitKey('recognise', v, lemma), day })),
);
```

That is the whole thing. A claim buys **no head start** — the first successful retrieval lands at
rung 1, exactly like a word nobody ever claimed — so it cannot inflate her numbers. What it buys is
that day one is not empty, that those words come back as `verify` rather than `new`, and that
`coverage()` can say `'unverified'` instead of confidently reporting 0%.

⚠️ **Re-placing later is safe and needs no special handling.** A claim writes to a field no
measurement writes, so it is structurally incapable of overwriting one.

⚠️ **Do not fabricate retrievals to seed prior knowledge.** It is the obvious shortcut and it writes
a lie into the profile: `strength` would then mean "we pretended she was tested twice". It also
destroys the one number a heritage speaker actually wants, because a claim that survives being
checked is what makes `claimsConfirmed` / `claimsRefuted` computable at all.

`engine/src/testing/learners.ts` has both paths side by side — `claims` (honest, what a product does)
and `recognises` (fabricated, for simulations only) — precisely so the difference stays visible.

### How do I save a learner?

`serialize(profile)` gives you a string; `deserialize(text)` gives it back and **never throws** —
it returns a tagged result, because this runs at app launch against data written by an older build
and a crash there is a learner who cannot open your app.

Where that string goes is yours: a file, AsyncStorage, a Supabase column. The engine has no
filesystem on purpose. `scripts/learner.mjs` is a worked example that puts it in a file.

### ⚠️ You must keep the evidence log. The engine does not.

This was always the house rule — _the evidence log is the truth; a profile is a fold over it_ — and
nothing said it out loud, so nobody was told they had to.

Store every `Evidence` value you pass to `record()`, in your own database, forever. Three reasons,
and the first is not optional:

1. **It is the repair path.** A word's rung is order-dependent (a saturating ±n walk does not
   commute), so a badly-ordered offline sync can leave a rung slightly wrong. The fix is a re-fold
   from the log. Without a log there is no fix.
2. **The stated strategy for a changed memory model is a re-fold.** The ladder will be revised. A
   re-fold with no log is a rebuild from nothing.
3. **The engine keeps no history at all.** A new measurement silently supersedes the old one, and
   past attempts are stored nowhere. `summarize()` snapshots are how you answer "better than March?",
   and you have to take them.

Related: **sort an offline queue by day before folding it.** Every date field is a max-fold and
converges regardless, but the rungs do not. Same-day ties stay genuinely ambiguous and are yours to
break however you like.

## The shortest possible client

```ts
// 1. Load once at startup.
const pack = createPack(config, { frequency, lemmas });
const profile = deserialize(saved).value ?? createProfile('de', today);

// 2. What should she do now? `maxNew` is required — see below.
const session = plan(profile, { day: today, maxItems: 12, maxNew: 4, priority: byFrequency });

// 3. Fetch content for session.content.units, show it, collect answers.
//    If session.content.newUnitsWanted > 0, also pull that many unmet words off your frequency
//    list — the engine has none of its own.
//    Show session.items[].why on screen: 'verify' is not 'new'.

// 4. Fold in what happened — and store the same evidence in YOUR database. See the log obligation.
const next = record(profile, answers);
log.append(answers);

// 5. Size tomorrow's reading.
const hard = coverage(next, pack, {
  text: candidate,
  variety: v,
  direction: 'recognise',
  ignore: names,
});
if (hard.kind === 'measured' && hard.band === 'in-band') use(candidate);
// A claimed-but-unchecked passage comes back 'unverified' with BOTH readings. Its claimedLemmas
// are the best possible `priority` list for tomorrow.

// 6. Is it time to re-measure? Three answers, not two.
if (session.reassess.kind !== 'not-due') offerPlacement();

// 7. Save, and snapshot if you just measured something.
storage.set(serialize(next));
if (justMeasured) history.append(summarize(next, { kind: 'all' }));
```

⚠️ **`maxNew` has no default, deliberately.** Passing `maxItems` reproduces a measured bug: a host
introducing 20 new words a day into a 20-item budget gave review **0% of slots, forever**, silently.
The engine cannot pick the number for you — only you know how long your exercises take — so it made
you type one.

**Start at about half your session.** Swept over a simulated year at 20 drills a day
(`src/core/budget.sweep.test.ts`), words known after 365 days:

| `maxNew` (of 20) |   0 |   2 |    5 |       10 |   14 |  18 |    20 |
| ---------------- | --: | --: | ---: | -------: | ---: | --: | ----: |
| words known      |  59 | 637 | 1206 | **1508** | 1227 | 529 | **0** |

Both ends are catastrophic and the middle is broad. `maxNew: maxItems` learns **nothing at all** —
with new material taking every slot, no word is ever drilled twice, so nothing is ever consolidated.
Anywhere between a quarter and three quarters of the session is within 25% of the peak.

Everything else — screens, audio, streaks, accounts, payments — is yours, and the engine is designed
so that none of it can leak in.
