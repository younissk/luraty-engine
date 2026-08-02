/**
 * A whole profile, as stored by schema v5 — the current one.
 *
 * @module
 */

import type { WireRowV5 } from './wireRowV5.js';

export type WireProfileV5 = {
  readonly v: 5;
  readonly language: string;
  readonly day: number;
  /** Sorted by key, always. See `WireEntryV2` for why the container is an array. */
  readonly units: readonly WireRowV5[];
};
