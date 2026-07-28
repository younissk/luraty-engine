---
'@luraty/engine': minor
---

Add persistence: `serialize()` and `deserialize()`, with a versioned wire format.

Serialization is canonical — identical state always produces identical bytes, so a profile is safe
to hash, diff and pin in a golden test. `deserialize()` never throws; it returns a tagged result,
distinguishing corrupt data from a profile written by a newer engine so the host can respond
differently to each.
