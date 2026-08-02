/**
 * One v1 unit, as a `[key, state]` pair. Frozen; the reasoning is on `WireEntryV2`.
 *
 * @module
 */

import type { WireUnitV1 } from './wireUnitV1.js';

export type WireEntryV1 = readonly [key: string, unit: WireUnitV1];
