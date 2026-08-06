/**
 * The checked shape of a unit key, before branding.
 *
 * ⚠️ Internal to `unitKey()`. Assigning to this is where the template literal actually checks
 * anything — see the two-step construction there.
 *
 * ⚠️ **`Modality`, NOT `Direction` (ADR-0022).** While this said `Direction`, `skillKey` could not
 * use `unitKey()` at all and hand-cast instead — which is how a key that `parseUnitKey` rejected
 * came to be minted by the engine itself.
 *
 * @module
 */

import type { Modality } from './modality.js';

export type UnitKeyShape = `${Modality}:${string}`;
