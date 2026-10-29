import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Integration tests share one test database, so files run sequentially.
    fileParallelism: false,
    setupFiles: ['tests/setup-env.ts'],
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
