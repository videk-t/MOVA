import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      // Mirrors the tsconfig path mapping: the server shares the app's pure
      // core rather than reimplementing scoring and normalisation.
      '@': fileURLToPath(new URL('../src', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
  },
});
