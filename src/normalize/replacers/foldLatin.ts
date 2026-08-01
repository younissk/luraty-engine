/** @module */

import { foldTable } from '../../utils/foldTable.js';
import { LATIN_FOLD } from '../constants.js';

const LATIN_FOLD_BY_CODE = foldTable(LATIN_FOLD);

export const foldLatin = (code: number): string | undefined => LATIN_FOLD_BY_CODE.get(code);
