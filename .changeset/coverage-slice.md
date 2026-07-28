---
'@luraty/engine': minor
---

Add `coverage(profile, pack, query)` — how much of a text a learner knows, classified against the
95–98% known-token band (ADR-0003 invariant 1, ADR-0004).

Takes raw text and lets the pack tokenize it, counts running tokens rather than types, and treats a
token as known only when its unit is `understood` for the requested direction and variety.

Returns a three-variant union rather than a flat object: below 20 running tokens the band has no
representable point, so no verdict is produced at all — and putting that on the `kind` axis means
`if (c.band !== 'in-band') makeItEasier()` cannot compile against a text too short to classify.

Also exports `COVERAGE_BAND`, so a host can be told how much text a classifiable measurement needs.
