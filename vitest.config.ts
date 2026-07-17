import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: ['node_modules', '.next', '.claude'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['lib/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}', 'supabase/functions/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.test.tsx', '**/*.d.ts', 'components/ui/**'],
    },
  },
});
