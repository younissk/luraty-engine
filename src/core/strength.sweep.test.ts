import { describe, expect, it } from 'vitest';

import type { Evidence } from '../model/evidence.js';
import { unitKey, variety, type Day, type UnitKey } from '../model/ids.js';
import { KNOWN_AT_STRENGTH, MAX_STRENGTH, STRENGTH_STEP } from '../model/unit.js';

/**
 * Sweeping the ladder constants, instead of asserting that today's values are correct.
 *
 * ⚠️ **WHY THIS FILE EXISTS.** v2 shipped two admitted guesses — `PROMOTE_AFTER_SUCCESSES` and the
 * review gap — with a docstring saying a simulation should sweep them, and nothing ever did. v3
 * replaces them with five more numbers, so the same promise made twice would have been a habit.
 *
 * The sweep does NOT prove 6 and 2 are right. Nothing available here could: there are no learners
 * and therefore no data to fit, and a fitted model with zero users is a guess wearing a lab coat.
 * What it proves is narrower and still worth having:
 *
 * 1. The behaviour is **not a knife-edge** — neighbouring ceilings give neighbouring answers, so the
 *    product is not resting on a coincidence at exactly 6.
 * 2. The ledger **classifies rather than smooths** at every setting swept, which is the property gap
 *    3 was about, and the asymmetry is what delivers it.
 *
 * The model here is a closed-form walk over the ladder rather than a call into `record`, on purpose:
 * `MAX_STRENGTH` is a compile-time constant, so a real sweep would need to rebuild the package once
 * per value. This reimplements the four lines of `applyOne`'s arithmetic and is checked against the
 * real fold below, so a drift between the two is a failing test rather than a silently wrong sweep.
 *
 * @module
 */

const V = variety('de');
const D = (n: number): Day => n as Day;
const U = (w: string): UnitKey => unitKey('recognise', V, w);

type Ladder = {
  readonly ceiling: number;
  readonly knownAt: number;
  readonly gain: number;
  readonly miss: number;
};

/**
 * The long-run share of a pool that reads as known, at a given accuracy.
 *
 * A pool of independent words each doing a saturating random walk. Deterministic: the draw is
 * derived by arithmetic from the index, never from a clock or `Math.random`.
 */
function knownShare(ladder: Ladder, accuracy: number, drills = 4000): number {
  const POOL = 400;
  const rungs = new Array<number>(POOL).fill(ladder.knownAt);
  let tick = 0;

  for (let round = 0; round < drills; round++) {
    for (let i = 0; i < POOL; i++) {
      tick += 1;
      const draw = ((Math.imul(tick ^ 0x9e3779b9, 0x85ebca6b) >>> 0) % 100_000) / 100_000;
      const current = rungs[i] ?? 0;
      const next = draw < accuracy ? current + ladder.gain : current - ladder.miss;
      rungs[i] = Math.min(ladder.ceiling, Math.max(0, next));
    }
  }
  return rungs.filter((r) => r >= ladder.knownAt).length / POOL;
}

const SHIPPED: Ladder = {
  ceiling: MAX_STRENGTH,
  knownAt: KNOWN_AT_STRENGTH,
  gain: STRENGTH_STEP.gain,
  miss: STRENGTH_STEP.missRetrieval,
};

describe('the sweep model agrees with the real fold', () => {
  it('reproduces `record`s arithmetic, so the sweep is not measuring a different engine', async () => {
    // ⚠️ THE GUARD THAT MAKES THE REST OF THIS FILE MEAN ANYTHING. A closed-form model of code you
    // also wrote is worth nothing unless it is pinned to the code. Same sequence, both paths.
    //
    // ⚠️ AND IT MUST HIT BOTH SATURATION BOUNDS. The first version of this sequence peaked at rung 5
    // and bottomed at rung 1, so neither `Math.min(ceiling, …)` nor `Math.max(0, …)` ever fired —
    // the guard pinned the unclamped accumulation only, and a model whose ceiling disagreed with the
    // engine's would still have passed. Verified below by asserting both bounds are reached.
    const { record } = await import('./record.js');
    const { createProfile } = await import('./profile.js');
    const outcomes: ('known' | 'unknown')[] = [
      // Climb past the ceiling: eight successes against a ceiling of six.
      'known',
      'known',
      'known',
      'known',
      'known',
      'known',
      'known',
      'known',
      // Fall through the floor: five failures at −2 apiece from six.
      'unknown',
      'unknown',
      'unknown',
      'unknown',
      'unknown',
      // And back up, so the walk is not monotone in either direction.
      'known',
      'known',
      'unknown',
      'known',
    ];

    let rung = 0;
    let hitCeiling = false;
    let hitFloor = false;
    for (const outcome of outcomes) {
      const delta = outcome === 'known' ? SHIPPED.gain : -SHIPPED.miss;
      const raw = rung + delta;
      if (raw > SHIPPED.ceiling) hitCeiling = true;
      if (raw < 0) hitFloor = true;
      rung = Math.min(SHIPPED.ceiling, Math.max(0, raw));
    }
    // The guard's own guard: a sequence that never saturates cannot pin the saturation.
    expect(hitCeiling, 'sequence never reaches the ceiling').toBe(true);
    expect(hitFloor, 'sequence never reaches the floor').toBe(true);

    const folded = record(
      createProfile('de', D(1)),
      outcomes.map((outcome, i): Evidence => ({
        kind: 'retrieval',
        unit: U('x'),
        outcome,
        day: D(i + 1),
      })),
    );
    expect(folded.units[U('x')]?.strength).toBe(rung);
  });
});

