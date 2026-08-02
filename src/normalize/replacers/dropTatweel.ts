/** @module */

import { DELETE, TATWEEL } from '../constants.js';

export const dropTatweel = (code: number): string | undefined =>
  code === TATWEEL ? DELETE : undefined;
