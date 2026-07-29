import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // No `globals: true`, deliberately. Tests import { describe, it, expect } from 'vitest'
    // explicitly, which keeps tsconfig's `types: []` honest — this package declares zero ambient
    // types, so nothing (not @types/node, not a test runner's globals) can leak a runtime
    // assumption into a package whose entire job is not to have one.
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // ⚠️ The two `*.sweep.test.ts` files simulate whole YEARS of a learner to check that a constant
    // is not a knife-edge. They are audits of a number, not specs of a behaviour, and they take
    // seconds rather than milliseconds — so they carry their own timeout and are excluded from the
    // mutation lane in `stryker.config.json`. Leaving them in it would multiply their cost by 1,136.
    testTimeout: 60_000,
  },
});
