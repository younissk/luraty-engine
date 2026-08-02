import fc from 'fast-check';

import type { Evidence, EvidenceKind } from '../model/index.js';
import { unitKey, type Day, type Direction, type UnitKey, type Variety } from '../model/index.js';

/**
 * Generators for evidence, in one place.
 *
 * ⚠️ **THIS FILE EXISTS BECAUSE OF A NEAR-MISS.** Before v3 every property test hand-rolled its own
 * `fc.record({ unit, outcome, tested, day })`. When `Evidence` became a four-member union, the
 * mechanical fix — add `kind: fc.constant('retrieval')` — would have left every law in the package
 * green while covering **one of four variants**. The fold law, the order-independence law and the
 * round-trip law would all have passed without ever seeing a claim.
 *
 * That is the same failure this package already learned once, when `fc.string()` turned out to emit
 * printable ASCII only and ten Arabic laws were fed input the pack could not tokenize — all green,
 * all vacuous. `alphabets.ts` exists for that one; this exists for this one.
 *
 * So: one generator, all four kinds, and {@link kindsIn} so a suite can ASSERT it saw them.
 *
 * @module
 */

export type EvidenceUniverse = {
  readonly variety: Variety;
  readonly words: readonly string[];
  readonly directions?: readonly Direction[];
  /** Widest useful span. Deliberately unordered — a sync queue makes no ordering promise. */
  readonly maxDay?: number;
};

/** Units drawn from a small fixed universe, so collisions are common and interleaving gets tested. */
export function arbUnit(universe: EvidenceUniverse): fc.Arbitrary<UnitKey> {
  const directions = universe.directions ?? (['recognise', 'produce'] as const);
  return fc
    .tuple(fc.constantFrom(...directions), fc.constantFrom(...universe.words))
    .map(([direction, word]) => unitKey(direction, universe.variety, word));
}

/**
 * Any piece of evidence, across all four kinds.
 *
 * The weights are not uniform, and that is deliberate: `retrieval` is what a real learner mostly
 * generates, so shrinking finds retrieval-shaped counter-examples first, which are the ones a human
 * can read. But every kind is reachable at every array length, which is the property that matters.
 */
export function arbEvidence(universe: EvidenceUniverse): fc.Arbitrary<Evidence> {
  const unit = arbUnit(universe);
  const day = fc.integer({ min: 0, max: universe.maxDay ?? 400 }).map((n) => n as Day);

  return fc.oneof(
    {
      weight: 6,
      arbitrary: fc.record({
        kind: fc.constant('retrieval' as const),
        unit,
        outcome: fc.constantFrom('known' as const, 'unknown' as const),
        day,
      }),
    },
    { weight: 2, arbitrary: fc.record({ kind: fc.constant('exposure' as const), unit, day }) },
    { weight: 2, arbitrary: fc.record({ kind: fc.constant('help' as const), unit, day }) },
    { weight: 2, arbitrary: fc.record({ kind: fc.constant('claim' as const), unit, day }) },
  );
}

/**
 * Evidence that CANNOT prove anything — every passive kind, and no retrieval.
 *
 * The universe for the law that no quantity of not-being-asked adds up to knowing a word. Under v2
 * that law was expressed as `{ ...anything, outcome: 'known', tested: false }`, which the type now
 * makes unwritable; expressing it as a choice between the two passive VARIANTS is both clearer and
 * strictly wider, because it now covers `help` — which does move the ledger, downward.
 */
export function arbPassive(universe: EvidenceUniverse): fc.Arbitrary<Evidence> {
  const unit = arbUnit(universe);
  const day = fc.integer({ min: 0, max: universe.maxDay ?? 400 }).map((n) => n as Day);
  return fc.oneof(
    fc.record({ kind: fc.constant('exposure' as const), unit, day }),
    fc.record({ kind: fc.constant('help' as const), unit, day }),
    fc.record({ kind: fc.constant('claim' as const), unit, day }),
  );
}

/**
 * Which kinds a generated run actually contained.
 *
 * ⚠️ Pair this with an `expect(...).toEqual(new Set([...]))` at the end of a suite — the pattern
 * `coverage.property.test.ts` already uses for its three band arms. A law that never sees a `claim`
 * is not a law about `Evidence`, and nothing else in the suite will say so.
 */
export function kindsIn(evidence: readonly Evidence[]): Set<EvidenceKind> {
  return new Set(evidence.map((e) => e.kind));
}
