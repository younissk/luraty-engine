/**
 * Why decoding returns a value instead of throwing.
 *
 * This function runs at app launch on data written by an older version of the code. If it throws,
 * a learner opens the app and it dies — and the one thing they cannot do about it is downgrade.
 * A returned error can be handled: start fresh, restore a backup, report it, keep the bad blob for
 * diagnosis. An exception thrown from a module-level load can do none of those.
 *
 * @module
 */

import type { DecodeError } from './decodeError.js';

export type Decoded<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: DecodeError };
