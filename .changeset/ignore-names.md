---
'@luraty/engine': minor
---

`CoverageQuery` gains an optional `ignore?: readonly string[]` and `Coverage` gains `ignoredTokens`.
Surfaces the caller marks as not-vocabulary — names, brands, codes — leave the denominator the same
way `unkeyableTokens` already does.

Measured on held-out German: names and acronyms are 66% of everything a 10,000-lemma pack does not
know. Excluding them moves spoken, news and Wikipedia from `too-hard` to `in-band`.

The CALLER decides, deliberately: German capitalises every noun, so a pack-level rule would credit a
learner for not knowing `Rezession`, and Arabic has no letter case at all.
