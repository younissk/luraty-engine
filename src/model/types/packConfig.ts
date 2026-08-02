/**
 * Everything a pack declares about its language, as data.
 *
 * @module
 */

import type { AffixConfig } from './affixConfig.js';
import type { CompoundConfig } from './compoundConfig.js';
import type { NormalizeStep } from './normalizeStep.js';
import type { TokenizeConfig } from './tokenizeConfig.js';

export type PackConfig = {
  readonly id: string;
  readonly tokenize: TokenizeConfig;
  /** Applied in order to produce the canonical form. */
  readonly normalize: readonly NormalizeStep[];
  readonly affixes?: AffixConfig;
  /** Compound splitting. Absent means the language does not build words this way. */
  readonly compounds?: CompoundConfig;
  /** Applied in order before comparing an answer. Often the same list as `normalize`. */
  readonly compare: readonly NormalizeStep[];
};
