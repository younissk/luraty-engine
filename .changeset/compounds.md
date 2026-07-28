---
'@luraty/engine': minor
---

Add optional compound splitting to the pack contract (`CompoundConfig`), and stop the affix
stripper from taking apart a word the frequency list already knows.

German builds compounds productively, so `Bahnhofstraße` and `Krankenversicherung` are absent from
any list and always will be. Without this each one reads as unknown, and coverage UNDERSTATES a
German learner's comprehension — the dangerous direction. A split is accepted only if every part is
in the list, and the compound keys to its head.

The affix fix is a bug: German `geben` was stripped to `ben`, while its own inflections lemmatized
to `geben`. One word, two unit keys. Measured on real news text it was the single commonest
"unknown" word in the sample, costing 105 running tokens.
