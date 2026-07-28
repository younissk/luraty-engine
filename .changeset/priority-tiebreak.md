---
'@luraty/engine': minor
---

`PlanOptions.priority` — an optional order the host supplies to break ties between units that have
waited the same number of days.

Ties are the normal case, not an edge case: a learner who was placed or who read a passage acquires
hundreds of units on one day. Without a priority the key tiebreak sorts them alphabetically —
correct, deterministic, and a bad lesson. Passing the pack's frequency order turns
`agieren alternative anders andrea` into `und gegen dazu schule jung`.

The engine still never looks a word up; it respects the order it is given, so scheduling stays
language-free.
