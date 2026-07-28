---
'@luraty/engine': minor
---

Add a `foldGermanUmlauts` normalize step (ä→ae, ö→oe, ü→ue, ß→ss) and a German pack fixture.

German exposed a defect in the step set: `foldLatinDiacritics` maps ö→o, which is correct for
French (`café` = `cafe`) and destructive for German. Measured, it merged schön/schon, zählen/zahlen,
fördern/fordern, drücken/drucken, schwül/schwul and Bär/Bar — different words in every case.

`make demo` is now language-parameterised: `npm run demo -- de` or `-- ar`.
