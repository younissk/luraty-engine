import { isUnitKey, type Day, type UnitKey } from '../model/ids.js';
import type { Profile } from '../model/profile.js';
import { clampStrength, KNOWN_AT_STRENGTH, type Prior, type UnitState } from '../model/unit.js';
import {
  PROFILE_SCHEMA_VERSION,
  WIRE_ROW_V4_LENGTH,
  type Decoded,
  type DecodeError,
  type WireProfile,
  type WireRowV4,
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

/** A prior, flattened for storage. See {@link WireRowV4}. */
function priorToWire(prior: Prior): number | null {
  switch (prior.kind) {
    case 'none':
      return null;
    case 'claimed':
      return prior.on;
    default:
      return assertNever(prior, 'Prior');
  }
}

/**
 * One unit, as the positional row v4 stores.
 *
 * ⚠️ THE ORDER IS THE FORMAT — it is declared on {@link WireRowV4} and this function and
 * {@link parseRow} are the only two places allowed to know it. They must be read side by side.
 */
function toRow(key: UnitKey, state: UnitState): WireRowV4 {
  return [
    key,
    state.seen,
    state.lastSeen,
    state.lastAsked,
    state.lastProven,
    priorToWire(state.prior),
    state.strength,
    state.lapses,
  ];
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
  // ⚠️ SORT THE KEYS, THEN BUILD — not `Object.entries().map().sort()`, which is the obvious shape
  // and three avoidable allocations per unit deep.
  //
  // `Object.entries` materialises one two-element array per unit, `.map` materialises another, and
  // the comparator `([a], [b]) => …` then DESTRUCTURES BOTH on every single comparison — so a
  // 20,000-unit profile paid for ~280,000 array destructures inside the sort alone. Sorting plain
  // strings and filling a pre-sized array does the same work with none of it. Measured on the
  // save path, which is the sharpest number in the whole benchmark.
  const keys = (Object.keys(profile.units) as UnitKey[]).sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  const units: WireRowV4[] = new Array<WireRowV4>(keys.length);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    // `noUncheckedIndexedAccess` types both lookups as possibly-undefined. Neither can miss — the
    // key came from `Object.keys` and the index from its own length — so this is the same known
    // equivalent mutant `plan()` carries, kept for the same reason: a `!` that lies about an index
    // signature is worse in the file than a survivor with a comment.
    if (key === undefined) continue;
    const state = profile.units[key];
    if (state === undefined) continue;
    units[i] = toRow(key, state);
  }

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
 * Parse one stored row into a unit.
 *
 * This is "parse, don't validate": it does not return a boolean and leave the caller holding
 * `unknown` — because then the caller casts, and the check evaporates. It returns the typed value,
 * so there is no way to hold a `UnitState` that was not checked.
 *
 * ⚠️ **EVERY POSITION IS CHECKED, and under v4 that is what stands between a shifted field and a
 * silently wrong learner.** A named object announces its own mistakes — a missing `lastProven` is
 * `undefined` and obvious. A positional row does not: a row one element short reads every field
 * after the gap as its neighbour, and `lastAsked` arriving as `lastProven` is a plausible number
 * that quietly changes what the scheduler believes. So the length is exact, not a minimum, and each
 * slot is validated before it becomes a `UnitState`.
 *
 * The order is declared once on {@link WireRowV4}. Read this beside `toRow`; they are one format
 * written twice and nothing else may know it.
 */
function parseRow(row: readonly unknown[]): UnitState | undefined {
  // EXACT, not `>=`. A longer row is a newer format that reached here without a version bump, and
  // guessing that the extra elements are ignorable is how a forward-compat bug becomes a data bug.
  if (row.length !== WIRE_ROW_V4_LENGTH) return undefined;

  const [, seen, lastSeen, lastAsked, lastProven, prior, strength, lapses] = row;

  // Every counter and every anchor. These arrive from the migrations when they were not in the
  // stored bytes, so by the time this runs they are always present — checked anyway, because this is
  // a trust boundary and "the migration must have run" is exactly the assumption that is false the
  // day one does not.
  if (!isWholeNumber(seen)) return undefined;
  if (!isWholeNumber(lastSeen)) return undefined;
  if (!isWholeNumber(lastAsked)) return undefined;
  if (!isWholeNumber(lastProven)) return undefined;
  if (!isWholeNumber(lapses)) return undefined;

  // ⚠️ REJECT a non-whole rung, CLAMP an over-large one, and the asymmetry is deliberate. Corruption
  // must be named; but a blob written by a build whose `MAX_STRENGTH` was higher has to stay
  // readable, so that lowering the ceiling after a simulation sweep is a code change rather than a
  // wire bump. `clampStrength` is total, and its `Math.trunc` is unreachable here because the
  // whole-number check has already run.
  if (!isWholeNumber(strength)) return undefined;

  // `null` for no claim, a whole day number otherwise. `undefined` is NOT accepted as "no claim":
  // a missing slot means the migration did not run, which is a different fact from "never claimed"
  // and must not be silently rounded into it.
  if (prior !== null && !isWholeNumber(prior)) return undefined;

  return {
    seen,
    lastSeen: lastSeen as Day,
    lastAsked: lastAsked as Day,
    lastProven: lastProven as Day,
    prior: prior === null ? { kind: 'none' } : { kind: 'claimed', on: prior as Day },
    strength: clampStrength(strength),
    lapses,
  };
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
  /**
   * v1 → v2: add `lastProven` to every learning unit.
   *
   * ⚠️ **Migrated to 0 (never proven), NOT to `lastSeen`, and the choice matters.**
   *
   * `lastSeen` is the obvious mapping and it imports exactly the contamination `lastProven` exists
   * to remove: v1's `lastSeen` is refreshed by passive exposure, so a learner who has been reading
   * daily would migrate with every learning unit stamped as recently *proven*. Their weakest,
   * most-encountered words would go to the back of the drill queue — and because the fold is
   * monotonic, the bad value can never be corrected downward. It would be permanent.
   *
   * Zero errs the other way: everything looks maximally overdue, the learner gets one flood of
   * drills, and the aging score resolves it within a rotation of the pool. Over-drilling once is
   * recoverable; under-drilling forever is not.
   *
   * Defensive throughout because the input is data written by code that no longer exists. Anything
   * unrecognisable is passed through untouched, so `parseRow` produces the `malformed` error with
   * a unit key in it rather than this function throwing an unnamed exception at app launch.
   */
  1: (input: unknown): unknown => {
    if (!isRecord(input) || !Array.isArray(input.units)) return input;
    // `Array.isArray` narrows to `any[]`, which would let anything through untyped from here on.
    // Widening to `unknown[]` puts the checks back where they belong: on each entry.
    const entries: unknown[] = input.units;
    return {
      ...input,
      v: 2,
      units: entries.map((entry: unknown): unknown => {
        if (!Array.isArray(entry) || entry.length !== 2) return entry;
        const [key, state] = entry as [unknown, unknown];
        if (!isRecord(state) || state.box !== 'learning') return entry;
        return [key, { ...state, lastProven: 0 }];
      }),
    };
  },

  /**
   * v2 → v3: drop the box, flatten to a rung ladder, and split one anchor into three.
   *
   * ⚠️ **THE KEYS ARE NOT TOUCHED.** Every stored `recognise:…` / `produce:…` key decodes unchanged,
   * which is why a v1 blob can still run this step after `MIGRATIONS[1]` and why neither golden
   * needed rekeying. That is the direct dividend of declining to move modality into the unit key.
   *
   * Every invented value below is chosen by ONE test, applied three times: **which direction of
   * error is recoverable?** It is the same test the v1→v2 step used to reject `lastProven = lastSeen`
   * — over-drilling once is recoverable, under-drilling forever is not — and all three answers point
   * the same way.
   *
   * **learning → flat**
   *
   * - `streak` → `strength: min(streak, KNOWN_AT_STRENGTH - 1)`. Information-preserving rather than a
   *   guess: v2's `streak` is only ever 0 or 1, because 2 promoted. The `min` is defensive — a
   *   hand-edited `streak: 9` must not mint a verified-known unit out of a learning one.
   * - `lastProven` verbatim. It is the one uncontaminated day field v2 has.
   * - **`lastAsked = lastProven`**, and this is the one real decision. `lastAsked` is a monotone
   *   max-fold, so the v1→v2 contamination test applies unchanged. `lastSeen` FAILS it exactly as it
   *   did before: passive exposure moves it, so a learner who had been reading daily would migrate
   *   with every weak word stamped as recently *asked*, gated behind the review gap, and under-
   *   drilled forever with no way to correct it downward. `0` passes but is merely wasteful.
   *   `lastProven` passes and strictly dominates `0`: it is uncontaminated by construction, and
   *   because every proof was also an ask it is always `<=` the true `lastAsked` — so importing it
   *   can only make a unit look staler than it is, never fresher.
   *
   * **understood → flat**
   *
   * - `confirmedOn` → BOTH `lastProven` and `lastAsked`, with no guessing. The v2 `understood`
   *   variant could only be entered or refreshed by a real retrieval, so `confirmedOn` is
   *   uncontaminated in both senses at once. This is the single place the two anchors provably
   *   coincide, and merging v2's two names for one fact is the point of the change.
   * - `strength: KNOWN_AT_STRENGTH` and **not** `MAX_STRENGTH`. v2 stored no repetition count, so
   *   the value must be invented and the two candidates fail differently. The ceiling would claim
   *   maximal robustness for a word proven exactly twice — it would then survive three consecutive
   *   failures before stopping counting as known, inflating coverage on a fabricated basis, which is
   *   under-drilling on invented evidence and the worst combination available. The known rung is the
   *   MINIMUM value preserving v2's own verdict, so **no learner's coverage number moves on
   *   migration**, while leaving the unit maximally fragile: one failed drill takes it to zero.
   *
   * **Both**
   *
   * - `prior: null`. Nothing in v2 is a claim — every unit in it was minted by real evidence — so
   *   inventing claims here would fabricate exactly the thing {@link Prior} exists to keep honest.
   * - `lapses: 0`. Not derivable: v2's `streak: 0` covers "failed five times running" and "never
   *   asked" alike. `lapses` is report-only, so a wrong value can mislabel but never misschedule,
   *   and zero errs toward not flagging a stuck word that never was.
   *
   * Defensive throughout, like `MIGRATIONS[1]`: anything unrecognisable is passed through untouched
   * so `parseRow` produces a `malformed` error naming the offending key, rather than this function
   * throwing an unnamed exception at app launch.
   */
  2: (input: unknown): unknown => {
    if (!isRecord(input) || !Array.isArray(input.units)) return input;
    const entries: unknown[] = input.units;
    return {
      ...input,
      v: 3,
      units: entries.map((entry: unknown): unknown => {
        if (!Array.isArray(entry) || entry.length !== 2) return entry;
        const [key, state] = entry as [unknown, unknown];
        if (!isRecord(state)) return entry;

        const common = { prior: null, lapses: 0, seen: state.seen, lastSeen: state.lastSeen };

        if (state.box === 'learning') {
          if (!isWholeNumber(state.streak) || !isWholeNumber(state.lastProven)) return entry;
          return [
            key,
            {
              ...common,
              lastAsked: state.lastProven,
              lastProven: state.lastProven,
              strength: Math.min(state.streak, KNOWN_AT_STRENGTH - 1),
            },
          ];
        }
        if (state.box === 'understood') {
          if (!isWholeNumber(state.confirmedOn)) return entry;
          return [
            key,
            {
              ...common,
              lastAsked: state.confirmedOn,
              lastProven: state.confirmedOn,
              strength: KNOWN_AT_STRENGTH,
            },
          ];
        }
        return entry;
      }),
    };
  },

  /**
   * v3 → v4: the same seven values, as a flat positional row instead of a named object.
   *
   * ⚠️ **NOTHING IS INTERPRETED HERE.** Unlike its two predecessors this migration takes no
   * decision — no field is invented, dropped, defaulted or re-derived. It is a pure re-encoding, so
   * a v3 learner and a v4 learner with the same history produce byte-identical output after it runs.
   * That is worth stating because it is what makes this the CHEAP kind of wire change: the two
   * earlier steps each had a recoverability argument to make, and this one has none to make.
   *
   * Why re-encode at all: the seven field names were 73 bytes of pure repetition per unit, and
   * measured on a 20,000-unit profile they were 60% of the file — 2.44 MB of which 0.98 MB was
   * values. That file is written on every save and parsed before the first frame at launch. See
   * {@link WireRowV4}.
   *
   * Defensive throughout, like both steps above: anything unrecognisable is passed through untouched
   * so `parseRow` produces a `malformed` error naming the offending key, rather than this function
   * throwing an unnamed exception on the app's launch path.
   */
  3: (input: unknown): unknown => {
    if (!isRecord(input) || !Array.isArray(input.units)) return input;
    const entries: unknown[] = input.units;
    return {
      ...input,
      v: 4,
      units: entries.map((entry: unknown): unknown => {
        if (!Array.isArray(entry) || entry.length !== 2) return entry;
        const [key, state] = entry as [unknown, unknown];
        if (!isRecord(state)) return entry;
        // Read positionally in exactly the order `WireRowV4` declares. Values are copied verbatim,
        // INCLUDING ones that are absent or the wrong type — `parseRow` is the checker, and a
        // migration that silently repaired a bad value would hide the corruption it should name.
        return [
          key,
          state.seen,
          state.lastSeen,
          state.lastAsked,
          state.lastProven,
          state.prior,
          state.strength,
          state.lapses,
        ];
      }),
    };
  },
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

  const units: Record<UnitKey, UnitState> = {};
  for (const entry of wire.units) {
    if (!Array.isArray(entry)) {
      return fail('malformed', 'a unit entry is not a row');
    }
    // ⚠️ THE KEY IS READ AND CHECKED BEFORE THE ROW LENGTH IS, deliberately. A row of the wrong
    // length is exactly what a mis-migrated or hand-edited profile produces, and the whole value of
    // the error is that it NAMES the unit — so the name has to be recovered before the shape is
    // rejected. Position 0 is the key in every version this format has had.
    const row: readonly unknown[] = entry;
    const key = row[0];
    if (typeof key !== 'string' || key.length === 0) {
      return fail('malformed', 'a unit entry has no key');
    }
    // ⚠️ THE KEY IS PARSED, not merely checked for being a non-empty string.
    //
    // `Profile.units` is typed `Record<UnitKey, …>`, and `UnitKey` is branded precisely so that
    // only `unitKey()` can mint one. Accepting any string here minted them by fiat: a blob holding
    // `"garbage"` decoded clean, and `plan()` then handed that string straight back to the host in
    // `session.items[].unit` and `content.units`. The host cannot `parseUnitKey` it, so it can
    // build no exercise for it — and because the unit stays in the profile forever, the session is
    // one item shorter every day from then on. Nothing errors; the learner just gets less.
    //
    // This is the one place the engine cannot assume its own invariants held (see
    // {@link parseUnitKey}), which is exactly why the check belongs here rather than in the host.
    //
    // A GUARD and not a cast: `isUnitKey` narrows, so `unitKey()` stays the only `as UnitKey` in
    // the package. A cast here would be a promise where the file's whole job is a check.
    if (!isUnitKey(key)) {
      // Safe to include: a key is a direction, a variety and a word the HOST chose. It is not
      // learner-authored content.
      return fail('malformed', `unit key "${key}" is not a valid unit key`);
    }
    // A duplicate would silently last-one-win, and the survivor would depend on write order — in a
    // decoder whose every other malformation is named out loud. `serialize` cannot emit one (its
    // input is a Record), so a blob carrying two is hand-edited or corrupt either way.
    //
    // Indexed rather than `in`: `'constructor' in {}` is TRUE through the prototype chain, and this
    // package has already been bitten once by exactly that (see `createPack`'s lemma Map).
    if (units[key] !== undefined) {
      return fail('malformed', `unit "${key}" appears more than once`);
    }
    const state = parseRow(row);
    if (state === undefined) {
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
