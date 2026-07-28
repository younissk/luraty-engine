# Adding a language

> Status: **implemented**, 2026-07-28. `createPack` and `checkPack` ship, and three packs are built
> this way — French, Arabic (MSA) and German, in [`src/testing/packs.ts`](../../src/testing/packs.ts).
> Read that file next; it is the worked example this guide describes.

The engine knows no language. Everything language-specific is injected as a **pack**: four small
functions plus data.

## The contract

|           | what it does                 | French                    | Arabic                              | German                        |
| --------- | ---------------------------- | ------------------------- | ----------------------------------- | ----------------------------- |
| `split`   | text → pieces                | on spaces and punctuation | on spaces                           | on spaces                     |
| `key`     | are these two the same word? | `vais` → `aller`          | `السوق` → `سوق` (strip the article) | `Bahnhofstraße` → `strasse`   |
| `rank`    | how common is it             | frequency list            | frequency list                      | frequency list                |
| `compare` | is this answer right         | fold accents              | fold diacritics                     | umlauts two-letter (`ö`→`oe`) |

The engine sees four keys for one sentence and three for another and has no idea that one of them
needed an article stripped off. That is the whole point.

## Data, not code

A pack is **config plus data**, so adding a language is two files rather than a pull request against
the engine. `createPack` takes them as two arguments — the config describes the choices, the data
carries the words:

```ts
import { checkPack, createPack } from '@luraty/engine';

const built = createPack(
  {
    id: 'ar-msa',
    tokenize: { strategy: 'regex', pattern: '[\\u0600-\\u06FF]+' },
    normalize: [
      'stripArabicDiacritics',
      'stripTatweel',
      'normalizeArabicAlef',
      'normalizeArabicFinals',
    ],
    affixes: { prefixes: ['ال', 'لل', 'و', 'ب', 'ل', 'ف', 'ك'], onlyIfRemainderKnown: true },
    compare: [
      'stripPunctuation',
      'stripArabicDiacritics',
      'stripTatweel',
      'normalizeArabicAlef',
      'normalizeArabicFinals',
    ],
  },
  { frequency: await loadText('freq.txt'), lemmas: await loadJson('lemmas.json') },
);

// `createPack` returns a result and never throws — the config is a file a human wrote.
if (!built.ok) throw new Error(built.error.message);

// Then check it against REAL text before you trust it. See "check it" below.
const problems = checkPack(built.value, { text: 'في المدينة سوق كبير.' });
```

The `loadText` / `loadJson` above are **yours**. The engine cannot read a file — see "the engine
must not load it" below.

### The normalize steps are a closed set

Naming a step the engine does not have is a `malformed` result, not a silent no-op. The whole list:

| step                    | does                                         |
| ----------------------- | -------------------------------------------- |
| `lowercase`             | `toLowerCase()` — never the locale-aware one |
| `stripPunctuation`      | an explicit table, Arabic marks included     |
| `stripArabicDiacritics` | the optional short-vowel marks               |
| `stripTatweel`          | the elongation character, U+0640             |
| `normalizeArabicAlef`   | آ أ إ ٱ → ا                                  |
| `normalizeArabicFinals` | ة → ه, ى → ي                                 |
| `foldLatinDiacritics`   | é→e, ç→c, ü→u. **Right for French**          |
| `foldGermanUmlauts`     | ä→ae, ö→oe, ü→ue, ß→ss. **Right for German** |

⚠️ **There is deliberately no generic `stripDiacritics`.** French and German are the same script and
want opposite answers: `ö→o` would merge _schön_ (beautiful) with _schon_ (already), _zählen_ (to
count) with _zahlen_ (to pay), _drücken_ (to press) with _drucken_ (to print). One name over both
behaviours is how the wrong one gets applied to the wrong language. If your language needs a
transformation that is not in the table, add it to `NormalizeStep` and `internal/text.ts` — once,
after which every language has it.

⚠️ **Order matters.** German lists `foldGermanUmlauts` _before_ `foldLatinDiacritics`, so the umlauts
are already two letters by the time the Latin table runs and finds nothing left to ruin. Reverse
them and _schön_ collapses into _schon_ anyway.

### The tokenize pattern is a character class, not a regex

`pattern` must be exactly `[...]+` — a single character class followed by `+`. Anything else is
rejected at build time.

