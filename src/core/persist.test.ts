import { describe, expect, it } from 'vitest';

import type { Evidence } from '../model/evidence.js';
import { day, unitKey, variety, type Day, type UnitKey } from '../model/ids.js';
import { PROFILE_SCHEMA_VERSION } from '../model/wire.js';

import { deserialize, serialize } from './persist.js';
import { advanceTo, createProfile, unitState } from './profile.js';
import { record } from './record.js';

const AR = variety('ar-msa')!;
const D = (n: number): Day => day(n)!;

function ev(unit: UnitKey, outcome: 'known' | 'unknown', tested: boolean, d: number): Evidence {
  return { unit, outcome, tested, day: D(d) };
}

function populated() {
  let p = createProfile('ar', D(0));
  p = advanceTo(p, D(20));
  p = record(p, [
    ev(unitKey('recognise', AR, 'سوق'), 'known', true, 1),
    ev(unitKey('recognise', AR, 'سوق'), 'known', true, 2),
    ev(unitKey('produce', AR, 'سوق'), 'unknown', true, 2),
    ev(unitKey('recognise', AR, 'كتاب'), 'known', false, 3),
  ]);
  return p;
}

describe('serialize', () => {
  it('round-trips a populated profile', () => {
    const before = populated();
    const after = deserialize(serialize(before));
    expect(after.ok).toBe(true);
    if (after.ok) expect(after.value).toEqual(before);
  });

  it('round-trips an empty profile', () => {
    const before = createProfile('fr', D(0));
    const after = deserialize(serialize(before));
    expect(after.ok).toBe(true);
    if (after.ok) expect(after.value).toEqual(before);
  });

  it('is canonical: insertion order cannot change the bytes', () => {
    // THE flakiness guard. Two profiles with identical state, built by recording the same evidence
    // in different orders, must serialize identically — otherwise a fresh profile and a
    // saved-then-reloaded one differ for no visible reason, and every replay or golden test starts
    // failing at random.
    const a = unitKey('recognise', AR, 'ألف');
    const b = unitKey('recognise', AR, 'ياء');

    const forwards = record(createProfile('ar', D(0)), [
      ev(a, 'known', true, 1),
      ev(b, 'known', true, 1),
    ]);
    const backwards = record(createProfile('ar', D(0)), [
      ev(b, 'known', true, 1),
      ev(a, 'known', true, 1),
    ]);

    expect(serialize(forwards)).toBe(serialize(backwards));
  });

  it('survives a save/load/save cycle byte-for-byte', () => {
    const once = serialize(populated());
    const loaded = deserialize(once);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(serialize(loaded.value)).toBe(once);
  });

  it('stamps the schema version', () => {
    expect(JSON.parse(serialize(populated()))).toMatchObject({ v: PROFILE_SCHEMA_VERSION });
  });

  it('stores units as a sorted list of pairs, not an object', () => {
    // An object would hoist integer-like keys to the front regardless of insertion order. No
    // current unit key can look like an integer, but that is a property of today's key format
    // rather than of JSON — encoding a list puts the ordering in the data instead of in an engine
    // behaviour we are hoping stays true.
    const parsed = JSON.parse(serialize(populated())) as { units: unknown };
    expect(Array.isArray(parsed.units)).toBe(true);

    const keys = (parsed.units as [string, unknown][]).map(([k]) => k);
    expect(keys).toEqual([...keys].sort());
  });
});

describe('deserialize — never throws', () => {
  // Every one of these runs at app launch on data written by an older build. A throw here is a
  // learner whose app will not open, and who cannot downgrade to fix it.
  const cases: [name: string, input: string, kind: string][] = [
    ['empty string', '', 'not-json'],
    ['truncated json', '{"v":1,"lang', 'not-json'],
    ['a bare number', '42', 'malformed'],
    ['an array', '[]', 'malformed'],
    ['null', 'null', 'malformed'],
    ['no version', '{"language":"ar","day":0,"units":[]}', 'malformed'],
    ['no language', '{"v":1,"day":0,"units":[]}', 'malformed'],
    ['empty language', '{"v":1,"language":"","day":0,"units":[]}', 'malformed'],
    ['negative day', '{"v":1,"language":"ar","day":-1,"units":[]}', 'malformed'],
    ['fractional day', '{"v":1,"language":"ar","day":1.5,"units":[]}', 'malformed'],
    ['units not a list', '{"v":1,"language":"ar","day":0,"units":{}}', 'malformed'],
    ['entry not a pair', '{"v":1,"language":"ar","day":0,"units":[["k"]]}', 'malformed'],
    [
      'unknown box',
      '{"v":1,"language":"ar","day":0,"units":[["k",{"box":"x","seen":1,"lastSeen":1}]]}',
      'malformed',
    ],
    [
      'learning without a streak',
      '{"v":1,"language":"ar","day":0,"units":[["k",{"box":"learning","seen":1,"lastSeen":1}]]}',
      'malformed',
    ],
    [
      'understood without a confirmation date',
      '{"v":1,"language":"ar","day":0,"units":[["k",{"box":"understood","seen":1,"lastSeen":1}]]}',
      'malformed',
    ],
    ['from a newer engine', '{"v":99,"language":"ar","day":0,"units":[]}', 'from-the-future'],
    [
      'from a version with no migration',
      '{"v":0,"language":"ar","day":0,"units":[]}',
      'no-migration',
    ],
  ];

  it.each(cases)('handles %s without throwing', (_name, input, kind) => {
    const result = deserialize(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe(kind);
      expect(result.error.message.length).toBeGreaterThan(0);
    }
  });

  it('distinguishes a future version from a corrupt one, so the host can act differently', () => {
    // "Your app is out of date" and "your save is broken" call for different responses. Collapsing
    // them into one error means the host can only ever offer the destructive one.
    const future = deserialize('{"v":99,"language":"ar","day":0,"units":[]}');
    const broken = deserialize('nonsense');
    expect(future.ok).toBe(false);
    expect(broken.ok).toBe(false);
    if (!future.ok && !broken.ok) {
      expect(future.error.kind).not.toBe(broken.error.kind);
    }
  });

  it('reports the offending unit key, which is host data and not learner content', () => {
    const bad = deserialize(
      '{"v":1,"language":"ar","day":0,"units":[["recognise:ar-msa:سوق",{"box":"nope"}]]}',
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.message).toContain('recognise:ar-msa:سوق');
  });

  it('rebuilds usable state, not just a matching object', () => {
    const loaded = deserialize(serialize(populated()));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const key = unitKey('recognise', AR, 'سوق');
    expect(unitState(loaded.value, key).box).toBe('understood');

    // And it keeps folding: a restored profile is a real profile, not a read-only snapshot.
    const after = record(loaded.value, [ev(key, 'unknown', true, 30)]);
    expect(unitState(after, key).box).toBe('learning');
  });
});
