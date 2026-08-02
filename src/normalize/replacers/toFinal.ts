/** @module */

import { ALEF_MAKSURA, HEH, TEH_MARBUTA, YEH } from '../constants.js';

export const toFinal = (code: number): string | undefined =>
  code === TEH_MARBUTA ? HEH : code === ALEF_MAKSURA ? YEH : undefined;
