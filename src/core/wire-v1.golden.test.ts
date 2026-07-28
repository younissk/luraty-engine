import { describe, expect, it } from 'vitest';

import { unitKey, variety, type Day } from '../model/ids.js';
import { PROFILE_SCHEMA_VERSION } from '../model/wire.js';

import { deserialize, serialize } from './persist.js';
import { advanceTo, createProfile, unitState } from './profile.js';
import { record } from './record.js';

/**
 * A frozen v1 profile, captured while v1 is still the current format.
 *
 * ⚠️ THIS FILE HAD A DEADLINE, WHICH IS WHY IT EXISTS BEFORE IT IS NEEDED.
 *
 * The string below can only be produced by code that writes v1. The moment `serialize()` starts
 * emitting v2, no code path in this repo can ever generate a genuine v1 blob again — and the
 * v1→v2 migration would then be tested against a hand-typed guess at what v1 looked like.
 *
 * `persist.ts` states the rule it would have broken: *a migration that has never run on realistic
 * old data is not a migration, it is a hope.* This is the realistic old data, captured while it was
 * still possible.
 *
 * WHEN A v2 ARRIVES: do not regenerate this. It becomes the input fixture for the v1→v2 migration
 * test, and its whole value is that it predates the change.
 *
 * @module
 */

const FROZEN_V1 =
  '{"v":1,"language":"ar","day":42,"units":[' +
  '["produce:ar-msa:سوق",{"box":"learning","seen":1,"lastSeen":5,"streak":0}],' +
  '["recognise:ar-msa:سوق",{"box":"understood","seen":2,"lastSeen":5,"confirmedOn":5}],' +
  '["recognise:ar-msa:كتاب",{"box":"learning","seen":1,"lastSeen":9,"streak":0}],' +
  '["recognise:fr:automne",{"box":"learning","seen":1,"lastSeen":12,"streak":1}]' +
  ']}';

const AR = variety('ar-msa')!;
const FR = variety('fr')!;
const D = (n: number): Day => n as Day;

/** The exact sequence that produced {@link FROZEN_V1}. Changing it invalidates the golden. */
function goldenProfile() {
  let p = createProfile('ar', D(0));
  p = advanceTo(p, D(42));
  return record(p, [
    { unit: unitKey('recognise', AR, 'سوق'), outcome: 'known', tested: true, day: D(1) },
    { unit: unitKey('recognise', AR, 'سوق'), outcome: 'known', tested: true, day: D(5) },
    { unit: unitKey('produce', AR, 'سوق'), outcome: 'unknown', tested: true, day: D(5) },
    { unit: unitKey('recognise', AR, 'كتاب'), outcome: 'known', tested: false, day: D(9) },
    { unit: unitKey('recognise', FR, 'automne'), outcome: 'known', tested: true, day: D(12) },
  ]);
}

describe('wire format v1', () => {
  it('still serializes byte-for-byte as it did when v1 was frozen', () => {
    // A behaviour golden, not a unit test. Every example test in this package is written in terms
    // of the rules, so a change to a rule changes the tests with it and everything stays green.
    // This string cannot rationalise: it is what the engine produced on a specific day, and a diff
    // against it is a human decision about whether the change was intended.
    //
    // ⚠️ Do NOT regenerate this to make it pass. If the diff is deliberate, that is a schema
    // change: bump PROFILE_SCHEMA_VERSION, write the migration, and keep this string as the
    // migration's input.
    expect(serialize(goldenProfile())).toBe(FROZEN_V1);
  });

  it('is still readable by the current engine', () => {
    const loaded = deserialize(FROZEN_V1);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    expect(loaded.value.language).toBe('ar');
    expect(loaded.value.day).toBe(42);
    expect(unitState(loaded.value, unitKey('recognise', AR, 'سوق')).box).toBe('understood');
    expect(unitState(loaded.value, unitKey('produce', AR, 'سوق')).box).toBe('learning');
  });

  it('is the version this test claims it is', () => {
    // If PROFILE_SCHEMA_VERSION has moved past 1, this file's job changed: the golden becomes a
    // migration fixture and this assertion is the reminder to go and write that migration.
    expect(PROFILE_SCHEMA_VERSION).toBe(1);
  });
});
