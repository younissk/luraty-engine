import { describe, expect, it } from 'vitest';

import { unitKey, variety, type Day } from '../model/ids.js';
import { PROFILE_SCHEMA_VERSION } from '../model/wire.js';
import { isKnown, KNOWN_AT_STRENGTH, MAX_STRENGTH } from '../model/unit.js';

import { deserialize, serialize } from './persist.js';
import { advanceTo, createProfile, unitState } from './profile.js';
import { record } from './record.js';

/**
 * Every wire format this engine has ever written, frozen at the moment it stopped being current.
 *
 * ⚠️ THIS FILE HAS NOW PAID OFF TWICE, AND THE RULE IS THE SAME BOTH TIMES.
 *
 * {@link FROZEN_V1} can only be produced by code that writes v1; {@link FROZEN_V2} only by code that
 * writes v2. `serialize()` writes v3, so no code path in this repo can generate either one again.
 * Regenerating them means hand-typing a guess at what an old format looked like — which is exactly
 * the failure `persist.ts` names: *a migration that has never run on realistic old data is not a
 * migration, it is a hope.*
 *
 * The file predicted its own second use before v2 existed: *"WHEN A v2 ARRIVES: do not regenerate
 * this. It becomes the input fixture for the v1→v2 migration test, and its whole value is that it
 * predates the change."* v2 then repeated the instruction for v3. Both strings below are untouched,
 * and a v1 blob now traverses TWO migration steps to reach the current shape — which is the whole
 * argument for migrating stepwise rather than writing one v1→v3 jump.
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
 * ⚠️ FROZEN. Real v2 output, captured 2026-07-29 before the v3 change. Never regenerate — it is now
 * the input fixture for the v2→v3 migration, exactly as v1 became v2's.
 */
const FROZEN_V2 =
  '{"v":2,"language":"ar","day":42,"units":[' +
  '["produce:ar-msa:سوق",{"box":"learning","seen":1,"lastSeen":5,"streak":0,"lastProven":0}],' +
  '["recognise:ar-msa:سوق",{"box":"understood","seen":2,"lastSeen":5,"confirmedOn":5}],' +
  '["recognise:ar-msa:كتاب",{"box":"learning","seen":1,"lastSeen":9,"streak":0,"lastProven":0}],' +
  '["recognise:fr:automne",{"box":"learning","seen":1,"lastSeen":12,"streak":1,"lastProven":12}]' +
  ']}';

/**
 * ⚠️ FROZEN. Real v3 output, captured 2026-07-30 before the v4 change. Never regenerate — it is now
 * the input fixture for the v3→v4 migration, exactly as v1 became v2's and v2 became v3's.
 *
 * Read against `FROZEN_V2`, this string IS the v3 change: the box is gone, `streak` became
 * `strength` on a bounded ladder, one anchor became three, and every unit carries a `prior` and a
 * `lapses` count.
 */
const FROZEN_V3 =
  '{"v":3,"language":"ar","day":42,"units":[' +
  '["produce:ar-msa:سوق",{"seen":1,"lastSeen":5,"lastAsked":5,"lastProven":0,"prior":null,"strength":0,"lapses":1}],' +
  '["recognise:ar-msa:سوق",{"seen":2,"lastSeen":5,"lastAsked":5,"lastProven":5,"prior":null,"strength":2,"lapses":0}],' +
  '["recognise:ar-msa:كتاب",{"seen":1,"lastSeen":9,"lastAsked":0,"lastProven":0,"prior":null,"strength":0,"lapses":0}],' +
  '["recognise:fr:automne",{"seen":1,"lastSeen":12,"lastAsked":12,"lastProven":12,"prior":null,"strength":1,"lapses":0}]' +
  ']}';

/**
 * ⚠️ FROZEN. The same learner as v4 writes them. Same rule as its three predecessors.
 *
 * Read against `FROZEN_V3`, this string IS the v4 change, and it is the whole argument for it:
 * **the values are identical and the file is less than half the size.** Every one of those seven
 * field names appeared once per unit, for every word a learner has ever met.
 *
 * ⚠️ This golden now does a second job the earlier ones did not. Under v3 a field name announced its
 * own position; under v4 the order IS the format, so this string is the executable specification of
 * it. A field inserted, reordered or dropped shows up here as a diff a human has to approve — which
 * is the answer to the obvious objection that a positional row is easy to get silently wrong.
 */
const FROZEN_V4 =
  '{"v":4,"language":"ar","day":42,"units":[' +
  '["produce:ar-msa:سوق",1,5,5,0,null,0,1],' +
  '["recognise:ar-msa:سوق",2,5,5,5,null,2,0],' +
  '["recognise:ar-msa:كتاب",1,9,0,0,null,0,0],' +
  '["recognise:fr:automne",1,12,12,12,null,1,0]' +
  ']}';

