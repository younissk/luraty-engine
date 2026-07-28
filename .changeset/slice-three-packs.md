---
'@luraty/engine': minor
---

Add the language pack contract and `createPack()`.

A pack is four functions — `split`, `key`, `rank`, `compare` — and it can be built entirely from a
JSON config plus data files, so adding a language is not a code change. The engine owns a closed
set of named transformations; the pack chooses which to apply.

All transformations are ICU-free: explicit Unicode ranges and an explicit fold table rather than
`String.prototype.normalize()` or `Intl`, both of which are missing on Hermes.