That is not a restriction in practice (`[a-z]+`, `[؀-ۿ]+`, `[a-zA-Zà-öø-ÿ']+` all pass), and it is
what makes catastrophic backtracking impossible by construction rather than by hoping nobody writes
a nested quantifier. A six-character `(a+)+b` took **790 ms** to fail on a 27-character string
before the shape was enforced — on a phone that is a frozen app on the first sentence a learner
reads, and it scales exponentially.

Put a character _inside_ a word into the class: French declares `'` a word character so `l'automne`
survives splitting as one piece, and the elision is then handled by affix stripping.

### Affixes, and why they are safe without a morphological analyser

`onlyIfRemainderKnown: true` refuses a strip whose remainder is not a word the frequency list
contains. Arabic و ("and") is a real prefix, so ولد would strip to لد — which is not a word, so the
strip is refused. German `ge-` is only safe for the same reason: `gesagt` → `sagt` is accepted,
`Geld` → `ld` and `gehen` → `hen` are refused.

A word the list _already knows_ is never stripped at all. Without that guard, German `geben` (in
every frequency list) stripped `ge` and keyed to `ben`, while the lemma table mapped `gibt`, `gab`
and `gegeben` onto `geben` — one word, two unit keys, and measured against real news text it cost
105 running tokens.

### Compounds, for languages that build them productively

Optional, and German is why it exists. `Bahnhofstraße` and `Krankenversicherung` are absent from any
frequency list and always will be — the set is infinite — so without this each one reads as an
unknown word and coverage _understates_ comprehension:

```ts
compounds: { minPartLength: 4, linkers: ['', 's', 'n', 'en', 'es'] }
```

A split is accepted only if **every part is a word the frequency list contains**; nothing is
guessed. `minPartLength` is not optional and should not be 2 — German is full of two-letter
fragments that are also words (`ei`, `so`, `an`, `um`), and at 2 almost any long word "decomposes"
into nonsense. The decomposed compound keys to its **head** (`Bahnhofstraße` → `straße`), which is
right for comprehension and wrong for production: see `CompoundConfig` for that trade stated in
full.

### The lemma table is written in ordinary spelling

`createPack` normalizes **both sides** of the table, so a pack author writes natural German
(`"zählt": "zählen"`) rather than hand-transliterating. Before it did, `key('läuft')` normalized to
`laeuft`, missed the raw table entirely, and the inflected form and the infinitive became two
separate units — proving one never credited the other.

An explicit lemma entry beats a derived one, because irregular forms are exactly the ones affix
rules get wrong.

## Check it against real text

```ts
const problems = checkPack(pack, { text: 'a sentence a learner would actually meet' });
```

Run this at load time, and in your own CI. **No unit test can reach what it catches**: fixtures are
hand-written and correct by construction, and the input that actually breaks is the 20,000-word file
you are about to ship. A pack that fails these is not a pack that crashes — it is a pack that works,
quietly, and teaches nobody anything.

It reports:

- **`empty-vocabulary`** — nothing in the sample ranked. Almost always the wrong separator: Leipzig,
  OpenSubtitles and wordfreq are all **one word per line**, and a list split on the wrong character
  yields one enormous "word" so every lookup misses. Affix stripping silently stops working too,
  because it consults the same table.
- **`tokenizer-matches-nothing`** — the pattern does not cover this script.
- **`unstable-key`** — `key(key(w)) !== key(w)`, so one word files itself under two keys depending on
  the route it took. Reported once, not once per token.
- **`compare-always-true`** / **`compare-rejects-identity`** — grading is broken. "Marks everything
  correct" is the worst failure this package can have and the one nobody reports, because learners
  do not complain about being told they are right.

## Three things that will bite

**Frequency data is a whole-language artifact.** You cannot derive "how common is this word" from
one learner. Ship a list — OpenSubtitles frequency lists, Leipzig corpora and `wordfreq` are all
free. Roughly 800 KB per language.

Pack it as a **rank-ordered string**, not a JSON object: the position _is_ the rank, so you store no
numbers, and 50k keys of `{"de":1,"la":2}` (~1.5 MB, parsed on the main thread at cold start on
Hermes) becomes ~180 KB. Truncate past ~20k, where the only real information left is "rare".
Whitespace of any kind separates entries, so a one-word-per-line file works as-is.

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