const AR = variety('ar-msa');
const FR = variety('fr');
const D = (n: number): Day => n as Day;

/** The exact sequence that produced both goldens. Changing it invalidates them. */
function goldenProfile() {
  let p = createProfile('ar', D(1));
  p = advanceTo(p, D(42));
  return record(p, [
    { kind: 'retrieval', unit: unitKey('recognise', AR, 'سوق'), outcome: 'known', day: D(1) },
    { kind: 'retrieval', unit: unitKey('recognise', AR, 'سوق'), outcome: 'known', day: D(5) },
    { kind: 'retrieval', unit: unitKey('produce', AR, 'سوق'), outcome: 'unknown', day: D(5) },
    { kind: 'exposure', unit: unitKey('recognise', AR, 'كتاب'), day: D(9) },
    { kind: 'retrieval', unit: unitKey('recognise', FR, 'automne'), outcome: 'known', day: D(12) },
  ]);
}

describe('wire format', () => {
  it('serializes byte-for-byte as v4 was frozen', () => {
    // A behaviour golden, not a unit test. Every example test in this package is written in terms
    // of the rules, so a change to a rule changes the tests with it and everything stays green.
    // This string cannot rationalise: it is what the engine produced on a specific day, and a diff
    // against it is a human decision about whether the change was intended.
    expect(serialize(goldenProfile())).toBe(FROZEN_V4);
  });

  it('is the version this test claims it is', () => {
    expect(PROFILE_SCHEMA_VERSION).toBe(4);
  });

  it('is less than half the size v3 was, for the same learner', () => {
    // ⚠️ THE POINT OF v4, ASSERTED RATHER THAN CLAIMED IN A COMMENT. The two strings above hold the
    // identical values, so the whole difference is field names — 73 bytes per unit, repeated once
    // for every word a learner has ever met. Measured on a real 20,000-unit profile it was 60% of
    // the file; on this four-unit fixture the ratio is smaller only because the keys are long.
    //
    // A range rather than an exact number: this pins the ORDER OF MAGNITUDE of the win so that a
    // future change quietly reintroducing per-unit names fails here, without making the test a
    // second copy of the goldens that has to be edited whenever they legitimately move.
    expect(FROZEN_V4.length).toBeLessThan(FROZEN_V3.length * 0.55);
  });
});

