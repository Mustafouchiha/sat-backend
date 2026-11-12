import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'apps/api/**/*.test.ts'],
    exclude: ['**/node_modules/**', 'apps/miniapp/**'],
    environment: 'node',
    // 500 variantli shablon tekshiruvlari va SDK yuklanishi band kompyuterda 5/10 soniyadan oshadi
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
