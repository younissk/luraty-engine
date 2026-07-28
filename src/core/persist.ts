import type { Day } from '../model/ids.js';
import type { Profile } from '../model/profile.js';
import type { UnitState } from '../model/unit.js';
import {
  PROFILE_SCHEMA_VERSION,
  type Decoded,
  type DecodeError,
  type WireEntryV1,
  type WireProfile,
  type WireUnitV1,
} from '../model/wire.js';
import { assertNever } from '../internal/assert.js';

/**
 * Turning a profile into bytes and back.
 *
 * Two rules govern this file, and both exist because the other side of it is a learner's phone:
 *
 * 1. **Serialization is canonical.** Logically identical state produces byte-identical output.
 * 2. **Decoding never throws.** It returns a {@link Decoded} either way.
 *
 * @module
 */

// ── Encoding ────────────────────────────────────────────────────────────────────────────────────

function toWire(state: UnitState): WireUnitV1 {
  switch (state.box) {
    case 'learning':
      return {
        box: 'learning',
        seen: state.seen,
        lastSeen: state.lastSeen,
        streak: state.streak,
      };
    case 'understood':
      return {
        box: 'understood',
        seen: state.seen,
        lastSeen: state.lastSeen,
        confirmedOn: state.confirmedOn,
      };
    default:
      return assertNever(state, 'UnitState');
  }
}

/**
 * Serialize a profile to a canonical string.
 *
 * **Canonical means the same state always produces the same bytes**, which is what makes a
 * serialized profile safe to hash, diff, and pin in a golden test. Without the sort, a profile
 * built by replaying evidence and the same profile loaded from storage would differ purely by the
 * order keys happened to be inserted — identical state, different bytes, and every replay test
 * failing at random for reasons nobody can reproduce.
 *
 * The comparison is on UTF-16 code units, not a locale-aware collation. That is deliberate twice
 * over: `localeCompare` is ICU-backed and therefore unavailable on Hermes, and a *locale-dependent*
 * sort would make the canonical form depend on the device's language settings, which is exactly the
 * bug this is meant to prevent.
 */
export function serialize(profile: Profile): string {
  const units: WireEntryV1[] = Object.entries(profile.units)
    .map(([key, state]): WireEntryV1 => [key, toWire(state)])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  const wire: WireProfile = {
    v: PROFILE_SCHEMA_VERSION,
    language: profile.language,
    day: profile.day,
    units,
  };

  return JSON.stringify(wire);
}

// ── Decoding ────────────────────────────────────────────────────────────────────────────────────

function fail(kind: DecodeError['kind'], message: string): Decoded<never> {
  return { ok: false, error: { kind, message } };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isWholeNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

/**
 * Parse one stored unit.
 *
 * This is "parse, don't validate": it does not return a boolean and leave the caller holding
 * `unknown` — because then the caller casts, and the check evaporates. It returns the typed value,
 * so there is no way to hold a `UnitState` that was not checked.
 */
function parseUnit(v: unknown): UnitState | undefined {
  if (!isRecord(v)) return undefined;
  if (!isWholeNumber(v.seen) || !isWholeNumber(v.lastSeen)) return undefined;

  const seen = v.seen;
  const lastSeen = v.lastSeen as Day;

  if (v.box === 'learning') {
    if (!isWholeNumber(v.streak)) return undefined;
    return { box: 'learning', seen, lastSeen, streak: v.streak };
  }
  if (v.box === 'understood') {
    if (!isWholeNumber(v.confirmedOn)) return undefined;
    return { box: 'understood', seen, lastSeen, confirmedOn: v.confirmedOn as Day };
  }
  return undefined;
}

/**
 * Migrations, keyed by the version they upgrade FROM.
 *
 * Each is `unknown -> unknown`: a migration operates on data written by code that no longer exists,
 * so it cannot be typed against today's shapes without lying. Typing them as the OLD wire type is
 * worse — it forces you to keep every historical type alive forever.
 *
 * ⚠️ When the first real migration lands, it brings its own test with it. A migration that has
 * never run on realistic old data is not a migration, it is a hope.
 */
const MIGRATIONS: Readonly<Record<number, (input: unknown) => unknown>> = {
  // 1: (v1) => ({ ...toV2(v1) }),
};

/**
 * Walk the chain from a stored version up to the current one.
 *
 * Stepwise rather than one big jump: a v1 blob upgrades to v2 then v3, reusing the same steps a v2
 * blob takes. Writing a direct v1→v3 migration instead means N² migrations and a combinatorial test
 * matrix nobody maintains.
 */
function migrate(from: number, data: unknown): Decoded<unknown> {
  let current = data;
  for (let v = from; v < PROFILE_SCHEMA_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (step === undefined) {
      return fail(
        'no-migration',
        `stored profile is version ${String(v)} and no migration exists to version ${String(v + 1)}`,
      );
    }
    current = step(current);
  }
  return { ok: true, value: current };
}

/**
 * Read a profile back from a string. Never throws.
 *
 * Every failure path returns a named error rather than an exception, because this runs at app
 * launch against data written by an older build: a throw here is a learner whose app will not open
 * and who cannot downgrade to fix it.
 */
export function deserialize(text: string): Decoded<Profile> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail('not-json', 'stored profile is not valid JSON');
  }

  if (!isRecord(raw)) return fail('malformed', 'stored profile is not an object');

  const version = raw.v;
  if (!isWholeNumber(version)) return fail('malformed', 'stored profile has no version');

  if (version > PROFILE_SCHEMA_VERSION) {
    // Written by a newer engine. Migrating forward is impossible and guessing is worse — this is
    // the "app was downgraded, or storage was restored from a newer device" case, and the host
    // should be told rather than handed a silently truncated profile.
    return fail(
      'from-the-future',
      `stored profile is version ${String(version)}, but this engine understands at most ${String(PROFILE_SCHEMA_VERSION)}`,
    );
  }

  const migrated = migrate(version, raw);
  if (!migrated.ok) return migrated;

  const wire = migrated.value;
  if (!isRecord(wire)) return fail('malformed', 'migrated profile is not an object');

  if (typeof wire.language !== 'string' || wire.language.length === 0) {
    return fail('malformed', 'profile has no language');
  }
  if (!isWholeNumber(wire.day)) return fail('malformed', 'profile has no valid day');
  if (!Array.isArray(wire.units)) return fail('malformed', 'profile units are not a list');

  const units: Record<string, UnitState> = {};
  for (const entry of wire.units) {
    if (!Array.isArray(entry) || entry.length !== 2) {
      return fail('malformed', 'a unit entry is not a [key, state] pair');
    }
    const [key, value] = entry as [unknown, unknown];
    if (typeof key !== 'string' || key.length === 0) {
      return fail('malformed', 'a unit entry has no key');
    }
    const state = parseUnit(value);
    if (state === undefined) {
      // The key is safe to include — it is a direction, a variety and a word, all of which the
      // host chose. It is not learner-authored content.
      return fail('malformed', `unit "${key}" has an unreadable state`);
    }
    units[key] = state;
  }

  return {
    ok: true,
    value: {
      language: wire.language,
      day: wire.day as Day,
      units: units,
    },
  };
}
