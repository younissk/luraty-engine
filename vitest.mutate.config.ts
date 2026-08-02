import { defineConfig } from 'vitest/config';

import base from './vitest.config.js';

/**
 * The suite as the MUTATION lane runs it.
 *
 * Identical to `vitest.config.ts` except for two exclusions, both about COST rather than about
 * quality, and both reversible the moment the reasoning stops holding.
 *
 * **`*.sweep.test.ts`** simulate whole years of a learner to show that a constant is not a
 * knife-edge — seconds each, against milliseconds for everything else — and the mutation lane runs
 * the suite once per mutant. Leaving them in multiplies their cost by the mutant count and times
 * out the dry run.
 *
 * ⚠️ They pin no behaviour a mutant could break. Every rule they exercise is already pinned by an
 * example or a law elsewhere; what they add is a claim about a NUMBER, which mutation testing has
 * nothing to say about. If that ever stops being true, this exclusion is wrong.
 *
 * **`bench.test.ts`** exercises the benchmark harness, which lives in `src/testing` and is already
 * outside `stryker.config.json`'s `mutate` globs — so it can pin nothing the lane scores. It does
 * touch most of `core/` on its way through, which under `coverageAnalysis: perTest` means it would
 * be re-run for a large share of mutants to prove something no mutant can change.
 *
 * ⚠️ **THE GLOBS BELOW POINTED AT `src/` UNTIL 2026-08-02, AND THE LANE HAD BEEN DEAD SINCE THE
 * ADR-0009 REFACTOR MOVED EVERY SUITE TO `tests/`.** Stryker found zero tests and exited with
 * `ConfigError: No tests were executed` — loudly, which is the only reason this was recoverable, but
 * it means no mutation score has been measured since the move and the 85.15% in `CLAUDE.md` is now
 * of unknown age.
 *
 * ⚠️ It survived because `vitest.config.ts` was updated by the refactor and this file was not —
 * **the ordinary suite kept passing, so nothing pointed here.** A second config that mirrors a first
 * is a thing that silently stops mirroring it. Any edit to `vitest.config.ts`'s `include`/`exclude`
 * has to be mirrored here, and `--deep` is what says so.
 */
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ['tests/**/*.test.ts'],
    exclude: ['**/node_modules/**', 'tests/**/*.sweep.test.ts', 'tests/testing/bench.test.ts'],
  },
});
