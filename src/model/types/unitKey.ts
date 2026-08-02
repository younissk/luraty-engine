/**
 * The address of one piece of knowledge: `direction:variety:word`.
 *
 * ⚠️ The word comes LAST on purpose. Parsing takes the first two segments and treats the entire
 * remainder as the word, so a word containing a colon cannot corrupt the key. Put the word in the
 * middle and some language, somewhere, eventually breaks the parser.
 *
 * @module
 */

import type { Brand } from './brand.js';

export type UnitKey = Brand<string, 'UnitKey'>;
