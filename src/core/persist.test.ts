import { describe, expect, it } from 'vitest';

import type { Evidence } from '../model/evidence.js';
import { day, unitKey, variety, type Day, type UnitKey } from '../model/ids.js';
import type { Profile } from '../model/profile.js';
import { PROFILE_SCHEMA_VERSION } from '../model/wire.js';

import { deserialize, serialize } from './persist.js';
import { advanceTo, createProfile, unitState } from './profile.js';
import { record } from './record.js';
import { isKnown } from '../model/unit.js';

const AR = variety('ar-msa')!;
const D = (n: number): Day => day(n)!;

/**
 * Build evidence from the v2 vocabulary, so the examples below stay readable.
 *
 * `tested` is no longer a field — it is the choice of VARIANT. Keeping the parameter here maps the
 * old vocabulary onto the new one in one place instead of at forty call sites, and it makes the
 * translation explicit: a passive signal is `exposure` when she read past the word and `help` when
 * she asked. v2 could not tell those apart, which is how a gloss tap came to demote a word she had
 * proven four months earlier.
 */
function ev(unit: UnitKey, outcome: 'known' | 'unknown', tested: boolean, d: number): Evidence {
  if (tested) return { kind: 'retrieval', unit, outcome, day: D(d) };
  return outcome === 'known'
    ? { kind: 'exposure', unit, day: D(d) }
    : { kind: 'help', unit, day: D(d) };
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

  // ── The key is parsed, not merely non-empty ─────────────────────────────────────────────────
  // Regression. `deserialize` used to accept ANY non-empty string as a unit key, which minted
  // branded `UnitKey`s by fiat: a blob holding "garbage" decoded clean, and `plan()` handed that
  // string straight back to the host in `session.items[].unit`. The host cannot `parseUnitKey` it,
  // so it can build no exercise — and the unit never leaves the profile, so the session is one item
  // shorter every day from then on. Nothing errored.
  it.each([
    ['no colons at all', 'garbage'],
    ['one colon only', 'recognise:de'],
    ['an unknown direction', 'guess:de:haus'],
    ['an empty variety', 'recognise::haus'],
    ['an empty word', 'recognise:de:'],
    ['not a key at all', '💥'],
  ])('refuses a stored key that parseUnitKey rejects: %s', (_why, key) => {
    const blob = JSON.stringify({
      v: 2,
      language: 'de',
      day: 10,
      units: [[key, { box: 'learning', seen: 1, lastSeen: 3, streak: 0, lastProven: 0 }]],
    });
    const got = deserialize(blob);
    expect(got.ok).toBe(false);
    if (!got.ok) {
      expect(got.error.kind).toBe('malformed');
      expect(got.error.message).toContain(key);
    }
  });

  it('accepts every key it can itself mint', () => {
    // The other half of the law above: the check must not be so strict that a profile this package
    // serialized fails to load. A word containing a colon is the interesting case — the key format
    // puts the word last precisely so that survives.
    const colonised = unitKey('produce', AR, 'a:b:c');
    const p: Profile = {
      language: 'ar',
      day: D(5),
      units: {
        [colonised]: {
          seen: 1,
          lastSeen: D(5),
          lastAsked: D(0),
          lastProven: D(0),
          prior: { kind: 'none' },
          strength: 0,
          lapses: 0,
        },
      },
    };
    const loaded = deserialize(serialize(p));
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(Object.keys(loaded.value.units)).toEqual([colonised]);
  });

  it('refuses a blob that lists the same unit twice', () => {
    // Last-one-wins would make the survivor depend on write order, in a decoder whose every other
    // malformation is named out loud. `serialize` cannot emit this — its input is a Record — so a
    // blob carrying two is hand-edited or corrupt either way.
    const key = unitKey('recognise', AR, 'سوق');
    const blob = JSON.stringify({
      v: 3,
      language: 'ar',
      day: 10,
      units: [
        [
          key,
          {
            seen: 1,
            lastSeen: 3,
            lastAsked: 0,
            lastProven: 0,
            prior: null,
            strength: 0,
            lapses: 0,
          },
        ],
        [
          key,
          {
            seen: 99,
            lastSeen: 9,
            lastAsked: 9,
            lastProven: 9,
            prior: null,
            strength: 2,
            lapses: 0,
          },
        ],
      ],
    });
    const got = deserialize(blob);
    expect(got.ok).toBe(false);
    if (!got.ok) {
      expect(got.error.kind).toBe('malformed');
      expect(got.error.message).toContain(key);
    }
  });

  it('rebuilds usable state, not just a matching object', () => {
    const loaded = deserialize(serialize(populated()));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const key = unitKey('recognise', AR, 'سوق');
    expect(isKnown(unitState(loaded.value, key))).toBe(true);

    // And it keeps folding: a restored profile is a real profile, not a read-only snapshot.
    const after = record(loaded.value, [
      ev(key, 'unknown', true, 30),
      ev(key, 'unknown', true, 31),
    ]);
    expect(isKnown(unitState(after, key))).toBe(false);
  });
});
