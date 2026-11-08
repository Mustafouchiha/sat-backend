import { defineConfig } from 'tsup';

// @sat/generator va @sat/shared TypeScript manbasi bundle ichiga qo'shiladi,
// qolgan npm paketlari (prisma, express, ...) node_modules dan yuklanadi.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: false,
  noExternal: ['@sat/generator', '@sat/shared'],
});
