import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // No `globals: true`, deliberately. Tests import { describe, it, expect } from 'vitest'
    // explicitly, which keeps tsconfig's `types: []` honest — this package declares zero ambient
    // types, so nothing (not @types/node, not a test runner's globals) can leak a runtime
    // assumption into a package whose entire job is not to have one.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
