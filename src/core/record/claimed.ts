/**
 * Fold one claim into a unit's prior.
 *
 * A max-fold like every date here, so re-claiming a word is safe and the result does not depend on
 * which claim `record` happened to meet first. A claim never clears an existing one and never
 * touches anything else on the unit.
 *
 * @module
 */

import type { Day, Prior } from '../../model/index.js';
import { assertNever } from '../../utils/index.js';
import { later } from './later.js';

export function claimed(prior: Prior, day: Day): Prior {
  switch (prior.kind) {
    case 'none':
      return { kind: 'claimed', on: day };
    case 'claimed':
      return { kind: 'claimed', on: later(prior.on, day) };
    default:
      return assertNever(prior, 'Prior');
  }
}
