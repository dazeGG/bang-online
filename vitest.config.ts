import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(({ mode }) => {
  // Only database URLs are loaded so PostgreSQL integration tests can find the local database.
  const env = loadEnv(mode, rootDir, ['DATABASE_URL', 'TEST_DATABASE_URL']);

  return {
    test: {
      environment: 'node',
      include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts'],
      env,
      restoreMocks: true,
      testTimeout: 10_000,
      hookTimeout: 20_000,
    },
  };
});
