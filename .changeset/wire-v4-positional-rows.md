---
'@luraty/engine': minor
---

Wire v4 — a stored unit is a positional row, not a named object. **2.44 MB → 1002 KB** for a
20,000-unit learner, measured under Hermes against the real 10,000-lemma German pack.

**Breaking for stored bytes, not for the API.** Nothing exported changes shape;
`PROFILE_SCHEMA_VERSION` moves 3 → 4. Stored profiles migrate v1/v2/v3 → v4 automatically. A v4 blob
is **not** readable by an older engine, which reports `from-the-future` rather than guessing.

```
v3   ["recognise:de:haus",{"seen":2,"lastSeen":880,"lastAsked":880,"lastProven":878,
                           "prior":null,"strength":2,"lapses":0}]
v4   ["recognise:de:haus",2,880,880,878,null,2,0]
```

The seven field names ADR-0006 gave a unit were **60% of the file** — the same seven strings,
repeated once for every word a learner has ever met. Measured by re-encoding a real profile:
2,438,933 bytes, of which the values are 978,933. That file is written on every save and parsed
before the first frame at launch, on a phone.

| 20,000 units  | before  | after       |
| ------------- | ------- | ----------- |
| blob          | 2.44 MB | **1002 KB** |
| `serialize`   | 57 ms   | **41 ms**   |
| `deserialize` | 48 ms   | **44 ms**   |

The bytes fell 59% and the times did not, and the guide says why rather than claiming the win it
wanted: sorting the keys is 26.5 of `serialize`'s 57 ms on Hermes and the encoding does not touch
it, and `deserialize` is dominated by building 20,000 objects and validating 20,000 unit keys rather
than by `JSON.parse`. The size number is the one that reaches flash on every save.

**The order is the format**, declared once on `WireRowV4`; `toRow` and `parseRow` are the only two
functions permitted to know it. Append a field, never insert one. Three defences against the failure
a positional row introduces — a row one element short reads every later field as its neighbour:
the length is checked **exactly** in both directions, every position is type-checked, and the frozen
golden is now the executable specification of the order.

`MIGRATIONS[3]` invents nothing, so its bar is exact: a v3 blob must reserialize **byte-identically**
to native v4. The v1→v2 and v2→v3 steps could not make that claim, because each had to invent a
value.

ADR-0007, which also records the decision **not** taken: `Profile.units` stays a plain object. As a
`Map` it is 34–98% faster on Node and **7–133% slower on Hermes**.
