/**
 * The parts of a unit key.
 *
 * @module
 */

import type { Direction } from './direction.js';
import type { Variety } from './variety.js';

export type UnitParts = {
  readonly direction: Direction;
  readonly variety: Variety;
  readonly word: string;
};
