import { describe, expect, expectTypeOf, it } from 'vitest';

import * as engine from './index.js';
import type { Coverage, Day, Evidence, Profile, UnitKey, UnitState, Variety } from './index.js';

/**
 * The types ARE the contract, so they get tested like one.
 *
 * Everything here is checked at compile time and costs nothing at runtime. It catches a class no
 * runtime test can: a type quietly widening. `UnitKey` becoming assignable from a bare string, or
 * `Profile` losing its `readonly`, breaks nothing today and breaks every consumer later — and the
 * suite stays green throughout, because the behaviour did not change.
 *
 * `expectTypeOf` ships with vitest, so this layer needed no new dependency.
 *
 * @module
 */

describe('branded ids cannot be forged', () => {
  it('rejects a bare string where a UnitKey is required', () => {
    // The whole point of branding. Without this, a caller builds a key by hand, gets the segment
    // order wrong, and the compiler waves it through.
    expectTypeOf<string>().not.toExtend<UnitKey>();
    expectTypeOf<string>().not.toExtend<Variety>();
    expectTypeOf<number>().not.toExtend<Day>();

    // @ts-expect-error a raw string is not a UnitKey
    const bad: UnitKey = 'recognise:ar-msa:سوق';
    expect(typeof bad).toBe('string');
  });

  it('lets a branded id flow back out to its base type', () => {
    // One-way: forging is blocked, using is free. A UnitKey must still work as a string.
    expectTypeOf<UnitKey>().toExtend<string>();
    expectTypeOf<Day>().toExtend<number>();
  });

  it('keeps different brands mutually unassignable', () => {
    expectTypeOf<UnitKey>().not.toEqualTypeOf<Variety>();
  });
});

describe('the profile is deeply readonly', () => {
  it('refuses mutation at both levels', () => {
    // `Readonly<T>` is only one level deep, which is why the shape declares `readonly` on every
    // field itself. Without the nested assertion below, `p.units[k].seen++` compiles cleanly.
    //
    // ⚠️ These are COMPILE-TIME assertions and nothing more. The `@ts-expect-error` comments are
    // the test: each one fails the build if the compiler stops objecting. At runtime `readonly` is
    // erased entirely, so the assignments below really do take effect — which is precisely why the
    // engine returns new values instead of relying on callers to behave. A first draft of this test
    // asserted `p.day` was still 0 afterwards and failed, because it was testing a guarantee
    // TypeScript does not make.
    const p: Profile = engine.createProfile('ar', 0 as Day);

    // @ts-expect-error units is readonly
    p.units = {};
    // @ts-expect-error day is readonly
    p.day = 5 as Day;

    const state = p.units['recognise:ar-msa:x' as UnitKey];
    if (state) {
      // @ts-expect-error seen is readonly at the nested level too
      state.seen = 99;
    }

    expectTypeOf<Profile['units']>().toEqualTypeOf<Readonly<Record<UnitKey, UnitState>>>();
    expect(typeof p).toBe('object');
  });
});

describe('unit state is a discriminated union, not an object with optional fields', () => {
  it('exposes streak only while learning and confirmedOn only once understood', () => {
    const state = {} as UnitState;
    if (state.box === 'learning') {
      expectTypeOf(state.streak).toEqualTypeOf<number>();
      // @ts-expect-error confirmedOn does not exist on the learning variant
      expect(state.confirmedOn).toBeUndefined();
    } else {
      expectTypeOf(state.confirmedOn).toEqualTypeOf<Day>();
      // @ts-expect-error streak does not exist on the understood variant
      expect(state.streak).toBeUndefined();
    }
  });
});

describe('decoding forces the caller to handle failure', () => {
  it('returns a union that cannot be read without narrowing', () => {
    // If this ever collapses to `Profile | undefined`, or worse to `Profile`, a caller can skip the
    // check and a corrupt save becomes a crash at app launch.
    const result = engine.deserialize('{}');

    // @ts-expect-error `value` is not present until `ok` is narrowed to true
    expect(result.value).toBeUndefined();

    if (result.ok) {
      expectTypeOf(result.value).toEqualTypeOf<Profile>();
    } else {
      expectTypeOf(result.error.kind).toEqualTypeOf<engine.DecodeErrorKind>();
    }
  });
});

