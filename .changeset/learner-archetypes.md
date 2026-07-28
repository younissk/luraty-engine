---
'@luraty/engine': minor
---

Add simulated learner archetypes to `src/testing/` — `heritageSpeaker`, `classroomLearner`,
`beginner`, and a declarative `learner(spec)` builder.

Deterministic from a seed, so a simulation is reproducible rather than an anecdote. Not part of the
public API: these FABRICATE a history, which is right for a simulation and would be a lie in the
product. The real version is placement, and it is not built.

`npm run demo -- de --pack ../packs/de compare` puts the three on one screen.
