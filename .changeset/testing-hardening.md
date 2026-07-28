---
'@luraty/engine': patch
---

Fix six defects found by a testing audit, and add the layers that would have caught them.

`compare()` no longer accepts an answer key that normalizes to nothing; every pack now grades
punctuation identically; frequency lists parse on any whitespace, not just spaces; tokenize patterns
must be a character class, so a six-character regex can no longer freeze the app; and evidence
arriving out of order can no longer rewind a unit's timestamps.

Adds `checkPack()` for validating real pack data at load time.
