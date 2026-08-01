/**
 * A whole profile, as stored by schema v2. Frozen.
 *
 * @module
 */

import type { WireEntryV2 } from './wireEntryV2.js';

export type WireProfileV2 = {
  readonly v: 2;
  readonly language: string;
  readonly day: number;
  /** Sorted by key, always. See `WireEntryV2`. */
  readonly units: readonly WireEntryV2[];
};
