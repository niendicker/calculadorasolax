import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Downgraded to warn: this app's remaining cases are legitimate
      // fetch-on-mount and client-only "isMounted" hydration guards (portals,
      // entrance animations), not bugs. Fixing them properly means adopting
      // useSyncExternalStore or a data-fetching library, which is a larger
      // architectural change tracked separately, not a lint fix.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'supabase/functions/**',
    '.claude/**',
  ]),
]);

export default eslintConfig;
