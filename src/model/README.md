# src/model — types only, no behaviour

Shapes live here: `Profile`, `UnitState`, `Evidence`, `Session`, `LanguagePack`, and the branded id
types. Nothing in this folder should have a function body worth testing — if it does, it belongs in
`core/`.

The split is not tidiness. `model/` is the vocabulary that `core/` and every consumer share, so it
has to be readable on its own and it must not import from `core/`. Dependencies point
`core/ → model/`, never back.

## What good looks like here

- **Discriminated unions, not optional flags.** `{ kind: 'none' } | { kind: 'claimed'; on: Day }`
  beats one object with an optional `claimedOn`. Every optional field doubles the number of shapes
  that can exist, and only a couple of them are legal.

  ⚠️ **But a union is not free, and this folder used to recommend one that had to be deleted.** The
  example here was once `{ box: 'learning'; streak } | { box: 'understood'; promotedOnDay }`, and it
  earned its keep only while the two variants carried _different_ fields. Under a rung ladder every
  field is meaningful in every state, and a union whose variants are identical is a switch standing
  where a field read belongs — so `UnitState` is now one flat shape and the guarantee moved to
  `Strength` (a literal union) and `Prior` (a real one). Reach for a union when the variants differ,
  not because unions are the house style.

- **`readonly` at every level.** `Readonly<T>` is one level deep — it blocks `p.units = {}` and
  cheerfully allows `p.units[k].seen++`.
- **Branded ids, minted in two steps.** `as` is a promise rather than a check, so assign to the
  shape type first (that is where a template literal actually fires), then brand.
- **No enums.** `erasableSyntaxOnly` rejects them anyway. Use a const object plus a derived union.
