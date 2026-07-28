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
export const PROFILE_SCHEMA_VERSION = 1;

/** A unit's state, as stored. */
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
export type WireEntryV1 = readonly [key: string, unit: WireUnitV1];

export type WireProfileV1 = {
  readonly v: 1;
  readonly language: string;
  readonly day: number;
  /** Sorted by key, always. See {@link WireEntryV1}. */
  readonly units: readonly WireEntryV1[];
};

/** The current wire shape. Rename this alias when a v2 arrives; leave `WireProfileV1` untouched. */
export type WireProfile = WireProfileV1;

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
