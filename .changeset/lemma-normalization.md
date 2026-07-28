---
'@luraty/engine': patch
---

Normalize both sides of the lemma table in `createPack`, the same way the frequency list already is.

`key()` looks the table up with an already-normalized surface form, so a raw key could never match.
Found with real German data: a pack author writes the natural `"läuft": "laufen"` and gets
`key('läuft') === 'laeuft'` — the inflected form and the infinitive become two separate units, and
proving one never credits the other.

Also adds `runDemo`'s `PackOverride`, so a host can point the demo at a real pack read from disk.
