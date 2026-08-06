---
'@luraty/engine': minor
---

A surface form may now carry more than one lemma, and `LanguagePack` grows a fifth function.

**The question `key` was quietly answering wrong.** `key` answers _are these the same word?_, which
is all the engine ever needed — it addresses knowledge and never renders meaning. A reader needs
_what word is this?_, and in an unvocalised script that has more than one answer: كتب on the page is
كَتَبَ (he wrote) and كُتُب (books). Folding both questions into one function is what let the Arabic
pack commit all 86,910 of its surface forms to exactly one lemma each with nothing anywhere
recording that a choice had been made.

- `PackData.lemmas` accepts `string | readonly string[]`, primary first. A bare string is still
  accepted and still means exactly what it meant — it is the unambiguous case, not a legacy path.
- `LanguagePack.candidates(surface)` returns every reading, likeliest first. **Never empty, and
  element zero is always `key(surface)`**, so a pack that grows a second column moves no unit key,
  no coverage figure and no schedule. Everything in the engine reads `key`, and `key` reads element
  zero.
- `checkPack` gains four problem kinds — `candidates-empty`, `candidates-disagree-with-key`,
  `candidates-repeat` and `candidates-not-canonical` — because the table that breaks these rules is
  a host's generated 90,000-row file, and no fixture-based test can reach it.

**The engine itself never calls `candidates`.** Giving coverage or the scheduler a list would mean
deciding which reading a learner met, and that decision belongs to the learner. It exists for a host
rendering help: showing every sense a form can carry is a learning activity, whereas showing one
guessed sense with a caveat attached transfers the risk to the person least able to evaluate it.

⚠️ **Candidate lemmas are necessary for glossing an unvocalised script and they are not sufficient.**
Arabic's commonest ambiguity is two senses sharing one consonant skeleton — ذهب is _he went_ and
_gold_, علم is _knowledge_ and _flag_ — so both readings normalize to the same lemma and this table
cannot separate them. Nor can the unit key, which means the engine credits one when the learner
meets the other. Separating senses that share a lemma needs a glossary keyed by sense, which no pack
carries today.
