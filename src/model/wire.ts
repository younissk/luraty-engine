/**
 * The persisted shape — deliberately NOT the domain shape.
 *
 * These two types describe the same idea and have opposite change policies. {@link Profile} is
 * ours: rename a field, restructure it, whatever the code wants, in one commit. The wire format has
 * a copy sitting in storage on somebody's phone that can never be recompiled, so every change to it
 * is a migration or a bug.
 *
 * Keeping them separate costs a mapping function. Sharing one type means the day you want to rename
 * a domain field you are choosing between a worse name and a migration, and the wrong one gets
 * chosen under time pressure.
 *
 * @module
 */

/**
 * Bump when the wire shape changes, and add the matching migration in the same commit.
 *
 * Not the same as the package version — the API can change many times without the stored bytes
 * changing at all, and vice versa.
 */
export const PROFILE_SCHEMA_VERSION = 4;

/**
 * A unit's state, as stored by schema v1. **Frozen.**
 *
 * Nothing in `src/` reads this type, and that is correct rather than dead code: a migration is
 * `unknown -> unknown` on purpose (see `MIGRATIONS` in `core/persist.ts`), because it operates on
 * data written by code that no longer exists and typing it against today's shapes would be a lie.
 * These declarations are the RECORD of what v1 looked like — the thing you need in front of you to
 * read the v1→v2 migration and judge whether it is right. Deleting them because the compiler cannot
 * see a reference deletes the only description of the bytes still being migrated.
 */
export type WireUnitV1 =
  | {
      readonly box: 'learning';
      readonly seen: number;
      readonly lastSeen: number;
      readonly streak: number;
    }
  | {
      readonly box: 'understood';
      readonly seen: number;
      readonly lastSeen: number;
      readonly confirmedOn: number;
    };

/**
 * A unit's state, as stored by schema v2. **Frozen**, for the same reason {@link WireUnitV1} is:
 * nothing in `src/` reads it, and it is the only description of the bytes `MIGRATIONS[2]` operates
 * on. Deleting it because the compiler sees no reference deletes the map to the territory.
 *
 * The only change from v1 was `lastProven` on the learning variant — the day a unit was last
 * successfully retrieved, which the scheduler needed and `lastSeen` could not supply because passive
 * exposure refreshes it.
 */
export type WireUnitV2 =
  | {
      readonly box: 'learning';
      readonly seen: number;
      readonly lastSeen: number;
      readonly streak: number;
      readonly lastProven: number;
    }
  | {
      readonly box: 'understood';
      readonly seen: number;
      readonly lastSeen: number;
      readonly confirmedOn: number;
    };

/** One v1 unit, as a `[key, state]` pair. Frozen; the reasoning is on {@link WireEntryV2}. */
export type WireEntryV1 = readonly [key: string, unit: WireUnitV1];

/**
 * One unit, as a `[key, state]` pair.
 *
 * ⚠️ AN ARRAY, NOT AN OBJECT, AND THIS IS LOAD-BEARING.
 *
 * Serialization must be byte-identical for logically identical state, or every replay and golden
 * test becomes randomly flaky — a fresh profile and a saved-then-reloaded one would differ for no
 * reason anyone can see. That means canonical key ordering.
 *
 * An object cannot promise that. JavaScript preserves insertion order for string keys but hoists
 * *integer-like* keys ("0", "42") to the front in numeric order, whatever order you inserted them.
 * Today no unit key can look like an integer, because every key contains colons. That is a property
 * of the current key format, not of JSON, and relying on it means a future key format change
 * silently reintroduces the flakiness.
 *
 * A sorted array of pairs has no such quirk. The ordering is in the data rather than in an engine
 * behaviour we are hoping stays true.
 */
export type WireEntryV2 = readonly [key: string, unit: WireUnitV2];

export type WireProfileV1 = {
  readonly v: 1;
  readonly language: string;
  readonly day: number;
  /** Sorted by key, always. See {@link WireEntryV1}. */
  readonly units: readonly WireEntryV1[];
};

export type WireProfileV2 = {
  readonly v: 2;
  readonly language: string;
  readonly day: number;
  /** Sorted by key, always. See {@link WireEntryV2}. */
  readonly units: readonly WireEntryV2[];
};

/**
 * A unit's state, as stored by schema v3. **FLAT** — the box is gone, derived from `strength`.
 *
 * ⚠️ **The KEY format is untouched**, and that is the cash value of declining to put modality in the
 * unit key. `parseUnitKey` and `isDirection` are unchanged, so every stored `recognise:…` and
 * `produce:…` key still decodes and the v1 and v2 goldens need no rekeying. A migration that had to
 * rewrite keys would be rewriting somebody's past, which `ids.ts` names as the one shape that is
 * genuinely hard to change later.
 *
 * `prior` is `number | null` rather than a nested object — `null` for no claim, a whole day number
 * for a claim made on that day. Compact, and it parses back to {@link Prior} with no ambiguity;
 * anything else is `malformed`.
 *
 * Measured cost: a v2 learning unit is 63 bytes and its v3 form is 88, so an 800-unit profile goes
 * from roughly 66KB to 92KB. That is the price of three anchors plus a ledger, and it is paid on the
 * app-launch parse path — worth re-measuring if launch time regresses.
 */
