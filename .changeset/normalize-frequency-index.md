---
'@luraty/engine': patch
---

Fix `createPack` indexing the frequency list by its raw string while every lookup passes a
normalized form.

The `onlyIfRemainderKnown` guard inside affix stripping consults that same map, so for any word a
normalize step touches, the article-bearing and bare forms of one word were filed under two
different unit keys — `key('المدينة')` returned `المدينه` while `key('مدينة')` returned `مدينه`.
`rank(key(w))` was also `undefined` for 7 of the 34 Arabic fixture words and for French `est`.

Nothing errored. The pack built, tokenized and graded; it just credited a learner's knowledge to
the wrong address.
