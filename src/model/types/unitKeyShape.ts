/**
 * The checked shape of a unit key, before branding.
 *
 * ⚠️ Internal to `unitKey()`. Assigning to this is where the template literal actually checks
 * anything — see the two-step construction there.
 *
 * @module
 */

import type { Direction } from './direction.js';

export type UnitKeyShape = `${Direction}:${string}`;