describe('sweeping the ceiling', () => {
  it('is not a knife-edge — neighbouring ceilings give neighbouring answers', () => {
    // If 6 were load-bearing, 5 and 7 would give visibly different products. They do not, which is
    // the honest claim available: the value is not tuned, and it does not need to be.
    const at90 = [4, 5, 6, 7, 8].map((ceiling) => knownShare({ ...SHIPPED, ceiling }, 0.9));
    for (const share of at90) expect(share).toBeGreaterThan(0.9);

    // ⚠️ THE BOUND HERE WAS ONCE A TAUTOLOGY, and that is worth recording rather than quietly
    // tightening. With every share already asserted above 0.9 and the metric bounded above by 1, the
    // spread cannot exceed 0.0975 — so `< 0.1` was arithmetically guaranteed and asserted nothing.
    // Measured spread is 0.04; the bound is set just above it, so it can actually fail.
    expect(Math.max(...at90) - Math.min(...at90)).toBeLessThan(0.05);

    // And monotone in the ceiling: more headroom means more buffer against a slip. This is the part
    // the prose claimed and nothing checked.
    for (let i = 1; i < at90.length; i++) {
      expect(at90[i], `ceiling ${String(i + 4)} vs ${String(i + 3)}`).toBeGreaterThanOrEqual(
        at90[i - 1] ?? 0,
      );
    }
  });

  it('keeps the known line strictly inside the ladder at every swept ceiling', () => {
    // `knownAt` at the ceiling would mean a unit stops counting as known on its first miss, which is
    // the v2 behaviour this whole change exists to remove. `knownAt` at 0 would mean everything is
    // known from the moment it is mentioned.
    for (const ceiling of [4, 5, 6, 7, 8]) {
      expect(KNOWN_AT_STRENGTH).toBeGreaterThan(0);
      expect(KNOWN_AT_STRENGTH).toBeLessThan(ceiling);
    }
  });
});

describe('sweeping the asymmetry — the property gap 3 was about', () => {
  it('classifies rather than smooths, at the shipped step', () => {
    // ⚠️ THE MEASUREMENT THAT DECIDED THE ASYMMETRY. The ledger should say "does she know this
    // word", not "how often does she slip". So the curve against accuracy must be STEEP around the
    // break-even point rather than tracking accuracy linearly — which is exactly what v2 did, and
    // why the known count settled at `accuracy x pool`.
    const strong = knownShare(SHIPPED, 0.9);
    const weak = knownShare(SHIPPED, 0.6);
    expect(strong).toBeGreaterThan(0.9);
    expect(weak).toBeLessThan(0.7);
    // The gap between a 90% learner and a 60% learner is much wider than the 30 points of accuracy
    // that separates them. That is the classification.
    expect(strong - weak).toBeGreaterThan(0.3);
  });

  it('shows why a symmetric ladder was rejected', () => {
    // ±1 puts break-even at 50%, so a learner who is wrong four times in ten reads as knowing nearly
    // everything. That is gap 3 softened in the wrong direction — a number that flatters.
    const symmetric = knownShare({ ...SHIPPED, miss: 1 }, 0.6);
    const shipped = knownShare(SHIPPED, 0.6);
    expect(symmetric).toBeGreaterThan(shipped);
    expect(symmetric).toBeGreaterThan(0.75);
  });

  it('puts break-even where the two steps say it does', () => {
    // The one number in v3 that is derived rather than chosen. Below it the ledger drains, above it
    // it fills — and that boundary is a consequence of `gain` and `missRetrieval`, not a third knob.
    const breakEven = SHIPPED.miss / (SHIPPED.gain + SHIPPED.miss);
    // Fifteen points either side of break-even, and the two sides land on opposite halves. The
    // bounds are deliberately loose: the claim is about the DIRECTION the ledger drifts, not about a
    // particular share, and tightening them would turn a structural fact into a brittle number.
    expect(knownShare(SHIPPED, breakEven - 0.15)).toBeLessThan(0.45);
    expect(knownShare(SHIPPED, breakEven + 0.15)).toBeGreaterThan(0.75);
    // Far from break-even, it is emphatic in both directions.
    expect(knownShare(SHIPPED, breakEven - 0.35)).toBeLessThan(0.1);
    expect(knownShare(SHIPPED, breakEven + 0.3)).toBeGreaterThan(0.95);
  });
});
