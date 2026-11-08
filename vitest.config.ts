import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'apps/api/**/*.test.ts'],
    exclude: ['**/node_modules/**', 'apps/miniapp/**'],
    environment: 'node',
  },
});