describe('record takes a readonly array', () => {
  it('accepts a mutable array without letting the engine mutate it', () => {
    // Callers lose nothing — a mutable array is assignable to a readonly one — while `evidence.push`
    // inside the engine becomes a compile error.
    const evidence: Evidence[] = [];
    expectTypeOf(engine.record).toBeCallableWith(engine.createProfile('ar', 0 as Day), evidence);
  });
});

describe('coverage cannot be read without deciding what it measured', () => {
  it('keeps the band off the variants that have no band', () => {
    // ⚠️ THE LOAD-BEARING SHAPE ASSERTION for this slice, and one that no runtime test can make.
    //
    // The tempting design is one flat object whose `band` includes a fourth value meaning "cannot
    // tell". It reads fine and it leaves `if (c.band !== 'in-band') makeItEasier()` compiling —
    // silently treating "cannot tell" as "too hard", which is the exact oscillation the fourth
    // state exists to prevent. Putting resolution on the `kind` axis makes that line a type error.
    //
    // If someone later flattens this, every runtime test still passes.
    const result = {} as Coverage;

    // @ts-expect-error `band` is not on the union — it exists only once `kind` is 'measured'
    expect(result.band).toBeUndefined();
    // @ts-expect-error nor are the counts, until the text is known to have had words in it
    expect(result.runningTokens).toBeUndefined();

    if (result.kind === 'measured') {
      expectTypeOf(result.band).toEqualTypeOf<engine.Band>();
      expectTypeOf(result.runningTokens).toEqualTypeOf<number>();
    } else if (result.kind === 'too-short') {
      expectTypeOf(result.needsMoreTokens).toEqualTypeOf<number>();
      // @ts-expect-error a text too short to classify has no band
      expect(result.band).toBeUndefined();
    } else {
      expectTypeOf(result.unkeyableTokens).toEqualTypeOf<number>();
      // @ts-expect-error a text with no words has no token counts either
      expect(result.runningTokens).toBeUndefined();
    }
  });

  it('is a closed three-member union', () => {
    expectTypeOf<Coverage['kind']>().toEqualTypeOf<'no-words' | 'too-short' | 'measured'>();
    expectTypeOf<engine.Band>().toEqualTypeOf<'too-hard' | 'in-band' | 'too-easy'>();
  });

  it('requires a direction and a variety on every query', () => {
    // No default. The recognise/produce gap is the defining feature of this learner, so a coverage
    // number that does not say which one it measured is not a number anybody can act on.
    expectTypeOf<engine.CoverageQuery>().toEqualTypeOf<{
      readonly text: string;
      readonly variety: Variety;
      readonly direction: engine.Direction;
    }>();
  });
});

describe('the public surface', () => {
  it('exports exactly what is expected, and nothing more', () => {
    // A surface golden. Widening the barrel is a promise to strangers that is hard to withdraw, so
    // it should be a visible line in a diff rather than a side effect of an import.
    expect(Object.keys(engine).sort()).toEqual([
      'COVERAGE_BAND',
      'DEFAULT_REVIEW_GAP_DAYS',
      'DIRECTIONS',
      'ENGINE_API_VERSION',
      'OVER_ASK',
      'PROFILE_SCHEMA_VERSION',
      'PROMOTE_AFTER_SUCCESSES',
      'advanceTo',
      'checkPack',
      'coverage',
      'createPack',
      'createProfile',
      'day',
      'deserialize',
      'hasMet',
      'parseUnitKey',
      'plan',
      'record',
      'serialize',
      'unitKey',
      'unitState',
      'variety',
    ]);
  });

  it('does not leak internals', () => {
    // `internal/` is mechanism, not contract. If any of it appears here, the barrel has grown a
    // promise nobody meant to make.
    for (const forbidden of ['applyStep', 'applySteps', 'assertNever']) {
      expect(Object.keys(engine)).not.toContain(forbidden);
    }
  });
});
