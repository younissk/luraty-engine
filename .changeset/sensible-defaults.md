---
'@luraty/engine': minor
---

Sensible defaults, and a latent pack-id bug closed on the way.

**`createPack` now rejects a pack id that is not a legal variety.** It accepted `'ar:msa'` while
`variety()` rejected the same string — and used as a variety it produced `recognise:ar:msa:سوق`,
which `parseUnitKey` reads back as variety `ar`, word `msa:سوق`. A pack that builds, reports healthy,
and silently re-addresses every word it owns. `LanguagePack.id` is now branded `Variety`.

**`variety()` and `day()` keep their runtime checks and lose the `!` on literals.** A conditional
return type: a literal the compiler proves legal comes back branded, one it proves illegal comes back
`undefined`, and a `string`/`number` from storage keeps its `| undefined` and its check. `day(0)` is
now a compile error rather than a runtime undefined somebody wrote `!` over — the never-sentinel got
stronger. Removed 54 non-null assertions, including two `if (AR !== undefined)` guards that wrapped
the entire Hermes fingerprint: a failing `variety()` would have emitted a shorter fingerprint under
both VMs while the cross-runtime lane went green.

**`LearnerContext.variety` defaults to `pack.id`**, which is safe only because of the validation
above. Pass it explicitly when they differ — a Levantine speaker reading MSA has one profile with two
varieties in it.

**`PlanOptions.maxNew` defaults to `floor(maxItems / 2)`**, and it was required before on an argument
that turned out to be wrong. "There is no safe default" was never measured. Sweeping words-known
after a simulated year across budgets 4–40, accuracies 0.7–0.95 and introduction rates 3–20,
`floor(maxItems / 2)` is the peak or within **3%** of it in every cell. And requiring the field never
prevented the bug it existed for: the catastrophic value is `maxNew === maxItems`, a legal explicit
number and the most natural thing to type. Required-ness converted a silent omission into a silent
explicit mistake.

Refused, with reasons recorded: `CoverageQuery.variety` and `.direction`, `PlanOptions.maxItems`,
both arguments of `createProfile`, and any `day`. A default that could be silently wrong is worse
than an argument.
