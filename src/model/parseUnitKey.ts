/**
 * Take a unit key apart. Returns `undefined` for anything malformed — this runs against persisted
 * data, which is the one place the engine cannot assume its own invariants held.
 *
 * @module
 */

import { isDirection } from './isDirection.js';
import type { UnitParts } from './types/unitParts.js';
import type { Variety } from './types/variety.js';

export function parseUnitKey(key: string): UnitParts | undefined {
  const firstColon = key.indexOf(':');
  if (firstColon < 0) return undefined;
  const secondColon = key.indexOf(':', firstColon + 1);
  if (secondColon < 0) return undefined;

  const direction = key.slice(0, firstColon);
  const varietyPart = key.slice(firstColon + 1, secondColon);
  // Everything after the second colon, so a word may contain colons freely.
  const word = key.slice(secondColon + 1);

  if (!isDirection(direction)) return undefined;
  if (varietyPart.length === 0 || word.length === 0) return undefined;

  return { direction, variety: varietyPart as Variety, word };
}
