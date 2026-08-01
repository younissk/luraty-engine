/** @module */

import { foldTable } from '../../utils/foldTable.js';
import { GERMAN_FOLD } from '../constants.js';

const GERMAN_FOLD_BY_CODE = foldTable(GERMAN_FOLD);

export const foldGerman = (code: number): string | undefined => GERMAN_FOLD_BY_CODE.get(code);
