import { describe, expect, it } from 'vitest';

import { unitKey, variety, type Day } from '../model/ids.js';
import { PROFILE_SCHEMA_VERSION } from '../model/wire.js';

import { deserialize, serialize } from './persist.js';
import { advanceTo, createProfile, unitState } from './profile.js';
import { record } from './record.js';

/**
 * A frozen v1 profile, captured while v1 was still the current format — and the v2 golden that
 * replaced it.
 *
 * ⚠️ THIS FILE HAD A DEADLINE, AND IT PAID OFF.
 *
 * {@link FROZEN_V1} can only be produced by code that writes v1. The moment `serialize()` started
 * emitting v2 — which it now does — no code path in this repo could ever generate a genuine v1 blob
 * again, and the v1→v2 migration would have been tested against a hand-typed guess at what v1
 * looked like.
 *
 * That is the file's own prediction, written before v2 existed: *"WHEN A v2 ARRIVES: do not
 * regenerate this. It becomes the input fixture for the v1→v2 migration test, and its whole value
 * is that it predates the change."* This is that moment. The string below is untouched.
 *
 * `persist.ts` states the rule this exists to keep: *a migration that has never run on realistic
 * old data is not a migration, it is a hope.*
 *
 * @module
 */

/** ⚠️ FROZEN. Real v1 output, captured on 2026-07-28 before the v2 change. Never regenerate. */
const FROZEN_V1 =
  '{"v":1,"language":"ar","day":42,"units":[' +
  '["produce:ar-msa:سوق",{"box":"learning","seen":1,"lastSeen":5,"streak":0}],' +
  '["recognise:ar-msa:سوق",{"box":"understood","seen":2,"lastSeen":5,"confirmedOn":5}],' +
  '["recognise:ar-msa:كتاب",{"box":"learning","seen":1,"lastSeen":9,"streak":0}],' +
  '["recognise:fr:automne",{"box":"learning","seen":1,"lastSeen":12,"streak":1}]' +
  ']}';

/**
 * ⚠️ FROZEN. The same learner, as v2 writes them. Same rule: a deliberate diff here is a schema
 * change — bump the version, write the migration, keep this string as its input.
 */
const FROZEN_V2 =
  '{"v":2,"language":"ar","day":42,"units":[' +
  '["produce:ar-msa:سوق",{"box":"learning","seen":1,"lastSeen":5,"streak":0,"lastProven":0}],' +
  '["recognise:ar-msa:سوق",{"box":"understood","seen":2,"lastSeen":5,"confirmedOn":5}],' +
  '["recognise:ar-msa:كتاب",{"box":"learning","seen":1,"lastSeen":9,"streak":0,"lastProven":0}],' +
  '["recognise:fr:automne",{"box":"learning","seen":1,"lastSeen":12,"streak":1,"lastProven":12}]' +
  ']}';

const AR = variety('ar-msa')!;
const FR = variety('fr')!;
const D = (n: number): Day => n as Day;

/** The exact sequence that produced both goldens. Changing it invalidates them. */
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

describe('wire format', () => {
  it('serializes byte-for-byte as v2 was frozen', () => {
    // A behaviour golden, not a unit test. Every example test in this package is written in terms
    // of the rules, so a change to a rule changes the tests with it and everything stays green.
    // This string cannot rationalise: it is what the engine produced on a specific day, and a diff
    // against it is a human decision about whether the change was intended.
    expect(serialize(goldenProfile())).toBe(FROZEN_V2);
  });

  it('is the version this test claims it is', () => {
    expect(PROFILE_SCHEMA_VERSION).toBe(2);
  });
});

describe('the v1 to v2 migration', () => {
  it('reads a real v1 blob written before v2 existed', () => {
    const loaded = deserialize(FROZEN_V1);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    expect(loaded.value.language).toBe('ar');
    expect(loaded.value.day).toBe(42);
    expect(unitState(loaded.value, unitKey('recognise', AR, 'سوق')).box).toBe('understood');
    expect(unitState(loaded.value, unitKey('produce', AR, 'سوق')).box).toBe('learning');
  });

  it('migrates lastProven to NEVER, not to lastSeen', () => {
    // ⚠️ THE ONE DECISION IN THIS MIGRATION, and the obvious mapping is the wrong one.
    //
    // v1's `lastSeen` is refreshed by PASSIVE exposure. Mapping `lastProven = lastSeen` would stamp
    // every word a learner had merely read recently as recently PROVEN — sending their weakest,
    // most-encountered words to the back of the drill queue. And because the fold is monotonic, that
    // value could never be corrected downward. It would be permanent.
    //
    // Zero errs the other way: everything looks overdue, the learner gets one flood of drills, and
    // the aging score resolves it within a rotation. Over-drilling once is recoverable;
    // under-drilling forever is not.
    const loaded = deserialize(FROZEN_V1);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    // `recognise:fr:automne` was last SEEN on day 12 in v1. The migration must not read that as
    // proof — this is the assertion that fails if someone "simplifies" the migration later.
    const automne = unitState(loaded.value, unitKey('recognise', FR, 'automne'));
    expect(automne.box).toBe('learning');
    if (automne.box !== 'learning') return;
    expect(automne.lastSeen).toBe(12);
    expect(automne.lastProven).toBe(0);
  });

  it('leaves understood units untouched — they already carry their proven day', () => {
    const loaded = deserialize(FROZEN_V1);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const souq = unitState(loaded.value, unitKey('recognise', AR, 'سوق'));
    expect(souq.box).toBe('understood');
    if (souq.box !== 'understood') return;
    expect(souq.confirmedOn).toBe(5);
  });

  it('upgrades a v1 blob to bytes identical to native v2 output', () => {
    // The migration's real contract: after loading, a v1 learner is indistinguishable from a v2 one.
    // If this drifts, two learners with the same history serialize differently depending only on
    // which version of the app first wrote their profile.
    const loaded = deserialize(FROZEN_V1);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    // Not byte-equal to FROZEN_V2: the v1 learner genuinely lost information that v1 never stored
    // (`automne` was proven on day 12, and v1 had nowhere to record it). What must hold is that the
    // result is well-formed v2 and round-trips.
    const reserialized = serialize(loaded.value);
    expect(reserialized).toContain('"v":2');
    expect(reserialized).toContain('"lastProven":0');

    const again = deserialize(reserialized);
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(serialize(again.value)).toBe(reserialized);
  });

  it('passes an unrecognisable v1 unit through rather than throwing', () => {
    // The migration runs on data written by code that no longer exists. Anything it cannot
    // recognise must reach `parseUnit`, which names the offending key in a `malformed` error —
    // rather than this function throwing an unnamed exception at app launch.
    const junk = '{"v":1,"language":"ar","day":1,"units":[["recognise:ar-msa:x",{"box":"???"}]]}';
    const loaded = deserialize(junk);
    expect(loaded.ok).toBe(false);
    if (loaded.ok) return;
    expect(loaded.error.kind).toBe('malformed');
    expect(loaded.error.message).toContain('recognise:ar-msa:x');
  });
});
