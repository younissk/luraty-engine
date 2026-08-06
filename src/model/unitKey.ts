/**
 * Build a `UnitKey`.
 *
 * ⚠️ Two steps, not one. The assignment to `UnitKeyShape` is where the template literal actually
 * checks anything; `as` on its own is a promise rather than a check, so a one-step
 * `` return `${d}:${v}` as UnitKey `` would compile clean with a whole segment missing. This is the
 * single blessed constructor — it should be the only `as UnitKey` in the package.
 *
 * ⚠️ **AND SINCE ADR-0022 IT ACTUALLY IS.** `skillKey` used to hand-cast because its first segment
 * was not a `Direction`; taking a `Modality` here is what let that cast be deleted, and with it the
 * second arm `isUnitKey` needed to stop `persist` rejecting a key the engine had minted.
 *
 * @module
 */

import type { Modality } from './types/modality.js';
import type { UnitKey } from './types/unitKey.js';
import type { UnitKeyShape } from './types/unitKeyShape.js';
import type { Variety } from './types/variety.js';

export function unitKey(modality: Modality, v: Variety, word: string): UnitKey {
  const shape: UnitKeyShape = `${modality}:${v}:${word}`;
  return shape as UnitKey;
}
