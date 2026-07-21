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
    // Needed for @testing-library/react's automatic cleanup(): it only
    // registers when `afterEach` exists as a true global.
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: ['node_modules', '.next', '.claude'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['lib/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}', 'supabase/functions/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/*.d.ts',
        'components/ui/**',
        // Thin 1-function wrappers around the official Supabase SSR helpers —
        // testing them would just be testing that SDK, not our own logic.
        'lib/supabase/**',
        // The Edge Function's Deno request handler; its business logic is
        // already extracted into logic.ts (tested here) — the handler itself
        // needs a Deno test runner, not Vitest, so it's out of this project's
        // coverage goal for now.
        'supabase/functions/calculate-residential/index.ts',
      ],
    },
  },
});
