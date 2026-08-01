/**
 * Tapped the gloss, or revealed the answer.
 *
 * The amendment every critique lens reached independently: *"only a real retrieval counts"* justifies
 * refusing to PROMOTE on a passive signal, not refusing to RECORD a negative one. Asking for help is
 * the learner telling you she does not have it — the single most informative thing that happens
 * while reading, and v2 threw it away or, worse, treated it as a full failure.
 *
 * Costs `STRENGTH_STEP.missHelp`, and is deliberately NOT a lapse: she did the right thing.
 *
 * @module
 */

import type { Day } from './day.js';
import type { UnitKey } from './unitKey.js';

export type Help = {
  readonly kind: 'help';
  readonly unit: UnitKey;
  readonly day: Day;
};
