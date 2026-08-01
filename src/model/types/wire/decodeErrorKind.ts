/**
 * Why a stored profile could not be read.
 *
 * @module
 */
export type DecodeErrorKind =
  /** Not JSON at all — truncated write, wrong key, corrupted storage. */
  | 'not-json'
  /** Parsed, but not the shape of a profile. */
  | 'malformed'
  /** Written by a NEWER version of the engine than this one. Not recoverable by migrating. */
  | 'from-the-future'
  /** An old version with no migration path to the current one. */
  | 'no-migration';
