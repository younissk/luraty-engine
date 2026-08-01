/**
 * What went wrong, in a form that is safe to log.
 *
 * @module
 */

import type { DecodeErrorKind } from './decodeErrorKind.js';

export type DecodeError = {
  readonly kind: DecodeErrorKind;
  /** Human-readable, safe to log. Contains no learner content. */
  readonly message: string;
};
