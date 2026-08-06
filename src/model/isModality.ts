/**
 * Is this string one of the modalities?
 *
 * ⚠️ Not a utility: `(s: string) => boolean` passes the signature clause, but the body knows the
 * engine's own vocabulary. See `utils/index.ts` for the test.
 *
 * ⚠️ **THE ONLY GATE ON WHAT MAY BE ADDRESSED.** `parseUnitKey` calls it, `isUnitKey` narrows
 * through it, and `persist` fails a whole profile on a key it rejects — so a modality that is not in
 * {@link MODALITIES} cannot enter a profile at all. That is the point: a free-form segment would let
 * a host typo a channel into existence and silently create units nothing will ever schedule.
 *
 * @module
 */

import { MODALITIES } from './modalities.js';
import type { Modality } from './types/modality.js';

export function isModality(s: string): s is Modality {
  // ⚠️ `includes` on the readonly tuple rather than a hand-written chain of `===`. The chain is what
  // rots: it compiles fine when a seventh modality is added to `MODALITIES` and silently rejects it
  // at runtime, which reads as "that profile is corrupt".
  return (MODALITIES as readonly string[]).includes(s);
}
