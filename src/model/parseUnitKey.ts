/**
 * Take a unit key apart. Returns `undefined` for anything malformed — this runs against persisted
 * data, which is the one place the engine cannot assume its own invariants held.
 *
 * ⚠️ **IT NOW PARSES EVERY MODALITY, INCLUDING `skill:` (ADR-0022), AND THAT CHANGED WHO IS
 * COUNTED.** Before, a skill key failed here, so `inScope` dropped it from EVERY summary scope
 * including `'all'` — a learner's grammar was invisible to `Summary.known`. It is now counted, and
 * the per-skill scope keys on `modality` so the partition law still holds exactly.
 *
 * @module
 */

import { isModality } from './isModality.js';
import type { UnitParts } from './types/unitParts.js';
import type { Variety } from './types/variety.js';

export function parseUnitKey(key: string): UnitParts | undefined {
  const firstColon = key.indexOf(':');
  if (firstColon < 0) return undefined;
  const secondColon = key.indexOf(':', firstColon + 1);
  if (secondColon < 0) return undefined;

  const modality = key.slice(0, firstColon);
  const varietyPart = key.slice(firstColon + 1, secondColon);
  // Everything after the second colon, so a word may contain colons freely.
  const word = key.slice(secondColon + 1);

  if (!isModality(modality)) return undefined;
  if (varietyPart.length === 0 || word.length === 0) return undefined;

  return { modality, variety: varietyPart as Variety, word };
}
