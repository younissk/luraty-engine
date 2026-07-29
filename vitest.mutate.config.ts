import { defineConfig } from 'vitest/config';

import base from './vitest.config.js';

/**
 * The suite as the MUTATION lane runs it.
 *
 * Identical to `vitest.config.ts` except that the two `*.sweep.test.ts` files are dropped. Those
 * simulate whole years of a learner to show that a constant is not a knife-edge — seconds each,
 * against milliseconds for everything else — and the mutation lane runs the suite once per mutant.
 * Leaving them in multiplies their cost by the mutant count and times out the dry run.
 *
 * ⚠️ They pin no behaviour a mutant could break. Every rule they exercise is already pinned by an
 * example or a law elsewhere; what they add is a claim about a NUMBER, which mutation testing has
 * nothing to say about. If that ever stops being true, this exclusion is wrong.
 */
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', 'src/**/*.sweep.test.ts'],
  },
});
