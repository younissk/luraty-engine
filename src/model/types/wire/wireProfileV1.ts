/**
 * A whole profile, as stored by schema v1. Frozen.
 *
 * @module
 */

import type { WireEntryV1 } from './wireEntryV1.js';

export type WireProfileV1 = {
  readonly v: 1;
  readonly language: string;
  readonly day: number;
  /** Sorted by key, always. See `WireEntryV1`. */
  readonly units: readonly WireEntryV1[];
};
