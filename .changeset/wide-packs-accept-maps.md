---
'@luraty/engine': minor
---

`PackData.lemmas` accepts a `ReadonlyMap` as well as a plain object.

A plain object holds one own property per row and **Hermes caps a plain object at 196,607 own
properties** — measured, `docs/guides/benchmarking.md`, the same ceiling recorded there for
`Profile.units`. Hermes is the runtime React Native ships and the only one where the limit exists,
so a pack that crosses it builds fine, tests green on Node, and dies on the device at module load.
Arabic reached 192,159 rows and had to be capped by a frequency floor to stay under it.

`createPack` already copied either shape into a `Map`, so the object was always a transient that
existed only to satisfy the type. Additive: every existing pack keeps working unchanged, and
neither path materialises a key/value pair per row.
