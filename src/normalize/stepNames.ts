/**
 * The same names as a Set, which is what membership is actually tested against.
 *
 * ⚠️ A Set and not the object in `steps.ts`, for the reason `createPack` uses a Map for its lemma
 * table: `'constructor' in STEPS` is TRUE through the prototype chain, so an object lookup would
 * validate `constructor`, `toString`, `__proto__` and `valueOf` and then throw from `applyStep`. A
 * Set has no prototype chain to fall through, which removes the class rather than guarding each
 * case.
 *
 * @module
 */

import { NORMALIZE_STEPS } from './normalizeSteps.js';

export const STEP_NAMES: ReadonlySet<string> = new Set<string>(NORMALIZE_STEPS);
