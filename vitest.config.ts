import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['packages/*/test/**/*.test.ts', 'apps/server/test/**/*.test.ts'],
    restoreMocks: true,
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});