export type WireUnitV3 = {
  readonly seen: number;
  readonly lastSeen: number;
  readonly lastAsked: number;
  readonly lastProven: number;
  /** `null` for no claim; the day it was made otherwise. See {@link Prior}. */
  readonly prior: number | null;
  readonly strength: number;
  readonly lapses: number;
};

/** Still an ARRAY pair, still sorted. The integer-key-hoisting reasoning on {@link WireEntryV2} is unchanged. */
export type WireEntryV3 = readonly [key: string, unit: WireUnitV3];

export type WireProfileV3 = {
  readonly v: 3;
  readonly language: string;
  readonly day: number;
  /** Sorted by key, always. See {@link WireEntryV2}. */
  readonly units: readonly WireEntryV3[];
};

/**
 * One unit, as a FLAT POSITIONAL ROW. **This is the only change v4 makes.**
 *
 * ⚠️ **THE FIELD ORDER BELOW IS THE FORMAT.** It is declared once, here, and
 * `serialize`/`parseRow` are the only two places that may know it. A row read at the wrong offset
 * does not fail — it silently swaps a learner's `lastProven` for their `lastAsked` — so this
 * declaration and the frozen golden in `wire-v1.golden.test.ts` are jointly the specification.
 * Never insert a field in the middle; append, and bump the version.
 *
 * ### Why the field names went away
 *
 * v3 stored each unit as `[key, {seen, lastSeen, lastAsked, lastProven, prior, strength, lapses}]`.
 * Those seven names are **73 bytes of pure repetition per unit** — the same seven strings, once for
 * every word a learner has ever met. Measured on a 20,000-unit profile: 2,438,933 bytes total, of
 * which the values are 978,933. The names were 60% of the file.
 *
 * That file is written on every save and parsed before the first frame at launch, on a phone, and
 * both `JSON.stringify` and `JSON.parse` cost scales with its size. **2.44 MB → 0.98 MB.**
 *
 * ### What it costs, honestly
 *
 * A named object is readable in a debugger and survives a field being reordered; a row is neither.
 * Three things answer that, and they are the reason this was judged worth doing rather than merely
 * possible:
 *
 * - `parseRow` validates **every position** as a whole number before it becomes a `UnitState`, so a
 *   shifted field is a `malformed` error naming the unit rather than a silently wrong learner.
 * - The golden test pins the exact bytes, so a reordering is a diff a human has to approve.
 * - It was taken **pre-live, at zero installs**, which is the only window in which the migration is
 *   free. `MIGRATIONS[3]` exists anyway, because the archived goldens still traverse it.
 */
export type WireRowV4 = readonly [
  key: string,
  seen: number,
  lastSeen: number,
  lastAsked: number,
  lastProven: number,
  /** `null` for no claim; the day it was made otherwise. See {@link Prior}. */
  prior: number | null,
  strength: number,
  lapses: number,
];

/** How many elements a {@link WireRowV4} has. Read by `serialize` and `parseRow`, nowhere else. */
export const WIRE_ROW_V4_LENGTH = 8;

export type WireProfileV4 = {
  readonly v: 4;
  readonly language: string;
  readonly day: number;
  /** Sorted by key, always. See {@link WireEntryV2} for why the container is an array. */
  readonly units: readonly WireRowV4[];
};

/** The current wire shape. Point this at the newest version; leave the older ones untouched. */
export type WireProfile = WireProfileV4;

/**
 * Why decoding returns a value instead of throwing.
 *
 * This function runs at app launch on data written by an older version of the code. If it throws,
 * a learner opens the app and it dies — and the one thing they cannot do about it is downgrade.
 * A returned error can be handled: start fresh, restore a backup, report it, keep the bad blob for
 * diagnosis. An exception thrown from a module-level load can do none of those.
 */
export type Decoded<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: DecodeError };

export type DecodeErrorKind =
  /** Not JSON at all — truncated write, wrong key, corrupted storage. */
  | 'not-json'
  /** Parsed, but not the shape of a profile. */
  | 'malformed'
  /** Written by a NEWER version of the engine than this one. Not recoverable by migrating. */
  | 'from-the-future'
  /** An old version with no migration path to the current one. */
  | 'no-migration';

export type DecodeError = {
  readonly kind: DecodeErrorKind;
  /** Human-readable, safe to log. Contains no learner content. */
  readonly message: string;
};
