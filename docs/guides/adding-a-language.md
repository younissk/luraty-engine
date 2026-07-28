# Adding a language

> Status: **planned**, 2026-07-28. The pack contract is designed but not implemented — this
> describes the intended shape so the first implementation does not have to invent it.

The engine knows no language. Everything language-specific is injected as a **pack**: four small
functions plus data.

## The contract

|           | what it does                 | French                    | Arabic                              |
| --------- | ---------------------------- | ------------------------- | ----------------------------------- |
| `split`   | text → pieces                | on spaces and punctuation | on spaces                           |
| `key`     | are these two the same word? | `vais` → `aller`          | `السوق` → `سوق` (strip the article) |
| `rank`    | how common is it             | frequency list            | frequency list                      |
| `compare` | is this answer right         | fold accents              | fold diacritics                     |

The engine sees four keys for one sentence and three for another and has no idea that one of them
needed an article stripped off. That is the whole point.

## The goal: data, not code

A pack should be **config plus data files**, so adding a language is two files rather than a pull
request against the engine:

```jsonc
{
  "id": "ar-msa",
  "tokenize": { "strategy": "regex", "pattern": "[\\u0600-\\u06FF]+" },
  "normalize": ["stripDiacritics", "normalizeAlef"],
  "affixes": { "prefixes": ["ال", "و", "ف", "ب", "ل", "لل"], "onlyIfRemainderKnown": true },
  "compare": ["stripDiacritics", "normalizeAlef"],
  "data": { "frequency": "freq.txt", "lemmas": "lemmas.tsv" },
}
```

The named strategies (`regex`, `stripDiacritics`, …) live once in the engine. A language that needs
a genuinely new one — Chinese and Japanese have no spaces, so they need dictionary segmentation —
means adding that strategy once, after which it serves every language.

## Three things that will bite

**Frequency data is a whole-language artifact.** You cannot derive "how common is this word" from
one learner. Ship a list — OpenSubtitles frequency lists, Leipzig corpora and `wordfreq` are all
free. Roughly 800 KB per language.

Pack it as a **rank-ordered string**, not a JSON object: the position _is_ the rank, so you store no
numbers, and 50k keys of `{"de":1,"la":2}` (~1.5 MB, parsed on the main thread at cold start on
Hermes) becomes ~180 KB. Truncate past ~20k, where the only real information left is "rare".

**The engine must not load it.** `rank()` reads data that is already resident; a host-side loader
resolves the asset. If the engine imports a data file it has acquired an asset dependency and is no
longer runtime-agnostic.

**No `Intl`, no `normalize()`.** These are the obvious implementations of `split` and `compare`, and
they are ICU-backed — green on Node, broken on Hermes. Ship an explicit character map instead. Lint
will stop you, but it is worth knowing _why_ before you hit it.

## One profile per language

Two languages are two separate profiles with no shared state — you are a different person in each
one. For a diglossic language such as Arabic, the dialect and the Standard are two _varieties_ and
are measured separately, with shared roots used as a **starting prior** rather than shared
knowledge. The difference matters: one exploits the learner's real asset, the other fabricates
knowledge they do not have.