describe('the migration chain', () => {
  it('reads a real v1 blob written before v2 existed', () => {
    const loaded = deserialize(FROZEN_V1);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    expect(loaded.value.language).toBe('ar');
    expect(loaded.value.day).toBe(42);
    expect(isKnown(unitState(loaded.value, unitKey('recognise', AR, 'سوق')))).toBe(true);
    expect(isKnown(unitState(loaded.value, unitKey('produce', AR, 'سوق')))).toBe(false);
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
    expect(isKnown(automne)).toBe(false);
    expect(automne.lastSeen).toBe(12);
    expect(automne.lastProven).toBe(0);
    // ⚠️ AND THE SAME TEST ONE FIELD ALONG. v2→v3 must not import `lastSeen` into `lastAsked`
    // either, for the identical reason: it is a monotone max-fold, so a contaminated value can
    // never be corrected downward. This unit was SEEN on day 12 and never asked about at all.
    expect(automne.lastAsked).toBe(0);
  });

  it('leaves understood units untouched — they already carry their proven day', () => {
    const loaded = deserialize(FROZEN_V1);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const souq = unitState(loaded.value, unitKey('recognise', AR, 'سوق'));
    expect(isKnown(souq)).toBe(true);
    expect(souq.lastProven).toBe(5);
    // v2's `confirmedOn` was simultaneously the last proof AND the last ask — the understood box
    // could only be entered or refreshed by a real retrieval. This is the one place the two anchors
    // provably coincide, so v3 takes both from it with no guessing.
    expect(souq.lastAsked).toBe(5);
    // ⚠️ THE KNOWN RUNG, NOT THE CEILING. v2 stored no repetition count, so this value has to be
    // invented, and the two candidates fail differently. `MAX_STRENGTH` would claim maximal
    // robustness for a word proven exactly twice — it would then survive three consecutive failures
    // before ceasing to count as known, inflating coverage on a fabricated basis. That is
    // under-drilling on invented evidence, the worst combination available. The known rung is the
    // MINIMUM value preserving v2's own verdict, so nobody's coverage number moves on migration,
    // while leaving the unit maximally fragile: one failed drill takes it to zero.
    expect(souq.strength).toBe(KNOWN_AT_STRENGTH);
  });

  it('upgrades a v1 blob to a well-formed current profile that round-trips', () => {
    // The migration's real contract: after loading, a v1 learner is indistinguishable from a native
    // one. If this drifts, two learners with the same history serialize differently depending only
    // on which version of the app first wrote their profile.
    const loaded = deserialize(FROZEN_V1);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    // Not byte-equal to FROZEN_V4: the v1 learner genuinely lost information that v1 never stored
    // (`automne` was proven on day 12, and v1 had nowhere to record it). What must hold is that the
    // result is well-formed and round-trips.
    const reserialized = serialize(loaded.value);
    expect(reserialized).toContain('"v":4');
    // The whole row for `automne`, positionally: seen 1, lastSeen 12, lastAsked 0, lastProven 0,
    // no claim, rung 1, no lapses. Under v3 this assertion could name one field; under v4 naming
    // one field is impossible, so it names all of them — which is strictly better, because the
    // failure mode v4 introduces is a SHIFT, and only a whole-row assertion can see a shift.
    expect(reserialized).toContain('["recognise:fr:automne",1,12,0,0,null,1,0]');

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

  it('reads a real v2 blob written before v3 existed', () => {
    const loaded = deserialize(FROZEN_V2);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.value.language).toBe('ar');
    expect(loaded.value.day).toBe(42);
    expect(Object.keys(loaded.value.units)).toHaveLength(4);
  });

  it('migrates lastAsked from lastProven, not from lastSeen', () => {
    // ⚠️ THE ONE REAL DECISION IN v2→v3, AND THE OBVIOUS ASSERTION FOR IT IS VACUOUS.
    //
    // `recognise:fr:automne` is the unit a reader reaches for, and in FROZEN_V2 it has
    // `lastSeen: 12` AND `lastProven: 12` — so it cannot distinguish the two mappings at all. It is
    // asserted below anyway, because it pins the NON-zero path, but it must not be the only one.
    //
    // These two discriminate: both were seen and neither was ever proven.
    const loaded = deserialize(FROZEN_V2);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    // Seen on day 5 (a failed retrieval), never proven. `lastSeen` would give 5.
    const produceSouq = unitState(loaded.value, unitKey('produce', AR, 'سوق'));
    expect(produceSouq.lastSeen).toBe(5);
    expect(produceSouq.lastAsked).toBe(0);

    // Seen on day 9 (passive), never asked, never proven. `lastSeen` would give 9.
    const kitaab = unitState(loaded.value, unitKey('recognise', AR, 'كتاب'));
    expect(kitaab.lastSeen).toBe(9);
    expect(kitaab.lastAsked).toBe(0);

    // And the non-zero path: proven on day 12, so asked on day 12.
    const automne = unitState(loaded.value, unitKey('recognise', FR, 'automne'));
    expect(automne.lastAsked).toBe(12);
  });

  it('carries a v1 blob through BOTH steps to a well-formed v3 profile', () => {
    // The argument for migrating stepwise rather than writing one v1→v3 jump: two decisions taken
    // independently compose into the right answer with no special case. `automne` has streak 1 and
    // no `lastProven` in v1 — the v1 step sets `lastProven: 0`, and the v2 step then reads that as
    // `lastAsked: 0` and `strength: min(1, 1)`. It arrives not known and maximally overdue.
    const loaded = deserialize(FROZEN_V1);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const automne = unitState(loaded.value, unitKey('recognise', FR, 'automne'));
    expect(automne.lastSeen).toBe(12);
    expect(automne.lastAsked).toBe(0);
    expect(automne.lastProven).toBe(0);
    expect(automne.strength).toBe(1);
    expect(isKnown(automne)).toBe(false);

    // Nothing in v2 was ever a claim, so nothing may migrate into one — inventing claims here would
    // fabricate exactly the thing `Prior` exists to keep honest.
    for (const state of Object.values(loaded.value.units)) {
      expect(state.prior).toEqual({ kind: 'none' });
      expect(state.lapses).toBe(0);
    }
  });

  it('passes an unrecognisable v2 unit through rather than throwing', () => {
    const junk = '{"v":2,"language":"ar","day":1,"units":[["recognise:ar-msa:x",{"box":"???"}]]}';
    const loaded = deserialize(junk);
    expect(loaded.ok).toBe(false);
    if (loaded.ok) return;
    expect(loaded.error.kind).toBe('malformed');
    expect(loaded.error.message).toContain('recognise:ar-msa:x');
  });

  it('clamps a hand-edited v2 streak rather than minting a known unit from a learning one', () => {
    // ⚠️ A DEFENCE THAT WAS DOCUMENTED AT LENGTH AND PINNED BY NOTHING. `MIGRATIONS[2]` maps
    // `strength = min(streak, KNOWN_AT_STRENGTH - 1)`, and the comment explains the `min` is there
    // so a hand-edited `streak: 9` cannot arrive as a verified-known word. A correct v2 could only
    // ever write 0 or 1 — which is exactly why no golden reaches this branch, and why removing the
    // `min` survived the whole suite.
    const tampered =
      '{"v":2,"language":"de","day":10,"units":[' +
      '["recognise:de:haus",{"box":"learning","seen":1,"lastSeen":3,"streak":9,"lastProven":3}]' +
      ']}';
    const loaded = deserialize(tampered);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const haus = unitState(loaded.value, unitKey('recognise', variety('de'), 'haus'));
    expect(haus.strength).toBe(KNOWN_AT_STRENGTH - 1);
    // The point of the clamp: a LEARNING unit must not become a KNOWN one by migrating.
    expect(isKnown(haus)).toBe(false);
  });

  it('names an unreadable v2 unit rather than throwing at app launch', () => {
    // The other documented defence: anything `MIGRATIONS[2]` cannot recognise is passed through
    // untouched so `parseUnit` produces a `malformed` error CARRYING THE KEY — rather than this
    // function throwing an unnamed exception on the app's launch path, where a learner cannot
    // downgrade to escape it.
    for (const broken of [
      '{"v":2,"language":"de","day":1,"units":[["recognise:de:x",{"box":"learning","seen":1,"lastSeen":1}]]}',
      '{"v":2,"language":"de","day":1,"units":[["recognise:de:x",{"box":"understood","seen":1,"lastSeen":1}]]}',
      '{"v":2,"language":"de","day":1,"units":[["recognise:de:x",{"box":"sideways","seen":1,"lastSeen":1}]]}',
    ]) {
      const loaded = deserialize(broken);
      expect(loaded.ok).toBe(false);
      if (loaded.ok) continue;
      expect(loaded.error.kind).toBe('malformed');
      expect(loaded.error.message).toContain('recognise:de:x');
    }
  });

  it('rejects a v3 blob whose rung is not a whole number, and clamps one that is too large', () => {
    // The asymmetry `parseUnit` documents: corruption must be NAMED, but a profile written by a
    // build whose ceiling was higher has to stay loadable — that is what lets `MAX_STRENGTH` be
    // lowered after a sweep as a code change rather than a wire bump.
    const withStrength = (v: string) =>
      `{"v":3,"language":"de","day":1,"units":[["recognise:de:x",{"seen":1,"lastSeen":1,"lastAsked":1,"lastProven":1,"prior":null,"strength":${v},"lapses":0}]]}`;

    expect(deserialize(withStrength('2.5')).ok).toBe(false);
    expect(deserialize(withStrength('-1')).ok).toBe(false);

    const tooHigh = deserialize(withStrength('99'));
    expect(tooHigh.ok).toBe(true);
    if (tooHigh.ok) {
      expect(unitState(tooHigh.value, unitKey('recognise', variety('de'), 'x')).strength).toBe(
        MAX_STRENGTH,
      );
    }
  });

  it('refuses a v3 blob whose prior is neither null nor a day', () => {
    // `undefined` is NOT accepted as "no claim": a missing field means the migration did not run,
    // which is a different fact from "never claimed" and must not be rounded into it.
    const withPrior = (v: string) =>
      `{"v":3,"language":"de","day":1,"units":[["recognise:de:x",{"seen":1,"lastSeen":1,"lastAsked":1,"lastProven":1,${v}"strength":1,"lapses":0}]]}`;

    expect(deserialize(withPrior('"prior":null,')).ok).toBe(true);
    expect(deserialize(withPrior('"prior":7,')).ok).toBe(true);
    expect(deserialize(withPrior('')).ok).toBe(false);
    expect(deserialize(withPrior('"prior":"yes",')).ok).toBe(false);
    expect(deserialize(withPrior('"prior":-1,')).ok).toBe(false);
  });
});

describe('the v3 to v4 re-encoding', () => {
  it('produces bytes IDENTICAL to what v4 writes natively', () => {
    // ⚠️ THE STRONGEST ASSERTION IN THIS FILE, and only v4 could make it.
    //
    // The v1→v2 and v2→v3 steps each had to INVENT a value — v1 stored no `lastProven`, v2 stored no
    // repetition count — so a migrated learner is legitimately not byte-identical to a native one and
    // those tests can only check the result is well-formed. v3→v4 invents nothing: it is a pure
    // re-encoding of the same seven values. So the bar is exact equality, and anything less means the
    // "no decisions were taken here" claim on `MIGRATIONS[3]` is false.
    const loaded = deserialize(FROZEN_V3);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(serialize(loaded.value)).toBe(FROZEN_V4);
  });

  it('reads a native v4 blob back to the same profile', () => {
    const loaded = deserialize(FROZEN_V4);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(serialize(loaded.value)).toBe(FROZEN_V4);
    expect(loaded.value.day).toBe(42);
    expect(isKnown(unitState(loaded.value, unitKey('recognise', AR, 'سوق')))).toBe(true);
    expect(isKnown(unitState(loaded.value, unitKey('produce', AR, 'سوق')))).toBe(false);
  });

  it('refuses a row of the wrong length instead of reading the fields it can', () => {
    // ⚠️ THE FAILURE MODE v4 INTRODUCES, PINNED. A named object announces its own gaps: a missing
    // `lastProven` is `undefined` and obvious. A positional row does not — drop one element and
    // every field after the gap silently becomes its neighbour, so `lastAsked` arrives as
    // `lastProven`. That is a plausible number that quietly changes what the scheduler believes,
    // and it is exactly the objection to a positional format.
    //
    // The answer is that the length is checked EXACTLY, in both directions. Short is a truncated or
    // mis-migrated blob; long is a newer format that arrived without a version bump, and assuming
    // the extra elements are ignorable is how a forward-compatibility bug becomes a data bug.
    const row = (body: string) =>
      `{"v":4,"language":"de","day":1,"units":[["recognise:de:x",${body}]]}`;

    expect(deserialize(row('1,5,5,5,null,2,0')).ok).toBe(true);
    for (const broken of [
      row('1,5,5,5,null,2'), // one short — every field after the gap shifts
      row('1,5,5,5,null,2,0,0'), // one long
      row('1,5,5,5,null'), // three short
      // A bare key and nothing else. Written out rather than via `row('')`, which would produce a
      // trailing comma and therefore `not-json` — a different error, and one that would let this
      // case pass for the wrong reason.
      '{"v":4,"language":"de","day":1,"units":[["recognise:de:x"]]}',
    ]) {
      const loaded = deserialize(broken);
      expect(loaded.ok).toBe(false);
      if (loaded.ok) continue;
      expect(loaded.error.kind).toBe('malformed');
      // ⚠️ It must NAME the unit. That is why the decoder reads position 0 before it judges the
      // row's shape: the error is worth having only if it says which word is broken.
      expect(loaded.error.message).toContain('recognise:de:x');
    }
  });

  it('refuses a row whose fields are the right count and the wrong type', () => {
    // A shift that happens to preserve the length is the remaining hole, and the only defence is
    // that every position is type-checked. A `null` in an anchor slot or a string in a counter is
    // what a shifted `prior` actually looks like.
    const row = (body: string) =>
      `{"v":4,"language":"de","day":1,"units":[["recognise:de:x",${body}]]}`;

    expect(deserialize(row('1,5,5,null,null,2,0')).ok).toBe(false); // prior's null, one slot early
    expect(deserialize(row('1,5,5,5,null,2,"0"')).ok).toBe(false); // lapses as a string
    expect(deserialize(row('1,5,5,5,0,2,0')).ok).toBe(true); // a real claim on day 0 is a number
    expect(deserialize(row('1,-5,5,5,null,2,0')).ok).toBe(false); // a negative anchor
    expect(deserialize(row('1.5,5,5,5,null,2,0')).ok).toBe(false); // a fractional counter
  });

  it('passes an unrecognisable v3 unit through rather than throwing', () => {
    // The same defence the two earlier steps carry: anything `MIGRATIONS[3]` cannot recognise
    // reaches `parseRow`, which names the offending key — rather than this function throwing an
    // unnamed exception on the app's launch path.
    const junk = '{"v":3,"language":"de","day":1,"units":[["recognise:de:x","not a unit"]]}';
    const loaded = deserialize(junk);
    expect(loaded.ok).toBe(false);
    if (loaded.ok) return;
    expect(loaded.error.kind).toBe('malformed');
    expect(loaded.error.message).toContain('recognise:de:x');
  });

  it('still refuses a profile written by a newer engine', () => {
    const future = deserialize('{"v":5,"language":"de","day":1,"units":[]}');
    expect(future.ok).toBe(false);
    if (future.ok) return;
    expect(future.error.kind).toBe('from-the-future');
  });
});
