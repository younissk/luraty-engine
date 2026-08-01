/**
 * A real retrieval: she was asked, and she answered.
 *
 * The only variant that can raise `UnitState.strength`, and the only one that moves
 * `UnitState.lastAsked`. Everything the engine trusts, it trusts because of one of these.
 *
 * @module
 */

import type { Day } from './day.js';
import type { Outcome } from './outcome.js';
import type { UnitKey } from './unitKey.js';

export type Retrieval = {
  readonly kind: 'retrieval';
  readonly unit: UnitKey;
  readonly outcome: Outcome;
  readonly day: Day;
};
