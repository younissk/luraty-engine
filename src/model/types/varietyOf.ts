/**
 * What `variety()` can return, given what the caller actually passed.
 *
 * `string extends S` is the "was this a literal?" test, and it is the whole design. Anything that
 * arrived from storage, a settings screen, `JSON.parse` or a config field keeps its `| undefined`
 * and keeps its check, because there the failure is a real possibility. A literal the compiler can
 * already prove legal comes back branded; one it can prove illegal comes back `undefined`, which
 * upgrades `variety('ar:msa')` from a runtime `undefined` somebody wrote `!` over into a compile
 * error at the point of use.
 *
 * ⚠️ **This removes CEREMONY, never a GUARD.** The function body is untouched, so a JavaScript
 * consumer, a `someString as 'de'` cast, and every value crossing `deserialize` hit exactly the same
 * check they did before. If anyone ever "simplifies" that body out on the grounds that the type
 * already prevents the bad case, all three lose their protection silently — which is why
 * `tests/model/ids.test.ts` asserts the runtime behaviour through a lying cast as well as the type.
 *
 * ⚠️ It is inference-sensitive, and that is correct rather than a bug: `{ v: 'de' } as const`
 * narrows and needs no check, the same object without `as const` widens to `string` and does. A
 * mutable field genuinely could hold anything by the time it is read.
 *
 * @module
 */

import type { Variety } from './variety.js';

export type VarietyOf<S extends string> = string extends S
  ? Variety | undefined
  : S extends '' | `${string}:${string}`
    ? undefined
    : Variety;
