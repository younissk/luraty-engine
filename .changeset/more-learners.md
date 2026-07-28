---
'@luraty/engine': minor
---

Add `rustySpeaker` and `silentReader` archetypes, and give the heritage speaker REGISTER-shaped
holes rather than random ones — denser on formal vocabulary (`-ung`, `-heit`, `-tion`), which is
what ADR-0002 means by "domain-shaped".

`npm run demo -- de --pack ../packs/de compare` now shows six learners with a GAP column: the share
of what they read that they cannot say. Classroom 23–24%, heritage 62%, silent reader 88%.
