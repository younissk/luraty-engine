import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  clampStrength,
  hasStandingClaim,
  isKnown,
  KNOWN_AT_STRENGTH,
  MAX_STRENGTH,
  strengthOf,
  STRENGTH_STEP,
  UNMET,
  type UnitState,
} from './unit.js';
import type { Day } from './ids.js';

/**
 * The rung ladder, and the door it arrives through.
 *
 * `clampStrength` runs inside `parseUnit`, against bytes written by a build that no longer exists.
 * It must be total on every number a JSON parse can produce — including the two that are not
 * numbers in any useful sense.
 *
 * @module
 */

const state = (over: Partial<UnitState>): UnitState => ({ ...UNMET, ...over });

describe('the ladder', () => {
  it('is bounded and integral, with the known line inside it', () => {
    expect(KNOWN_AT_STRENGTH).toBeGreaterThan(0);
    expect(KNOWN_AT_STRENGTH).toBeLessThan(MAX_STRENGTH);
    expect(Number.isInteger(MAX_STRENGTH)).toBe(true);
  });

  it('derives its break-even accuracy from the two steps rather than a third guess', () => {
    // ⚠️ THE ONE NUMBER IN v3 THAT IS DERIVED RATHER THAN CHOSEN, and the reason the ladder is
    // asymmetric. Expected drift per drill at accuracy `a` is `gain * a - missRetrieval * (1 - a)`,
    // positive above `missRetrieval / (gain + missRetrieval)`. That makes the ledger a CLASSIFIER —
    // "does she know this word?" — rather than a smoothed readout of her global error rate, which is
    // exactly what the old model produced.
    //
    // A symmetric ±1 ladder would put break-even at 50% and report a 60%-accurate learner as knowing
    // nearly everything. Asserted here so that "just make it ±1" is a failing test rather than a
    // plausible-sounding simplification.
    const breakEven =
      STRENGTH_STEP.missRetrieval / (STRENGTH_STEP.gain + STRENGTH_STEP.missRetrieval);
    expect(breakEven).toBeGreaterThan(0.6);
    expect(breakEven).toBeLessThan(0.75);
    expect(STRENGTH_STEP.missRetrieval).toBeGreaterThan(STRENGTH_STEP.gain);
    // Asking for help is a weaker negative than failing a retrieval. She did the right thing.
    expect(STRENGTH_STEP.missHelp).toBeLessThan(STRENGTH_STEP.missRetrieval);
  });
});

describe('clampStrength — the parse door', () => {
  it('is total on every number, including the ones that are not really numbers', () => {
    expect(clampStrength(Number.NaN)).toBe(0);
    expect(clampStrength(Number.POSITIVE_INFINITY)).toBe(MAX_STRENGTH);
    expect(clampStrength(Number.NEGATIVE_INFINITY)).toBe(0);
    expect(clampStrength(-3)).toBe(0);
    expect(clampStrength(2.7)).toBe(2);
    expect(clampStrength(MAX_STRENGTH + 100)).toBe(MAX_STRENGTH);
  });

  it('always lands on the ladder, for any number at all', () => {
    fc.assert(
      fc.property(fc.double({ noDefaultInfinity: false, noNaN: false }), (n) => {
        const rung = clampStrength(n);
        expect(strengthOf(rung)).toBe(rung);
      }),
    );
  });

  it('clamps a rung from a build with a HIGHER ceiling rather than rejecting it', () => {
    // ⚠️ THE ASYMMETRY IS THE POINT, and it is what lets `MAX_STRENGTH` be lowered after a
    // simulation sweep as a code change rather than a wire bump. `parseUnit` REJECTS a non-whole
    // rung — corruption must be named — but clamps an over-large one, because a profile written by
    // a build whose ceiling was 8 has to stay loadable on a build whose ceiling is 6.
    expect(clampStrength(8)).toBe(MAX_STRENGTH);
    expect(strengthOf(8)).toBeUndefined();
  });
});

describe('the two predicates', () => {
  it('defines known as one comparison, in one place', () => {
    for (let rung = 0; rung <= MAX_STRENGTH; rung++) {
      expect(isKnown(state({ strength: clampStrength(rung) }))).toBe(rung >= KNOWN_AT_STRENGTH);
    }
  });

  it('counts a claim as standing only until somebody checks it', () => {
    const claim = { kind: 'claimed' as const, on: 5 as Day };
    expect(hasStandingClaim(state({ prior: claim }))).toBe(true);
    // Asked — so no longer standing, whatever the answer was. That is what makes the confirmed and
    // refuted counts computable without storing any history.
    expect(hasStandingClaim(state({ prior: claim, lastAsked: 9 as Day }))).toBe(false);
    expect(hasStandingClaim(state({}))).toBe(false);
  });
});

describe('UNMET', () => {
  it('claims nothing at all about a word nobody has mentioned', () => {
    // Every date zero, not `profile.day`. v2's accessor returned today as an unmet unit's `lastSeen`,
    // which asserted a sighting that never happened; nothing read it, so nothing caught it.
    expect(UNMET).toEqual({
      seen: 0,
      lastSeen: 0,
      lastAsked: 0,
      lastProven: 0,
      prior: { kind: 'none' },
      strength: 0,
      lapses: 0,
    });
    expect(isKnown(UNMET)).toBe(false);
    expect(hasStandingClaim(UNMET)).toBe(false);
  });
});
