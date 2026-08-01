/** @module */

import { transform } from '../utils/transform.js';
import { dropTatweel } from './replacers/dropTatweel.js';

export function stripTatweel(s: string): string {
  return transform(s, dropTatweel);
}
