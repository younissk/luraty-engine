---
'@luraty/engine': minor
---

Close four holes a code review found, each of which failed silently.

**`deserialize` never checked the unit key.** Any non-empty string was accepted and stored in
`Profile.units`, which is typed `Record<UnitKey, …>` — so branded keys were being minted by fiat. A
blob holding `"garbage"` decoded clean, and `plan()` handed that string back to the host in
`session.items[].unit` and `content.units`. The host cannot `parseUnitKey` it, so it can build no
exercise, and the unit never leaves the profile — the session is one item shorter every day from
then on. Keys are now parsed (`isUnitKey`, the narrowing form of `parseUnitKey`, added so
`unitKey()` stays the only `as UnitKey` in the package), and a blob listing the same unit twice is
rejected instead of silently keeping the last one.

**`plan()` applied the review gap to units that had never been proven.** `reviewGapDays` means the
wait _after_ a proof, but a never-proven unit scores `day - 0`, so with a young epoch that score was
small and the unit was filtered out entirely. Measured: a learner started at day 0 got empty
sessions on days 1 and 2, while the identical profile started at day 2000 got its items
immediately — the engine's decisions depended on which epoch the host happened to pick. A
never-proven unit is now always due. The ordering needs no matching special case, since `day - 0` is
already greater than or equal to every proven unit's `day - n`.

**`createPack` threw on a config it promised to validate.** It returns a `Decoded` precisely because
a config is a JSON file a human wrote, but neither step list was checked, so an unrecognised name
reached `applyStep`'s exhaustive switch and came out as `assertNever`'s exception. Three measured
cases: `normalize: ['stripDiacritics']` (the obvious generic guess, and the name this engine
deliberately does not have) threw from inside `createPack`; `compare: ['normalizeAlef']` was worse —
the pack **built**, reported healthy, and threw later from `compare()`, mid-session, when a learner
submitted an answer; and `normalize: 'lowercase'` (a string where a JSON file wants an array) threw
about a step named `"l"`. Both lists are now checked at build time against the closed set, with an
error that names the alternatives.

**`CompoundConfig` is exported.** It is reachable through `PackConfig.compounds` and therefore
public either way; leaving it unnamed meant a consumer had to guess the shape of the one feature
German needs.
