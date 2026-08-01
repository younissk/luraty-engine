/**
 * Read a rung arriving from storage. Total; returns `undefined` for anything that is not a rung.
 *
 * The parse door's narrow form: `deserialize` must reject a corrupt value rather than coerce it,
 * because a coerced rung is a silent change to what the learner is told they know.
 *
 * @module
 */

import { LADDER } from './ladder.js';
import type { Strength } from './types/strength.js';

export function strengthOf(n: number): Strength | undefined {
  return LADDER.find((rung) => rung === n);
}
