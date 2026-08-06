/**
 * The parts of a unit key.
 *
 * ⚠️ **`modality`, RENAMED FROM `direction` BY ADR-0022.** The rename is deliberate rather than
 * cosmetic: while the field was a `Direction`, a caller could reasonably read `parts.direction` as
 * "she either recognises or produces this", and that is false the moment a `pronounce:` or `skill:`
 * key parses. A field that can hold `'skill'` must not be called a direction.
 *
 * @module
 */

import type { Modality } from './modality.js';
import type { Variety } from './variety.js';

export type UnitParts = {
  readonly modality: Modality;
  readonly variety: Variety;
  readonly word: string;
};
