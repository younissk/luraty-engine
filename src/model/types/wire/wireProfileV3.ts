/**
 * A whole profile, as stored by schema v3. Frozen.
 *
 * @module
 */

import type { WireEntryV3 } from './wireEntryV3.js';

export type WireProfileV3 = {
  readonly v: 3;
  readonly language: string;
  readonly day: number;
  /** Sorted by key, always. See `WireEntryV2`. */
  readonly units: readonly WireEntryV3[];
};
