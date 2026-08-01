/**
 * Still an ARRAY pair, still sorted. The integer-key-hoisting reasoning on `WireEntryV2` is
 * unchanged.
 *
 * @module
 */

import type { WireUnitV3 } from './wireUnitV3.js';

export type WireEntryV3 = readonly [key: string, unit: WireUnitV3];
