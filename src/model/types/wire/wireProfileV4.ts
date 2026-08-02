/**
 * A whole profile, as stored by schema v4. Superseded by v5; kept because `MIGRATIONS[4]` traverses it.
 *
 * @module
 */

import type { WireRowV4 } from './wireRowV4.js';

export type WireProfileV4 = {
  readonly v: 4;
  readonly language: string;
  readonly day: number;
  /** Sorted by key, always. See `WireEntryV2` for why the container is an array. */
  readonly units: readonly WireRowV4[];
};
