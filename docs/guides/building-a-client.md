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

| how you measure                              | what it becomes                          | `tested`    |
| -------------------------------------------- | ---------------------------------------- | ----------- |
| CEFR self-assessment ("I can order food")    | evidence on the words that skill implies | **`false`** |
| Reading a text, tapping what they don't know | untapped words → known, tapped → unknown | `false`     |
| Imitation / repeat-after-me                  | evidence on `produce` units              | `true`      |
| Speaking a prompt, scored                    | evidence on `produce` units              | `true`      |
| A vocabulary quiz                            | evidence on the asked units              | `true`      |

⚠️ **`tested` is the only strength dial, and self-report must be `false`.** A word marked
`tested: false` can never be promoted — it counts as exposure, not proof. That is not a limitation,
it is the finding: learner self-ratings correlate only about **r ≈ .39** with tested proficiency.
Letting a self-assessment promote a word would mean the engine believes a guess.

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
  against your own past, not against a level. A profile is a plain value, so keep last month's and
  diff them — "you can read 400 more words than in March" is two `serialize()` calls apart. There
  is no helper for this yet; there does not need to be.

## Questions that come up first

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
const evidence = knownWords.flatMap((lemma) => [
  { unit: unitKey('recognise', v, lemma), outcome: 'known', tested: true, day },
  { unit: unitKey('recognise', v, lemma), outcome: 'known', tested: true, day },
]);
const placed = record(createProfile('de', day), evidence);
```

Two rounds because `PROMOTE_AFTER_SUCCESSES` is 2. If your placement was a _self-report_ rather
than a test, use `tested: false` — the words will be tracked and scheduled, but not treated as
proven, which is the honest reading of a guess.

`engine/src/testing/learners.ts` does exactly this to fabricate simulated learners. Read it as a
worked example, not as an API — it invents a history, which is right for a simulation and a lie in a
product.

### How do I save a learner?

`serialize(profile)` gives you a string; `deserialize(text)` gives it back and **never throws** —
it returns a tagged result, because this runs at app launch against data written by an older build
and a crash there is a learner who cannot open your app.

Where that string goes is yours: a file, AsyncStorage, a Supabase column. The engine has no
filesystem on purpose. `scripts/learner.mjs` is a worked example that puts it in a file.

## The shortest possible client

```ts
// 1. Load once at startup.
const pack = createPack(config, { frequency, lemmas });
const profile = deserialize(saved).value ?? createProfile('de', today);

// 2. What should she do now?
const session = plan(profile, { day: today, maxItems: 12, priority: byFrequency });

// 3. You fetch content for session.content.units, show it, collect answers.

// 4. Fold in what happened.
const next = record(profile, answers);

// 5. Size tomorrow's reading.
const hard = coverage(next, pack, {
  text: candidate,
  variety: v,
  direction: 'recognise',
  ignore: names,
});
if (hard.kind === 'measured' && hard.band === 'in-band') use(candidate);

// 6. Save.
storage.set(serialize(next));
```

Six calls. Everything else — screens, audio, streaks, accounts, payments — is yours, and the engine
is designed so that none of it can leak in.
