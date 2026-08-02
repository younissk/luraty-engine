/**
 * Build a `Variety`. Returns `undefined` rather than throwing — the caller supplies this, so it is
 * untrusted input.
 *
 * Rejects colons because the unit key uses them as separators, and rejects empty strings because a
 * nameless variety makes every key ambiguous. See `types/varietyOf.ts` for why a literal needs no
 * `!`.
 *
 * @module
 */

import type { Variety } from './types/variety.js';
import type { VarietyOf } from './types/varietyOf.js';

export function variety<S extends string>(id: S): VarietyOf<S>;
export function variety(id: string): Variety | undefined {
  if (id.length === 0 || id.includes(':')) return undefined;
  return id as Variety;
}
